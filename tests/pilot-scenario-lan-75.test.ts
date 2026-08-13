// @vitest-environment node
/**
 * The LAN-75 pilot scenario, proved against a real database.
 *
 * `scripts/pilot/lan-75/setup.sql` and `cleanup.sql` are run BY HAND against
 * the single hosted production project, with no staging environment to catch a
 * mistake in them. The properties that make them safe are asserted here rather
 * than asserted in prose, in the shape `tests/pilot-scenario-lan-93.test.ts`
 * established and `tests/pilot-scenario-lan-76.test.ts` followed.
 *
 * ## The three properties that matter
 *
 * 1. **Setup is repeatable.** Running it twice leaves exactly what running it
 *    once leaves.
 * 2. **Cleanup removes only its own rows, and is repeatable.** Proved by a
 *    whole-database digest taken before setup and compared after cleanup — not
 *    by counting the rows the script knows about, which would miss precisely
 *    the rows it should not have touched.
 * 3. **The durable pilot foundation survives.** Operator accounts, roles, role
 *    assignments, seasons and unrelated audit history are all still there,
 *    byte for byte.
 *
 * ## The precondition this file has to arrange
 *
 * The seeded local dataset configures onboarding for the current season,
 * including a subscription item type. Hosted configures none at all — which is
 * why the scenario supplies its own — and a season may hold only one
 * subscription type (`onboarding_item_types_one_subscription_per_season`). So
 * `setup.sql` refuses when the season already has one, and every happy-path
 * test here arranges the hosted-shaped precondition itself inside the
 * transaction it already rolls back. The refusal is asserted too, so both
 * branches are covered rather than one being assumed.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 *
 * Every test runs inside one transaction that is rolled back.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { one, openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const scenarioDir = path.join(repoRoot, "scripts", "pilot", "lan-75");

const SENTINEL = "PILOT-LAN-75";
const ID_PREFIX = "00750075-0075-4075-8075-";
const PERSON_ID = `${ID_PREFIX}000000000010`;
const MEMBERSHIP_ID = `${ID_PREFIX}000000000020`;

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

  // Executed inside this file's own transaction, because a `commit` in a test
  // would leave rows in a database every other test file shares.
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
/**
 * Tables whose contents a cleanup is allowed to leave changed.
 *
 * `audit_events` alone, and deliberately: neither script deletes an audit row,
 * because the activation the scenario exercises is a real thing an operator
 * really did and `entity_id` is not a foreign key precisely so the record can
 * outlive its subject. A test that demanded the digest match would be demanding
 * the opposite of the behaviour the scripts are documented to have — so the
 * table is excluded here and asserted on directly where it matters.
 */
const HISTORY_KEPT = new Set(["public.audit_events"]);

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
    if (HISTORY_KEPT.has(qualified)) continue;
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

async function count(client: Client, sql: string, params: unknown[] = []): Promise<number> {
  const row = await one<{ n: string }>(client, sql, params);
  return Number(row.n);
}

/** The open season, as `setup.sql` resolves it. */
async function openSeasonId(client: Client): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    "select id from public.seasons where status in ('open', 'active') limit 1",
  );
  return row.id;
}

/**
 * Makes the open season look like hosted: no subscription item type of its own.
 *
 * `setup.sql` refuses to add a second, and the seed configures one. Cleared
 * rather than deleted, because deleting it would cascade into every seeded
 * membership's onboarding items and change the very baseline these tests
 * compare against.
 */
async function withoutSeasonSubscriptionType(client: Client): Promise<void> {
  const seasonId = await openSeasonId(client);
  await client.query(
    `update public.onboarding_item_types
        set is_subscription = false
      where season_id = $1::uuid and is_subscription`,
    [seasonId],
  );
}

/**
 * Points the local stack's one operator account at `personId`.
 *
 * `operator_accounts_auth_user_key` makes one auth user reachable by exactly
 * one row, and the seeded stack already has that row — so an `insert … on
 * conflict do nothing` here silently does nothing, and the refusal it was meant
 * to provoke never fires. Re-pointing the existing row is what actually
 * produces the state the preflight is supposed to refuse. Rolled back with the
 * rest of the transaction.
 */
async function linkOperatorAccountTo(client: Client, personId: string): Promise<void> {
  const updated = await client.query(
    `update public.operator_accounts
        set person_id = $1::uuid, is_active = true
      where id = (select id from public.operator_accounts order by created_at limit 1)`,
    [personId],
  );
  expect(updated.rowCount, "the local stack has no operator account to re-point").toBe(1);
}

