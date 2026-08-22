// @vitest-environment node
/**
 * The LAN-80 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-80/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established and the later scenarios extended.
 *
 * ## What is different about this scenario
 *
 * It is the first whose cleanup can **delete a `people` row the application
 * minted**. A walk-up who is not on the roster is a person created from a name
 * a human typed on the day, so there is no identifier and no column the club
 * owns that marks it as synthetic — only the name. The README therefore asks
 * Brian to type the sentinel as its first word, and the cleanup **aborts** on a
 * walk-up that does not carry it rather than deleting a row that might be a real
 * member. Both halves of that are tested below, because the abort is the half
 * that protects real identity and an untested guard is a guard that has never
 * run.
 *
 * It is also the first whose scenario is deliberately left **un-asserted**: the
 * two events arrive `approved` with a null outcome, because invariant E5 makes
 * the assertion a human act and the whole exercise is performing it.
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

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-80");

const SENTINEL = "PILOT-LAN-80";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const PEOPLE = [
  "00800080-0080-4080-8080-000000000001",
  "00800080-0080-4080-8080-000000000002",
  "00800080-0080-4080-8080-000000000003",
  "00800080-0080-4080-8080-000000000004",
  "00800080-0080-4080-8080-000000000005",
];
const MEMBERSHIPS = {
  saidYes: "00800080-0080-4080-8080-000000000011",
  saidNo: "00800080-0080-4080-8080-000000000012",
  saidYesUnmarked: "00800080-0080-4080-8080-000000000013",
  noResponse: "00800080-0080-4080-8080-000000000014",
  rosterMatch: "00800080-0080-4080-8080-000000000015",
};
const EVENTS = {
  occurrence: "00800080-0080-4080-8080-000000000021",
  notHeld: "00800080-0080-4080-8080-000000000022",
};
const INVITATIONS = [
  "00800080-0080-4080-8080-000000000041",
  "00800080-0080-4080-8080-000000000042",
  "00800080-0080-4080-8080-000000000043",
  "00800080-0080-4080-8080-000000000044",
  "00800080-0080-4080-8080-000000000045",
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
 * This is not a convenience. `setup.sql` refuses to install on top of leftover
 * attendance — deliberately, because re-installing over a half-worked-through
 * scenario produces a board that disagrees with the matrix in README.md — and
 * the local stack is also the **review environment**, where somebody is
 * expected to install the scenario and press the buttons. Without this, the
 * suite passes or fails depending on whether a human happened to be part-way
 * through a review, which is a test that reports on the reviewer rather than on
 * the code.
 *
 * Every statement runs inside `begin … rollback`, so nothing it removes is
 * really removed: the review environment is exactly as it was when the test
 * finishes. It deliberately does **not** call `cleanup.sql`, which is one of
 * the things under test and would abort on a walk-up a reviewer named without
 * the sentinel.
 */
