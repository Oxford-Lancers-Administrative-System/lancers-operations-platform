import { NextResponse, type NextRequest } from "next/server";
import {
  isPlausibleRecoveryTokenHash,
  RECOVERY_LINK_TYPE,
  RESET_PASSWORD_PATH,
} from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

/**
 * The one-time exchange the recovery email lands on — LAN-125.
 *
 * ## Why this route exists at all
 *
 * `verifyOtp` writes the session cookies, and a Server Component cannot write
 * cookies. So the emailed link enters here, a Route Handler, which performs the
 * exchange and then redirects to `/reset-password` — with the token gone from
 * the address bar, out of the browser's history entry for the page that shows a
 * password field, and out of any `Referer` a later request might carry.
 *
 * ## It has exactly one destination
 *
 * `/reset-password`, always, whatever happened. There is no `next`, no
 * `redirect_to` and no error code in the query string:
 *
 *   * A caller-supplied destination on a route that has just minted a session
 *     is an open redirect with a session attached, which is the worst version
 *     of one.
 *
 *   * An error code would be a second, chattier copy of the failure the reset
 *     page already renders. `/reset-password` decides what to show by asking
 *     whether it has a recovery session, so a failed exchange arrives with no
 *     session and gets the generic invalid-link screen for free. One state
 *     machine, one message, and nothing in the URL to read.
 *
 * ## What it refuses before touching the network
 *
 * A missing token, a `type` that is not `recovery`, and anything that is not
 * shaped like a GoTrue token hash. Supabase would refuse all three as well —
 * with the same opaque "Email link is invalid or has expired" it uses for a
 * spent link, a garbage link and a wrong-type link alike, which is verified in
 * `tests/auth-recovery-flow.test.ts` — but there is no reason to hand a
 * hostile query string to the auth server to find out.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (type === RECOVERY_LINK_TYPE && isPlausibleRecoveryTokenHash(tokenHash)) {
    const supabase = await createClient();
    // The result is not read: a failed exchange leaves no session, and no
    // session is precisely what `/reset-password` renders its generic
    // invalid-link screen for. Branching on the error here could only produce a
    // more specific message than the one that screen is allowed to give.
    await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
  }

  const destination = new URL(RESET_PASSWORD_PATH, request.nextUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });

  // The redirect itself must not be cached or attributed. `src/proxy.ts` sets
  // the same three on every recovery path; a Route Handler's own response is
  // the one place worth being explicit, because this is the response that still
  // has the token in its request URL.
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}