let client: Client;

beforeEach(async () => {
  client = await openLocalClient();
  // REPEATABLE READ, not the default. The whole-database digests below compare
  // a snapshot taken before setup with one taken after cleanup, and vitest runs
  // test files in parallel against one database — under READ COMMITTED another
  // suite's commit lands between the two reads and fails this suite for its
  // neighbour's work. A repeatable-read snapshot sees one consistent database
  // for the whole test, which is what makes the comparison mean anything.
  await client.query("begin transaction isolation level repeatable read");
});

afterEach(async () => {
  await client.query("rollback");
  await client.end();
});

afterAll(async () => {
  // Every test opens and closes its own client; nothing is left to close.
});

// ---------------------------------------------------------------------------
// The files themselves
// ---------------------------------------------------------------------------

describe("the scenario files", () => {
  it("ships setup, cleanup and a README", () => {
    expect(SETUP_FILE.length).toBeGreaterThan(0);
    expect(CLEANUP_FILE.length).toBeGreaterThan(0);
    expect(README_FILE.length).toBeGreaterThan(0);
  });

  it("wraps everything in exactly one transaction", () => {
    // `scriptBody` asserts the shape; this states the property by name. A
    // preflight refusal must abort before a single row is written, which is
    // only true if the whole file is one transaction.
    expect(SETUP_FILE).toMatch(/^begin;$/m);
    expect(SETUP_FILE).toMatch(/^commit;$/m);
    expect(CLEANUP_FILE).toMatch(/^begin;$/m);
    expect(CLEANUP_FILE).toMatch(/^commit;$/m);
  });

  it("never updates a row it did not create", () => {
    // `on conflict (id) do nothing`, never `do update`. A `do update` would
    // silently rewrite a row this scenario does not own.
    //
    // Comments are stripped first: the file's own header says there is no
    // `do update` in it, and a naive match on the whole text finds that
    // sentence and fails on the documentation rather than on the SQL.
    const sql = SETUP_FILE.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/do\s+update/i);
    expect(sql).toMatch(/do\s+nothing/i);
  });

  it("carries both halves of the ownership marker", () => {
    expect(SETUP_FILE).toContain(SENTINEL);
    expect(SETUP_FILE).toContain(ID_PREFIX);
    expect(CLEANUP_FILE).toContain(SENTINEL);
    expect(CLEANUP_FILE).toContain(ID_PREFIX);
  });

  it("adds no auth user, operator account, role or season", () => {
    for (const forbidden of [
      /insert\s+into\s+auth\./i,
      /insert\s+into\s+public\.operator_accounts/i,
      /insert\s+into\s+public\.roles/i,
      /insert\s+into\s+public\.role_assignments/i,
      /insert\s+into\s+public\.seasons/i,
      /insert\s+into\s+public\.events/i,
      /insert\s+into\s+public\.invitations/i,
    ]) {
      expect(SETUP_FILE, `setup.sql must not match ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("deletes no durable identity in cleanup", () => {
    for (const forbidden of [
      /delete\s+from\s+auth\./i,
      /delete\s+from\s+public\.operator_accounts/i,
      /delete\s+from\s+public\.roles\b/i,
      /delete\s+from\s+public\.role_assignments/i,
      /delete\s+from\s+public\.seasons/i,
    ]) {
      expect(CLEANUP_FILE, `cleanup.sql must not match ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("documents the item-type reach, which is the scenario's one wide effect", () => {
    expect(README_FILE).toMatch(/item types reach past this scenario/i);
    expect(CLEANUP_FILE).toMatch(/every membership confirmed through the application/i);
  });

  /**
   * The intake form collects First name, Last name, Email and Phone and
   * nothing else — it deliberately stopped asking for a nickname. So the
   * surname is the only field a tester can put a sentinel in, and the README
   * and the cleanup sweep have to agree about that or the returner created by
   * hand is never removed.
   */
  it("tells the tester to mark the returner in a field the form actually has", () => {
    expect(README_FILE).toContain("**Last name**");
    expect(README_FILE).toContain("example.invalid");
    expect(README_FILE).not.toMatch(/PILOT-LAN-75` in the\s+\*\*Known as\*\*/);
    // Matched with `in (…)` rather than a disjunction, so the predicate cannot
    // widen — the contract test pins the exact form.
    expect(CLEANUP_FILE).toContain("upper(btrim(family_name))");
  });
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe("setup.sql", () => {
  it("installs the whole scenario", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    const seasonId = await openSeasonId(client);

    expect(
      await count(
        client,
        `select count(*) as n from public.onboarding_item_types
          where id::text like $1 and season_id = $2::uuid and position($3 in label) > 0`,
        [`${ID_PREFIX}%`, seasonId, SENTINEL],
      ),
    ).toBe(3);

    const person = await one<{ known_as: string; family_name: string }>(
      client,
      "select known_as, family_name from public.people where id = $1::uuid",
      [PERSON_ID],
    );
    expect(person.known_as).toBe(SENTINEL);

    const membership = await one<{ status: string; entry: string; season_id: string }>(
      client,
      "select status::text as status, entry::text as entry, season_id from public.season_memberships where id = $1::uuid",
      [MEMBERSHIP_ID],
    );
    // `confirmed`, deliberately — not `active`, which would hand over the
    // result the scenario exists to produce.
    expect(membership.status).toBe("confirmed");
    expect(membership.entry).toBe("returning");
    expect(membership.season_id).toBe(seasonId);

    expect(
      await count(
        client,
        "select count(*) as n from public.onboarding_items where season_membership_id = $1::uuid and status = 'pending'",
        [MEMBERSHIP_ID],
      ),
    ).toBe(3);

    expect(
      await count(
        client,
        "select count(*) as n from public.season_membership_status_events where season_membership_id = $1::uuid",
        [MEMBERSHIP_ID],
      ),
    ).toBe(2);
  });

  it("gives the scenario exactly one required-and-outstanding item, plus the subscription", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    const required = await count(
      client,
      `select count(*) as n
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.is_required and not t.is_subscription`,
      [MEMBERSHIP_ID],
    );
    // Two required non-subscription items: one to waive, one to leave
    // outstanding so the override path is reachable.
    expect(required).toBe(2);

    const subscription = await one<{ is_required: boolean }>(
      client,
      `select t.is_required
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.is_subscription`,
      [MEMBERSHIP_ID],
    );
    // Marked required as well — deliberately the worst case for register D10.
    expect(subscription.is_required).toBe(true);
  });

  it("contacts nobody — every value is on a reserved, unroutable domain", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    const { rows } = await client.query<{ raw_value: string; kind: string }>(
      "select raw_value, kind::text as kind from public.contact_points where person_id = $1::uuid",
      [PERSON_ID],
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      if (row.kind === "email") expect(row.raw_value).toMatch(/@example\.invalid$/);
      // Ofcom's reserved drama range: 07700 900000–900999 can never connect.
      if (row.kind === "phone") expect(row.raw_value).toMatch(/7700 900\d{3}$/);
    }
  });

  it("is repeatable — running it twice leaves what running it once leaves", async () => {
    await withoutSeasonSubscriptionType(client);

    await client.query(SETUP);
    const afterOnce = await snapshot(client);

    await client.query(SETUP);
    const afterTwice = await snapshot(client);

    expect(afterTwice).toEqual(afterOnce);
  });

  it("names a script rather than a person as the author of its history", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    const { rows } = await client.query<{
      actor_person_id: string | null;
      actor_label: string | null;
    }>(
      "select actor_person_id, actor_label from public.season_membership_status_events where season_membership_id = $1::uuid",
      [MEMBERSHIP_ID],
    );
    for (const row of rows) {
      // Invariant M2 wants an actor; borrowing a real person's name for a
      // script's write would be a false history.
      expect(row.actor_person_id).toBeNull();
      expect(row.actor_label).toContain(SENTINEL);
    }
  });
});

describe("setup.sql refuses rather than guessing", () => {
  it("refuses when the season already has its own subscription item type", async () => {
    // The seeded state, untouched — which is what a club that has configured
    // its own onboarding looks like.
    await expect(client.query(SETUP)).rejects.toThrow(/already has its own subscription item type/);
  });

  it("refuses when a scenario identifier belongs to somebody else", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(
      "insert into public.people (id, given_name, known_as) values ($1::uuid, 'Somebody', 'Real')",
      [PERSON_ID],
    );

    await expect(client.query(SETUP)).rejects.toThrow(/Never adopt a person record/);
  });

  it("refuses when the scenario identifier has become a durable identity", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(
      "insert into public.people (id, given_name, family_name, known_as) values ($1::uuid, 'Thelbrook', 'Pilotcase', $2)",
      [PERSON_ID, SENTINEL],
    );
    await linkOperatorAccountTo(client, PERSON_ID);

    await expect(client.query(SETUP)).rejects.toThrow(/durable identity, not scenario data/);
  });

  it("refuses when no season is open or active", async () => {
    await withoutSeasonSubscriptionType(client);
    // Onboarding items and item types point at the season; the scenario cannot
    // run without one, and neither can the feature.
    //
    // `closing` rather than `archived`: `seasons_closing_is_recorded` requires
    // an archived season to name who closed it and when, and inventing that
    // would be arranging a state the club never produces.
    await client.query(
      "update public.seasons set status = 'closing' where status in ('open', 'active')",
    );

    await expect(client.query(SETUP)).rejects.toThrow(/no season is open or active/);
  });

  it("refuses when more than one season is open", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(
      `update public.seasons set status = 'open'
        where id <> (select id from public.seasons where status in ('open', 'active') limit 1)`,
    );

    await expect(client.query(SETUP)).rejects.toThrow(/seasons are open or active at once/);
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

describe("cleanup.sql", () => {
  it("removes the scenario and nothing else, byte for byte", async () => {
    await withoutSeasonSubscriptionType(client);
    const before = await snapshot(client);

    await client.query(SETUP);
    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
  });

  it("is repeatable — a second run removes nothing", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    await client.query(CLEANUP);
    const afterOnce = await snapshot(client);

    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(afterOnce);
  });

  it("runs cleanly when the scenario was never installed", async () => {
    const before = await snapshot(client);
    await client.query(CLEANUP);
    expect(await snapshot(client)).toEqual(before);
  });

  /**
   * The rows the *application* writes while the scenario is being exercised —
   * the activation's status event, the audit row, each item resolution's audit
   * row. They carry no identifier the script chose, so they are removed by
   * their link to the scenario's own identifiers.
   */
  it("removes what the application wrote against the scenario, and keeps the audit", async () => {
    await withoutSeasonSubscriptionType(client);
    const before = await snapshot(client);
    const auditBefore = await count(client, "select count(*) as n from public.audit_events");
    await client.query(SETUP);

    const actor = await one<{ id: string }>(
      client,
      "select id from public.people where id <> $1::uuid limit 1",
      [PERSON_ID],
    );
    const itemId = await one<{ id: string }>(
      client,
      "select id from public.onboarding_items where season_membership_id = $1::uuid limit 1",
      [MEMBERSHIP_ID],
    );

    // Exactly what activating through the interface produces.
    await client.query(
      `insert into public.season_membership_status_events
         (season_membership_id, from_status, to_status, actor_person_id, reason)
       values ($1::uuid, 'confirmed', 'onboarding', $2::uuid, 'system'),
              ($1::uuid, 'onboarding', 'active', $2::uuid, 'Proceeded with one item outstanding')`,
      [MEMBERSHIP_ID, actor.id],
    );
    await client.query(
      "update public.season_memberships set status = 'active', activated_on = current_date where id = $1::uuid",
      [MEMBERSHIP_ID],
    );
    await client.query(
      `insert into public.audit_events
         (actor_person_id, action, entity_table, entity_id, from_state, to_state)
       values ($1::uuid, 'season_membership_activated', 'season_memberships', $2::uuid, 'onboarding', 'active'),
              ($1::uuid, 'onboarding_item_resolved', 'onboarding_items', $3::uuid, 'pending', 'waived')`,
      [actor.id, MEMBERSHIP_ID, itemId.id],
    );

    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
    // The two audit rows the "activation" wrote are still there. Cleanup tidies
    // up the synthetic member, never the record of what somebody did.
    expect(await count(client, "select count(*) as n from public.audit_events")).toBe(
      auditBefore + 2,
    );
  });

  /**
   * The returner the tester creates through the interface, marked the way the
   * README tells them to mark it.
   */
  it("removes the returner created by hand, and its generated items", async () => {
    await withoutSeasonSubscriptionType(client);
    const before = await snapshot(client);
    await client.query(SETUP);

    const seasonId = await openSeasonId(client);
    // Marked the way the README tells the tester to mark it: the sentinel in
    // the surname, which is the only field the intake form offers for one.
    const person = await one<{ id: string }>(
      client,
      "insert into public.people (given_name, family_name) values ('Handmade', $1) returning id",
      [SENTINEL],
    );
    await client.query(
      "insert into public.contact_points (person_id, kind, raw_value, is_preferred, source) values ($1::uuid, 'email', 'handmade@example.invalid', true, 'operator intake')",
      [person.id],
    );
    await client.query(
      "insert into public.person_aliases (person_id, alias, source) values ($1::uuid, $2, 'operator intake')",
      [person.id, SENTINEL],
    );
    const membership = await one<{ id: string }>(
      client,
      `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
       values ($1::uuid, $2::uuid, 'confirmed', 'returning', current_date) returning id`,
      [person.id, seasonId],
    );
    await client.query(
      `insert into public.season_membership_status_events (season_membership_id, from_status, to_status, actor_person_id)
       values ($1::uuid, null, 'carried_forward', (select id from public.people where id <> $2::uuid limit 1))`,
      [membership.id, person.id],
    );
    // The items the application generates on confirmation, from the pilot types.
    await client.query(
      `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
       select $1::uuid, $2::uuid, t.id, 'pending'
         from public.onboarding_item_types t
        where t.id::text like $3`,
      [membership.id, seasonId, `${ID_PREFIX}%`],
    );
    await client.query(
      `insert into public.audit_events (actor_person_id, action, entity_table, entity_id)
       values ((select id from public.people where id <> $1::uuid limit 1), 'returner_membership_confirmed', 'season_memberships', $2::uuid)`,
      [person.id, membership.id],
    );

    await client.query(CLEANUP);

    expect(await snapshot(client)).toEqual(before);
  });

  /**
   * The scenario's one wide effect: while it is installed, a membership that is
   * NOT scenario data also receives the pilot items. Cleanup must take those
   * items and leave that membership completely alone.
   */
  it("takes its items off an unrelated membership without touching the membership", async () => {
    await withoutSeasonSubscriptionType(client);
    const before = await snapshot(client);
    await client.query(SETUP);

    const seasonId = await openSeasonId(client);
    const bystander = await one<{ id: string }>(
      client,
      `select m.id from public.season_memberships m
        where m.season_id = $1::uuid and m.id <> $2::uuid
        order by m.id limit 1`,
      [seasonId, MEMBERSHIP_ID],
    );
    await client.query(
      `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
       select $1::uuid, $2::uuid, t.id, 'pending'
         from public.onboarding_item_types t
        where t.id::text like $3`,
      [bystander.id, seasonId, `${ID_PREFIX}%`],
    );

    await client.query(CLEANUP);

    // The bystander's own rows are exactly as they were — including the
    // onboarding items the seed gave it, which are not this scenario's.
    expect(await snapshot(client)).toEqual(before);
    expect(
      await count(
        client,
        "select count(*) as n from public.season_memberships where id = $1::uuid",
        [bystander.id],
      ),
    ).toBe(1);
  });
});

describe("cleanup.sql refuses rather than widening", () => {
  it("refuses when a scenario identifier is not this scenario's row", async () => {
    await client.query(
      "insert into public.people (id, given_name, known_as) values ($1::uuid, 'Somebody', 'Real')",
      [PERSON_ID],
    );

    await expect(client.query(CLEANUP)).rejects.toThrow(
      /Refusing to delete somebody else's person/,
    );
  });

  it("refuses when a sentinel person has an operator account", async () => {
    const person = await one<{ id: string }>(
      client,
      "insert into public.people (given_name, family_name) values ('Handmade', $1) returning id",
      [SENTINEL],
    );
    await linkOperatorAccountTo(client, person.id);

    await expect(client.query(CLEANUP)).rejects.toThrow(
      /linked to an operator account. Durable identities are never removed/,
    );
  });

  it("refuses when a sentinel person holds a role assignment", async () => {
    await withoutSeasonSubscriptionType(client);
    await client.query(SETUP);

    // A non-constitutional seat. `role_assignments_one_holder_per_office`
    // excludes a second concurrent holder of an Office, so picking whichever
    // role came first would fail on invariant I3 rather than on the refusal
    // this test is about.
    const role = await one<{ id: string; scope: string; is_constitutional_office: boolean }>(
      client,
      "select id, scope::text as scope, is_constitutional_office from public.roles where not is_constitutional_office limit 1",
    );
    const cycle = await one<{ id: string }>(
      client,
      role.scope === "season"
        ? "select id from public.seasons limit 1"
        : "select id from public.committee_years limit 1",
    );
    await client.query(
      `insert into public.role_assignments
         (person_id, role_id, scope, is_constitutional_office, season_id, committee_year_id,
          effective_from)
       values ($1::uuid, $2::uuid, $3::public.role_scope, $4,
               case when $3 = 'season' then $5::uuid end,
               case when $3 = 'committee_year' then $5::uuid end,
               current_date)`,
      [PERSON_ID, role.id, role.scope, role.is_constitutional_office, cycle.id],
    );

    await expect(client.query(CLEANUP)).rejects.toThrow(/holds a role assignment/);
  });
});
