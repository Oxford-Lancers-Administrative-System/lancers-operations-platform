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

export async function proxy(request: NextRequest) {
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
    // The WhatsApp webhook — that one route, not the `api/webhooks` namespace —
    // is excluded because it is the one route an unauthenticated
    // stranger is *meant* to reach, and it authenticates its caller itself with
    // an HMAC over the raw body. Running session refresh first would make every
    // forged POST cost a Supabase round trip before the signature is even read
    // — free amplification on the only public endpoint the application has.
    "/((?!_next/static|_next/image|api/health|api/webhooks/whatsapp|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
