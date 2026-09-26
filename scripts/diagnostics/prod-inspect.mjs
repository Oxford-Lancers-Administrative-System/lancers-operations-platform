#!/usr/bin/env node
/**
 * Read-only production inspection for diagnostic agents — LAN-435.
 *
 *   npm run -s prod:inspect -- --purpose "LAN-434: Ian's seat" "select … from public.role_assignments …"
 *   npm run -s prod:inspect -- --purpose "LAN-434" --columns role_assignments
 *
 * Connects to production as `agent_readonly` and nothing else. That role is
 * created by Brian with scripts/production/agent-readonly.sql and can read the
 * non-sensitive columns of `public` and write nothing; PostgreSQL enforces both.
 * Everything this file does on top — the read-only transaction, the timeout,
 * the single-statement rule, the identity check — is defence in depth. ADR 0040
 * records the whole model.
 *
 * ## Why this is not a flag on the local tooling
 *
 * `src/lib/db/url.ts` and `scripts/lib/local-db.mjs` refuse every non-loopback
 * database unconditionally, and must keep doing so: they are what stops seed
 * commands and tests reaching production. This file does not import them and
 * they know nothing about it. It is a separate, single-purpose path whose only
 * reachable target is the literal below, as the one role below.
 *
 * ## Where the password comes from
 *
 * `AGENT_READONLY_PASSWORD` in the `.env.local` of the **primary checkout** —
 * found through git, so a worktree finds the same file — and nowhere else. Not
 * the process environment, not a flag, not a connection string: there is
 * nothing to point elsewhere. The password is never printed or logged.
 *
 * ## What it records
 *
 * Every attempt appends one line to ~/.lancers/prod-inspect.jsonl: when, which
 * worktree and commit, the stated purpose, the SQL, the row count and any error
 * code. Never the rows, which is production data.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

/**
 * The only database and role this tool can reach. A literal, not
 * configuration, for the reason ADR 0026 gives: configuration is the thing
 * being defended against. Session mode (5432), not the application's
 * transaction mode (6543): Supabase applies per-role settings such as
 * `statement_timeout` only in session mode.
 */
export const INSPECT_TARGET = Object.freeze({
  host: "aws-0-eu-west-2.pooler.supabase.com",
  port: 5432,
  database: "postgres",
  user: "agent_readonly.fggbgeraiadetyiyjlvb",
});

export const ROLE = "agent_readonly";
export const PASSWORD_VARIABLE = "AGENT_READONLY_PASSWORD";
export const DEFAULT_ROW_LIMIT = 200;
const STATEMENT_TIMEOUT = "15s";
const LOG_PATH = join(homedir(), ".lancers", "prod-inspect.jsonl");

/**
 * `date` columns come back as the text PostgreSQL sent. The driver's default
 * turns them into a local-midnight `Date`, which then prints as the previous
 * day's evening in UTC — a misleading answer to "when does this seat start?".
 */
const DATE_OID = 1082;
export const INSPECT_TYPES = Object.freeze({
  getTypeParser: (oid, format) =>
    oid === DATE_OID ? (value) => value : pg.types.getTypeParser(oid, format),
});

const READ_KEYWORDS = new Set(["select", "with", "table", "values", "explain", "show"]);

/**
 * Refuses automated contexts: tests and CI never reach production.
 *
 * @param {Record<string, string | undefined>} [env]
 */
export function assertInteractiveContext(env = process.env) {
  if (env.CI || env.VITEST || env.NODE_ENV === "test") {
    throw new Error("prod:inspect refuses to run inside CI or a test runner.");
  }
}

/**
 * The statement, trimmed of one trailing semicolon, if it reads as a single
 * read. PostgreSQL is the real boundary; this only turns an obvious mistake
 * into a clear message before anything connects.
 */
export function assertReadStatement(sql) {
  const statement = String(sql ?? "")
    .trim()
    .replace(/;\s*$/, "");
  if (!statement) throw new Error("No SQL given.");

  const keyword = statement
    .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "")
    .match(/^[a-z]+/i)?.[0]
    ?.toLowerCase();
  if (!keyword || !READ_KEYWORDS.has(keyword)) {
    throw new Error(
      `prod:inspect runs reads only (${[...READ_KEYWORDS].join(", ")}); got "${keyword ?? "?"}".`,
    );
  }
  if (keyword === "explain" && /\banalyze\b/i.test(statement)) {
    throw new Error("EXPLAIN ANALYZE executes the statement; use plain EXPLAIN.");
  }
  return statement;
}

