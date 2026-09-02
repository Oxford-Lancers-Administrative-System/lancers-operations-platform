// @vitest-environment node
/**
 * The LAN-110 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-110/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-80.test.ts`
 * established.
 *
 * ## What is different about this scenario
 *
 * It is the first that **grants access**. Its two `head_coach` assignments are
 * the scenario — one in effect, one that has ended — and that makes its cleanup
 * unlike every scenario before it: it withdraws access by **end-dating**, never
 * by deleting. `docs/pilot-data-runbook.md` forbids deleting from
 * `role_assignments` outright, and its deprovisioning procedure says removing
 * access must not remove history.
 *
 * The consequence is that the two coaching people survive cleanup as well —
 * `role_assignments.person_id` is `on delete restrict` — so they become durable
 * synthetic identities. Several assertions below are about exactly that: the
 * seats end up out of effect, the history that they were held survives, and no
 * assignment belonging to anybody else is touched. An over-broad predicate here
 * would withdraw a real committee member's seat.
 *
 * It is also the first whose cleanup refuses while an **active login** exists.
 * Setup creates no auth user and no `operator_accounts` row; an active one at
 * cleanup means somebody granted access, and withdrawing it is a decision
 * rather than teardown. A deactivated one is expected to stay.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";
import { scopedPilotSnapshot } from "./helpers/pilot-snapshot";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-110");

const SENTINEL = "PILOT-LAN-110";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const PEOPLE = {
  authorizedCoach: "01100110-0110-4110-8110-000000000001",
  coachOutOfPost: "01100110-0110-4110-8110-000000000002",
  saidYes: "01100110-0110-4110-8110-000000000003",
  saidNo: "01100110-0110-4110-8110-000000000004",
  noResponse: "01100110-0110-4110-8110-000000000005",
};
const ALL_PEOPLE = Object.values(PEOPLE);
const ASSIGNMENTS = {
  inEffect: "01100110-0110-4110-8110-000000000011",
  ended: "01100110-0110-4110-8110-000000000012",
};
const MEMBERSHIPS = [
  "01100110-0110-4110-8110-000000000021",
  "01100110-0110-4110-8110-000000000022",
  "01100110-0110-4110-8110-000000000023",
];
/** The event with the invitees and the contrasting RSVP answers. Two days ago. */
const EVENT_ID = "01100110-0110-4110-8110-000000000031";
/** Today's, so the coach list's **Today** section can be demonstrated at all. */
const TODAY_EVENT_ID = "01100110-0110-4110-8110-000000000032";
const EVENT_IDS = [EVENT_ID, TODAY_EVENT_ID];
const INVITATIONS = [
  "01100110-0110-4110-8110-000000000051",
  "01100110-0110-4110-8110-000000000052",
  "01100110-0110-4110-8110-000000000053",
];

const SETUP_FILE = readFileSync(path.join(scenarioDir, "setup.sql"), "utf8");
const CLEANUP_FILE = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");
const README_FILE = readFileSync(path.join(scenarioDir, "README.md"), "utf8");

function scriptBody(name: string, raw: string): string {
  const meaningful = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("--"));

  expect(meaningful[0], `${name} must open its own transaction`).toBe("begin;");
  expect(meaningful.at(-1), `${name} must close its own transaction`).toBe("commit;");
  expect(
    meaningful.filter((line) => line === "begin;" || line === "commit;"),
    `${name} must have exactly one transaction`,
  ).toEqual(["begin;", "commit;"]);

  return raw.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
}

const SETUP = scriptBody("setup.sql", SETUP_FILE);
const CLEANUP = scriptBody("cleanup.sql", CLEANUP_FILE);

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});

/**
 * Removes any committed instance of this scenario, inside the test's own
 * transaction, so every test starts from a database that does not have one.
 *
 * The local stack is also the review environment, where somebody may be
 * part-way through the matrix. Without this the suite would report on the
 * reviewer rather than on the code. Every statement runs inside
 * `begin … rollback`, so nothing it removes is really removed.
 */
