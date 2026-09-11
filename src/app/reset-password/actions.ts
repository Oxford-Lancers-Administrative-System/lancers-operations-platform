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
 * Set the new password — LAN-125. Re-checks the recovery `amr` claim from the
 * auth server, not trusting `page.tsx`'s earlier check: a plain authenticated
 * session (e.g. an already-signed-in laptop) must be refused here too, since
 * Supabase's recovery link produces an ordinary session. Update, then sign
 * out, then redirect — signing in again with the new password is the proof
 * to the operator that it worked.
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
    // Supabase's own message is not shown — it can name the account state — so this restates the rule.
    return {
      error: `That password was not accepted. Choose a different one of at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    };
  }

  // LAN-131: the moment an invitation stops being pending — first password set
  // is what "Active" means. Idempotent; never re-enables a deactivated account.
  // Not swallowed on failure: the password is already set, and a silent
  // divergence between "can sign in" and "still pending" would confuse Admin.
  if (authUserId !== null) await activateOperatorAccount(authUserId);

  // LAN-132: completes an administrator email re-home (`REQ-rehome-email`) —
  // reaching this screen via the one-time link proves the holder owns the
  // replacement mailbox. Separate from activation: different facts about
  // different accounts. Both are idempotent no-ops for an ordinary reset.
  if (authUserId !== null) await verifyOperatorEmailRehome(authUserId);

  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect(recoveryCompletionDestination(redirectTo));
}

/** The verified subject of this session, or `null` — from the same `getClaims()` verification `amr` is read from, not `getUser()`, so the two facts cannot disagree. */
function readSubject(claims: unknown): string | null {
  const subject = (claims as { sub?: unknown } | null | undefined)?.sub;
  return typeof subject === "string" && subject !== "" ? subject : null;
}
