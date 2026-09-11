import { randomUUID } from "node:crypto";

import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
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

/**
 * Replace a role holder — {@link replaceRoleHolder} ends the outgoing
 * assignment and creates the successor's in one transaction
 * (`REQ-effective-dated-role-history`). Two guards: the outgoing holder
 * (ending removes authority) and the successor (`assign_role`), both before
 * anything is written. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export interface ReplaceRoleHolderParams {
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

  return withTransaction(async (tx) => {
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

    const correlationId = randomUUID();
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

    return {
      roleCode: role.code,
      endedAssignmentId: outgoing.id,
      createdAssignmentId,
      outgoingPersonId: outgoing.personId,
      successorPersonId: params.successorPersonId,
      effectiveFrom,
      scheduled: effectiveFrom > today,
      correlationId,
    };
  });
}
