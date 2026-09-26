// @vitest-environment node
/**
 * `prod:inspect` without a database — LAN-435.
 *
 * The tool's database behaviour is proved in tests/agent-readonly-role.test.ts.
 * This file pins what must hold before anything connects: the target and role
 * are literals, automated contexts are refused, obvious writes are turned away
 * with a clear message, and the local-only guards stay ignorant of all of it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertInteractiveContext,
  assertReadStatement,
  INSPECT_TARGET,
  parseArguments,
  ROLE,
} from "../scripts/diagnostics/prod-inspect.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const read = (relative: string): string => readFileSync(path.join(repoRoot, relative), "utf8");

describe("the only reachable target", () => {
  it("is the production pooler in session mode, as agent_readonly", () => {
    expect(INSPECT_TARGET).toEqual({
      host: "aws-0-eu-west-2.pooler.supabase.com",
      port: 5432,
      database: "postgres",
      user: `${ROLE}.fggbgeraiadetyiyjlvb`,
    });
    expect(Object.isFrozen(INSPECT_TARGET)).toBe(true);
  });

  it("takes no host, user or connection string from the environment", () => {
    const source = read("scripts/diagnostics/prod-inspect.mjs");
    expect(source).not.toMatch(/process\.env\.(DATABASE_URL|PG\w+|AGENT_READONLY_PASSWORD)/);
    expect(source).not.toMatch(/connectionString/);
  });

  it("is unknown to the local-only guards, which it does not import", () => {
    const source = read("scripts/diagnostics/prod-inspect.mjs");
    expect(source).not.toMatch(/from\s+["'][^"']*(local-db|db\/url|runtime-target)/);
    for (const guard of ["src/lib/db/url.ts", "scripts/lib/local-db.mjs"]) {
      expect(read(guard)).not.toMatch(/agent_readonly|prod-inspect/);
    }
  });
});

describe("automated contexts", () => {
  it.each([
    ["CI", { CI: "true" }],
    ["a Vitest run", { VITEST: "true" }],
    ["NODE_ENV=test", { NODE_ENV: "test" }],
  ])("refuses inside %s", (_label, env) => {
    expect(() => assertInteractiveContext(env)).toThrow(/refuses to run/);
  });

  it("allows an ordinary shell", () => {
    expect(() => assertInteractiveContext({})).not.toThrow();
  });
});

describe("the statement check", () => {
  it.each([
    "select 1",
    "  SELECT id from public.people;  ",
    "with x as (select 1) select * from x",
    "-- why\nselect 1",
    "/* why */ select 1",
    "explain select 1",
    "table public.seasons",
  ])("accepts a read: %s", (sql) => {
    expect(() => assertReadStatement(sql)).not.toThrow();
  });

  it.each([
    "",
    "insert into public.people (given_name) values ('x')",
    "update public.people set given_name = 'x'",
    "delete from public.people",
    "drop table public.people",
    "alter role agent_readonly createrole",
    "set default_transaction_read_only = off",
    "explain analyze delete from public.people",
  ])("turns away: %s", (sql) => {
    expect(() => assertReadStatement(sql)).toThrow();
  });
});

describe("arguments", () => {
  it("requires a purpose, so the log says why", () => {
    expect(() => parseArguments(["select 1"])).toThrow(/--purpose is required/);
  });

  it("parses a query, and --columns with or without a table", () => {
    expect(parseArguments(["--purpose", "LAN-434", "select 1"])).toMatchObject({
      purpose: "LAN-434",
      sql: "select 1",
      columns: null,
    });
    expect(parseArguments(["--purpose", "x", "--columns"]).columns).toBe("");
    expect(parseArguments(["--purpose", "x", "--columns", "people"]).columns).toBe("people");
  });

  it("refuses an unquoted multi-word query and an absurd limit", () => {
    expect(() => parseArguments(["--purpose", "x", "select", "1"])).toThrow(/Quote the SQL/);
    expect(() => parseArguments(["--purpose", "x", "--limit", "0", "select 1"])).toThrow();
  });
});

describe("the paste stays owner-run", () => {
  it("is not what the npm script runs", () => {
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(scripts["prod:inspect"]).toBe("node scripts/diagnostics/prod-inspect.mjs");
    expect(Object.values(scripts).join("\n")).not.toMatch(/agent-readonly\.sql/);
  });
});
