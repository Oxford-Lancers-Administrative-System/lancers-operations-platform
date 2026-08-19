// @vitest-environment node
//
// Node rather than the suite-wide jsdom: this file imports `vitest.config.ts`,
// which reaches esbuild through `vitest/config`, and esbuild refuses to load
// where `TextEncoder` is jsdom's rather than Node's.
/**
 * The mechanism that keeps the database test files from racing each other.
 *
 * `vitest.config.ts` splits the suite into two projects: `database`, which runs
 * its files one at a time, and `unit`, which runs everything else in parallel
 * and is refused a connection by `vitest.setup.ts`. LAN-139 built that after the
 * third separate failure caused by parallel files sharing one PostgreSQL
 * instance reached CI.
 *
 * A split like that decays quietly. A file gets renamed and silently moves to
 * the parallel project; a project loses its pool setting in a merge; the guard
 * stops being installed and nothing looks different until months later, when an
 * unrelated suite fails in CI with SQLSTATE 40001 and somebody spends an
 * afternoon on it. So this suite asserts the mechanism itself, and the last
 * tests prove the guard is live by actually tripping it.
 *
 * This file runs in the `unit` project, which is what makes those last tests
 * mean anything.
 */
import fs from "node:fs";
import path from "node:path";

import pg from "pg";
import { describe, expect, it } from "vitest";

import config, { DATABASE_TEST_SUITES } from "../vitest.config";

const repoRoot = path.resolve(import.meta.dirname, "..");

/** Every test file in the repository, as a repository-relative path. */
function allTestFiles(): string[] {
  const found: string[] = [];

  function walk(relative: string) {
    for (const entry of fs.readdirSync(path.join(repoRoot, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(child);
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        found.push(child);
      }
    }
  }

  walk("src");
  walk("tests");
  return found.sort();
}

interface ProjectShape {
  test: {
    name: string;
    include?: string[];
    exclude?: string[];
    env?: Record<string, string>;
    poolOptions?: { forks?: { singleFork?: boolean } };
    setupFiles?: string[];
  };
}

const projects = (config.test?.projects ?? []) as unknown as ProjectShape[];

function project(name: string): ProjectShape["test"] {
  const found = projects.find((candidate) => candidate.test.name === name);
  if (!found) throw new Error(`vitest.config.ts no longer defines a "${name}" project.`);
  return found.test;
}

const unit = project("unit");
const database = project("database");

// ---------------------------------------------------------------------------
// The list itself
// ---------------------------------------------------------------------------

describe("the declared database suites", () => {
  it("name files that exist", () => {
    const onDisk = new Set(allTestFiles());
    const missing = DATABASE_TEST_SUITES.filter((suite) => !onDisk.has(suite));

    // A renamed file left behind here would move to the parallel project. The
    // runtime guard would catch it on the run that reaches the database; this
    // catches it on every run, including one where nothing happens to connect.
    expect(missing, "DATABASE_TEST_SUITES names files that no longer exist").toEqual([]);
  });

  it("are sorted and free of duplicates, so an addition reads clearly in a diff", () => {
    expect([...DATABASE_TEST_SUITES]).toEqual([...DATABASE_TEST_SUITES].sort());
    expect(new Set(DATABASE_TEST_SUITES).size).toBe(DATABASE_TEST_SUITES.length);
  });
});

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

describe("the two projects", () => {
  it("between them run every test file, and none of them twice", () => {
    // The parallel project takes everything under src/ and tests/ and then
    // subtracts the declared suites; the database project takes exactly the
    // declared suites. Asserted on the resolved configuration rather than by
    // re-implementing glob matching, because it is the configuration that
    // decides.
    expect(unit.include).toEqual(["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"]);
    expect(database.include).toEqual([...DATABASE_TEST_SUITES]);

    for (const suite of DATABASE_TEST_SUITES) {
      expect(unit.exclude, `${suite} would run in both projects`).toContain(suite);
    }

    // Vitest's own defaults have to survive alongside them, or node_modules is
    // swept into the parallel project.
    expect(unit.exclude).toContain("**/node_modules/**");

    // And the parallel project must still have work to do — a split where one
    // side is empty is a split that has stopped meaning anything.
    const declared = new Set<string>(DATABASE_TEST_SUITES);
    expect(allTestFiles().filter((file) => !declared.has(file)).length).toBeGreaterThan(0);
  });

  it("run the database project one file at a time", () => {
    // `fileParallelism` is not a per-project option in Vitest 3, so the
    // serialization is expressed as a pool option. If this ever reads false or
    // disappears, the database files go back to running concurrently and every
    // race LAN-139 closed is reopened.
    expect(database.poolOptions?.forks?.singleFork).toBe(true);
  });

  it("tell only the database project that it may connect", () => {
    expect(database.env?.LANCERS_TEST_PROJECT).toBe("database");
    expect(unit.env?.LANCERS_TEST_PROJECT).toBeUndefined();
  });

  it("install the shared setup file in both", () => {
    expect(unit.setupFiles).toContain("./vitest.setup.ts");
    expect(database.setupFiles).toContain("./vitest.setup.ts");
  });
});

// ---------------------------------------------------------------------------
// The guard, exercised rather than described
// ---------------------------------------------------------------------------

describe("the guard in the parallel project", () => {
  // Port 1 is unreachable by construction, so a regression here fails fast
  // rather than opening a real connection to whatever stack is running.
  const UNREACHABLE = "postgresql://postgres:postgres@127.0.0.1:1/postgres";

  it("refuses a PostgreSQL connection, and says what to do about it", () => {
    const client = new pg.Client({ connectionString: UNREACHABLE });

    expect(() => client.connect()).toThrow(/not declared as a database suite/);
    expect(() => client.connect()).toThrow(/DATABASE_TEST_SUITES/);
  });

  it("refuses a pooled connection too, which is how the service layer connects", () => {
    const pool = new pg.Pool({ connectionString: UNREACHABLE });

    expect(() => pool.connect()).toThrow(/not declared as a database suite/);
  });

  it("refuses the local Supabase Data API, which reaches the same rows", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!url) {
      // `.env.local` supplies it locally and the workflow supplies it in CI.
      // Without it there is no origin to guard and nothing to assert.
      return;
    }

    expect(() => fetch(`${url}/rest/v1/people`)).toThrow(/not declared as a database suite/);
  });

  it("leaves every other origin alone", async () => {
    // The guard must not become a blanket ban on `fetch`: suites that stub an
    // outbound provider call rely on the real global still being callable. Port
    // 1 again, so this asserts the shape of the failure without leaving the
    // machine.
    const failure = await fetch("http://127.0.0.1:1/").then(
      () => null,
      (error: unknown) => String(error),
    );

    expect(failure).not.toBeNull();
    expect(failure).not.toMatch(/not declared as a database suite/);
  });
});
