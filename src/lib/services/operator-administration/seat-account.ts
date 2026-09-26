import { randomUUID } from "node:crypto";

import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  type Tx,
  withTransaction,
} from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { AdministrationOperatingYear } from "../administration-events";
import { supabaseOperatorIdentity, type OperatorIdentityPort } from "../operator-identity";
import { deliverInvitation, markDeliveryFailed } from "../operator-invitations/delivery";
import {
  INVALID_EMAIL_MESSAGE,
  insertOperatorAccount,
  refuseTakenEmail,
} from "../operator-invitations/shared";
import { INVALID_EMAIL_RULE } from "../operator-invitations/refusals";
import { readAdministrationSubject, resolveActiveCommitteeYear } from "../operator-invitations";
import {
  CALLBACK_URL_MESSAGE,
  CALLBACK_URL_RULE,
  administrationAuthority,
  blankToNull,
  normaliseEmail,
  operatorAccountIdFor,
  requireAssignablePerson,
  requireOperator,
} from "./shared";

/**
 * A seat holder is always an operator — LAN-434, Brian's decision 2026-09-26.
 *
 * Assign role and Replace role, on a person with no operator account, open the
 * pending account and send the invitation as part of the same submit. The
 * pieces here are what `assign.ts`, `replace.ts` and {@link inviteSeatHolder}
 * share, and they follow Invite operator's own ordering
 * (`operator-invitations/invite.ts`), because the Auth user is created by
 * Supabase's authentication service and cannot join a Postgres transaction:
 *
 *   1. **Pre-flight transaction, reads only.** Every refusal the seat change
 *      can give, and {@link planSeatAccountIn}: does the person already have an
 *      account, and if not, which address the login uses. Nothing is written, so
 *      a refused submit leaves no Auth user behind.
 *   2. **`identity.createLogin(email)`.** The Auth user.
 *   3. **One write transaction.** Every refusal again, against the rows as they
 *      are now; then {@link openSeatAccountIn} (the `operator_accounts` row and
 *      its `administration.operator.invited` event), then the assignment(s) and
 *      their `administration.role.*` events, one `correlationId` across all of
 *      them. If this transaction fails the Auth user is deleted again, best
 *      effort, exactly as Invite operator does.
 *   4. **Send** ({@link sendSeatInvitation}). A failed send marks the account
 *      Delivery failed, as Invite operator does; the account and the seat stay,
 *      and Resend on the operator's record recovers it.
 *
 * A person who already has an account — active, pending or deactivated — is
 * seated exactly as before and the account is not touched: a deactivated
 * account stays deactivated.
 */

export const SEAT_LOGIN_EMAIL_FIELD = "Login email";
export const SEAT_LOGIN_EMAIL_REQUIRED_RULE = "administration_seat_login_email_required";
export const SEAT_LOGIN_EMAIL_REQUIRED_MESSAGE =
  `${SEAT_LOGIN_EMAIL_FIELD} is required. This person has no email address on record, and ` +
  "holding a role creates their operator account.";

/** Raced by another submit between the pre-flight and the write. Nothing is saved. */
export const ACCOUNT_CHANGED_RULE = "administration_seat_account_changed";
export const ACCOUNT_CHANGED_MESSAGE =
  "This person's operator account changed while the role was being saved. Nothing was " +
  "saved. Open the role again and repeat the change.";

/** Options a seat change carries only for the account it may open. */
export interface SeatAccountOptions {
  /** Used only when the person has no recorded email. Never invented. */
  readonly loginEmail?: string | null;
  readonly callbackUrl?: string | null;
  /** Swapped only by tests. Defaults to the real Supabase Auth port. */
  readonly identity?: OperatorIdentityPort;
}

/** What happened to the account a seat change opened; `null` when the person already had one. */
export interface SeatInvitationOutcome {
  readonly operatorAccountId: string;
  readonly loginEmail: string;
  readonly delivered: boolean;
  readonly deliveryFailureReason: string | null;
}

/** The address a new account would use, or `null` when the person already has an account. */
export interface SeatAccountPlan {
  readonly email: string;
  readonly callbackUrl: string;
}

