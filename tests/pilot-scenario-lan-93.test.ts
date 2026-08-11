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

/**
 * Reads a pilot script and returns its body with the outer transaction removed.
 *
 * The scripts must be transactional — that is one of the safety properties, and
 * it is asserted here rather than assumed. They are then executed inside this
 * file's own transaction, because a `commit` in a test would leave rows in a
 * database shared with every other test file and every other agent.
 */
function scriptBody(name: string): string {
  const raw = readFileSync(path.join(scenarioDir, name), "utf8");

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

const SETUP = scriptBody("setup.sql");
const CLEANUP = scriptBody("cleanup.sql");

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

/**
 * The durable pilot foundation, as it exists on the hosted project: an Auth
 * user, the Person it resolves to, the operator link, a time-bounded
 * `it_officer` assignment, and an audit row naming that Person as an actor.
 *
 * Created before any scenario runs, so "cleanup preserves the foundation" has
 * something real to be true about. Nothing here is created by a pilot scenario
 * script, and nothing here may be removed by one.
 */
interface Durable {
  authUserId: string;
  personId: string;
  operatorAccountId: string;
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

describe("setup.sql verifies its prerequisites and fails closed", () => {
  it("refuses when the schema it was written against is not applied", async () => {
    await client.query(
      "delete from supabase_migrations.schema_migrations where version = '20260811090000'",
    );

    await expectRejected(client, SETUP, [], /migration 20260811090000 is not applied/);
    expect(await scenarioRowCount(client)).toBe(0);
  });

  it("refuses to adopt a row occupying one of its identifiers without the sentinel", async () => {
    await client.query(
      "insert into public.people (id, given_name, family_name) values ($1, 'Someone', 'Else')",
      [ID.person],
    );

    await expectRejected(client, SETUP, [], /people …0004 exists and is not this scenario/);

    // The impostor row is still there, and still says what it said.
    const person = await one<{ given_name: string; known_as: string | null }>(
      client,
      "select given_name, known_as from public.people where id = $1",
      [ID.person],
    );
    expect(person.given_name).toBe("Someone");
    expect(person.known_as).toBeNull();
    expect(await scenarioRowCount(client)).toBe(1);
  });

  it("refuses when another row already holds a natural key it needs", async () => {
    await client.query(
      `insert into public.position_vocabularies (code, label, adopted_on)
       values ('pilot-lan-93', 'Something else entirely', '2020-01-01')`,
    );

    await expectRejected(client, SETUP, [], /already uses code pilot-lan-93/);
    expect(await scenarioRowCount(client)).toBe(0);
  });

  it("leaves nothing behind when a prerequisite fails", async () => {
    const before = await snapshot(client);

    await client.query(
      "delete from supabase_migrations.schema_migrations where version = '20260811090000'",
    );
    await expectRejected(client, SETUP, [], /is not applied/);
    await client.query(
      "insert into supabase_migrations.schema_migrations (version) values ('20260811090000')",
    );

    expect(await snapshot(client)).toEqual(before);
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

  it("refuses rather than widening to another event in the scenario season", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.events (season_id, name, event_type, status)
       values ($1, 'Someone else''s event', 'practice', 'draft')`,
      [ID.season],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /another event exists in the scenario season/);

    expect(await snapshot(client)).toEqual(before);
    expect(await scenarioRowCount(client)).toBe(6);
  });

  it("refuses rather than cascade-deleting a row that hangs off the scenario event", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.event_questions (event_id, prompt) values ($1, 'Whose question is this?')`,
      [ID.event],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /would be cascade-deleted/);

    expect(await snapshot(client)).toEqual(before);
  });

  it("refuses rather than silently nulling a staging row that references the scenario", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into staging.legacy_roster_rows (import_batch, normalisation_status, matched_person_id)
       values ('pilot-fixture-batch', 'normalised', $1)`,
      [ID.person],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /would be silently nulled/);

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

  it("refuses when the scenario person has itself become a durable identity", async () => {
    await client.query(SETUP);

    const user = await one<{ id: string }>(
      client,
      "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
      ["pilot-scenario-promoted@oxfordlancers.local"],
    );
    await client.query(
      "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
      [user.id, ID.person],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /linked to an operator account/);

    expect(await snapshot(client)).toEqual(before);
    expect(await scenarioRowCount(client)).toBe(6);
  });

  it("refuses when the scenario person is an actor in the audit trail", async () => {
    await client.query(SETUP);
    await client.query(
      `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
       values ($1, 'something.happened', 'events', $2)`,
      [ID.person, ID.event],
    );
    const before = await snapshot(client);

    await expectRejected(client, CLEANUP, [], /invariant M2/);

    expect(await snapshot(client)).toEqual(before);
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
   * So the claim is checked against the catalogue rather than against the
   * comment. Read-only: no DDL, nothing another test file shares is locked.
   */
  it("names every cascade and set-null foreign key that points at a scenario row", async () => {
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

    // The seven that exist today. A drop below this is a schema change nobody
    // told this test about, and a pass on an empty result would prove nothing.
    expect(rows.length).toBeGreaterThanOrEqual(7);

    const raw = readFileSync(path.join(scenarioDir, "cleanup.sql"), "utf8");
    for (const row of rows) {
      expect(
        raw,
        `cleanup.sql does not check ${row.referencing_table}, which PostgreSQL would ` +
          `${row.on_delete === "c" ? "cascade-delete" : "silently null"} when ` +
          `${row.referenced_table} loses a row`,
      ).toContain(`from ${row.referencing_table}`);
    }
  });
});
