// @vitest-environment node
/**
 * The LAN-77 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-77/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established.
 *
 * ## What is different about this scenario
 *
 * It is the first whose feature *creates rows of its own*. Approving the
 * scenario event writes an audience, invitations and notification jobs that no
 * id block can predict, because PostgreSQL generates their keys when Brian
 * presses Approve. Cleanup therefore identifies them by their scenario event —
 * a handle that is just as narrow, since the event carries both halves of the
 * ownership marker — and the tests below install the scenario, produce those
 * rows the way the application produces them, and prove cleanup removes exactly
 * them.
 *
 * It is also the first that plants a row in order to make something *fail*: the
 * rollback scenario's pre-claimed idempotency key. That key has to match what
 * the service will generate, or the scenario silently becomes a second happy
 * path. The format is asserted here and from the other side in
 * `src/lib/services/event-approval.test.ts`.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 *
 * Every test runs inside one REPEATABLE READ transaction that is rolled back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { expectRejected, one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-77");

/** The sentinel every scenario row carries in a text column. */
const SENTINEL = "PILOT-LAN-77";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const APPROVAL_EVENT = "00770077-0077-4077-8077-000000000050";
const ROLLBACK_EVENT = "00770077-0077-4077-8077-000000000051";
const MEMBERSHIPS = [
  "00770077-0077-4077-8077-000000000020",
  "00770077-0077-4077-8077-000000000021",
  "00770077-0077-4077-8077-000000000022",
];
const PEOPLE = [
  "00770077-0077-4077-8077-000000000010",
  "00770077-0077-4077-8077-000000000011",
  "00770077-0077-4077-8077-000000000012",
];

const SETUP_FILE = readFileSync(path.join(scenarioDir, "setup.sql"), "utf8");
const CLEANUP_FILE = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");
const README_FILE = readFileSync(path.join(scenarioDir, "README.md"), "utf8");

/**
 * Reads a pilot script and returns its body with the outer transaction removed.
 *
 * The scripts must be transactional — one of the safety properties, asserted
 * here rather than assumed. They are then executed inside this file's own
 * transaction, because a `commit` in a test would leave rows in a database
 * shared with every other test file.
 */
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

beforeEach(async () => {
  await client.query("begin isolation level repeatable read");
});

afterEach(async () => {
  await client.query("rollback");
});

afterAll(async () => {
  await client.end();
});

/**
 * A digest of every base table in `public` and `staging`: row count, plus an
 * order-independent hash of every column of every row.
 *
 * Counts alone would miss a cleanup that deleted one row and left another, and
 * ids alone would miss a script that quietly rewrote a column it did not
 * create. Hashing the whole row catches both.
 */
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

/** Every scenario-owned row, counted the way the scripts identify them. */
async function scenarioCounts() {
  return {
    people: await count("public.people where known_as = $1", [SENTINEL]),
    contacts: await count("public.contact_points where source = $1", [`${SENTINEL} setup script`]),
    memberships: await count("public.season_memberships where id = any($1::uuid[])", [MEMBERSHIPS]),
    statusEvents: await count("public.season_membership_status_events where actor_label = $1", [
      `${SENTINEL} setup script`,
    ]),
    events: await count("public.events where name like $1", [`%${SENTINEL}%`]),
    audience: await count("public.event_audience_members where event_id = any($1::uuid[])", [
      [APPROVAL_EVENT, ROLLBACK_EVENT],
    ]),
    invitations: await count("public.invitations where event_id = any($1::uuid[])", [
      [APPROVAL_EVENT, ROLLBACK_EVENT],
    ]),
    jobs: await count("public.notification_jobs where event_id = any($1::uuid[])", [
      [APPROVAL_EVENT, ROLLBACK_EVENT],
    ]),
  };
}

/**
 * Approves the scenario event the way the application does, inside this
 * transaction.
 *
 * The service layer cannot be called here: it holds its own pool, so its
 * connection would not see this transaction's uncommitted rows and its commit
 * would leave data behind in a database every other suite shares. These
 * statements are the ones `approveEvent` runs, in the same order, so the rows
 * cleanup has to remove are the same shape as the rows Brian will produce.
 * That the *service* writes them correctly is proved in
 * `src/lib/services/event-approval.test.ts`.
 */