/** Parses `--purpose`, `--columns`, `--limit` and the SQL. */
export function parseArguments(argv) {
  const options = { purpose: null, columns: null, limit: DEFAULT_ROW_LIMIT, sql: null };
  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    if (argument === "--purpose") options.purpose = argv[++i] ?? null;
    else if (argument === "--columns") {
      const next = argv[i + 1];
      options.columns = next && !next.startsWith("--") ? argv[++i] : "";
    } else if (argument === "--limit") options.limit = Number(argv[++i]);
    else if (options.sql === null) options.sql = argument;
    else throw new Error(`Unexpected argument "${argument}". Quote the SQL as one argument.`);
  }
  if (!options.purpose?.trim()) {
    throw new Error('--purpose is required: say what you are investigating, e.g. "LAN-434".');
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 5000) {
    throw new Error("--limit must be a whole number from 1 to 5000.");
  }
  if (options.columns === null && options.sql === null) {
    throw new Error("Give a SQL statement, or --columns [table] to list what is visible.");
  }
  return options;
}

/**
 * The SQL that lists the columns this role may read. Built here, not typed by
 * the caller, so `--columns` needs no knowledge of the catalogue.
 */
export function columnsQuery(table) {
  return {
    text: `select table_name, string_agg(column_name, ', ' order by column_name) as visible_columns
             from information_schema.column_privileges
            where grantee = current_user and table_schema = 'public' and privilege_type = 'SELECT'
              and ($1 = '' or table_name = $1)
            group by table_name
            order by table_name`,
    values: [table ?? ""],
  };
}

/**
 * Proves the connection is the role it must be before any query runs: the
 * named role, no administrative attribute, and no privilege but SELECT.
 */
export async function assertInspectorIdentity(client) {
  const { rows } = await client.query(
    `select current_user as role,
            r.rolsuper or r.rolcreaterole or r.rolcreatedb or r.rolreplication as administrative,
            (select count(*) from information_schema.role_table_grants
              where grantee = current_user and privilege_type <> 'SELECT')
          + (select count(*) from information_schema.column_privileges
              where grantee = current_user and privilege_type <> 'SELECT') as write_privileges
       from pg_roles r where r.rolname = current_user`,
  );
  const identity = rows[0];
  if (identity?.role !== ROLE || identity.administrative || Number(identity.write_privileges) > 0) {
    throw new Error(
      `Refusing: connected as "${identity?.role}", which is not a read-only ${ROLE}. ` +
        "Run nothing and tell Brian.",
    );
  }
}

/**
 * Runs one statement inside a read-only transaction that is always rolled
 * back. `queryMode: "extended"` makes PostgreSQL itself reject a second
 * statement smuggled after a semicolon.
 */
export async function runInspection(client, query, { limit = DEFAULT_ROW_LIMIT } = {}) {
  await client.query("begin transaction read only");
  try {
    await client.query(`set local statement_timeout = '${STATEMENT_TIMEOUT}'`);
    const result = await client.query({
      text: query.text,
      values: query.values ?? [],
      queryMode: "extended",
    });
    return {
      rowCount: result.rows.length,
      truncated: result.rows.length > limit,
      rows: result.rows.slice(0, limit),
    };
  } finally {
    await client.query("rollback").catch(() => undefined);
  }
}

/** The primary checkout's `.env.local`, wherever this is run from. */
export function readPassword(cwd = process.cwd()) {
  const commonDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd, encoding: "utf8" },
  ).trim();
  const envPath = join(dirname(commonDir), ".env.local");

  let text;
  try {
    text = readFileSync(envPath, "utf8");
  } catch {
    throw new Error(`No .env.local in the primary checkout (${dirname(commonDir)}).`);
  }
  const line = text
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${PASSWORD_VARIABLE}=`));
  const value = line
    ?.slice(PASSWORD_VARIABLE.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!value) {
    throw new Error(
      `${PASSWORD_VARIABLE} is not set in ${envPath}. Brian adds it once; see scripts/production/README.md.`,
    );
  }
  return value;
}

function gitHead(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function record(entry) {
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  } catch {
    // A failed log write must not hide the answer, but it is said out loud.
    console.error(`warning: could not append to ${LOG_PATH}`);
  }
}

async function main(argv) {
  assertInteractiveContext();
  const options = parseArguments(argv);
  const query =
    options.columns !== null
      ? columnsQuery(options.columns)
      : { text: assertReadStatement(options.sql), values: [] };

  const entry = {
    at: new Date().toISOString(),
    worktree: process.cwd(),
    head: gitHead(process.cwd()),
    purpose: options.purpose,
    sql: query.text,
  };

  const client = new pg.Client({
    ...INSPECT_TARGET,
    password: readPassword(),
    ssl: { rejectUnauthorized: false },
    types: INSPECT_TYPES,
    application_name: "lancers-prod-inspect",
    connectionTimeoutMillis: 10_000,
  });

  try {
    await client.connect();
    await assertInspectorIdentity(client);
    const result = await runInspection(client, query, { limit: options.limit });
    record({ ...entry, rowCount: result.rowCount });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    record({ ...entry, error: error.code ?? "refused" });
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`prod:inspect: ${error.message}${error.code ? ` (${error.code})` : ""}`);
    process.exit(1);
  });
}
