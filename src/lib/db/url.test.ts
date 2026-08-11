// @vitest-environment node
/**
 * The local-only guard on the service layer's connection string.
 *
 * This is the second privileged credential in the system, so ADR 0001 matters
 * more here than anywhere else: a mistake is not "the tests hit the wrong
 * database", it is "an agent or a developer wrote to the club's live records
 * with an admin login". The guard is therefore asserted from both directions —
 * what it lets through, and what it refuses.
 *
 * Parity with `scripts/lib/local-db.mjs` is asserted separately, in
 * tests/service-layer-guard-parity.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertLocalDatabaseUrl, resolveDatabaseUrl } from "./url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** Everything the guard must refuse, reused by the unconditionality suite. */
const MUST_REFUSE: readonly string[] = [
  "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
  "postgresql://postgres.abcdefghijklmnop:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
  "postgresql://postgres:pw@pooler.internal.example:6543/postgres",
  "postgresql://postgres:pw@10.0.0.7:5432/postgres",
  "postgresql://postgres:pw@db.oxfordlancers.example:5432/postgres",
];

describe("what the guard accepts", () => {
  it.each([
    ["the Supabase CLI's default local URL", LOCAL],
    ["localhost by name", "postgresql://postgres:postgres@localhost:54322/postgres"],
    ["IPv6 loopback", "postgresql://postgres:postgres@[::1]:54322/postgres"],
    ["a non-default local port", "postgresql://postgres:postgres@127.0.0.1:5432/postgres"],
    [
      // The username is irrelevant to the thing being protected: a
      // project-qualified username pointed at loopback still cannot reach a
      // hosted project, because loopback is not routed off the machine.
      "a project-qualified username on loopback",
      "postgresql://postgres.abcdefghijklmnop:pw@127.0.0.1:54322/postgres",
    ],
  ])("accepts %s", (_label, url) => {
    expect(assertLocalDatabaseUrl(url)).toBe(url);
  });
});

describe("what the guard refuses", () => {
  it.each([
    [
      "a hosted Supabase direct connection",
      "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
    ],
    [
      "a hosted Supabase pooler, project-qualified username and all",
      "postgresql://postgres.abcdefghijklmnop:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    ],
    [
      "a pooler host that is not on a supabase.com domain",
      "postgresql://postgres:pw@pooler.internal.example:6543/postgres",
    ],
    ["a plain remote host", "postgresql://postgres:pw@10.0.0.7:5432/postgres"],
    ["a public hostname", "postgresql://postgres:pw@db.oxfordlancers.example:5432/postgres"],
    [
      "a loopback-looking hostname that is not loopback",
      "postgresql://u:p@localhost.evil.example:5432/db",
    ],
    ["something that is not a URL at all", "host=db.example port=5432 user=postgres"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow();
  });

  it("never repeats the connection string, and so never prints the password", () => {
    const hosted =
      "postgresql://postgres:hunter2-the-real-password@db.proj.supabase.co:5432/postgres";

    let message = "";
    try {
      assertLocalDatabaseUrl(hosted);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toBe("");
    expect(message).not.toContain("hunter2-the-real-password");
    expect(message).not.toContain(hosted);
  });

  it("does not echo a malformed connection string, which may still hold a password", () => {
    const malformed = "postgres//postgres:hunter2-the-real-password@127.0.0.1";

    let message = "";
    try {
      assertLocalDatabaseUrl(malformed);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toContain("hunter2-the-real-password");
  });
});

describe("resolution from the environment", () => {
  it("prefers DATABASE_URL", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:5555/postgres";
    expect(resolveDatabaseUrl({ DATABASE_URL: url, SUPABASE_DB_URL: LOCAL })).toBe(url);
  });

  it("falls back to SUPABASE_DB_URL, so one .env.local serves the scripts too", () => {
    const url = "postgresql://postgres:postgres@127.0.0.1:5556/postgres";
    expect(resolveDatabaseUrl({ SUPABASE_DB_URL: url })).toBe(url);
  });

  it("falls back to the documented local default when neither is set", () => {
    expect(resolveDatabaseUrl({})).toBe(LOCAL);
  });

  it("treats a blank value as unset rather than as a URL", () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: "   " })).toBe(LOCAL);
  });

  it("applies the guard to whatever the environment supplied", () => {
    expect(() =>
      resolveDatabaseUrl({
        DATABASE_URL: "postgresql://postgres:pw@db.proj.supabase.co:5432/postgres",
      }),
    ).toThrow(/non-local database host/i);
  });
});

describe("the guard is unconditional — there is no way to switch it off", () => {
  /**
   * Row 12 says the guard must not be weakened, widened, "or made
   * configurable". The refusal cases above prove the LOGIC; they cannot see an
   * escape hatch, because they all call the guard with whatever the ambient
   * environment happens to be.
   *
   * That gap matters more here than anywhere else in this repository: this is
   * the second privileged credential, ADR 0001 is a hard rule, and both the ADR
   * and the module header claim the guard is "deliberately not configurable" —
   * a claim nothing else enforces.
   *
   * So: set every plausible bypass variable at once and demand the same
   * refusals.
   */
  const BYPASS_ATTEMPTS: Readonly<Record<string, string>> = {
    ALLOW_REMOTE_DATABASE: "1",
    ALLOW_NON_LOCAL_DATABASE: "1",
    SUPABASE_ALLOW_REMOTE: "1",
    SKIP_DB_GUARD: "1",
    FORCE: "1",
    CI: "1",
    NODE_ENV: "production",
  };

  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    saved.clear();
  });

  function setBypassEnvironment(): void {
    for (const [name, value] of Object.entries(BYPASS_ATTEMPTS)) {
      saved.set(name, process.env[name]);
      process.env[name] = value;
    }
  }

  it.each(MUST_REFUSE)("still refuses %s with every bypass variable set", (url) => {
    setBypassEnvironment();
    expect(() => assertLocalDatabaseUrl(url)).toThrow();
  });

  it("still refuses through resolveDatabaseUrl, ambient and injected alike", () => {
    setBypassEnvironment();
    const hosted = MUST_REFUSE[0];

    expect(() => resolveDatabaseUrl({ DATABASE_URL: hosted })).toThrow();
    expect(() => resolveDatabaseUrl({ ...BYPASS_ATTEMPTS, DATABASE_URL: hosted })).toThrow();
    expect(() => resolveDatabaseUrl({ SUPABASE_DB_URL: hosted })).toThrow();
  });

  it("still accepts loopback with those variables set, so the suite is not vacuous", () => {
    setBypassEnvironment();
    expect(assertLocalDatabaseUrl(LOCAL)).toBe(LOCAL);
  });

  it("reads no environment variable except the one injectable parameter", () => {
    /**
     * The structural half, and the one that survives a bypass variable nobody
     * thought to guess. `resolveDatabaseUrl` takes its environment as an
     * argument defaulting to `process.env`; that default is the ONLY place this
     * module may touch the environment. Any other read is either a hidden
     * escape hatch or hidden configuration, and both are what row 12 forbids.
     */
    const source = readFileSync(path.join(import.meta.dirname, "url.ts"), "utf8");
    const reads = source.match(/process\.env/g) ?? [];

    expect(reads).toHaveLength(1);
    expect(source).toContain("env: Record<string, string | undefined> = process.env");
  });
});