async function approveScenarioEvent(eventId: string): Promise<void> {
  const approver = await one<{ id: string }>(client, "select id from public.people limit 1");
  const season = await one<{ season_id: string }>(
    client,
    "select season_id from public.events where id = $1",
    [eventId],
  );

  await client.query(
    `update public.events
        set status = 'approved', approved_at = now(), approved_by_person_id = $2,
            audience_confirmed_at = now(), audience_confirmed_by_person_id = $2,
            response_deadline_at = now() + interval '2 days'
      where id = $1 and status = 'draft'`,
    [eventId, approver.id],
  );

  await client.query(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, added_at, added_by_person_id)
     select $1, $2, 'player', membership.id, now(), $3
       from unnest($4::uuid[]) as membership(id)`,
    [eventId, season.season_id, approver.id, MEMBERSHIPS],
  );

  await client.query(
    `insert into public.invitations
       (event_id, event_status, solicits_response, season_id, capacity,
        season_membership_id, status, expires_at, audience_member_id)
     select a.event_id, 'approved', true, a.season_id, a.capacity,
            a.season_membership_id, 'pending', now() + interval '2 days', a.id
       from public.event_audience_members a
      where a.event_id = $1`,
    [eventId],
  );

  await client.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        channel, template_variables)
     select 'event:' || i.event_id::text || ':invitation:' || i.capacity::text
              || ':' || i.participant_id::text,
            'invitation', 'pending', i.id, i.event_id, m.person_id, 'whatsapp', '{}'::jsonb
       from public.invitations i
       join public.season_memberships m on m.id = i.season_membership_id
      where i.event_id = $1`,
    [eventId],
  );

  await client.query(
    `insert into public.audit_events (actor_person_id, action, entity_table, entity_id,
                                      from_state, to_state)
     values ($1, 'event.approved', 'events', $2, 'draft', 'approved')`,
    [approver.id, eventId],
  );
}

/**
 * `expectRejected` for a sequence of statements rather than one.
 *
 * The shared helper takes SQL and runs it inside a savepoint. Approving is five
 * statements, so this wraps the whole sequence in one savepoint instead — the
 * failure has to be observed at the point the *transaction* would abort, not at
 * an individual statement, because that is what rollback means here.
 */
async function expectMultiStatementRejected(
  run: () => Promise<unknown>,
  expected: string,
): Promise<void> {
  await client.query("savepoint attempt");

  let error: (Error & { constraint?: string }) | null = null;
  try {
    await run();
  } catch (caught) {
    error = caught as Error & { constraint?: string };
  } finally {
    await client.query("rollback to savepoint attempt");
  }

  if (!error) {
    throw new Error("Expected the approval to be rejected, and it succeeded.");
  }
  expect(`${error.message} ${error.constraint ?? ""}`).toContain(expected);
}

// ---------------------------------------------------------------------------
// setup.sql
// ---------------------------------------------------------------------------