async function blankCanvas() {
  const people = `(select id from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) like '${SENTINEL}%')`;

  await client.query("drop table if exists pg_temp.blank_canvas_walk_ups");
  await client.query(
    `create temporary table blank_canvas_walk_ups on commit drop as
     select distinct person_id from public.attendance_records
      where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[]) and person_id is not null`,
  );

  await client.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id = any('{${EVENT_IDS.join(",")}}'::uuid[]))
         or (entity_table = 'attendance_records'
             and entity_id in (select id from public.attendance_records
                                where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[])))`,
  );
  await client.query(
    `delete from public.attendance_records where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[])`,
  );
  await client.query(
    `delete from public.contact_points
      where person_id in (select person_id from blank_canvas_walk_ups)
         or person_id in ${people}`,
  );
  // Before the people: a walk-on leaves a recruitment prospect, and
  // `recruitment_prospects.person_id` is `on delete restrict`.
  await client.query(
    `delete from public.recruitment_prospects
      where person_id in (select person_id from blank_canvas_walk_ups)
         or person_id in ${people}`,
  );
  await client.query(
    `delete from public.people where id in (select person_id from blank_canvas_walk_ups)
       and id not in ${people}`,
  );
  await client.query(
    `delete from public.rsvp_responses
      where invitation_id in (select id from public.invitations where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[]))`,
  );
  await client.query(
    `delete from public.invitations where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[])`,
  );
  await client.query(
    `delete from public.event_audience_members where event_id = any('{${EVENT_IDS.join(",")}}'::uuid[])`,
  );
  await client.query(`delete from public.season_memberships where person_id in ${people}`);
  await client.query(`delete from public.operator_accounts where person_id in ${people}`);
  await client.query(`delete from public.role_assignments where person_id in ${people}`);
  await client.query(
    `delete from public.events where id = any('{${EVENT_IDS.join(",")}}'::uuid[])`,
  );
  await client.query(
    `delete from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) like '${SENTINEL}%'`,
  );
}

beforeEach(async () => {
  await client.query("begin isolation level repeatable read");
  await blankCanvas();
});
afterEach(async () => {
  await client.query("rollback");
});
afterAll(async () => {
  await client.end();
});

/** A digest of every base table in `public` and `staging`. */
async function snapshot(): Promise<Record<string, string>> {
  return scopedPilotSnapshot(client, CLEANUP);
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(client, `select count(*)::text as n from ${sql}`, params);
  return Number(row.n);
}

/** The scenario's own row counts, as one object. */
async function scenarioRows() {
  return {
    people: await count(
      "public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) like $1",
      [`${SENTINEL}%`],
    ),
    assignments: await count("public.role_assignments where note like $1", [`${SENTINEL}%`]),
    events: await count("public.events where name like $1", [`${SENTINEL}%`]),
    memberships: await count("public.season_memberships where person_id = any($1::uuid[])", [
      ALL_PEOPLE,
    ]),
    audience: await count("public.event_audience_members where event_id = $1::uuid", [EVENT_ID]),
    invitations: await count("public.invitations where event_id = $1::uuid", [EVENT_ID]),
    responses: await count(
      "public.rsvp_responses where invitation_id in (select id from public.invitations where event_id = $1::uuid)",
      [EVENT_ID],
    ),
  };
}

/** Records attendance against a membership, the way the coach's board does. */
async function recordPlayer(membershipId: string, presence: string) {
  const row = await one<{ id: string }>(
    client,
    `insert into public.attendance_records
       (event_id, event_status, season_id, capacity, season_membership_id,
        presence, recorded_by_person_id)
     select $1, 'approved', e.season_id, 'player', $2, $3::public.attendance_presence, $4
       from public.events e where e.id = $1
     returning id`,
    [EVENT_ID, membershipId, presence, PEOPLE.authorizedCoach],
  );
  await client.query(
    `insert into public.audit_events
       (actor_person_id, action, entity_table, entity_id, from_state, to_state, context)
     values ($2, 'attendance.recorded', 'attendance_records', $1, null, $3,
             jsonb_build_object('eventId', $4::text))`,
    [row.id, PEOPLE.authorizedCoach, presence, EVENT_ID],
  );
  return row.id;
}

/** A walk-up who is not on the roster: a person minted from a typed name. */
async function recordWalkUp(typedName: string, contact: string | null) {
  const space = typedName.indexOf(" ");
  const givenName = space === -1 ? typedName : typedName.slice(0, space);
  const familyName = space === -1 ? null : typedName.slice(space + 1);

  const person = await one<{ id: string }>(
    client,
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [givenName, familyName],
  );

  if (contact !== null) {
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'phone', $2, true, 'walk-on attendance')`,
      [person.id, contact],
    );
  }

  // The recruitment prospect the application now writes alongside the person.
  // `recruitment_prospects.person_id` is `on delete restrict`, so a cleanup
  // that forgot it would fail on the person delete rather than leave a stray
  // row — which is exactly the failure the assertions below are for.
  await client.query(
    `insert into public.recruitment_prospects
       (person_id, season_id, status, source, first_contact_on)
     select $1, e.season_id, 'identified', 'Walk-on at ' || e.name, e.scheduled_on
       from public.events e where e.id = $2`,
    [person.id, EVENT_ID],
  );

  const attendance = await one<{ id: string }>(
    client,
    `insert into public.attendance_records
       (event_id, event_status, season_id, capacity, person_id, presence, recorded_by_person_id)
     select $1, 'approved', e.season_id, 'recruit', $2, 'present', $3
       from public.events e where e.id = $1
     returning id`,
    [EVENT_ID, person.id, PEOPLE.authorizedCoach],
  );
  await client.query(
    `insert into public.audit_events
       (actor_person_id, action, entity_table, entity_id, to_state, context)
     values ($2, 'attendance.walk_up_recorded', 'attendance_records', $1, 'present',
             jsonb_build_object('eventId', $3::text))`,
    [attendance.id, PEOPLE.authorizedCoach, EVENT_ID],
  );

  return person.id;
}

