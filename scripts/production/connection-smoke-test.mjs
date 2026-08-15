#!/usr/bin/env node
/**
 * Post-deployment proof that the hosted runtime credential actually works.
 *
 * **This is an owner-run production procedure. Brian runs it, by hand, after
 * activating the credential. No agent runs it, no workflow runs it, and nothing
 * under `supabase/`, `src/`, `.github/workflows/` or the Dockerfile may
 * reference it.** `tests/production-smoke-contract.test.ts` enforces that.
 *
 * ## Why it exists as a separate thing
 *
 * `/api/health` reports whether `DATABASE_URL` is *present*. It deliberately
 * never connects, because a health check that fails on a database blip turns a
 * blip into an outage. So presence is all the deploy gate can prove, and
 * presence is not correctness: a typo'd password, a role without `BYPASSRLS`,
 * or a pooler that refuses the login all pass that gate and fail on the first
 * real transaction an operator attempts.
 *
 * This script closes that gap once, deliberately, with a human present.
 *
 * ## What it proves
 *
 * 1. The credential authenticates against the approved target.
 * 2. Reads return rows — the `BYPASSRLS` decision is working. A role that
 *    cannot bypass reads zero rows from every table without raising anything,
 *    which is the failure ADR 0014 warns is invisible until production.
 * 3. A transaction **commits**.
 * 4. A forced **rollback leaves no row behind**.
 * 5. Access that must be refused *is* refused — the append-only history cannot
 *    be rewritten by this role.
 *
 * ## What it writes, and how it cleans up
 *
 * One `people` row, with a deterministic identifier and a `PILOT-LAN-94`
 * sentinel in its name, inserted and removed inside this run. Deterministic
 * means re-running is safe: the row is deleted before it is created and again
 * afterwards, so a half-finished run leaves nothing to reconcile by hand.
 *
 * `tests/production-smoke-contract.test.ts` proves that whole sequence against
 * **local** Supabase, including that it is repeatable and that it removes only
 * its own row.
 *
 * ## Running it
 *
 *   DATABASE_URL='<the approved connection string>' \
 *     node scripts/production/connection-smoke-test.mjs --confirm-target fggbgeraiadetyiyjlvb
 *
 * The confirmation is not ceremony: it is the difference between a command that
 * can be pasted by accident and one that names the production project out loud.
 * The connection string is passed in the environment so it never becomes a
 * shell-history entry with a password in it.
 */
import { pathToFileURL } from "node:url";

import pg from "pg";

/**
 * The approved production target, restated here rather than imported.
 *
 * `src/lib/db/runtime-target.ts` is TypeScript that ships inside the container;
 * this is a standalone operator script. The duplication is the cost of that
 * separation, and `tests/production-smoke-contract.test.ts` fails if the two
 * ever disagree — the same arrangement ADR 0014 already uses for the two
 * local-only guards.
 */
export const APPROVED_HOSTED_TARGET = {
  hostname: "aws-0-eu-west-2.pooler.supabase.com",
  port: "6543",
  database: "postgres",
  username: "app_runtime.fggbgeraiadetyiyjlvb",
};

/** The production project this script is allowed to be pointed at. */
export const PRODUCTION_PROJECT_REF = "fggbgeraiadetyiyjlvb";

/** The ownership marker: a deterministic identifier plus a sentinel. */
export const SMOKE_PERSON_ID = "9400c0de-0000-4000-8000-000000000094";
export const SMOKE_SENTINEL = "PILOT-LAN-94";
export const SMOKE_PERSON_NAME = `${SMOKE_SENTINEL} connection smoke test`;

/**
 * Refuses to proceed unless a human named the production project on the command
 * line.
 *
 * Also refuses inside a test runner or CI. This script is the one thing in the
 * repository allowed to open a hosted database, and "allowed" must not decay
 * into "reachable from `npm test`" — the contract test exercises the *pure*
 * functions and the transaction sequence against local Supabase instead.
 *
 * @param {readonly string[]} [argv]
 * @param {Record<string, string | undefined>} [env]
 * @returns {string}
 */
export function assertExplicitProductionTarget(argv = process.argv.slice(2), env = process.env) {
  if (env.CI === "true" || env.VITEST || env.NODE_ENV === "test") {
    throw new Error(
      "Refusing to run inside CI or a test runner. This is an owner-run production procedure.",
    );
  }

  const index = argv.indexOf("--confirm-target");
  const confirmed = index === -1 ? undefined : argv[index + 1];

  if (!confirmed) {
    throw new Error(
      "Refusing to run without an explicit target. " +
        `Re-run with: --confirm-target ${PRODUCTION_PROJECT_REF}`,
    );
  }

  if (confirmed !== PRODUCTION_PROJECT_REF) {
    throw new Error(
      `Refusing to run against "${confirmed}": this script targets one project only.`,
    );
  }

  return confirmed;
}

/**
 * Refuses any connection string that is not the approved target.
 *
 * Never echoes the value — it carries a password. Named components only.
 */