describe("setup.sql installs exactly the scenario", () => {
  it("creates the people, memberships, history and both draft events", async () => {
    await client.query(SETUP);

    expect(await scenarioCounts()).toEqual({
      people: 3,
      contacts: 4,
      memberships: 3,
      statusEvents: 9,
      events: 2,
      audience: 0,
      invitations: 0,
      // The planted blocker, and nothing else. The approval scenario has none.
      jobs: 1,
    });
  });

  it("leaves both events as drafts, so approval is the thing being tested", async () => {
    await client.query(SETUP);

    const statuses = await client.query<{ id: string; status: string }>(
      "select id, status::text as status from public.events where name like $1 order by id",
      [`%${SENTINEL}%`],
    );
    expect(statuses.rows.map((row) => row.status)).toEqual(["draft", "draft"]);
  });

  it("makes the memberships active, which is what the audience builder reads", async () => {
    await client.query(SETUP);

    const rows = await client.query<{ status: string }>(
      "select status::text as status from public.season_memberships where id = any($1::uuid[])",
      [MEMBERSHIPS],
    );
    expect(rows.rows.map((row) => row.status)).toEqual(["active", "active", "active"]);
  });

  it("gives the memberships a truthful history rather than appearing at active", async () => {
    await client.query(SETUP);

    const rows = await client.query<{ from_status: string | null; to_status: string }>(
      `select from_status::text as from_status, to_status::text as to_status
         from public.season_membership_status_events
        where season_membership_id = $1
        order by occurred_at`,
      [MEMBERSHIPS[0]],
    );
    expect(rows.rows).toEqual([
      { from_status: null, to_status: "confirmed" },
      { from_status: "confirmed", to_status: "onboarding" },
      { from_status: "onboarding", to_status: "active" },
    ]);
  });

  it("creates no audience, no invitation and nothing deliverable", async () => {
    await client.query(SETUP);

    // The one job it does create must be incapable of sending: cancelled, and
    // attached to no invitation.
    const job = await one<{ status: string; invitation_id: string | null }>(
      client,
      `select status::text as status, invitation_id from public.notification_jobs
        where event_id = $1`,
      [ROLLBACK_EVENT],
    );
    expect(job.status).toBe("cancelled");
    expect(job.invitation_id).toBeNull();

    expect(
      await count("public.invitations where event_id = any($1::uuid[])", [
        [APPROVAL_EVENT, ROLLBACK_EVENT],
      ]),
    ).toBe(0);
  });

  it("plants the exact idempotency key the approval transaction would generate", async () => {
    await client.query(SETUP);

    const job = await one<{ idempotency_key: string }>(
      client,
      "select idempotency_key from public.notification_jobs where event_id = $1",
      [ROLLBACK_EVENT],
    );

    // `participant_id` for a player capacity is the season membership. If the
    // service ever changes the derivation, this fails here and the rollback
    // scenario stops silently being a second happy path.
    expect(job.idempotency_key).toBe(`event:${ROLLBACK_EVENT}:invitation:player:${MEMBERSHIPS[0]}`);
  });

  it("makes the rollback scenario genuinely fail at the last write", async () => {
    await client.query(SETUP);

    // Everything up to the jobs succeeds, and then the planted key collides.
    await expectMultiStatementRejected(
      () => approveScenarioEvent(ROLLBACK_EVENT),
      "notification_jobs_idempotency_key_unique",
    );
  });

  it("is repeatable", async () => {
    await client.query(SETUP);
    const first = await scenarioCounts();

    await client.query(SETUP);

    expect(await scenarioCounts()).toEqual(first);
  });

  it("touches nothing outside the scenario", async () => {
    const before = await snapshot();
    await client.query(SETUP);
    const after = await snapshot();

    const changed = Object.keys(after).filter((table) => after[table] !== before[table]);
    expect(changed.sort()).toEqual(
      [
        "public.contact_points",
        "public.events",
        "public.notification_jobs",
        "public.people",
        "public.season_membership_status_events",
        "public.season_memberships",
      ].sort(),
    );
  });
});

describe("setup.sql refuses a target it does not understand", () => {
  it("aborts when a second season is open", async () => {
    // A genuinely well-formed second open season: `seasons_opening_is_recorded`
    // requires an opener, so a half-built row would fail for the wrong reason
    // and the test would pass without ever reaching the script's guard.
    await client.query(
      `insert into public.seasons
         (label, status, starts_on, position_vocabulary_id, opened_at, opened_by_person_id)
       select 'PILOT-LAN-77 second open season', 'open', current_date,
              s.position_vocabulary_id, now(), (select id from public.people limit 1)
         from public.seasons s
        order by s.starts_on desc nulls last
        limit 1`,
    );

    await expectRejected(client, SETUP, [], "seasons are open or active");
  });

  it("aborts when one of its ids belongs to somebody else", async () => {
    await client.query(
      `insert into public.people (id, given_name, known_as)
       values ($1, 'Somebody Real', 'not the scenario')`,
      [PEOPLE[0]],
    );

    await expectRejected(client, SETUP, [], "Refusing to touch it");
  });
});

// ---------------------------------------------------------------------------
// cleanup.sql
// ---------------------------------------------------------------------------

