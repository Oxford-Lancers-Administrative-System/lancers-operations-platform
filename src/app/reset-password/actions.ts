"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  INVALID_RECOVERY_LINK_MESSAGE,
  isRecoveryAuthenticatedSession,
  MINIMUM_PASSWORD_LENGTH,
  recoveryCompletionDestination,
  validateNewPassword,
} from "@/lib/auth/recovery";
import { verifyOperatorEmailRehome } from "@/lib/services/operator-administration";
import { activateOperatorAccount } from "@/lib/services/operator-invitations";
import { createClient } from "@/lib/supabase/server";

export type ResetPasswordState = { error: string | null; expired?: boolean };

/**
 * Set the new password — LAN-125.
 *
 * ## The recovery check is repeated here on purpose
 *
 * `page.tsx` asks the same question before it renders the form, and that answer
 * is worth nothing to this action: a form post is a request in its own right,
 * and the session behind it may have changed, been replaced by an ordinary
 * sign-in in another tab, or never have been a recovery session at all. So the
 * verified `amr` claim is read again, from the auth server, immediately before
 * the write.
 *
 * A plain authenticated session is refused here exactly as it is refused by the
 * page. Supabase's recovery link produces an ordinary session, so "is somebody
 * signed in?" is not the question — "did this session come from a recovery
 * link?" is. Without that distinction, anyone sitting at an already-signed-in
 * committee laptop could change the password without knowing the current one.
 *
 * ## Order of operations at the end
 *
 * Update, then sign out, then redirect. Signing out ends the temporary recovery
 * session so the browser is left holding nothing, and the operator signs in
 * again with the password they just chose — which is also the only honest proof
 * to them that it worked.
 */
export async function completePasswordReset(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmPassword") ?? "");
  const redirectTo = formData.get("redirectTo");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (!isRecoveryAuthenticatedSession(data?.claims)) {
    return { error: INVALID_RECOVERY_LINK_MESSAGE, expired: true };
  }

  const policyFailure = validateNewPassword(password, confirmation);
  if (policyFailure) return { error: policyFailure };

  const authUserId = readSubject(data?.claims);

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    // Supabase is the final word on the password rule, and it enforces more
    // than a length: refusing a password identical to the current one, for
    // instance. Its message is not shown — it can name the account state — so
    // this restates the rule the operator can act on.
    return {
      error: `That password was not accepted. Choose a different one of at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    };
  }

  // LAN-131. This screen is where an invited operator establishes credentials
  // for the first time, and `DEC-email-authentication` is specific that first
  // login does exactly that and nothing else. So this is the moment — and the
  // only moment — an invitation stops being pending: the person now has a
  // password, which is what "Active" means and what opening the emailed link
  // did not prove.
  //
  // It is idempotent, so an ordinary password reset by a long-standing operator
  // passes straight through it and writes nothing. It never re-enables a
  // deactivated account: `is_active` is untouched, so such an account stays
  // Deactivated and no event is written, because nothing transitioned.
  //
  // A failure here is deliberately **not** swallowed. It can only be a database
  // failure, the write is one atomic statement plus its audit row, and the
  // alternative — a person who can sign in while every Administration surface
  // shows their invitation as still pending, and offers a resend that will now
  // be refused — is a divergence nobody would notice until it confused
  // somebody. The password is already set, so an operator who sees this can
  // sign in from the sign-in page while it is looked at.
  if (authUserId !== null) await activateOperatorAccount(authUserId);

  // LAN-132. The other thing setting a password can complete: an administrator
  // email re-home. `REQ-rehome-email` holds the account in Email change pending
  // "until verification", and this is the verification — while a re-home is in
  // flight the login has *already* been moved to the replacement address, so
  // the one-time link that reached this screen can only have been sent there,
  // and following it is proof the holder has that mailbox.
  //
  // Separate from activation rather than folded into it, because they are
  // different facts about different accounts: one is "these credentials exist
  // for the first time", the other is "this address is now theirs". Both are
  // idempotent no-ops for the ordinary forgotten-password reset that every
  // other operator in the club uses this screen for.
  if (authUserId !== null) await verifyOperatorEmailRehome(authUserId);

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(recoveryCompletionDestination(redirectTo));
}

/**
 * The verified subject of this session, or `null`.
 *
 * `sub` on a claim set `getClaims()` verified against the auth server — the
 * same source `isRecoveryAuthenticatedSession` reads `amr` from, checked here
 * rather than taken from `getUser()` so that both facts about the session come
 * from one verification rather than two that could disagree.
 */
function readSubject(claims: unknown): string | null {
  const subject = (claims as { sub?: unknown } | null | undefined)?.sub;
  return typeof subject === "string" && subject !== "" ? subject : null;
}
