// @vitest-environment node
/**
 * RLS posture assertion.
 *
 * Decided posture (docs/adr/0002-rls-posture.md): RLS on every table in the
 * exposed schema, deny-by-default, secret key bypassing, service layer as the
 * primary authorization boundary.
 *
 * The ticket asks for this to be "wired but trivial for now". It is trivial
 * because there are zero domain tables — but it is not a stub: it really talks
 * to the local stack with a browser-safe key and asserts that key can read
 * nothing. When the domain model lands, the assertion below stops being
 * vacuous on its own and per-table cases get added beside it.
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
});
