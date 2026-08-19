import "@testing-library/jest-dom/vitest";

import { afterAll } from "vitest";
import pg from "pg";

/**
 * The guard that keeps the parallel test project away from the one local
 * database.
 *
 * `vitest.config.ts` splits the suite in two: the files listed in
 * `DATABASE_TEST_SUITES` run one at a time in the `database` project, and
 * everything else runs in parallel in the `unit` project. That split is only
 * worth anything if it is enforced — a file that quietly starts talking to
 * PostgreSQL from the parallel project reintroduces exactly the races the split
 * removes, and it does so silently, surfacing weeks later as an unrelated
 * suite's SQLSTATE `40001` in CI.
 *
 * So the parallel project refuses the connection outright, at the moment it is
 * opened, naming the file and saying what to do. The failure is loud, immediate,
 * and lands on the file that caused it rather than on its victim.
 *
 * Both doors are covered: a direct PostgreSQL connection through `pg`, and the
 * Supabase Data API over HTTP, which reaches the same database and the same
 * rows. Reads count — a `repeatable read` transaction elsewhere aborts because
 * of a concurrent *commit*, but an unowned count assertion is broken by a read
 * of somebody else's rows just as easily.
 *
 * See docs/adr/0028-serialized-database-test-suites.md.
 */
const isDatabaseProject = process.env.LANCERS_TEST_PROJECT === "database";

function currentTestFile(): string {
  try {
    const state = (
      globalThis as { expect?: { getState?(): { testPath?: string } | undefined } }
    ).expect?.getState?.();
    return state?.testPath ?? "This test file";
  } catch {
    return "This test file";
  }
}

function refuse(attempt: string): never {
  throw new Error(
    [
      `${currentTestFile()} ${attempt}, but it is not declared as a database suite.`,
      "",
      "There is one local database. Test files that use it run one at a time, in",
      'the "database" Vitest project; everything else runs in parallel. A file',
      "that reaches the database from the parallel project races the serialized",
      "ones — a concurrent commit aborts another suite's `repeatable read`",
      "transaction with SQLSTATE 40001, and an unowned count assertion sees rows",
      "it did not create.",
      "",
      "Fix: add this file's repository-relative path to DATABASE_TEST_SUITES in",
      "vitest.config.ts. If it did not mean to touch the database, mock the module",
      "that does.",
    ].join("\n"),
  );
}

if (!isDatabaseProject) {
  const client = pg.Client.prototype;
  const pool = pg.Pool.prototype;
  const originalClientConnect = client.connect;
  const originalPoolConnect = pool.connect;

  // `pg.Pool#query` opens its connection through `pg.Pool#connect`, and the pool
  // builds real `pg.Client`s, so between them these two cover every route to a
  // socket — including the service layer's `withTransaction`.
  client.connect = function refuseClientConnect(): never {
    refuse("opened a PostgreSQL connection");
  } as typeof client.connect;
  pool.connect = function refusePoolConnect(): never {
    refuse("opened a PostgreSQL connection from a pool");
  } as typeof pool.connect;

  // The Data API reaches the same rows over HTTP. Only the local Supabase origin
  // is refused: a test that stubs `fetch` for an outbound provider call never
  // reaches this, because it replaced the global before the request was made.
  const supabaseOrigin = (() => {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!raw) return null;
    try {
      return new URL(raw).origin;
    } catch {
      return null;
    }
  })();

  const originalFetch = globalThis.fetch;
  if (supabaseOrigin && typeof originalFetch === "function") {
    globalThis.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const target =
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      let origin: string | null = null;
      try {
        origin = new URL(target).origin;
      } catch {
        origin = null;
      }
      if (origin === supabaseOrigin) {
        refuse("called the local Supabase Data API");
      }
      return originalFetch.call(globalThis, input, init);
    } as typeof globalThis.fetch;
  }

  // Restored per file, so the patch can never outlive the worker context that
  // installed it and reach a project that is allowed to connect.
  afterAll(() => {
    client.connect = originalClientConnect;
    pool.connect = originalPoolConnect;
    globalThis.fetch = originalFetch;
  });
}
