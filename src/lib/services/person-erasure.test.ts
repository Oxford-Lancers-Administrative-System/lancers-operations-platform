// @vitest-environment node
/**
 * Erasure means anonymisation — LAN-361, against the **real** local database,
 * because every claim here is a claim about what survives a statement.
 *
 * The central test is deliberately not a list of tables somebody remembered.
 * It seeds one person with a name, a phone, an email, a date of birth and free
 * text in every place free text can go, erases them, and then reads the
 * catalogue and scans **every text and JSON column of every table in `public`
 * and `staging`** for any of those values. A table added later that keeps a
 * name fails this test rather than quietly keeping it.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { openObserver } from "../../../tests/helpers/service-layer";
import { destinationKey } from "./messaging-safety";
import { resolveOpenSeason } from "./roster";
import {
  confirmErasure,
  ERASED_DISPLAY_NAME,
  exportPersonRecord,
  readErasureState,
} from "./person-erasure";
import { seededGrantsFor } from "@/lib/auth/capabilities";

const MARKER = "LAN361Erasure";
/** The values the scan hunts for. Every one is unmistakable and none is plausible as a real person's. */
const SUBJECT = {
  givenName: `${MARKER}Given`,
  familyName: `${MARKER}Family`,
  alias: `${MARKER}KnownAs`,
  email: `${MARKER.toLowerCase()}@invalid.example`,
  phone: "+447700900361",
  dateOfBirth: "1999-03-17",
  college: `${MARKER}College`,
  degree: `${MARKER}Degree`,
  studentNumber: `${MARKER}Student`,
  bafa: `${MARKER}Bafa`,
  freeText: `${MARKER}FreeText`,
};

let observer: Client;
let seasonId: string;
let presidentId: string;
let generalManagerId: string;
let subjectId: string;

const capability = vi.mocked(requireCapability);

function operator(personId: string, roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "66666666-6666-4666-8666-666666666666",
    personId,
    displayName: "Erasure Suite Operator",
    roleCodes,
    grants: seededGrantsFor(roleCodes),
    isActive: true,
  };
}

function actingAs(personId: string, roleCodes: string[]): void {
  capability.mockResolvedValue(operator(personId, roleCodes));
}

async function newPerson(tag: string): Promise<string> {
  const row = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [MARKER, tag],
  );
  return row.rows[0].id;
}

