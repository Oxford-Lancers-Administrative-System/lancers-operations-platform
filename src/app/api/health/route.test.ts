// @vitest-environment node
/**
 * The health endpoint is read by two automated gates and by anyone who can
 * reach the service, so what it says and what it withholds are both load-bearing.
 *
 * - The deploy workflow fails a revision unless `secretsLoaded`,
 *   `databaseConfigured`, and `schemaCompatible` are true, which stands
 *   between a missing Secret Manager binding and a revision that serves pages
 *   or a stale schema and a failure on its first transaction.
 * - CI asserts `databaseConfigured` is *false* for a container started without
 *   one, which is what proves the flag reports presence rather than a constant.
 *
 * It is public and unauthenticated. Nothing here may reveal the database host,
 * port, connection mode, role, or any part of a credential.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  getPool: () => ({ query }),
}));

import { GET } from "./route";

const saved = new Map<string, string | undefined>();

function setEnv(name: string, value: string | undefined): void {
  if (!saved.has(name)) saved.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue({ rows: [] });
});

async function body(): Promise<Record<string, unknown>> {
  return (await (await GET()).json()) as Record<string, unknown>;
}

describe("databaseConfigured", () => {
  it("is false when no DATABASE_URL is present", async () => {
    setEnv("DATABASE_URL", undefined);
    expect((await body()).databaseConfigured).toBe(false);
  });

  it.each(["", "   ", "\n"])("is false for a blank value (%j)", async (blank) => {
    setEnv("DATABASE_URL", blank);
    expect((await body()).databaseConfigured).toBe(false);
  });

  it("is true when one is present", async () => {
    setEnv(
      "DATABASE_URL",
      "postgresql://app_runtime.fggbgeraiadetyiyjlvb:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    );
    expect((await body()).databaseConfigured).toBe(true);
  });

  it("is a boolean, because the deploy gate greps for a literal true", async () => {
    setEnv("DATABASE_URL", "postgresql://whatever");
    const serialised = JSON.stringify(await body());
    expect(serialised).toContain('"databaseConfigured":true');
  });
});

describe("the response reveals nothing about the connection", () => {
  const SECRET = "s3cret-p4ssw0rd";
  const URL = `postgresql://app_runtime.fggbgeraiadetyiyjlvb:${SECRET}@aws-0-eu-west-2.pooler.supabase.com:6543/postgres`;

  it("leaks no part of the connection string", async () => {
    setEnv("DATABASE_URL", URL);
    const serialised = JSON.stringify(await body());

    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("pooler.supabase.com");
    expect(serialised).not.toContain("app_runtime");
    expect(serialised).not.toContain("6543");
    expect(serialised).not.toContain("fggbgeraiadetyiyjlvb");
    expect(serialised).not.toContain("postgresql://");
  });

  it("exposes exactly the documented keys and no more", async () => {
    setEnv("DATABASE_URL", URL);

    // A new key here is a new thing published to the internet. That should be a
    // deliberate edit to this list, not a side effect.
    expect(Object.keys(await body()).sort()).toEqual(
      [
        "commit",
        "databaseConfigured",
        "revision",
        "schemaCompatible",
        "secretsLoaded",
        "service",
        "status",
        "timestamp",
      ].sort(),
    );
  });
});

describe("schemaCompatible", () => {
  it("reports ok without a configured database but marks the probe unavailable", async () => {
    setEnv("DATABASE_URL", undefined);
    setEnv("SUPABASE_SECRET_KEY", undefined);
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    const response = await body();

    // A health check that fails when the database is unreachable turns a blip
    // into an outage — Cloud Run would recycle healthy instances.
    expect(response.status).toBe("ok");
    expect(response.secretsLoaded).toBe(false);
    expect(response.databaseConfigured).toBe(false);
    expect(response.schemaCompatible).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it("executes a current-schema query when the database is configured", async () => {
    setEnv("DATABASE_URL", "postgresql://whatever");

    const response = await GET();
    const payload = (await response.json()) as Record<string, unknown>;

    expect(query).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith("select id from public.events limit 1");
    expect(response.status).toBe(200);
    expect(payload.status).toBe("ok");
    expect(payload.schemaCompatible).toBe(true);
  });

  it("fails closed without exposing the database error", async () => {
    setEnv("DATABASE_URL", "postgresql://whatever");
    query.mockRejectedValueOnce(
      new Error("password secret-value failed for private-db.example:6543"),
    );

    const response = await GET();
    const serialised = await response.text();

    expect(response.status).toBe(503);
    expect(serialised).toContain('"status":"error"');
    expect(serialised).toContain('"schemaCompatible":false');
    expect(serialised).not.toContain("secret-value");
    expect(serialised).not.toContain("private-db.example");
    expect(serialised).not.toContain("6543");
  });
});