/**
 * The person's recorded email: their preferred current email contact point,
 * derived exactly as the candidate search derives the email it shows beside
 * a name (`operator-invitations/candidates.ts`), so the address the panel
 * showed is the address the invitation goes to.
 */
export async function readRecordedEmailIn(tx: Tx, personId: string): Promise<string | null> {
  const result = await tx.query<{ raw_value: string }>(
    `select raw_value from public.contact_points
      where person_id = $1 and kind = 'email' and valid_until is null
      order by is_preferred desc, created_at desc
      limit 1`,
    [personId],
  );
  return blankToNull(result.rows[0]?.raw_value ?? null);
}

/**
 * Pre-flight and write both call this. `null` means the person already holds an
 * operator account and nothing about accounts happens. Otherwise the address:
 * the recorded email when there is a usable one, else the one the form
 * supplied, else a refusal naming the field.
 */
export async function planSeatAccountIn(
  tx: Tx,
  personId: string,
  options: SeatAccountOptions,
): Promise<SeatAccountPlan | null> {
  if ((await operatorAccountIdFor(tx, personId)) !== null) return null;

  const callbackUrl = (options.callbackUrl ?? "").trim();
  if (callbackUrl === "") {
    throw new ConstraintViolated(CALLBACK_URL_MESSAGE, { rule: CALLBACK_URL_RULE });
  }

  const recorded = await readRecordedEmailIn(tx, personId);
  const chosen =
    recorded !== null && looksLikeEmailAddress(normaliseEmail(recorded))
      ? recorded
      : blankToNull(options.loginEmail);
  if (chosen === null) {
    throw new ConstraintViolated(SEAT_LOGIN_EMAIL_REQUIRED_MESSAGE, {
      rule: SEAT_LOGIN_EMAIL_REQUIRED_RULE,
    });
  }

  const email = normaliseEmail(chosen);
  if (!looksLikeEmailAddress(email)) {
    throw new ConstraintViolated(INVALID_EMAIL_MESSAGE, { rule: INVALID_EMAIL_RULE });
  }
  await refuseTakenEmail(tx, email, null);

  return { email, callbackUrl };
}

/** Step 3's account half: the pending `operator_accounts` row and its audit event. */
export async function openSeatAccountIn(
  tx: Tx,
  input: {
    readonly operator: ResolvedOperator;
    readonly personId: string;
    readonly email: string;
    readonly authUserId: string;
    readonly operatingYear: AdministrationOperatingYear;
    readonly correlationId: string;
    readonly roleCodes: readonly string[];
    readonly trigger: "assign_role" | "replace_role_holder" | "send_invitation";
  },
): Promise<string> {
  const operatorAccountId = await insertOperatorAccount(tx, {
    authUserId: input.authUserId,
    personId: input.personId,
    email: input.email,
  });

  await recordAdministrationEvent(tx, {
    action: "administration.operator.invited",
    actorPersonId: input.operator.personId,
    authority: administrationAuthority(input.operator),
    target: { personId: input.personId, operatorAccountId },
    operatingYear: input.operatingYear,
    toState: "invitation_pending",
    correlationId: input.correlationId,
    detail: { personCreated: false, roleCodes: [...input.roleCodes], seatedBy: input.trigger },
  });

  return operatorAccountId;
}

/**
 * Steps 2 and 3 around a caller's write transaction: create the login, run the
 * write, and delete the login again if the write fails.
 */
export async function withSeatLogin<T>(
  identity: OperatorIdentityPort,
  email: string,
  write: (authUserId: string) => Promise<T>,
): Promise<T> {
  const { authUserId } = await identity.createLogin(email);
  try {
    return await write(authUserId);
  } catch (error) {
    // Best effort, as in `inviteOperator`: a retry must not meet "already has a login".
    await identity.deleteLogin(authUserId).catch(() => undefined);
    throw error;
  }
}

