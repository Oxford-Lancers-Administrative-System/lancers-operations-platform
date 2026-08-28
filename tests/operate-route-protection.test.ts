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
  givenClaims(signedIn ? { sub: "auth-user-id", amr: [{ method: "password" }] } : null);
}

/**
 * LAN-125. `amr` is what separates a session that came from a password sign-in
 * from one that came from a recovery link, so the stub carries it — a stub that
 * omitted it would make every assertion below pass whatever the proxy did with
 * a recovery session.
 */
function givenClaims(claims: Record<string, unknown> | null) {
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getClaims: () => Promise.resolve({ data: claims === null ? null : { claims } }) },
  } as unknown as ReturnType<typeof createServerClient>);
}

function givenRecoverySession() {
  givenClaims({ sub: "auth-user-id", amr: [{ method: "otp" }] });
}

function requestFor(path: string, init?: { method?: string }): NextRequest {
  return new NextRequest(new URL(path, ORIGIN), init);
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

  it.each(["/", "/login", "/forgot-password", "/reset-password", "/auth/recovery"])(
    "leaves %s public",
    async (path) => {
      givenSignedIn(false);

      const response = await proxy(requestFor(path));

      expect(response.headers.get("location")).toBeNull();
    },
  );

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

/**
 * A recovery session may not roam the application — LAN-125.
 *
 * Independent review found this by walking it, and it was reproduced in a
 * browser before the guard existed: following the emailed link and then simply
 * navigating to `/operate/roster` — without ever setting a password — opened
 * the shell and the members' email addresses. Because no password was set, the
 * operator was never locked out and nothing signalled the intrusion.
 *
 * The real refusal is `resolveOperatorAccess()`, which every page under
 * `/operate` goes through; `src/lib/auth/operator.test.ts` owns that half. This
 * half is the proxy's, and its job is only to send the person somewhere useful.
 */
describe("a recovery session reaches the reset page and nothing else", () => {
  it.each(["/operate", "/operate/roster", "/operate/events/8f2/attendance", "/dashboard"])(
    "sends %s to the reset page",
    async (path) => {
      givenRecoverySession();

      const response = await proxy(requestFor(path));
      const location = new URL(response.headers.get("location") ?? "");

      expect(response.status).toBe(307);
      expect(location.pathname).toBe("/reset-password");
    },
  );

  it("does not offer the refused destination back", async () => {
    // A `redirectTo` here would hand the session a link to the very place it has
    // just been refused, to be followed the moment a password is set.
    givenRecoverySession();

    const response = await proxy(requestFor("/operate/roster"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.search).toBe("");
    expect(location.href).not.toContain("roster");
  });

  it("still lets an ordinary session through", async () => {
    // The counterweight. A guard that refused every session would pass every
    // assertion above and break the application.
    givenSignedIn(true);

    const response = await proxy(requestFor("/operate/roster"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("leaves the recovery journey itself reachable", async () => {
    // Refusing `/reset-password` to the one session that is allowed there would
    // be a redirect loop, which is how this kind of guard usually goes wrong.
    givenRecoverySession();

    for (const path of ["/reset-password", "/forgot-password", "/auth/recovery", "/login"]) {
      const response = await proxy(requestFor(path));
      expect(response.headers.get("location"), `${path} should stay reachable`).toBeNull();
    }
  });
});

/**
 * The emailed-link surfaces — LAN-125, and `/auth/invitation` from LAN-131.
 *
 * These four are public and stay public: a person who cannot sign in is
 * precisely who needs them, and an invited person has never signed in at all.
 * What they must carry is the same header set the signed RSVP page carries, and
 * for a sharper reason on the two callbacks — the one-time token is in that
 * request's URL, so without `no-referrer` the next outbound request from the
 * page would hand it to a third party's access log.
 *
 * Unlike `/rsvp` they do not return early, because a callback needs the cookie
 * machinery this proxy sets up in order to persist what `verifyOtp` produces.
 * The counterweight is asserted below, in both directions.
 */
describe("the recovery surfaces are public, and keep no trace", () => {
  const RECOVERY = ["/forgot-password", "/reset-password", "/auth/recovery", "/auth/invitation"];

  it.each(RECOVERY)("%s is matched by the proxy, or none of the below would run", (path) => {
    expect(matcherRuns(path)).toBe(true);
  });

  it.each(RECOVERY)("%s never redirects an anonymous visitor to sign in", async (path) => {
    // The people who need these pages are the ones who cannot sign in. A
    // redirect here would be a closed loop.
    givenSignedIn(false);

    const response = await proxy(requestFor(path));

    expect(response.headers.get("location")).toBeNull();
  });

  it.each(RECOVERY)("%s stops a one-time token leaving in a Referer header", async (path) => {
    givenSignedIn(false);

    const response = await proxy(requestFor(`${path}?token_hash=abc123&type=recovery`));

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it.each(RECOVERY)("%s lets nothing keep a copy", async (path) => {
    givenSignedIn(false);

    const cacheControl = (await proxy(requestFor(path))).headers.get("cache-control") ?? "";

    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
  });

  it.each(RECOVERY)("%s is not indexable", async (path) => {
    givenSignedIn(false);

    expect((await proxy(requestFor(path))).headers.get("x-robots-tag")).toContain("noindex");
  });

  it("still runs the session machinery on the callback, which is what writes its cookies", async () => {
    // The counterweight to the early return `/rsvp` gets. `verifyOtp` in the
    // route handler needs the Supabase cookie handling this function sets up;
    // an early return here would leave the exchange with nowhere to write.
    givenSignedIn(false);

    await proxy(requestFor("/auth/recovery?token_hash=abc123&type=recovery"));

    expect(createServerClient).toHaveBeenCalled();
  });

  it("does not hand these headers to every other page", async () => {
    // Scoped, not global. `/login` is an ordinary page and a blanket `no-store`
    // would be a silent change to everything nobody asked for.
    givenSignedIn(false);

    const response = await proxy(requestFor("/login"));

    expect(response.headers.get("cache-control")).toBeNull();
    expect(response.headers.get("referrer-policy")).toBeNull();
  });

  it("does not treat a path that merely starts with the same letters as one of them", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/reset-password-please"));

    expect(response.headers.get("cache-control")).toBeNull();
  });
});

/**
 * The signed RSVP page's headers — LAN-79.
 *
 * These exist because independent review deleted `Referrer-Policy: no-referrer`
 * from the proxy and the whole suite stayed green. That header is the single
 * thing standing between a token in a URL and a third party's access log, and
 * nothing asserted it. Neither did anything assert the early return itself, or
 * the reason it exists.
 */
describe("the signed RSVP page is public, unauthenticated, and carries its own headers", () => {
  const RSVP = "/rsvp/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";

  it("is matched by the proxy, or none of the below would run at all", () => {
    expect(matcherRuns("/rsvp")).toBe(true);
    expect(matcherRuns(RSVP)).toBe(true);
  });

  it("stops the token leaving in a Referer header", async () => {
    // The token IS the authorization and it is in the URL, so any outbound
    // request from this page would hand it to whoever received it.
    givenSignedIn(false);

    const response = await proxy(requestFor(RSVP));

    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("lets nothing keep a copy of a page that names a player", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor(RSVP));

    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
  });

  it("keeps a signed link out of search results", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor(RSVP));

    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("never redirects a player to sign in", async () => {
    // It is the one page in the application with no session. A redirect here
    // would be a sign-in prompt on an unauthenticated surface.
    givenSignedIn(false);

    const response = await proxy(requestFor(RSVP));

    expect(response.headers.get("location")).toBeNull();
  });

  it("does no Supabase work at all, so it cannot rotate an operator's cookie", async () => {
    // The stated reason for the early return: a player's page load must not
    // cost a session round trip, and must not touch the session of an operator
    // who happens to share the browser — a committee member's phone.
    givenSignedIn(true);

    await proxy(requestFor(RSVP));

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("still refreshes the session on every other path", async () => {
    // The counterweight: proof that the early return is scoped to /rsvp and has
    // not quietly switched session handling off everywhere.
    givenSignedIn(true);

    await proxy(requestFor("/operate/roster"));

    expect(createServerClient).toHaveBeenCalled();
  });
});

/**
 * The club link — LAN-157, D2, D81.
 *
 * The same three headers as `/rsvp`, for the same three reasons: the signed
 * token is in the URL, the page names people and says what they answered, and a
 * squad list is not a public document however un-secret it is from the squad.
 *
 * D81 settles who may read it. It settles nothing about who may keep a copy,
 * and these assertions are the difference.
 */
describe("the club link is public, unauthenticated, and carries its own headers", () => {
  const CLUB_LINK = "/e/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";

  it("is matched by the proxy, or none of the below would run at all", () => {
    expect(matcherRuns("/e")).toBe(true);
    expect(matcherRuns(CLUB_LINK)).toBe(true);
  });

  it("stops the token leaving in a Referer header", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(CLUB_LINK));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("lets nothing keep a copy of a page that names the squad", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(CLUB_LINK));
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
  });

  it("keeps a shared link out of search results", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(CLUB_LINK));
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("never redirects a coach to sign in — they have no account", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(CLUB_LINK));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does no Supabase work, so a coach's page load cannot rotate an operator's cookie", async () => {
    givenSignedIn(true);
    await proxy(requestFor(CLUB_LINK));
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("does not swallow a path that merely starts with the same letter", async () => {
    // `/e` is a one-character prefix, and a naive `startsWith` would take
    // `/events` — and, worse, `/edit` — out of session handling entirely.
    givenSignedIn(true);
    await proxy(requestFor("/events/something"));
    expect(createServerClient).toHaveBeenCalled();
  });
});

/**
 * The WhatsApp/email answer link — LAN-172, Q-11.
 *
 * The same three headers as `/rsvp` and `/e`, for the same three reasons, plus
 * one property neither of those routes has: a GET sets the gate cookie the
 * answer's POST checks, and a POST does not set it again.
 */
describe("the answer link is public, unauthenticated, and gates its own POST", () => {
  const ANSWER_LINK =
    "/a/y.abcdefgh-abcd-abcd-abcd-abcdefabcdef.token123token123token123token123token123x";

  it("is matched by the proxy, or none of the below would run at all", () => {
    expect(matcherRuns("/a")).toBe(true);
    expect(matcherRuns(ANSWER_LINK)).toBe(true);
  });

  it("stops the token leaving in a Referer header", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(ANSWER_LINK));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("lets nothing keep a copy", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(ANSWER_LINK));
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
  });

  it("keeps a one-time link out of search results", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(ANSWER_LINK));
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("does no Supabase work, so a player's tap cannot rotate an operator's cookie", async () => {
    givenSignedIn(true);
    await proxy(requestFor(ANSWER_LINK));
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("sets the gate cookie on a GET, scoped to this exact path", async () => {
    const response = await proxy(requestFor(ANSWER_LINK, { method: "GET" }));
    const cookie = response.cookies.get("lo_pa_gate");
    expect(cookie?.value).toBe("1");
    expect(cookie?.path).toBe(ANSWER_LINK);
    expect(cookie?.httpOnly).toBe(true);
  });

  it("does not set the gate cookie on a POST — only a GET proves a browser read the page", async () => {
    const response = await proxy(requestFor(ANSWER_LINK, { method: "POST" }));
    expect(response.cookies.get("lo_pa_gate")).toBeUndefined();
  });

  it("does not swallow a path that merely starts with the same letter", async () => {
    givenSignedIn(true);
    await proxy(requestFor("/auth/recovery"));
    expect(createServerClient).toHaveBeenCalled();
  });
});

/**
 * The player's durable page — LAN-172.
 *
 * Same three headers as every other unauthenticated link surface. No cookie
 * gate: unlike `/a`, nothing here is single-use, so there is nothing a
 * GET/POST split needs to protect.
 */
describe("the durable player page is public and unauthenticated", () => {
  const HOME = "/me/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123";

  it("is matched by the proxy, or none of the below would run at all", () => {
    expect(matcherRuns("/me")).toBe(true);
    expect(matcherRuns(HOME)).toBe(true);
  });

  it("stops the token leaving in a Referer header", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(HOME));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("lets nothing keep a copy of a page that lists a player's own events", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(HOME));
    const cacheControl = response.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    expect(cacheControl).toContain("private");
  });

  it("keeps a durable link out of search results", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(HOME));
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("never redirects a player to sign in — they have no account", async () => {
    givenSignedIn(false);
    const response = await proxy(requestFor(HOME));
    expect(response.headers.get("location")).toBeNull();
  });

  it("does no Supabase work, so a player's page load cannot rotate an operator's cookie", async () => {
    givenSignedIn(true);
    await proxy(requestFor(HOME));
    expect(createServerClient).not.toHaveBeenCalled();
  });
});

/**
 * F-A3, LAN-180. The signed-in entry point at bare `/me` — distinct from
 * `/me/[token]` above, which stays public and token-authorized, entirely
 * unaffected. This is the one path in the whole `/me` prefix whose
 * authorization is a session, and it is what a club member with a login and
 * no WhatsApp/email answer history now reaches their own page through.
 *
 * Written the same shape as "row 1"'s own suite, on purpose: this is that
 * same guarantee, extended to a fourth path, and diverging test shapes for
 * the identical property would itself be a maintenance trap.
 */
describe("F-A3 — the signed-in entry point /me is protected, and /me/[token] is unaffected", () => {
  it("redirects an anonymous request for bare /me to /login with its destination intact", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/me"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("redirectTo")).toBe("/me");
  });

  it("does not redirect a signed-in request for bare /me", async () => {
    givenSignedIn(true);

    const response = await proxy(requestFor("/me"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("does real Supabase session work for bare /me, unlike /me/[token]", async () => {
    // The regression this proves: before the fix, bare `/me` fell into the
    // same early return `/me/[token]` does — no session refresh, and no
    // redirect for an anonymous request either, which would have made the
    // "redirects an anonymous request" test above the one that actually
    // caught it.
    givenSignedIn(true);

    await proxy(requestFor("/me"));

    expect(createServerClient).toHaveBeenCalled();
  });

  it("sends a recovery session at bare /me to the reset page, exactly as /dashboard and /operate", async () => {
    givenRecoverySession();

    const response = await proxy(requestFor("/me"));
    const location = new URL(response.headers.get("location") ?? "");

    expect(location.pathname).toBe("/reset-password");
  });

  it("leaves /me/[token] public even though bare /me is now protected", async () => {
    givenSignedIn(false);

    const response = await proxy(requestFor("/me/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLM0123"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("cache-control") ?? "").toContain("no-store");
  });

  it("does not protect a path that merely starts with the same letters", async () => {
    // `/media` is not `/me`, and prefix matching must not treat it as one.
    givenSignedIn(false);

    const response = await proxy(requestFor("/media"));

    expect(response.headers.get("location")).toBeNull();
  });
});
