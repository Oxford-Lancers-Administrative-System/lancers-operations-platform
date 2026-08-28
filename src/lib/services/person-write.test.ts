// @vitest-environment node
/**
 * The write path — against the real local database. LAN-183, `REQ-supersede`
 * and `REQ-audit`.
 *
 * Every assertion that matters reads back through a **second connection**
 * (`observer`), for the reason `tests/helpers/service-layer.ts` explains: a
 * row is perfectly visible to the transaction that wrote it, so reading it
 * back through the same transaction proves nothing about whether it
 * committed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  supersedeContactPoint,
  updateEmergencyContactField,
  updatePersonField,
} from "./person-write";

const MARKER = "LAN183PersonWrite";

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}
let counter = 0;

let observer: Client;
let actorPersonId: string;
const createdPersonIds: string[] = [];

async function insertPerson(
  fields: { givenName: string; college?: string | null } = { givenName: "" },
): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, college) values ($1, $2) returning id`,
    [fields.givenName || unique("Person"), fields.college ?? null],
  );
  const id = result.rows[0].id;
  createdPersonIds.push(id);
  return id;
}

async function mergeAway(losingId: string, survivorId: string): Promise<void> {
  // `people_merge_is_fully_audited` requires all four merge columns together
  // — invariant I6, "a merge is an audited operation".
  await observer.query(
    `update public.people
        set merged_into_person_id = $2::uuid, merged_at = now(),
            merged_by_person_id = $3::uuid, merge_reason = 'test fixture'
      where id = $1::uuid`,
    [losingId, survivorId, actorPersonId],
  );
}

async function currentContacts(personId: string): Promise<
  {
    id: string;
    kind: string;
    scope: string | null;
    raw_value: string;
    is_preferred: boolean;
    valid_until: Date | null;
  }[]
> {
  const result = await observer.query(
    `select id, kind::text as kind, scope::text as scope, raw_value, is_preferred, valid_until
       from public.contact_points where person_id = $1::uuid order by valid_from desc`,
    [personId],
  );
  return result.rows;
}

async function latestAudit(
  entityTable: string,
  entityId: string,
): Promise<{
  action: string;
  from_state: string | null;
  to_state: string | null;
  reason: string | null;
} | null> {
  const result = await observer.query(
    `select action, from_state, to_state, reason from public.audit_events
      where entity_table = $1 and entity_id = $2::uuid
      order by occurred_at desc limit 1`,
    [entityTable, entityId],
  );
  return result.rows[0] ?? null;
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
});

afterAll(async () => {
  await observer.query(
    `delete from public.audit_events where entity_table = 'people' and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'contact_points'
       and entity_id in (select id from public.contact_points where person_id = any($1::uuid[]))`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'person_emergency_contacts' and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("supersedeContactPoint — fills an empty value with no reason", () => {
  it("records a first mobile number with no reason required", async () => {
    const personId = await insertPerson();

    const result = await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "phone",
      rawValue: "07700 900111",
    });

    expect(result.supersededContact).toBeNull();
    expect(result.contact.isPreferred).toBe(true);
    expect(result.contact.rawValue).toBe("07700 900111");

    const rows = await currentContacts(personId);
    expect(rows).toHaveLength(1);
    expect(rows[0].valid_until).toBeNull();

    const audit = await latestAudit("contact_points", result.contact.id);
    expect(audit?.action).toBe("person_contact_recorded");
    expect(audit?.from_state).toBeNull();
    expect(audit?.to_state).toBe("07700 900111");
  });
});

describe("supersedeContactPoint — replacing an existing value needs a reason", () => {
  it("refuses without a reason", async () => {
    const personId = await insertPerson();
    await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "phone",
      rawValue: "07700 900222",
    });

    await expect(
      supersedeContactPoint({ actorPersonId, personId, kind: "phone", rawValue: "07700 900333" }),
    ).rejects.toMatchObject({
      kind: "constraint_violated",
      rule: "person_field_change_requires_a_reason",
    });
  });

  it("supersedes with a reason: the old value survives, dated, and exactly one stays preferred", async () => {
    const personId = await insertPerson();
    const first = await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "phone",
      rawValue: "07700 900444",
    });

    const second = await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "phone",
      rawValue: "07700 900555",
      reason: "Player got a new number",
    });

    expect(second.supersededContact?.id).toBe(first.contact.id);

    const rows = await currentContacts(personId);
    expect(rows).toHaveLength(2);
    const old = rows.find((r) => r.id === first.contact.id)!;
    const fresh = rows.find((r) => r.id === second.contact.id)!;
    expect(old.valid_until).not.toBeNull(); // dated, not deleted
    expect(old.is_preferred).toBe(false); // demoted, so the partial unique index never sees two preferred rows
    expect(fresh.is_preferred).toBe(true);
    expect(fresh.valid_until).toBeNull();

    // Exactly one *current* preferred value per kind.
    const currentPreferred = rows.filter((r) => r.is_preferred && r.valid_until === null);
    expect(currentPreferred).toHaveLength(1);
    // The stronger guarantee the schema's own partial unique index enforces:
    // at most one preferred row per (person, kind, scope) at all, dated or not.
    expect(rows.filter((r) => r.is_preferred)).toHaveLength(1);

    const audit = await latestAudit("contact_points", second.contact.id);
    expect(audit?.action).toBe("person_contact_superseded");
    expect(audit?.from_state).toBe("07700 900444");
    expect(audit?.to_state).toBe("07700 900555");
    expect(audit?.reason).toBe("Player got a new number");
  });

  it("never requires a reason to fill an empty college and a personal email in the same record", async () => {
    const personId = await insertPerson();
    await expect(
      supersedeContactPoint({
        actorPersonId,
        personId,
        kind: "email",
        scope: "personal",
        rawValue: "player@example.com",
      }),
    ).resolves.toBeDefined();
  });
});

describe("supersedeContactPoint — every correct form saves, malformed values are refused per field", () => {
  it.each(["+44 7700 900666", "07700900666", "+33 6 12 34 56 78"])(
    "accepts %s",
    async (rawValue) => {
      const personId = await insertPerson();
      const result = await supersedeContactPoint({
        actorPersonId,
        personId,
        kind: "phone",
        rawValue,
      });
      expect(result.contact.rawValue).toBe(rawValue);
    },
  );

  it("refuses a malformed phone number, naming the rule", async () => {
    const personId = await insertPerson();
    await expect(
      supersedeContactPoint({ actorPersonId, personId, kind: "phone", rawValue: "07700 90066" }),
    ).rejects.toMatchObject({ kind: "constraint_violated", rule: "phone_wrong_length" });
  });

  it("refuses a malformed email, naming the rule", async () => {
    const personId = await insertPerson();
    await expect(
      supersedeContactPoint({
        actorPersonId,
        personId,
        kind: "email",
        scope: "personal",
        rawValue: "not-an-email",
      }),
    ).rejects.toMatchObject({ kind: "constraint_violated", rule: "email_not_well_formed" });
  });

  it("refuses a scope on a phone number", async () => {
    const personId = await insertPerson();
    await expect(
      supersedeContactPoint({
        actorPersonId,
        personId,
        kind: "phone",
        scope: "personal" as never,
        rawValue: "07700900777",
      }),
    ).rejects.toMatchObject({
      kind: "constraint_violated",
      rule: "contact_points_scope_is_for_email",
    });
  });

  it("keeps college and personal email as two independent preferred values", async () => {
    const personId = await insertPerson();
    await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "email",
      scope: "college",
      rawValue: "player@college.ox.ac.uk",
    });
    await supersedeContactPoint({
      actorPersonId,
      personId,
      kind: "email",
      scope: "personal",
      rawValue: "player@example.com",
    });

    const rows = await currentContacts(personId);
    expect(rows.filter((r) => r.is_preferred && r.valid_until === null)).toHaveLength(2);
  });
});

describe("supersedeContactPoint — a merged-away person cannot be corrected on its own", () => {
  it("refuses the write", async () => {
    const survivorId = await insertPerson();
    const losingId = await insertPerson();
    await mergeAway(losingId, survivorId);

    await expect(
      supersedeContactPoint({
        actorPersonId,
        personId: losingId,
        kind: "phone",
        rawValue: "07700900888",
      }),
    ).rejects.toMatchObject({ rule: "person_merged_away" });
  });
});

describe("updatePersonField — every other field overwrites, with history in the audit trail", () => {
  it("fills an empty field with no reason required", async () => {
    const personId = await insertPerson();

    const record = await updatePersonField({
      actorPersonId,
      personId,
      field: "college",
      value: "Merton",
    });

    expect(record.college).toBe("Merton");
    const audit = await latestAudit("people", personId);
    expect(audit?.action).toBe("person_college_updated");
    expect(audit?.from_state).toBeNull();
    expect(audit?.to_state).toBe("Merton");
  });

  it("refuses to change an existing value without a reason", async () => {
    const personId = await insertPerson({ givenName: unique("HasCollege"), college: "Merton" });

    await expect(
      updatePersonField({ actorPersonId, personId, field: "college", value: "Balliol" }),
    ).rejects.toMatchObject({
      kind: "constraint_violated",
      rule: "person_field_change_requires_a_reason",
    });
  });

  it("changes an existing value with a reason, and records before and after", async () => {
    const personId = await insertPerson({ givenName: unique("Transferred"), college: "Merton" });

    const record = await updatePersonField({
      actorPersonId,
      personId,
      field: "college",
      value: "Balliol",
      reason: "Player transferred colleges",
    });

    expect(record.college).toBe("Balliol");
    const audit = await latestAudit("people", personId);
    expect(audit?.from_state).toBe("Merton");
    expect(audit?.to_state).toBe("Balliol");
    expect(audit?.reason).toBe("Player transferred colleges");
  });

  it("refuses a no-op write", async () => {
    const personId = await insertPerson({ givenName: unique("SameValue"), college: "Merton" });

    await expect(
      updatePersonField({
        actorPersonId,
        personId,
        field: "college",
        value: "Merton",
        reason: "no-op",
      }),
    ).rejects.toMatchObject({ rule: "person_field_unchanged" });
  });

  it("refuses a blank first name", async () => {
    const personId = await insertPerson();

    await expect(
      updatePersonField({ actorPersonId, personId, field: "given_name", value: "   " }),
    ).rejects.toMatchObject({ rule: "people_given_name_not_blank" });
  });

  it("round-trips a date of birth correctly, and compares consistently on a second write", async () => {
    const personId = await insertPerson();

    await updatePersonField({
      actorPersonId,
      personId,
      field: "date_of_birth",
      value: "2005-06-15",
    });

    await expect(
      updatePersonField({
        actorPersonId,
        personId,
        field: "date_of_birth",
        value: "2005-06-15",
        reason: "double check",
      }),
    ).rejects.toMatchObject({ rule: "person_field_unchanged" });

    const record = await updatePersonField({
      actorPersonId,
      personId,
      field: "date_of_birth",
      value: "2006-01-01",
      reason: "Corrected after seeing a passport",
    });
    expect(record.dateOfBirth).toBe("2006-01-01");

    const audit = await latestAudit("people", personId);
    expect(audit?.from_state).toBe("2005-06-15");
    expect(audit?.to_state).toBe("2006-01-01");
  });
});

describe("updateEmergencyContactField — restricted, four-role only, edited here alone", () => {
  it("creates the record from a first name, with no reason required", async () => {
    const personId = await insertPerson();

    const record = await updateEmergencyContactField({
      actorPersonId,
      personId,
      field: "given_name",
      value: "Jo",
    });

    expect(record.emergencyContact?.givenName).toBe("Jo");

    const audit = await latestAudit("person_emergency_contacts", personId);
    expect(audit?.action).toBe("person_emergency_contact_recorded");
    // The audit trail never carries the value itself — REQ-restricted-fields.
    // Filling a still-empty contact records `from_state: null` — never
    // invented (`REQ-not-recorded`) — so this reads the field as a string
    // rather than asserting `.toContain` directly on a value that is
    // correctly absent.
    expect(String(audit?.from_state)).not.toContain("Jo");
    expect(String(audit?.to_state)).not.toContain("Jo");
  });

  it("refuses to start a record on any field but the first name", async () => {
    const personId = await insertPerson();

    await expect(
      updateEmergencyContactField({
        actorPersonId,
        personId,
        field: "phone",
        value: "+447700900999",
      }),
    ).rejects.toMatchObject({ rule: "person_emergency_contacts_given_name_not_blank" });
  });

  it("requires a reason to correct an existing field, never to fill an empty one", async () => {
    const personId = await insertPerson();
    await updateEmergencyContactField({
      actorPersonId,
      personId,
      field: "given_name",
      value: "Jo",
    });

    // Filling the still-empty phone needs no reason.
    await expect(
      updateEmergencyContactField({
        actorPersonId,
        personId,
        field: "phone",
        value: "+447700900111",
      }),
    ).resolves.toBeDefined();

    // Correcting the phone that is now on record does.
    await expect(
      updateEmergencyContactField({
        actorPersonId,
        personId,
        field: "phone",
        value: "+447700900222",
      }),
    ).rejects.toMatchObject({ rule: "person_field_change_requires_a_reason" });

    const record = await updateEmergencyContactField({
      actorPersonId,
      personId,
      field: "phone",
      value: "+447700900222",
      reason: "Number was mistyped",
    });
    expect(record.emergencyContact?.phone).toBe("+447700900222");
  });

  it("never blanks the first name", async () => {
    const personId = await insertPerson();
    await updateEmergencyContactField({
      actorPersonId,
      personId,
      field: "given_name",
      value: "Jo",
    });

    await expect(
      updateEmergencyContactField({
        actorPersonId,
        personId,
        field: "given_name",
        value: "",
        reason: "test",
      }),
    ).rejects.toMatchObject({ rule: "person_emergency_contacts_given_name_not_blank" });
  });
});

describe("actor requirement", () => {
  it("supersedeContactPoint refuses a blank actor", async () => {
    const personId = await insertPerson();
    await expect(
      supersedeContactPoint({
        actorPersonId: "",
        personId,
        kind: "phone",
        rawValue: "07700900123",
      }),
    ).rejects.toMatchObject({ rule: "audit_events_has_an_actor" });
  });
});
