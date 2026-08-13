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
 * minted with `gen_random_uuid()`. Five of `cleanup.sql`'s deletes are therefore
 * keyed on the `PILOT-LAN-74` sentinel alone — the second ownership shape,
 * governed by ADR 0019 and pinned by value in `SENTINEL_ONLY_DELETES`. LAN-76
 * uses it too.
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

/**
 * A person carrying the sentinel, **exactly as the interface leaves one behind**.
 *
 * This fixture is the one that has to stay honest, and it did not: it used to
 * write `known_as = 'PILOT-LAN-74'` and a `person_aliases` row, neither of which
 * the application can produce since the intake form dropped its nickname field.
 * That made the whole end-to-end block green over a cleanup that would have
 * matched nothing in production.
 *
 * So: the sentinel goes in `family_name`, `known_as` is null, and no alias is
 * written — because that is what `enterReturningPlayer` does when the form
 * sends it four fields.
 */
async function interfaceCreatedReturner(client: Client): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.people (given_name, family_name, known_as)
     values ('Fenwold', $1, null) returning id`,
    [SENTINEL],
  );
  // Email AND phone. UX-10 offers both fields and the wireframe shows both
  // filled, so a fixture with only an email cannot see a guard that refuses on
  // the phone — which is exactly the defect this fixture used to hide.
  await client.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
     values ($1, 'email', 'typed.by.hand@example.invalid', true, 'operator intake'),
            ($1, 'phone', '07700 900177', true, 'operator intake')`,
    [row.id],
  );
  // No alias row. The form has no nickname field, so `insertAliasIfDistinct`
  // is never reached from intake and the application writes none. Inventing one
  // here would be the fixture lying about the application again.
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

/**
 * What the scripts actually executed, according to PostgreSQL.
 *
 * ## Why this exists, and what it replaces
 *
 * `tests/pilot-data-contract.test.ts` reads these scripts as text and refuses
 * DDL, grants and drops. Four consecutive reviews defeated that check, each
 * time through a different corner of SQL lexing the hand-written scanner did
 * not model — an apostrophe in a comment, a `--` inside a literal, a
 * dollar-quoted body, an `E'…'` escape, a quoted identifier. Every fix added a
 * state and the next state interacted with it.
 *
 * The mistake was reading the text at all. The database has already parsed the
 * script; asking it what ran cannot be evaded by any spelling, because there is
 * no spelling left to get wrong. So these triggers watch the scripts execute.
 *
 * ## What this covers, and what it does not
 *
 * **Authoritative here:** every schema DDL (create/alter/drop of tables, views,
 * functions, types, indexes, policies), `grant`, `revoke`, `select … into` and
 * `drop owned by`. A pilot script that does any of those to anything outside
 * `pg_temp` fails, whatever it looks like.
 *
 * **NOT covered, and the textual rules remain the only cover:** `truncate`, and
 * anything touching a role, database or tablespace. PostgreSQL does not fire
 * event triggers for those — shared objects are documented as exempt, and
 * `truncate` raised no event in this version when probed. That split is stated
 * here rather than assumed, because a guard whose boundary is unknown is a
 * guard nobody can rely on.
 */
const PILOT_GUARD = `
create or replace function pilot_guard_start() returns event_trigger
language plpgsql as $fn$
begin
  if tg_tag in ('GRANT', 'REVOKE', 'ALTER SYSTEM', 'DROP OWNED', 'REASSIGN OWNED') then
    raise exception 'PILOT-GUARD: the script executed %', tg_tag;
  end if;
end
$fn$;

create or replace function pilot_guard_end() returns event_trigger
language plpgsql as $fn$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.schema_name is distinct from 'pg_temp' then
      raise exception 'PILOT-GUARD: the script executed % on %',
        tg_tag, coalesce(cmd.object_identity, cmd.schema_name, '?');
    end if;
  end loop;
end
$fn$;

create or replace function pilot_guard_drop() returns event_trigger
language plpgsql as $fn$
declare obj record;
begin
  for obj in select * from pg_event_trigger_dropped_objects() loop
    if obj.schema_name is distinct from 'pg_temp' and not obj.is_temporary then
      raise exception 'PILOT-GUARD: the script dropped %',
        coalesce(obj.object_identity, obj.object_type);
    end if;
  end loop;
end
$fn$;

create event trigger pilot_guard_s on ddl_command_start execute function pilot_guard_start();
create event trigger pilot_guard_e on ddl_command_end   execute function pilot_guard_end();
create event trigger pilot_guard_d on sql_drop          execute function pilot_guard_drop();
`;

const PILOT_GUARD_OFF = `
drop event trigger if exists pilot_guard_s;
drop event trigger if exists pilot_guard_e;
drop event trigger if exists pilot_guard_d;
`;

