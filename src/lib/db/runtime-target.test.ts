// @vitest-environment node
/**
 * The runtime database policy, at the helper level.
 *
 * Two boundaries are being asserted here, and the whole design depends on them
 * never merging into one:
 *
 * 1. **Off the deployed service** — a developer's machine, CI, a test run, a
 *    seed command — loopback is the only thing that resolves, exactly as
 *    before. The approved hosted target is refused *here*, which is the case
 *    that matters most: pinning a production host in checked-in source would be
 *    a liability rather than a control if the pinning also let a laptop open it.
 * 2. **On the deployed service** — only the one approved target resolves, and a
 *    missing `DATABASE_URL` throws rather than quietly becoming localhost.
 *
 * `src/lib/db/url.test.ts` still covers the loopback guard itself; this file
 * covers the policy layered above it. `src/lib/db/connection.test.ts` covers
 * the call site, because a sound helper nobody calls proves nothing.
 */
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";

import {
  APPROVED_HOSTED_TARGET,
  assertApprovedHostedDatabaseUrl,
  CLOUD_RUN_SERVICE,
  isDeployedRuntime,
  resolveRuntimeDatabaseUrl,
} from "./runtime-target";

const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const LOCAL_DEFAULT = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * The approved target, assembled from the exported constant rather than typed
 * out, so that changing the constant cannot leave this suite asserting against
 * a target the application no longer uses.
 */
const APPROVED = `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/${APPROVED_HOSTED_TARGET.database}`;

/** The deployed service's environment, minus whatever the case under test adds. */
const DEPLOYED = { K_SERVICE: CLOUD_RUN_SERVICE } as const;

/**
 * Every near-miss worth naming. Each is one component away from approved, which
 * is what a real mistake looks like — nobody pastes a random host, they paste
 * the *other* connection string the same dashboard page offers.
 */
const NEAR_MISSES: readonly (readonly [string, string])[] = [
  [
    "the dedicated pooler for the same project (IPv6, and connects as the admin)",
    "postgresql://postgres:pw@db.fggbgeraiadetyiyjlvb.supabase.co:6543/postgres",
  ],
  [
    "the session pooler — right host, wrong port",
    `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:5432/postgres`,
  ],
  [
    "the admin role on the approved host",
    `postgresql://postgres.fggbgeraiadetyiyjlvb:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/postgres`,
  ],
  [
    "a different Supabase project on the approved pooler",
    `postgresql://app_runtime.abcdefghijklmnop:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/postgres`,
  ],
  [
    "the approved role and project in another region",
    `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@aws-0-us-east-1.pooler.supabase.com:${APPROVED_HOSTED_TARGET.port}/postgres`,
  ],
  [
    "a different database on the approved target",
    `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/template1`,
  ],
  ["loopback, which cannot exist inside a Cloud Run instance", LOCAL],
];

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

// ---------------------------------------------------------------------------
// Off the deployed service: loopback only, unchanged
// ---------------------------------------------------------------------------

describe("outside the deployed Cloud Run service", () => {
  it("resolves the documented local default when nothing is configured", () => {
    expect(resolveRuntimeDatabaseUrl({})).toBe(LOCAL_DEFAULT);
  });

  it("resolves an explicit loopback URL", () => {
    expect(resolveRuntimeDatabaseUrl({ DATABASE_URL: LOCAL })).toBe(LOCAL);
  });

  it("refuses the approved hosted target — the pin is not a licence for a laptop", () => {
    expect(() => resolveRuntimeDatabaseUrl({ DATABASE_URL: APPROVED })).toThrow(
      /non-local database host|hosted Supabase/i,
    );
  });

  it.each(NEAR_MISSES.filter(([, url]) => url !== LOCAL))("refuses %s as well", (_label, url) => {
    expect(() => resolveRuntimeDatabaseUrl({ DATABASE_URL: url })).toThrow();
  });

  it("is not fooled by K_SERVICE naming some other service", () => {
    expect(() =>
      resolveRuntimeDatabaseUrl({ K_SERVICE: "some-other-service", DATABASE_URL: APPROVED }),
    ).toThrow(/non-local database host|hosted Supabase/i);
  });

  it.each([
    ["NODE_ENV", "production"],
    ["CI", "1"],
    ["ALLOW_REMOTE_DATABASE", "1"],
    ["DATABASE_TARGET", "hosted"],
    ["K_REVISION", "lancers-operations-platform-00042-abc"],
    ["GOOGLE_CLOUD_PROJECT", "oxford-lancers-operations"],
  ])("is not switched on by %s=%s", (name, value) => {
    expect(() => resolveRuntimeDatabaseUrl({ [name]: value, DATABASE_URL: APPROVED })).toThrow(
      /non-local database host|hosted Supabase/i,
    );
  });
});

