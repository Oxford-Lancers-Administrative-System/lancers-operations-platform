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
  readonly email: string;
}

export interface InvitationSendResult {
  readonly operatorAccountId: string;
  readonly loginEmail: string;
  readonly state: OperatorAccountState;
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}

export async function resendOperatorInvitation(
  params: ResendInvitationParams,
): Promise<InvitationSendResult> {
  return sendAgain(params, null);
}

/**
 * Corrects the address and sends the invitation again; the old address is
 * recorded in the audit event. Refused once the holder has established
 * credentials — that is `REQ-rehome-email`'s flow, not this one.
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
    // Unreachable for a normal row; kept as a refusal, not a non-null assertion.
    throw new ConstraintViolated(
      "This operator record has no email address on it, so an invitation cannot be sent. " +
        "Correct the address first.",
      { rule: INVALID_EMAIL_RULE },
    );
  }

  if (correctedEmail !== null && correctedEmail !== previousEmail) {
    await identity.changeLoginEmail(prepared.account.authUserId, correctedEmail);
  }

  try {
    await withTransaction(async (tx) => {
      // Everything the first transaction decided is decided again here (LAN132-B3, LAN-141 finding 3) — see decision history.
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
