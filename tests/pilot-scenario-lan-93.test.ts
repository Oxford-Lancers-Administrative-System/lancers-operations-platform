// @vitest-environment node
/**
 * The LAN-93 pilot-data worked example, proved against a real database.
 *
 * `scripts/pilot/lan-93/setup.sql` and `cleanup.sql` are written to be run BY
 * HAND against the single hosted production project. There is no staging
 * environment to catch a mistake in them, so the properties that make them safe
 * — repeatable setup, cleanup narrow enough to remove only its own rows,
 * cleanup that is a no-op the second time, and a durable pilot foundation that
 * survives all of it — are asserted here rather than asserted in prose.
 *
 * **Every refusal both scripts contain is exercised here, and the list is
 * checked against the scripts rather than maintained by hand.** That is the
 * point of `GUARD_CASES` and the coverage assertion at the foot of this file: a
 * preflight that is deleted, commented out, inverted, made unreachable or
 * quietly downgraded to a `raise notice` fails a test, because something
 * actually attempts the thing it is supposed to refuse. Two guards are
 * exempt — named, justified and asserted to still exist — because falsifying
 * them needs DDL against tables every other test file shares.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string. Running the scripts here as verification
 * is not the "no automatic execution" prohibition being bent — nothing applies
 * them to a real target without a human. `tests/pilot-data-contract.test.ts`
 * asserts that no migration, seed, workflow, container or application path
 * references `scripts/pilot/` at all.
 *
 * Every test runs inside one REPEATABLE READ transaction that is rolled back.
 * Repeatable read matters twice over: the whole-database snapshots below must
 * not see rows another test file commits while this one is running, and nothing
 * this file does may outlive it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import { expectRejected, one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-93");

/** The scenario's deterministic identifiers, as the scripts define them. */
const ID = {
  vocabulary: "00930093-0093-4093-8093-000000000001",
  position: "00930093-0093-4093-8093-000000000002",
  season: "00930093-0093-4093-8093-000000000003",
  person: "00930093-0093-4093-8093-000000000004",
  membership: "00930093-0093-4093-8093-000000000005",
  event: "00930093-0093-4093-8093-000000000006",
} as const;

/** Which table each identifier lives in, in dependency order. */
const SCENARIO_ROWS: readonly (readonly [table: string, id: string])[] = [
  ["public.position_vocabularies", ID.vocabulary],
  ["public.positions", ID.position],
  ["public.seasons", ID.season],
  ["public.people", ID.person],
  ["public.season_memberships", ID.membership],
  ["public.events", ID.event],
];

/** The migration version both scripts require to be applied. */
const REQUIRED_MIGRATION = "20260811090000";

const SETUP_FILE = readFileSync(path.join(scenarioDir, "setup.sql"), "utf8");
const CLEANUP_FILE = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");

/**
 * Reads a pilot script and returns its body with the outer transaction removed.
 *
 * The scripts must be transactional — that is one of the safety properties, and
 * it is asserted here rather than assumed. They are then executed inside this
 * file's own transaction, because a `commit` in a test would leave rows in a
 * database shared with every other test file and every other agent.
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

/** How many of the scenario's six rows are currently present. */
async function scenarioRowCount(client: Client): Promise<number> {
  let found = 0;
  for (const [table, id] of SCENARIO_ROWS) {
    const row = await one<{ n: string }>(
      client,
      `select count(*) as n from ${table} where id = $1`,
      [id],
    );
    found += Number(row.n);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Spare rows, for arranging a guard's precondition
// ---------------------------------------------------------------------------
// Deliberately NOT carrying the scenario's sentinel or identifiers: these stand
// in for somebody else's data, which is the thing every guard exists to protect.

async function spareVocabulary(client: Client, code: string, id?: string): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.position_vocabularies (id, code, label, adopted_on)
     values (coalesce($1::uuid, gen_random_uuid()), $2, 'Somebody else vocabulary', '2020-01-01')
     returning id`,
    [id ?? null, code],
  );
  return row.id;
}

async function spareSeason(
  client: Client,
  label: string,
  vocabularyId: string,
  id?: string,
): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.seasons (id, label, status, position_vocabulary_id)
     values (coalesce($1::uuid, gen_random_uuid()), $2, 'planning', $3)
     returning id`,
    [id ?? null, label, vocabularyId],
  );
  return row.id;
}

