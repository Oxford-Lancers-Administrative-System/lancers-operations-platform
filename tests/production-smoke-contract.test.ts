// @vitest-environment node
/**
 * The owner-run production procedure, proved against **local** Supabase.
 *
 * `scripts/production/connection-smoke-test.mjs` is the one script in this
 * repository permitted to open the hosted database. That permission is narrow
 * and it has to stay narrow, so this file asserts three separate things:
 *
 * 1. **It cannot be reached by accident.** It refuses without an explicit
 *    `--confirm-target`, refuses a target that is not the production project,
 *    refuses a connection string that is not the approved one, and refuses to
 *    run inside CI or a test runner at all.
 * 2. **Its transaction sequence is correct**, exercised here against the local
 *    stack: the commit persists, the forced rollback leaves nothing, the
 *    cleanup removes its own row and only its own row, and running it twice is
 *    safe.
 * 3. **Nothing automatic references it.** No migration, seed, workflow,
 *    Dockerfile or application path may invoke it — the same rule
 *    `AGENTS.md` applies to `scripts/pilot/`.
 *
 * Importing the module must not open a connection; the script guards its own
 * entry point for exactly that reason.
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  APPROVED_HOSTED_TARGET as SCRIPT_TARGET,
  assertApprovedTarget,
  assertExplicitProductionTarget,
  PRODUCTION_PROJECT_REF,
  REQUIRED_CHECKS,
  runConnectionSmokeTest,
  SMOKE_PERSON_ID,
  SMOKE_SENTINEL,
} from "../scripts/production/connection-smoke-test.mjs";
import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import { createRuntimeRole, dropRuntimeRole } from "./helpers/runtime-role";
import { APPROVED_HOSTED_TARGET } from "@/lib/db/runtime-target";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

const APPROVED = `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/${APPROVED_HOSTED_TARGET.database}`;

// ---------------------------------------------------------------------------
// 1 — it cannot be reached by accident
// ---------------------------------------------------------------------------

describe("the script refuses to run without an explicit production target", () => {
  /** A plain environment, so the CI/test refusal does not mask the others. */
  const OWNER_SHELL = { CI: "false", VITEST: undefined, NODE_ENV: "production" } as Record<
    string,
    string | undefined
  >;

  it("refuses with no confirmation at all", () => {
    expect(() => assertExplicitProductionTarget([], OWNER_SHELL)).toThrow(
      /without an explicit target/i,
    );
  });

  it("refuses when the flag is present but empty", () => {
    expect(() => assertExplicitProductionTarget(["--confirm-target"], OWNER_SHELL)).toThrow(
      /without an explicit target/i,
    );
  });

  it("refuses a different project reference", () => {
    expect(() =>
      assertExplicitProductionTarget(["--confirm-target", "abcdefghijklmnop"], OWNER_SHELL),
    ).toThrow(/targets one project only/i);
  });

  it("accepts only the production project, named in full", () => {
    expect(
      assertExplicitProductionTarget(["--confirm-target", PRODUCTION_PROJECT_REF], OWNER_SHELL),
    ).toBe(PRODUCTION_PROJECT_REF);
  });

  it.each([
    ["CI", { CI: "true" }],
    ["a Vitest run", { VITEST: "true" }],
    ["NODE_ENV=test", { NODE_ENV: "test" }],
  ])("refuses inside %s even with a correct confirmation", (_label, env) => {
    expect(() =>
      assertExplicitProductionTarget(["--confirm-target", PRODUCTION_PROJECT_REF], env),
    ).toThrow(/owner-run production procedure/i);
  });
});

