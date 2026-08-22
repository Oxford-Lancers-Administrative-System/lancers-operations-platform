// @vitest-environment node
/**
 * The LAN-78 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-78/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established and `tests/pilot-scenario-lan-77.test.ts` extended.
 *
 * ## What is different about this scenario
 *
 * Its feature creates rows whose keys no id block can predict — an RSVP access
 * token, further delivery attempts and results, provider callbacks, and the
 * audit rows those write. Cleanup identifies them through the scenario's own
 * event, which carries both halves of the ownership marker, and the tests below
 * produce those rows the way the application produces them and prove cleanup
 * removes exactly them.
 *
 * It is also the first scenario that installs **failure evidence** on purpose:
 * two of its three jobs are already failed, one transiently and one terminally,
 * because "Retryable" and "Failed" are different states an operator has to be
 * able to tell apart and neither can be reached by waiting.
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

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-78");

const SENTINEL = "PILOT-LAN-78";

/** The deterministic ids the scripts use, mirrored here so drift is a failure. */
const EVENT = "00780078-0078-4078-8078-000000000050";
const PEOPLE = [
  "00780078-0078-4078-8078-000000000001",
  "00780078-0078-4078-8078-000000000002",
  "00780078-0078-4078-8078-000000000003",
];
const INVITATIONS = [
  "00780078-0078-4078-8078-000000000071",
  "00780078-0078-4078-8078-000000000072",
  "00780078-0078-4078-8078-000000000073",
];
const JOBS = [
  "00780078-0078-4078-8078-000000000081",
  "00780078-0078-4078-8078-000000000082",
  "00780078-0078-4078-8078-000000000083",
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
    // `like`, because `known_as` is the name the screen shows and carries the
    // sentinel as a prefix rather than as the whole value.
    people: await count("public.people where known_as like $1", [`${SENTINEL}%`]),
    contacts: await count("public.contact_points where source = $1", [SENTINEL]),
    memberships: await count("public.season_memberships where person_id = any($1::uuid[])", [
      PEOPLE,
    ]),
    events: await count("public.events where name like $1", [`%${SENTINEL}%`]),
    audience: await count("public.event_audience_members where event_id = $1::uuid", [EVENT]),
    invitations: await count("public.invitations where event_id = $1::uuid", [EVENT]),
    jobs: await count("public.notification_jobs where event_id = $1::uuid", [EVENT]),
    attempts: await count(
      `public.delivery_attempts where notification_job_id in
         (select id from public.notification_jobs where event_id = $1::uuid)`,
      [EVENT],
    ),
    results: await count(
      `public.delivery_results where notification_job_id in
         (select id from public.notification_jobs where event_id = $1::uuid)`,
      [EVENT],
    ),
    tokens: await count(
      `public.rsvp_access_tokens where invitation_id in
         (select id from public.invitations where event_id = $1::uuid)`,
      [EVENT],
    ),
    callbacks: await count(
      `public.delivery_callbacks where delivery_attempt_id in
         (select id from public.delivery_attempts where notification_job_id in
           (select id from public.notification_jobs where event_id = $1::uuid))`,
      [EVENT],
    ),
  };
}

/**
 * The rows the application would add while the scenario is in use.
 *
 * Written here rather than by calling the service, because the service opens
 * its own pool and this file's assertions all live inside one rolled-back
 * transaction. What matters for cleanup is the *shape* — rows hanging off the
 * scenario's jobs and invitations with keys no script can predict — and that is
 * what these produce.
 */
async function simulateApplicationActivity(): Promise<void> {
  const token = await one<{ id: string }>(
    client,
    `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
     values ($1::uuid, md5('lan78-scenario') || md5('lan78-scenario'), now() + interval '2 days')
     returning id`,
    [INVITATIONS[0]],
  );

  const attempt = await one<{ id: string }>(
    client,
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, provider_message_id,
        rsvp_access_token_id, accepted_at)
     values ($1::uuid, 1, 'whatsapp', 'meta_whatsapp_cloud', 'wamid.SCENARIO', $2::uuid, now())
     returning id`,
    [JOBS[0], token.id],
  );

  await client.query(
    `insert into public.delivery_callbacks
       (provider, provider_event_id, provider_message_id, provider_status,
        delivery_attempt_id, signature_verified, applied_at)
     values ('meta_whatsapp_cloud', 'wamid.SCENARIO:delivered', 'wamid.SCENARIO', 'delivered',
             $1::uuid, true, now())`,
    [attempt.id],
  );

  await client.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, provider_message_id)
     values ($1::uuid, 1, 'delivered', 'whatsapp', 'meta_whatsapp_cloud', 'wamid.SCENARIO')`,
    [JOBS[0]],
  );

  await client.query(
    `insert into public.audit_events
       (actor_label, action, entity_table, entity_id)
     values ('system: automated delivery', 'delivery.delivered', 'notification_jobs', $1::uuid)`,
    [JOBS[0]],
  );

  await client.query(
    `insert into public.audit_events
       (actor_label, action, entity_table, entity_id)
     values ('system: automated delivery', 'delivery.token_revoked_and_reissued', 'invitations', $1::uuid)`,
    [INVITATIONS[0]],
  );
}

