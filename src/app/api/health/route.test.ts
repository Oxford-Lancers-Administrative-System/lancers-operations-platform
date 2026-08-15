// @vitest-environment node
/**
 * The health endpoint is read by two automated gates and by anyone who can
 * reach the service, so what it says and what it withholds are both load-bearing.
 *
 * - The deploy workflow fails a revision unless `secretsLoaded` and
 *   `databaseConfigured` are both true, which is the only thing standing
 *   between a missing Secret Manager binding and a revision that serves pages
 *   and then fails on its first transaction.
 * - CI asserts `databaseConfigured` is *false* for a container started without
 *   one, which is what proves the flag reports presence rather than a constant.
 *
 * It is public and unauthenticated. Nothing here may reveal the database host,
 * port, connection mode, role, or any part of a credential.
 */
import { afterEach, describe, expect, it } from "vitest";

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

async function body(): Promise<Record<string, unknown>> {
  return (await GET().json()) as Record<string, unknown>;
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
        "secretsLoaded",
        "service",
        "status",
        "timestamp",
      ].sort(),
    );
  });
});

describe("it stays dependency-free", () => {
  it("reports ok without any Supabase or database configuration at all", async () => {
    setEnv("DATABASE_URL", undefined);
    setEnv("SUPABASE_SECRET_KEY", undefined);
    setEnv("SUPABASE_SERVICE_ROLE_KEY", undefined);

    const response = await body();

    // A health check that fails when the database is unreachable turns a blip
    // into an outage — Cloud Run would recycle healthy instances.
    expect(response.status).toBe("ok");
    expect(response.secretsLoaded).toBe(false);
    expect(response.databaseConfigured).toBe(false);
  });

  it("opens no connection: the route module imports no database code", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const source = readFileSync(path.join(import.meta.dirname, "route.ts"), "utf8");

    expect(source).not.toMatch(/from "@?\/?.*lib\/db/);
    expect(source).not.toMatch(/getPool|withTransaction|createAdminClient/);
  });
});
