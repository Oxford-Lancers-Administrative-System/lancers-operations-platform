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

/**
 * The Auth-server half of the re-home, as a port with one implementation.
 *
 * Deliberately **not** an addition to `OperatorIdentityPort`. That interface has
 * four members and a test double in `operator-invitations.test.ts` that
 * implements exactly those four; widening it would break a merged suite for no
 * gain. This is the narrower thing this flow needs, and `changeLoginEmail` is
 * delegated to the existing implementation rather than written twice.
 */
export interface OperatorEmailRecoveryPort {
  /** Moves the login to a different address. Sends nothing. */
  changeLoginEmail(authUserId: string, email: string): Promise<void>;
  /**
   * Sends the verification link to the replacement address.
   *
   * Throws {@link EmailRehomeDeliveryFailure} on any failure. The caller records
   * the failure and leaves the account pending, because the old login path is
   * already gone by then and putting it back would be worse than a retry.
   */
  sendVerification(email: string, redirectTo: string): Promise<void>;
}

/** A verification link that could not be sent. Recorded, never a rollback. */
export class EmailRehomeDeliveryFailure extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "EmailRehomeDeliveryFailure";
  }
}

/**
 * The real port.
 *
 * ## Why the verification link is a recovery link
 *
 * `REQ-rehome-email` asks for "a secure verification link to an unused
 * replacement email". This repository already has exactly one such link and has
 * had it since LAN-125: the recovery email, templated to carry `{{ .TokenHash }}`
 * to `/auth/recovery` on this origin, exchanged there for a session that may do
 * one thing — set a password — and nothing else. Following it proves control of
 * the mailbox it was sent to, which is the whole question being asked.
 *
 * GoTrue's **invite** endpoint would not do. It refuses an address whose login
 * has already confirmed an email, which every account reaching this flow has:
 * `REQ-rehome-email` is about somebody who *had* working credentials and lost
 * the mailbox behind them. Invitation is for an account that never had any, and
 * `correctOperatorInvitation` already owns that case and already refuses an
 * activated account — the two flows meet exactly, with no gap and no overlap.
 *
 * The request is made through the **stateless** client for the reason
 * `src/lib/auth/recovery.ts` gives at length: a cookie-backed client writes a
 * PKCE verifier, and the emailed link then only works in the browser that asked
 * for it. Nobody is sitting at that browser here — an administrator asked, and
 * somebody else's phone opens the mail.
 */
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
  /** The replacement address. Must not already have an operator login. */
  readonly email: string;
  /** Required. `REQ-rehome-email`: the administrator "records a reason". */
  readonly reason: string;
  /** Where the emailed link points — `RECOVERY_CALLBACK_PATH` on this origin. */
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
  /** True when this corrected an address a previous attempt had moved to. */
  readonly retry: boolean;
}

/**
 * Moves an operator's sign-in to a replacement address and asks them to prove
 * they hold it — `REQ-rehome-email`.
 *
 * ## The order, and what each step buys
 *
 *   1. Everything refusable is refused first, inside a transaction that reads
 *      the account and the target's seats: the guard, the state, the address.
 *   2. The login moves to the replacement address. **This is what "disables the
 *      old login path" means** — the old address then signs in nowhere and
 *      receives no reset link, which matters most in the case the requirement
 *      names, where somebody else is reading that mailbox.
 *   3. `email_rehome_pending_at` is stamped, which makes the account Email
 *      change pending and makes `resolveOperatorAccess()` refuse it. Without
 *      that second half the flow would be a hole rather than a control: local
 *      Supabase runs with `enable_confirmations = false`, so an unconfirmed
 *      address signs in perfectly well, and a compromised account whose password
 *      had also been taken would still be usable.
 *   4. The verification link is sent. A failure here is recorded and the account
 *      stays pending — the old path is already gone, and restoring it to
 *      compensate would hand it back to whoever the requirement is protecting
 *      the account from.
 *
 * ## Retrying
 *
 * "Failure is correctable and retryable on the same account." So this may be
 * called again while the account is already pending — to a corrected address,
 * or to the same one after a transport failure. The retry records
 * `administration.operator.email_rehome_retried` rather than a second
 * `…_started`: the account's state does not change on a retry, and the ledger
 * refuses a transition whose before and after are the same, correctly.
 */
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

  // Step 2. Outside the transaction because it is a network call that cannot be
  // rolled back; before the row moves so that a failure leaves the login and the
  // database agreeing with each other.
  await identity.changeLoginEmail(account.authUserId, email);

  let after: OperatorAccountRecord;
  try {
    after = await withTransaction(async (tx) => {
      // **Everything the first transaction decided is decided again here**, and
      // this is LAN132-B3. The first transaction committed and released its
      // `FOR UPDATE` lock before the Auth call above, which is an unbounded
      // network call; every fact it checked is therefore a snapshot from before
      // that window. A different administrator assigning the President seat
      // inside it would have made this a re-home of the President's login,
      // authorized against a target who was nobody in particular when the
      // question was asked.
      //
      // So the lock is retaken, the target's seats are re-read, and the guard,
      // the state rule and the address rule are all re-asserted against the row
      // as it is now — inside the transaction that writes, which is what this
      // module's rule 3 promises and what the first version of this function
      // was alone in not delivering.
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
    // The login was already moved, and the write that was supposed to record it
    // did not happen — because the re-assertion above refused, or because the
    // database did. Put the address back, so the login and the club's record of
    // it agree, and so the refusal is a refusal rather than a half-performed
    // recovery. Best effort: if the move back fails, the original refusal is
    // still what the administrator needs to see.
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

/**
 * Records that the holder proved they hold the replacement address.
 *
 * Called from `src/app/reset-password/actions.ts` with the `auth.users.id` of
 * the session that just set a password — never with an id a browser supplied.
 * Reaching that screen requires having followed a one-time link sent to the
 * replacement address, and while the account is pending that is the *only*
 * address it can have been sent to, because the login already moved. So setting
 * the password there is the verification.
 *
 * Returns `null` when there is no account or no re-home in flight, which is the
 * ordinary case for every other password reset in the club. It is idempotent for
 * the same reason `activateOperatorAccount` is: a second reset is not a second
 * verification.
 */
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

    // The account holder's own act, with no administrative capability behind
    // it — the one shape the vocabulary permits for that, and the same one
    // first-login activation uses.
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
