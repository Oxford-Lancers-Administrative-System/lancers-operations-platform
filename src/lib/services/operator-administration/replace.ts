import { randomUUID } from "node:crypto";

import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  type Tx,
  withTransaction,
} from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import { applyAudienceGroupRuleIn } from "../event-audience-rule";
import { findCurrentSeasonIn } from "../seasons";
import {
  currentDateIn,
  insertRoleAssignmentIn,
  readAdministrationSubject,
  resolveActiveCommitteeYear,
  resolveCycleFor,
} from "../operator-invitations";
import {
  ALREADY_HOLDS_ROLE_RULE,
  END_REASON_MESSAGE,
  END_REASON_RULE,
  administrationAuthority,
  administrationPathFor,
  assertClubKeepsAnAdministrator,
  assertIsoDate,
  blankToNull,
  lockAssignment,
  operatingYearForAssignment,
  operatorAccountIdFor,
  refuseAlreadyEnded,
  refuseEndBeforeStart,
  requireAssignablePerson,
  requireOperator,
  requireRoleById,
} from "./shared";
import {
  ACCOUNT_CHANGED_MESSAGE,
  ACCOUNT_CHANGED_RULE,
  openSeatAccountIn,
  planSeatAccountIn,
  seatIdentity,
  sendSeatInvitation,
  withSeatLogin,
  type SeatAccountOptions,
  type SeatInvitationOutcome,
} from "./seat-account";

/**
 * Replace a role holder — {@link replaceRoleHolder} ends the outgoing
 * assignment and creates the successor's in one transaction
 * (`REQ-effective-dated-role-history`). Two guards: the outgoing holder
 * (ending removes authority) and the successor (`assign_role`), both before
 * anything is written.
 *
 * LAN-434: a successor with no operator account gets one in the same submit —
 * see `./seat-account.ts` for the ordering.
 */

export interface ReplaceRoleHolderParams extends SeatAccountOptions {
  readonly operator: ResolvedOperator | null;
  readonly roleAssignmentId: string;
  readonly successorPersonId: string;
  readonly effectiveFrom?: string;
  readonly reason: string;
}

export interface ReplaceRoleHolderResult {
  readonly roleCode: string;
  readonly endedAssignmentId: string;
  readonly createdAssignmentId: string;
  readonly outgoingPersonId: string;
  readonly successorPersonId: string;
  readonly effectiveFrom: string;
  readonly scheduled: boolean;
  readonly correlationId: string;
  /** LAN-434: the account this handover opened for the successor, or `null`. */
  readonly invitation: SeatInvitationOutcome | null;
}

/**
 * Hands one seat from its current holder to a successor, in one transaction.
 * Both rows exist afterwards, meeting on the handover date (no overlap, no
 * vacancy). Two events (`role.ended`, `role.assigned`) share a `correlationId`
 * rather than one `role.replaced` — see decision history. Two guards, both
 * before any write: the outgoing holder (`replace_role_holder`) and the
 * successor (`assign_role`).
 */
export async function replaceRoleHolder(
  params: ReplaceRoleHolderParams,
): Promise<ReplaceRoleHolderResult> {
  const actor = requireOperator(params.operator);
  const reason = blankToNull(params.reason);
  if (reason === null) {
    throw new ConstraintViolated(END_REASON_MESSAGE, { rule: END_REASON_RULE });
  }

  // Step 1: every refusal, and whether the successor needs an account. When
  // they already have one, this is the whole of the change, as it always was.
  const first = await withTransaction(async (tx) => {
    const checked = await checkReplacementIn(tx, params, reason);
    const plan = await planSeatAccountIn(tx, params.successorPersonId, params);
    if (plan !== null) return { plan, result: null };
    return {
      plan: null,
      result: await writeReplacementIn(tx, actor, params, checked, randomUUID()),
    };
  });
  if (first.plan === null) return first.result;

  const { plan } = first;
  const identity = seatIdentity(params);
  const written = await withSeatLogin(identity, plan.email, (authUserId) =>
    withTransaction(async (tx) => {
      const checked = await checkReplacementIn(tx, params, reason);
      const again = await planSeatAccountIn(tx, params.successorPersonId, params);
      if (again === null || again.email !== plan.email) {
        throw new Conflict(ACCOUNT_CHANGED_MESSAGE, { rule: ACCOUNT_CHANGED_RULE });
      }
      const correlationId = randomUUID();
      const operatingYear = (
        await resolveCycleFor(tx, checked.role.scope, await resolveActiveCommitteeYear(tx))
      ).operatingYear;
      const operatorAccountId = await openSeatAccountIn(tx, {
        operator: actor,
        personId: params.successorPersonId,
        email: plan.email,
        authUserId,
        operatingYear,
        correlationId,
        roleCodes: [checked.role.code],
        trigger: "replace_role_holder",
      });
      const result = await writeReplacementIn(tx, actor, params, checked, correlationId);
      return { result, operatorAccountId, operatingYear };
    }),
  );

  const invitation = await sendSeatInvitation(identity, {
    operator: params.operator,
    email: plan.email,
    callbackUrl: plan.callbackUrl,
    operatorAccountId: written.operatorAccountId,
    personId: params.successorPersonId,
    operatingYear: written.operatingYear,
  });
  return { ...written.result, invitation };
}

interface CheckedReplacement {
  readonly outgoing: Awaited<ReturnType<typeof lockAssignment>>;
  readonly role: Awaited<ReturnType<typeof requireRoleById>>;
  readonly reason: string;
  readonly today: string;
  readonly effectiveFrom: string;
  readonly backdated: boolean;
}

