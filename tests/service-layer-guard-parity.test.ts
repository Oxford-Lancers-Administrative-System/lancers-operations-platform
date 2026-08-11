// @vitest-environment node
/**
 * The two local-only guards must never disagree.
 *
 * `scripts/lib/local-db.mjs` guards the seeding and schema-test path.
 * `src/lib/db/url.ts` guards the service layer's connection — a **second**
 * privileged credential, so if anything the application's guard matters more.
 *
 * They are two implementations on purpose: the scripts module is plain
 * JavaScript outside `src/`, and application code that ships in the production
 * container should not depend on a file described as shared access for seeding
 * and tests. The cost of that choice is drift, and drift here means one path
 * refusing a hosted connection string while the other opens it.
 *
 * This file is the payment. It runs both over the same table and fails on any
 * disagreement — so a change to one that is not mirrored in the other is a red
 * test, not a discovery made in production.
 */
import { describe, expect, it } from "vitest";

import { resolveLocalDatabaseUrl } from "../scripts/lib/local-db.mjs";
import { assertLocalDatabaseUrl } from "@/lib/db/url";

/**
 * Every case both guards must agree about. Deliberately includes the shapes a
 * real mistake takes: a pasted hosted connection string, a pooler, a
 * project-qualified username, a private-network host.
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
];

function verdict(guard: (value: string) => string, value: string): "accepted" | "refused" {
  try {
    guard(value);
    return "accepted";
  } catch {
    return "refused";
  }
}

describe("the service layer's guard agrees with the scripts' guard", () => {
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