describe("cleanup.sql removes the scenario and only the scenario", () => {
  it("returns the database to exactly its previous state", async () => {
    const before = await snapshot();

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  it("removes the rows the application created too, and restores the state", async () => {
    const before = await snapshot();

    await client.query(SETUP);
    await approveScenarioEvent(APPROVAL_EVENT);

    // The approval really did produce the rows cleanup has to cope with.
    const approved = await scenarioCounts();
    expect(approved.audience).toBe(3);
    expect(approved.invitations).toBe(3);
    expect(approved.jobs).toBe(4); // three created, plus the planted blocker

    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  it("is repeatable", async () => {
    await client.query(SETUP);
    await client.query(CLEANUP);
    const after = await snapshot();

    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(after);
  });

  it("does nothing at all when the scenario was never installed", async () => {
    const before = await snapshot();

    await client.query(CLEANUP);

    expect(await snapshot()).toEqual(before);
  });

  it("preserves the season, and every person who is not the scenario's", async () => {
    const seasonsBefore = await count("public.seasons");
    const othersBefore = await count("public.people where coalesce(known_as, '') <> $1", [
      SENTINEL,
    ]);

    await client.query(SETUP);
    await approveScenarioEvent(APPROVAL_EVENT);
    await client.query(CLEANUP);

    expect(await count("public.seasons")).toBe(seasonsBefore);
    expect(await count("public.people where coalesce(known_as, '') <> $1", [SENTINEL])).toBe(
      othersBefore,
    );
  });

  it("preserves durable pilot identities, access records and unrelated audit history", async () => {
    const accountsBefore = await count("public.operator_accounts");
    const assignmentsBefore = await count("public.role_assignments");
    const unrelatedAuditBefore = await count(
      `public.audit_events where entity_id is null
         or entity_id not in ($1::uuid, $2::uuid)`,
      [APPROVAL_EVENT, ROLLBACK_EVENT],
    );

    await client.query(SETUP);
    await approveScenarioEvent(APPROVAL_EVENT);
    await client.query(CLEANUP);

    expect(await count("public.operator_accounts")).toBe(accountsBefore);
    expect(await count("public.role_assignments")).toBe(assignmentsBefore);
    expect(
      await count(
        `public.audit_events where entity_id is null
           or entity_id not in ($1::uuid, $2::uuid)`,
        [APPROVAL_EVENT, ROLLBACK_EVENT],
      ),
    ).toBe(unrelatedAuditBefore);
  });

  it("refuses when a scenario id has been taken over by something else", async () => {
    await client.query(SETUP);
    await client.query("update public.events set name = 'A real club event' where id = $1", [
      APPROVAL_EVENT,
    ]);

    await expectRejected(client, CLEANUP, [], "Refusing to delete anything");
  });

  it("refuses rather than orphaning a scenario person invited elsewhere", async () => {
    await client.query(SETUP);

    // Somebody adds a synthetic person to a real event's audience. Deleting the
    // person would fail on a foreign key; deleting the other event's rows is
    // not this script's business either.
    // Invariant E1a: an approved event names a real approver. The scenario's own
    // drafts carry no owner, so the actor comes from the club's people rather
    // than from the event being copied.
    const approver = await one<{ id: string }>(client, "select id from public.people limit 1");
    const other = await one<{ id: string; season_id: string }>(
      client,
      `insert into public.events (season_id, name, event_type, status, scheduled_on,
                                  approved_at, approved_by_person_id,
                                  audience_confirmed_at, audience_confirmed_by_person_id)
       select season_id, 'Unrelated club event', 'practice', 'approved', current_date + 3,
              now(), $2::uuid, now(), $2::uuid
         from public.events where id = $1
       returning id, season_id`,
      [APPROVAL_EVENT, approver.id],
    );
    const audience = await one<{ id: string }>(
      client,
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id)
       values ($1, $2, 'player', $3) returning id`,
      [other.id, other.season_id, MEMBERSHIPS[0]],
    );
    await client.query(
      `insert into public.invitations
         (event_id, event_status, solicits_response, season_id, capacity,
          season_membership_id, status, audience_member_id)
       values ($1, 'approved', true, $2, 'player', $3, 'pending', $4)`,
      [other.id, other.season_id, MEMBERSHIPS[0], audience.id],
    );

    await expectRejected(client, CLEANUP, [], "outside this scenario");
  });
});

// ---------------------------------------------------------------------------
// The README is part of the artefact
// ---------------------------------------------------------------------------

describe("README.md tells the person running it what they need", () => {
  it("names the scripts, the sentinel and the id block", () => {
    expect(README_FILE).toContain("setup.sql");
    expect(README_FILE).toContain("cleanup.sql");
    expect(README_FILE).toContain(SENTINEL);
    expect(README_FILE).toContain("00770077-0077-4077-8077");
  });

  it("says plainly that a human runs them", () => {
    expect(README_FILE).toMatch(/Brian runs these/i);
  });

  it("carries the test matrix the production handoff promises", () => {
    for (const row of ["empty audience", "double submission", "rollback", "375"]) {
      expect(README_FILE.toLowerCase()).toContain(row.toLowerCase());
    }
  });

  it("warns that approving the scenario creates queued messages", () => {
    expect(README_FILE.toLowerCase()).toContain("notification job");
    expect(README_FILE).toContain(".invalid");
  });
});
