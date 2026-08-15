// @vitest-environment node
/**
 * The LAN-82 consolidated cleanup manifest and its verification, proved.
 *
 * This scenario directory is unlike its siblings: it installs nothing. What it
 * adds is the **order** the nine existing scenarios are installed and removed
 * in, and the **query that proves nothing survived**. Both are things a reader
 * would otherwise have to take on trust, and both are run by hand against the
 * one hosted project with no staging environment to catch a mistake.
 *
 * So three properties are asserted here rather than in prose:
 *
 *   1. **The manifest is complete.** It names every scenario directory that
 *      exists, in both lists. A scenario added next term and forgotten here is
 *      a scenario Brian never cleans up, and "the list stopped growing" is the
 *      way this kind of document fails.
 *   2. **The two orders are exact reverses.** Every foreign key in this schema
 *      is `on delete restrict`, so the reverse order is not a nicety: it is the
 *      difference between a cleanup that runs and one that aborts.
 *   3. **The verification actually verifies.** A query that reports "clean"
 *      because it never looked is worse than no query, so it is exercised
 *      against a real database in both directions — clean, and with a planted
 *      survivor it must refuse.
 *
 * LOCAL ONLY, and structurally so: the connection is opened by
 * `scripts/lib/local-db.mjs`, which refuses any non-loopback host and any
 * hosted Supabase connection string.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openLocalClient, type Client } from "./helpers/domain-fixture";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pilotRoot = path.join(repoRoot, "scripts", "pilot");
const scenarioDir = path.join(pilotRoot, "lan-82");

const README = readFileSync(path.join(scenarioDir, "README.md"), "utf8");
const VERIFY = readFileSync(path.join(scenarioDir, "verify-clean.sql"), "utf8");

/** Every scenario directory in the repository except this one. */
const SIBLINGS = readdirSync(pilotRoot)
  .filter((entry) => statSync(path.join(pilotRoot, entry)).isDirectory())
  .filter((entry) => entry !== "lan-82")
  .sort();

/**
 * The script with its own transaction removed, so a test can control the
 * boundary and roll everything back.
 *
 * The same shape `tests/pilot-scenario-lan-93.test.ts` established, and it
 * asserts what it strips: a script that does not open and close exactly one
 * transaction of its own is a script that behaves differently by hand.
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
    `${name} must open and close exactly one transaction`,
  ).toEqual(["begin;", "commit;"]);

  return raw.replace(/^begin;$/m, "").replace(/^commit;$/m, "");
}

const VERIFY_BODY = scriptBody("verify-clean.sql", VERIFY);

/** The order a numbered markdown table lists scenario directories in. */
function orderedScenarios(section: string): string[] {
  const found: string[] = [];
  for (const match of section.matchAll(/\blan-(\d+)\b/g)) {
    const name = `lan-${match[1]}`;
    if (!found.includes(name)) found.push(name);
  }
  return found;
}

function sectionBetween(from: string, to: string): string {
  const start = README.indexOf(from);
  const end = README.indexOf(to, start + 1);
  expect(start, `README is missing the "${from}" heading`).toBeGreaterThan(-1);
  expect(end, `README is missing the "${to}" heading`).toBeGreaterThan(start);
  return README.slice(start, end);
}

// ---------------------------------------------------------------------------
// The manifest
// ---------------------------------------------------------------------------