/** Everything README.md's matrix asks Brian to do, as the database sees it. */
async function workThroughTheMatrix(): Promise<string> {
  // Nothing marks the event as having happened: LAN-151 retired the
  // assertion (D30), and the scenario's first event is already two days old,
  // which is the whole of what opens its register.
  await recordPlayer(MEMBERSHIPS[0], "present");
  await recordPlayer(MEMBERSHIPS[1], "present");
  await recordPlayer(MEMBERSHIPS[2], "late");
  return recordWalkUp(`${SENTINEL} Devon Skye`, "+44 7700 900105");
}

/** Runs cleanup inside a savepoint, so a refusal can be *inspected*. */
async function runCleanup(): Promise<void> {
  await client.query("savepoint cleanup_attempt");
  try {
    await client.query(CLEANUP);
  } catch (error) {
    await client.query("rollback to savepoint cleanup_attempt");
    throw error;
  }
  await client.query("release savepoint cleanup_attempt");
}

/** Runs setup inside a savepoint, for the same reason. */
async function runSetup(): Promise<void> {
  await client.query("savepoint setup_attempt");
  try {
    await client.query(SETUP);
  } catch (error) {
    await client.query("rollback to savepoint setup_attempt");
    throw error;
  }
  await client.query("release savepoint setup_attempt");
}

