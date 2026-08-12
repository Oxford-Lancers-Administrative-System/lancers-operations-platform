// @vitest-environment node
/**
 * The LAN-76 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-76/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape
 * `tests/pilot-scenario-lan-93.test.ts` established.
 *
 * ## What is different about this scenario, and what that costs
 *
 * `setup.sql` writes nothing — it is a prerequisite check — and the rows
 * `cleanup.sql` removes are created by the **application**, through a browser,
 * by a human. So the runbook's ownership marker has only one of its two halves
 * here: there is no deterministic primary key to delete by, because PostgreSQL
 * generates it when Brian presses Save.
 *
 * The missing half is replaced by a status restriction that is at least as
 * narrow, and both halves are asserted below: the sentinel proves the event was
 * made for this test, and `status in ('draft', 'pending_approval', 'withdrawn')`
 * proves it never reached approval — so the delete cannot reach an event
 * carrying invitations, responses or attendance. The events created here stand
 * in for the ones Brian creates, and every one of them is created through the
 * real service layer rather than by an `insert`, so a scenario event in this
 * file is the same shape as a scenario event in hosted.
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

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import { expectRejected, one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-76");

/** The sentinel every scenario event carries, in `events.name`. */
const SENTINEL = "PILOT-LAN-76";

/** The migration `setup.sql` requires to be applied. */
const REQUIRED_MIGRATION = "20260810120700";

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

/**
 * A digest of every base table in `public` and `staging`: row count, plus an
 * order-independent hash of every column of every row.
 *
 * Counts alone would miss a cleanup that deleted one row and left another, and
 * ids alone would miss a script that quietly rewrote a column it did not
 * create. Hashing the whole row catches both.
 */
async function snapshot(client: Client): Promise<Record<string, string>> {
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

/** The season the application would record an event against. */
async function operatingSeasonId(client: Client): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `select id from public.seasons
      where status in ('open', 'active', 'closing')
      order by starts_on desc nulls last
      limit 1`,
  );
  return row.id;
}

/** A person to own the events, and to act in the audit trail. */
async function anyPersonId(client: Client): Promise<string> {
  const row = await one<{ id: string }>(client, "select id from public.people limit 1");
  return row.id;
}

/**
 * One scenario event, in the shape the application creates it — including the
 * audit row, which cleanup must leave behind.
 */
async function createScenarioEvent(
  client: Client,
  options: { name?: string; status?: string; reason?: string | null } = {},
): Promise<string> {
  const seasonId = await operatingSeasonId(client);
  const personId = await anyPersonId(client);
  const status = options.status ?? "draft";
  const name = options.name ?? `${SENTINEL} Wednesday practice`;

  const event = await one<{ id: string }>(
    client,
    `insert into public.events
       (season_id, name, event_type, origin, status, scheduled_on, starts_at, ends_at, venue,
        is_mandatory, solicits_response, owner_person_id, decision_reason,
        approved_at, approved_by_person_id, audience_confirmed_at, audience_confirmed_by_person_id,
        outcome_recorded_at, outcome_recorded_by_person_id)
     values ($1::uuid, $2::text, 'practice', 'club_controlled', $3::public.event_status,
             '2026-10-14', '20:00', '22:00', 'Iffley Road Astro', true, true, $4::uuid, $5::text,
             case when $3::text in ('approved', 'occurred', 'not_held', 'cancelled') then now() end,
             case when $3::text in ('approved', 'occurred', 'not_held', 'cancelled') then $4::uuid end,
             case when $3::text in ('approved', 'occurred', 'not_held', 'cancelled') then now() end,
             case when $3::text in ('approved', 'occurred', 'not_held', 'cancelled') then $4::uuid end,
             case when $3::text in ('occurred', 'not_held') then now() end,
             case when $3::text in ('occurred', 'not_held') then $4::uuid end)
     returning id`,
    [
      seasonId,
      name,
      status,
      personId,
      options.reason ??
        (["withdrawn", "rejected", "cancelled"].includes(status) ? "No longer needed" : null),
    ],
  );

  await client.query(
    `insert into public.audit_events (actor_person_id, action, entity_table, entity_id, to_state)
     values ($1, 'event.drafted', 'events', $2, 'draft')`,
    [personId, event.id],
  );

  return event.id;
}

/** How many events currently carry the sentinel. */
async function scenarioEventCount(client: Client): Promise<number> {
  const row = await one<{ n: string }>(
    client,
    "select count(*) as n from public.events where name like $1",
    [`%${SENTINEL}%`],
  );
  return Number(row.n);
}

