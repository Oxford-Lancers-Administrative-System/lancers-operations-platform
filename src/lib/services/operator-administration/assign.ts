import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import type { AdministrationOperatingYear } from "../administration-events";
import {
  insertRoleAssignmentIn,
  readAdministrationSubject,
  resolveActiveCommitteeYear,
  resolveCycleFor,
} from "../operator-invitations";
import {
  administrationAuthority,
  operatorAccountIdFor,
  requireAssignablePerson,
  requireOperator,
  requireRole,
  resolveDates,
  refuseOverlappingHolding,
} from "./shared";

/**
 * Assign a role — {@link assignRole} gives one Person one seat in the club's
 * active operating context. `REQ-effective-dated-role-history`; no
 * `effectiveTo` here — ending is `endRoleAssignment`. Every write in this
 * directory calls `assertAdministrationTarget` (never the bare capability)
 * with `roles.code` read fresh and `includeScheduled: true`, inside the
 * transaction that writes. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export interface AssignRoleParams {
  /** From `resolveOperatorAccess()`. `null` is refused, not defaulted. */
  readonly operator: ResolvedOperator | null;
  readonly personId: string;
  /** An exact `public.roles.code`. Resolved here; never passed to a guard raw. */
  readonly roleCode: string;
  /** Defaults to today. A future date is scheduled; a past date needs a reason. */
  readonly effectiveFrom?: string;
  /** Required only for backdating. */
  readonly reason?: string;
}

export interface RoleAssignmentResult {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly roleCode: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** True when the assignment has not begun yet. */
  readonly scheduled: boolean;
  readonly operatingYear: AdministrationOperatingYear;
}

/**
 * Gives one Person one seat, in the club's one active operating context.
 *
 * `REQ-effective-dated-role-history`: "Ordinary roles inherit the active
 * operating year and an effective-from date defaulting to today; future dates
 * and audited backdating are permitted. No routine end date is requested."
 * There is deliberately no `effectiveTo` parameter — ending is
 * {@link endRoleAssignment}, and an assignment created already ended is not a
 * thing the club ever means.
 *
 * The Person need not have an operator login. Assigning a seat to somebody who
 * has never signed in is ordinary — the club's committee is a fact about the
 * club, not about this application — and the leadership rules protect the
 * *seat* rather than the account.
 */
export async function assignRole(params: AssignRoleParams): Promise<RoleAssignmentResult> {
  const actor = requireOperator(params.operator);

  return withTransaction(async (tx) => {
    const operatingYear = await resolveActiveCommitteeYear(tx);
    const role = await requireRole(tx, params.roleCode);
    await requireAssignablePerson(tx, params.personId);

    // The guard runs before the dates and the duplicate check, deliberately.
    // An operator who may not act on this target should be told that and not
    // which of their other fields was also wrong — and a refusal that depends
    // on the shape of the request is a refusal that answers questions about
    // the target for somebody who was never allowed to ask.
    //
    // Rule 3 and rule 4: the target's seats, read here, inside the transaction
    // that is about to write, and widened to seats that have not started.
    const subject = await readAdministrationSubject(tx, params.personId, {
      includeScheduled: true,
    });
    // Rule 2: `role.code` is the catalogue's own spelling, from the row above.
    assertAdministrationTarget(params.operator, {
      action: "assign_role",
      target: subject,
      roleCode: role.code,
    });

    const entry = await resolveDates(tx, role, {
      effectiveFrom: params.effectiveFrom,
      reason: params.reason,
    });

    await refuseOverlappingHolding(tx, params.personId, role, entry.effectiveFrom);

    const cycle = await resolveCycleFor(tx, role.scope, operatingYear);
    const roleAssignmentId = await insertRoleAssignmentIn(tx, {
      personId: params.personId,
      entry,
      cycle,
      appointedByPersonId: actor.personId,
    });

    await recordAdministrationEvent(tx, {
      action: "administration.role.assigned",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: {
        personId: params.personId,
        operatorAccountId: await operatorAccountIdFor(tx, params.personId),
      },
      role: { id: role.id, code: role.code, assignmentId: roleAssignmentId },
      operatingYear: cycle.operatingYear,
      toState: entry.scheduled ? "scheduled" : "effective",
      reason: entry.reason,
      backdated: entry.backdated,
    });

    return {
      roleAssignmentId,
      personId: params.personId,
      roleCode: role.code,
      effectiveFrom: entry.effectiveFrom,
      effectiveTo: null,
      scheduled: entry.scheduled,
      operatingYear: cycle.operatingYear,
    };
  });
}
