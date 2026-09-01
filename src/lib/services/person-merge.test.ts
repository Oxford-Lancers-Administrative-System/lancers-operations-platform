// @vitest-environment node
/**
 * Merge two records for the same human — against the real local database.
 * LAN-185, `REQ-merge`, invariant I6, `Q-5`.
 *
 * Every assertion that matters reads back through a second connection
 * (`observer`), for the reason `person-write.test.ts` already states.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { mergePersons, previewPersonMerge } from "./person-merge";

const MARKER = "LAN185PersonMerge";
let counter = 0;
function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let seasonLabel: string;

const createdPersonIds: string[] = [];
const createdAuthUserIds: string[] = [];

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

async function insertAlias(personId: string, alias: string): Promise<void> {
  await observer.query(
    `insert into public.person_aliases (person_id, alias, source) values ($1::uuid, $2, 'test fixture')`,
    [personId, alias],
  );
}

async function insertMembership(
  personId: string,
  season: string,
  status: string = "active",
): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, activated_on)
     values ($1::uuid, $2::uuid, $3::public.membership_status, 'new', '2020-01-01') returning id`,
    [personId, season, status],
  );
  return result.rows[0].id;
}

async function insertProspect(
  personId: string,
  season: string,
  status: string,
  firstContactOn: string,
): Promise<void> {
  // `recruitment_prospects_commitment_is_dated`: 'committed' and 'joined'
  // require `committed_on`.
  const committedOn = status === "committed" || status === "joined" ? firstContactOn : null;
  await observer.query(
    `insert into public.recruitment_prospects (person_id, season_id, status, first_contact_on, committed_on)
     values ($1::uuid, $2::uuid, $3::public.prospect_status, $4::date, $5::date)`,
    [personId, season, status, firstContactOn, committedOn],
  );
}

async function insertOperatorSeat(personId: string, isActive: boolean): Promise<void> {
  const authUser = await observer.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [`${unique("seat")}@example.invalid`],
  );
  createdAuthUserIds.push(authUser.rows[0].id);
  await observer.query(
    `insert into public.operator_accounts (auth_user_id, person_id, is_active, disabled_at)
     values ($1::uuid, $2::uuid, $3, $4::timestamptz)`,
    [authUser.rows[0].id, personId, isActive, isActive ? null : new Date().toISOString()],
  );
}

async function insertRoleAssignment(personId: string, season: string): Promise<string> {
  const role = await observer.query<{ id: string; is_office: boolean }>(
    `select id, is_constitutional_office as is_office from public.roles where code = 'head_coach'`,
  );
  if (role.rows.length === 0) {
    throw new Error("Seeded role catalogue is missing 'head_coach'.");
  }
  const result = await observer.query<{ id: string }>(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, season_id, effective_from)
     values ($1::uuid, $2::uuid, 'season', $3, $4::uuid, '2020-01-01')
     returning id`,
    [personId, role.rows[0].id, role.rows[0].is_office, season],
  );
  return result.rows[0].id;
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
});

afterAll(async () => {
  await observer.query(
    `delete from public.audit_events
      where (entity_table = 'people' and entity_id = any($1::uuid[]))
         or (entity_table in ('contact_points', 'person_aliases')
             and context ->> 'person_id' = any($1::text[]))
         or (entity_table = 'role_assignments'
             and entity_id in (select id from public.role_assignments where person_id = any($1::uuid[])))`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.role_assignments where person_id = any($1::uuid[])`, [
    createdPersonIds,
  ]);
  await observer.query(`delete from public.season_memberships where person_id = any($1::uuid[])`, [
    createdPersonIds,
  ]);
  await observer.query(
    `delete from public.recruitment_prospects where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.operator_accounts where person_id = any($1::uuid[])`, [
    createdPersonIds,
  ]);
  await observer.query(`delete from auth.users where id = any($1::uuid[])`, [createdAuthUserIds]);
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  await observer.end();
  await closePool();
});

describe("mergePersons — the two refusals Q-5 names", () => {
  it("refuses without a reason", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });

    await expect(
      mergePersons({
        actorPersonId,
        survivorPersonId: survivorId,
        loserPersonId: loserId,
        reason: "  ",
        fieldChoices: {},
      }),
    ).rejects.toMatchObject({ rule: "person_merge_requires_a_reason" });
  });

  it("refuses when the losing record holds an active operator seat, naming what to do", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await insertOperatorSeat(loserId, true);

    await expect(
      mergePersons({
        actorPersonId,
        survivorPersonId: survivorId,
        loserPersonId: loserId,
        reason: "Same person",
        fieldChoices: {},
      }),
    ).rejects.toMatchObject({ rule: "person_merge_active_operator_seat" });

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.refusal?.rule).toBe("person_merge_active_operator_seat");
    // As actionable as Q-16's season-overlap refusal is: names the action
    // (end the seat) and the destination (Mission 1's administration
    // surface) — confirmed unchanged by this correction round.
    expect(preview.refusal?.message).toContain("End the seat");
    expect(preview.refusal?.message).toContain("Mission 1's administration surface");
  });

  it("does not refuse on a deactivated operator seat", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await insertOperatorSeat(loserId, false);

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.refusal).toBeNull();
  });

  it("refuses when both records hold a membership in the same season", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await insertMembership(survivorId, seasonId);
    const loserMembershipId = await insertMembership(loserId, seasonId);

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.refusal?.rule).toBe("person_merge_membership_overlap");
    expect(preview.refusal?.message).toContain(seasonLabel);
    // Q-16, LAN-185 correction round 2: names the season, links to the exact
    // membership, and tells the operator to archive it — not a bare "resolve
    // that on the roster".
    expect(preview.refusal?.message).toContain("Archive");
    expect(preview.refusal?.blockingMemberships).toEqual([
      { seasonLabel, membershipId: loserMembershipId },
    ]);

    await expect(
      mergePersons({
        actorPersonId,
        survivorPersonId: survivorId,
        loserPersonId: loserId,
        reason: "Same person",
        fieldChoices: {},
      }),
    ).rejects.toMatchObject({ rule: "person_merge_membership_overlap" });
  });

  // Q-16, LAN-185 correction round 2 (Brian): "A merge may proceed once the
  // losing record's membership for the shared season is archived... the
  // archived membership stays on the merged-away record — never deleted,
  // never re-pointed onto the survivor."
  it("proceeds once the losing record's overlapping membership is archived, and it stays on the loser", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await insertMembership(survivorId, seasonId);
    const archivedMembershipId = await insertMembership(loserId, seasonId, "archived");

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.refusal).toBeNull();
    expect(preview.staysWithLoser).toEqual([{ seasonLabel }]);
    // Excluded from "will move" — it will not.
    const membershipLine = preview.willMove.find((l) => l.label === "season membership");
    expect(membershipLine).toBeUndefined();

    await expect(
      mergePersons({
        actorPersonId,
        survivorPersonId: survivorId,
        loserPersonId: loserId,
        reason: "Same person, one archived membership",
        fieldChoices: {},
      }),
    ).resolves.toMatchObject({ survivorPersonId: survivorId, loserPersonId: loserId });

    const archivedRow = await observer.query<{ person_id: string; status: string }>(
      `select person_id, status from public.season_memberships where id = $1::uuid`,
      [archivedMembershipId],
    );
    expect(archivedRow.rows[0].person_id).toBe(loserId);
    expect(archivedRow.rows[0].status).toBe("archived");

    const survivorMemberships = await observer.query<{ id: string }>(
      `select id from public.season_memberships where person_id = $1::uuid`,
      [survivorId],
    );
    expect(survivorMemberships.rows.map((r) => r.id)).not.toContain(archivedMembershipId);
  });

  it("refuses to merge a record already merged away", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    const thirdId = await insertPerson({ givenName: unique("Third") });
    await observer.query(
      `update public.people set merged_into_person_id = $2::uuid, merged_at = now(),
              merged_by_person_id = $3::uuid, merge_reason = 'already merged'
        where id = $1::uuid`,
      [loserId, thirdId, actorPersonId],
    );

    await expect(
      mergePersons({
        actorPersonId,
        survivorPersonId: survivorId,
        loserPersonId: loserId,
        reason: "Same person",
        fieldChoices: {},
      }),
    ).rejects.toMatchObject({ rule: "person_merge_already_away" });
  });
});

describe("mergePersons — the successful merge", () => {
  it("writes chosen fields as ordinary corrections, re-points every reference kept, and audits one event", async () => {
    const survivorId = await insertPerson({
      givenName: unique("Survivor"),
      familyName: "Winterton",
    });
    const loserId = await insertPerson({ givenName: unique("LoserName"), familyName: "Winterton" });
    await insertContact(survivorId, { kind: "phone", rawValue: "+44 7700 900111" });
    await insertContact(loserId, { kind: "phone", rawValue: "+44 7700 900222" });
    await insertAlias(loserId, unique("Alias"));
    const roleAssignmentId = await insertRoleAssignment(loserId, seasonId);

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.refusal).toBeNull();
    const mobileComparison = preview.contacts.find((c) => c.kind === "mobile");
    expect(mobileComparison?.differs).toBe(true);

    const result = await mergePersons({
      actorPersonId,
      survivorPersonId: survivorId,
      loserPersonId: loserId,
      reason: "Same person, entered twice",
      fieldChoices: { given_name: "loser", mobile: "loser" },
    });
    expect(result.survivorPersonId).toBe(survivorId);

    // The chosen given name landed on the survivor, as an ordinary correction.
    const survivorRow = await observer.query<{ given_name: string }>(
      `select given_name from public.people where id = $1::uuid`,
      [survivorId],
    );
    expect(survivorRow.rows[0].given_name).toContain("LoserName");

    // The loser is kept, dated, and points at the survivor — invariant I6.
    const loserRow = await observer.query<{
      merged_into_person_id: string | null;
      merged_at: Date | null;
      merge_reason: string | null;
    }>(
      `select merged_into_person_id, merged_at, merge_reason from public.people where id = $1::uuid`,
      [loserId],
    );
    expect(loserRow.rows[0].merged_into_person_id).toBe(survivorId);
    expect(loserRow.rows[0].merged_at).not.toBeNull();
    expect(loserRow.rows[0].merge_reason).toBe("Same person, entered twice");

    // Both mobile numbers are kept, one preferred — REQ-merge.
    const contacts = await observer.query<{
      raw_value: string;
      is_preferred: boolean;
      person_id: string;
    }>(
      `select raw_value, is_preferred, person_id from public.contact_points
        where raw_value in ('+44 7700 900111', '+44 7700 900222')`,
    );
    expect(contacts.rows.every((c) => c.person_id === survivorId)).toBe(true);
    const preferred = contacts.rows.find((c) => c.raw_value === "+44 7700 900222");
    const demoted = contacts.rows.find((c) => c.raw_value === "+44 7700 900111");
    expect(preferred?.is_preferred).toBe(true);
    expect(demoted?.is_preferred).toBe(false);

    // The alias moved, and does not become the survivor's display name.
    const alias = await observer.query<{ person_id: string; is_display_name: boolean }>(
      `select person_id, is_display_name from public.person_aliases where person_id = any($1::uuid[])`,
      [[survivorId, loserId]],
    );
    expect(alias.rows).toHaveLength(1);
    expect(alias.rows[0].person_id).toBe(survivorId);
    expect(alias.rows[0].is_display_name).toBe(false);

    // A representative blind-repointed reference actually moved.
    const role = await observer.query<{ person_id: string }>(
      `select person_id from public.role_assignments where id = $1::uuid`,
      [roleAssignmentId],
    );
    expect(role.rows[0].person_id).toBe(survivorId);

    // The merge reads as one event on the survivor.
    const audit = await observer.query<{
      action: string;
      from_state: string;
      to_state: string;
      reason: string;
    }>(
      `select action, from_state, to_state, reason from public.audit_events
        where entity_table = 'people' and entity_id = $1::uuid and action = 'person_merged'`,
      [survivorId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].from_state).toBe(loserId);
    expect(audit.rows[0].to_state).toBe(survivorId);
    expect(audit.rows[0].reason).toBe("Same person, entered twice");
  });

  it("combines a duplicate prospect pair onto the survivor: earliest contact, furthest-along status", async () => {
    const survivorId = await insertPerson({ givenName: unique("Survivor") });
    const loserId = await insertPerson({ givenName: unique("Loser") });
    await insertProspect(survivorId, seasonId, "engaged", "2024-10-09");
    await insertProspect(loserId, seasonId, "committed", "2024-10-02");

    const preview = await previewPersonMerge(survivorId, loserId);
    expect(preview.prospectCombinations).toHaveLength(1);
    expect(preview.prospectCombinations[0].combinedStatus).toBe("committed");
    expect(preview.prospectCombinations[0].combinedFirstContact).toBe("2024-10-02");

    await mergePersons({
      actorPersonId,
      survivorPersonId: survivorId,
      loserPersonId: loserId,
      reason: "Duplicate prospect",
      fieldChoices: {},
    });

    const prospects = await observer.query<{
      person_id: string;
      status: string;
      first_contact_on: string;
    }>(
      `select person_id, status::text as status, to_char(first_contact_on, 'YYYY-MM-DD') as first_contact_on
         from public.recruitment_prospects where season_id = $1::uuid and person_id = any($2::uuid[])`,
      [seasonId, [survivorId, loserId]],
    );
    expect(prospects.rows).toHaveLength(1);
    expect(prospects.rows[0].person_id).toBe(survivorId);
    expect(prospects.rows[0].status).toBe("committed");
    expect(prospects.rows[0].first_contact_on).toBe("2024-10-02");
  });

  it("keeps a value from the losing record when the operator chooses it, unaltered when they do not", async () => {
    const survivorId = await insertPerson({
      givenName: unique("Survivor"),
      familyName: "Alderfield",
    });
    const loserId = await insertPerson({ givenName: unique("Loser"), familyName: "Alderfield" });
    await observer.query(`update public.people set college = 'Hallamshire' where id = $1::uuid`, [
      loserId,
    ]);

    await mergePersons({
      actorPersonId,
      survivorPersonId: survivorId,
      loserPersonId: loserId,
      reason: "Older record has the college",
      fieldChoices: { college: "loser" },
    });

    const row = await observer.query<{ college: string | null; family_name: string | null }>(
      `select college, family_name from public.people where id = $1::uuid`,
      [survivorId],
    );
    expect(row.rows[0].college).toBe("Hallamshire");
    // family_name was never chosen from the loser, and both sides agreed
    // anyway — the survivor's own value is untouched.
    expect(row.rows[0].family_name).toBe("Alderfield");
  });
});