async function blankCanvas() {
  const events = `('${EVENTS.occurrence}', '${EVENTS.notHeld}')`;
  const people = `(select id from public.people where known_as like '${SENTINEL}%')`;

  // Walk-up people the application minted, captured before the attendance rows
  // that identify them are deleted.
  // Dropped first rather than `if not exists`: a stale table would be reused
  // silently, and it would hold the previous test's walk-ups.
  await client.query("drop table if exists pg_temp.blank_canvas_walk_ups");
  await client.query(
    `create temporary table blank_canvas_walk_ups on commit drop as
     select distinct person_id from public.attendance_records
      where event_id in ${events} and person_id is not null`,
  );

  await client.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id in ${events})
         or (entity_table = 'attendance_records'
             and entity_id in (select id from public.attendance_records
                                where event_id in ${events}))`,
  );
  await client.query(`delete from public.attendance_records where event_id in ${events}`);
  await client.query(
    `delete from public.contact_points
      where person_id in (select person_id from blank_canvas_walk_ups)
         or person_id in ${people}`,
  );
  await client.query(
    `delete from public.people where id in (select person_id from blank_canvas_walk_ups)
       and id not in ${people}`,
  );
  await client.query(
    `delete from public.rsvp_responses
      where invitation_id in (select id from public.invitations where event_id in ${events})`,
  );
  await client.query(`delete from public.invitations where event_id in ${events}`);
  await client.query(`delete from public.event_audience_members where event_id in ${events}`);
  await client.query(`delete from public.season_memberships where person_id in ${people}`);
  await client.query(`delete from public.events where id in ${events}`);
  await client.query(`delete from public.people where known_as like '${SENTINEL}%'`);
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
  const { rows: tables } = await client.query<{ qualified: string }>(
    `select quote_ident(n.nspname) || '.' || quote_ident(c.relname) as qualified
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname in ('public', 'staging')
      order by 1`,
  );

  const digests: Record<string, string> = {};
  for (const { qualified } of tables) {
    const row = await one<{ digest: string }>(
      client,
      `select count(*)::text || ':' ||
              coalesce(md5(string_agg(row_hash, ',' order by row_hash)), '-') as digest
         from (select md5(to_jsonb(t)::text) as row_hash from ${qualified} t) hashed`,
    );
    digests[qualified] = row.digest;
  }
  return digests;
}

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(client, `select count(*)::text as n from ${sql}`, params);
  return Number(row.n);
}

const eventIds = [EVENTS.occurrence, EVENTS.notHeld];

/** The scenario's own row counts, as one object. */
async function scenarioRows() {
  return {
    people: await count("public.people where known_as like $1", [`${SENTINEL}%`]),
    events: await count("public.events where name like $1", [`${SENTINEL}%`]),
    memberships: await count("public.season_memberships where person_id = any($1::uuid[])", [
      PEOPLE,
    ]),
    audience: await count("public.event_audience_members where event_id = any($1::uuid[])", [
      eventIds,
    ]),
    invitations: await count("public.invitations where event_id = any($1::uuid[])", [eventIds]),
    responses: await count(
      "public.rsvp_responses where invitation_id in (select id from public.invitations where event_id = any($1::uuid[]))",
      [eventIds],
    ),
  };
}

/** Records attendance against a membership, the way the board does. */
async function recordPlayer(eventId: string, membershipId: string, presence: string) {
  const row = await one<{ id: string }>(
    client,
    `insert into public.attendance_records
       (event_id, event_status, season_id, capacity, season_membership_id,
        presence, recorded_by_person_id)
     select $1, 'approved', e.season_id, 'player', $2, $3::public.attendance_presence, $4
       from public.events e where e.id = $1
     returning id`,
    [eventId, membershipId, presence, PEOPLE[0]],
  );
  await client.query(
    `insert into public.audit_events
       (actor_person_id, action, entity_table, entity_id, from_state, to_state, context)
     values ($2, 'attendance.recorded', 'attendance_records', $1, null, $3,
             jsonb_build_object('eventId', $4::text))`,
    [row.id, PEOPLE[0], presence, eventId],
  );
  return row.id;
}

/**
 * Records a walk-up who is not on the roster: a person minted from a typed
 * name, plus their attendance at guest capacity.
 */
async function recordWalkUp(eventId: string, typedName: string, contact: string | null) {
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
       values ($1, 'phone', $2, true, 'walk-up attendance')`,
      [person.id, contact],
    );
  }

  const attendance = await one<{ id: string }>(
    client,
    `insert into public.attendance_records
       (event_id, event_status, season_id, capacity, person_id, presence, recorded_by_person_id)
     select $1, 'approved', e.season_id, 'guest', $2, 'present', $3
       from public.events e where e.id = $1
     returning id`,
    [eventId, person.id, PEOPLE[0]],
  );
  await client.query(
    `insert into public.audit_events
       (actor_person_id, action, entity_table, entity_id, to_state, context)
     values ($2, 'attendance.walk_up_recorded', 'attendance_records', $1, 'present',
             jsonb_build_object('eventId', $3::text))`,
    [attendance.id, PEOPLE[0], eventId],
  );

  return person.id;
}

