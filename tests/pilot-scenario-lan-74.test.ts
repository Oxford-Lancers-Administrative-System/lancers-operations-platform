// @vitest-environment node
/**
 * The LAN-74 returner-intake pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-74/setup.sql` and `cleanup.sql` are written to be run BY
 * HAND against the single hosted production project. There is no staging
 * environment to catch a mistake in them, so the properties that make them safe
 * — repeatable setup, cleanup narrow enough to remove only its own rows,
 * cleanup that is a no-op the second time, and a durable pilot foundation that
 * survives all of it — are asserted here rather than asserted in prose.
 *
 * **Every refusal both scripts contain is exercised here, and the list is
 * checked against the scripts rather than maintained by hand.** A preflight
 * that is deleted, commented out, inverted, made unreachable or quietly
 * downgraded to a `raise notice` fails a test, because something actually
 * attempts the thing it is supposed to refuse.
 *
 * ## The property this scenario has that LAN-93's does not
 *
 * Its cleanup removes a row **it did not create and cannot name**: the returner
 * a tester enters through the interface, whose `people.id` the application
 * minted with `gen_random_uuid()`. That sweep is keyed on the `PILOT-LAN-74`
 * sentinel alone, and it is the only delete in this repository that is not
 * keyed on a deterministic identifier as well.
 *
 * So the sweep gets its own section below, and it is tested harder than
 * anything else here: a person carrying the sentinel who has become anything
 * other than disposable scenario data must stop the whole script rather than be
 * swept up with it. Narrow-because-guarded is a property worth proving;
 * narrow-because-nobody-tried is not a property at all.
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
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-74");

/** The scenario's deterministic identifiers, as the scripts define them. */
const ID = {
  personFirstNameOnly: "00740074-0074-4074-8074-000000000001",
  emailFirstNameOnly: "00740074-0074-4074-8074-000000000002",
  personFullName: "00740074-0074-4074-8074-000000000003",
  emailFullName: "00740074-0074-4074-8074-000000000004",
  phoneFullName: "00740074-0074-4074-8074-000000000005",
  membership: "00740074-0074-4074-8074-000000000006",
  statusEventCreated: "00740074-0074-4074-8074-000000000007",
  statusEventConfirmed: "00740074-0074-4074-8074-000000000008",
} as const;

const SENTINEL = "PILOT-LAN-74";
const STATUS_EVENT_ACTOR = "PILOT-LAN-74 setup script";

/** Which table each identifier lives in, in dependency order. */
const SCENARIO_ROWS: readonly (readonly [table: string, id: string])[] = [
  ["public.people", ID.personFirstNameOnly],
  ["public.contact_points", ID.emailFirstNameOnly],
  ["public.people", ID.personFullName],
  ["public.contact_points", ID.emailFullName],
  ["public.contact_points", ID.phoneFullName],
  ["public.season_memberships", ID.membership],
  ["public.season_membership_status_events", ID.statusEventCreated],
  ["public.season_membership_status_events", ID.statusEventConfirmed],
];

/** The tables cleanup deletes from — the parents whose cascades must be named. */
const DELETION_TARGETS = [
  "public.people",
  "public.contact_points",
  "public.season_memberships",
  "public.season_membership_status_events",
  "public.person_aliases",
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

/** How many of the scenario's eight rows are currently present. */
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

async function openSeasonId(client: Client): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    "select id from public.seasons where status in ('open','active') limit 1",
  );
  return row.id;
}

// ---------------------------------------------------------------------------
// Spare rows, for arranging a guard's precondition
// ---------------------------------------------------------------------------
// Deliberately NOT carrying the scenario's sentinel or identifiers, except where
// the guard under test is specifically about a sentinel-carrying row: these
// stand in for somebody else's data, which is what every guard protects.

