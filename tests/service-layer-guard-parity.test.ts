// @vitest-environment node
/**
 * Where the two local-only guards must agree, and where the runtime policy is
 * deliberately allowed to differ.
 *
 * ## What changed, and why this file was redesigned
 *
 * Until LAN-94 there was one rule — loopback only, everywhere, unconditionally —
 * and this file's whole job was proving both implementations of it agreed.
 *
 * The deployed application now has to reach one hosted database, because the
 * service layer is the only path to domain data and Cloud Run cannot use a
 * database on its own loopback. That is a genuine asymmetry, and the wrong way
 * to express it would have been to relax the shared rule so that both guards
 * let a hosted target through. Then `npm run db:seed` would reach production.
 *
 * So the asymmetry lives in a *third* function, in a separate module, and this
 * file now pins three things instead of one:
 *
 * 1. The two local guards still agree, case for case, exactly as before.
 * 2. Both of them refuse the approved hosted target itself — the one string
 *    the deployed runtime is allowed to open is still refused by every local
 *    tool, by the seed path, and by the schema tests.
 * 3. The runtime policy agrees with them too, whenever it is not running as
 *    the deployed Cloud Run service — which is every test, every CI job and
 *    every developer machine.
 *
 * The hosted branch itself is covered in `src/lib/db/runtime-target.test.ts`.
 * It is not covered here on purpose: this file's subject is the boundary local
 * tooling must never cross.
 */
import { describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import { APPROVED_HOSTED_TARGET, resolveRuntimeDatabaseUrl } from "@/lib/db/runtime-target";
import { assertLocalDatabaseUrl } from "@/lib/db/url";

/**
 * The approved hosted target, built from the constant the application actually
 * uses. If that constant changes, this case changes with it and the refusals
 * below are re-proved against the new value rather than a stale copy.
 */
const APPROVED_HOSTED = `postgresql://${APPROVED_HOSTED_TARGET.username}:pw@${APPROVED_HOSTED_TARGET.hostname}:${APPROVED_HOSTED_TARGET.port}/${APPROVED_HOSTED_TARGET.database}`;

/**
 * Every case both guards must agree about. Deliberately includes the shapes a
 * real mistake takes: a pasted hosted connection string, a pooler, a
 * project-qualified username, a private-network host — and now the club's own
 * approved production target, which is the newest way to get this wrong.
 */
const CASES: readonly string[] = [
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  "postgresql://postgres:postgres@localhost:54322/postgres",
  "postgresql://postgres:postgres@[::1]:54322/postgres",
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
  "postgresql://postgres.abcdefghijklmnop:pw@127.0.0.1:54322/postgres",
  "postgresql://postgres:pw@db.abcdefghijklmnop.supabase.co:5432/postgres",
  "postgresql://postgres.abcdefghijklmnop:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
  "postgresql://postgres:pw@aws-1-eu-west-2.pooler.supabase.com:5432/postgres",
  "postgresql://postgres:pw@pooler.internal.example:6543/postgres",
  "postgresql://postgres:pw@10.0.0.7:5432/postgres",
  "postgresql://postgres:pw@db.oxfordlancers.example:5432/postgres",
  "postgresql://u:p@localhost.evil.example:5432/db",
  "postgresql://u:p@127.0.0.1.nip.io:5432/db",
  "host=db.example port=5432 user=postgres",
  "not a url at all",
  // Query-parameter smuggling. `pg-connection-string` copies these into the
  // client config, where they override the authority — so each of these reads
  // as loopback and opens something else. Both guards must refuse them, and
  // must refuse them together.
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=203.0.113.9",
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres?host=203.0.113.9&port=5432",
  "postgresql://postgres:postgres@localhost:54322/postgres?user=postgres&host=db.example",
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres#?host=203.0.113.9",
  APPROVED_HOSTED,
  // The club's own project reached the other three documented ways. None of
  // them is the approved target, and none of them may be reachable locally.
  "postgresql://postgres:pw@db.fggbgeraiadetyiyjlvb.supabase.co:5432/postgres",
  "postgresql://postgres:pw@db.fggbgeraiadetyiyjlvb.supabase.co:6543/postgres",
  "postgresql://postgres.fggbgeraiadetyiyjlvb:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
];

function verdict(guard: (value: string) => string, value: string): "accepted" | "refused" {
  try {
    guard(value);
    return "accepted";
  } catch {
    return "refused";
  }
}

// ---------------------------------------------------------------------------
// 1 — the two local guards still agree
// ---------------------------------------------------------------------------

describe("the service layer's local guard agrees with the scripts' guard", () => {
  it.each(CASES)("agrees about %s", (value) => {
    const application = verdict(assertLocalDatabaseUrl, value);
    const scripts = verdict((url) => resolveLocalDatabaseUrl(url), value);

    expect(application).toBe(scripts);
  });

  it("still refuses the ones that matter, so agreeing on 'accept everything' is not a pass", () => {
    // Parity alone would be satisfied by two identically broken guards. This
    // pins the actual answer for the cases ADR 0001 exists to prevent.
    const hosted = CASES.filter((value) =>
      /supabase\.(co|com)|pooler|10\.0\.0\.7|example/.test(value),
    );
    expect(hosted.length).toBeGreaterThan(0);

    for (const value of hosted) {
      expect(verdict(assertLocalDatabaseUrl, value)).toBe("refused");
      expect(verdict((url) => resolveLocalDatabaseUrl(url), value)).toBe("refused");
    }

    expect(verdict(assertLocalDatabaseUrl, CASES[0])).toBe("accepted");
  });
});

// ---------------------------------------------------------------------------
// 2 — the approved production target is refused by every local path
// ---------------------------------------------------------------------------

describe("the approved hosted target is still unreachable from local tooling", () => {
  // The single most valuable assertion in this file. The application gained the
  // ability to open one hosted database; `npm run db:seed`, `npm run db:reset`,
  // the schema tests and the pilot-scenario tests did not.
  it("is refused by the seeding and schema-test guard", () => {
    expect(() => resolveLocalDatabaseUrl(APPROVED_HOSTED)).toThrow(
      /non-local database host|hosted Supabase/i,
    );
  });

  it("is refused by the application's local guard", () => {
    expect(() => assertLocalDatabaseUrl(APPROVED_HOSTED)).toThrow(
      /non-local database host|hosted Supabase/i,
    );
  });

  it("is refused even when the environment claims to be production", () => {
    for (const env of [
      { NODE_ENV: "production" },
      { CI: "1" },
      { DATABASE_TARGET: "hosted" },
      { ALLOW_REMOTE_DATABASE: "1" },
    ]) {
      expect(() => resolveRuntimeDatabaseUrl({ ...env, DATABASE_URL: APPROVED_HOSTED })).toThrow(
        /non-local database host|hosted Supabase/i,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — the runtime policy joins the parity, everywhere except the deployed service
// ---------------------------------------------------------------------------

describe("the runtime policy agrees with both guards outside Cloud Run", () => {
  it.each(CASES)("agrees about %s when K_SERVICE is unset", (value) => {
    const runtime = verdict((url) => resolveRuntimeDatabaseUrl({ DATABASE_URL: url }), value);
    const scripts = verdict((url) => resolveLocalDatabaseUrl(url), value);

    expect(runtime).toBe(scripts);
  });

  it("diverges only for the one approved target, and only as the deployed service", () => {
    // The entire scope of the exception, stated as a test. One string, one
    // marker, and the marker is set by Cloud Run rather than by this repository.
    const asDeployed = verdict(
      (url) =>
        resolveRuntimeDatabaseUrl({ K_SERVICE: "lancers-operations-platform", DATABASE_URL: url }),
      APPROVED_HOSTED,
    );
    expect(asDeployed).toBe("accepted");

    for (const value of CASES.filter((candidate) => candidate !== APPROVED_HOSTED)) {
      expect(
        verdict(
          (url) =>
            resolveRuntimeDatabaseUrl({
              K_SERVICE: "lancers-operations-platform",
              DATABASE_URL: url,
            }),
          value,
        ),
      ).toBe("refused");
    }
  });
});
