#!/usr/bin/env node
/**
 * Enforces the decided RLS posture at the migration level.
 *
 * Decision (2026-08-08, see docs/adr/0002-rls-posture.md): RLS is enabled on
 * every table in the exposed schema, deny-by-default, with the secret /
 * service_role key bypassing it. The service layer is the primary authorization
 * boundary.
 *
 * This check makes the "every future migration creating a table must enable RLS
 * on it" half of that decision mechanically enforced instead of remembered. It
 * is static analysis of the SQL, so it works today, with zero domain tables,
 * and keeps working when the domain model lands.
 *
 * It is deliberately not a substitute for the runtime assertion in
 * tests/rls-posture.test.ts, which proves an anonymous client actually reads
 * nothing.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase", "migrations");

/** Strips `--` line comments and block comments so they cannot mask statements. */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const CREATE_TABLE =
  /\bcreate\s+(?:or\s+replace\s+)?(?:global\s+|local\s+)?(?:unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi;
const ENABLE_RLS =
  /\balter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+enable\s+row\s+level\s+security/gi;

/** `public.foo`, `"public"."foo"` and `foo` all normalise to `public.foo`. */
function normalise(identifier) {
  const parts = identifier.replace(/"/g, "").toLowerCase().split(".");
  return parts.length === 1 ? `public.${parts[0]}` : parts.slice(-2).join(".");
}

// Only schemas exposed through the Data API need RLS; internal schemas do not.
const EXPOSED_SCHEMAS = new Set(["public"]);

const files = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const problems = [];

for (const file of files) {
  const sql = stripComments(readFileSync(join(migrationsDir, file), "utf8"));

  const created = new Set();
  for (const match of sql.matchAll(CREATE_TABLE)) {
    const table = normalise(match[1]);
    if (EXPOSED_SCHEMAS.has(table.split(".")[0])) created.add(table);
  }

  const protectedTables = new Set(
    [...sql.matchAll(ENABLE_RLS)].map((match) => normalise(match[1])),
  );

  for (const table of created) {
    if (!protectedTables.has(table)) {
      problems.push(
        `${file}: creates ${table} without \`alter table ${table} enable row level security;\` in the same migration`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error("RLS posture violation — every table in an exposed schema must enable RLS.\n");
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error("\nSee docs/adr/0002-rls-posture.md.");
  process.exit(1);
}

console.log(
  `RLS migration check passed (${files.length} migration${files.length === 1 ? "" : "s"} scanned, no unprotected tables).`,
);
