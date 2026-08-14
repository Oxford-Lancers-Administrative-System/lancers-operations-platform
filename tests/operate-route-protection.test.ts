// @vitest-environment node
/**
 * `/operate` and the proxy — LAN-73, test-matrix rows 1 and 15.
 *
 * The proxy is a **convenience**, and this suite is written on that
 * understanding: it proves that an anonymous request for a protected path is
 * bounced to the login page with its destination intact, and it proves nothing
 * about authorization, which lives in the service layer and is tested against
 * the guards and the actions.
 *
 * Anonymous and authenticated are decided at `supabase.auth.getClaims()`, so
 * that is the only thing stubbed. Everything else — the matcher, the prefix
 * list, the redirect construction — is the real module.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({
  getSupabaseUrl: () => "http://127.0.0.1:54321",
  getSupabasePublishableKey: () => "sb_publishable_local_test_key",
}));

import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { config, proxy } from "@/proxy";

const ORIGIN = "https://lancers.example";

function givenSignedIn(signedIn: boolean) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: {
      getClaims: () =>
        Promise.resolve({ data: signedIn ? { claims: { sub: "auth-user-id" } } : null }),
    },
  } as unknown as ReturnType<typeof createServerClient>);
}

function requestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, ORIGIN));
}

/**
 * The `matcher` entry, compiled and anchored the way Next.js applies it. The
 * entry is already a regular expression over the whole path, so anchoring is
 * the only thing this adds.
 */
const matcher = new RegExp(`^${config.matcher[0]}$`);

function matcherRuns(path: string): boolean {
  return matcher.test(path);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * LAN-78. The provider webhook is the one route in the application an
 * unauthenticated stranger is meant to reach, and it authenticates its own
 * caller with an HMAC over the raw body. Running session refresh in front of it
 * would make every forged POST cost a Supabase round trip before the signature
 * is even read — free amplification on the only public endpoint there is.
 *
 * Asserted because removing the exclusion left every other assertion in this
 * file green.
 */
describe("the provider webhook bypasses session refresh", () => {
  const matcher = new RegExp(config.matcher[0].replace(/^\//, "^/").replace(/\$$/, "$"));

  it("does not match the WhatsApp webhook", () => {
    expect(matcher.test("/api/webhooks/whatsapp")).toBe(false);
  });

  it("still matches every operator route", () => {
    for (const route of ["/operate", "/operate/events", "/operate/roster", "/dashboard"]) {
      expect(matcher.test(route), `${route} should be protected`).toBe(true);
    }
  });

  it("does not exclude the whole webhooks namespace", () => {
    // Only the one self-authenticating route is excused. A future webhook that
    // does not verify its own caller must not inherit the exemption.
    expect(matcher.test("/api/webhooks/anything-else")).toBe(true);
  });
});

describe("row 1 — an anonymous request for the operator shell goes to /login", () => {
  it.each(["/operate", "/operate/roster", "/operate/events", "/operate/report"])(
    "redirects %s",
    async (path) => {
      givenSignedIn(false);

      const response = await proxy(requestFor(path));
      const location = new URL(response.headers.get("location") ?? "");

      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/login");
      expect(location.searchParams.get("redirectTo")).toBe(path);
    },
  );

  it("redirects a deep child nobody has built yet", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/operate/events/8f2/attendance"));
    const location = new URL(response.headers.get("location") ?? "");

    // Not a 404: an anonymous caller learns nothing about which paths exist.
    expect(response.status).toBe(307);
    expect(location.searchParams.get("redirectTo")).toBe("/operate/events/8f2/attendance");
  });

  it("preserves the path exactly, including a query string's absence", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/operate/roster/8f2b0c1e"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.searchParams.get("redirectTo")).toBe("/operate/roster/8f2b0c1e");
    expect(location.origin).toBe(ORIGIN);
  });

  it("discloses nothing about the account in the redirect", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/operate"));
    const location = response.headers.get("location") ?? "";

    expect(location).not.toMatch(/reason|unlinked|inactive|unknown|error/i);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not redirect a signed-in request", async () => {
    givenSignedIn(true);

    const response = await proxy(requestFor("/operate/roster"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});

describe("row 15 — /operate is in the protected set, and nothing else changed", () => {
  it("still protects /dashboard", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/dashboard"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/dashboard");
  });

  it.each(["/", "/login"])("leaves %s public", async (path) => {
    givenSignedIn(false);

    const response = await proxy(requestFor(path));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does not protect a path that merely starts with the same letters", async () => {
    // `/operations` is not `/operate`, and prefix matching must not treat it as
    // one. Nothing lives there today; the assertion is about the comparison.
    givenSignedIn(false);

    const response = await proxy(requestFor("/operations"));

    expect(response.headers.get("location")).toBeNull();
  });

  it("runs on the operator paths, and not on assets or the health check", () => {
    expect(matcherRuns("/operate")).toBe(true);
    expect(matcherRuns("/operate/roster")).toBe(true);
    expect(matcherRuns("/api/health")).toBe(false);
    expect(matcherRuns("/_next/static/chunk.js")).toBe(false);
    expect(matcherRuns("/favicon.ico")).toBe(false);
  });
});