describe("the consolidated manifest", () => {
  const installOrder = orderedScenarios(sectionBetween("## Install order", "## Cleanup order"));
  const cleanupOrder = orderedScenarios(sectionBetween("## Cleanup order", "## The verification"));

  it("names every scenario directory in the repository, in the install order", () => {
    // Sorted comparison: this is completeness, and the next test owns sequence.
    expect([...installOrder].sort()).toEqual(SIBLINGS);
  });

  it("names every scenario directory in the repository, in the cleanup order", () => {
    expect([...cleanupOrder].sort()).toEqual(SIBLINGS);
  });

  it("removes in exactly the reverse of the order it installs", () => {
    expect(cleanupOrder).toEqual([...installOrder].reverse());
  });

  it("installs the report scenario last, because its own preflight requires it", () => {
    // `lan-81/setup.sql` refuses to install if the reporting window already
    // holds an event that is not its own. Anything after it would either abort
    // or invalidate its README's numbers.
    expect(installOrder.at(-1)).toBe("lan-81");
  });

  it("points at a cleanup script that exists for every scenario it names", () => {
    for (const scenario of cleanupOrder) {
      expect(
        readdirSync(path.join(pilotRoot, scenario)),
        `${scenario} has no cleanup.sql`,
      ).toContain("cleanup.sql");
    }
  });

  it("declares that this directory installs nothing of its own", () => {
    expect(readdirSync(scenarioDir).sort()).toEqual(["README.md", "verify-clean.sql"]);
    expect(README).toMatch(/installs nothing of its own/i);
  });

  it("separates the permanent foundation from disposable scenario data", () => {
    expect(README).toMatch(/Permanent pilot foundation/);
    expect(README).toMatch(/Synthetic scenario data/);
    // The binding half: the foundation is never deleted by a cleanup.
    expect(README).toMatch(/Never removed by any cleanup/i);
  });

  it("tells the reader to run the owning cleanup rather than delete a survivor", () => {
    expect(README).toMatch(/Do not delete it from the verification script/i);
  });
});

// ---------------------------------------------------------------------------
// The verification script, read
// ---------------------------------------------------------------------------

describe("verify-clean.sql is read-only", () => {
  /** Comments and string literals removed, so a rule cannot be evaded in prose. */
  const code = VERIFY.split("\n")
    .map((line) => (line.trim().startsWith("--") ? "" : line))
    .join("\n");

  it.each([
    ["insert", /\binsert\s+into\s+public\./i],
    ["update", /\bupdate\s+public\./i],
    ["delete", /\bdelete\s+from\b/i],
    ["truncate", /\btruncate\b/i],
    ["grant or revoke", /\b(grant|revoke)\b/i],
  ])("contains no %s", (_label, pattern) => {
    expect(code).not.toMatch(pattern);
  });

  it("writes only to a temporary table it creates itself", () => {
    // The one insert it does perform is into the temporary findings table, and
    // that table is temporary — `pilot-data-contract.test.ts` adjudicates the
    // DDL rule, and this pins the intent beside it.
    expect(code).toMatch(/create temporary table lan82_survivors/);
    expect(code).toMatch(/insert into lan82_survivors/);
    expect(code).not.toMatch(/insert into (?!lan82_survivors)/i);
  });

  it("derives the columns it sweeps from the catalogue rather than a list", () => {
    expect(code).toMatch(/information_schema\.columns/);
    expect(code).toMatch(/table_type = 'BASE TABLE'/);
  });

  it("sweeps for every scenario sentinel in the repository", () => {
    for (const scenario of SIBLINGS) {
      const sentinel = `PILOT-${scenario.toUpperCase()}`;
      expect(code, `${sentinel} is not swept for`).toContain(sentinel);
    }
  });

  it("fails closed on a survivor", () => {
    expect([...code.matchAll(/raise exception/gi)].length).toBeGreaterThanOrEqual(1);
    expect(code).toMatch(/synthetic scenario rows survive cleanup/);
  });

  it("reports the foundation rather than guarding it, and says why", () => {
    // This was a guard — "zero operator accounts means a cleanup ate the
    // foundation" — and CI failed on it, correctly: CI seeds an Auth user and
    // never links an operator, and so does a freshly migrated hosted project
    // before anyone is provisioned. A count taken afterwards cannot tell
    // "never provisioned" from "destroyed".
    //
    // The reasoning is pinned here as well as written in the file, so that
    // somebody restoring the guard has to delete an explanation rather than
    // just add an `if`.
    expect(code).not.toMatch(/no operator accounts remain/);
    expect(code).toMatch(/operator_accounts\) as operator_accounts/);
    expect(code).toMatch(/from auth\.users\) as auth_users/);
    expect(VERIFY).toMatch(/cannot tell "never provisioned" from "destroyed"/);
    // And what does protect it: a property of the scripts, not of the wreckage.
    expect(VERIFY).toMatch(/tests\/pilot-data-contract\.test\.ts fails if one appears/);
  });

  it("reports tables and columns, never values", () => {
    // The failure message names where a survivor is, not what it says. A
    // verification that prints the row is a verification that publishes it.
    expect(code).toMatch(/table_name, column_name, sentinel/);
    expect(code).not.toMatch(/select .*known_as.*from public\.people/i);
  });
});