describe("the script refuses any database but the approved one", () => {
  it("accepts the approved target", () => {
    expect(assertApprovedTarget(APPROVED)).toBe(APPROVED);
  });

  it.each([
    ["nothing at all", ""],
    ["the local stack", "postgresql://postgres:postgres@127.0.0.1:54322/postgres"],
    ["the admin role", `postgresql://postgres:pw@${APPROVED_HOSTED_TARGET.hostname}:6543/postgres`],
    [
      "the direct host for the same project",
      "postgresql://postgres:pw@db.fggbgeraiadetyiyjlvb.supabase.co:5432/postgres",
    ],
    [
      "another project on the approved pooler",
      `postgresql://app_runtime.abcdefghijklmnop:pw@${APPROVED_HOSTED_TARGET.hostname}:6543/postgres`,
    ],
    // Query smuggling. `pg-connection-string` copies these into the client
    // config, where `host`, `port` and `user` override the authority — so each
    // reads as the approved target and opens something else. This script is the
    // one thing permitted to open production, which made its copy of the guard
    // the least-tested of the four until independent review said so.
    ["a host smuggled through the query string", `${APPROVED}?host=attacker.example.com`],
    ["host and port smuggled", `${APPROVED}?host=attacker.example.com&port=5432`],
    ["the admin role smuggled", `${APPROVED}?user=postgres`],
    ["smuggling hidden behind a fragment", `${APPROVED}#?host=attacker.example.com`],
  ])("refuses %s", (_label, url) => {
    expect(() => assertApprovedTarget(url)).toThrow();
  });

  it("refuses query and fragment components by name, not incidentally", () => {
    // Pins the reason, so a future change that drops the refusal but still
    // happens to reject these strings for some other reason fails here.
    expect(() => assertApprovedTarget(`${APPROVED}?host=attacker.example.com`)).toThrow(
      /query or fragment/i,
    );
    expect(() => assertApprovedTarget(`${APPROVED}#x`)).toThrow(/query or fragment/i);
  });

  it("never echoes the connection string, which carries a password", () => {
    const secret = "s3cret-p4ssw0rd";
    try {
      assertApprovedTarget(`postgresql://postgres:${secret}@db.example.com:5432/postgres`);
      expect.unreachable("must have refused");
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });

  it("pins the same target the application does", () => {
    // Two copies exist on purpose — one ships in the container, one is an
    // operator script. Drift between them is the cost, and this is the payment.
    expect(SCRIPT_TARGET).toEqual(APPROVED_HOSTED_TARGET);
  });
});

// ---------------------------------------------------------------------------
// 2 — the transaction sequence, against the local stack
// ---------------------------------------------------------------------------

describe("the smoke sequence, run against local Supabase", () => {
  /**
   * Run as the **runtime role**, not as the admin.
   *
   * The sequence includes two refusals — rewriting audit history, changing the
   * schema — and `postgres` owns every table locally, so running it as the
   * admin would report those as failures while proving nothing. Connecting as
   * a role with the approved shape is what makes the local run evidence about
   * the hosted one.
   */
  let admin: pg.Client;
  let client: pg.Client;
  /** A bystander row, to prove cleanup removes only what the script created. */
  const BYSTANDER_ID = "9400c0de-0000-4000-8000-0000000000b5";
  const ROLE = "app_runtime_smoke_contract";

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: resolveLocalDatabaseUrl() });
    await admin.connect();

    client = (await createRuntimeRole(admin, ROLE)).client;

    await admin.query("delete from public.people where id = any($1)", [
      [SMOKE_PERSON_ID, BYSTANDER_ID],
    ]);
    await admin.query("insert into public.people (id, given_name) values ($1, $2)", [
      BYSTANDER_ID,
      "LAN-94 bystander",
    ]);
  }, 30_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    await admin?.query("delete from public.people where id = any($1)", [
      [SMOKE_PERSON_ID, BYSTANDER_ID],
    ]);
    await dropRuntimeRole(admin, ROLE);
    await admin?.end();
  });

  it("passes every required check", async () => {
    const report = await runConnectionSmokeTest(client);

    for (const [label, key] of REQUIRED_CHECKS as [string, string][]) {
      expect((report as Record<string, boolean>)[key], `${label} did not hold`).toBe(true);
    }
  });

  it("leaves no row of its own behind", async () => {
    await runConnectionSmokeTest(client);

    const { rows } = await client.query("select 1 from public.people where id = $1", [
      SMOKE_PERSON_ID,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("is repeatable — a second run is as clean as the first", async () => {
    const first = await runConnectionSmokeTest(client);
    const second = await runConnectionSmokeTest(client);

    expect(second).toEqual(first);
  });

  it("removes only its own row", async () => {
    await runConnectionSmokeTest(client);

    const { rows } = await client.query("select 1 from public.people where id = $1", [
      BYSTANDER_ID,
    ]);
    expect(rows, "the bystander row must survive").toHaveLength(1);
  });

  interface AuditRow {
    id: string;
    action: string;
    entity_table: string;
    from_state: string | null;
    to_state: string | null;
    occurred_at: string;
  }

  const AUDIT_SNAPSHOT = `select id, action, entity_table, from_state, to_state,
                                 occurred_at::text as occurred_at
                            from public.audit_events`;

  it("leaves nothing behind even when the refusals do not hold", async () => {
    // The probes assert that the runtime role CANNOT rewrite audit history or
    // create a table. Run as a role that can — the wrong credential in the
    // secret, or a grant added later — a bare probe would rewrite every audit
    // row in production and leave a stray table behind. Both run inside a
    // transaction that always rolls back, so the checks report `false` and
    // production is untouched.
    //
    // This is a regression test: the first version of the script did leave a
    // `smoke_test_probe` table in the local database, which is how the defect
    // was found.
    // Row content, not a row count. A count over the whole table is not a
    // property of this database: Vitest runs test files in parallel against one
    // shared local stack, so a neighbouring suite writing or clearing its own
    // audit rows inside this window moved the number and failed the assertion
    // for a reason the smoke test had nothing to do with — observed both
    // directions, four rows up and four rows down. What the probe is being
    // tested for is that its history *rewrite* rolls back, and that is a
    // statement about rows that existed before it ran: none of them changed.
    const before = await admin.query<AuditRow>(AUDIT_SNAPSHOT);

    const report = await runConnectionSmokeTest(admin);

    // The admin owns every table, so neither refusal holds — that is the point.
    expect(report.historyRewriteRefused).toBe(false);
    expect(report.schemaChangeRefused).toBe(false);

    const probeTable = await admin.query<{ table: string | null }>(
      "select to_regclass('public.smoke_test_probe')::text as table",
    );
    expect(probeTable.rows[0].table, "the probe table must not survive").toBeNull();

    const after = await admin.query<AuditRow>(AUDIT_SNAPSHOT);
    const afterById = new Map(after.rows.map((row) => [row.id, row]));
    const survivors = before.rows.filter((row) => afterById.has(row.id));

    // A vacuous pass is the failure mode this replaces: if the probe had
    // emptied the table, every row would be "unchanged" by absence.
    expect(survivors.length, "there was no audit history to check against").toBeGreaterThan(0);
    for (const row of survivors) {
      expect(afterById.get(row.id), "audit history must be untouched").toEqual(row);
    }

    // And its own synthetic row is still cleaned up on this path.
    const { rows } = await admin.query("select 1 from public.people where id = $1", [
      SMOKE_PERSON_ID,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("marks what it writes with a deterministic identifier and a sentinel", async () => {
    // The ownership marker the pilot-data runbook requires: no new column, no
    // new table, and re-running cannot accumulate rows.
    expect(SMOKE_PERSON_ID).toMatch(/^[0-9a-f-]{36}$/);
    expect(SMOKE_SENTINEL).toBe("PILOT-LAN-94");

    await client.query("begin");
    await client.query("insert into public.people (id, given_name) values ($1, $2)", [
      SMOKE_PERSON_ID,
      `${SMOKE_SENTINEL} probe`,
    ]);
    const { rows } = await client.query<{ given_name: string }>(
      "select given_name from public.people where id = $1",
      [SMOKE_PERSON_ID],
    );
    await client.query("rollback");

    expect(rows[0].given_name).toContain(SMOKE_SENTINEL);
  });
});

// ---------------------------------------------------------------------------
// 3 — nothing automatic may reference it
// ---------------------------------------------------------------------------

describe("no automated path can invoke the production procedure", () => {
  const AUTOMATED = [
    ".github/workflows/ci.yml",
    ".github/workflows/deploy.yml",
    ".github/workflows/merge.yml",
    "Dockerfile",
    "package.json",
    "scripts/seed-local.mjs",
    "scripts/local-supabase-command.mjs",
    "supabase/seed.sql",
  ];

  it.each(AUTOMATED.filter((file) => file !== "supabase/seed.sql"))(
    "%s does not reference scripts/production/",
    (file) => {
      expect(read(file)).not.toMatch(/scripts\/production/);
    },
  );

  it("no migration references it", () => {
    for (const file of readdirSync(path.join(repoRoot, "supabase/migrations"))) {
      expect(read(`supabase/migrations/${file}`)).not.toMatch(/scripts\/production/);
    }
  });

  it("no application source references it", () => {
    // A production procedure reachable from a request handler is not a
    // procedure, it is a feature nobody reviewed.
    const hits = execSync("grep -rl 'scripts/production' src || true", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    expect(hits).toBe("");
  });

  it("is not wired to an npm script", () => {
    const manifest = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    for (const command of Object.values(manifest.scripts)) {
      expect(command).not.toMatch(/scripts\/production/);
    }
  });

  it("has a README telling a human it is theirs to run", () => {
    const readme = read("scripts/production/README.md");
    expect(readme).toMatch(/owner-run|Brian runs/i);
    expect(readme).toMatch(/--confirm-target/);
    expect(readme).not.toMatch(/postgres(ql)?:\/\/[^\s`"']*pooler/i);
  });
});
