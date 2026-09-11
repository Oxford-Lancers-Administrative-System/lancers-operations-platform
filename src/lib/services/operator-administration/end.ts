import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import { currentDateIn, readAdministrationSubject } from "../operator-invitations";
import {
  administrationAuthority,
  assertClubKeepsAnAdministrator,
  assertIsoDate,
  blankToNull,
  END_REASON_MESSAGE,
  END_REASON_RULE,
  lockAssignment,
  operatingYearForAssignment,
  operatorAccountIdFor,
  refuseAlreadyEnded,
  refuseEndBeforeStart,
  requireOperator,
} from "./shared";

/**
 * End a role assignment — {@link endRoleAssignment} is the one action that
 * creates a vacancy (`REQ-deactivate-and-reinstate`). The row is updated,
 * never removed; an assignment already ended is refused, not re-ended.
 * Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export interface EndRoleAssignmentParams {
  readonly operator: ResolvedOperator | null;
  readonly roleAssignmentId: string;
  readonly effectiveTo?: string;
  readonly reason: string;
}

export interface EndRoleAssignmentResult {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly roleCode: string;
  readonly effectiveTo: string;
  /** True when the ending has not taken effect yet — the holder still holds it. */
  readonly scheduled: boolean;
}

/** Ends one assignment, today or on a future date. The row is updated, never removed; an already-ended assignment is refused, not re-ended. */
export async function endRoleAssignment(
  params: EndRoleAssignmentParams,
): Promise<EndRoleAssignmentResult> {
  const actor = requireOperator(params.operator);
  const reason = blankToNull(params.reason);
  if (reason === null) {
    throw new ConstraintViolated(END_REASON_MESSAGE, { rule: END_REASON_RULE });
  }

  return withTransaction(async (tx) => {
    const assignment = await lockAssignment(tx, params.roleAssignmentId);

    const subject = await readAdministrationSubject(tx, assignment.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, {
      action: "end_role",
      target: subject,
      roleCode: assignment.roleCode,
    });

    const today = await currentDateIn(tx);
    const effectiveTo = blankToNull(params.effectiveTo) ?? today;
    assertIsoDate(effectiveTo);
    refuseAlreadyEnded(assignment);
    refuseEndBeforeStart(assignment, effectiveTo);

    await assertClubKeepsAnAdministrator(
      tx,
      { kind: "end_role", personId: assignment.personId, roleCode: assignment.roleCode },
      effectiveTo,
    );

    await tx.query("update public.role_assignments set effective_to = $2::date where id = $1", [
      assignment.id,
      effectiveTo,
    ]);

    const operatingYear = await operatingYearForAssignment(tx, assignment);
    await recordAdministrationEvent(tx, {
      action: "administration.role.ended",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: {
        personId: assignment.personId,
        operatorAccountId: await operatorAccountIdFor(tx, assignment.personId),
      },
      role: { id: assignment.roleId, code: assignment.roleCode, assignmentId: assignment.id },
      operatingYear,
      fromState: "effective",
      toState: effectiveTo > today ? "ending" : "ended",
      reason,
    });

    return {
      roleAssignmentId: assignment.id,
      personId: assignment.personId,
      roleCode: assignment.roleCode,
      effectiveTo,
      scheduled: effectiveTo > today,
    };
  });
}