/**
 * Opt-in, and here is the trade-off, stated so nobody has to rediscover it.
 *
 * An event trigger is a **database-global** catalog object. Creating one takes a
 * lock that blocks DDL in every other session, and vitest runs test files in
 * parallel against one shared local database — so with these enabled by
 * default, four unrelated schema suites started failing on lock timeouts.
 * Measured, not guessed: without them the suite is 1679/1680; with them it was
 * 1683/1687 with four *different* suites failing each run.
 *
 * Making them default therefore means serialising the whole test run, which is
 * a repository-wide decision about CI time that LAN-74 should not take on its
 * own. So the check lives here, is proved to work, and runs on request:
 *
 *     PILOT_GUARD_CHECK=1 npx vitest run tests/pilot-scenario-lan-74.test.ts
 *
 * **This is the authoritative check on what these scripts execute**, and the
 * textual rules in `tests/pilot-data-contract.test.ts` say so and defer to it.
 * That it is opt-in is a real weakening, and it is the open question in the
 * pull request rather than something settled here.
 */
const GUARD_CHECK = process.env.PILOT_GUARD_CHECK === "1";

describe.skipIf(!GUARD_CHECK)("what the scripts actually execute, according to PostgreSQL", () => {
  /**
   * Runs `sql` with the guard installed.
   *
   * No teardown: when the guard fires, the transaction is aborted and any
   * further statement returns "current transaction is aborted" — which would
   * mask the guard's own message and make every negative test below assert
   * nothing. The suite's `afterEach` rollback removes the triggers either way,
   * because creating an event trigger is itself transactional.
   */
  async function underGuard(sql: string): Promise<void> {
    await client.query(PILOT_GUARD);
    await client.query(sql);
    await client.query(PILOT_GUARD_OFF);
  }

  it("setup.sql performs no DDL, grant or drop outside pg_temp", async () => {
    await underGuard(SETUP);
  });

  it("cleanup.sql performs none either, beyond its own temporary table", async () => {
    await client.query(SETUP);
    await underGuard(CLEANUP);
  });

  // The guard has to be shown to fire, or "the scripts are clean" is
  // indistinguishable from "the guard is broken". Each of these is a payload a
  // textual check was defeated by in review.

  it("catches a grant no textual check could see", async () => {
    await expect(
      underGuard(`do $g$ begin
         perform $m$don't panic$m$;
         execute 'grant all on public.people to anon';
       end $g$;`),
    ).rejects.toThrow(/PILOT-GUARD: the script executed GRANT/);
  });

  it("catches a permanent table created inside a preflight body", async () => {
    await expect(
      underGuard("do $g$ begin execute 'create table public.evil (id int)'; end $g$;"),
    ).rejects.toThrow(/PILOT-GUARD: the script executed CREATE TABLE/);
  });

  it("catches a drop hidden behind a quoted identifier", async () => {
    await expect(
      underGuard(`select 1 as "it's"; drop table public.contact_points;`),
    ).rejects.toThrow(/PILOT-GUARD: the script dropped/);
  });

  it("catches select … into with no from, which the textual rule missed", async () => {
    await expect(underGuard("select 1 into public.evil_into;")).rejects.toThrow(
      /PILOT-GUARD: the script executed SELECT INTO/,
    );
  });

  it("still allows the temporary table cleanup legitimately creates", async () => {
    await underGuard(
      "create temporary table pilot_probe on commit drop as select 1 as x; drop table pilot_probe;",
    );
  });
});

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

/**
 * Walks README.md's four numbered steps exactly as a tester is told to.
 *
 * This suite had every property of the scripts covered in isolation and still
 * shipped a cleanup that aborted on the documented happy path, because nothing
 * exercised the steps as a *sequence*. Step 3 tells the tester to select
 * candidate …0003 and create a membership through the interface; step 4 tells
 * them to create a new returner with a phone as well as an email. Each was
 * individually plausible; together they were the failure.
 */