/** Every refusal a handover can give. Locks the outgoing row; writes nothing. */
async function checkReplacementIn(
  tx: Tx,
  params: ReplaceRoleHolderParams,
  reason: string,
): Promise<CheckedReplacement> {
  const outgoing = await lockAssignment(tx, params.roleAssignmentId);
  const role = await requireRoleById(tx, outgoing.roleId);

  const outgoingSubject = await readAdministrationSubject(tx, outgoing.personId, {
    includeScheduled: true,
  });
  assertAdministrationTarget(params.operator, {
    action: "replace_role_holder",
    target: outgoingSubject,
    roleCode: role.code,
  });

  await requireAssignablePerson(tx, params.successorPersonId);

  const successorSubject = await readAdministrationSubject(tx, params.successorPersonId, {
    includeScheduled: true,
  });
  assertAdministrationTarget(params.operator, {
    action: "assign_role",
    target: successorSubject,
    roleCode: role.code,
  });

  if (params.successorPersonId === outgoing.personId) {
    throw new InvalidTransition(
      "That person already holds this role, so there is nothing to hand over. To change " +
        "the dates of their assignment, end it and assign it again.",
      { rule: ALREADY_HOLDS_ROLE_RULE },
    );
  }

  const today = await currentDateIn(tx);
  const effectiveFrom = blankToNull(params.effectiveFrom) ?? today;
  assertIsoDate(effectiveFrom);
  refuseAlreadyEnded(outgoing);
  refuseEndBeforeStart(outgoing, effectiveFrom);

  await assertClubKeepsAnAdministrator(
    tx,
    {
      kind: "replace_role_holder",
      personId: outgoing.personId,
      roleCode: role.code,
      successor: await administrationPathFor(tx, params.successorPersonId, role.code),
    },
    effectiveFrom,
  );

  const backdated = effectiveFrom < today;
  return { outgoing, role, reason, today, effectiveFrom, backdated };
}

/** Both assignment writes, their audit events and the audience rule. */
async function writeReplacementIn(
  tx: Tx,
  actor: ReturnType<typeof requireOperator>,
  params: ReplaceRoleHolderParams,
  { outgoing, role, reason, today, effectiveFrom, backdated }: CheckedReplacement,
  correlationId: string,
): Promise<ReplaceRoleHolderResult> {
  const operatingYear = await operatingYearForAssignment(tx, outgoing);

  await tx.query("update public.role_assignments set effective_to = $2::date where id = $1", [
    outgoing.id,
    effectiveFrom,
  ]);

  await recordAdministrationEvent(tx, {
    action: "administration.role.ended",
    actorPersonId: actor.personId,
    authority: administrationAuthority(actor),
    target: {
      personId: outgoing.personId,
      operatorAccountId: await operatorAccountIdFor(tx, outgoing.personId),
    },
    role: { id: role.id, code: role.code, assignmentId: outgoing.id },
    operatingYear,
    fromState: "effective",
    toState: effectiveFrom > today ? "ending" : "ended",
    reason,
    correlationId,
    detail: { replacedByPersonId: params.successorPersonId },
  });

  const cycle = await resolveCycleFor(tx, role.scope, await resolveActiveCommitteeYear(tx));
  const createdAssignmentId = await insertRoleAssignmentIn(tx, {
    personId: params.successorPersonId,
    entry: {
      role,
      effectiveFrom,
      backdated,
      scheduled: effectiveFrom > today,
      reason,
    },
    cycle,
    appointedByPersonId: actor.personId,
  });

  await recordAdministrationEvent(tx, {
    action: "administration.role.assigned",
    actorPersonId: actor.personId,
    authority: administrationAuthority(actor),
    target: {
      personId: params.successorPersonId,
      operatorAccountId: await operatorAccountIdFor(tx, params.successorPersonId),
    },
    role: { id: role.id, code: role.code, assignmentId: createdAssignmentId },
    operatingYear: cycle.operatingYear,
    toState: effectiveFrom > today ? "scheduled" : "effective",
    reason,
    backdated,
    correlationId,
    detail: { replacesPersonId: outgoing.personId },
  });

  // LAN-392, Brian's decision 9: a coaching or committee seat is a derived
  // audience group, so seating somebody adds them to every approved future
  // event that chose that group, and a seat that ends takes back an unsent
  // rule-add. The season is the club's current one: a club-scoped committee
  // seat has no season of its own, and the rule only ever acts on events in
  // the season the club is operating.
  //
  // Run last, after both writes, because a handover is both directions at
  // once and each half has to be on the record before the rule reads it: the
  // outgoing holder's seat now ends on the handover date, so their unsent
  // rule-adds to events after it come back off, and the successor's seat now
  // exists, so events after it add them.
  // The season is read defensively and the rule skipped where the club has
  // none in an operating status. `readCurrentSeasonIn` refuses with "no
  // current season", and a committee seat is a club-scoped year rather than a
  // season's — so seating an officer during a gap between seasons must not
  // fail because of a rule about event audiences. The rule's own invariant is
  // that it never aborts the write that triggered it; that holds for the
  // season lookup too.
  const handoverSeason = await findCurrentSeasonIn(tx);
  if (handoverSeason !== null) {
    for (const personId of [outgoing.personId, params.successorPersonId]) {
      await applyAudienceGroupRuleIn(tx, {
        personId,
        seasonId: handoverSeason.id,
        trigger: "seat_replaced",
        actorPersonId: actor.personId,
      });
    }
  }

  return {
    roleCode: role.code,
    endedAssignmentId: outgoing.id,
    createdAssignmentId,
    outgoingPersonId: outgoing.personId,
    successorPersonId: params.successorPersonId,
    effectiveFrom,
    scheduled: effectiveFrom > today,
    correlationId,
    invitation: null,
  };
}
