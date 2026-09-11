import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { recordAdministrationEvent } from "../administration-audit";
import type { OperatorAccountState } from "../operator-account-state";
import { supabaseOperatorIdentity } from "../operator-identity";
import {
  readAdministrationSubject,
  readOperatorAccountIn,
  resolveActiveCommitteeYear,
  resolveCommitteeYearForActivation,
  type OperatorAccountRecord,
} from "../operator-invitations";
import {
  CALLBACK_URL_MESSAGE,
  CALLBACK_URL_RULE,
  INVALID_EMAIL_MESSAGE,
  INVALID_EMAIL_RULE,
  REHOME_REASON_MESSAGE,
  REHOME_REASON_RULE,
  REHOME_SAME_ADDRESS_MESSAGE,
  REHOME_SAME_ADDRESS_RULE,
  administrationAuthority,
  blankToNull,
  lockAccount,
  normaliseEmail,
  refuseTakenEmail,
  refuseUnlessRehomable,
  requireOperator,
  updateAccount,
} from "./shared";

/**
 * Email re-home — `REQ-rehome-email`. {@link startOperatorEmailRehome} moves
 * the login first (this is what "disables the old login path" means), then
 * marks the account pending and sends the verification link; the target's
 * seats are re-read and re-asserted a second time, inside the transaction
 * that writes, because the login move is an unbounded network call the
 * first transaction cannot hold open across (LAN132-B3).
 * {@link verifyOperatorEmailRehome} records that the holder proved they hold
 * the replacement address. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

/** The Auth-server half of the re-home; deliberately not an addition to `OperatorIdentityPort` — see decision history. */
export interface OperatorEmailRecoveryPort {
  /** Moves the login to a different address. Sends nothing. */
  changeLoginEmail(authUserId: string, email: string): Promise<void>;
  /** Sends the verification link. Throws {@link EmailRehomeDeliveryFailure} on failure; caller records it and leaves the account pending. */
  sendVerification(email: string, redirectTo: string): Promise<void>;
}

/** A verification link that could not be sent. Recorded, never a rollback. */
export class EmailRehomeDeliveryFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EmailRehomeDeliveryFailure";
  }
}

/** The real port — reuses the recovery link (LAN-125) via the stateless client; see decision history. */
function supabaseOperatorEmailRecovery(): OperatorEmailRecoveryPort {
  return {
    changeLoginEmail: (authUserId, email) =>
      supabaseOperatorIdentity().changeLoginEmail(authUserId, email),

    async sendVerification(email, redirectTo) {
      const { error } = await createStatelessClient().auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) throw new EmailRehomeDeliveryFailure(error.message);
    },
  };
}

async function deliverVerification(
  identity: OperatorEmailRecoveryPort,
  email: string,
  callbackUrl: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await identity.sendVerification(email, callbackUrl);
    return { ok: true };
  } catch (error) {
    if (error instanceof EmailRehomeDeliveryFailure) {
      const trimmed = error.message.trim();
      const reason = trimmed === "" ? "The verification email could not be sent." : trimmed;
      return { ok: false, reason: reason.length > 300 ? `${reason.slice(0, 297)}...` : reason };
    }
    throw error;
  }
}

export interface StartEmailRehomeParams {
  readonly operator: ResolvedOperator | null;
  readonly operatorAccountId: string;
  readonly email: string;
  readonly reason: string;
  readonly callbackUrl: string;
  readonly identity?: OperatorEmailRecoveryPort;
}

export interface StartEmailRehomeResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly loginEmail: string;
  readonly previousLoginEmail: string | null;
  readonly state: OperatorAccountState;
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
  readonly retry: boolean;
}