export function assertApprovedTarget(value) {
  if (!value || !value.trim()) {
    throw new Error("DATABASE_URL is not set. Pass the approved connection string, unquoted.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("DATABASE_URL is not a valid connection string.");
  }

  const actual = {
    hostname: parsed.hostname,
    port: parsed.port,
    database: parsed.pathname.replace(/^\//, ""),
    username: parsed.username,
  };

  const mismatched = Object.keys(APPROVED_HOSTED_TARGET).filter(
    (component) => actual[component] !== APPROVED_HOSTED_TARGET[component],
  );

  if (mismatched.length > 0) {
    throw new Error(
      `Refusing a database that is not the approved target: ${mismatched.join(", ")} did not match.`,
    );
  }

  return value.trim();
}

/** Runs one statement, returning its PostgreSQL error code or null on success. */
async function errorCode(client, sql) {
  try {
    await client.query(sql);
    return null;
  } catch (error) {
    return error.code ?? "unknown";
  }
}

/**
 * Runs a statement that is *expected* to be refused, inside a transaction that
 * is always rolled back.
 *
 * The rollback is not tidiness, it is the whole safety property. These probes
 * assert that the runtime role **cannot** rewrite audit history or change the
 * schema. If one of them is ever permitted — the wrong role in the secret, a
 * grant added later — then running it bare would rewrite every audit row in
 * production, or leave a stray table behind. Inside a transaction that always
 * rolls back, a probe that succeeds still changes nothing, and the check simply
 * reports that the refusal did not hold.
 */
async function refusalCode(client, sql) {
  await client.query("begin");
  const code = await errorCode(client, sql);
  // Aborted or not, the transaction ends here and nothing it did survives.
  await client.query("rollback");
  return code;
}

async function exists(client) {
  const { rows } = await client.query("select 1 from public.people where id = $1", [
    SMOKE_PERSON_ID,
  ]);
  return rows.length === 1;
}

async function removeSmokeRow(client) {
  await client.query("delete from public.people where id = $1", [SMOKE_PERSON_ID]);
}

/**
 * The proof itself, against an already-connected client.
 *
 * Exported so the contract test can run this exact sequence against local
 * Supabase. Returns a report of what was observed rather than printing, so the
 * test asserts on values and the caller decides what to show a human.
 */
export async function runConnectionSmokeTest(client) {
  // Deterministic start: a previous half-finished run leaves nothing to
  // reconcile by hand, and re-running is always safe.
  await removeSmokeRow(client);

  const readCount = await client.query("select count(*)::int as count from public.people");
  // Zero rows from a populated table is the signature of a role that cannot
  // bypass RLS. It is reported rather than asserted here; the caller decides.
  const readsReturnRows = readCount.rows[0].count > 0;

  // 1 — a forced rollback must leave nothing behind.
  await client.query("begin");
  await client.query("insert into public.people (id, given_name) values ($1, $2)", [
    SMOKE_PERSON_ID,
    SMOKE_PERSON_NAME,
  ]);
  const visibleInsideTransaction = await exists(client);
  await client.query("rollback");
  const survivedRollback = await exists(client);

  // 2 — a commit must persist.
  await client.query("begin");
  await client.query("insert into public.people (id, given_name) values ($1, $2)", [
    SMOKE_PERSON_ID,
    SMOKE_PERSON_NAME,
  ]);
  await client.query("commit");
  const survivedCommit = await exists(client);

  // 3 — deterministic cleanup.
  await removeSmokeRow(client);
  const cleanedUp = !(await exists(client));

  // 4 — what must be refused, is. Both probes roll back unconditionally, so a
  // refusal that unexpectedly does not hold still leaves production untouched.
  const historyRewriteCode = await refusalCode(
    client,
    "update public.audit_events set occurred_at = now()",
  );
  const schemaChangeCode = await refusalCode(
    client,
    "create table public.smoke_test_probe (id int)",
  );

  return {
    readsReturnRows,
    visibleInsideTransaction,
    rollbackLeftNothing: !survivedRollback,
    commitPersisted: survivedCommit,
    cleanedUp,
    historyRewriteRefused: historyRewriteCode === "42501",
    schemaChangeRefused: schemaChangeCode !== null,
  };
}

/** Every check that must hold, in the order a reader wants to see them. */
export const REQUIRED_CHECKS = [
  ["reads return rows (the role can see the club's data)", "readsReturnRows"],
  ["a row is visible inside its own transaction", "visibleInsideTransaction"],
  ["a forced rollback left no row behind", "rollbackLeftNothing"],
  ["a transaction committed", "commitPersisted"],
  ["the synthetic row was removed", "cleanedUp"],
  ["rewriting audit history is refused", "historyRewriteRefused"],
  ["changing the schema is refused", "schemaChangeRefused"],
];

async function main() {
  assertExplicitProductionTarget();
  const connectionString = assertApprovedTarget(process.env.DATABASE_URL);

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const report = await runConnectionSmokeTest(client);

    let failed = false;
    for (const [label, key] of REQUIRED_CHECKS) {
      const passed = report[key];
      if (!passed) failed = true;
      console.log(`${passed ? "PASS" : "FAIL"}  ${label}`);
    }

    if (failed) {
      console.error(
        "\nThe hosted credential is not correct. Nothing was left behind, but do not " +
          "announce the deployment as verified. See docs/deployment.md § Activating the runtime database.",
      );
      process.exitCode = 1;
    } else {
      console.log("\nAll checks passed. The hosted runtime credential is working.");
    }
  } finally {
    await client.end();
  }
}

// Only when run directly. Importing this module — which the contract test does —
// must never open a connection.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