async function sparePerson(client: Client, tag: string): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    "insert into public.people (given_name, family_name) values ('Somebody', $1) returning id",
    [tag],
  );
  return row.id;
}

/**
 * The durable pilot foundation, as it exists on the hosted project: an Auth
 * user, the Person it resolves to, the operator link, a time-bounded
 * role assignment, and an audit row naming that Person as an actor.
 *
 * Created before any scenario runs, so "cleanup preserves the foundation" has
 * something real to be true about. Nothing here is created by a pilot scenario
 * script, and nothing here may be removed by one.
 */
interface Durable {
  authUserId: string;
  personId: string;
  operatorAccountId: string;
  roleId: string;
  roleAssignmentId: string;
  auditEventId: string;
  committeeYearId: string;
}

async function createDurableFoundation(client: Client): Promise<Durable> {
  const user = await one<{ id: string }>(
    client,
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    ["pilot-foundation-fixture@oxfordlancers.local"],
  );
  const person = await one<{ id: string }>(
    client,
    `insert into public.people (given_name, family_name, known_as)
     values ('Durable', 'Foundation', 'PILOT-FOUNDATION-FIXTURE') returning id`,
  );
  const operator = await one<{ id: string }>(
    client,
    "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2) returning id",
    [user.id, person.id],
  );

  // A committee year of its own, in a window no seed row and no other fixture
  // occupies — `committee_years_do_not_overlap` is a global exclusion
  // constraint, and two fixtures fighting over it would be a flaky test.
  const committeeYear = await one<{ id: string }>(
    client,
    `insert into public.committee_years (label, agm_held_on, starts_on, ends_on)
     values ('pilot-fixture-2011-12', '2011-06-01', '2011-06-01', '2012-06-01') returning id`,
  );

  // A role of its own rather than the seeded `it_officer`: `public.roles` is
  // populated by the local-only seed, so depending on it would tie this test to
  // reference data the hosted project does not have.
  const role = await one<{ id: string; scope: string; is_constitutional_office: boolean }>(
    client,
    `insert into public.roles (code, name, scope, is_constitutional_office)
     values ('pilot_fixture_it_officer', 'Pilot fixture IT Officer', 'committee_year', false)
     on conflict (code) do update set name = excluded.name
     returning id, scope, is_constitutional_office`,
  );

  // Time-bounded on purpose: the runbook's provisioning template grants
  // elevated builder access with `effective_to` set at grant time, never
  // open-ended, and never as a constitutional office.
  const assignment = await one<{ id: string }>(
    client,
    `insert into public.role_assignments (
       person_id, role_id, scope, is_constitutional_office,
       committee_year_id, effective_from, effective_to)
     values ($1, $2, $3, $4, $5, '2011-06-01', '2011-12-01') returning id`,
    [person.id, role.id, role.scope, role.is_constitutional_office, committeeYear.id],
  );

  const audit = await one<{ id: string }>(
    client,
    `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
     values ($1, 'pilot.foundation.provisioned', 'operator_accounts', $2) returning id`,
    [person.id, operator.id],
  );

  return {
    authUserId: user.id,
    personId: person.id,
    operatorAccountId: operator.id,
    roleId: role.id,
    roleAssignmentId: assignment.id,
    auditEventId: audit.id,
    committeeYearId: committeeYear.id,
  };
}

/** Every durable row, serialised, so "unmodified" can be compared literally. */
async function durableState(client: Client, durable: Durable): Promise<Record<string, unknown>> {
  const read = async (table: string, id: string) => {
    const row = await one<{ state: unknown }>(
      client,
      `select to_jsonb(t) as state from ${table} t where id = $1`,
      [id],
    );
    return row?.state ?? null;
  };

  return {
    authUser: await read("auth.users", durable.authUserId),
    person: await read("public.people", durable.personId),
    operatorAccount: await read("public.operator_accounts", durable.operatorAccountId),
    roleAssignment: await read("public.role_assignments", durable.roleAssignmentId),
    auditEvent: await read("public.audit_events", durable.auditEventId),
  };
}

let client: Client;
let durable: Durable;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});

beforeEach(async () => {
  await client.query("begin transaction isolation level repeatable read");
  durable = await createDurableFoundation(client);
});
afterEach(async () => {
  await client.query("rollback");
});

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

