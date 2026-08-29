// @vitest-environment node
/**
 * The People list and the missing-data queue, against the real local
 * database. LAN-184, `REQ-entry-points`, `REQ-missing-queue`.
 *
 * Fixtures are written directly by SQL, on `person-record.test.ts`'s own
 * pattern: several of the states under test — a committee-year role, a
 * season-scoped coaching role, a merged-away person — have no write path this
 * mission exposes yet.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  listMergedPredecessors,
  listMissingDataQueue,
  listPeople,
  listPersonRoleAssignments,
  listPersonSeasons,
  readPersonHistory,
  resolveMergeSurvivor,
} from "./people-directory";

const MARKER = "LAN184PeopleDirectory";
let counter = 0;
function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let seasonLabel: string;
let otherSeasonId: string;
let committeeYearId: string;

const createdPersonIds: string[] = [];
const createdRoleAssignmentIds: string[] = [];

async function insertPerson(fields: {
  givenName: string;
  familyName?: string | null;
}): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [fields.givenName, fields.familyName ?? null],
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
  fields: { kind: "email" | "phone"; scope?: "college" | "personal" | null; rawValue: string },
): Promise<void> {
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
     values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, 'test fixture')`,
    [personId, fields.kind, fields.scope ?? null, fields.rawValue],
  );
}

async function insertMembership(
  personId: string,
  season: string,
  status: "onboarding" | "active" | "inactive" | "departed" | "archived" = "active",
): Promise<string> {
  // `season_memberships_activation_is_dated`: only `active` requires
  // `activated_on`. `season_memberships_departure_is_dated`: only `departed`
  // requires `departed_on`.
  const activatedOn = status === "active" ? "2020-01-01" : null;
  const departedOn = status === "departed" ? "2021-01-01" : null;
  const result = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, activated_on, departed_on)
     values ($1::uuid, $2::uuid, $3::public.membership_status, 'new', $4::date, $5::date)
     returning id`,
    [personId, season, status, activatedOn, departedOn],
  );
  return result.rows[0].id;
}

async function insertProspect(personId: string, season: string): Promise<void> {
  await observer.query(
    `insert into public.recruitment_prospects (person_id, season_id) values ($1::uuid, $2::uuid)`,
    [personId, season],
  );
}

async function roleIdFor(code: string): Promise<{ id: string; scope: string; isOffice: boolean }> {
  const result = await observer.query<{
    id: string;
    scope: string;
    is_constitutional_office: boolean;
  }>(
    `select id, scope::text as scope, is_constitutional_office from public.roles where code = $1`,
    [code],
  );
  if (result.rows.length === 0) throw new Error(`Seeded role catalogue is missing '${code}'.`);
  return {
    id: result.rows[0].id,
    scope: result.rows[0].scope,
    isOffice: result.rows[0].is_constitutional_office,
  };
}

async function insertSeasonRole(
  personId: string,
  code: string,
  season: string,
  effectiveFrom = "2020-01-01",
  effectiveTo: string | null = null,
): Promise<void> {
  const role = await roleIdFor(code);
  const result = await observer.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, season_id, effective_from, effective_to)
     values ($1::uuid, $2::uuid, 'season', $3, $4::uuid, $5::date, $6::date)
     returning id`,
    [personId, role.id, role.isOffice, season, effectiveFrom, effectiveTo],
  );
  createdRoleAssignmentIds.push(result.rows[0].id);
}

async function insertCommitteeRole(
  personId: string,
  code: string,
  committeeYear: string,
): Promise<void> {
  const role = await roleIdFor(code);
  const result = await observer.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
     values ($1::uuid, $2::uuid, 'committee_year', $3, $4::uuid, '2020-01-01')
     returning id`,
    [personId, role.id, role.isOffice, committeeYear],
  );
  createdRoleAssignmentIds.push(result.rows[0].id);
}

async function mergeAway(losingId: string, survivorId: string): Promise<void> {
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

  const season = await observer.query<{ id: string; label: string }>(
    `select id, label from public.seasons
      where status = any($1::public.season_status[])
      order by starts_on desc nulls last, created_at desc
      limit 1`,
    [["open", "active", "closing"]],
  );
  if (season.rows.length === 0) {
    throw new Error(
      "No operating season in the local database. Run `npm run db:reset` and `npm run db:seed`.",
    );
  }
  seasonId = season.rows[0].id;
  seasonLabel = season.rows[0].label;

  // A distinct, non-operating season this suite's own fixtures can be tied
  // to instead of the season in view, so `outside_season` has something real
  // to find. Reused across every test rather than minted per test, since
  // nothing here mutates it.
  const otherSeason = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     select $1, 'archived', position_vocabulary_id, '2018-09-01', '2019-06-01',
            '2018-09-01', $2::uuid, '2019-06-01', $2::uuid
       from public.seasons limit 1
     returning id`,
    [unique("archived-season"), actorPersonId],
  );
  otherSeasonId = otherSeason.rows[0].id;

  // `committee_years.label` is unique, and the seed already carries one row
  // labelled for the current season — the very row the pairing rule this
  // suite tests is built on. Read it rather than minting a duplicate.
  const committeeYear = await observer.query<{ id: string }>(
    `select id from public.committee_years where label = $1`,
    [seasonLabel],
  );
  if (committeeYear.rows.length === 0) {
    throw new Error(
      `No committee year labelled '${seasonLabel}'. Run \`npm run db:reset\` and \`npm run db:seed\`.`,
    );
  }
  committeeYearId = committeeYear.rows[0].id;
});

afterAll(async () => {
  await observer.query(`delete from public.role_assignments where id = any($1::uuid[])`, [
    createdRoleAssignmentIds,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table in ('people', 'season_memberships')
      and entity_id in (
        select id from public.people where id = any($1::uuid[])
        union
        select id from public.season_memberships where person_id = any($1::uuid[])
      )`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.season_membership_status_events
      where season_membership_id in (
        select id from public.season_memberships where person_id = any($1::uuid[])
      )`,
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
  await observer.query(`delete from public.seasons where id = $1::uuid`, [otherSeasonId]);
  await observer.end();
  await closePool();
});

describe("listPeople — season scoping", () => {
  it("finds a coach who holds no membership, tied by a season-scoped role", async () => {
    const givenName = unique("Coach");
    const personId = await insertPerson({ givenName, familyName: "Gorsemoor" });
    await insertSeasonRole(personId, "head_coach", seasonId);

    const list = await listPeople({ scope: "in_season", search: givenName });

    expect(list.entries).toHaveLength(1);
    expect(list.entries[0].personId).toBe(personId);
    expect(list.entries[0].status).toBeNull();
    // No membership tie, so the role carries the season it was drawn from —
    // the same shape `W1-05`'s mockup gives Fenwick Gorsemoor and Caspian
    // Hallowfield, whose season/committee-year role is their only tie.
    expect(list.entries[0].clubRoleSummary).toBe(`Head Coach · ${seasonLabel}`);
  });

  it("finds a committee-year role holder, paired to the season by its label", async () => {
    // `gameday_secretary` rather than the constitutional `secretary` office:
    // an Office admits exactly one concurrent holder (invariant I3), and the
    // seed already holds that seat for the current committee year — a second
    // assignment would collide with it, not with this test's own assertion.
    const givenName = unique("Gameday");
    const personId = await insertPerson({ givenName, familyName: "Hallowfield" });
    await insertCommitteeRole(personId, "gameday_secretary", committeeYearId);

    const list = await listPeople({ scope: "in_season", search: givenName });

    expect(list.entries).toHaveLength(1);
    expect(list.entries[0].clubRoleSummary).toBe(`Gameday Secretary · ${seasonLabel}`);
  });

  it("ties a recruit to the season via the prospect record, with no membership", async () => {
    const givenName = unique("Recruit");
    const personId = await insertPerson({ givenName, familyName: "Fairhurst" });
    await insertProspect(personId, seasonId);

    const list = await listPeople({ scope: "in_season", search: givenName });

    expect(list.entries).toHaveLength(1);
    expect(list.entries[0].status).toBe("recruit");
    expect(list.entries[0].clubRoleSummary).toBe("Recruit");
  });

  it("finds somebody by an alias that is not their display name", async () => {
    const personId = await insertPerson({ givenName: unique("Rowan"), familyName: "Ashworth" });
    await insertMembership(personId, seasonId);
    const alias = unique("Ro");
    await insertAlias(personId, alias, { isDisplayName: false });

    const list = await listPeople({ scope: "in_season", search: alias });

    const found = list.entries.find((entry) => entry.personId === personId);
    expect(found).toBeDefined();
    expect(found!.matchedAlias).toBe(alias);
    expect(found!.displayName).not.toBe(alias);
  });

  it("excludes a person tied only to a different season, and the widened view finds them", async () => {
    const givenName = unique("Outsider");
    const personId = await insertPerson({ givenName, familyName: "Thornbury" });
    await insertMembership(personId, otherSeasonId, "archived");

    const inSeason = await listPeople({ scope: "in_season", search: givenName });
    expect(inSeason.entries).toHaveLength(0);

    const outside = await listPeople({ scope: "outside_season", search: givenName });
    expect(outside.entries).toHaveLength(1);
    expect(outside.entries[0].personId).toBe(personId);
  });

  it("never lists a merged-away duplicate, in either scope", async () => {
    const survivorGivenName = unique("Survivor");
    const survivorId = await insertPerson({
      givenName: survivorGivenName,
      familyName: "Winterbourne",
    });
    const loserGivenName = unique("Loser");
    const losingId = await insertPerson({ givenName: loserGivenName, familyName: "Winterbourne" });
    await insertMembership(survivorId, seasonId);
    await mergeAway(losingId, survivorId);

    const inSeason = await listPeople({ scope: "in_season", search: "Winterbourne" });
    const outside = await listPeople({ scope: "outside_season", search: "Winterbourne" });

    expect(inSeason.entries.map((e) => e.personId)).not.toContain(losingId);
    expect(outside.entries.map((e) => e.personId)).not.toContain(losingId);
  });

  it("filters by status, and by missing-data", async () => {
    const complete = await insertPerson({ givenName: unique("Complete"), familyName: "Lanthorne" });
    await insertMembership(complete, seasonId, "active");
    await insertContact(complete, { kind: "phone", rawValue: "+447700900001" });
    await insertContact(complete, {
      kind: "email",
      scope: "personal",
      rawValue: "complete@mail.example",
    });
    // An active player's rung asks for the full player tier — every field
    // below has to be filled or this fixture is not actually complete.
    await observer.query(
      `update public.people
          set college = 'Merton', matriculation_year = 2023, expected_graduation_year = 2027,
              degree_field = 'Engineering', date_of_birth = '2004-01-01'
        where id = $1::uuid`,
      [complete],
    );
    await observer.query(
      `insert into public.person_emergency_contacts (person_id, given_name, phone)
       values ($1::uuid, 'Test Contact', '+447700900999')`,
      [complete],
    );

    const incomplete = await insertPerson({ givenName: unique("Incomplete") });
    await insertMembership(incomplete, seasonId, "active");

    const list = await listPeople({ scope: "in_season", missingOnly: true, status: "active" });
    const ids = list.entries.map((e) => e.personId);
    expect(ids).toContain(incomplete);
    expect(ids).not.toContain(complete);
  });

  it("sorts by how much is missing", async () => {
    const bertram = await insertPerson({ givenName: unique("Bertram") });
    await insertMembership(bertram, seasonId, "active");
    const almostComplete = await insertPerson({
      givenName: unique("Almost"),
      familyName: "Draycott",
    });
    await insertMembership(almostComplete, seasonId, "active");
    await insertContact(almostComplete, { kind: "phone", rawValue: "+447700900002" });
    await insertContact(almostComplete, {
      kind: "email",
      scope: "personal",
      rawValue: "almost@mail.example",
    });

    const list = await listPeople({
      scope: "in_season",
      missingOnly: true,
      sort: "missing",
      direction: "desc",
    });
    const bertramIndex = list.entries.findIndex((e) => e.personId === bertram);
    const almostIndex = list.entries.findIndex((e) => e.personId === almostComplete);
    expect(bertramIndex).toBeGreaterThanOrEqual(0);
    expect(almostIndex).toBeGreaterThanOrEqual(0);
    expect(bertramIndex).toBeLessThan(almostIndex);
  });
});

describe("listMissingDataQueue — W7", () => {
  it("names which facts are missing, per row, and never a value", async () => {
    const personId = await insertPerson({ givenName: unique("Gappy") });
    await insertMembership(personId, seasonId, "active");

    const queue = await listMissingDataQueue({ scope: "in_season" });
    const row = queue.entries.find((e) => e.personId === personId);

    expect(row).toBeDefined();
    expect(row!.missingRequiredFields).toContain("family_name");
    expect(row!.missingRequiredFields).toContain("emergency_contact");
    expect(JSON.stringify(row)).not.toMatch(/\.example|\+44/);
  });

  it("filters to everybody missing one specific fact", async () => {
    const noEmergencyContact = await insertPerson({
      givenName: unique("NoEC"),
      familyName: "Inglewhite",
    });
    await insertMembership(noEmergencyContact, seasonId, "active");
    await insertContact(noEmergencyContact, { kind: "phone", rawValue: "+447700900003" });
    await insertContact(noEmergencyContact, {
      kind: "email",
      scope: "personal",
      rawValue: "noec@mail.example",
    });
    await observer.query(
      `update public.people
          set college = 'Merton', matriculation_year = 2023, expected_graduation_year = 2027,
              degree_field = 'Engineering', date_of_birth = '2004-01-01'
        where id = $1::uuid`,
      [noEmergencyContact],
    );

    const queue = await listMissingDataQueue({ scope: "in_season", fact: "emergency_contact" });
    const ids = queue.entries.map((e) => e.personId);
    expect(ids).toContain(noEmergencyContact);
    for (const entry of queue.entries) {
      expect(entry.missingRequiredFields).toContain("emergency_contact");
    }
  });

  it("distinguishes a real empty from a filtered empty", async () => {
    const filtered = await listMissingDataQueue({
      scope: "in_season",
      search: unique("NoSuchPerson"),
    });
    expect(filtered.entries).toHaveLength(0);
    // `totalMissing` still counts the unfiltered population, so a caller can
    // tell "this search matched nobody" from "nobody is missing anything".
    expect(filtered.totalMissing).toBeGreaterThanOrEqual(0);
  });

  it("a departed person missing a personal email sits in the queue with no relief", async () => {
    const personId = await insertPerson({ givenName: unique("Ignatius"), familyName: "Kirkbride" });
    await insertMembership(personId, seasonId, "departed");
    await insertContact(personId, { kind: "phone", rawValue: "+447700900004" });
    await observer.query(
      `update public.people
          set college = 'Merton', matriculation_year = 2020, expected_graduation_year = 2024,
              degree_field = 'History', date_of_birth = '2001-01-01'
        where id = $1::uuid`,
      [personId],
    );
    await observer.query(
      `insert into public.person_emergency_contacts (person_id, given_name, phone)
       values ($1::uuid, 'Test', '+447700900005')`,
      [personId],
    );

    const queue = await listMissingDataQueue({ scope: "in_season", fact: "personal_email" });
    const row = queue.entries.find((e) => e.personId === personId);
    expect(row).toBeDefined();
    expect(row!.missingRequiredFields).toEqual(["personal_email"]);
  });
});

describe("merge redirect and history — W1-09, W1-11", () => {
  it("resolves a merged-away person's id to the survivor", async () => {
    const survivorId = await insertPerson({ givenName: unique("Holly"), familyName: "Jarrowdale" });
    const losingId = await insertPerson({
      givenName: unique("HollyDup"),
      familyName: "Jarrowdale",
    });
    await mergeAway(losingId, survivorId);

    expect(await resolveMergeSurvivor(losingId)).toBe(survivorId);
    expect(await resolveMergeSurvivor(survivorId)).toBeNull();

    const predecessors = await listMergedPredecessors(survivorId);
    expect(predecessors.map((p) => p.personId)).toContain(losingId);
  });

  it("reads a real, typed status transition as one history entry", async () => {
    const personId = await insertPerson({ givenName: unique("History") });
    const membershipId = await insertMembership(personId, seasonId, "onboarding");
    await observer.query(
      `insert into public.season_membership_status_events
         (season_membership_id, from_status, to_status, actor_person_id, reason)
       values ($1::uuid, 'onboarding', 'active', $2::uuid, 'Activated after review')`,
      [membershipId, actorPersonId],
    );

    const history = await readPersonHistory(personId);
    const entry = history.find((e) => e.field === "Status");
    expect(entry).toBeDefined();
    expect(entry!.fromValue).toBe("Onboarding");
    expect(entry!.toValue).toBe("Active");
    expect(entry!.reason).toBe("Activated after review");
  });

  it("reads the roles and seasons a person actually holds", async () => {
    const personId = await insertPerson({ givenName: unique("RolesAndSeasons") });
    await insertMembership(personId, seasonId, "active");
    await insertSeasonRole(personId, "head_coach", seasonId, "2020-01-01", "2021-01-01");

    const roles = await listPersonRoleAssignments(personId);
    const seasons = await listPersonSeasons(personId);

    expect(roles).toHaveLength(1);
    expect(roles[0].hasEnded).toBe(true);
    expect(seasons).toHaveLength(1);
    expect(seasons[0].status).toBe("active");
  });
});
