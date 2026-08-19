/**
 * The first-access invitation link — LAN-131, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, `REQ-email-invitation-path`.
 *
 * Pure functions and constants, exactly as `./recovery.ts` is, so that the
 * route handler, the service that sends the invitation and the test suite all
 * read one set of rules. Nothing here touches Supabase, cookies or the network.
 *
 * ## Why this file is so short, and mostly points at `./recovery.ts`
 *
 * The invitation email and the password-recovery email are the same mechanism
 * with two different subjects. Both are GoTrue email links, both must carry
 * `{{ .TokenHash }}` rather than `{{ .ConfirmationURL }}`, both are exchanged
 * by a Route Handler because `verifyOtp` writes cookies and a Server Component
 * cannot, and both must be built on an origin this deployment trusts rather
 * than on whatever `Host` a request claimed.
 *
 * LAN-125 worked all of that out and wrote it down. Re-deriving it here would
 * produce a second copy capable of drifting — a token-shape check that admits
 * one character more, an origin rule that trusts one header more — so the two
 * shared rules are **imported** rather than restated, and this module adds only
 * what genuinely differs: the link type, the callback path, and where the
 * journey lands.
 *
 * ## Why the invitation lands on `/reset-password`
 *
 * `DEC-email-authentication`: "first login establishes credentials only". That
 * is precisely what `/reset-password` already does — it takes a session minted
 * by an email link and lets its holder choose a password, refusing an ordinary
 * signed-in session. An invited operator needs that screen and nothing else,
 * and a second screen doing the same thing is a second place for the password
 * rule to be applied slightly differently.
 *
 * The one thing it does not do is *say* it is a first-time invitation rather
 * than a reset. That is presentation, it belongs to `WP-surfaces`, and it is
 * recorded as a known limitation rather than guessed at here.
 *
 * ## Why the invited session cannot wander
 *
 * `verifyOtp({ type: "invite" })` mints an ordinary Supabase session whose
 * verified `amr` claim is `otp`. `resolveOperatorAccess()` refuses every `otp`
 * session (LAN-125), so an invitation link buys exactly one thing — the right
 * to set a password — and reaches no operator surface on its own. The operator
 * signs in afterwards with `amr: password` and resolves normally.
 */

import {
  isPlausibleRecoveryTokenHash,
  RECOVERY_CALLBACK_PATH,
  RESET_PASSWORD_PATH,
  resolveRecoveryOrigin,
} from "./recovery";

/** The internal route the emailed invitation link enters through. */
export const INVITATION_CALLBACK_PATH = "/auth/invitation";

/** `type` on the emailed link. Anything else is refused without a round trip. */
export const INVITATION_LINK_TYPE = "invite";

/** Where an exchanged invitation lands: the screen that sets a password. */
export const INVITATION_DESTINATION_PATH = RESET_PASSWORD_PATH;

/**
 * A shape check on the emailed token hash, before any network call.
 *
 * GoTrue issues one token-hash form for every email link type it sends, so this
 * is `isPlausibleRecoveryTokenHash` under the name the invitation path uses.
 * Aliased rather than re-implemented: two regular expressions for one format is
 * how the two quietly stop agreeing.
 */
export const isPlausibleInvitationTokenHash = isPlausibleRecoveryTokenHash;

/**
 * The absolute URL handed to the Auth admin API as `redirectTo`, or `null` when
 * this deployment has no trusted origin to build one from.
 *
 * `resolveRecoveryOrigin` decides the origin, and its rule is the one that
 * matters: `APP_BASE_URL` when configured, otherwise the request's own origin
 * **only if it is loopback**, otherwise nothing. A `Host` header is not
 * evidence, and a credential-establishing link is the last email in this
 * application worth aiming somewhere else.
 *
 * `null` is a refusal, not a fallback. A caller that sent the invitation anyway
 * would get Supabase's Site URL substituted for the unrecognised redirect, and
 * the invited operator would land on the sign-in page holding a token nothing
 * consumes.
 */
export function invitationCallbackUrl(input: {
  appBaseUrl?: string | null;
  requestOrigin?: string | null;
}): string | null {
  const origin = resolveRecoveryOrigin(input);
  return origin === null ? null : `${origin}${INVITATION_CALLBACK_PATH}`;
}

/**
 * Every exact path this application's emailed links redirect to, on one origin.
 *
 * Assembled from the two constants rather than typed out, because this list
 * exists in three places — here, `supabase/config.toml`, and the hosted
 * dashboard — and the two that are checked in must at least be derived from one
 * source. `tests/auth-invitation-configuration.test.ts` reads the TOML and
 * fails if it does not allow-list every entry.
 */
export const EMAIL_LINK_CALLBACK_PATHS: readonly string[] = Object.freeze([
  RECOVERY_CALLBACK_PATH,
  INVITATION_CALLBACK_PATH,
]);
