// @vitest-environment node
/**
 * The guard's APPLICATION, not just its logic.
 *
 * `src/lib/db/url.test.ts` proves `assertLocalDatabaseUrl` is unconditional.
 * That tests the helper. Matrix row 12's subject is this module — "the
 * **connection** module refuses a non-local database… the guard must not be
 * weakened, widened, or made configurable" — and the helper being sound says
 * nothing about whether the call site still calls it.
 *
 * That gap is not hypothetical, and it is not contrived either. LAN-72
 * explicitly instructs that pooling behaviour be left "configurable rather than
 * hard-coded", so `connection.ts` is the one file in this layer where adding an
 * environment-driven branch is the established habit. A single ternary at
 * `connectionString:` would hand a hosted connection string to a second
 * privileged credential, in a public repository, under a hard rule (ADR 0001).
 *
 * So this file asserts the guard is re-entered and still refuses, from the
 * outside, with plausible bypass variables set — and adds a structural check
 * for the case a behavioural one cannot see.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Pool } from "pg";

import { closePool, getPool } from "./connection";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const HOSTED = "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres";
const POOLER =
  "postgresql://postgres.abcdefghijklmnop:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

/** Every plausible name for "let me through". None may work. */
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

function setEnv(name: string, value: string): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  process.env[name] = value;
}

function setBypassEnvironment(): void {
  for (const [name, value] of Object.entries(BYPASS_ATTEMPTS)) setEnv(name, value);
}

/** Builds a pool without letting a throw escape, so both outcomes are inspectable. */
function buildPool(): { pool: Pool | null; error: unknown } {
  try {
    return { pool: getPool(), error: undefined };
  } catch (error) {
    return { pool: null, error };
  }
}

beforeEach(async () => {
  // `getPool()` memoises. Without this a test could be handed a pool another
  // test built, never re-enter the guard, and pass for entirely the wrong
  // reason.
  await closePool();
});

afterEach(async () => {
  await closePool();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

describe("getPool() applies the guard, and no environment variable turns it off", () => {
  it.each([
    ["a hosted direct connection", HOSTED, "db.abcdefghijklmnop.supabase.co"],
    ["a hosted pooler", POOLER, "aws-0-eu-west-2.pooler.supabase.com"],
  ])("refuses %s with every bypass variable set", (_label, url, host) => {
    setEnv("DATABASE_URL", url);
    setBypassEnvironment();

    const { pool, error } = buildPool();

    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/non-local database host|hosted Supabase/i);

    // The decisive assertion, and the one a bypass cannot satisfy: no pool was
    // handed out, so no hosted connection string ever reached `pg`.
    expect(pool).toBeNull();
    expect(pool?.options?.connectionString).toBeUndefined();
    expect(JSON.stringify(pool?.options ?? {})).not.toContain(host);
  });

  it("refuses a hosted URL supplied through SUPABASE_DB_URL as well", () => {
    setEnv("DATABASE_URL", "");
    setEnv("SUPABASE_DB_URL", HOSTED);
    setBypassEnvironment();

    const { pool, error } = buildPool();

    expect(error).toBeDefined();
    expect(pool).toBeNull();
  });

  it("still builds a pool for loopback with those variables set, so this is not vacuous", () => {
    setEnv("DATABASE_URL", LOCAL);
    setBypassEnvironment();

    const { pool, error } = buildPool();

    expect(error).toBeUndefined();
    expect(pool?.options.connectionString).toBe(LOCAL);
  });

  it("re-enters the guard on every build rather than trusting it once per process", async () => {
    // Proves the memoisation reset above is doing real work: a pool built for
    // loopback must not become a licence to hand out a hosted one later.
    setEnv("DATABASE_URL", LOCAL);
    expect(buildPool().error).toBeUndefined();

    setEnv("DATABASE_URL", HOSTED);
    expect(buildPool().error).toBeUndefined(); // memoised — still the local pool

    await closePool();

    const { pool, error } = buildPool();
    expect(error).toBeDefined();
    expect(pool).toBeNull();
  });
});

describe("getPool() inside the deployed service opens only the approved target", () => {
  // The call site's half of the hosted policy. `runtime-target.test.ts` proves
  // the helper decides correctly; this proves `getPool()` still asks it, and
  // that a refusal means no pool — not a pool built from a rejected string.
  const DEPLOYED_SERVICE = "lancers-operations-platform";
  const APPROVED =
    "postgresql://app_runtime.fggbgeraiadetyiyjlvb:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres";

  it("builds a pool for the approved hosted target", () => {
    setEnv("K_SERVICE", DEPLOYED_SERVICE);
    setEnv("DATABASE_URL", APPROVED);

    const { pool, error } = buildPool();

    expect(error).toBeUndefined();
    expect(pool?.options.connectionString).toBe(APPROVED);
  });

  it("refuses a near-miss hosted target and hands out no pool", () => {
    setEnv("K_SERVICE", DEPLOYED_SERVICE);
    setEnv("DATABASE_URL", POOLER); // approved host and port, foreign project
    setBypassEnvironment();

    const { pool, error } = buildPool();

    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/not the approved target/i);
    expect(pool).toBeNull();
    expect(JSON.stringify(pool?.options ?? {})).not.toContain("abcdefghijklmnop");
  });

  it("refuses to fall back to loopback when the secret is missing", () => {
    setEnv("K_SERVICE", DEPLOYED_SERVICE);
    setEnv("DATABASE_URL", "");
    setEnv("SUPABASE_DB_URL", LOCAL);

    const { pool, error } = buildPool();

    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/has no DATABASE_URL/i);
    expect(pool).toBeNull();
    // The specific failure this prevents: a revision with no secret quietly
    // trying to reach a database inside its own container.
    expect(JSON.stringify(pool?.options ?? {})).not.toContain("127.0.0.1");
  });
});

describe("connection.ts reads no environment variable beyond pool tuning", () => {
  // The structural half. A behavioural test can only probe the branches it
  // thinks to set; this catches a bypass keyed on a variable nobody guessed,
  // and one read at module load rather than inside `getPool()`.
  const source = readFileSync(path.join(import.meta.dirname, "connection.ts"), "utf8");

  it("touches process.env exactly once, inside the pool-tuning helper", () => {
    expect(source.match(/process\.env/g) ?? []).toHaveLength(1);
  });

  it("names only the three pool-tuning keys", () => {
    const keys = [...source.matchAll(/readPositiveInteger\(\s*"([A-Z0-9_]+)"/g)]
      .map((match) => match[1])
      .sort();

    expect(keys).toEqual([
      "DATABASE_CONNECT_TIMEOUT_MS",
      "DATABASE_IDLE_TIMEOUT_MS",
      "DATABASE_POOL_MAX",
    ]);
  });

  it("builds the connection string only from the guarded resolver", () => {
    // The injected defect replaces exactly this line with a ternary.
    expect(source).toContain("connectionString: resolveRuntimeDatabaseUrl(),");
  });
});