// ---------------------------------------------------------------------------
// On the deployed service: the approved target only, and fail closed
// ---------------------------------------------------------------------------

describe("inside the deployed Cloud Run service", () => {
  it("recognises itself only by the exact service name", () => {
    expect(isDeployedRuntime({ K_SERVICE: CLOUD_RUN_SERVICE })).toBe(true);
    expect(isDeployedRuntime({ K_SERVICE: "lancers-operations-platform-staging" })).toBe(false);
    expect(isDeployedRuntime({})).toBe(false);
  });

  it("resolves the approved hosted target", () => {
    expect(resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: APPROVED })).toBe(APPROVED);
  });

  it("fails closed with no DATABASE_URL, rather than falling back to localhost", () => {
    let resolved: string | undefined;
    expect(() => {
      resolved = resolveRuntimeDatabaseUrl({ ...DEPLOYED });
    }).toThrow(/has no DATABASE_URL/i);

    // The assertion that actually matters: nothing was returned at all. A
    // fallback that threw *after* computing localhost would still be a fallback.
    expect(resolved).toBeUndefined();
  });

  it("treats a blank or whitespace DATABASE_URL as absent", () => {
    for (const blank of ["", "   ", "\n"]) {
      expect(() => resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: blank })).toThrow(
        /has no DATABASE_URL/i,
      );
    }
  });

  it("does not accept the hosted target through SUPABASE_DB_URL", () => {
    // The deployed runtime reads one variable. The second name exists so a
    // developer's single .env.local serves both local paths; extending it to
    // production would be a second way in for no benefit.
    expect(() => resolveRuntimeDatabaseUrl({ ...DEPLOYED, SUPABASE_DB_URL: APPROVED })).toThrow(
      /has no DATABASE_URL/i,
    );
  });

  it.each(NEAR_MISSES)("refuses %s", (_label, url) => {
    expect(() => resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: url })).toThrow(
      /not the approved target/i,
    );
  });

  it("refuses a connection string that is not a URL at all", () => {
    expect(() =>
      resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: "host=x port=6543 user=y" }),
    ).toThrow(/not a valid connection string/i);
  });
});

// ---------------------------------------------------------------------------
// Nothing may leak through an error message
// ---------------------------------------------------------------------------

describe("refusals never echo the connection string", () => {
  const SECRET = "sup3r-s3cret-p4ssw0rd";

  it.each([
    [
      "a near-miss host",
      `postgresql://${APPROVED_HOSTED_TARGET.username}:${SECRET}@db.fggbgeraiadetyiyjlvb.supabase.co:6543/postgres`,
    ],
    ["an unparseable string", `host=x password=${SECRET}`],
  ])("keeps the password out of the message for %s", (_label, url) => {
    try {
      assertApprovedHostedDatabaseUrl(url);
      expect.unreachable("the guard must have refused");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).not.toContain(SECRET);
      expect(message).not.toContain(url);
    }
  });

  it("names the component that disagreed, so a misconfiguration is diagnosable", () => {
    expect(() =>
      assertApprovedHostedDatabaseUrl(
        `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:5432/postgres`,
      ),
    ).toThrow(/port/);
  });
});

// ---------------------------------------------------------------------------
// The guard and the driver must agree about the same string
// ---------------------------------------------------------------------------