async function walkReadmeSteps(client: Client, actorPersonId: string) {
  const season = await openSeasonId(client);

  // Step 3 — "Use selected person" on the second candidate.
  const stepThree = await one<{ id: string }>(
    client,
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1, $2, 'confirmed', 'returning', current_date) returning id`,
    [ID.personFullName, season],
  );
  for (const [from, to] of [
    [null, "carried_forward"],
    ["carried_forward", "confirmed"],
  ] as const) {
    await client.query(
      `insert into public.season_membership_status_events
         (season_membership_id, from_status, to_status, actor_person_id)
       values ($1, $2::public.membership_status, $3::public.membership_status, $4)`,
      [stepThree.id, from, to, actorPersonId],
    );
  }

  // Step 4 — "Confirm this is a new person", with both contact fields filled.
  const created = await interfaceCreatedReturner(client);
  const stepFour = await one<{ id: string }>(
    client,
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1, $2, 'confirmed', 'returning', current_date) returning id`,
    [created, season],
  );
  await client.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id)
     values ($1, null, 'carried_forward', $2)`,
    [stepFour.id, actorPersonId],
  );

  return { created, stepThreeMembership: stepThree.id, stepFourMembership: stepFour.id };
}

describe("the documented test sequence, end to end", () => {
  it("cleans up completely after all four README steps", async () => {
    const before = await snapshot(client);
    await client.query(SETUP);
    await walkReadmeSteps(client, durable.personId);

    // The whole point: this must not raise.
    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
  });

  it("removes the membership step 3 creates on a scenario person", async () => {
    await client.query(SETUP);
    const { stepThreeMembership } = await walkReadmeSteps(client, durable.personId);
    await client.query(CLEANUP);

    const left = await one<{ n: string }>(
      client,
      "select count(*) as n from public.season_memberships where id = $1",
      [stepThreeMembership],
    );
    expect(left.n).toBe("0");
  });

  it("is not stopped by the phone number step 4 invites", async () => {
    // UX-10 has a Phone field. A cleanup tolerating only an `example.invalid`
    // email would abort the moment a tester filled it in.
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);

    const phone = await one<{ n: string }>(
      client,
      "select count(*) as n from public.contact_points where person_id = $1 and kind = 'phone'",
      [created],
    );
    expect(phone.n).toBe("1");

    await client.query(CLEANUP);
    expect(await scenarioRowCount(client)).toBe(0);
  });

  it("leaves the alias of a person it does not sweep completely alone", async () => {
    // The alias of a *swept* person disappears whether or not the alias sweep
    // ran, because `person_aliases.person_id` is `on delete cascade` and the
    // person goes last — so asserting that proves nothing about the sweep. What
    // does prove something is the sweep's `where`: an alias on a person outside
    // the swept set must survive.
    await client.query(SETUP);
    await walkReadmeSteps(client, durable.personId);
    const bystander = await sparePerson(client, "AliasBystander");
    await client.query(
      "insert into public.person_aliases (person_id, alias, source) values ($1, 'Bys', 'operator intake')",
      [bystander],
    );

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.person_aliases where person_id = $1",
      [bystander],
    );
    expect(surviving.n).toBe("1");
  });

  it("deletes aliases before the people they hang off", async () => {
    // The ordering is what makes the alias sweep do any work at all. Moved
    // after the `people` sweep it would delete nothing, and every other
    // assertion in this file — including a whole-database snapshot — would
    // still pass, because the cascade cleans up behind it. So the order is
    // asserted directly against the script.
    // Comments stripped first. Searching the raw text meant one comment line
    // mentioning `delete from public.person_aliases` moved the match earlier
    // and made a genuinely reordered sweep pass — the same decoy that defeated
    // the declaration parser two files over.
    const statementsOnly = CLEANUP_FILE.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");

    const aliasSweep = statementsOnly.indexOf("delete from public.person_aliases");
    const peopleSweep = statementsOnly.lastIndexOf("delete from public.people");

    // Exactly one alias delete, so `indexOf` cannot be pointing at a different
    // one from the sweep under test.
    expect((statementsOnly.match(/delete from public\.person_aliases/g) ?? []).length).toBe(1);
    expect(aliasSweep).toBeGreaterThan(-1);
    expect(peopleSweep).toBeGreaterThan(-1);
    expect(
      aliasSweep,
      "the alias sweep must run before the people sweep, or it deletes nothing and the cascade hides it",
    ).toBeLessThan(peopleSweep);
  });

  it("accepts a routable domain that merely starts with the reserved one — by refusing", async () => {
    // The exemption is anchored: an address must END at `example.invalid`.
    // `example.invalid.co.uk` is registrable, so it is somebody's real contact
    // as far as this guard is concerned, and it must stop the script.
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'email', 'someone@example.invalid.co.uk', false, 'operator intake')`,
      [created],
    );

    await expectRejected(client, CLEANUP, [], "contact_points that this scenario did not create");
  });

  it("accepts both phone spellings README step 4 permits", async () => {
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);
    await client.query("delete from public.contact_points where person_id = $1", [created]);
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'phone', '+44 7700 900321', true, 'operator intake'),
              ($1, 'email', 'x@sub.example.invalid', false, 'operator intake')`,
      [created],
    );

    await client.query(CLEANUP);
    expect(await scenarioRowCount(client)).toBe(0);
  });

  it("refuses a value that carries a real contact alongside a reserved one", async () => {
    // `raw_value` is free text. Anchoring only the reserved token would permit
    // a value that also contains somebody's real address, and cascade-delete it
    // with the person. The whole value must be the reserved contact.
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'email', 'Contact him on his work address instead: alias@example.invalid', false, 'operator intake')`,
      [created],
    );

    await expectRejected(client, CLEANUP, [], "contact_points that this scenario did not create");
  });

  it("does not let the phone permit exempt an email", async () => {
    // Unscoped by kind, an address beginning with the drama range would have
    // been permitted by the phone pattern.
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'email', '07700900123@gateway.example.com', false, 'operator intake')`,
      [created],
    );

    await expectRejected(client, CLEANUP, [], "contact_points that this scenario did not create");
  });

  it("still refuses a contact value that is neither reserved nor its own", async () => {
    // The carve-out is for values that cannot reach a human. A real address on
    // a person this script would delete must still stop it.
    await client.query(SETUP);
    const { created } = await walkReadmeSteps(client, durable.personId);
    await client.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1, 'email', 'someone.real@ox.ac.uk', false, 'operator intake')`,
      [created],
    );

    await expectRejected(client, CLEANUP, [], "contact_points that this scenario did not create");
  });
});

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

  it("sweeps a person whose sentinel is in the last name, as the form produces", async () => {
    // The regression that made this whole class of defect real: the form has no
    // nickname field, so everything the application creates carries its marker
    // in `family_name`. A sweep keyed only on `known_as` matches nothing, and
    // says nothing while it does.
    await client.query(SETUP);
    const created = await interfaceCreatedReturner(client);

    const stored = await one<{ known_as: string | null; family_name: string | null }>(
      client,
      "select known_as, family_name from public.people where id = $1",
      [created],
    );
    expect(stored.known_as, "the form cannot set a nickname").toBeNull();
    expect(stored.family_name).toBe(SENTINEL);

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.people where id = $1",
      [created],
    );
    expect(surviving.n).toBe("0");
  });

  it("leaves a person carrying the sentinel in neither name alone", async () => {
    await client.query(SETUP);
    const bystander = await sparePerson(client, "NotTheSentinel");

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.people where id = $1",
      [bystander],
    );
    expect(surviving.n).toBe("1");
  });

  it("sweeps a sentinel typed in the wrong case or with stray spaces", async () => {
    // The marker is typed by a human into a form. An exact-match sweep would
    // miss `pilot-lan-74`, and miss it *silently* — the preflight counter, the
    // script's verification query and README's "what was left behind" query all
    // use the same predicate, so every one of them would report clean while the
    // rows sat in production. Same failure class as keying on a column the form
    // cannot write.
    await client.query(SETUP);

    const spellings = ["pilot-lan-74", " PILOT-LAN-74 ", "Pilot-Lan-74"];
    const created: string[] = [];
    for (const spelling of spellings) {
      const person = await one<{ id: string }>(
        client,
        `insert into public.people (given_name, family_name, known_as)
         values ('Fenwold', $1, null) returning id`,
        [spelling],
      );
      created.push(person.id);
    }

    await client.query(CLEANUP);

    for (const [index, id] of created.entries()) {
      const surviving = await one<{ n: string }>(
        client,
        "select count(*) as n from public.people where id = $1",
        [id],
      );
      expect(surviving.n, `"${spellings[index]}" was not swept`).toBe("0");
    }
  });

  it("does not read the sentinel out of any column but the two it owns", async () => {
    // The sweep matches the sentinel in `known_as` or `family_name`. Nothing
    // else. Without this test the predicate could be widened to `given_name` —
    // or to any other text column — and every test in the repository stayed
    // green, because no fixture ever put the sentinel anywhere unexpected.
    await client.query(SETUP);
    const wrongColumn = await one<{ id: string }>(
      client,
      `insert into public.people (given_name, family_name, known_as)
       values ($1, 'Realsurname', null) returning id`,
      [SENTINEL],
    );

    await client.query(CLEANUP);

    const surviving = await one<{ n: string }>(
      client,
      "select count(*) as n from public.people where id = $1",
      [wrongColumn.id],
    );
    expect(
      surviving.n,
      "a person whose GIVEN name happens to be the sentinel is not this scenario's",
    ).toBe("1");
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
    message: "holds a membership in a season other than the open one",
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

/**
 * The delete predicates themselves are governed by ADR 0019 and pinned by value
 * in `SENTINEL_ONLY_DELETES` in `tests/pilot-data-contract.test.ts` — which is a
 * stricter mechanism than the one that used to live here, and a repository-wide
 * one rather than this scenario's private copy.
 *
 * That block asserted the shape of each delete by parsing the file: how many
 * there were, that each conjoined an identifier with a sentinel, and that the
 * sweeps carried a declaration comment. Every one of those checks is now done
 * for every scenario, by value rather than by pattern, so keeping a parallel
 * version here would be two rules that can disagree — and the weaker of the two
 * is the one an author would satisfy by accident.
 */