describe("setup.sql", () => {
  it("creates exactly the scenario it describes", async () => {
    await client.query(SETUP);
    const counts = await scenarioCounts();

    expect(counts).toEqual({
      people: 3,
      contacts: 3,
      memberships: 3,
      events: 1,
      audience: 3,
      invitations: 3,
      jobs: 3,
      attempts: 2,
      results: 2,
      // The one thing a script cannot create: a token is the hash of a secret
      // nobody can recover, so setup must not pretend to issue one.
      tokens: 0,
      callbacks: 0,
    });
  });

  it("puts one job in each state the operator has to tell apart", async () => {
    await client.query(SETUP);

    const states = await client.query<{ id: string; status: string; attempt_count: number }>(
      `select id::text, status::text as status, attempt_count
         from public.notification_jobs where event_id = $1::uuid order by id`,
      [EVENT],
    );

    expect(states.rows.map((row) => [row.status, row.attempt_count])).toEqual([
      ["pending", 0],
      ["failed", 1],
      ["failed", 5],
    ]);
  });

  it("distinguishes a transient failure from a terminal one", async () => {
    await client.query(SETUP);

    // `failed` is retryable and `rejected` is not. The operator's
    // Retryable/Failed split reads exactly this, so a scenario carrying only
    // one of them would leave half the screen untested.
    const outcomes = await client.query<{ outcome: string }>(
      `select r.outcome::text as outcome from public.delivery_results r
         join public.notification_jobs j on j.id = r.notification_job_id
        where j.event_id = $1::uuid order by j.id`,
      [EVENT],
    );
    expect(outcomes.rows.map((row) => row.outcome)).toEqual(["failed", "rejected"]);
  });

  it("gives every invitee a number that cannot reach a person", async () => {
    await client.query(SETUP);

    const numbers = await client.query<{ raw_value: string }>(
      "select raw_value from public.contact_points where source = $1",
      [SENTINEL],
    );

    expect(numbers.rows).toHaveLength(3);
    for (const { raw_value: value } of numbers.rows) {
      // Ofcom's reserved drama range. Never allocated to anybody.
      expect(value).toMatch(/^07700 900\d{3}$/);
    }
  });

  it("leaves the event ahead of its own start, so a link could still be used", async () => {
    await client.query(SETUP);

    const started = await one<{ started: boolean }>(
      client,
      `select (e.scheduled_on + coalesce(e.starts_at, '00:00'::time)) at time zone 'Europe/London'
                <= now() as started
         from public.events e where e.id = $1::uuid`,
      [EVENT],
    );
    // A started event closes every RSVP link, which would make the token half
    // of the screen untestable.
    expect(started.started).toBe(false);
  });

  it("is repeatable, and changes nothing on a second run", async () => {
    await client.query(SETUP);
    const afterFirst = await snapshot();

    await client.query(SETUP);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it("writes nothing outside the tables it names", async () => {
    const before = await snapshot();
    await client.query(SETUP);
    const after = await snapshot();

    const touched = Object.keys(after).filter((table) => after[table] !== before[table]);
    expect(touched.sort()).toEqual(
      [
        "public.contact_points",
        "public.delivery_attempts",
        "public.delivery_results",
        "public.event_audience_members",
        "public.events",
        "public.invitations",
        "public.notification_jobs",
        "public.people",
        "public.season_memberships",
      ].sort(),
    );
  });
});

describe("cleanup.sql", () => {
  it("removes every scenario row, including the ones the application created", async () => {
    await client.query(SETUP);
    await simulateApplicationActivity();

    const withActivity = await scenarioCounts();
    expect(withActivity.tokens).toBe(1);
    expect(withActivity.callbacks).toBe(1);
    expect(withActivity.attempts).toBe(3);

    await client.query(CLEANUP);

    expect(await scenarioCounts()).toEqual({
      people: 0,
      contacts: 0,
      memberships: 0,
      events: 0,
      audience: 0,
      invitations: 0,
      jobs: 0,
      attempts: 0,
      results: 0,
      tokens: 0,
      callbacks: 0,
    });
  });

  it("returns the database to exactly what it was before setup ran", async () => {
    const before = await snapshot();

    await client.query(SETUP);
    await simulateApplicationActivity();
    await client.query(CLEANUP);

    // The strongest statement available: not "the counts match" but "every row
    // of every table hashes the same". A cleanup that removed one row too many,
    // or rewrote a column it did not create, fails here.
    expect(await snapshot()).toEqual(before);
  });

  it("is repeatable, and removes nothing on a second run", async () => {
    await client.query(SETUP);
    await client.query(CLEANUP);
    const afterFirst = await snapshot();

    await client.query(CLEANUP);
    expect(await snapshot()).toEqual(afterFirst);
  });

  it("runs against a database the scenario was never installed in", async () => {
    // Brian may run cleanup twice, or run it after a reset. Neither may error.
    const before = await snapshot();
    await client.query(CLEANUP);
    expect(await snapshot()).toEqual(before);
  });

  it("refuses rather than deleting an RSVP response", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.rsvp_responses
         (invitation_id, response, source, responded_at)
       values ($1::uuid, 'yes', 'signed_link', now())`,
      [INVITATIONS[0]],
    );

    // A real answer is history. A cleanup that quietly deleted one to get
    // itself unstuck would be worse than one that stops.
    await expect(client.query(CLEANUP)).rejects.toThrow(/RSVP response/i);
  });

  it("refuses rather than deleting attendance", async () => {
    await client.query(SETUP);
    // The event is approved already, and invariant P5's database half admits
    // attendance against exactly that. Whether its date has passed — the other
    // half, and since LAN-151 the whole of what "occurred" means (D30) — is a
    // service rule, and this is a direct insert.
    await client.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, season_membership_id, presence, recorded_at)
       select $1::uuid, 'approved', e.season_id, 'player', i.season_membership_id, 'present', now()
         from public.events e
         join public.invitations i on i.id = $2::uuid
        where e.id = $1::uuid`,
      [EVENT, INVITATIONS[0]],
    );

    await expect(client.query(CLEANUP)).rejects.toThrow(/attendance record/i);
  });

  it("refuses an event carrying the scenario's id but not its sentinel", async () => {
    await client.query(SETUP);
    await client.query("update public.events set name = 'Something else' where id = $1::uuid", [
      EVENT,
    ]);

    // The identifier alone is not ownership. Both halves, or nothing.
    await expect(client.query(CLEANUP)).rejects.toThrow(/sentinel/i);
  });

  it("leaves the durable pilot foundation untouched", async () => {
    const foundation = async () => ({
      operators: await count("public.operator_accounts"),
      assignments: await count("public.role_assignments"),
      roles: await count("public.roles"),
      seasons: await count("public.seasons"),
    });

    const before = await foundation();
    await client.query(SETUP);
    await simulateApplicationActivity();
    await client.query(CLEANUP);

    expect(await foundation()).toEqual(before);
  });
});

describe("the scenario documents itself", () => {
  it("declares the sentinel-only shape it uses", () => {
    // ADR 0019 requires the heading before the pinned predicates mean anything.
    expect(README_FILE).toContain("## Ownership marker: sentinel only");
  });

  it("carries a verification query naming the scenario's own event", () => {
    expect(README_FILE).toMatch(/```sql/);
    expect(README_FILE).toContain(EVENT);
  });

  it("says plainly that nothing can reach a real person, and why", () => {
    // Whitespace-tolerant: this is prose in a Markdown file, and a line break
    // falling between two words must not be what fails the assertion.
    expect(README_FILE).toMatch(/drama\s+range/i);
    expect(README_FILE).toMatch(/never\s+allocated/i);
  });

  it("names the four roles the screen needs, and grants none of them", () => {
    expect(README_FILE).toMatch(/President, Vice-President, Secretary or General Manager/);
    expect(SETUP_FILE).not.toMatch(/insert into public\.role_assignments/i);
    expect(SETUP_FILE).not.toMatch(/insert into public\.operator_accounts/i);
  });
});
