import { NextResponse, type NextRequest } from "next/server";
import {
  INVITATION_DESTINATION_PATH,
  INVITATION_LINK_TYPE,
  INVITATION_UNUSABLE_PATH,
  isPlausibleInvitationTokenHash,
} from "@/lib/auth/invitation";
import { emailLinkRedirectDestination } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

/**
 * The one-time exchange behind the invitation email's button — LAN-131,
 * LAN-141, LAN-441.
 *
 * ## POST only, since LAN-441
 *
 * The emailed link lands on `/auth/invitation`, a page that renders one button
 * and exchanges nothing. This handler is that button's form target. Until
 * LAN-441 the exchange ran on the link's own GET, and an email security scanner
 * that pre-opens links spent the one-time token before the invitee clicked, so
 * the invitee's own click landed on `/invitation-link`. A GET here is answered
 * 405 by Next, because no `GET` is exported.
 *
 * A deliberate mirror of `/auth/recovery` (LAN-125), for the reasons that route
 * records at length and which apply here unchanged: `verifyOtp` writes the
 * session cookies and a Server Component cannot, so the button posts to a
 * Route Handler which performs the exchange and then redirects — with the token
 * out of the address bar and the browser history entry of the page that shows a
 * password field, and out of any `Referer` a later request carries.
 *
 * It has exactly two destinations, both of them module constants:
 * `/reset-password` when the token was exchanged, `/invitation-link` when it
 * was not. No `next`, no `redirect_to`, no error code in the query string — a
 * caller-supplied destination on a route that has just minted a session is an
 * open redirect with a session attached, and an error code would be a chattier
 * second copy of the message the destination already renders.
 *
 * ## Why there are two, since LAN-311
 *
 * There was one, and the reasoning was that a failed exchange leaves no session
 * and no session is exactly what `/reset-password` renders its invalid-link
 * screen for. That is true, and it produced the wrong screen anyway: the
 * sentence that screen renders is `INVALID_RECOVERY_LINK_MESSAGE`, written for
 * somebody who asked for a **password reset**, telling them to request another
 * one. An invited operator has never had a password and cannot get in that way,
 * so the screen sent them round a loop that could not terminate.
 *
 * Branching on the exchange therefore does not weaken the no-oracle rule that
 * paragraph was protecting. Expired, spent, wrong-type and malformed all land
 * on the same screen reading the same sentence; nothing here tells an
 * unauthenticated visitor whether any account exists. What it distinguishes is
 * which journey the visitor is on — and they already know that, because they
 * are holding the email that sent them.
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
export async function POST(request: NextRequest) {
  // The form body, never the query string. A body that is not a form — or no
  // body at all — reads as no token and lands on the unusable-link screen.
  const form = await request.formData().catch(() => null);
  const tokenHash = stringOrNull(form?.get("token_hash"));
  const type = stringOrNull(form?.get("type"));

  let exchanged = false;

  if (type === INVITATION_LINK_TYPE && isPlausibleInvitationTokenHash(tokenHash)) {
    const supabase = await createClient();
    // Read for one bit only — did a session come back — and never for the
    // reason it did not. The session is the honest test: `verifyOtp` can
    // answer without an `error` and still mint nothing, and it is the session,
    // not the absence of an error, that `/reset-password` needs.
    const { data, error } = await supabase.auth.verifyOtp({
      type: "invite",
      token_hash: tokenHash,
    });
    exchanged = !error && Boolean(data?.session);
  }

  // LAN-141. Not `request.nextUrl.origin`: behind Cloud Run that is the
  // container's own listen address, and a real operator's working invitation
  // ended at `http://0.0.0.0:8080/reset-password`. The origin rule that already
  // governs the outbound link governs the return hop too.
  //
  // `NextResponse.redirect` demands an absolute URL and this may legitimately
  // be a relative path, so the 303 is built directly. It carries nothing but a
  // status and a `Location`, which is all `NextResponse.redirect` sets; the
  // session cookies `verifyOtp` wrote went to the request's cookie store, not
  // to this object.
  const destination = emailLinkRedirectDestination({
    path: exchanged ? INVITATION_DESTINATION_PATH : INVITATION_UNUSABLE_PATH,
    appBaseUrl: process.env.APP_BASE_URL,
    requestOrigin: request.nextUrl.origin,
  });
  const response = new NextResponse(null, {
    status: 303,
    headers: { location: destination },
  });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");

  return response;
}

function stringOrNull(value: FormDataEntryValue | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}