/** One person, with something of theirs in every place this system puts something. */
async function seedSubject(): Promise<string> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people
       (given_name, family_name, middle_name, college, degree_field, date_of_birth,
        student_number, bafa_registration_number, matriculation_year, expected_graduation_year)
     values ($1, $2, $3, $4, $5, $6::date, $7, $8, 2024, 2027)
     returning id`,
    [
      SUBJECT.givenName,
      SUBJECT.familyName,
      SUBJECT.freeText,
      SUBJECT.college,
      SUBJECT.degree,
      SUBJECT.dateOfBirth,
      SUBJECT.studentNumber,
      SUBJECT.bafa,
    ],
  );
  const id = person.rows[0].id;

  await observer.query(
    `insert into public.person_aliases (person_id, alias, source, is_display_name)
     values ($1::uuid, $2, 'operator', true)`,
    [id, SUBJECT.alias],
  );
  await observer.query(
    `insert into public.contact_points (person_id, kind, scope, raw_value, normalised_value, source)
     values ($1::uuid, 'email', 'personal', $2, $2, $3),
            ($1::uuid, 'phone', null, $4, $4, $3)`,
    [id, SUBJECT.email, SUBJECT.freeText, SUBJECT.phone],
  );
  await observer.query(
    `insert into public.person_emergency_contacts
       (person_id, given_name, family_name, relationship, phone, email)
     values ($1::uuid, $2, $3, $4, $5, $6)`,
    [id, SUBJECT.givenName, SUBJECT.familyName, SUBJECT.freeText, SUBJECT.phone, SUBJECT.email],
  );

  // A departed membership: history the club keeps, with free text on it.
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, departed_on, departure_reason, inactivity_label)
     values ($1::uuid, $2::uuid, 'departed', 'new', current_date, $3, $3) returning id`,
    [id, seasonId, SUBJECT.freeText],
  );
  await observer.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_label, reason)
     values ($1::uuid, 'onboarding', 'departed', $2, $2)`,
    [membership.rows[0].id, SUBJECT.freeText],
  );

  // A live link and a queued message.
  await observer.query(
    `insert into public.person_access_tokens
       (person_id, season_id, purpose, token_hash)
     values ($1::uuid, $2::uuid, 'onboarding_details', repeat('a', 64))`,
    [id, seasonId],
  );
  await observer.query(
    `insert into public.notification_jobs
       (person_id, job_type, channel, status, idempotency_key, template_variables, scheduled_for)
     values ($1::uuid, 'other', 'whatsapp', 'pending', $2, $3::jsonb, now())`,
    [
      id,
      `${MARKER}-job-${id}`,
      JSON.stringify({ first_name: SUBJECT.givenName, phone: SUBJECT.phone }),
    ],
  );

  // LAN-394. The messaging safety accounting, on an attempt that really was
  // admitted: the two identifying fields, and a hold latched against the
  // fingerprint of this person's own number. Both must be gone afterwards —
  // the fingerprint is not anonymisation, it is a guessable derivative of a
  // phone number, and a hold keyed on it would outlive the person it was about.
  await observer.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at,
        safety_admitted_at, safety_person_id, safety_destination_key)
     select id, 1, 'whatsapp', 'test', now(), now(), $1::uuid, $2
       from public.notification_jobs where idempotency_key = $3`,
    [id, destinationKey("whatsapp", SUBJECT.phone), `${MARKER}-job-${id}`],
  );
  await observer.query(
    `insert into public.messaging_safety_scopes
       (scope_kind, scope_key, latched_at, latch_reason_code)
     values ('destination', $1, now(), 'destination_hold')
     on conflict (scope_kind, scope_key) do nothing`,
    [destinationKey("whatsapp", SUBJECT.phone)],
  );

  // A dispute, which is the club's word against theirs, both free text.
  await observer.query(
    `insert into public.person_fact_disputes
       (person_id, field, club_value, player_value, raised_by_person_id)
     values ($1::uuid, 'college', $2, $3, $1::uuid)`,
    [id, SUBJECT.college, SUBJECT.freeText],
  );

  // A1: their own free text on somebody ELSE's record, as the recorder, the
  // owner, and the appointer — not the row's subject at all. Each carries
  // their name in the words, not merely their id in the FK, so the exhaustive
  // scan below proves whether the actor path is scrubbed, not only the
  // subject path.
  const bystanderId = await newPerson("Bystander");
  await observer.query(
    `insert into public.follow_up_actions (season_id, category, description, owner_person_id)
     values ($1::uuid, 'other', $2, $3::uuid)`,
    [seasonId, SUBJECT.freeText, id],
  );
  await observer.query(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, season_id,
        effective_from, appointed_by_person_id, note)
     values ($1::uuid, (select id from public.roles where code = 'special_teams_coach'),
             'season', false, $2::uuid, current_date, $3::uuid, $4)`,
    [bystanderId, seasonId, id, SUBJECT.freeText],
  );
  await observer.query(
    `insert into public.rsvp_responses
       (invitation_id, response, reason, raw_capture, source, responded_at, recorded_by_person_id)
     values ((select id from public.invitations order by id limit 1),
             'no', $1, $1, 'operator', now(), $2::uuid)`,
    [SUBJECT.freeText, id],
  );

  return id;
}

async function cleanUp(): Promise<void> {
  const ids = await observer.query<{ id: string }>(
    `select id from public.people
      where given_name in ($1, $2, $3) or family_name in ($1, $2, $4)`,
    [MARKER, SUBJECT.givenName, ERASED_DISPLAY_NAME, SUBJECT.familyName],
  );
  // Ahead of the early return: an operator login this suite minted outlives
  // its person row, and GoTrue's own directory read fails on a row it left
  // behind — so this runs whether or not there is anybody left to delete.
  await observer.query(
    `delete from public.operator_accounts where auth_user_id in (
       select id from auth.users where email like $1)`,
    [`${MARKER.toLowerCase()}-%@invalid.example`],
  );
  await observer.query(`delete from auth.users where email like $1`, [
    `${MARKER.toLowerCase()}-%@invalid.example`,
  ]);

  const people = ids.rows.map((row) => row.id);
  if (people.length === 0) return;

  await observer.query(
    `delete from public.person_erasure_signoffs where person_id = any($1::uuid[]) or signed_by_person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.audit_events where entity_id = any($1::uuid[]) or actor_person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.person_fact_disputes where person_id = any($1::uuid[]) or raised_by_person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.follow_up_actions
      where owner_person_id = any($1::uuid[]) or subject_person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.rsvp_responses where recorded_by_person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in
       (select id from public.notification_jobs where person_id = any($1::uuid[]))`,
    [people],
  );
  await observer.query(`delete from public.notification_jobs where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(
    "delete from public.messaging_safety_scopes where scope_kind in ('person', 'destination')",
  );
  await observer.query(
    `delete from public.person_access_tokens where person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(
    `delete from public.person_emergency_contacts where person_id = any($1::uuid[])`,
    [people],
  );
  await observer.query(`delete from public.contact_points where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(`delete from public.person_aliases where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id in (
       select id from public.season_memberships where person_id = any($1::uuid[]))`,
    [people],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id in (
       select id from public.season_memberships where person_id = any($1::uuid[]))`,
    [people],
  );
  await observer.query(`delete from public.season_memberships where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(`delete from public.role_assignments where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(`delete from public.operator_accounts where person_id = any($1::uuid[])`, [
    people,
  ]);
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [people]);
}

beforeAll(async () => {
  observer = await openObserver();
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  seasonId = season.id;
});

beforeEach(async () => {
  await cleanUp();
  presidentId = await newPerson("President");
  generalManagerId = await newPerson("GeneralManager");
  subjectId = await seedSubject();
  actingAs(presidentId, ["president"]);
});

afterEach(async () => {
  await cleanUp();
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

/** Every text and JSON column of every table, scanned for one string. */
async function rowsMentioning(needle: string): Promise<string[]> {
  const columns = await observer.query<{ schema: string; table: string; column: string }>(
    `select c.table_schema as schema, c.table_name as table, c.column_name as column
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema in ('public', 'staging')
        and t.table_type = 'BASE TABLE'
        and c.data_type in ('text', 'character varying', 'jsonb', 'json')
      order by 1, 2, 3`,
  );

  const hits: string[] = [];
  for (const column of columns.rows) {
    const found = await observer.query<{ count: string }>(
      `select count(*)::text as count
         from "${column.schema}"."${column.table}"
        where "${column.column}"::text like $1`,
      [`%${needle}%`],
    );
    if (Number(found.rows[0].count) > 0) {
      hits.push(`${column.schema}.${column.table}.${column.column}`);
    }
  }
  return hits;
}

/** The date-of-birth scan is its own thing: it is a `date`, not text. */
async function dateColumnsMentioning(value: string): Promise<string[]> {
  const columns = await observer.query<{ schema: string; table: string; column: string }>(
    `select c.table_schema as schema, c.table_name as table, c.column_name as column
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema in ('public', 'staging')
        and t.table_type = 'BASE TABLE'
        and c.data_type = 'date'`,
  );
  const hits: string[] = [];
  for (const column of columns.rows) {
    const found = await observer.query<{ count: string }>(
      `select count(*)::text as count from "${column.schema}"."${column.table}"
        where "${column.column}" = $1::date`,
      [value],
    );
    if (Number(found.rows[0].count) > 0) {
      hits.push(`${column.schema}.${column.table}.${column.column}`);
    }
  }
  return hits;
}

async function bothConfirm(): Promise<void> {
  actingAs(presidentId, ["president"]);
  await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });
  actingAs(generalManagerId, ["general_manager"]);
  await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });
}

describe("the scan — nothing that named them survives", () => {
  it("finds the seeded values before the erasure, and none of them after", async () => {
    // The positive control. Without it, an empty result proves only that the
    // scan cannot find anything.
    for (const value of [
      SUBJECT.givenName,
      SUBJECT.familyName,
      SUBJECT.alias,
      SUBJECT.email,
      SUBJECT.phone,
      SUBJECT.college,
      SUBJECT.degree,
      SUBJECT.studentNumber,
      SUBJECT.bafa,
      SUBJECT.freeText,
    ]) {
      expect(await rowsMentioning(value), `before: ${value}`).not.toEqual([]);
    }
    expect(await dateColumnsMentioning(SUBJECT.dateOfBirth)).not.toEqual([]);

    await bothConfirm();

    for (const value of [
      SUBJECT.givenName,
      SUBJECT.familyName,
      SUBJECT.alias,
      SUBJECT.email,
      SUBJECT.phone,
      SUBJECT.college,
      SUBJECT.degree,
      SUBJECT.studentNumber,
      SUBJECT.bafa,
      SUBJECT.freeText,
    ]) {
      expect(await rowsMentioning(value), `after: ${value}`).toEqual([]);
    }
    expect(await dateColumnsMentioning(SUBJECT.dateOfBirth)).toEqual([]);
  }, 120_000);
});

describe("what the tombstone keeps", () => {
  it("leaves the row, its id, and the membership history pointing at it", async () => {
    const membershipsBefore = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.season_memberships where person_id = $1::uuid`,
      [subjectId],
    );

    await bothConfirm();

    const person = await observer.query<{ given_name: string; erased_at: Date | null }>(
      `select given_name, erased_at from public.people where id = $1::uuid`,
      [subjectId],
    );
    expect(person.rows).toHaveLength(1);
    expect(person.rows[0].given_name).toBe(ERASED_DISPLAY_NAME);
    expect(person.rows[0].erased_at).not.toBeNull();

    const membershipsAfter = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.season_memberships where person_id = $1::uuid`,
      [subjectId],
    );
    expect(membershipsAfter.rows[0].count).toBe(membershipsBefore.rows[0].count);
  }, 60_000);

  it("revokes every live link and cancels every queued message", async () => {
    await bothConfirm();

    const tokens = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.person_access_tokens
        where person_id = $1::uuid and revoked_at is null`,
      [subjectId],
    );
    expect(tokens.rows[0].count).toBe("0");

    const jobs = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.notification_jobs
        where person_id = $1::uuid and status in ('pending', 'ready', 'processing')`,
      [subjectId],
    );
    expect(jobs.rows[0].count).toBe("0");
  }, 60_000);

  it("clears the messaging safety accounting, and the hold keyed on their number", async () => {
    // LAN-394, Brian 17 September 2026. The attempt row stays — an erasure
    // anonymises a person, it does not delete the club's record of what it did
    // — but the two fields that say *who* it was for do not, and neither does a
    // hold latched against the fingerprint of their number.
    const before = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts
        where safety_person_id = $1::uuid`,
      [subjectId],
    );
    expect(before.rows[0].count).toBe("1");

    await bothConfirm();

    const after = await observer.query<{
      count: string;
      admitted: string;
      identifying: string;
    }>(
      `select count(*)::text as count,
              count(*) filter (where a.safety_admitted_at is not null)::text as admitted,
              count(*) filter (where a.safety_person_id is not null
                                  or a.safety_destination_key is not null)::text as identifying
         from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.person_id = $1::uuid`,
      [subjectId],
    );
    expect(after.rows[0].count).toBe("1");
    // The admission itself is still counted — the global accounting is about
    // volume, not about anybody — and nothing identifying survives.
    expect(after.rows[0].admitted).toBe("1");
    expect(after.rows[0].identifying).toBe("0");

    const scopes = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.messaging_safety_scopes
        where scope_kind = 'destination' and scope_key = $1`,
      [destinationKey("whatsapp", SUBJECT.phone)],
    );
    expect(scopes.rows[0].count).toBe("0");
  }, 60_000);

  it("writes one audit event that names no personal data", async () => {
    await bothConfirm();

    const events = await observer.query<{ action: string; row: string }>(
      `select action, row_to_json(a)::text as row
         from public.audit_events a
        where entity_table = 'people' and entity_id = $1::uuid and action = 'person_erased'`,
      [subjectId],
    );
    expect(events.rows).toHaveLength(1);
    const text = events.rows[0].row;
    for (const value of [SUBJECT.givenName, SUBJECT.familyName, SUBJECT.email, SUBJECT.phone]) {
      expect(text).not.toContain(value);
    }
    // It does say what happened: both seats, the request date, and the counts.
    expect(text).toContain("president");
    expect(text).toContain("general_manager");
    expect(text).toContain("2026-09-10");
    expect(text).toContain("contact_points");
  }, 60_000);
});

describe("the two sign-offs", () => {
  it("does nothing at all on the first confirmation", async () => {
    actingAs(presidentId, ["president"]);
    const outcome = await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });

    expect(outcome.state).toBe("awaiting-second");
    const person = await observer.query<{ given_name: string }>(
      `select given_name from public.people where id = $1::uuid`,
      [subjectId],
    );
    expect(person.rows[0].given_name).toBe(SUBJECT.givenName);
  });

  it("refuses a second confirmation from the first signer", async () => {
    actingAs(presidentId, ["president"]);
    await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });

    await expect(
      confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" }),
    ).rejects.toMatchObject({ rule: "erasure_signer_already_confirmed" });
  });

  it("takes any other of the core four when one person holds both seats", async () => {
    actingAs(presidentId, ["president", "general_manager"]);
    await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });

    const state = await readErasureState(subjectId);
    expect(state.signOffs).toHaveLength(1);
    expect(state.stillNeeded).toContain("secretary");
    expect(state.stillNeeded).toContain("vice_president");

    actingAs(generalManagerId, ["secretary"]);
    const outcome = await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });
    expect(outcome.state).toBe("erased");
  }, 60_000);

  it("refuses a signer who holds none of the four seats", async () => {
    actingAs(presidentId, ["treasurer"]);
    await expect(
      confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" }),
    ).rejects.toMatchObject({ rule: "erasure_signer_holds_no_qualifying_seat" });
  });

  it("refuses a pair that never includes the President or the General Manager", async () => {
    actingAs(presidentId, ["secretary"]);
    const first = await confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" });
    expect(first.state).toBe("awaiting-second");

    actingAs(generalManagerId, ["vice_president"]);
    await expect(
      confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" }),
    ).rejects.toMatchObject({ rule: "erasure_signoff_pair_incomplete" });

    const state = await readErasureState(subjectId);
    expect(state.signOffs).toHaveLength(1);
    expect(state.eligibility.eligible).toBe(true);
    const person = await observer.query<{ given_name: string }>(
      `select given_name from public.people where id = $1::uuid`,
      [subjectId],
    );
    expect(person.rows[0].given_name).toBe(SUBJECT.givenName);
  }, 60_000);
});

describe("who may be erased", () => {
  // An operator account needs a real `auth.users` row behind it, so this mints
  // one rather than hoping the seed has an active operator — CI resets without
  // the seed, and a fixture that depends on somebody else's rows is a fixture
  // that passes for the wrong reason locally and fails there.
  it("refuses a person who still holds a live operator account, and says why", async () => {
    // A fresh address each run: `auth.users` keeps email unique, and a fixture
    // that reuses one fails the second time it is run against a database that
    // was not reset in between.
    const accountEmail = `${MARKER.toLowerCase()}-${Date.now()}@invalid.example`;
    const authUser = await observer.query<{ id: string }>(
      // Empty strings, not nulls, for the token columns: GoTrue reads them
      // into Go strings, and a null makes its whole directory read fail —
      // which is a broken Auth service for every other suite, not a failure
      // here.
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               confirmation_token, recovery_token,
                               email_change_token_new, email_change)
       values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000',
               'authenticated', 'authenticated', $1, '', now(), now(), now(),
               '', '', '', '')
       returning id`,
      [accountEmail],
    );
    await observer.query(
      `insert into public.operator_accounts (person_id, auth_user_id, is_active, login_email)
       values ($1::uuid, $2::uuid, true, $3)`,
      [subjectId, authUser.rows[0].id, accountEmail],
    );

    const state = await readErasureState(subjectId);
    expect(state.eligibility.eligible).toBe(false);
    expect(state.eligibility.blockers.map((entry) => entry.rule)).toContain(
      "erasure_operator_account_live",
    );

    await expect(
      confirmErasure({ personId: subjectId, requestedOn: "2026-09-10" }),
    ).rejects.toMatchObject({ rule: "erasure_person_not_eligible" });
  });

  it("refuses a person still on an open season's roster", async () => {
    await observer.query(
      `update public.season_memberships
          set status = 'active', activated_on = current_date, departed_on = null
        where person_id = $1::uuid`,
      [subjectId],
    );

    const state = await readErasureState(subjectId);
    expect(state.eligibility.blockers.map((entry) => entry.rule)).toContain(
      "erasure_membership_still_open",
    );
  });

  it("refuses a person who still holds a seat", async () => {
    const role = await observer.query<{ id: string }>(
      `select id from public.roles where code = 'kit_manager'`,
    );
    const year = await observer.query<{ id: string }>(
      `select id from public.committee_years order by starts_on desc limit 1`,
    );
    await observer.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, committee_year_id, effective_from)
       values ($1::uuid, $2::uuid, 'committee_year', false, $3::uuid, current_date)`,
      [subjectId, role.rows[0].id, year.rows[0].id],
    );

    const state = await readErasureState(subjectId);
    expect(state.eligibility.blockers.map((entry) => entry.rule)).toContain(
      "erasure_seat_still_held",
    );
  });

  it("accepts an alumnus — departed, no seat, no account", async () => {
    const state = await readErasureState(subjectId);
    expect(state.eligibility.eligible).toBe(true);
    expect(state.eligibility.blockers).toEqual([]);
  });
});

describe("the per-person export", () => {
  it("carries the person's own rows, including the emergency contact", async () => {
    const exported = await exportPersonRecord(subjectId);

    expect(exported.controller).toBe("University of Oxford");
    expect(exported.tables["public.people"]).toHaveLength(1);
    expect(exported.tables["public.person_emergency_contacts"]).toHaveLength(1);
    expect(JSON.stringify(exported)).toContain(SUBJECT.email);
    expect(JSON.stringify(exported)).toContain(SUBJECT.phone);
  }, 60_000);

  it("records that it happened, without putting the person in the audit row", async () => {
    await exportPersonRecord(subjectId);
    const events = await observer.query<{ row: string }>(
      `select row_to_json(a)::text as row from public.audit_events a
        where entity_table = 'people' and entity_id = $1::uuid
          and action = 'person_record_exported'`,
      [subjectId],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].row).not.toContain(SUBJECT.givenName);
  }, 60_000);
});
