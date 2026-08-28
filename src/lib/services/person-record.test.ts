// @vitest-environment node
/**
 * The person record, assembled — against the real local database. LAN-183,
 * `REQ-person-record`, `REQ-status-ladder`, `REQ-not-recorded`.
 *
 * Fixtures are written directly by SQL rather than through a service, because
 * several of the states under test — a merged-away person, a recruit with no
 * membership at all, a superseded contact point — have no write path this
 * package exposes on its own (merging is a later mission package; a
 * superseded contact is what `person-write.test.ts` proves the write side
 * of). This suite only proves what `person-record.ts` reads back.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { PERSON_MERGED_AWAY_MESSAGE, readPersonRecord, searchPeople } from "./person-record";

const MARKER = "LAN183PersonRecord";

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}
let counter = 0;

let observer: Client;
let seasonId: string;
let actorPersonId: string;

const createdPersonIds: string[] = [];

/** One `people` row, written directly, with everything this suite might attach to it. */
async function insertPerson(fields: {
  givenName: string;
  familyName?: string | null;
  college?: string | null;
  matriculationYear?: number | null;
  expectedGraduationYear?: number | null;
  degreeField?: string | null;
  dateOfBirth?: string | null;
}): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people
       (given_name, family_name, college, matriculation_year, expected_graduation_year,
        degree_field, date_of_birth)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [
      fields.givenName,
      fields.familyName ?? null,
      fields.college ?? null,
      fields.matriculationYear ?? null,
      fields.expectedGraduationYear ?? null,
      fields.degreeField ?? null,
      fields.dateOfBirth ?? null,
    ],
  );
  const id = result.rows[0].id;
  createdPersonIds.push(id);
  return id;
}

async function insertAlias(
  personId: string,
  alias: string,
  options: { isDisplayName?: boolean } = {},
): Promise<void> {
  await observer.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, 'test fixture', $3)`,
    [personId, alias, options.isDisplayName ?? false],
  );
}

async function insertContact(
  personId: string,
  fields: {
    kind: "email" | "phone";
    scope?: "college" | "personal" | null;
    rawValue: string;
    isPreferred?: boolean;
    validUntil?: string | null;
  },
): Promise<void> {
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source, valid_until)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, $5, 'test fixture', $6::timestamptz)`,
    [
      personId,
      fields.kind,
      fields.scope ?? null,
      fields.rawValue,
      fields.isPreferred ?? true,
      fields.validUntil ?? null,
    ],
  );
}

async function insertEmergencyContact(
  personId: string,
  fields: {
    givenName: string;
    familyName?: string | null;
    relationship?: string | null;
    phone?: string | null;
    email?: string | null;
  },
): Promise<void> {
  await observer.query(
    `insert into public.person_emergency_contacts (person_id, given_name, family_name, relationship, phone, email)
     values ($1::uuid, $2, $3, $4, $5, $6)`,
    [
      personId,
      fields.givenName,
      fields.familyName ?? null,
      fields.relationship ?? null,
      fields.phone ?? null,
      fields.email ?? null,
    ],
  );
}

