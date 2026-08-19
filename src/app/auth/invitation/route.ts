import { NextResponse, type NextRequest } from "next/server";
import {
  INVITATION_DESTINATION_PATH,
  INVITATION_LINK_TYPE,
  isPlausibleInvitationTokenHash,
} from "@/lib/auth/invitation";
import { createClient } from "@/lib/supabase/server";

/**
 * The one-time exchange the invitation email lands on — LAN-131.
 *
 * A deliberate mirror of `/auth/recovery` (LAN-125), for the reasons that route
 * records at length and which apply here unchanged: `verifyOtp` writes the
 * session cookies and a Server Component cannot, so the emailed link enters a
 * Route Handler which performs the exchange and then redirects — with the token
 * gone from the address bar, out of the browser history entry for the page that
 * shows a password field, and out of any `Referer` a later request carries.
 *
 * It has exactly one destination, `/reset-password`, whatever happened. No
 * `next`, no `redirect_to`, no error code in the query string: a caller-supplied
 * destination on a route that has just minted a session is an open redirect with
 * a session attached, and an error code would be a chattier second copy of the
 * message that page already renders for a request arriving with no session.
 *
 * ## What it does *not* do, and this is the part worth reading
 *
 * It does not mark the account activated. Opening a link proves somebody read
 * the mailbox; it does not establish credentials, and
 * `DEC-email-authentication` is specific that "first login establishes
 * credentials only". An account marked Active here, whose holder then closed
 * the tab without choosing a password, would read as usable while nobody could
 * sign into it — and no administrator would be shown a Resend, because
 * `REQ-invitation-states` offers resend "while pending or failed".
 *
 * So activation is recorded by the action that sets the password, in
 * `src/app/reset-password/actions.ts`, against the session this route minted.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (type === INVITATION_LINK_TYPE && isPlausibleInvitationTokenHash(tokenHash)) {
    const supabase = await createClient();
    // The result is not read, for the reason `/auth/recovery` gives: a failed
    // exchange leaves no session, and no session is exactly what the
    // destination renders its generic invalid-link screen for. Branching here
    // could only produce a more specific message than that screen is allowed to
    // give — and "this invitation was already used" is an account oracle.
    await supabase.auth.verifyOtp({ type: "invite", token_hash: tokenHash });
  }

  const destination = new URL(INVITATION_DESTINATION_PATH, request.nextUrl.origin);
  const response = NextResponse.redirect(destination, { status: 303 });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}