describe("setup.sql", () => {
  it("creates the whole scenario, and is safe to run twice", async () => {
    await client.query(SETUP);

    // By identifier, not only by count. The ids above claim to mirror the
    // script's; without this the comment saying so would be the only thing
    // holding them together, and cleanup deletes by those ids.
    expect(await count("public.invitations where id = any($1::uuid[])", [INVITATIONS])).toBe(3);
    expect(
      await count("public.role_assignments where id = any($1::uuid[])", [
        Object.values(ASSIGNMENTS),
      ]),
    ).toBe(2);

    const first = await scenarioRows();
    expect(first).toEqual({
      people: 5,
      assignments: 2,
      events: 2,
      memberships: 3,
      audience: 3,
      invitations: 3,
      responses: 2,
    });

    // Every insert is `on conflict (id) do nothing`, so a second run adds
    // nothing and rewrites nothing.
    await client.query(SETUP);
    expect(await scenarioRows()).toEqual(first);
  });

  /**
   * The scenario's whole reason for existing: one seat that resolves and one
   * that does not.
   *
   * The predicate mirrors `isCurrentlyEffective()` in `src/lib/auth/operator.ts`
   * — bounded at both ends, half-open. If the two ever disagreed, the scenario
   * would install two coaches or none and the matrix would be untestable.
   */
  it("grants one coaching seat that is in effect and one that has ended", async () => {
    await client.query(SETUP);

    const rows = await client.query<{
      id: string;
      person_id: string;
      code: string;
      in_effect: boolean;
    }>(
      `select ra.id::text, ra.person_id::text, r.code,
              (ra.effective_from <= current_date
               and (ra.effective_to is null or ra.effective_to > current_date)) as in_effect
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
        where ra.note like $1
        order by ra.id`,
      [`${SENTINEL}%`],
    );

    expect(rows.rows).toHaveLength(2);
    for (const row of rows.rows) expect(row.code).toBe("head_coach");

    const inEffect = rows.rows.filter((row) => row.in_effect);
    expect(inEffect).toHaveLength(1);
    expect(inEffect[0].id).toBe(ASSIGNMENTS.inEffect);
    expect(inEffect[0].person_id).toBe(PEOPLE.authorizedCoach);

    const ended = rows.rows.filter((row) => !row.in_effect);
    expect(ended).toHaveLength(1);
    expect(ended[0].person_id).toBe(PEOPLE.coachOutOfPost);
  });

  it("gives the coaches a seat and no membership, and the players the reverse", async () => {
    // A coach on the playing roster would be a member of the thing this
    // scenario proves the coach cannot administer.
    await client.query(SETUP);

    for (const person of [PEOPLE.authorizedCoach, PEOPLE.coachOutOfPost]) {
      expect(
        await count("public.season_memberships where person_id = $1::uuid", [person]),
        person,
      ).toBe(0);
    }
    for (const person of [PEOPLE.saidYes, PEOPLE.saidNo, PEOPLE.noResponse]) {
      expect(await count("public.role_assignments where person_id = $1::uuid", [person])).toBe(0);
      expect(
        await count("public.season_memberships where person_id = $1::uuid and status = 'active'", [
          person,
        ]),
        person,
      ).toBe(1);
    }
  });

  it("leaves both events approved, one past and one today", async () => {
    await client.query(SETUP);

    const event = await one<{ status: string; occurred: boolean }>(
      client,
      `select status::text as status,
              scheduled_on < current_date as occurred
         from public.events where id = $1`,
      [EVENT_ID],
    );

    // The gate is the exercise, and since LAN-151 the date is the gate (D30).
    // The scenario's first event is two days old, so its register is open; a
    // coach opening it is the boundary worth testing.
    expect(event.status).toBe("approved");
    expect(event.occurred).toBe(true);

    // Both of them, including today's — which is approved and NOT yet occurred,
    // because its date has not passed. That is the pair the coach's two
    // sections need.
    const both = await client.query<{ status: string; occurred: boolean }>(
      `select status::text as status, scheduled_on < current_date as occurred
         from public.events where id = any($1::uuid[]) order by scheduled_on`,
      [EVENT_IDS],
    );
    expect(both.rows).toHaveLength(2);
    expect(both.rows.map((row) => row.status)).toEqual(["approved", "approved"]);
    expect(both.rows.map((row) => row.occurred)).toEqual([true, false]);
  });

  /**
   * The section Brian asked for on 14 August 2026 cannot be demonstrated
   * without an event dated today, and nothing else in the dataset provides one:
   * the synthetic seed dates its whole season ahead of its own "today".
   */
  it("dates one event today and one in the past week, so both sections appear", async () => {
    await client.query(SETUP);

    const dates = await client.query<{ id: string; is_today: boolean; in_past_week: boolean }>(
      `select id::text,
              scheduled_on = current_date as is_today,
              (scheduled_on < current_date and scheduled_on >= current_date - 7) as in_past_week
         from public.events where id = any($1::uuid[]) order by id`,
      [EVENT_IDS],
    );

    expect(dates.rows).toHaveLength(2);
    expect(dates.rows.filter((row) => row.is_today).map((row) => row.id)).toEqual([TODAY_EVENT_ID]);
    expect(dates.rows.filter((row) => row.in_past_week).map((row) => row.id)).toEqual([EVENT_ID]);
  });

  it("gives today's event no audience, so the walk-up is the way onto it", async () => {
    // The pitch-side case the coach surface exists for: somebody turns up to a
    // session nobody was formally invited to.
    await client.query(SETUP);

    expect(
      await count("public.event_audience_members where event_id = $1::uuid", [TODAY_EVENT_ID]),
    ).toBe(0);
    expect(await count("public.invitations where event_id = $1::uuid", [TODAY_EVENT_ID])).toBe(0);
  });

  it("creates no attendance — the thing under test is not pre-installed", async () => {
    await client.query(SETUP);
    expect(await count("public.attendance_records where event_id = $1::uuid", [EVENT_ID])).toBe(0);
  });

  it("gives the board a standing yes, a standing no with a reason, and a nonresponse", async () => {
    await client.query(SETUP);

    const answers = await client.query<{ membership: string; response: string; reason: string }>(
      `select i.season_membership_id::text as membership, r.response::text, r.reason
         from public.invitations i
         left join public.current_rsvp r on r.invitation_id = i.id
        where i.event_id = $1 order by i.id`,
      [EVENT_ID],
    );

    expect(answers.rows.map((row) => row.response)).toEqual(["yes", "no", null]);
    // The reason exists precisely so that the coach's board can be checked for
    // its absence. A scenario without one could not demonstrate that.
    expect(answers.rows[1].reason).toContain(SENTINEL);
  });

  it("creates no auth user, operator account or contact point", async () => {
    // No login, nothing to dial, nothing to email. The logins are Brian's to
    // create, and README.md says which person each must point at.
    await client.query(SETUP);

    expect(
      await count("public.operator_accounts where person_id = any($1::uuid[])", [ALL_PEOPLE]),
    ).toBe(0);
    expect(
      await count("public.contact_points where person_id = any($1::uuid[])", [ALL_PEOPLE]),
    ).toBe(0);
  });

  it("creates no notification job, so nothing here can be delivered", async () => {
    await client.query(SETUP);
    expect(await count("public.notification_jobs where event_id = $1::uuid", [EVENT_ID])).toBe(0);
  });

  it("refuses to install on top of leftover attendance", async () => {
    await client.query(SETUP);
    await workThroughTheMatrix();

    await expect(runSetup()).rejects.toThrow(/attendance record\(s\) already exist/i);
  });

  it("refuses when an unrelated event already carries the sentinel", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.events (season_id, name, event_type, status, scheduled_on)
       select season_id, $1, 'practice', 'draft', current_date
         from public.events where id = $2`,
      [`${SENTINEL} something somebody else named`, EVENT_ID],
    );

    await expect(runSetup()).rejects.toThrow(/already carry the PILOT-LAN-110 sentinel/i);
  });
});

describe("cleanup.sql", () => {
  it("removes the scenario and keeps the coaching identities, twice over", async () => {
    // The two coaching people and their seats are preserved on purpose — see
    // the block comment on the end-dating test below. Everything else goes.
    await client.query(SETUP);
    expect((await scenarioRows()).people).toBe(5);

    await client.query(CLEANUP);
    expect(await scenarioRows()).toEqual({
      people: 2,
      assignments: 2,
      events: 0,
      memberships: 0,
      audience: 0,
      invitations: 0,
      responses: 0,
    });

    await client.query(CLEANUP);
    expect(await scenarioRows()).toEqual({
      people: 2,
      assignments: 2,
      events: 0,
      memberships: 0,
      audience: 0,
      invitations: 0,
      responses: 0,
    });
  });

  it("removes the walk-on's recruitment prospect, without which the person cannot go", async () => {
    // `recruitment_prospects.person_id` is `on delete restrict`. A cleanup that
    // forgot this row would not leave a stray behind — it would abort on the
    // person delete and leave the whole scenario installed.
    await client.query(SETUP);
    const walkUpPersonId = await workThroughTheMatrix();

    expect(
      await count("public.recruitment_prospects where person_id = $1::uuid", [walkUpPersonId]),
    ).toBe(1);

    await client.query(CLEANUP);

    expect(
      await count("public.recruitment_prospects where person_id = $1::uuid", [walkUpPersonId]),
    ).toBe(0);
    expect(await count("public.people where id = $1::uuid", [walkUpPersonId])).toBe(0);
  });

  it("leaves a recruitment prospect that is not this scenario's alone", async () => {
    const before = await count("public.recruitment_prospects");

    await client.query(SETUP);
    await workThroughTheMatrix();
    await client.query(CLEANUP);

    expect(await count("public.recruitment_prospects")).toBe(before);
  });

  it("removes the attendance, the walk-up person and the audit rows both wrote", async () => {
    await client.query(SETUP);
    const walkUpPersonId = await workThroughTheMatrix();

    expect(await count("public.attendance_records where event_id = $1::uuid", [EVENT_ID])).toBe(4);
    expect(await count("public.people where id = $1::uuid", [walkUpPersonId])).toBe(1);
    expect(await count("public.contact_points where person_id = $1::uuid", [walkUpPersonId])).toBe(
      1,
    );

    await client.query(CLEANUP);

    expect(await count("public.attendance_records where event_id = $1::uuid", [EVENT_ID])).toBe(0);
    expect(await count("public.people where id = $1::uuid", [walkUpPersonId])).toBe(0);
    expect(await count("public.contact_points where person_id = $1::uuid", [walkUpPersonId])).toBe(
      0,
    );
    expect(
      await count("public.audit_events where entity_table = 'events' and entity_id = $1::uuid", [
        EVENT_ID,
      ]),
    ).toBe(0);
  });

  it("leaves every table it does not own exactly as it found it", async () => {
    // The strongest statement available: every row of every table, hashed. The
    // four tables holding the preserved coaching identities are excluded and
    // asserted separately below — everything else must come back byte-identical.
    //
    // `person_aliases` joined that list with LAN-182: a coaching identity now
    // carries its sentinel as the alias flagged as its display name, so the
    // alias survives for exactly as long as the identity it names does.
    const owned = new Set([
      "public.people",
      "public.person_aliases",
      "public.role_assignments",
      "public.contact_points",
    ]);
    const untouched = async () =>
      Object.fromEntries(Object.entries(await snapshot()).filter(([table]) => !owned.has(table)));

    const before = await untouched();

    await client.query(SETUP);
    await workThroughTheMatrix();
    await client.query(CLEANUP);

    expect(await untouched()).toEqual(before);
  });

  /**
   * The assertion this scenario exists to make, and the one whose failure would
   * be worst.
   *
   * Cleanup **end-dates** its two coaching seats and deletes neither.
   * `docs/pilot-data-runbook.md` forbids deleting from `role_assignments` at
   * all — "Preserves the foundation" — and its deprovisioning procedure says
   * removing access must not remove history. An earlier version of this PR
   * deleted them and widened the governance test to permit it; independent
   * review caught that, and this is the compliant shape.
   *
   * So the count must not move, every other assignment must be byte-identical,
   * and the scenario's own two must end up out of effect.
   */
  it("end-dates its own two coaching seats and touches no other assignment", async () => {
    const digest = async () =>
      (
        await one<{ digest: string }>(
          client,
          `select coalesce(
                    md5(string_agg(md5(to_jsonb(t)::text), ',' order by md5(to_jsonb(t)::text))),
                    '-') as digest
             from public.role_assignments t`,
        )
      ).digest;

    const before = await digest();
    const assignmentsBefore = await count("public.role_assignments");
    const othersBefore = (
      await one<{ digest: string }>(
        client,
        `select coalesce(
                  md5(string_agg(md5(to_jsonb(t)::text), ',' order by md5(to_jsonb(t)::text))),
                  '-') as digest
           from public.role_assignments t
          where t.note is null or t.note not like 'PILOT-LAN-110%'`,
      )
    ).digest;

    await client.query(SETUP);
    expect(await count("public.role_assignments")).toBe(assignmentsBefore + 2);

    await workThroughTheMatrix();
    await client.query(CLEANUP);

    // Nothing was deleted: the count is still the raised one.
    expect(await count("public.role_assignments")).toBe(assignmentsBefore + 2);

    // The scenario's two are out of effect...
    expect(
      await count(
        `public.role_assignments where note like 'PILOT-LAN-110%'
           and effective_from <= current_date
           and (effective_to is null or effective_to > current_date)`,
      ),
    ).toBe(0);

    // ...and the history that they were once held survives.
    expect(await count("public.role_assignments where note like 'PILOT-LAN-110%'")).toBe(2);

    // Every assignment that is not one of this scenario's two is byte-identical
    // to before. That is the failure worth catching: a real committee seat gone.
    const others = async () =>
      (
        await one<{ digest: string }>(
          client,
          `select coalesce(
                    md5(string_agg(md5(to_jsonb(t)::text), ',' order by md5(to_jsonb(t)::text))),
                    '-') as digest
             from public.role_assignments t
            where t.note is null or t.note not like 'PILOT-LAN-110%'`,
        )
      ).digest;
    expect(await others()).toBe(othersBefore);
    expect(before).not.toBe("-");
  });

  it("leaves the role catalogue itself completely alone", async () => {
    // The roles are reference data. Setup asserts them and creates none;
    // cleanup must not remove the club's own vocabulary on the way out.
    const before = await count("public.roles");

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await count("public.roles")).toBe(before);
    expect(await count("public.roles where code = 'head_coach'")).toBe(1);
  });

  /**
   * The guard that protects a real person, exercised.
   *
   * A walk-up minted from a name without the sentinel could be anybody, so the
   * script stops rather than delete a `people` row on a guess.
   */
  it("refuses to delete a walk-up person who does not carry the sentinel", async () => {
    await client.query(SETUP);
    const unmarked = await recordWalkUp("Devon Skye", null);

    await expect(runCleanup()).rejects.toThrow(/do not carry the PILOT-LAN-110 sentinel/i);

    // And nothing was removed on the way to the refusal — the whole script is
    // one transaction, so the abort rolls back everything before it.
    expect(await count("public.people where id = $1::uuid", [unmarked])).toBe(1);
    expect((await scenarioRows()).people).toBe(5);
  });

  /**
   * The second access guard: a seat this script did not write.
   *
   * Somebody granting one of these synthetic people another role is a decision.
   * Cleanup deleting it silently would make teardown a way to withdraw access.
   */
  it("refuses when a role assignment it did not write hangs off its people", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, season_id,
          effective_from, note)
       select $1, r.id, r.scope, r.is_constitutional_office,
              (select id from public.seasons where status in ('open', 'active')),
              current_date, 'granted by hand'
         from public.roles r where r.code = 'offence_coach'`,
      [PEOPLE.authorizedCoach],
    );

    await expect(runCleanup()).rejects.toThrow(/setup\.sql did not write/i);
    expect((await scenarioRows()).assignments).toBe(2);
  });

  it("refuses while an active login is still linked to one of its people", async () => {
    await client.query(SETUP);

    /**
     * Points a login at one of this scenario's people.
     *
     * `insert … on conflict` rather than an `update`, because the two
     * environments differ and the first version of this test only worked in
     * one. A development stack has both review logins linked already, so
     * re-pointing one is all that is needed; CI seeds an auth user and never
     * links it, so there is no `operator_accounts` row to update and an update
     * silently matched nothing — the guard was never reached and the test
     * passed locally while failing in CI. `on conflict` covers both.
     *
     * The whole test runs inside a transaction that is rolled back, so neither
     * environment keeps the link.
     */
    await client.query(
      `insert into public.operator_accounts (auth_user_id, person_id)
       select id, $1 from auth.users order by created_at limit 1
       on conflict (auth_user_id) do update set person_id = excluded.person_id`,
      [PEOPLE.authorizedCoach],
    );
    expect(
      await count("public.operator_accounts where person_id = $1::uuid", [PEOPLE.authorizedCoach]),
      "the fixture must actually create the link the guard is meant to notice",
    ).toBe(1);

    await expect(runCleanup()).rejects.toThrow(/operator account\(s\) are linked/i);
    expect((await scenarioRows()).people).toBe(5);
  });

  it("refuses when a sentinel-carrying person it does not know about appears", async () => {
    await client.query(SETUP);
    // The sentinel is a display alias since LAN-182 struck `people.known_as`,
    // so an interloper carrying it carries it there.
    const interloper = await client.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      ["Someone", "Else"],
    );
    await client.query(
      `insert into public.person_aliases (person_id, alias, source, is_display_name)
       values ($1, $2, 'interloper', true)`,
      [interloper.rows[0].id, `${SENTINEL} not from this scenario`],
    );

    await expect(runCleanup()).rejects.toThrow(/will not guess at them/i);
  });

  it("preserves audit history that is not this scenario's", async () => {
    const before = await count("public.audit_events");

    await client.query(SETUP);
    await workThroughTheMatrix();
    expect(await count("public.audit_events")).toBeGreaterThan(before);

    await client.query(CLEANUP);
    expect(await count("public.audit_events")).toBe(before);
  });
});

