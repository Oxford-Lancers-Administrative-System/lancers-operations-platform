// @vitest-environment node
/**
 * RLS posture assertion.
 *
 * Decided posture (docs/adr/0002-rls-posture.md): RLS on every table in the
 * exposed schema, deny-by-default, secret key bypassing, service layer as the
 * primary authorization boundary.
 *
 * This assertion is no longer vacuous: the domain schema now exists, and this
 * proves that none of it is reachable from the browser. It complements
 * tests/schema-security.test.ts, which inspects the catalogue directly — this
 * one goes through PostgREST exactly as a browser would, because the thing
 * being protected is the Data API surface, not the catalogue.
 *
 * Runs against LOCAL Supabase only. Never point it at production.
 */
import { describe, expect, it, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// CI sets REQUIRE_SUPABASE_TESTS=1 so a missing local stack is a failure there
// rather than a silent skip. Locally, a developer without Docker running still
// gets a usable `npm test`.
const required = process.env.REQUIRE_SUPABASE_TESTS === "1";
const configured = Boolean(url && publishableKey);

if (required && !configured) {
  throw new Error(
    "REQUIRE_SUPABASE_TESTS=1 but NEXT_PUBLIC_SUPABASE_URL / publishable key are not set.",
  );
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url ?? "");
if (configured && !isLocal) {
  throw new Error(`Refusing to run RLS tests against a non-local Supabase URL: ${url}`);
}

describe.runIf(configured)("anonymous access to the exposed schema", () => {
  let anon: SupabaseClient;

  beforeAll(() => {
    anon = createClient(url!, publishableKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  it("exposes no readable tables to a browser-safe key", async () => {
    // PostgREST's root endpoint is the authoritative list of what the Data API
    // actually exposes to this key — more honest than guessing table names.
    const response = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: publishableKey!, Accept: "application/openapi+json" },
    });
    expect(response.ok).toBe(true);

    const spec = (await response.json()) as { paths?: Record<string, unknown> };
    const exposed = Object.keys(spec.paths ?? {}).filter((path) => path !== "/");

    expect(exposed, `Data API exposes: ${exposed.join(", ") || "(nothing)"}`).toEqual([]);
  });

  it("returns no session for an unauthenticated client", async () => {
    const { data } = await anon.auth.getSession();
    expect(data.session).toBeNull();
  });

  it("rejects reads of a table that does not exist rather than leaking anything", async () => {
    const { data, error } = await anon.from("players").select("*").limit(1);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("rejects reads of every domain table that DOES exist", async () => {
    // The tables below all hold real club data once the system is live. Each is
    // named explicitly rather than looped from the catalogue, so that adding a
    // table does not silently widen or narrow what this test covers.
    const tables = [
      "people",
      "contact_points",
      "season_memberships",
      "availability_statuses",
      "events",
      "invitations",
      "rsvp_responses",
      "attendance_records",
      "notification_jobs",
      "weekly_reports",
      "audit_events",
    ];

    for (const table of tables) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(data, `anon read rows from ${table}`).toBeNull();
      expect(error, `anon was permitted to read ${table}`).not.toBeNull();
    }
  });

  it("rejects reads of the derived views as well as the tables", async () => {
    // A view runs with its owner's rights unless it is `security_invoker`, and
    // its owner here is postgres, which bypasses RLS. Views are therefore the
    // likeliest accidental hole in the backstop.
    for (const view of ["current_availability", "constitutional_membership", "nonresponse_queue"]) {
      const { data, error } = await anon.from(view).select("*").limit(1);
      expect(data, `anon read rows from the view ${view}`).toBeNull();
      expect(error, `anon was permitted to read the view ${view}`).not.toBeNull();
    }
  });
});