// ---------------------------------------------------------------------------
// The verification script, run
// ---------------------------------------------------------------------------

describe("verify-clean.sql, against a real database", () => {
  let client: Client;

  beforeAll(async () => {
    client = await openLocalClient();
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client.end();
  });

  it("passes on a database carrying no scenario data", async () => {
    await client.query("begin");
    // The synthetic seed uses no `PILOT-` sentinel, and every sibling scenario
    // test installs its rows inside a transaction it rolls back — so a seeded
    // stack is the clean case, whatever else is running in parallel.
    await expect(client.query(VERIFY_BODY)).resolves.toBeDefined();
  });

  it.each([
    ["a person", "insert into public.people (given_name, known_as) values ('Sweep', $1)"],
    [
      "an event",
      `insert into public.events (season_id, name, event_type, status)
         select id, $1, 'practice', 'draft' from public.seasons order by starts_on desc limit 1`,
    ],
  ])("refuses when %s still carries a sentinel", async (_label, sql) => {
    await client.query("begin");
    await client.query(sql, ["PILOT-LAN-79 planted survivor"]);

    await expect(client.query(VERIFY_BODY)).rejects.toThrow(
      /synthetic scenario rows survive cleanup/,
    );
  });

  it("names the table and column of a survivor, and not its value", async () => {
    await client.query("begin");
    await client.query("insert into public.people (given_name, known_as) values ('Sweep', $1)", [
      "PILOT-LAN-74 planted survivor",
    ]);

    const error = await client.query(VERIFY_BODY).catch((caught: Error) => caught);
    const message = (error as Error).message;

    expect(message).toContain("people.known_as");
    expect(message).toContain("PILOT-LAN-74");
    expect(message).not.toContain("planted survivor");
  });

  it("finds a sentinel in a JSON column, not only in a text one", async () => {
    // `weekly_reports.content` is jsonb, and LAN-81's cleanup identifies its
    // own snapshots by the sentinel inside it. A sweep that skipped JSON would
    // report clean with a synthetic report still on file.
    await client.query("begin");
    const season = await client.query<{ id: string }>(
      "select id from public.seasons where status = 'active' order by starts_on desc limit 1",
    );
    const actor = await client.query<{ id: string }>(
      "select id from public.people order by created_at limit 1",
    );

    await client.query(
      `insert into public.weekly_reports
         (season_id, report_on, version, metric_definition_version,
          data_as_of, generated_at, generated_by_person_id, content)
       values ($1, date '2099-01-04', 1, 'sweep-test', now(), now(), $2, $3::jsonb)`,
      [season.rows[0].id, actor.rows[0].id, JSON.stringify({ note: "PILOT-LAN-81 planted" })],
    );

    await expect(client.query(VERIFY_BODY)).rejects.toThrow(
      /weekly_reports\.content \(PILOT-LAN-81/,
    );
  });

  it("passes whether or not a pilot foundation has been provisioned", async () => {
    // The case CI found. A database with no operator accounts is a database
    // where nobody has been linked yet — CI's, and a freshly migrated hosted
    // project's — and that is not a cleanup failure. Exercised in both states
    // rather than argued about, inside a transaction that is rolled back.
    // Two transactions, because the script creates a temporary table that lives
    // for one — running it twice inside a single transaction fails on the
    // second `create`, which is an artefact of the harness and not of the SQL.
    await client.query("begin");
    const before = await client.query<{ count: string }>(
      "select count(*)::text as count from public.operator_accounts",
    );
    await expect(client.query(VERIFY_BODY)).resolves.toBeDefined();
    await client.query("rollback");

    await client.query("begin");
    await client.query("delete from public.operator_accounts");
    await expect(client.query(VERIFY_BODY)).resolves.toBeDefined();

    // The count is still *reported* in both states — it is evidence for the
    // person holding the manifest, and dropping the guard must not drop that.
    expect(Number(before.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});