/**
 * The defect this suite exists for.
 *
 * The first version of this guard compared only the four components
 * `new URL()` exposes. `pg` does not parse that way: `pg-connection-string`
 * copies every query parameter into the client configuration, and `host`,
 * `port`, `user` and `password` each override the authority. So a string whose
 * authority is the approved pooler, carrying `?host=…&port=…&user=…`, passed
 * every check here and opened an entirely different database as an entirely
 * different role.
 *
 * Asserting against `new pg.Client(...)` rather than against a hand-written
 * expectation is the point: the question is not "does the guard agree with my
 * reading of the string" but "does the guard agree with the code that opens the
 * socket". Those are different questions, and the difference was the bug.
 */
describe("what the guard approves is what pg actually opens", () => {
  /** The connection parameters `pg` derives, via the real client class. */
  function driverTarget(connectionString: string) {
    const client = new pg.Client({ connectionString });
    return {
      hostname: client.host,
      port: String(client.port),
      database: client.database,
      username: client.user,
    };
  }

  it("resolves the accepted string to the approved target, in the driver's own terms", () => {
    const accepted = resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: APPROVED });

    expect(driverTarget(accepted)).toEqual({
      hostname: APPROVED_HOSTED_TARGET.hostname,
      port: APPROVED_HOSTED_TARGET.port,
      database: APPROVED_HOSTED_TARGET.database,
      username: APPROVED_HOSTED_TARGET.username,
    });
  });

  const SMUGGLED: readonly (readonly [string, string])[] = [
    [
      "host, port and user smuggled through the query string",
      `${APPROVED}?host=attacker.example.com&port=5432&user=postgres`,
    ],
    ["host alone smuggled", `${APPROVED}?host=attacker.example.com`],
    ["redirected to loopback", `${APPROVED}?host=127.0.0.1&port=54322`],
    ["port alone smuggled", `${APPROVED}?port=5432`],
    ["the admin role smuggled", `${APPROVED}?user=postgres`],
    ["a different database smuggled", `${APPROVED}?database=template1`],
    ["hidden behind a fragment", `${APPROVED}#?host=attacker.example.com`],
  ];

  it.each(SMUGGLED)("refuses %s", (_label, url) => {
    expect(() => resolveRuntimeDatabaseUrl({ ...DEPLOYED, DATABASE_URL: url })).toThrow(
      /query or fragment/i,
    );
  });

  it("the smuggling really would have redirected the driver, so this is not theatre", () => {
    // Without the refusal these strings are accepted by a component comparison
    // and opened somewhere else entirely. Proving the driver's behaviour here
    // means the test fails if a future `pg` stops honouring the override *and*
    // if the guard stops refusing — either way a human looks at it.
    const smuggled = driverTarget(`${APPROVED}?host=attacker.example.com&port=5432&user=postgres`);

    expect(smuggled.hostname).toBe("attacker.example.com");
    expect(smuggled.port).toBe("5432");
    expect(smuggled.username).toBe("postgres");
    expect(smuggled.hostname).not.toBe(APPROVED_HOSTED_TARGET.hostname);
  });

  it("refuses a query string outside the deployed service too", () => {
    // The loopback guard refuses it for its own reason — a non-loopback host —
    // but a loopback URL carrying `?host=` must not slip through either.
    expect(() =>
      resolveRuntimeDatabaseUrl({ DATABASE_URL: `${LOCAL}?host=attacker.example.com` }),
    ).toThrow();
  });
});

// ---------------------------------------------------------------------------
// The pinned target is a literal, not configuration
// ---------------------------------------------------------------------------

describe("the approved target", () => {
  it("is the shared transaction pooler, as a least-privilege role", () => {
    // Pins the decision itself, so changing connection mode or role is a
    // deliberate edit to a test that says why, not a quiet constant change.
    expect(APPROVED_HOSTED_TARGET).toEqual({
      hostname: "aws-0-eu-west-2.pooler.supabase.com",
      port: "6543",
      database: "postgres",
      username: "app_runtime.fggbgeraiadetyiyjlvb",
    });
  });

  it("names a role that is not the database administrator", () => {
    expect(APPROVED_HOSTED_TARGET.username.startsWith("postgres")).toBe(false);
  });

  it("carries no credential", () => {
    expect(JSON.stringify(APPROVED_HOSTED_TARGET)).not.toMatch(/password|pw|secret/i);
  });
});