/** Step 4: send, and record a failed send exactly as Invite operator does. */
export async function sendSeatInvitation(
  identity: OperatorIdentityPort,
  input: {
    readonly operator: ResolvedOperator | null;
    readonly email: string;
    readonly callbackUrl: string;
    readonly operatorAccountId: string;
    readonly personId: string;
    readonly operatingYear: AdministrationOperatingYear;
  },
): Promise<SeatInvitationOutcome> {
  const delivery = await deliverInvitation(identity, input.email, input.callbackUrl);
  if (!delivery.ok) {
    await withTransaction((tx) =>
      markDeliveryFailed(tx, {
        operator: input.operator,
        operatorAccountId: input.operatorAccountId,
        personId: input.personId,
        operatingYear: input.operatingYear,
        reason: delivery.reason,
      }),
    );
  }
  return {
    operatorAccountId: input.operatorAccountId,
    loginEmail: input.email,
    delivered: delivery.ok,
    deliveryFailureReason: delivery.ok ? null : delivery.reason,
  };
}

export function seatIdentity(options: SeatAccountOptions): OperatorIdentityPort {
  return options.identity ?? supabaseOperatorIdentity();
}

export interface InviteSeatHolderParams extends SeatAccountOptions {
  readonly operator: ResolvedOperator | null;
  readonly personId: string;
}

export const NO_SEAT_HELD_RULE = "administration_seat_holder_holds_no_seat";
const NO_SEAT_HELD_MESSAGE =
  "This person holds no role, so there is no seat to invite them for. Assign a role instead.";

/**
 * Send invitation, from a seat's holder line — LAN-434. For people seated
 * before a seat always came with an account: opens the pending account and
 * sends the invitation, with the same four steps as Assign role and no seat
 * change. Guarded as `assign_role` for every seat the person holds or is due
 * to hold, because the account is what lets them act in those seats.
 */
export async function inviteSeatHolder(
  params: InviteSeatHolderParams,
): Promise<SeatInvitationOutcome> {
  const actor = requireOperator(params.operator);

  const check = async (tx: Tx) => {
    await requireAssignablePerson(tx, params.personId);
    const subject = await readAdministrationSubject(tx, params.personId, {
      includeScheduled: true,
    });
    if (subject.roleCodes.length === 0) {
      throw new InvalidTransition(NO_SEAT_HELD_MESSAGE, { rule: NO_SEAT_HELD_RULE });
    }
    for (const roleCode of subject.roleCodes) {
      assertAdministrationTarget(params.operator, {
        action: "assign_role",
        target: subject,
        roleCode,
      });
    }
    const plan = await planSeatAccountIn(tx, params.personId, params);
    if (plan === null) {
      throw new Conflict(ALREADY_HAS_ACCOUNT_MESSAGE, { rule: ALREADY_HAS_ACCOUNT_RULE });
    }
    return {
      plan,
      roleCodes: subject.roleCodes,
      operatingYear: await resolveActiveCommitteeYear(tx),
    };
  };

  const { plan } = await withTransaction(check);
  const identity = seatIdentity(params);
  const written = await withSeatLogin(identity, plan.email, (authUserId) =>
    withTransaction(async (tx) => {
      const again = await check(tx);
      if (again.plan.email !== plan.email) {
        throw new Conflict(ACCOUNT_CHANGED_MESSAGE, { rule: ACCOUNT_CHANGED_RULE });
      }
      const operatorAccountId = await openSeatAccountIn(tx, {
        operator: actor,
        personId: params.personId,
        email: plan.email,
        authUserId,
        operatingYear: again.operatingYear,
        correlationId: randomUUID(),
        roleCodes: again.roleCodes,
        trigger: "send_invitation",
      });
      return { operatorAccountId, operatingYear: again.operatingYear };
    }),
  );

  return sendSeatInvitation(identity, {
    operator: params.operator,
    email: plan.email,
    callbackUrl: plan.callbackUrl,
    operatorAccountId: written.operatorAccountId,
    personId: params.personId,
    operatingYear: written.operatingYear,
  });
}

export const ALREADY_HAS_ACCOUNT_RULE = "administration_seat_holder_has_account";
const ALREADY_HAS_ACCOUNT_MESSAGE =
  "This person already has an operator account. Open their operator record to resend the " +
  "invitation.";