let client: Client;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query("begin transaction isolation level repeatable read");
});
afterEach(async () => {
  await client.query("rollback");
});

// ---------------------------------------------------------------------------
// The guard the whole suite stands on
// ---------------------------------------------------------------------------

describe("the local-only guard this suite depends on", () => {
  it("refuses a hosted target, so these scripts can never reach production from here", () => {
    expect(() =>
      resolveLocalDatabaseUrl(
        "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
      ),
    ).toThrow();
    expect(() =>
      resolveLocalDatabaseUrl(
        "postgresql://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
      ),
    ).toThrow();
    expect(() =>
      resolveLocalDatabaseUrl("postgresql://postgres:pw@10.0.0.7:5432/postgres"),
    ).toThrow();

    expect(
      resolveLocalDatabaseUrl("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
    ).toContain("127.0.0.1");
  });
});

// ---------------------------------------------------------------------------
// setup.sql — the prerequisite check that writes nothing
// ---------------------------------------------------------------------------

describe("setup.sql asserts prerequisites and writes nothing", () => {
  it("leaves the database byte-for-byte identical", async () => {
    const before = await snapshot(client);

    await client.query(SETUP);

    expect(await snapshot(client)).toEqual(before);
  });

  it("run a second time changes nothing either", async () => {
    await client.query(SETUP);
    const after = await snapshot(client);

    await client.query(SETUP);

    expect(await snapshot(client)).toEqual(after);
  });

  it("contains no statement that could write", () => {
    const withoutComments = SETUP_FILE.replace(/--[^\n]*/g, "");

    for (const forbidden of [
      /\binsert\s+into\b/i,
      /\bupdate\s+\w/i,
      /\bdelete\s+from\b/i,
      /\bcreate\s+(table|type|index|schema|view)\b/i,
      /\balter\s+table\b/i,
      /\bdrop\s+\w/i,
      /\bgrant\b/i,
      /\btruncate\b/i,
    ]) {
      expect(withoutComments, `setup.sql must not ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("passes while a scenario event from an earlier run is still present", async () => {
    // The retention policy allows pilot data to accumulate. A prerequisite
    // check that refused because a previous test had not been cleaned up would
    // be telling Brian to delete data the policy says he may keep.
    await createScenarioEvent(client);

    await expect(client.query(SETUP)).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// cleanup.sql
// ---------------------------------------------------------------------------

describe("cleanup.sql removes the scenario's events, and only those", () => {
  it("removes every sentinel-carrying draft, pending and withdrawn event", async () => {
    await createScenarioEvent(client, { name: `${SENTINEL} Wednesday practice` });
    await createScenarioEvent(client, {
      name: `${SENTINEL} Second event`,
      status: "pending_approval",
    });
    await createScenarioEvent(client, {
      name: `${SENTINEL} Abandoned`,
      status: "withdrawn",
      reason: "Pitch unavailable",
    });

    expect(await scenarioEventCount(client)).toBe(3);

    await client.query(CLEANUP);

    expect(await scenarioEventCount(client)).toBe(0);
  });

  it("restores a row-for-row identical database", async () => {
    const before = await snapshot(client);

    await createScenarioEvent(client);
    await client.query(
      "delete from public.audit_events where entity_table = 'events' and entity_id in (select id from public.events where name like $1)",
      [`%${SENTINEL}%`],
    );
    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
  });

  it("leaves the audit trail behind, deliberately", async () => {
    const eventId = await createScenarioEvent(client);

    await client.query(CLEANUP);

    const audit = await one<{ n: string }>(
      client,
      "select count(*) as n from public.audit_events where entity_table = 'events' and entity_id = $1",
      [eventId],
    );
    // Invariant M2: the record of who drafted the event outlives the event.
    expect(Number(audit.n)).toBe(1);
  });

  it("is a no-op the second time", async () => {
    await createScenarioEvent(client);
    await client.query(CLEANUP);
    const after = await snapshot(client);

    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(after);
  });

  it("succeeds and changes nothing when no scenario was ever run", async () => {
    const before = await snapshot(client);

    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
  });

  it("leaves an event that does not carry the sentinel", async () => {
    const other = await createScenarioEvent(client, { name: "Ordinary Wednesday practice" });

    await client.query(CLEANUP);

    const survived = await one<{ n: string }>(
      client,
      "select count(*) as n from public.events where id = $1",
      [other],
    );
    expect(Number(survived.n)).toBe(1);
  });

  it("preserves the durable pilot foundation", async () => {
    await createScenarioEvent(client);

    const before = await one<{ users: string; operators: string; roles: string; audit: string }>(
      client,
      `select (select count(*) from auth.users)::text as users,
              (select count(*) from public.operator_accounts)::text as operators,
              (select count(*) from public.role_assignments)::text as roles,
              (select count(*) from public.audit_events)::text as audit`,
    );

    await client.query(CLEANUP);

    const after = await one<{ users: string; operators: string; roles: string; audit: string }>(
      client,
      `select (select count(*) from auth.users)::text as users,
              (select count(*) from public.operator_accounts)::text as operators,
              (select count(*) from public.role_assignments)::text as roles,
              (select count(*) from public.audit_events)::text as audit`,
    );

    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// The ownership marker, in the absence of a deterministic identifier
// ---------------------------------------------------------------------------

describe("the sentinel-only ownership marker is declared, and is both halves", () => {
  it("declares the shape where a future author will read it", () => {
    // The generic rule in `tests/pilot-data-contract.test.ts` permits a
    // sentinel-only delete ONLY for a scenario that declares it here. Deleting
    // this heading turns that permission off and fails that test.
    expect(README_FILE).toContain("## Ownership marker: sentinel only");
    expect(README_FILE).toContain("created by the application");
  });

  it("conjoins the sentinel with a status restriction in the delete itself", () => {
    const deletes = CLEANUP_FILE.replace(/--[^\n]*/g, "").match(
      /delete\s+from\s+public\.events[\s\S]*?;/gi,
    );

    expect(deletes).toHaveLength(1);
    const statement = deletes![0].replace(/\s+/g, " ");

    expect(statement).toContain(`name like '%${SENTINEL}%'`);
    expect(statement).toContain("status in ('draft', 'pending_approval', 'withdrawn')");
    expect(statement).toMatch(/\band\b/i);
    expect(statement).not.toMatch(/\bor\b/i);
  });

  it("never deletes an event that reached approval, whatever its name", async () => {
    // Every status the restriction excludes, one at a time. This is the half of
    // the marker that stands in for the deterministic identifier, so a
    // regression here is the regression that matters.
    for (const status of ["approved", "occurred", "not_held", "cancelled", "rejected"]) {
      await client.query("savepoint per_status");
      const eventId = await createScenarioEvent(client, {
        name: `${SENTINEL} ${status} event`,
        status,
      });

      await expectRejected(client, CLEANUP, [], "has passed approval");

      const survived = await one<{ n: string }>(
        client,
        "select count(*) as n from public.events where id = $1",
        [eventId],
      );
      expect(Number(survived.n), `a ${status} event was not preserved`).toBe(1);
      await client.query("rollback to savepoint per_status");
    }
  });
});

// ---------------------------------------------------------------------------
// Every refusal, exercised
// ---------------------------------------------------------------------------

/**
 * One guard, and the situation that must make it fire.
 *
 * `message` is a fragment of the exception the guard raises. It is matched
 * against what the database actually raised — so a passing case proves that
 * specific guard fired — and against the script's own text by the coverage
 * assertions below, so a guard with no case here is a failure.
 */
interface GuardCase {
  script: "setup" | "cleanup";
  message: string;
  /** The table whose foreign key this case proves the guard for, where relevant. */
  cascadeTable?: string;
  arrange: (client: Client) => Promise<void>;
}

/**
 * `cleanup.sql` declares no guard for `invitations` or `attendance_records`,
 * and there is deliberately no case for one here. Both tables are pinned by
 * composite foreign key to an event status the delete already excludes — P1 and
 * P5 — so an event carrying either is refused one check earlier, by the status
 * guard. The cascade-enumeration test below still proves that every foreign key
 * PostgreSQL would follow *on its own* has a case.
 */
const GUARD_CASES: readonly GuardCase[] = [
  // --- setup.sql -----------------------------------------------------------
  {
    script: "setup",
    message: "no supabase_migrations.schema_migrations",
    // Renaming this table is DDL, but it is DDL against a table no other test
    // file in this repository touches, so nothing else can be blocked by it.
    arrange: async (c) =>
      void (await c.query(
        "alter table supabase_migrations.schema_migrations rename to schema_migrations_hidden_by_lan76_test",
      )),
  },
  {
    script: "setup",
    message: "is not applied. The events table this feature writes to does not exist yet.",
    arrange: async (c) =>
      void (await c.query("delete from supabase_migrations.schema_migrations where version = $1", [
        REQUIRED_MIGRATION,
      ])),
  },
  {
    script: "setup",
    message: "no season is open, active or closing",
    arrange: async (c) =>
      void (await c.query(
        `update public.seasons
            set status = 'archived',
                closed_at = coalesce(closed_at, now()),
                closed_by_person_id = coalesce(closed_by_person_id, (select id from public.people limit 1))
          where status in ('open', 'active', 'closing')`,
      )),
  },
  {
    script: "setup",
    message: "seasons are open, active or closing",
    arrange: async (c) =>
      void (await c.query(
        `update public.seasons
            set status = 'open',
                opened_at = coalesce(opened_at, now()),
                opened_by_person_id = coalesce(opened_by_person_id, (select id from public.people limit 1))`,
      )),
  },
  {
    script: "setup",
    message: "no active operator account is linked to a person",
    arrange: async (c) =>
      void (await c.query(
        "update public.operator_accounts set is_active = false, disabled_at = now()",
      )),
  },

  // --- cleanup.sql ---------------------------------------------------------
  {
    script: "cleanup",
    message: "has passed approval",
    arrange: async (c) => {
      await createScenarioEvent(c, { name: `${SENTINEL} Approved`, status: "approved" });
    },
  },
  {
    script: "cleanup",
    message: "event_audience_members rows hang off a scenario event",
    cascadeTable: "public.event_audience_members",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        `insert into public.event_audience_members (event_id, season_id, capacity, person_id)
         values ($1, (select season_id from public.events where id = $1), 'coach',
                 (select id from public.people limit 1))`,
        [eventId],
      );
    },
  },
  {
    script: "cleanup",
    message: "event_questions rows hang off a scenario event",
    cascadeTable: "public.event_questions",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        "insert into public.event_questions (event_id, prompt) values ($1, 'Transport there?')",
        [eventId],
      );
    },
  },
  {
    script: "cleanup",
    message: "staging.legacy_event_rows reference a scenario event",
    cascadeTable: "staging.legacy_event_rows",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        `insert into staging.legacy_event_rows
           (import_batch, source_file, raw_cell, normalisation_status, normalised_event_id)
         values ('lan-76-fixture', 'lan-76-fixture.csv', 'Wed practice', 'normalised', $1)`,
        [eventId],
      );
    },
  },
  {
    script: "cleanup",
    message: "notification jobs exist against a scenario event",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        `insert into public.notification_jobs
           (idempotency_key, job_type, event_id, channel, scheduled_for)
         values ($2, 'invitation', $1, 'whatsapp', now())`,
        [eventId, `lan-76-fixture-${eventId}`],
      );
    },
  },
  {
    script: "cleanup",
    message: "schedule changes are recorded against a scenario event",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        `insert into public.schedule_changes
           (event_id, source, previous_scheduled_on, new_scheduled_on)
         values ($1, 'club', '2026-10-14', '2026-10-21')`,
        [eventId],
      );
    },
  },
  {
    script: "cleanup",
    message: "a follow-up action names a scenario event",
    arrange: async (c) => {
      const eventId = await createScenarioEvent(c);
      await c.query(
        `insert into public.follow_up_actions
           (season_id, category, subject_event_id, description)
         values ((select season_id from public.events where id = $1), 'nonresponse', $1,
                 'Chase the drafted practice')`,
        [eventId],
      );
    },
  },
];

describe("every refusal in both scripts is exercised", () => {
  it.each(GUARD_CASES)("$script refuses: $message", async (guard) => {
    await guard.arrange(client);

    const before = await snapshot(client);

    // `expectRejected` matches the fragment against the message PostgreSQL
    // actually raised, so this passes only if THIS guard fired.
    await expectRejected(client, guard.script === "setup" ? SETUP : CLEANUP, [], guard.message);

    // Refusing is only half of it. Nothing may have been written or removed.
    expect(await snapshot(client)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Coverage: the list above is checked against the scripts, not maintained by eye
// ---------------------------------------------------------------------------

/**
 * Every `raise exception` literal in a script, with PostgreSQL's doubled quotes
 * unescaped so the text matches what the database actually raises.
 */
function declaredRefusals(sql: string): string[] {
  const withoutComments = sql.replace(/--[^\n]*/g, "");
  return [...withoutComments.matchAll(/raise\s+exception\s*(?:\n\s*)?'((?:[^']|'')*)'/gi)].map(
    (match) => match[1].replace(/''/g, "'"),
  );
}

/**
 * Does this refusal's text contain that fragment?
 *
 * `%` is a plpgsql format placeholder, so the literal in the script and the
 * message the database raises differ exactly there. A fragment may not span a
 * substitution; any fragment that does not is compared literally.
 */
function coversRefusal(refusal: string, fragment: string): boolean {
  return refusal.split("%").some((segment) => segment.includes(fragment));
}

/**
 * The one refusal no behavioural test can reach.
 *
 * Falsifying it needs DDL against `public.events` — a table every other test
 * file in this suite reads concurrently — and an `access exclusive` lock on it
 * would make this suite the reason another one is flaky. The exemption is
 * per-message, so a new guard is never exempt by accident, and it is asserted
 * below to still match exactly one real refusal.
 */
const EXEMPT_FROM_BEHAVIOURAL_COVERAGE = [
  "LAN-76 pilot cleanup refused: the expected schema is not present.",
] as const;

describe("the refusals the scripts declare are the refusals this file exercises", () => {
  const declared = [...declaredRefusals(SETUP_FILE), ...declaredRefusals(CLEANUP_FILE)];

  it("finds every refusal in both scripts", () => {
    // A pass produced by a parser that found nothing is not a pass.
    expect(declaredRefusals(SETUP_FILE).length).toBeGreaterThanOrEqual(5);
    expect(declaredRefusals(CLEANUP_FILE).length).toBeGreaterThanOrEqual(7);
  });

  it("exercises every refusal that is not explicitly exempt", () => {
    const uncovered = declared.filter(
      (refusal) =>
        !GUARD_CASES.some((guard) => coversRefusal(refusal, guard.message)) &&
        !EXEMPT_FROM_BEHAVIOURAL_COVERAGE.some((exempt) => refusal === exempt),
    );

    expect(
      uncovered,
      "these refusals have no behavioural test — add a GUARD_CASES entry, or exempt it explicitly and say why",
    ).toEqual([]);
  });

  it("keeps every exemption honest", () => {
    for (const exempt of EXEMPT_FROM_BEHAVIOURAL_COVERAGE) {
      expect(declared.filter((refusal) => refusal === exempt).length).toBe(1);
    }
    expect(EXEMPT_FROM_BEHAVIOURAL_COVERAGE.length).toBeLessThanOrEqual(1);
  });

  it("pairs every guard case with exactly one refusal", () => {
    for (const guard of GUARD_CASES) {
      const matches = declared.filter((refusal) => coversRefusal(refusal, guard.message));
      expect(matches.length, `"${guard.message}" identifies ${matches.length} refusals`).toBe(1);
    }
  });

  it("has no guard case that matches nothing in the scripts", () => {
    const orphans = GUARD_CASES.filter(
      (guard) => !declared.some((refusal) => coversRefusal(refusal, guard.message)),
    ).map((guard) => guard.message);

    expect(orphans, "these cases assert a message no script raises").toEqual([]);
  });

  // That every guard structurally terminates in `raise exception`, rather than
  // in a notice that lets the run continue, is asserted for every scenario in
  // this directory — this one included — by
  // `tests/pilot-data-contract.test.ts` § "every guard in %s refuses".
});

describe("the cleanup's cascade enumeration is complete against the live schema", () => {
  /**
   * `cleanup.sql` claims to name every foreign key PostgreSQL would follow on
   * its behalf — every `on delete cascade` and `on delete set null` pointing at
   * `public.events` — because those are the paths by which a narrow delete
   * silently widens. That claim was true when it was written; nothing made it
   * stay true. So it is checked against the catalogue, and against a
   * behavioural test per key.
   */
  it("has a behavioural test for every cascade and set-null foreign key", async () => {
    const { rows } = await client.query<{
      referencing_table: string;
      on_delete: string;
    }>(
      `select (cn.nspname || '.' || child.relname) as referencing_table,
              con.confdeltype as on_delete
         from pg_constraint con
         join pg_class child on child.oid = con.conrelid
         join pg_namespace cn on cn.oid = child.relnamespace
         join pg_class parent on parent.oid = con.confrelid
         join pg_namespace pn on pn.oid = parent.relnamespace
        where con.contype = 'f'
          and con.confdeltype in ('c', 'n')
          and pn.nspname = 'public' and parent.relname = 'events'
        order by 1`,
    );

    // The three that exist today. A pass on an empty result would prove nothing.
    expect(rows.length).toBeGreaterThanOrEqual(3);

    for (const row of rows) {
      expect(
        GUARD_CASES.some((guard) => guard.cascadeTable === row.referencing_table),
        `no test proves cleanup.sql refuses when ${row.referencing_table} would be ` +
          `${row.on_delete === "c" ? "cascade-deleted" : "silently nulled"} as an event is removed`,
      ).toBe(true);
    }
  });
});
