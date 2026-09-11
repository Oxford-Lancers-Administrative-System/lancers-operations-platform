import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { OperatorAccountState } from "../operator-account-state";
import { supabaseOperatorIdentity, type OperatorIdentityPort } from "../operator-identity";
import { resolveActiveCommitteeYear } from "./cycles";
import { deliverInvitation, markDeliveryFailed } from "./delivery";
import { INVALID_EMAIL_RULE } from "./refusals";
import {
  CALLBACK_URL_MESSAGE,
  CALLBACK_URL_RULE,
  INVALID_EMAIL_MESSAGE,
  administrationAuthority,
  lockAccount,
  normaliseEmail,
  refuseTakenEmail,
  refuseUnlessResendable,
  requireAccount,
  requireOperator,
} from "./shared";
import { readAdministrationSubject } from "./subject";

/**
 * Resend, and correct-and-resend — {@link resendOperatorInvitation} and
 * {@link correctOperatorInvitation} share {@link sendAgain}: a pre-flight
 * transaction that refuses before the Auth call, then a write transaction
 * that re-locks the row, re-reads the target's seats and re-asserts the
 * guard, the state rule and the address rule against the row as it is then
 * (LAN132-B3, LAN-141 finding 3). Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export interface ResendInvitationParams {
  readonly operator: ResolvedOperator | null;
  readonly operatorAccountId: string;
  readonly callbackUrl: string;
  readonly identity?: OperatorIdentityPort;
}

export interface CorrectInvitationParams extends ResendInvitationParams {
  /** The address the invitation should have gone to. */
  readonly email: string;
}

export interface InvitationSendResult {
  readonly operatorAccountId: string;
  readonly loginEmail: string;
  readonly state: OperatorAccountState;
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}

/**
 * Sends the invitation again, to the same address.
 *
 * `REQ-invitation-states` offers resend "while pending or failed", and
 * `resendAvailable` on the state vocabulary is where that rule lives — this
 * asks the state rather than listing the two states again.
 *
 * An expired link is a normal reason to be here, not an error: the requirement
 * "treats expiration as normal", and there is nothing to clean up because the
 * expiry is GoTrue's and the account never changed.
 */
export async function resendOperatorInvitation(
  params: ResendInvitationParams,
): Promise<InvitationSendResult> {
  return sendAgain(params, null);
}

/**
 * Corrects the address and sends the invitation again.
 *
 * `REQ-invitation-states`: "permits correction and resend". The address moves
 * on the login and on the account together, and the old address is recorded in
 * the audit event rather than being quietly overwritten — an invitation that
 * went to the wrong person's mailbox is exactly the thing somebody will need to
 * reconstruct later.
 *
 * It is refused once the holder has established credentials. Changing the
 * address of a working account is `REQ-rehome-email`'s administrator recovery
 * flow, which disables the old login path, records a reason and holds the
 * account in Email change pending until the new address is verified. Silently
 * doing it here would be that flow without any of its protections.
 */
export async function correctOperatorInvitation(
  params: CorrectInvitationParams,
): Promise<InvitationSendResult> {
  const email = normaliseEmail(params.email);
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }
  return sendAgain(params, email);
}

/**
 * The shared body of resend and correction.
 *
 * They differ in one place — whether the address moves — and are one function
 * because everything else about them is identical, including the two things
 * easiest to get subtly different between two copies: which states permit them,
 * and the fact that the failure columns are cleared *before* the send so that a
 * fresh failure is a real transition rather than a no-change the ledger refuses.
 */