describe("README.md", () => {
  it("declares the sentinel-only shape it uses", () => {
    expect(README_FILE).toMatch(/## Ownership marker: sentinel only/);
    for (const table of [
      "public.audit_events",
      "public.attendance_records",
      "public.contact_points",
      "public.people",
    ]) {
      expect(README_FILE).toContain(table);
    }
  });

  it("tells Brian which field the sentinel goes in", () => {
    // The form has separate first and last name fields now, and cleanup matches
    // the sentinel against `given_name` — so "the first word of the name" is no
    // longer an instruction anybody can follow. It names the field.
    expect(README_FILE).toMatch(/\*\*First\s*\n?\s*name\*\* field/i);
    expect(README_FILE).toContain(`first name \`${SENTINEL}\``);
    expect(CLEANUP_FILE).toContain("upper(btrim(given_name))");
  });

  it("says the role catalogue is a prerequisite the script will not create", () => {
    // The likely first-run stop on hosted, per LAN-73's production handoff.
    expect(README_FILE).toMatch(/role catalogue must exist/i);
    expect(SETUP_FILE).toMatch(/will not create it/i);
  });

  it("warns that Brian's own account cannot show the coach surface", () => {
    // The trap: an operator who also coaches keeps the operator's board, by
    // design. Discovering that mid-review would read as a bug.
    expect(README_FILE).toMatch(/Do not use your own account for the coach login/i);
  });

  it("tells Brian to disable the logins before cleanup, because cleanup refuses", () => {
    expect(README_FILE).toMatch(/Disable the two logins you created/i);
    expect(CLEANUP_FILE).toMatch(/operator account\(s\) are linked/i);
  });

  it("names every person in the matrix it asks Brian to work through", async () => {
    await client.query(SETUP);
    const { rows } = await client.query<{ display_alias: string }>(
      `select (select da.alias from public.person_aliases da
                where da.person_id = people.id and da.is_display_name limit 1) as display_alias
         from public.people
        where (select da.alias from public.person_aliases da
                where da.person_id = people.id and da.is_display_name limit 1) like $1`,
      [`${SENTINEL}%`],
    );

    expect(rows).toHaveLength(5);
    for (const { display_alias: displayAlias } of rows) {
      const label = displayAlias.replace(`${SENTINEL} `, "");
      expect(README_FILE, `README.md does not mention "${label}"`).toContain(label);
    }
  });

  it("promises nothing can be sent, and the scripts keep that promise", () => {
    expect(README_FILE).toMatch(/## Can this send anything to a real person\?/);
    expect(README_FILE).toMatch(/\bNo\b/);
    for (const script of [SETUP_FILE, CLEANUP_FILE]) {
      expect(script).not.toMatch(/insert into public\.notification_jobs/i);
      expect(script).not.toMatch(/insert into public\.delivery_results/i);
      expect(script).not.toMatch(/insert into public\.contact_points/i);
    }
  });
});