/**
 * Runs cleanup inside a savepoint, so a refusal can be *inspected*.
 *
 * A `raise exception` aborts the whole enclosing transaction, and every
 * assertion after it would fail with "current transaction is aborted" rather
 * than with what it was checking. The savepoint scopes the abort to the script,
 * which is also what a real run gets: the script is its own transaction, so a
 * guard that fires leaves the database exactly as it found it. That property is
 * what the assertions after a refusal are for.
 */
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

/** The whole matrix in README.md, performed. */
async function workThroughTheMatrix() {
  // Nothing marks the event as having happened: LAN-151 retired the
  // assertion (D30), and both scenario events are already dated in the past,
  // which is the whole of what opens their registers.
  await recordPlayer(EVENTS.occurrence, MEMBERSHIPS.saidYes, "absent");
  await recordPlayer(EVENTS.occurrence, MEMBERSHIPS.saidNo, "present");
  await recordPlayer(EVENTS.occurrence, MEMBERSHIPS.noResponse, "late");
  await recordPlayer(EVENTS.occurrence, MEMBERSHIPS.rosterMatch, "present");
  return recordWalkUp(EVENTS.occurrence, `${SENTINEL} Devon Skye`, "+44 7700 900105");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("setup.sql", () => {
  it("creates the whole scenario, and is safe to run twice", async () => {
    await client.query(SETUP);

    // By identifier, not only by count. The ids above claim to mirror the
    // script's; without this the comment saying so would be the only thing
    // holding them together, and cleanup deletes by those ids.
    expect(await count("public.invitations where id = any($1::uuid[])", [INVITATIONS])).toBe(5);

    const first = await scenarioRows();
    expect(first).toEqual({
      people: 5,
      events: 2,
      memberships: 5,
      audience: 5,
      invitations: 5,
      responses: 3,
    });

    // Every insert is `on conflict (id) do nothing`, so a second run adds
    // nothing and rewrites nothing.
    await client.query(SETUP);
    expect(await scenarioRows()).toEqual(first);
  });

  it("leaves both events approved, and dated in the past so both registers open", async () => {
    await client.query(SETUP);

    const events = await client.query<{ id: string; status: string; occurred: boolean }>(
      `select id::text, status::text as status,
              (status = 'approved' and scheduled_on < current_date) as occurred
         from public.events where id = any($1::uuid[]) order by id`,
      [eventIds],
    );

    expect(events.rows).toHaveLength(2);
    for (const row of events.rows) {
      // `approved` is the only status a past event that was not called off can
      // be in, and the date is the whole of what makes its register open (D30).
      // Invariant E5 used to be asserted here: that occurrence was somebody's
      // act, and that a scenario arriving asserted would be testing the script
      // rather than the application. LAN-151 retired it, and the columns that
      // recorded the assertion are gone from the schema.
      expect(row.status, `${row.id} must arrive approved`).toBe("approved");
      expect(row.occurred, `${row.id} must already have been and gone`).toBe(true);
    }
  });

  it("creates no attendance — the thing under test is not pre-installed", async () => {
    await client.query(SETUP);
    expect(
      await count("public.attendance_records where event_id = any($1::uuid[])", [eventIds]),
    ).toBe(0);
  });

  it("gives the occurrence event the four contrasting RSVP states", async () => {
    await client.query(SETUP);

    const answers = await client.query<{ membership: string; response: string | null }>(
      `select i.season_membership_id::text as membership, r.response::text as response
         from public.invitations i
         left join public.current_rsvp r on r.invitation_id = i.id
        where i.event_id = $1
        order by i.id`,
      [EVENTS.occurrence],
    );

    expect(Object.fromEntries(answers.rows.map((row) => [row.membership, row.response]))).toEqual({
      [MEMBERSHIPS.saidYes]: "yes",
      [MEMBERSHIPS.saidNo]: "no",
      [MEMBERSHIPS.saidYesUnmarked]: "yes",
      [MEMBERSHIPS.noResponse]: null,
    });
  });

  it("leaves the roster-match person uninvited to the occurrence event", async () => {
    await client.query(SETUP);

    // This absence is the whole mechanism behind **Possible roster match**: the
    // walk-up form offers active memberships the event has not invited.
    expect(
      await count("public.invitations where event_id = $1 and season_membership_id = $2::uuid", [
        EVENTS.occurrence,
        MEMBERSHIPS.rosterMatch,
      ]),
    ).toBe(0);
    expect(
      await count("public.season_memberships where id = $1::uuid and status = 'active'", [
        MEMBERSHIPS.rosterMatch,
      ]),
    ).toBe(1);
  });

  it("creates no contact point, so nothing here can be dialled or emailed", async () => {
    await client.query(SETUP);
    expect(await count("public.contact_points where person_id = any($1::uuid[])", [PEOPLE])).toBe(
      0,
    );
  });

  it("creates no notification job, so nothing here can be delivered", async () => {
    await client.query(SETUP);
    expect(
      await count("public.notification_jobs where event_id = any($1::uuid[])", [eventIds]),
    ).toBe(0);
  });

  it("refuses to install on top of leftover attendance", async () => {
    await client.query(SETUP);
    await workThroughTheMatrix();

    // Re-running setup over a half-cleaned scenario would produce a board that
    // disagrees with the matrix in README.md, so it stops instead.
    await expect(client.query(SETUP)).rejects.toThrow(/attendance record/i);
  });

  it("refuses when an unrelated event already carries the sentinel", async () => {
    await client.query(
      `insert into public.events (season_id, name, event_type, status)
       select id, $1, 'practice', 'draft' from public.seasons
        where status in ('open', 'active')`,
      [`${SENTINEL} Interloper`],
    );

    await expect(client.query(SETUP)).rejects.toThrow(/not this scenario/i);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("cleanup.sql", () => {
  it("removes everything setup created, and is safe to run twice", async () => {
    await client.query(SETUP);
    expect((await scenarioRows()).people).toBe(5);

    await client.query(CLEANUP);
    expect(await scenarioRows()).toEqual({
      people: 0,
      events: 0,
      memberships: 0,
      audience: 0,
      invitations: 0,
      responses: 0,
    });

    await client.query(CLEANUP);
    expect((await scenarioRows()).people).toBe(0);
  });

  it("removes the attendance, the walk-up person and the audit rows both wrote", async () => {
    await client.query(SETUP);
    const walkUpPersonId = await workThroughTheMatrix();

    expect(
      await count("public.attendance_records where event_id = any($1::uuid[])", [eventIds]),
    ).toBe(5);
    expect(await count("public.people where id = $1::uuid", [walkUpPersonId])).toBe(1);
    expect(await count("public.contact_points where person_id = $1::uuid", [walkUpPersonId])).toBe(
      1,
    );

    await client.query(CLEANUP);

    expect(
      await count("public.attendance_records where event_id = any($1::uuid[])", [eventIds]),
    ).toBe(0);
    expect(await count("public.people where id = $1::uuid", [walkUpPersonId])).toBe(0);
    expect(await count("public.contact_points where person_id = $1::uuid", [walkUpPersonId])).toBe(
      0,
    );
    expect(
      await count(
        "public.audit_events where entity_table = 'events' and entity_id = any($1::uuid[])",
        [eventIds],
      ),
    ).toBe(0);
    expect(await count("public.audit_events where entity_table = 'attendance_records'")).toBe(
      await count("public.audit_events where entity_table = 'attendance_records'"),
    );
  });

  it("leaves the rest of the database exactly as it found it", async () => {
    // The strongest statement available: every row of every table, hashed.
    const before = await snapshot();

    await client.query(SETUP);
    await workThroughTheMatrix();
    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  /**
   * The guard that protects a real person, exercised.
   *
   * A walk-up minted from a name without the sentinel could be anybody —
   * including a real member somebody added through another surface — so the
   * script stops rather than delete a `people` row on a guess. This is the one
   * assertion in the file whose failure would mean real identity could be
   * destroyed by a cleanup.
   */
  it("refuses to delete a walk-up person who does not carry the sentinel", async () => {
    await client.query(SETUP);
    // Nothing marks the event as having happened: LAN-151 retired the
    // assertion (D30), and both scenario events are already dated in the past,
    // which is the whole of what opens their registers.
    const unmarked = await recordWalkUp(EVENTS.occurrence, "Devon Skye", null);

    await expect(runCleanup()).rejects.toThrow(/do not carry the PILOT-LAN-80 sentinel/i);

    // And nothing was removed on the way to the refusal — the whole script is
    // one transaction, so the abort rolls back everything before it.
    expect(await count("public.people where id = $1::uuid", [unmarked])).toBe(1);
    expect((await scenarioRows()).people).toBe(5);
  });

  it("refuses when a sentinel-carrying person it does not know about appears", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.people (given_name, family_name, known_as)
       values ('Attend', 'Interloper', $1)`,
      [`${SENTINEL} Interloper`],
    );

    // Deleting it would be guessing; leaving it silently would leave the
    // scenario half-installed. Stopping is the only honest option.
    await expect(runCleanup()).rejects.toThrow(/not this scenario/i);
  });

  it("refuses when a schedule change has appeared against its events", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.schedule_changes
         (event_id, source, reason, previous_starts_at, new_starts_at,
          changed_at, recorded_by_person_id)
       values ($1, 'club', 'Moved by an operator', '19:00', '20:00', now(), $2)`,
      [EVENTS.occurrence, PEOPLE[0]],
    );

    await expect(runCleanup()).rejects.toThrow(/schedule change/i);
  });

  it("preserves audit history that is not this scenario's", async () => {
    await client.query(SETUP);
    await workThroughTheMatrix();

    const unrelated = await one<{ id: string }>(
      client,
      `insert into public.audit_events
         (actor_label, action, entity_table, entity_id, to_state)
       values ('system: unrelated', 'membership.activated', 'season_memberships',
               gen_random_uuid(), 'active')
       returning id`,
    );

    await client.query(CLEANUP);

    expect(await count("public.audit_events where id = $1::uuid", [unrelated.id])).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The README's promises
// ---------------------------------------------------------------------------

describe("README.md", () => {
  it("declares the sentinel-only shape it uses", () => {
    expect(README_FILE).toContain("## Ownership marker: sentinel only");
  });

  it("tells Brian to type the sentinel into the walk-up name", () => {
    // The abort above is only reasonable if the instruction that avoids it is
    // in the file he reads.
    expect(README_FILE).toContain(`${SENTINEL} Devon Skye`);
    expect(README_FILE).toMatch(/sentinel as (its|the) first word/i);
  });

  it("names every person in the matrix it asks Brian to work through", async () => {
    await client.query(SETUP);
    const people = await client.query<{ known_as: string }>(
      "select known_as from public.people where id = any($1::uuid[])",
      [PEOPLE],
    );

    for (const row of people.rows) {
      expect(README_FILE, `${row.known_as} is not in the matrix`).toContain(row.known_as);
    }
  });

  it("records the mismatch-view gap rather than letting it surprise him", () => {
    // `rsvp_attendance_mismatches` cannot report `attended_without_invitation`
    // for an event that has any invitation, so the query in the README returns
    // nothing for either walk-up. Saying so is the difference between a known
    // gap and a scenario that looks broken.
    expect(README_FILE).toContain("attended_without_invitation");
    expect(README_FILE).toMatch(/known gap/i);
  });

  it("promises nothing can be sent, and the scripts keep that promise", () => {
    expect(README_FILE).toMatch(/Can this send anything to a real person\?/);
    for (const sql of [SETUP_FILE, CLEANUP_FILE]) {
      expect(sql).not.toMatch(/insert\s+into\s+public\.notification_jobs/i);
      expect(sql).not.toMatch(/insert\s+into\s+public\.delivery_/i);
    }
  });
});