describe("setup.sql is repeatable", () => {
  it("creates exactly the six rows it documents", async () => {
    await client.query(SETUP);

    expect(await scenarioRowCount(client)).toBe(6);

    const person = await one<{ given_name: string; known_as: string }>(
      client,
      "select given_name, known_as from public.people where id = $1",
      [ID.person],
    );
    expect(person.known_as).toBe("PILOT-LAN-93");

    const season = await one<{ label: string; status: string }>(
      client,
      "select label, status from public.seasons where id = $1",
      [ID.season],
    );
    expect(season.status).toBe("planning");

    const event = await one<{ name: string; status: string }>(
      client,
      "select name, status from public.events where id = $1",
      [ID.event],
    );
    expect(event.status).toBe("draft");
  });

  it("creates no auth user, operator account, role assignment or audit row", async () => {
    const authUsersBefore = await one<{ n: string }>(
      client,
      "select count(*) as n from auth.users",
    );
    const before = await snapshot(client);

    await client.query(SETUP);

    const after = await snapshot(client);
    for (const table of [
      "public.operator_accounts",
      "public.role_assignments",
      "public.audit_events",
      "public.roles",
      "public.contact_points",
      "public.person_aliases",
    ]) {
      expect(after[table], `${table} must be untouched by setup`).toBe(before[table]);
    }

    const authUsersAfter = await one<{ n: string }>(client, "select count(*) as n from auth.users");
    expect(authUsersAfter.n).toBe(authUsersBefore.n);
  });

  it("run a second time changes nothing at all", async () => {
    await client.query(SETUP);
    const afterFirst = await snapshot(client);

    await client.query(SETUP);
    const afterSecond = await snapshot(client);

    // Whole-row hashes, so this fails on a duplicated row AND on a row the
    // second run quietly rewrote — `on conflict do nothing`, never `do update`.
    expect(afterSecond).toEqual(afterFirst);
    expect(await scenarioRowCount(client)).toBe(6);
  });

  it("does not rewrite a row that is already there", async () => {
    await client.query(SETUP);

    // A whole-snapshot comparison cannot see a `do update set x = now()`,
    // because `now()` is the transaction's clock and does not move. Changing a
    // value by hand and watching it survive can: `on conflict do nothing` must
    // leave it alone, `on conflict do update` would overwrite it.
    await client.query("update public.people set given_name = 'Edited by hand' where id = $1", [
      ID.person,
    ]);
    await client.query("update public.events set venue = 'Edited by hand' where id = $1", [
      ID.event,
    ]);

    await client.query(SETUP);

    const person = await one<{ given_name: string }>(
      client,
      "select given_name from public.people where id = $1",
      [ID.person],
    );
    const event = await one<{ venue: string | null }>(
      client,
      "select venue from public.events where id = $1",
      [ID.event],
    );
    expect(person.given_name).toBe("Edited by hand");
    expect(event.venue).toBe("Edited by hand");
  });

  it("restores a row that was removed by hand between runs", async () => {
    await client.query(SETUP);
    await client.query("delete from public.events where id = $1", [ID.event]);
    expect(await scenarioRowCount(client)).toBe(5);

    await client.query(SETUP);
    expect(await scenarioRowCount(client)).toBe(6);
  });
});

describe("cleanup.sql removes only what its paired setup created", () => {
  it("restores the exact pre-setup state of every table", async () => {
    const before = await snapshot(client);

    await client.query(SETUP);
    expect(await snapshot(client)).not.toEqual(before);

    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(before);
  });

  it("is a no-op the second time", async () => {
    await client.query(SETUP);
    await client.query(CLEANUP);
    const afterFirst = await snapshot(client);

    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(afterFirst);
  });

  it("succeeds and changes nothing when the scenario was never set up", async () => {
    const before = await snapshot(client);
    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(before);
  });

  it("fails closed on a dependency its preflight does not anticipate", async () => {
    await client.query(SETUP);
    // `schedule_changes.event_id` is `on delete restrict` and is deliberately
    // NOT one of the cases the preflight names. The delete must fail and take
    // the whole transaction with it — never cascade, never half-remove.
    await client.query(
      `insert into public.schedule_changes (event_id, source, new_venue)
       values ($1, 'club', 'Somewhere')`,
      [ID.event],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /schedule_changes/);

    expect(await snapshot(client)).toEqual(before);
    expect(await scenarioRowCount(client)).toBe(6);
  });
});