async function insertMembership(
  personId: string,
  status: "onboarding" | "active" | "inactive" | "departed" | "archived",
): Promise<void> {
  const activatedOn = status === "active" || status === "inactive" ? "current_date" : "null";
  const departedOn = status === "departed" ? "current_date" : "null";
  await observer.query(
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on, departed_on)
     values ($1::uuid, $2::uuid, $3::public.membership_status, 'new', ${activatedOn}, ${departedOn})`,
    [personId, seasonId, status],
  );
}

async function insertProspect(personId: string): Promise<void> {
  await observer.query(
    `insert into public.recruitment_prospects (person_id, season_id) values ($1::uuid, $2::uuid)`,
    [personId, seasonId],
  );
}

async function mergeAway(losingId: string, survivorId: string): Promise<void> {
  // `people_merge_is_fully_audited` requires all four merge columns together
  // — invariant I6, "a merge is an audited operation". `merged_by_person_id`
  // is the actor; a real merge write path (a later package) would carry it
  // from `resolveOperator()`, so this fixture reuses the seeded actor every
  // other suite in this package draws on.
  await observer.query(
    `update public.people
        set merged_into_person_id = $2::uuid, merged_at = now(),
            merged_by_person_id = $3::uuid, merge_reason = 'test fixture'
      where id = $1::uuid`,
    [losingId, survivorId, actorPersonId],
  );
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await observer.query<{ id: string }>(
    `select id from public.seasons order by starts_on desc nulls last limit 1`,
  );
  if (season.rows.length === 0) {
    throw new Error(
      "No seeded season in the local database. Run `npm run db:reset` and `npm run db:seed`.",
    );
  }
  seasonId = season.rows[0].id;
});

afterAll(async () => {
  // Children before parents. `person_aliases`, `contact_points` and
  // `person_emergency_contacts` are `on delete cascade` from `people` — LAN-182's
  // own migration comments say so — but `season_memberships` and
  // `recruitment_prospects` are `on delete restrict`, and audit rows are not
  // foreign-keyed at all but would otherwise outlive the person they describe.
  // Explicit, in dependency order, rather than assumed.
  await observer.query(
    `delete from public.audit_events where entity_table = 'people' and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.season_memberships where person_id = any($1::uuid[])`, [
    createdPersonIds,
  ]);
  await observer.query(
    `delete from public.recruitment_prospects where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("readPersonRecord — assembly", () => {
  it("assembles one status from the membership record, and reports every fact", async () => {
    const personId = await insertPerson({
      givenName: unique("Active"),
      familyName: "Fielding",
      college: "Merton",
      matriculationYear: 2023,
      expectedGraduationYear: 2027,
      degreeField: "Engineering",
      dateOfBirth: "2004-01-01",
    });
    await insertMembership(personId, "active");
    await insertContact(personId, { kind: "phone", rawValue: "+447700900123" });
    await insertContact(personId, {
      kind: "email",
      scope: "personal",
      rawValue: "bertram@example.com",
    });
    await insertEmergencyContact(personId, {
      givenName: "Jo",
      familyName: "Fielding",
      phone: "+447700900999",
    });

    const record = await readPersonRecord(personId);

    expect(record.status).toBe("active");
    expect(record.familyName).toBe("Fielding");
    expect(record.college).toBe("Merton");
    expect(record.dateOfBirth).toBe("2004-01-01");
    expect(record.emergencyContact).toEqual({
      givenName: "Jo",
      familyName: "Fielding",
      relationship: null,
      phone: "+447700900999",
      email: null,
    });
    expect(record.contacts).toHaveLength(2);
    expect(record.missingRequiredFields).toEqual([]);
  });

  it("a recruit reads Recruit without holding a membership", async () => {
    const personId = await insertPerson({ givenName: unique("Recruit"), familyName: "Doe" });
    await insertProspect(personId);

    const record = await readPersonRecord(personId);

    expect(record.status).toBe("recruit");
  });

  it("reports null status for a person on neither record", async () => {
    const personId = await insertPerson({ givenName: unique("NoTie"), familyName: "Smith" });

    const record = await readPersonRecord(personId);

    expect(record.status).toBeNull();
  });

  it("not recorded is explicit — no value is invented for an absent fact", async () => {
    const personId = await insertPerson({ givenName: unique("Bare") });

    const record = await readPersonRecord(personId);

    expect(record.familyName).toBeNull();
    expect(record.college).toBeNull();
    expect(record.dateOfBirth).toBeNull();
    expect(record.emergencyContact).toBeNull();
    expect(record.isUnder18).toBeNull();
  });

  it("flags last name as missing at every rung — a recruit with only a first name and mobile", async () => {
    const personId = await insertPerson({ givenName: unique("NoSurname") });
    await insertProspect(personId);
    await insertContact(personId, { kind: "phone", rawValue: "+447700900111" });

    const record = await readPersonRecord(personId);

    expect(record.missingRequiredFields).toEqual(["family_name"]);
  });

  it("returns no verification mark, contested state or confidence class of any kind", async () => {
    const personId = await insertPerson({ givenName: unique("Plain"), familyName: "Jones" });
    await insertContact(personId, {
      kind: "email",
      scope: "personal",
      rawValue: "jones@example.com",
    });

    const record = await readPersonRecord(personId);
    const serialised = JSON.stringify(record);

    expect(serialised.toLowerCase()).not.toContain("verified");
    expect(serialised.toLowerCase()).not.toContain("disputed");
    expect(serialised.toLowerCase()).not.toContain("confidence");
    // `source` is present and is the only provenance a value carries.
    expect(record.contacts[0].source).toBe("test fixture");
  });

  it("throws NotFound for an id that does not exist", async () => {
    await expect(readPersonRecord("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("refuses a merged-away person rather than assembling their record", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor"), familyName: "Keeper" });
    const losingId = await insertPerson({ givenName: unique("Merged"), familyName: "Gone" });
    await mergeAway(losingId, survivorId);

    await expect(readPersonRecord(losingId)).rejects.toMatchObject({
      kind: "not_found",
      message: PERSON_MERGED_AWAY_MESSAGE,
    });
  });
});