async function sendAgain(
  params: ResendInvitationParams,
  correctedEmail: string | null,
): Promise<InvitationSendResult> {
  const identity = params.identity ?? supabaseOperatorIdentity();
  const callbackUrl = (params.callbackUrl ?? "").trim();
  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }

  const action = correctedEmail === null ? "resend_invitation" : "correct_invitation";

  const prepared = await withTransaction(async (tx) => {
    const account = await requireAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    // The snapshot includes seats that have not started yet. See the module
    // note: a pending invitation carrying a future-dated protected seat must
    // protect its target now, not from the handover date.
    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action, target: subject });

    refuseUnlessResendable(account);
    if (correctedEmail !== null) {
      await refuseTakenEmail(tx, correctedEmail, account.id);
    }

    return { account, operatingYear };
  });

  const previousEmail = prepared.account.loginEmail;
  const email = correctedEmail ?? previousEmail;
  if (email === null) {
    // Only reachable for a row created before this package existed by a script
    // that set a password directly — and such a row is Active, so
    // `refuseUnlessResendable` has already refused it. Kept as a refusal rather
    // than a non-null assertion, because "send an invitation to nowhere" is not
    // a state this module may guess its way out of.
    throw new ConstraintViolated(
      "This operator record has no email address on it, so an invitation cannot be sent. " +
        "Correct the address first.",
      { rule: INVALID_EMAIL_RULE },
    );
  }

  // The address moves on the login before it moves in the database, so that a
  // failure to move it leaves both saying the same thing. If the database
  // write then fails, the login is moved back.
  if (correctedEmail !== null && correctedEmail !== previousEmail) {
    await identity.changeLoginEmail(prepared.account.authUserId, correctedEmail);
  }

  try {
    await withTransaction(async (tx) => {
      // **Everything the first transaction decided is decided again here.**
      //
      // The first transaction committed before the Auth call above, so every
      // fact it checked is a snapshot taken before an unbounded network window.
      // `startOperatorEmailRehome` closes the identical window (LAN132-B3) and
      // this path was missed; LAN-141 finding 3 is that omission.
      //
      // The sharp case is `correct_invitation` on an account that activates
      // inside the window: without this, correcting an invitation silently
      // becomes an email re-home of a working account with none of
      // `REQ-rehome-email`'s protections — no `recover_email` guard with its
      // different authority list, no reason, no Email change pending. The
      // guard's own window is the second: an administrator assigning a
      // protected seat inside it would have made this a redirection of the
      // link that confers it, authorized against a target who held nothing
      // when the question was asked.
      //
      // So the row is locked, the target's seats are re-read with the same
      // `includeScheduled` widening, and the guard, the state rule and the
      // address rule are all re-asserted against the row as it is now. On a
      // refusal the `catch` below moves the login back, exactly as the
      // sibling flow does.
      const current = await lockAccount(tx, prepared.account.id);

      const subject = await readAdministrationSubject(tx, current.personId, {
        includeScheduled: true,
      });
      assertAdministrationTarget(params.operator, { action, target: subject });

      refuseUnlessResendable(current);
      if (correctedEmail !== null) {
        await refuseTakenEmail(tx, correctedEmail, current.id);
      }

      await tx.query(
        `update public.operator_accounts
            set login_email = $2,
                invited_at = now(),
                invitation_delivery_failed_at = null,
                invitation_delivery_failure_reason = null,
                updated_at = now()
          where id = $1`,
        [current.id, email],
      );

      await recordAdministrationEvent(tx, {
        action:
          correctedEmail === null
            ? "administration.operator.invitation_resent"
            : "administration.operator.invitation_corrected",
        actorPersonId: requireOperator(params.operator).personId,
        authority: administrationAuthority(params.operator),
        target: { personId: current.personId, operatorAccountId: current.id },
        operatingYear: prepared.operatingYear,
        detail:
          correctedEmail === null
            ? {}
            : { previousLoginEmail: previousEmail, loginEmail: correctedEmail },
      });
    });
  } catch (error) {
    if (correctedEmail !== null && correctedEmail !== previousEmail && previousEmail !== null) {
      await identity
        .changeLoginEmail(prepared.account.authUserId, previousEmail)
        .catch(() => undefined);
    }
    throw error;
  }

  const delivery = await deliverInvitation(identity, email, callbackUrl);

  if (!delivery.ok) {
    await withTransaction((tx) =>
      markDeliveryFailed(tx, {
        operator: params.operator,
        operatorAccountId: prepared.account.id,
        personId: prepared.account.personId,
        operatingYear: prepared.operatingYear,
        reason: delivery.reason,
      }),
    );
  }

  return {
    operatorAccountId: prepared.account.id,
    loginEmail: email,
    state: delivery.ok ? "invitation_pending" : "delivery_failed",
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
  };
}