async function sparePerson(client: Client, tag: string, knownAs?: string): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.people (given_name, family_name, known_as)
     values ('Somebody', $1, $2) returning id`,
    [tag, knownAs ?? null],
  );
  return row.id;
}

/** A person carrying the sentinel, as the interface would leave one behind. */
async function interfaceCreatedReturner(client: Client): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.people (given_name, family_name, known_as)
     values ('Fenwold', 'Typedbyhand', $1) returning id`,
    [SENTINEL],
  );
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1, 'email', 'typed.by.hand@example.invalid', true, 'operator intake')`,
    [row.id],
  );
  return row.id;
}

async function spareSeason(client: Client, label: string): Promise<string> {
  const vocabulary = await one<{ id: string }>(
    client,
    "select id from public.position_vocabularies order by adopted_on limit 1",
  );
  const row = await one<{ id: string }>(
    client,
    `insert into public.seasons (id, label, status, position_vocabulary_id)
     values (gen_random_uuid(), $1, 'planning', $2) returning id`,
    [label, vocabulary.id],
  );
  return row.id;
}

/** Marks `personId` as merged into another record, satisfying invariant I6. */
async function mergeAway(client: Client, personId: string, into: string): Promise<void> {
  await client.query(
    `update public.people
        set merged_into_person_id = $2,
            merged_at = now(),
            merged_by_person_id = $3,
            merge_reason = 'Fixture merge for the LAN-74 cleanup guard.'
      where id = $1`,
    [personId, into, into],
  );
}

/**
 * The durable pilot foundation, as it exists on the hosted project: an Auth
 * user, the Person it resolves to, the operator link, a time-bounded role
 * assignment, and an audit row naming that Person as an actor.
 *
 * Created before any scenario runs, so "cleanup preserves the foundation" has
 * something real to be true about.
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
    ["pilot-lan-74-foundation@oxfordlancers.local"],
  );
  const person = await one<{ id: string }>(
    client,
    `insert into public.people (given_name, family_name, known_as)
     values ('Durable', 'Foundation', 'PILOT-FOUNDATION-LAN74') returning id`,
  );
  const operator = await one<{ id: string }>(
    client,
    "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2) returning id",
    [user.id, person.id],
  );

  // A committee year in a window no seed row and no other fixture occupies —
  // `committee_years_do_not_overlap` is a global exclusion constraint, and two
  // fixtures fighting over it would be a flaky test.
  const committeeYear = await one<{ id: string }>(
    client,
    `insert into public.committee_years (label, agm_held_on, starts_on, ends_on)
     values ('pilot-lan74-fixture-2009-10', '2009-06-01', '2009-06-01', '2010-06-01') returning id`,
  );

  const role = await one<{ id: string; scope: string; is_constitutional_office: boolean }>(
    client,
    `insert into public.roles (code, name, scope, is_constitutional_office)
     values ('pilot_lan74_fixture_officer', 'Pilot LAN-74 fixture officer', 'committee_year', false)
     on conflict (code) do update set name = excluded.name
     returning id, scope, is_constitutional_office`,
  );

  const assignment = await one<{ id: string }>(
    client,
    `insert into public.role_assignments (
       person_id, role_id, scope, is_constitutional_office,
       committee_year_id, effective_from, effective_to)
     values ($1, $2, $3, $4, $5, '2009-06-01', '2009-12-01') returning id`,
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
async function durableState(client: Client, d: Durable): Promise<Record<string, unknown>> {
  const read = async (table: string, id: string) => {
    const row = await one<{ state: unknown }>(
      client,
      `select to_jsonb(t) as state from ${table} t where id = $1`,
      [id],
    );
    return row?.state ?? null;
  };

  return {
    authUser: await read("auth.users", d.authUserId),
    person: await read("public.people", d.personId),
    operatorAccount: await read("public.operator_accounts", d.operatorAccountId),
    roleAssignment: await read("public.role_assignments", d.roleAssignmentId),
    auditEvent: await read("public.audit_events", d.auditEventId),
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

// ---------------------------------------------------------------------------

describe("the local-only guard this suite depends on", () => {
  it("refuses a hosted target, so these scripts can never reach production from here", () => {
    expect(() =>
      resolveLocalDatabaseUrl("postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres"),
    ).toThrow(/non-local|hosted/i);
  });
});

describe("setup.sql is repeatable", () => {
  it("creates exactly the eight rows it documents", async () => {
    expect(await scenarioRowCount(client)).toBe(0);
    await client.query(SETUP);
    expect(await scenarioRowCount(client)).toBe(8);
  });

  it("puts the membership in the open season, and creates no season of its own", async () => {
    const before = await one<{ n: string }>(client, "select count(*) as n from public.seasons");
    await client.query(SETUP);

    const membership = await one<{ season_id: string; status: string; entry: string }>(
      client,
      "select season_id, status::text, entry::text from public.season_memberships where id = $1",
      [ID.membership],
    );
    expect(membership.season_id).toBe(await openSeasonId(client));
    expect(membership.status).toBe("confirmed");
    expect(membership.entry).toBe("returning");

    const after = await one<{ n: string }>(client, "select count(*) as n from public.seasons");
    expect(after.n).toBe(before.n);
  });

  it("creates the first-name-only candidate the duplicate check exists for", async () => {
    await client.query(SETUP);

    const person = await one<{ given_name: string; family_name: string | null }>(
      client,
      "select given_name, family_name from public.people where id = $1",
      [ID.personFirstNameOnly],
    );
    expect(person.family_name).toBeNull();

    const other = await one<{ given_name: string; family_name: string | null }>(
      client,
      "select given_name, family_name from public.people where id = $1",
      [ID.personFullName],
    );
    // Same given name is the point: it is what makes the operator's choice real.
    expect(other.given_name).toBe(person.given_name);
    expect(other.family_name).not.toBeNull();
  });

  it("leaves the second candidate with no membership, so selection can succeed", async () => {
    await client.query(SETUP);

    const held = await one<{ n: string }>(
      client,
      `select count(*) as n
         from public.season_memberships m
         join public.seasons s on s.id = m.season_id
        where m.person_id = $1 and s.status in ('open','active')`,
      [ID.personFullName],
    );
    expect(held.n).toBe("0");
  });

  it("attributes the status history to the script, never to a person", async () => {
    await client.query(SETUP);

    const { rows } = await client.query<{ actor_person_id: string | null; actor_label: string }>(
      `select actor_person_id, actor_label
         from public.season_membership_status_events
        where id in ($1, $2)`,
      [ID.statusEventCreated, ID.statusEventConfirmed],
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // Invariant M2 requires an actor. Naming the mechanism is honest; naming
      // a person who did not do it would be a false history, and would also
      // make the row look like something the application wrote.
      expect(row.actor_person_id).toBeNull();
      expect(row.actor_label).toBe(STATUS_EVENT_ACTOR);
    }
  });

  it("uses only undeliverable contact values", async () => {
    await client.query(SETUP);

    const { rows } = await client.query<{ raw_value: string }>(
      "select raw_value from public.contact_points where source = $1",
      [SENTINEL],
    );
    expect(rows).toHaveLength(3);
    for (const { raw_value } of rows) {
      // RFC 2606 reserved domain, or Ofcom's reserved drama range — the latter
      // written either nationally (`07700 900…`) or internationally
      // (`+44 7700 900…`), which is why the pattern matches the range itself
      // rather than one of its two spellings.
      expect(raw_value).toMatch(/example\.invalid|7700 900/);
    }
  });

  it("creates no auth user, operator account, role assignment or audit row", async () => {
    const before = await snapshot(client);
    await client.query(SETUP);
    const after = await snapshot(client);

    for (const table of [
      "public.operator_accounts",
      "public.role_assignments",
      "public.roles",
      "public.audit_events",
      "public.seasons",
      "public.events",
    ]) {
      expect(after[table], `${table} must be untouched by setup`).toBe(before[table]);
    }
  });

  it("run a second time changes nothing at all", async () => {
    await client.query(SETUP);
    const after = await snapshot(client);
    await client.query(SETUP);
    expect(await snapshot(client)).toEqual(after);
  });

  it("does not rewrite a row that is already there", async () => {
    await client.query(SETUP);
    await client.query("update public.people set given_name = 'Edited' where id = $1", [
      ID.personFirstNameOnly,
    ]);
    await client.query(SETUP);

    const person = await one<{ given_name: string }>(
      client,
      "select given_name from public.people where id = $1",
      [ID.personFirstNameOnly],
    );
    // `on conflict (id) do nothing`, never `do update`. A row this script did
    // not create in this run is never silently rewritten.
    expect(person.given_name).toBe("Edited");
  });

  it("restores a row that was removed by hand between runs", async () => {
    await client.query(SETUP);
    await client.query("delete from public.contact_points where id = $1", [ID.phoneFullName]);
    expect(await scenarioRowCount(client)).toBe(7);

    await client.query(SETUP);
    expect(await scenarioRowCount(client)).toBe(8);
  });
});

describe("cleanup.sql removes only what its paired setup created", () => {
  it("restores the exact pre-setup state of every table", async () => {
    const before = await snapshot(client);
    await client.query(SETUP);
    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(before);
  });

  it("is a no-op the second time", async () => {
    await client.query(SETUP);
    await client.query(CLEANUP);
    const after = await snapshot(client);
    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(after);
  });

  it("succeeds and changes nothing when the scenario was never set up", async () => {
    const before = await snapshot(client);
    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(before);
  });

  it("never deletes the season it borrowed", async () => {
    const seasonId = await openSeasonId(client);
    await client.query(SETUP);
    await client.query(CLEANUP);

    const season = await one<{ n: string }>(
      client,
      "select count(*) as n from public.seasons where id = $1",
      [seasonId],
    );
    expect(season.n).toBe("1");
  });

  it("fails closed on a dependency its preflight does not anticipate", async () => {
    await client.query(SETUP);
    // `follow_up_actions.subject_season_membership_id` is `on delete restrict`
    // and is not named in the preflight. The delete must fail and roll back
    // rather than half-removing the scenario.
    const report = await one<{ id: string }>(
      client,
      `insert into public.weekly_reports
         (season_id, report_on, version, metric_definition_version, data_as_of, content, generated_by_person_id)
       values ($1, date '2009-01-05', 1, 'lan74-fixture', now(), '{}'::jsonb, $2) returning id`,
      [await openSeasonId(client), durable.personId],
    );
    await client.query(
      `insert into public.follow_up_actions
         (season_id, weekly_report_id, category, description, subject_season_membership_id)
       values ($1, $2, 'other', 'LAN-74 fixture dependency', $3)`,
      [await openSeasonId(client), report.id, ID.membership],
    );

    // The delete fails on the foreign key rather than removing the blocking
    // row. `on delete restrict` is the backstop the script's header names, and
    // this proves it is really there for a dependency nothing anticipated.
    await expect(client.query(CLEANUP)).rejects.toThrow(/follow_up_actions|violates foreign key/i);

    // The whole transaction aborted, which is the point: a scenario that is
    // half-removed in a database with no staging is the bad case. Everything
    // this test did — including `setup.sql` — went with it.
    await client.query("rollback");
    await client.query("begin transaction isolation level repeatable read");
    expect(await scenarioRowCount(client)).toBe(0);
  });
});

describe("cleanup.sql preserves the durable pilot foundation", () => {
  it("leaves the auth user, person, operator link, role assignment and audit row unmodified", async () => {
    const before = await durableState(client, durable);
    await client.query(SETUP);
    await client.query(CLEANUP);
    expect(await durableState(client, durable)).toEqual(before);
  });

  it("leaves audit rows about the scenario's people in place", async () => {
    await client.query(SETUP);
    // An audit row of the shape LAN-74 itself writes: the person is the
    // subject, not the actor. `entity_id` is deliberately not a foreign key.
    const audit = await one<{ id: string }>(
      client,
      `insert into public.audit_events (actor_person_id, action, entity_table, entity_id, context)
       values ($1, 'returner_membership_confirmed', 'season_memberships', $2, '{"issue":"LAN-74"}'::jsonb)
       returning id`,
      [durable.personId, ID.membership],
    );

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.audit_events where id = $1",
      [audit.id],
    );
    // History outlives its subject by design (invariant M2, review F13).
    expect(surviving.n).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// The sentinel-only sweep
// ---------------------------------------------------------------------------

describe("the sweep of the returner created through the interface", () => {
  it("removes a sentinel-carrying person the scripts never created", async () => {
    await client.query(SETUP);
    const created = await interfaceCreatedReturner(client);

    await client.query(CLEANUP);

    const left = await one<{ n: string }>(
      client,
      "select count(*) as n from public.people where id = $1",
      [created],
    );
    expect(left.n).toBe("0");
  });

  it("removes that person's membership, contacts and status history with them", async () => {
    await client.query(SETUP);
    const created = await interfaceCreatedReturner(client);
    const membership = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
       values ($1, $2, 'confirmed', 'returning', current_date) returning id`,
      [created, await openSeasonId(client)],
    );
    await client.query(
      `insert into public.season_membership_status_events
         (season_membership_id, from_status, to_status, actor_person_id)
       values ($1, null, 'carried_forward', $2)`,
      [membership.id, durable.personId],
    );

    await client.query(CLEANUP);

    for (const [table, column, value] of [
      ["public.season_membership_status_events", "season_membership_id", membership.id],
      ["public.season_memberships", "id", membership.id],
      ["public.contact_points", "person_id", created],
      ["public.people", "id", created],
    ] as const) {
      const row = await one<{ n: string }>(
        client,
        `select count(*) as n from ${table} where ${column} = $1`,
        [value],
      );
      expect(row.n, `${table} should be empty for the swept returner`).toBe("0");
    }
  });

  it("leaves a person who does not carry the sentinel completely alone", async () => {
    await client.query(SETUP);
    const bystander = await sparePerson(client, "Bystander");
    const before = await one<{ state: unknown }>(
      client,
      "select to_jsonb(t) as state from public.people t where id = $1",
      [bystander],
    );

    await client.query(CLEANUP);

    const after = await one<{ state: unknown }>(
      client,
      "select to_jsonb(t) as state from public.people t where id = $1",
      [bystander],
    );
    expect(after?.state).toEqual(before.state);
  });

  it("is not fooled by a sentinel in the wrong column", async () => {
    await client.query(SETUP);
    // The sentinel belongs in `known_as`. A person whose *family name* happens
    // to contain it is not this scenario's, and must survive.
    const lookalike = await sparePerson(client, SENTINEL);

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.people where id = $1",
      [lookalike],
    );
    expect(surviving.n).toBe("1");
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
        "alter table supabase_migrations.schema_migrations rename to schema_migrations_hidden_by_lan74",
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
    message: "no season is open or active",
    arrange: async (c) =>
      void (await c.query(
        "update public.seasons set status = 'closing' where status in ('open','active')",
      )),
  },
  {
    script: "setup",
    message: "seasons are open or active at once",
    arrange: async (c) => {
      const second = await spareSeason(c, "LAN-74 fixture second open season");
      await c.query(
        `update public.seasons
            set status = 'open', opened_at = now(), opened_by_person_id = (select id from public.people limit 1)
          where id = $1`,
        [second],
      );
    },
  },
  {
    script: "setup",
    message: "people …0001 exists and is not this scenario",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.people (id, given_name, family_name) values ($1, 'Somebody', 'Else')",
        [ID.personFirstNameOnly],
      )),
  },
  {
    script: "setup",
    message: "people …0003 exists and is not this scenario",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.people (id, given_name, family_name) values ($1, 'Somebody', 'Else')",
        [ID.personFullName],
      )),
  },
  {
    script: "setup",
    message: "a contact_points row in this scenario's identifier block exists and is not",
    arrange: async (c) => {
      const person = await sparePerson(c, "ContactOwner");
      await c.query(
        `insert into public.contact_points (id, person_id, kind, raw_value, source)
         values ($1, $2, 'email', 'someone.else@example.invalid', 'somebody else')`,
        [ID.emailFullName, person],
      );
    },
  },
  {
    script: "setup",
    message: "season_memberships …0006 exists and belongs to somebody else",
    arrange: async (c) => {
      const person = await sparePerson(c, "MembershipOwner");
      await c.query(
        `insert into public.season_memberships (id, person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, $3, 'confirmed', 'new', current_date)`,
        [ID.membership, person, await spareSeason(c, "LAN-74 fixture other season")],
      );
    },
  },
  {
    script: "setup",
    message: "a season_membership_status_events row in this scenario's identifier block is not",
    arrange: async (c) => {
      const person = await sparePerson(c, "EventOwner");
      const membership = await one<{ id: string }>(
        c,
        `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, 'confirmed', 'new', current_date) returning id`,
        [person, await spareSeason(c, "LAN-74 fixture event season")],
      );
      await c.query(
        `insert into public.season_membership_status_events
           (id, season_membership_id, from_status, to_status, actor_label)
         values ($1, $2, null, 'confirmed', 'somebody else')`,
        [ID.statusEventCreated, membership.id],
      );
    },
  },
  {
    script: "setup",
    message: "a scenario identifier is linked to an operator account",
    arrange: async (c) => {
      await c.query(
        "insert into public.people (id, given_name, known_as) values ($1, 'Fenwold', $2)",
        [ID.personFirstNameOnly, SENTINEL],
      );
      const user = await one<{ id: string }>(
        c,
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        ["lan74-guard-operator@oxfordlancers.local"],
      );
      await c.query(
        "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
        [user.id, ID.personFirstNameOnly],
      );
    },
  },
  {
    script: "setup",
    message: "the scenario person already holds a different membership in the open season",
    arrange: async (c) => {
      await c.query(
        "insert into public.people (id, given_name, known_as) values ($1, 'Fenwold', $2)",
        [ID.personFirstNameOnly, SENTINEL],
      );
      await c.query(
        `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, 'confirmed', 'new', current_date)`,
        [ID.personFirstNameOnly, await openSeasonId(c)],
      );
    },
  },
  {
    script: "setup",
    message: "the second candidate already holds a membership in the open season",
    arrange: async (c) => {
      await c.query(
        "insert into public.people (id, given_name, known_as) values ($1, 'Fenwold', $2)",
        [ID.personFullName, SENTINEL],
      );
      await c.query(
        `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, 'confirmed', 'new', current_date)`,
        [ID.personFullName, await openSeasonId(c)],
      );
    },
  },

  // --- cleanup.sql ---------------------------------------------------------
  {
    script: "cleanup",
    message: "people …0001 does not carry the PILOT-LAN-74 sentinel",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.people (id, given_name, family_name) values ($1, 'Somebody', 'Else')",
        [ID.personFirstNameOnly],
      )),
  },
  {
    script: "cleanup",
    message: "people …0003 does not carry the PILOT-LAN-74 sentinel",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.people (id, given_name, family_name) values ($1, 'Somebody', 'Else')",
        [ID.personFullName],
      )),
  },
  {
    script: "cleanup",
    message: "a contact_points row in this scenario's identifier block does not carry the sentinel",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query("update public.contact_points set source = 'edited' where id = $1", [
        ID.phoneFullName,
      ])),
  },
  {
    script: "cleanup",
    message: "season_memberships …0006 is not this scenario",
    arrange: async (c) => {
      const person = await sparePerson(c, "OtherMembership");
      await c.query(
        `insert into public.season_memberships (id, person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, $3, 'confirmed', 'new', current_date)`,
        [ID.membership, person, await spareSeason(c, "LAN-74 cleanup fixture season")],
      );
    },
  },
  {
    script: "cleanup",
    // Deliberately the long form: setup.sql raises a differently-worded refusal
    // that also ends "…is linked to an operator account", and a fragment
    // matching both would pass even if this guard were deleted.
    message: "a person this script would delete is linked to an operator account",
    afterSetup: true,
    arrange: async (c) => {
      const user = await one<{ id: string }>(
        c,
        "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
        ["lan74-cleanup-operator@oxfordlancers.local"],
      );
      await c.query(
        "insert into public.operator_accounts (auth_user_id, person_id) values ($1, $2)",
        [user.id, ID.personFullName],
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
         values ($1, $2, 'committee_year', false, $3, '2009-06-01', '2009-12-01')`,
        [ID.personFullName, d.roleId, d.committeeYearId],
      )),
  },
  {
    script: "cleanup",
    message: "is an actor in audit_events",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
         values ($1, 'lan74.fixture', 'people', gen_random_uuid())`,
        [ID.personFullName],
      )),
  },
  {
    script: "cleanup",
    message: "is the recorded actor on a membership transition",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.season_membership_status_events
           (season_membership_id, from_status, to_status, actor_person_id)
         values ($1, 'confirmed', 'onboarding', $2)`,
        [ID.membership, ID.personFullName],
      )),
  },
  {
    script: "cleanup",
    message: "has been merged into another record",
    afterSetup: true,
    arrange: async (c, d) => mergeAway(c, ID.personFullName, d.personId),
  },
  {
    script: "cleanup",
    message: "was merged into, or merged by, one this script would delete",
    afterSetup: true,
    arrange: async (c) => {
      const orphan = await sparePerson(c, "MergedIntoScenario");
      await mergeAway(c, orphan, ID.personFullName);
    },
  },
  {
    script: "cleanup",
    message: "contact_points that this scenario did not create",
    afterSetup: true,
    cascadeTable: "public.contact_points",
    arrange: async (c) =>
      void (await c.query(
        `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
         values ($1, 'phone', '020 7946 0100', false, 'somebody else')`,
        [ID.personFirstNameOnly],
      )),
  },
  {
    script: "cleanup",
    message: "person_aliases rows hang off a scenario person",
    afterSetup: true,
    cascadeTable: "public.person_aliases",
    arrange: async (c) =>
      void (await c.query(
        "insert into public.person_aliases (person_id, alias, source) values ($1, 'Fen', 'somebody else')",
        [ID.personFirstNameOnly],
      )),
  },
  {
    script: "cleanup",
    message: "staging.legacy_roster_rows reference a person this script would delete",
    afterSetup: true,
    cascadeTable: "staging.legacy_roster_rows",
    arrange: async (c) =>
      void (await c.query(
        `insert into staging.legacy_roster_rows (import_batch, normalisation_status, matched_person_id)
         values ('lan74-fixture', 'normalised', $1)`,
        [ID.personFirstNameOnly],
      )),
  },
  {
    script: "cleanup",
    message: "a recruitment prospect record exists",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.recruitment_prospects (person_id, season_id, status)
         values ($1, $2, 'identified')`,
        [ID.personFullName, await spareSeason(c, "LAN-74 prospect fixture season")],
      )),
  },
  {
    script: "cleanup",
    message: "a scenario person holds a membership this scenario did not create",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
         values ($1, $2, 'confirmed', 'new', current_date)`,
        [ID.personFirstNameOnly, await spareSeason(c, "LAN-74 extra membership season")],
      )),
  },
  {
    script: "cleanup",
    message: "a later membership was carried forward from one this script would delete",
    afterSetup: true,
    arrange: async (c) =>
      void (await c.query(
        `insert into public.season_memberships
           (person_id, season_id, status, entry, confirmed_on, carried_forward_from_id)
         values ($1, $2, 'confirmed', 'returning', current_date, $3)`,
        [
          ID.personFirstNameOnly,
          await spareSeason(c, "LAN-74 carried-forward fixture season"),
          ID.membership,
        ],
      )),
  },
  {
    script: "cleanup",
    message: "invitation or attendance records hang off a membership",
    afterSetup: true,
    arrange: async (c, d) =>
      void (await c.query(
        `insert into public.availability_statuses
           (season_membership_id, level, effective_from, reported_by_person_id)
         values ($1, 'orange', current_date, $2)`,
        [ID.membership, d.personId],
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
 * needs DDL against `public.people` and the rest — tables every other test file
 * in this suite reads concurrently — and an `access exclusive` lock on those
 * would make this suite the reason another one is flaky. The exemption is
 * per-message rather than per-script, so a new guard is never exempt by
 * accident, and each entry is asserted below to still match one real refusal.
 */
const EXEMPT_FROM_BEHAVIOURAL_COVERAGE = [
  "LAN-74 pilot setup refused: missing table(s) %.",
  "LAN-74 pilot cleanup refused: the expected schema is not present.",
] as const;

describe("the refusals the scripts declare are the refusals this file exercises", () => {
  const declared = [...declaredRefusals(SETUP_FILE), ...declaredRefusals(CLEANUP_FILE)];

  it("finds every refusal in both scripts", () => {
    // A pass produced by a parser that found nothing is not a pass.
    expect(declared.length).toBeGreaterThanOrEqual(28);
    expect(declaredRefusals(SETUP_FILE).length).toBeGreaterThanOrEqual(12);
    expect(declaredRefusals(CLEANUP_FILE).length).toBeGreaterThanOrEqual(16);
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
   * `cleanup.sql` claims to name every foreign key PostgreSQL would follow on
   * its behalf — every `on delete cascade` and `on delete set null` pointing at
   * a row it deletes — because those are the paths by which a narrow delete
   * silently widens. That claim was true when it was written. Nothing made it
   * stay true: a later migration adding a fourth such key would degrade the
   * "refuses to widen" property to a cascade, in silence.
   *
   * So the claim is checked against the catalogue, and against a behavioural
   * test per key. Read-only: no DDL, nothing another test file shares is locked.
   */
  it("has a behavioural test for every cascade and set-null foreign key", async () => {
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
      [DELETION_TARGETS],
    );

    // The three that exist today. A pass on an empty result would prove nothing.
    expect(rows.length).toBeGreaterThanOrEqual(3);

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

describe("every scenario delete is keyed on an identifier and the sentinel", () => {
  /**
   * The runbook's rule, asserted as a parsed predicate rather than by reading
   * the file: one `and` becoming an `or` is the whole distance between the
   * narrowest possible delete and an arbitrary one.
   *
   * The sweep is deliberately excluded and asserted separately below — it
   * cannot carry a deterministic identifier, and pretending otherwise by
   * loosening this test is exactly the failure this test exists to catch.
   */
  const SCENARIO_IDS = Object.values(ID);

  const deletes = CLEANUP_FILE.split(/\n(?=delete from)/)
    .filter((statement) => statement.trimStart().startsWith("delete from"))
    .map((statement) => statement.split(";")[0]);

  it("finds every delete statement in cleanup.sql", () => {
    expect(deletes.length).toBe(9);
  });

  it("keys each scenario delete on a deterministic identifier AND a sentinel", () => {
    const scenarioDeletes = deletes.filter((statement) =>
      SCENARIO_IDS.some((id) => statement.includes(id)),
    );
    expect(scenarioDeletes).toHaveLength(4);

    for (const statement of scenarioDeletes) {
      expect(statement, `not conjoined: ${statement}`).toMatch(/\band\b/);
      expect(statement).not.toMatch(/\bor\b/);
      expect(
        statement.includes(SENTINEL) || statement.includes(ID.personFirstNameOnly),
        `no sentinel half: ${statement}`,
      ).toBe(true);
    }
  });

  it("confines the sentinel-only sweep to exactly the five statements that need it", () => {
    const sweep = deletes.filter((statement) => !SCENARIO_IDS.some((id) => statement.includes(id)));
    expect(sweep).toHaveLength(5);

    for (const statement of sweep) {
      // Every sweep statement resolves its targets through the sentinel, and
      // none of them widens to "every person" or "every membership".
      expect(statement, `sweep without a sentinel: ${statement}`).toContain(SENTINEL);
      expect(statement).not.toMatch(/\bor\b/);
    }
  });
});
