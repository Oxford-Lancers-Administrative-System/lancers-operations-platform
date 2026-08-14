import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`. This runs before
 * every matched request and does two things:
 *
 *   1. Refreshes the Supabase auth session and writes the rotated cookies back
 *      onto the response. Without this, Server Components see stale sessions.
 *   2. Redirects unauthenticated requests for protected routes to /login.
 *
 * Route protection here is a convenience, not the authorization boundary. RLS
 * in the database and explicit checks in server code are the real boundary.
 */
const PROTECTED_PREFIXES = ["/dashboard", "/operate"];

/**
 * The signed RSVP page (LAN-79) — public, and handled before anything else.
 *
 * It is the one route besides the provider webhook that an unauthenticated
 * stranger is meant to reach, and its authorization is the token in the URL. It
 * must never be authenticated, so refreshing a Supabase session for it buys
 * nothing and costs a round trip per request on the page most exposed to being
 * hammered. Returning early also keeps an operator's session cookie from being
 * rotated by a player's page load — the two surfaces share a browser more often
 * than is comfortable, on a committee member's phone.
 *
 * The headers are set here rather than in `next.config.ts` because a
 * `headers()` entry there loses to what Next writes for a dynamically rendered
 * page. Setting them on the response is what makes them stick.
 *
 * Measured on a production build (`next build` + `next start`), which is the
 * only measurement that counts: both the 200 and the uniform 404 come back
 * `no-store, no-cache, must-revalidate, private`. An earlier note in this
 * repository claimed `no-store` was being stripped — that reading was taken
 * from `next dev`, which sends different headers from the build that ships, and
 * it was wrong. `tests/operate-route-protection.test.ts` now asserts all three.
 */
const RSVP_PREFIX = "/rsvp";

const PUBLIC_RSVP_HEADERS: ReadonlyArray<readonly [string, string]> = [
  // The page names a person and shows their answer. Nothing may keep a copy:
  // not the browser, not a shared proxy, not a CDN.
  ["Cache-Control", "no-store, no-cache, must-revalidate, private"],
  // The token is in the URL, so any outbound request from this page would hand
  // it to a third party in the Referer header — the club contact link is
  // exactly such a request.
  ["Referrer-Policy", "no-referrer"],
  // A signed RSVP link is not a public document, and an indexed one would
  // outlive its own expiry.
  ["X-Robots-Tag", "noindex, nofollow"],
];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (path === RSVP_PREFIX || path.startsWith(`${RSVP_PREFIX}/`)) {
    const rsvp = NextResponse.next({ request });
    for (const [key, value] of PUBLIC_RSVP_HEADERS) rsvp.headers.set(key, value);
    return rsvp;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // getClaims() verifies the JWT rather than trusting the cookie contents.
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !data?.claims) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next.js internals, the health check, the provider
    // webhook, and static assets.
    //
    // `/rsvp` stays matched deliberately, even though it is public: the proxy
    // returns early for it above, before any Supabase work, and sets the
    // headers that route depends on. Excluding it from the matcher would skip
    // the early return too, and with it `no-store`.
    //
    // The WhatsApp webhook — that one route, not the `api/webhooks` namespace —
    // is excluded because it is the one route an unauthenticated
    // stranger is *meant* to reach, and it authenticates its caller itself with
    // an HMAC over the raw body. Running session refresh first would make every
    // forged POST cost a Supabase round trip before the signature is even read
    // — free amplification on the only public endpoint the application has.
    //
    "/((?!_next/static|_next/image|api/health|api/webhooks/whatsapp|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
