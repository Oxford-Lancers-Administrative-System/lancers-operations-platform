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
  /** The outgoing holder's assignment. */
  readonly roleAssignmentId: string;
  readonly successorPersonId: string;
  /** The handover date. Defaults to today; the two assignments meet on it. */
  readonly effectiveFrom?: string;
  /** Required — the outgoing assignment is ended, and ending requires a reason. */
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
  /** The two events share it. `REQ-effective-dated-role-history`. */
  readonly correlationId: string;
}

/**
 * Hands one seat from its current holder to a successor, in one transaction.
 *
 * `REQ-effective-dated-role-history`: "replacement ends the outgoing assignment
 * and creates the successor without rewriting history." Both rows exist
 * afterwards, and the outgoing one keeps its own start date.
 *
 * ## Why the two dates meet rather than overlap
 *
 * `role_assignments_one_holder_per_office` and
 * `role_assignments_one_holder_per_single_holder_seat` are GiST exclusions over
 * `daterange(effective_from, effective_to, '[)')` — a half-open range. So
 * `effective_to = D` on the outgoing assignment and `effective_from = D` on the
 * successor's are disjoint and legal, and a single day of overlap is not. The
 * seat is never held by two people and never vacant for a day.
 *
 * ## Two events, and deliberately not three
 *
 * One `administration.role.ended` and one `administration.role.assigned`,
 * sharing a `correlationId`. There is no `role.replaced` action and there will
 * not be one: two assignment rows change, and a single event would have to name
 * two target Persons, which the Operator-audit-history projection keys on and
 * cannot represent. `instantOrder` already puts an assignment beginning after an
 * assignment ending, so the pair renders in causal order despite sharing a
 * transaction timestamp.
 *
 * ## Two guards, not one
 *
 * `replace_role_holder` is asked against the **outgoing** holder, because ending
 * their assignment is the half that removes authority — that is what
 * `WP-authorization` records, and it carries `end_role`'s self rule. But the
 * successor is also being given a seat, and a successor who is themselves
 * protected must be as hard to install as they are to administer, so
 * `assign_role` is asked against them too. Two questions, both answered before
 * anything is written.
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

    // Both guards first. See the note in `assignRole`.
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

    // A replacement always carries a reason — it ends an assignment — so a
    // backdated handover is audited by construction and needs no second check.
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