describe("searchPeople", () => {
  it("finds a person by an alias that is not their display name", async () => {
    const givenName = unique("AliasSearch");
    const personId = await insertPerson({ givenName, familyName: "Original" });
    const aliasTerm = unique("Nickname");
    await insertAlias(personId, aliasTerm, { isDisplayName: false });

    const results = await searchPeople(aliasTerm);

    expect(results.map((r) => r.personId)).toContain(personId);
    const found = results.find((r) => r.personId === personId)!;
    expect(found.displayAlias).toBeNull(); // the matched alias was not flagged as the display name
  });

  it("matches on first name and last name", async () => {
    const givenName = unique("FindByGiven");
    const personId = await insertPerson({ givenName, familyName: "Uniquefamilyname" });

    const byGiven = await searchPeople(givenName);
    expect(byGiven.map((r) => r.personId)).toContain(personId);

    const byFamily = await searchPeople("Uniquefamilyname");
    expect(byFamily.map((r) => r.personId)).toContain(personId);
  });

  it("never returns a merged-away record", async () => {
    const survivorId = await insertPerson({ givenName: unique("SearchSurvivor") });
    const givenName = unique("SearchMergedAway");
    const losingId = await insertPerson({ givenName, familyName: "WillBeMerged" });
    await mergeAway(losingId, survivorId);

    const results = await searchPeople(givenName);

    expect(results.map((r) => r.personId)).not.toContain(losingId);
  });

  it("reports contactability rather than a raw value", async () => {
    const givenName = unique("Contactable");
    const personId = await insertPerson({ givenName, familyName: "Reachable" });
    await insertContact(personId, { kind: "phone", rawValue: "+447700900222" });

    const results = await searchPeople(givenName);
    const found = results.find((r) => r.personId === personId)!;

    expect(found.hasMobile).toBe(true);
    expect(found.hasPersonalEmail).toBe(false);
    expect(JSON.stringify(found)).not.toContain("+447700900222");
  });

  it("refuses a blank query", async () => {
    await expect(searchPeople("   ")).rejects.toMatchObject({ kind: "constraint_violated" });
  });

  it("structurally never carries date of birth or the emergency contact — REQ-restricted-fields", async () => {
    const givenName = unique("NeverOnAList");
    const personId = await insertPerson({
      givenName,
      familyName: "Restricted",
      dateOfBirth: "2004-05-05",
    });
    await insertEmergencyContact(personId, { givenName: "Guardian", phone: "+447700900321" });

    const results = await searchPeople(givenName);
    const found = results.find((r) => r.personId === personId)!;
    const serialised = JSON.stringify(found);

    expect(found).not.toHaveProperty("dateOfBirth");
    expect(found).not.toHaveProperty("emergencyContact");
    expect(serialised).not.toContain("2004-05-05");
    expect(serialised).not.toContain("Guardian");
    expect(serialised).not.toContain("+447700900321");
  });
});

// Keeps `isServiceError` exercised the way every other suite in this package does.
describe("service error shape", () => {
  it("a NotFound is recognised by isServiceError", async () => {
    try {
      await readPersonRecord("00000000-0000-0000-0000-000000000000");
      throw new Error("expected a refusal");
    } catch (error) {
      expect(isServiceError(error)).toBe(true);
    }
  });
});
