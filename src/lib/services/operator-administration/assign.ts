import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import { recordAdministrationEvent } from "../administration-audit";
import { applyAudienceGroupRuleIn } from "../event-audience-rule";
import { findCurrentSeasonIn } from "../seasons";
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
 * transaction that writes.
 */

export interface AssignRoleParams {
  readonly operator: ResolvedOperator | null;
  readonly personId: string;
  readonly roleCode: string;
  readonly effectiveFrom?: string;
  readonly reason?: string;
}

export interface RoleAssignmentResult {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly roleCode: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean;
  readonly operatingYear: AdministrationOperatingYear;
}

export async function assignRole(params: AssignRoleParams): Promise<RoleAssignmentResult> {
  const actor = requireOperator(params.operator);

  return withTransaction(async (tx) => {
    const operatingYear = await resolveActiveCommitteeYear(tx);
    const role = await requireRole(tx, params.roleCode);
    await requireAssignablePerson(tx, params.personId);

    const subject = await readAdministrationSubject(tx, params.personId, {
      includeScheduled: true,
    });
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

    // LAN-392, Brian's decision 9: a coaching or committee seat is a derived
    // audience group, so seating somebody adds them to every approved future
    // event that chose that group, and a seat that ends takes back an unsent
    // rule-add. The season is the club's current one: a club-scoped committee
    // seat has no season of its own, and the rule only ever acts on events in
    // the season the club is operating.
    // The season is read defensively and the rule skipped where the club has
    // none in an operating status. `readCurrentSeasonIn` refuses with "no
    // current season", and a committee seat is a club-scoped year rather than a
    // season's — so seating an officer during a gap between seasons must not
    // fail because of a rule about event audiences. The rule's own invariant is
    // that it never aborts the write that triggered it; that holds for the
    // season lookup too.
    const currentSeason = await findCurrentSeasonIn(tx);
    if (currentSeason !== null) {
      await applyAudienceGroupRuleIn(tx, {
        personId: params.personId,
        seasonId: currentSeason.id,
        trigger: "seat_assigned",
        actorPersonId: actor.personId,
      });
    }

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