describe("cleanup.sql preserves the durable pilot foundation", () => {
  it("leaves the auth user, person, operator link, role assignment and audit row unmodified", async () => {
    const before = await durableState(client, durable);

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await durableState(client, durable)).toEqual(before);

    // And none of them is merely present-but-neutered.
    const operator = await one<{ is_active: boolean }>(
      client,
      "select is_active from public.operator_accounts where id = $1",
      [durable.operatorAccountId],
    );
    expect(operator.is_active).toBe(true);

    const assignment = await one<{ effective_to: Date | null }>(
      client,
      "select effective_to from public.role_assignments where id = $1",
      [durable.roleAssignmentId],
    );
    expect(assignment.effective_to).not.toBeNull();
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
 * specific guard fired, not merely that something went wrong — and it is
 * matched against the script's own text by the coverage assertion at the foot
 * of this file, so a guard with no case here is a failure.
 */
interface GuardCase {
  script: "setup" | "cleanup";
  message: string;
  /** Runs `setup.sql` before arranging. Most cleanup guards need the scenario present. */
  afterSetup?: boolean;
  /** The table whose foreign key this case proves the guard for, where relevant. */
  cascadeTable?: string;
  arrange: (client: Client, durable: Durable) => Promise<void>;
}

const GUARD_CASES: readonly GuardCase[] = [
  // --- setup.sql -----------------------------------------------------------
  {
    script: "setup",
    message: "no supabase_migrations.schema_migrations",
    // Renaming this table is DDL, but it is DDL against a table no other test
    // file in this repository touches, so nothing else can be blocked by it.
    arrange: async (c) =>
      void (await c.query(
        "alter table supabase_migrations.schema_migrations rename to schema_migrations_hidden_by_test",
      )),
  },
  {
    script: "setup",
    message: "is not applied. Apply the merged migrations first",
    arrange: async (c) =>
      void (await c.query("delete from supabase_migrations.schema_migrations where version = $1", [
        REQUIRED_MIGRATION,
      ])),
  },
  {
    script: "setup",
    message: "position_vocabularies …0001 exists and is not this scenario",
    arrange: async (c) => void (await spareVocabulary(c, "not-the-pilot-code", ID.vocabulary)),
  },
  {
    script: "setup",
    message: "positions …0002 exists and is not this scenario",
    arrange: async (c) => {
      const vocabulary = await spareVocabulary(c, "spare-for-position");
      await c.query(
        `insert into public.positions (id, vocabulary_id, code, label, side)
         values ($1, $2, 'ZZ', 'Somebody else position', 'defence')`,
        [ID.position, vocabulary],
      );
    },
  },
  {
    script: "setup",
    message: "seasons …0003 exists and is not this scenario",
    arrange: async (c) => {
      const vocabulary = await spareVocabulary(c, "spare-for-season");
      await spareSeason(c, "SOMEBODY ELSE 2029-30", vocabulary, ID.season);
    },
  },
  {
    script: "setup",
    message: "people …0004 exists and is not this scenario",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.people (id, given_name, family_name) values ($1, 'Someone', 'Else')",
        [ID.person],
      )),
  },
  {
    script: "setup",
    message: "season_memberships …0005 exists and is not this scenario",
    arrange: async (c) => {
      const vocabulary = await spareVocabulary(c, "spare-for-membership");
      const season = await spareSeason(c, "SOMEBODY ELSE membership season", vocabulary);
      const person = await sparePerson(c, "Membership");
      await c.query(
        `insert into public.season_memberships (id, person_id, season_id, status, entry)
         values ($1, $2, $3, 'confirmed', 'new')`,
        [ID.membership, person, season],
      );
    },
  },
  {
    script: "setup",
    message: "events …0006 exists and is not this scenario",
    arrange: async (c) => {
      const vocabulary = await spareVocabulary(c, "spare-for-event");
      const season = await spareSeason(c, "SOMEBODY ELSE event season", vocabulary);
      await c.query(
        `insert into public.events (id, season_id, name, event_type, status)
         values ($1, $2, 'Somebody else event', 'practice', 'draft')`,
        [ID.event, season],
      );
    },
  },
  {
    script: "setup",
    message: "another position_vocabularies row already uses code pilot-lan-93",
    arrange: async (c) => void (await spareVocabulary(c, "pilot-lan-93")),
  },
  {
    script: "setup",
    message: "another seasons row already uses the label PILOT-LAN-93 scenario season",
    arrange: async (c) => {
      const vocabulary = await spareVocabulary(c, "spare-for-label-clash");
      await spareSeason(c, "PILOT-LAN-93 scenario season", vocabulary);
    },
  },
  {
    script: "setup",
    message: "already holds a different membership in the scenario season",
    arrange: async (c) => {
      // Everything the earlier guards check is arranged to pass, so this one is
      // the guard under test rather than the first one to trip.
      await c.query(
        `insert into public.position_vocabularies (id, code, label, adopted_on)
         values ($1, 'pilot-lan-93', 'PILOT-LAN-93 scenario vocabulary', '2026-08-11')`,
        [ID.vocabulary],
      );
      await c.query(
        `insert into public.seasons (id, label, status, position_vocabulary_id)
         values ($1, 'PILOT-LAN-93 scenario season', 'planning', $2)`,
        [ID.season, ID.vocabulary],
      );
      await c.query(
        `insert into public.people (id, given_name, family_name, known_as)
         values ($1, 'Pilot', 'Scenario', 'PILOT-LAN-93')`,
        [ID.person],
      );
      await c.query(
        `insert into public.season_memberships (person_id, season_id, status, entry)
         values ($1, $2, 'confirmed', 'new')`,
        [ID.person, ID.season],
      );
    },
  },

  // --- cleanup.sql: ownership ---------------------------------------------
  {
    script: "cleanup",
    message: "people …0004 does not carry the PILOT-LAN-93 sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query("update public.people set known_as = null where id = $1", [ID.person])),
  },
  {
    script: "cleanup",
    message: "events …0006 does not carry the PILOT-LAN-93 sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query("update public.events set name = 'Renamed by somebody' where id = $1", [
        ID.event,
      ])),
  },
  {
    script: "cleanup",
    message: "seasons …0003 does not carry the PILOT-LAN-93 sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query("update public.seasons set label = 'Renamed season' where id = $1", [
        ID.season,
      ])),
  },
  {
    script: "cleanup",
    message: "positions …0002 does not carry the PILOT-LAN-93 sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query("update public.positions set label = 'Renamed position' where id = $1", [
        ID.position,
      ])),
  },
  {
    script: "cleanup",
    message: "position_vocabularies …0001 does not carry the PILOT-LAN-93 sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        "update public.position_vocabularies set code = 'renamed-vocabulary' where id = $1",
        [ID.vocabulary],
      )),
  },
  {
    script: "cleanup",
    message: "season_memberships …0005 is not this scenario",
    afterSetup: true,
    arrange: async (c) => {
      const person = await sparePerson(c, "Reassigned");
      await c.query("update public.season_memberships set person_id = $1 where id = $2", [
        person,
        ID.membership,
      ]);
    },
  },

  // --- cleanup.sql: the durable foundation ---------------------------------
  {
    script: "cleanup",
    message: "linked to an operator account",
    afterSetup: true,
    arrange: async (c) => {
      const user = await one<{ id: string }>(
        c,
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        ["pilot-scenario-promoted@oxfordlancers.local"],
      );
      await c.query(
        "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
        [user.id, ID.person],
      );
    },
  },
  {
    script: "cleanup",
    message: "holds or granted a role assignment",
    afterSetup: true,
    arrange: async (c, d) =>
      void (await c.query(
        `insert into public.role_assignments (
           person_id, role_id, scope, is_constitutional_office,
           committee_year_id, effective_from, effective_to)
         values ($1, $2, 'committee_year', false, $3, '2011-06-01', '2011-12-01')`,
        [ID.person, d.roleId, d.committeeYearId],
      )),
  },
  {
    script: "cleanup",
    message: "is an actor in audit_events",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
         values ($1, 'something.happened', 'events', $2)`,
        [ID.person, ID.event],
      )),
  },

  // --- cleanup.sql: rows PostgreSQL would remove or alter unasked -----------
  // These five, plus the two below, are every `on delete cascade` and
  // `on delete set null` foreign key pointing at a scenario row. None of them
  // has a `restrict` backstop, so the preflight is the entire control.
  {
    script: "cleanup",
    message: "person_aliases rows hang off the scenario person",
    afterSetup: true,
    cascadeTable: "public.person_aliases",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.person_aliases (person_id, alias) values ($1, 'Somebody else alias')",
        [ID.person],
      )),
  },
  {
    script: "cleanup",
    message: "contact_points rows hang off the scenario person",
    afterSetup: true,
    cascadeTable: "public.contact_points",
    arrange: async (c) =>
      void (await c.query(
        `insert into public.contact_points (person_id, kind, raw_value)
         values ($1, 'email', 'somebody-else-placeholder')`,
        [ID.person],
      )),
  },
  {
    script: "cleanup",
    message: "event_questions rows hang off the scenario event",
    afterSetup: true,
    cascadeTable: "public.event_questions",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.event_questions (event_id, prompt) values ($1, 'Whose question is this?')",
        [ID.event],
      )),
  },
  {
    script: "cleanup",
    message: "event_audience_members rows hang off the scenario event",
    afterSetup: true,
    cascadeTable: "public.event_audience_members",
    arrange: async (c, d) =>
      void (await c.query(
        `insert into public.event_audience_members (event_id, season_id, capacity, person_id)
         values ($1, $2, 'guest', $3)`,
        [ID.event, ID.season, d.personId],
      )),
  },
  {
    script: "cleanup",
    message: "onboarding_item_types rows hang off the scenario season",
    afterSetup: true,
    cascadeTable: "public.onboarding_item_types",
    arrange: async (c) =>
      void (await c.query(
        `insert into public.onboarding_item_types (season_id, code, label)
         values ($1, 'somebody-else-item', 'Somebody else onboarding item')`,
        [ID.season],
      )),
  },
  {
    script: "cleanup",
    message: "staging.legacy_roster_rows reference the scenario person",
    afterSetup: true,
    cascadeTable: "staging.legacy_roster_rows",
    arrange: async (c) =>
      void (await c.query(
        `insert into staging.legacy_roster_rows (import_batch, normalisation_status, matched_person_id)
         values ('pilot-fixture-batch', 'normalised', $1)`,
        [ID.person],
      )),
  },
  {
    script: "cleanup",
    message: "staging.legacy_event_rows reference the scenario event",
    afterSetup: true,
    cascadeTable: "staging.legacy_event_rows",
    arrange: async (c) =>
      void (await c.query(
        `insert into staging.legacy_event_rows
           (import_batch, raw_cell, normalisation_status, normalised_event_id)
         values ('pilot-fixture-batch', 'Somebody else cell', 'normalised', $1)`,
        [ID.event],
      )),
  },

  // --- cleanup.sql: containment -------------------------------------------
  {
    script: "cleanup",
    message: "another event exists in the scenario season",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.events (season_id, name, event_type, status)
         values ($1, 'Somebody else event', 'practice', 'draft')`,
        [ID.season],
      )),
  },
  {
    script: "cleanup",
    message: "another season membership exists in the scenario season",
    afterSetup: true,
    arrange: async (c) => {
      const person = await sparePerson(c, "Extra member");
      await c.query(
        `insert into public.season_memberships (person_id, season_id, status, entry)
         values ($1, $2, 'confirmed', 'new')`,
        [person, ID.season],
      );
    },
  },
  {
    script: "cleanup",
    message: "another season uses the scenario position vocabulary",
    afterSetup: true,
    arrange: async (c) =>
      void (await spareSeason(c, "SOMEBODY ELSE sharing the vocabulary", ID.vocabulary)),
  },
  {
    script: "cleanup",
    message: "another position belongs to the scenario vocabulary",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.positions (vocabulary_id, code, label, side)
         values ($1, 'ZZ', 'Somebody else position', 'defence')`,
        [ID.vocabulary],
      )),
  },
];

describe("every refusal in both scripts is exercised", () => {
  it.each(GUARD_CASES)("$script refuses: $message", async (guard) => {
    if (guard.afterSetup) await client.query(SETUP);
    await guard.arrange(client, durable);

    const before = await snapshot(client);

    // `expectRejected` matches the fragment against the message PostgreSQL
    // actually raised, so this passes only if THIS guard fired — not if some
    // earlier one did, and not if the statement failed for an unrelated reason.
    await expectRejected(client, guard.script === "setup" ? SETUP : CLEANUP, [], guard.message);

    // Refusing is only half of it. Nothing may have been written or removed.
    expect(await snapshot(client)).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Coverage: the list above is checked against the scripts, not maintained by eye
// ---------------------------------------------------------------------------

/**
 * Every `raise exception` literal in a script, with PostgreSQL's doubled
 * quotes unescaped so the text matches what the database actually raises.
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
 * message the database raises differ exactly there. Matching per segment is the
 * general rule that follows: a fragment may not span a substitution, and any
 * fragment that does not is compared literally against both.
 */
function coversRefusal(refusal: string, fragment: string): boolean {
  return refusal.split("%").some((segment) => segment.includes(fragment));
}

/**
 * The two refusals no behavioural test can reach.
 *
 * Both are `to_regclass` checks that a required table exists. Falsifying either
 * needs DDL against `public.people`, `public.events` and the rest — tables every
 * other test file in this suite reads concurrently — and an `access exclusive`
 * lock on those would make this suite the reason another one is flaky. The
 * exemption is deliberately per-message rather than per-script, so a new guard
 * is never exempt by accident, and each entry is asserted below to still match
 * exactly one real refusal.
 */
const EXEMPT_FROM_BEHAVIOURAL_COVERAGE = [
  "LAN-93 pilot setup refused: missing table(s) %.",
  "LAN-93 pilot cleanup refused: the expected schema is not present.",
] as const;

describe("the refusals the scripts declare are the refusals this file exercises", () => {
  const declared = [...declaredRefusals(SETUP_FILE), ...declaredRefusals(CLEANUP_FILE)];

  it("finds every refusal in both scripts", () => {
    // A pass produced by a parser that found nothing is not a pass.
    expect(declared.length).toBeGreaterThanOrEqual(30);
    expect(declaredRefusals(SETUP_FILE).length).toBeGreaterThanOrEqual(10);
    expect(declaredRefusals(CLEANUP_FILE).length).toBeGreaterThanOrEqual(18);
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
      // A stale exemption is worse than none: it would silently excuse a guard
      // that no longer exists, or excuse nothing at all while looking careful.
      expect(declared.filter((refusal) => refusal === exempt).length).toBe(1);
    }
    expect(EXEMPT_FROM_BEHAVIOURAL_COVERAGE.length).toBeLessThanOrEqual(2);
  });

  it("pairs every guard case with exactly one refusal", () => {
    // A fragment that matched two refusals could pass while the guard it names
    // is gone, because some other guard raised something containing it.
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
});

describe("the cleanup's cascade enumeration is complete against the live schema", () => {
  /**
   * `cleanup.sql` claims to name every foreign key that PostgreSQL would follow
   * on its behalf — every `on delete cascade` and `on delete set null` pointing
   * at a row it deletes — because those are the paths by which a narrow delete
   * silently widens. That claim was true when it was written. Nothing made it
   * stay true: a later migration adding an eighth such key would degrade the
   * "refuses to widen" property to a cascade, in silence.
   *
   * So the claim is checked against the catalogue, and against a behavioural
   * test per key — not against the script's prose. Read-only: no DDL, nothing
   * another test file shares is locked.
   */
  it("has a behavioural test for every cascade and set-null foreign key", async () => {
    const scenarioTables = SCENARIO_ROWS.map(([table]) => table);

    const { rows } = await client.query<{
      referencing_table: string;
      referenced_table: string;
      on_delete: string;
    }>(
      `select (cn.nspname || '.' || child.relname) as referencing_table,
              (pn.nspname || '.' || parent.relname) as referenced_table,
              con.confdeltype as on_delete
         from pg_constraint con
         join pg_class child on child.oid = con.conrelid
         join pg_namespace cn on cn.oid = child.relnamespace
         join pg_class parent on parent.oid = con.confrelid
         join pg_namespace pn on pn.oid = parent.relnamespace
        where con.contype = 'f'
          and con.confdeltype in ('c', 'n')
          and (pn.nspname || '.' || parent.relname) = any ($1)
        order by 1`,
      [scenarioTables],
    );

    // The seven that exist today. A pass on an empty result would prove nothing.
    expect(rows.length).toBeGreaterThanOrEqual(7);

    for (const row of rows) {
      expect(
        GUARD_CASES.some((guard) => guard.cascadeTable === row.referencing_table),
        `no test proves cleanup.sql refuses when ${row.referencing_table} would be ` +
          `${row.on_delete === "c" ? "cascade-deleted" : "silently nulled"} as ` +
          `${row.referenced_table} loses a row`,
      ).toBe(true);
    }
  });
});
