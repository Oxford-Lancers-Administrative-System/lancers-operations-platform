import { randomUUID } from "node:crypto";

import { assertAdministrationTarget } from "@/lib/auth/administration-authority";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { Conflict, type Tx, withTransaction } from "@/lib/db";
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
 * Assign a role — {@link assignRole} gives one Person one seat in the club's
 * active operating context. `REQ-effective-dated-role-history`; no
 * `effectiveTo` here — ending is `endRoleAssignment`. Every write in this
 * directory calls `assertAdministrationTarget` (never the bare capability)
 * with `roles.code` read fresh and `includeScheduled: true`, inside the
 * transaction that writes.
 *
 * LAN-434: a person with no operator account gets one in the same submit —
 * see `./seat-account.ts` for the ordering.
 */

export interface AssignRoleParams extends SeatAccountOptions {
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
  /** LAN-434: the account this assignment opened, or `null` when the person already had one. */
  readonly invitation: SeatInvitationOutcome | null;
}

export async function assignRole(params: AssignRoleParams): Promise<RoleAssignmentResult> {
  const actor = requireOperator(params.operator);

  // Step 1: every refusal, and whether an account is needed. When the person
  // already has one, this is the whole of the change, as it always was.
  const first = await withTransaction(async (tx) => {
    const checked = await checkAssignmentIn(tx, params);
    const plan = await planSeatAccountIn(tx, params.personId, params);
    if (plan !== null) return { plan, result: null };
    return { plan: null, result: await writeAssignmentIn(tx, actor, params, checked, null) };
  });
  if (first.plan === null) return first.result;

  const { plan } = first;
  const identity = seatIdentity(params);
  const written = await withSeatLogin(identity, plan.email, (authUserId) =>
    withTransaction(async (tx) => {
      const checked = await checkAssignmentIn(tx, params);
      // Re-planned against the rows as they are now; an account that appeared
      // since step 1 is a conflict, not something to seat around.
      const again = await planSeatAccountIn(tx, params.personId, params);
      if (again === null || again.email !== plan.email) {
        throw new Conflict(ACCOUNT_CHANGED_MESSAGE, { rule: ACCOUNT_CHANGED_RULE });
      }
      const correlationId = randomUUID();
      const operatorAccountId = await openSeatAccountIn(tx, {
        operator: actor,
        personId: params.personId,
        email: plan.email,
        authUserId,
        operatingYear: checked.operatingYear,
        correlationId,
        roleCodes: [checked.role.code],
        trigger: "assign_role",
      });
      const result = await writeAssignmentIn(tx, actor, params, checked, correlationId);
      return { result, operatorAccountId };
    }),
  );

  const invitation = await sendSeatInvitation(identity, {
    operator: params.operator,
    email: plan.email,
    callbackUrl: plan.callbackUrl,
    operatorAccountId: written.operatorAccountId,
    personId: params.personId,
    operatingYear: written.result.operatingYear,
  });
  return { ...written.result, invitation };
}

interface CheckedAssignment {
  readonly operatingYear: AdministrationOperatingYear;
  readonly role: Awaited<ReturnType<typeof requireRole>>;
  readonly entry: Awaited<ReturnType<typeof resolveDates>>;
  readonly cycle: Awaited<ReturnType<typeof resolveCycleFor>>;
}

/** Every refusal an assignment can give. Reads only. */
async function checkAssignmentIn(tx: Tx, params: AssignRoleParams): Promise<CheckedAssignment> {
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
  return { operatingYear, role, entry, cycle };
}

/** The assignment row, the audience rule and the audit event. */
async function writeAssignmentIn(
  tx: Tx,
  actor: ResolvedOperator,
  params: AssignRoleParams,
  { role, entry, cycle }: CheckedAssignment,
  correlationId: string | null,
): Promise<RoleAssignmentResult> {
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
    ...(correlationId === null ? {} : { correlationId }),
  });

  return {
    roleAssignmentId,
    personId: params.personId,
    roleCode: role.code,
    effectiveFrom: entry.effectiveFrom,
    effectiveTo: null,
    scheduled: entry.scheduled,
    operatingYear: cycle.operatingYear,
    invitation: null,
  };
}
