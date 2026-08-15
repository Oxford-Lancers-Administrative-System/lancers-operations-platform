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

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(recoveryCompletionDestination(redirectTo));
}