/** Moves sign-in to a replacement address and asks them to prove they hold it (`REQ-rehome-email`); retryable while pending — see decision history. */
export async function startOperatorEmailRehome(
  params: StartEmailRehomeParams,
): Promise<StartEmailRehomeResult> {
  const actor = requireOperator(params.operator);
  const identity = params.identity ?? supabaseOperatorEmailRecovery();
  const email = normaliseEmail(params.email);
  const callbackUrl = (params.callbackUrl ?? "").trim();
  const reason = blankToNull(params.reason);

  if (reason === null) {
    throw new ConstraintViolated(REHOME_REASON_MESSAGE, { rule: REHOME_REASON_RULE });
  }
  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }

  const prepared = await withTransaction(async (tx) => {
    const account = await lockAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action: "recover_email", target: subject });

    refuseUnlessRehomable(account);

    if (account.loginEmail !== null && account.loginEmail.toLowerCase() === email) {
      throw new InvalidTransition(REHOME_SAME_ADDRESS_MESSAGE, { rule: REHOME_SAME_ADDRESS_RULE });
    }
    await refuseTakenEmail(tx, email, account.id);

    return { account, operatingYear };
  });

  const { account } = prepared;
  const previousLoginEmail = account.loginEmail;
  const retry = account.emailRehomePendingAt !== null;

  // Outside the transaction: an unrollbackable network call.
  await identity.changeLoginEmail(account.authUserId, email);

  let after: OperatorAccountRecord;
  try {
    after = await withTransaction(async (tx) => {
      // Everything the first transaction decided is decided again here (LAN132-B3) — see decision history.
      const current = await lockAccount(tx, params.operatorAccountId);

      const subject = await readAdministrationSubject(tx, current.personId, {
        includeScheduled: true,
      });
      assertAdministrationTarget(params.operator, { action: "recover_email", target: subject });

      refuseUnlessRehomable(current);
      await refuseTakenEmail(tx, email, current.id);

      const updated = await updateAccount(
        tx,
        current.id,
        `login_email = $2,
         email_rehome_pending_at = coalesce(email_rehome_pending_at, now())`,
        [email],
      );

      await recordAdministrationEvent(tx, {
        action: retry
          ? "administration.operator.email_rehome_retried"
          : "administration.operator.email_rehome_started",
        actorPersonId: actor.personId,
        authority: administrationAuthority(actor),
        target: { personId: current.personId, operatorAccountId: current.id },
        operatingYear: prepared.operatingYear,
        ...(retry ? {} : { fromState: current.state, toState: updated.state }),
        reason,
        detail: { previousLoginEmail, loginEmail: email },
      });

      return updated;
    });
  } catch (error) {
    // Best-effort: put the address back so the login and the record agree.
    if (previousLoginEmail !== null) {
      await identity
        .changeLoginEmail(account.authUserId, previousLoginEmail)
        .catch(() => undefined);
    }
    throw error;
  }

  const delivery = await deliverVerification(identity, email, callbackUrl);

  if (!delivery.ok) {
    await withTransaction((tx) =>
      recordAdministrationEvent(tx, {
        action: "administration.operator.email_rehome_failed",
        actorPersonId: actor.personId,
        authority: administrationAuthority(actor),
        target: { personId: account.personId, operatorAccountId: account.id },
        operatingYear: prepared.operatingYear,
        detail: { loginEmail: email, reason: delivery.reason },
      }),
    );
  }

  return {
    operatorAccountId: after.id,
    personId: after.personId,
    loginEmail: email,
    previousLoginEmail,
    state: after.state,
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
    retry,
  };
}

export interface VerifyEmailRehomeResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
}

/** Records that the holder proved they hold the replacement address; called with a just-authenticated `auth.users.id`. Idempotent. */
export async function verifyOperatorEmailRehome(
  authUserId: string,
): Promise<VerifyEmailRehomeResult | null> {
  return withTransaction(async (tx) => {
    const found = await tx.query<{ id: string }>(
      `select id from public.operator_accounts
        where auth_user_id = $1 and email_rehome_pending_at is not null
        for update`,
      [authUserId],
    );
    if (found.rows.length === 0) return null;

    const before = await readOperatorAccountIn(tx, found.rows[0].id);
    if (!before) return null;

    const after = await updateAccount(tx, before.id, "email_rehome_pending_at = null", []);
    const operatingYear = await resolveCommitteeYearForActivation(tx);

    // The account holder's own act; no administrative capability behind it.
    await recordAdministrationEvent(tx, {
      action: "administration.operator.email_rehome_verified",
      actorPersonId: before.personId,
      authority: { kind: "self", roleCodes: [] },
      target: { personId: before.personId, operatorAccountId: before.id },
      operatingYear,
      fromState: before.state,
      toState: after.state,
    });

    return { operatorAccountId: after.id, personId: after.personId, state: after.state };
  });
}
