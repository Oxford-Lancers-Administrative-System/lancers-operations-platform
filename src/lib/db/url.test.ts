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
import { describe, expect, it } from "vitest";

import { assertLocalDatabaseUrl, resolveDatabaseUrl } from "./url";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

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
