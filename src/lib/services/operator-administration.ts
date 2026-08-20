import "server-only";

import { randomUUID } from "node:crypto";

import {
  assertAdministrationPathSurvives,
  assertAdministrationTarget,
  remainingAdministrationPaths,
  usableAdministrationPaths,
  type AdministrationPath,
  type AdministrationPathEffect,
  type AdministrationSubject,
} from "@/lib/auth/administration-authority";
import { capabilityRoleCodes, roleLabel } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { looksLikeEmailAddress } from "@/lib/auth/recovery";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  NotPermitted,
  UnexpectedDatabaseError,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { createStatelessClient } from "@/lib/supabase/stateless";
import { recordAdministrationEvent } from "./administration-audit";
import type { AdministrationOperatingYear } from "./administration-events";
import {
  deriveOperatorAccountState,
  operatorAccountState,
  type OperatorAccountState,
} from "./operator-account-state";
import { supabaseOperatorIdentity } from "./operator-identity";
import {
  currentDateIn,
  insertRoleAssignmentIn,
  readAdministrationSubject,
  readOperatorAccountIn,
  resolveActiveCommitteeYear,
  resolveCommitteeYearForActivation,
  resolveCycleFor,
  type OperatorAccountRecord,
  type ResolvedRole,
} from "./operator-invitations";
import { personDisplayNameSql } from "./sql-text";

/**
 * Administration of roles and of operator access — LAN-132, mission
 * M-OPERATOR-ADMIN-WITHOUT-SQL, work package `WP-assignment`.
 *
 * Five administrator actions, one read for role detail, and one hook the
 * password screen calls:
 *
 *   * {@link assignRole} — give somebody an ordinary seat
 *     (`REQ-effective-dated-role-history`);
 *   * {@link endRoleAssignment} — end one, with a reason, today or on a date
 *     still to come;
 *   * {@link replaceRoleHolder} — end the outgoing holder's assignment and
 *     create the successor's, in one transaction and without rewriting either;
 *   * {@link deactivateOperatorAccess} / {@link restoreOperatorAccess} —
 *     `REQ-deactivate-and-reinstate`;
 *   * {@link startOperatorEmailRehome} and {@link verifyOperatorEmailRehome} —
 *     `REQ-rehome-email`;
 *   * {@link readRoleHolders} — who holds a seat in one operating year, and in
 *     what state their access is.
 *
 * ## The four rules every write here obeys
 *
 * These are not stylistic. Each has already been a finding on an earlier
 * package in this mission, and each is checked by a test that fails if the line
 * enforcing it is deleted.
 *
 *   1. **Every write asks the target-aware question.**
 *      `assertAdministrationTarget` and never `assertCapability("role_management")`
 *      alone — the capability floor admits the President, and the President may
 *      not act on the General Manager. The floor is used for exactly one thing
 *      here, {@link readRoleHolders}, and the note there says why.
 *
 *   2. **The role code handed to the guard is the catalogue's own.**
 *      `WP-authorization` refuses an unrecognised code outright and normalises
 *      nothing — `" general_manager "` is refused rather than trimmed — which is
 *      only safe if the caller resolves the code against `public.roles` first.
 *      Every guard call below is given `roles.code` read from the row the write
 *      will name, never a string a form supplied and never a string this module
 *      tidied up.
 *
 *   3. **The target's seats are read inside the transaction that writes.** A
 *      snapshot taken before the transaction is stale by construction, and a
 *      stale snapshot is the one way to disarm the leadership rules.
 *
 *      {@link startOperatorEmailRehome} is the one write that cannot be a
 *      single transaction — it has to move the address on the Auth server
 *      between deciding and writing, and holding a database transaction open
 *      across an unbounded network call is the thing this repository's
 *      transaction helper exists to prevent. It therefore asserts **twice**:
 *      once to refuse before anything is touched, and again inside the
 *      transaction that writes, against a freshly locked row. The second
 *      assertion is the one that is load-bearing; the first only saves a
 *      pointless Auth call.
 *
 *   4. **A scheduled seat reaches the guard.** `readAdministrationSubject` is
 *      always called with `includeScheduled: true`, so a seat dated to begin at
 *      a handover protects its holder *now* rather than from the handover date.
 *      It can only ever make the guard stricter, and the last blocking finding
 *      of the previous package was exactly this option being absent.
 *
 * ## Two questions about scheduled seats, answered differently
 *
 * Both reads see seats that have not started yet, and they do different things
 * with them, because they are asked different questions:
 *
 *   * the guard asks "does this target need protecting?" — a President-elect
 *     whose seat begins at the handover needs protecting **now**, so the seat
 *     counts from the moment it is recorded;
 *   * the path check asks "can somebody still administer the club?" — which has
 *     no answer without a date, so it is asked on every date the answer can
 *     change. A seat beginning next month is not a path today and is one then,
 *     and a seat *ending* next month is a path today and is not one then. The
 *     second half is LAN132-B2: reading only today let two scheduled endings
 *     each pass while the other holder was still effective, and empty the club
 *     on the day they both lapsed.
 *
 * ## Nothing here deletes anything
 *
 * `REQ-deactivate-and-reinstate` is unambiguous: "No action deletes Person,
 * membership, binding, attribution or history." Ending a role sets
 * `effective_to`; deactivating sets `is_active = false`; re-homing an address
 * moves it and records what it was. `service_role` holds no `delete` on
 * `operator_accounts` at all, and this module issues no `delete` against any
 * table — `operator-administration.test.ts` reads the module's own source and
 * fails if one ever appears.
 *
 * ## What this module does not do
 *
 * It renders nothing. `WP-surfaces` owns the Administration screens and the
 * server actions behind them; every function here takes a `ResolvedOperator`
 * and returns data or throws a `ServiceError`, exactly as
 * `./operator-invitations.ts` does.
 *
 * It also creates and closes no operating year. `REQ-explicit-cycle-assignment`
 * puts that outside this mission, and the consequence is worth stating rather
 * than discovering: **no write here takes a cycle**. Assignments inherit the one
 * active context, which is what "forms do not ask for or repeat the year" means
 * and what makes a past year read-only — there is no code path by which an
 * assignment can be created in one. {@link readRoleHolders} accepts a cycle so
 * that a past year can be *looked at*, and reports `readOnly` for anything that
 * is not the active one.
 */

// ---------------------------------------------------------------------------
// Rules and messages
// ---------------------------------------------------------------------------

/** The capability floor. Every action here also asks the target-aware question. */
const ADMINISTRATION_CAPABILITY = "role_management" as const;

export const UNKNOWN_ROLE_RULE = "administration_role_unknown";
export const UNKNOWN_ROLE_MESSAGE =
  "That role is not one of the club's roles. The list of roles is fixed and is not editable " +
  "in the application; choose one from it.";

export const PERSON_NOT_FOUND_RULE = "administration_person_not_found";
export const PERSON_NOT_FOUND_MESSAGE =
  "That person is not in the club's records any more. Search again and choose from the list.";

export const MERGED_PERSON_RULE = "administration_person_merged";
export const MERGED_PERSON_MESSAGE =
  "That person's record has been merged into another one. Open the record it was merged into " +
  "and make the change there.";

export const ASSIGNMENT_NOT_FOUND_RULE = "administration_role_assignment_not_found";
export const ASSIGNMENT_NOT_FOUND_MESSAGE =
  "That role assignment no longer exists. Reload the role and try again.";

export const ALREADY_HOLDS_ROLE_RULE = "administration_already_holds_role";
export const ALREADY_HOLDS_ROLE_MESSAGE =
  "That person already holds this role over the same period. End the assignment they have " +
  "before giving them another one.";

export const INVALID_DATE_RULE = "administration_date_invalid";
export const INVALID_DATE_MESSAGE = "Enter the date as a calendar date, for example 2026-09-01.";

export const BACKDATING_REASON_RULE = "administration_backdating_reason_required";
export const BACKDATING_REASON_MESSAGE =
  "A start date in the past has to say why. Record the reason for backdating this assignment.";

export const END_REASON_RULE = "administration_end_reason_required";
export const END_REASON_MESSAGE =
  "Ending a role assignment has to say why. Record the reason, so the club's history explains " +
  "itself later.";

export const ALREADY_ENDED_RULE = "administration_role_assignment_already_ended";

export const END_BEFORE_START_RULE = "administration_end_before_start";

export const DEACTIVATION_REASON_RULE = "administration_deactivation_reason_required";
export const DEACTIVATION_REASON_MESSAGE =
  "Deactivating somebody's access has to say why. Record the reason.";

export const NO_OPERATOR_ACCOUNT_RULE = "administration_no_operator_account";
export const NO_OPERATOR_ACCOUNT_MESSAGE =
  "That person has no operator login, so there is no access to change. Invite them first.";

export const REHOME_REASON_RULE = "administration_rehome_reason_required";
export const REHOME_REASON_MESSAGE =
  "Moving somebody's sign-in to a different email address has to say why. Record the reason.";

export const REHOME_SAME_ADDRESS_RULE = "administration_rehome_same_address";
export const REHOME_SAME_ADDRESS_MESSAGE =
  "That is the address this login already uses. Enter the replacement address instead.";

export const REHOME_EMAIL_TAKEN_RULE = "administration_rehome_email_taken";
export const REHOME_EMAIL_TAKEN_MESSAGE =
  "That email address already has an operator login, so it cannot be used as a replacement. " +
  "Use an address nobody else signs in with.";

export const REHOME_NOT_AVAILABLE_RULE = "administration_rehome_not_available";

export const INVALID_EMAIL_RULE = "administration_email_invalid";
export const INVALID_EMAIL_MESSAGE = "Enter an email address, for example name@example.com.";

export const CALLBACK_URL_RULE = "administration_callback_url_required";
export const CALLBACK_URL_MESSAGE =
  "The verification link has nowhere to point. This is a configuration problem rather than " +
  "something you did — tell whoever runs the deployment.";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// End
// ---------------------------------------------------------------------------

export interface EndRoleAssignmentParams {
  readonly operator: ResolvedOperator | null;
  readonly roleAssignmentId: string;
  /** Defaults to today. A date still to come schedules the ending. */
  readonly effectiveTo?: string;
  /** Required. `REQ-effective-dated-role-history`: ending "requires a reason". */
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

/**
 * Ends one assignment, today or on a date still to come.
 *
 * This is the one action that creates a vacancy — `REQ-deactivate-and-reinstate`:
 * "Only explicit End role creates a Not assigned vacancy." Deactivating access
 * does not, and never has.
 *
 * The row is updated, never removed. An assignment that has already ended is
 * refused rather than re-ended: "without rewriting history" is the requirement,
 * and moving a date that has already passed is rewriting it.
 */
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

    // Authorization first. See the note in `assignRole`.
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

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Deactivate and restore
// ---------------------------------------------------------------------------

export interface OperatorAccessParams {
  readonly operator: ResolvedOperator | null;
  readonly operatorAccountId: string;
  readonly reason?: string;
}

export interface OperatorAccessResult {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly state: OperatorAccountState;
}

/**
 * Stops this operator signing in, immediately, and touches no role.
 *
 * `REQ-deactivate-and-reinstate` is emphatic about the second half:
 * deactivation "prevents sign-in without ending organizational roles, making a
 * role pending or creating a vacancy; role detail instead shows that the current
 * holder's operator access is deactivated". So this writes three columns on one
 * row and nothing else — {@link readRoleHolders} is what makes role detail say
 * so, and `operator-administration.test.ts` counts `role_assignments` rows
 * before and after to prove it.
 */
export async function deactivateOperatorAccess(
  params: OperatorAccessParams,
): Promise<OperatorAccessResult> {
  const actor = requireOperator(params.operator);
  const reason = blankToNull(params.reason);
  if (reason === null) {
    throw new ConstraintViolated(DEACTIVATION_REASON_MESSAGE, { rule: DEACTIVATION_REASON_RULE });
  }

  return withTransaction(async (tx) => {
    const account = await lockAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action: "deactivate_account", target: subject });

    if (!account.isActive) {
      throw new InvalidTransition(
        "This operator's access is already deactivated, so there is nothing to change.",
        { rule: "administration_already_deactivated" },
      );
    }

    await assertClubKeepsAnAdministrator(
      tx,
      { kind: "deactivate_account", personId: account.personId },
      // Immediately. A deactivation has no date to choose, and modelling it as
      // permanent from today is the conservative reading — nothing here knows
      // whether or when it will be undone.
      await currentDateIn(tx),
    );

    const after = await updateAccount(
      tx,
      account.id,
      `is_active = false, disabled_at = now(), disabled_reason = $2`,
      [reason],
    );

    await recordAdministrationEvent(tx, {
      action: "administration.operator.deactivated",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: { personId: account.personId, operatorAccountId: account.id },
      operatingYear,
      fromState: account.state,
      toState: after.state,
      reason,
    });

    return { operatorAccountId: after.id, personId: after.personId, state: after.state };
  });
}

/**
 * Lets this operator sign in again.
 *
 * "Reinstatement restores only capabilities from assignments that remain
 * effective." Nothing here restores a capability, and that is the point:
 * capabilities are read from `role_assignments` on every request, so a seat that
 * ended while the account was deactivated stays ended and does not come back.
 * There is no capability snapshot to get wrong because there is no snapshot.
 *
 * The reason is optional. `REQ-deactivate-and-reinstate` requires one for
 * deactivation and does not for restoration, and the audit vocabulary agrees —
 * `administration.operator.restored` carries `reasonRequired: false`. Coming
 * back needs no excuse, exactly as returning a membership to active does not.
 */
export async function restoreOperatorAccess(
  params: OperatorAccessParams,
): Promise<OperatorAccessResult> {
  const actor = requireOperator(params.operator);

  return withTransaction(async (tx) => {
    const account = await lockAccount(tx, params.operatorAccountId);
    const operatingYear = await resolveActiveCommitteeYear(tx);

    const subject = await readAdministrationSubject(tx, account.personId, {
      includeScheduled: true,
    });
    assertAdministrationTarget(params.operator, { action: "restore_account", target: subject });

    if (account.isActive) {
      throw new InvalidTransition(
        "This operator's access is not deactivated, so there is nothing to restore.",
        { rule: "administration_not_deactivated" },
      );
    }

    // `disabled_at` and `disabled_reason` are deliberately kept. The table's
    // own `operator_accounts_disabled_is_dated` note says so: "is_active = true
    // with a disabled_at set is a reinstatement, and keeping the previous date
    // is more informative than erasing it."
    const after = await updateAccount(tx, account.id, "is_active = true", []);

    await recordAdministrationEvent(tx, {
      action: "administration.operator.restored",
      actorPersonId: actor.personId,
      authority: administrationAuthority(actor),
      target: { personId: account.personId, operatorAccountId: account.id },
      operatingYear,
      fromState: account.state,
      toState: after.state,
      reason: blankToNull(params.reason),
    });

    return { operatorAccountId: after.id, personId: after.personId, state: after.state };
  });
}

// ---------------------------------------------------------------------------
// Email re-home
// ---------------------------------------------------------------------------

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
export function supabaseOperatorEmailRecovery(): OperatorEmailRecoveryPort {
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

// ---------------------------------------------------------------------------
// Role detail
// ---------------------------------------------------------------------------

export interface RoleHolder {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** The assignment has not begun yet. */
  readonly scheduled: boolean;
  /** The assignment has an end date still to come. */
  readonly endScheduled: boolean;
  /** True once `effective_to` has passed — a holder of the year, not of today. */
  readonly ended: boolean;
  readonly operatorAccountId: string | null;
  /** `null` when this Person has no operator login at all. */
  readonly operatorState: OperatorAccountState | null;
  /**
   * `REQ-deactivate-and-reinstate`: role detail "shows that the current holder's
   * operator access is deactivated" rather than a vacancy. This is that fact,
   * decided here so that two screens cannot decide it differently.
   */
  readonly accessDeactivated: boolean;
}

export interface RoleHolders {
  readonly role: {
    readonly id: string;
    readonly code: string;
    readonly label: string;
    readonly scope: "committee_year" | "season";
    readonly admitsMultipleHolders: boolean;
  };
  readonly cycle: AdministrationOperatingYear;
  readonly holders: readonly RoleHolder[];
  /** Nobody held this seat in this operating year. The Not assigned state. */
  readonly vacant: boolean;
  /** True for any year that is not the active one — `REQ-explicit-cycle-assignment`. */
  readonly readOnly: boolean;
}

/**
 * Who holds one seat, in one operating year, and what state their access is in.
 *
 * ## Why this is the capability floor and not the target-aware guard
 *
 * `assertAdministrationTarget` answers "may this operator do X *to this target*",
 * and a role's holder list has no target — it is the list from which a target
 * would be chosen, and it may be empty. `./operator-invitations.ts` draws the
 * same line for the same reason, for candidate search and for reading one
 * account. Guarding it at all matters because a holder list is a list of the
 * club's officers with their access states attached; `role_management` is where
 * `administration-audit.ts` already draws that line.
 *
 * Every **write** in this module asks the target-aware question, twice over: the
 * capability floor first, inside `assertAdministrationTarget`, and then the self
 * and leadership rules.
 *
 * ## "Holders from different years are never mixed"
 *
 * The rule is `REQ-explicit-cycle-assignment`'s, and it is implemented as an
 * overlap rather than as `committee_year_id = ?`, because the two disagree on
 * exactly the case the same requirement set names: General Manager and IT
 * Officer are standing seats and "neither expires automatically at year end". A
 * General Manager appointed in 2025-26 and never ended is the holder in 2026-27
 * too, and a strict cycle-id filter would report that seat vacant the day the
 * committee year turned over.
 *
 * So an assignment appears in a year's view when its effective period overlaps
 * that year's period. Each view is one year's holders; no view is a union across
 * years. The fallback for a cycle with no recorded start date is the strict
 * cycle id, which cannot mix years either.
 */
/**
 * The day a seat's holders are read as at, as SQL over the joined cycle `c`.
 *
 * Today while the cycle is still running — including the open-ended current
 * one, whose `ends_on` is null. The cycle's last day once it is over, because
 * `[starts_on, ends_on)` is half-open and `ends_on` itself belongs to the next
 * cycle. Reading a finished year then answers "who held this when it closed"
 * rather than "who holds it now", which is the only sense the question has.
 */
const AS_AT =
  "(case when c.ends_on is null or c.ends_on > current_date then current_date else c.ends_on - 1 end)";

export async function readRoleHolders(
  operator: ResolvedOperator | null,
  roleCode: string,
  options: { cycleId?: string } = {},
): Promise<RoleHolders> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const role = await requireRole(tx, roleCode);
    const active =
      role.scope === "committee_year"
        ? await resolveActiveCommitteeYear(tx)
        : (await resolveCycleFor(tx, "season", await resolveActiveCommitteeYear(tx))).operatingYear;

    const cycle =
      options.cycleId === undefined || options.cycleId === active.id
        ? active
        : await requireCycle(tx, role.scope, options.cycleId);

    const table = role.scope === "committee_year" ? "committee_years" : "seasons";

    const result = await tx.query<HolderRow>(
      `select ra.id,
              ra.person_id,
              ${personDisplayNameSql("p")} as display_name,
              ra.effective_from::text as effective_from,
              ra.effective_to::text   as effective_to,
              (ra.effective_from > current_date) as scheduled,
              (ra.effective_to is not null and ra.effective_to > current_date) as end_scheduled,
              (ra.effective_to is not null and ra.effective_to <= current_date) as ended,
              oa.id            as operator_account_id,
              oa.is_active     as operator_is_active,
              oa.activated_at  as operator_activated_at,
              oa.invitation_delivery_failed_at as operator_delivery_failed_at,
              oa.email_rehome_pending_at       as operator_rehome_pending_at
         from public.role_assignments ra
         join public.people p on p.id = ra.person_id
         join public.${table} c on c.id = $2
         left join public.operator_accounts oa on oa.person_id = ra.person_id
        where ra.role_id = $1
          -- Who holds the seat *on one day*, not who touched it during the
          -- cycle. Overlapping the cycle used to be the whole of the test, and
          -- it answered a question no caller asks — it kept an assignment that
          -- had already ended today, and it dropped one in force today whose
          -- dates fell outside the cycle window. A coach appointed in August
          -- for a season that opens in September holds the seat now and
          -- overlaps nothing, which is exactly how a live Head Coach came to
          -- read as Not assigned.
          --
          -- The day is today for the operating year in progress, and the
          -- cycle's own last day when an earlier one is read back, so a
          -- historical read still answers instead of going silently vacant.
          -- Scoping to the cycle is what the as-at day now does: an assignment in
          -- force on a day inside the cycle belongs to it, and the FK cannot
          -- disagree without the row being wrong in the first place. Half-open
          -- at both ends, matching the exclusion constraint over these rows.
          and ra.effective_from <= ${AS_AT}
          and (ra.effective_to is null or ra.effective_to > ${AS_AT})
        order by ra.effective_from, ra.id`,
      [role.id, cycle.id],
    );

    const holders = result.rows.map(toHolder);

    return {
      role: {
        id: role.id,
        code: role.code,
        label: roleLabel(role.code),
        scope: role.scope,
        admitsMultipleHolders: !role.is_constitutional_office && !role.is_single_holder_seat,
      },
      cycle,
      holders,
      vacant: holders.length === 0,
      readOnly: cycle.id !== active.id,
    };
  });
}

interface HolderRow {
  id: string;
  person_id: string;
  display_name: string | null;
  effective_from: string;
  effective_to: string | null;
  scheduled: boolean;
  end_scheduled: boolean;
  ended: boolean;
  operator_account_id: string | null;
  operator_is_active: boolean | null;
  operator_activated_at: Date | null;
  operator_delivery_failed_at: Date | null;
  operator_rehome_pending_at: Date | null;
}

function toHolder(row: HolderRow): RoleHolder {
  const state =
    row.operator_account_id === null
      ? null
      : deriveOperatorAccountState({
          isActive: row.operator_is_active === true,
          activatedAt: row.operator_activated_at,
          invitationDeliveryFailedAt: row.operator_delivery_failed_at,
          emailChangePending: row.operator_rehome_pending_at !== null,
        });

  return {
    roleAssignmentId: row.id,
    personId: row.person_id,
    displayName: row.display_name ?? "Unnamed person",
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    scheduled: row.scheduled,
    endScheduled: row.end_scheduled,
    ended: row.ended,
    operatorAccountId: row.operator_account_id,
    operatorState: state,
    accessDeactivated: state === "deactivated",
  };
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

function requireOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted("You do not have access to this action. Sign in first.", {
      rule: "operator_required",
    });
  }
  return operator;
}

function administrationAuthority(operator: ResolvedOperator) {
  return {
    kind: "capability" as const,
    capability: ADMINISTRATION_CAPABILITY,
    roleCodes: operator.roleCodes,
  };
}

function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function normaliseEmail(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

function assertIsoDate(value: string): void {
  if (!ISO_DATE.test(value)) {
    throw new ConstraintViolated(INVALID_DATE_MESSAGE, { rule: INVALID_DATE_RULE });
  }
}

interface RoleRow {
  id: string;
  code: string;
  scope: "committee_year" | "season";
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
}

const ROLE_COLUMNS = `id, code, scope::text as scope, is_constitutional_office,
       is_single_holder_seat`;

/**
 * One catalogue row, by code, looked up **exactly**.
 *
 * Not trimmed, not lowercased, not aliased. `" kit_manager "` is refused rather
 * than tidied up, for the reason `./operator-invitations.ts` and
 * `WP-authorization` both give: a role code comes from a fixed list of twenty
 * chosen from a control, whitespace around one means the request was built
 * wrongly, and guessing what a caller meant about the most dangerous seat in the
 * club is not a leniency worth having. Two layers refusing identically is one
 * fewer thing to reason about than two layers disagreeing harmlessly.
 */
async function requireRole(tx: Tx, code: string): Promise<RoleRow> {
  const found = await tx.query<RoleRow>(
    `select ${ROLE_COLUMNS} from public.roles where code = $1`,
    [code ?? ""],
  );
  if (found.rows.length === 0) {
    throw new NotFound(UNKNOWN_ROLE_MESSAGE, { rule: UNKNOWN_ROLE_RULE });
  }
  return found.rows[0];
}

async function requireRoleById(tx: Tx, roleId: string): Promise<RoleRow> {
  const found = await tx.query<RoleRow>(`select ${ROLE_COLUMNS} from public.roles where id = $1`, [
    roleId,
  ]);
  if (found.rows.length === 0) {
    // Unreachable while `role_assignments.role_id` is a foreign key, and
    // refused rather than asserted away: the alternative is a guard judging
    // `undefined.code`.
    throw new NotFound(UNKNOWN_ROLE_MESSAGE, { rule: UNKNOWN_ROLE_RULE });
  }
  return found.rows[0];
}

/** The Person must exist and must not have been merged away. */
async function requireAssignablePerson(tx: Tx, personId: string): Promise<void> {
  const result = await tx.query<{ merged_into_person_id: string | null }>(
    "select merged_into_person_id from public.people where id = $1",
    [personId],
  );
  if (result.rows.length === 0) {
    throw new NotFound(PERSON_NOT_FOUND_MESSAGE, { rule: PERSON_NOT_FOUND_RULE });
  }
  if (result.rows[0].merged_into_person_id !== null) {
    throw new Conflict(MERGED_PERSON_MESSAGE, { rule: MERGED_PERSON_RULE });
  }
}

async function operatorAccountIdFor(tx: Tx, personId: string): Promise<string | null> {
  const result = await tx.query<{ id: string }>(
    "select id from public.operator_accounts where person_id = $1",
    [personId],
  );
  return result.rows.length === 0 ? null : result.rows[0].id;
}

interface AssignmentRow {
  id: string;
  personId: string;
  roleId: string;
  roleCode: string;
  scope: "committee_year" | "season";
  committeeYearId: string | null;
  seasonId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/**
 * One assignment, locked for the length of the transaction.
 *
 * `for update` on the assignment row, so that two administrators ending or
 * replacing the same holder serialize rather than both reading it as current.
 * It does not close every race — the administration-path count reads rows this
 * statement does not lock — and the residual is recorded in the pull request
 * rather than implied away.
 */
async function lockAssignment(tx: Tx, roleAssignmentId: string): Promise<AssignmentRow> {
  const result = await tx.query<{
    id: string;
    person_id: string;
    role_id: string;
    code: string;
    scope: "committee_year" | "season";
    committee_year_id: string | null;
    season_id: string | null;
    effective_from: string;
    effective_to: string | null;
  }>(
    `select ra.id, ra.person_id, ra.role_id, r.code, ra.scope::text as scope,
            ra.committee_year_id, ra.season_id,
            ra.effective_from::text as effective_from, ra.effective_to::text as effective_to
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
      where ra.id = $1
        for update of ra`,
    [roleAssignmentId],
  );

  if (result.rows.length === 0) {
    throw new NotFound(ASSIGNMENT_NOT_FOUND_MESSAGE, { rule: ASSIGNMENT_NOT_FOUND_RULE });
  }

  const row = result.rows[0];
  return {
    id: row.id,
    personId: row.person_id,
    roleId: row.role_id,
    roleCode: row.code,
    scope: row.scope,
    committeeYearId: row.committee_year_id,
    seasonId: row.season_id,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
  };
}

function refuseAlreadyEnded(assignment: AssignmentRow): void {
  if (assignment.effectiveTo === null) return;
  throw new InvalidTransition(
    `This assignment already ends on ${assignment.effectiveTo}. History is not rewritten here — ` +
      "if the seat needs somebody in it again, assign it.",
    { rule: ALREADY_ENDED_RULE },
  );
}

function refuseEndBeforeStart(assignment: AssignmentRow, effectiveTo: string): void {
  if (effectiveTo > assignment.effectiveFrom) return;
  throw new ConstraintViolated(
    `This assignment started on ${assignment.effectiveFrom}, so it cannot end on or before ` +
      "that date. Choose a later date.",
    { rule: END_BEFORE_START_RULE },
  );
}

/**
 * The dates and the reason for a new assignment, checked before anything is
 * written.
 *
 * The same three rules `./operator-invitations.ts` applies to an invitation's
 * initial roles: today by default, a future date is scheduled, a past date is
 * backdating and backdating is *audited*, so it needs a reason.
 */
async function resolveDates(
  tx: Tx,
  role: RoleRow,
  input: { effectiveFrom?: string; reason?: string },
): Promise<ResolvedRole> {
  const today = await currentDateIn(tx);
  const effectiveFrom = blankToNull(input.effectiveFrom) ?? today;
  assertIsoDate(effectiveFrom);

  const reason = blankToNull(input.reason);
  const backdated = effectiveFrom < today;
  if (backdated && reason === null) {
    throw new ConstraintViolated(BACKDATING_REASON_MESSAGE, { rule: BACKDATING_REASON_RULE });
  }

  return { role, effectiveFrom, backdated, scheduled: effectiveFrom > today, reason };
}

/**
 * One person may not hold one seat twice over the same period.
 *
 * No schema constraint forbids it for a seat that admits several holders — and
 * nothing about the club means it. Refused rather than de-duplicated, because
 * "I picked it twice" and "I meant two different periods" look identical
 * afterwards.
 */
async function refuseOverlappingHolding(
  tx: Tx,
  personId: string,
  role: RoleRow,
  effectiveFrom: string,
): Promise<void> {
  const clash = await tx.query<{ id: string }>(
    `select id from public.role_assignments
      where person_id = $1
        and role_id = $2
        and (effective_to is null or effective_to > $3::date)
      limit 1`,
    [personId, role.id, effectiveFrom],
  );
  if (clash.rows.length > 0) {
    throw new Conflict(ALREADY_HOLDS_ROLE_MESSAGE, { rule: ALREADY_HOLDS_ROLE_RULE });
  }
}

/** The operating year an existing assignment hangs off, for its audit event. */
async function operatingYearForAssignment(
  tx: Tx,
  assignment: AssignmentRow,
): Promise<AdministrationOperatingYear> {
  if (assignment.scope === "committee_year" && assignment.committeeYearId !== null) {
    return readCycle(tx, "committee_years", assignment.committeeYearId, "committee_year");
  }
  if (assignment.seasonId !== null) {
    return readCycle(tx, "seasons", assignment.seasonId, "season");
  }
  // `role_assignments_exactly_one_scope` makes this unreachable.
  throw new UnexpectedDatabaseError("That role assignment has no operating year.", {
    rule: "administration_assignment_has_no_cycle",
  });
}

async function readCycle(
  tx: Tx,
  table: "committee_years" | "seasons",
  id: string,
  scope: "committee_year" | "season",
): Promise<AdministrationOperatingYear> {
  const result = await tx.query<{ id: string; label: string }>(
    `select id, label from public.${table} where id = $1`,
    [id],
  );
  if (result.rows.length === 0) {
    throw new NotFound("That operating year is not one the club has recorded.", {
      rule: "administration_cycle_not_found",
    });
  }
  return { scope, id: result.rows[0].id, label: result.rows[0].label };
}

async function requireCycle(
  tx: Tx,
  scope: "committee_year" | "season",
  id: string,
): Promise<AdministrationOperatingYear> {
  return readCycle(tx, scope === "committee_year" ? "committee_years" : "seasons", id, scope);
}

// ---------------------------------------------------------------------------
// Operator accounts
// ---------------------------------------------------------------------------

async function lockAccount(tx: Tx, operatorAccountId: string): Promise<OperatorAccountRecord> {
  const locked = await tx.query<{ id: string }>(
    "select id from public.operator_accounts where id = $1 for update",
    [operatorAccountId],
  );
  if (locked.rows.length === 0) {
    throw new NotFound("That operator record no longer exists.", {
      rule: "operator_account_not_found",
    });
  }

  const account = await readOperatorAccountIn(tx, operatorAccountId);
  if (!account) {
    throw new NotFound("That operator record no longer exists.", {
      rule: "operator_account_not_found",
    });
  }
  return account;
}

/**
 * Applies a fragment to one account row and re-reads it through the one
 * function that decides an account's state.
 *
 * The fragment is written by this module and never by a caller — `$1` is always
 * the account id, and any further placeholders are the caller's parameters.
 */
async function updateAccount(
  tx: Tx,
  operatorAccountId: string,
  assignments: string,
  parameters: readonly unknown[],
): Promise<OperatorAccountRecord> {
  await tx.query(
    `update public.operator_accounts
        set ${assignments}, updated_at = now()
      where id = $1`,
    [operatorAccountId, ...parameters],
  );

  const after = await readOperatorAccountIn(tx, operatorAccountId);
  if (!after) {
    throw new UnexpectedDatabaseError("The operator record could not be re-read.", {
      rule: "operator_account_not_found",
    });
  }
  return after;
}

/** Refuses an address another operator login already holds. */
async function refuseTakenEmail(tx: Tx, email: string, exceptAccountId: string): Promise<void> {
  const result = await tx.query<{ id: string }>(
    `select id from public.operator_accounts
      where lower(login_email) = lower($1) and id <> $2::uuid
      limit 1`,
    [email, exceptAccountId],
  );
  if (result.rows.length > 0) {
    throw new Conflict(REHOME_EMAIL_TAKEN_MESSAGE, { rule: REHOME_EMAIL_TAKEN_RULE });
  }
}

/**
 * Which accounts this flow is for, in the words of the states themselves.
 *
 * Active, or already pending — a retry. Everything else is refused and told
 * where to go instead, because each other state has its own flow:
 *
 *   * Invitation pending and Delivery failed belong to correct-and-resend,
 *     which exists, and which refuses an activated account so the two meet
 *     exactly;
 *   * Deactivated has to be restored first, because re-homing an address on an
 *     account nobody may sign into achieves nothing and would leave two reasons
 *     for the same lock-out.
 */
function refuseUnlessRehomable(account: OperatorAccountRecord): void {
  if (account.state === "active" || account.state === "email_change_pending") return;

  const definition = operatorAccountState(account.state);
  const next =
    account.state === "deactivated"
      ? "Restore their access first, then move the address."
      : "This person has not set up their sign-in yet, so correct the invitation and send it " +
        "again instead.";

  throw new InvalidTransition(
    `This operator's access is “${definition.label}”, so their sign-in address cannot be ` +
      `moved. ${next}`,
    { rule: REHOME_NOT_AVAILABLE_RULE },
  );
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

// ---------------------------------------------------------------------------
// The club's last administrator
// ---------------------------------------------------------------------------

/**
 * One administration seat, with the period it is held over.
 *
 * Seats rather than people, and dates rather than a snapshot, because
 * LAN132-B2: an administrator already scheduled to lapse is still effective
 * *today*, so a today-only snapshot counts them as the surviving path and
 * nothing ever re-evaluates on the date they go. Two ordinary endings by one
 * administrator, no race and no second actor, then left the club with nobody
 * able to administer it — which is the state `REQ-final-admin-protection`
 * exists to prevent.
 */
interface AdministrationSeat {
  readonly personId: string;
  readonly roleCode: string;
  /** ISO date. May be later than today — a seat that has not started yet. */
  readonly effectiveFrom: string;
  /** ISO date, exclusive, or `null` for open-ended. */
  readonly effectiveTo: string | null;
  /** Can this person sign in today? Treated as constant — see the note below. */
  readonly usable: boolean;
}

/**
 * Every administration seat the club has that has not already lapsed, with its
 * period and its holder's account state.
 *
 * Three things about it are decisions rather than shape:
 *
 *   * **Seats that have not started are included.** The previous version
 *     excluded them, on the reasoning that an administrator whose seat begins
 *     next month cannot help the club this afternoon. That is true of *this
 *     afternoon* and it is the wrong shape for the question: the guard now asks
 *     what the club looks like on each date, and on the date that seat begins
 *     it is a path. Excluding them made a legitimate succession — schedule the
 *     outgoing officer's departure, schedule the incoming one's start — refuse
 *     for no reason, while the far worse case it was meant to catch went
 *     through.
 *
 *   * **Seats that have already lapsed are excluded**, because they are history
 *     and no future date brings them back.
 *
 *   * **`usable` is a present-tense fact carried forward unchanged.** Whether
 *     somebody's invitation will have been taken up by September is not
 *     knowable, and guessing either way would be inventing a fact. Carrying
 *     today's answer forward is the conservative direction: a pending
 *     invitation counts as unusable at every date, so it can only make the
 *     guard stricter, never permissive.
 */
async function readAdministrationSeats(tx: Tx): Promise<AdministrationSeat[]> {
  const result = await tx.query<{
    person_id: string;
    code: string;
    effective_from: string;
    effective_to: string | null;
    is_active: boolean | null;
    activated_at: Date | null;
    invitation_delivery_failed_at: Date | null;
    email_rehome_pending_at: Date | null;
  }>(
    `select ra.person_id,
            r.code,
            ra.effective_from::text as effective_from,
            ra.effective_to::text   as effective_to,
            oa.is_active,
            oa.activated_at,
            oa.invitation_delivery_failed_at,
            oa.email_rehome_pending_at
       from public.role_assignments ra
       join public.roles r on r.id = ra.role_id
       left join public.operator_accounts oa on oa.person_id = ra.person_id
      where r.code = any($1::text[])
        and (ra.effective_to is null or ra.effective_to > current_date)`,
    [[...capabilityRoleCodes(ADMINISTRATION_CAPABILITY)]],
  );

  return result.rows.map((row) => ({
    personId: row.person_id,
    roleCode: row.code,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    usable:
      row.is_active !== null &&
      operatorAccountState(
        deriveOperatorAccountState({
          isActive: row.is_active,
          activatedAt: row.activated_at,
          invitationDeliveryFailedAt: row.invitation_delivery_failed_at,
          emailChangePending: row.email_rehome_pending_at !== null,
        }),
      ).usable,
  }));
}

/**
 * The club's administration paths **on one date**, as the authority module's
 * rule wants them.
 *
 * `[effectiveFrom, effectiveTo)` — the same half-open period the GiST exclusion
 * constraints use, so a seat handed over on a date is held by exactly one of
 * the two people on it.
 */
function administrationPathsOn(
  seats: readonly AdministrationSeat[],
  date: string,
): AdministrationPath[] {
  const byPerson = new Map<string, { roleCodes: string[]; usable: boolean }>();

  for (const seat of seats) {
    if (seat.effectiveFrom > date) continue;
    if (seat.effectiveTo !== null && seat.effectiveTo <= date) continue;

    const existing = byPerson.get(seat.personId);
    if (existing) existing.roleCodes.push(seat.roleCode);
    else byPerson.set(seat.personId, { roleCodes: [seat.roleCode], usable: seat.usable });
  }

  return [...byPerson.entries()].map(([personId, entry]) => ({
    personId,
    roleCodes: entry.roleCodes,
    usable: entry.usable,
  }));
}

/** One Person as a candidate path, for a replacement's successor. */
async function administrationPathFor(
  tx: Tx,
  personId: string,
  roleCode: string,
): Promise<AdministrationPath> {
  const result = await tx.query<{
    is_active: boolean | null;
    activated_at: Date | null;
    invitation_delivery_failed_at: Date | null;
    email_rehome_pending_at: Date | null;
  }>(
    `select is_active, activated_at, invitation_delivery_failed_at, email_rehome_pending_at
       from public.operator_accounts where person_id = $1`,
    [personId],
  );

  const row = result.rows[0];
  return {
    personId,
    roleCodes: [roleCode],
    usable:
      row !== undefined &&
      operatorAccountState(
        deriveOperatorAccountState({
          isActive: row.is_active === true,
          activatedAt: row.activated_at,
          invitationDeliveryFailedAt: row.invitation_delivery_failed_at,
          emailChangePending: row.email_rehome_pending_at !== null,
        }),
      ).usable,
  };
}

/**
 * `REQ-final-admin-protection`: "No action may eliminate every usable
 * administration path."
 *
 * Applied to the three actions that can remove one — ending a role, replacing a
 * holder and deactivating an account — and deliberately not to email recovery.
 * Recovery temporarily makes an account unusable, and refusing it when the
 * account belongs to the club's last administrator would be a trap: the person
 * whose mailbox was lost is exactly the person who most needs it moved, and the
 * `AdministrationPathEffect` union does not model it because `WP-authorization`
 * decided it should not.
 *
 * ## It is checked on every date the answer can change, not only today
 *
 * This is LAN132-B2, and the defect it closes needed no race and no second
 * actor. `effectiveOn` is the date the pending action takes hold — today for a
 * deactivation, the chosen date for an ending or a handover — and the club's
 * paths are recomputed on **every** date at which any administration seat
 * starts or stops, because between two such dates the answer cannot change.
 * Evaluating only today let one administrator schedule two endings for the same
 * future date, each permitted because the other holder was still effective *at
 * the moment of asking*, and leave the club with nobody on the day they both
 * lapsed — recoverable only by Brian, through a migration or the owner-run
 * bootstrap.
 *
 * ## The effect is applied only from the date it takes hold
 *
 * A seat ending in September is still held in August, so applying the effect at
 * every date would refuse legitimate successions by pretending the departure
 * had already happened. Before `effectiveOn` the club is unchanged; from it,
 * `remainingAdministrationPaths` projects the change — which is also why
 * replacement is still handed to that function whole rather than decomposed
 * here (LAN129-A1): it is the one place that knows a successor's `usable` must
 * merge as a conjunction.
 *
 * ## "Eliminate" is still a comparison, now per date
 *
 * An action cannot eliminate what is already gone, so each date is judged
 * against itself: a date that had no usable path before this action is not one
 * this action emptied. That keeps a freshly migrated database — role
 * assignments from the seed, no `operator_accounts` rows, which is what CI runs
 * against — from refusing every ending and every deactivation with a message
 * about administration roles that has nothing to do with the action.
 */
async function assertClubKeepsAnAdministrator(
  tx: Tx,
  effect: AdministrationPathEffect,
  effectiveOn: string,
): Promise<void> {
  const seats = await readAdministrationSeats(tx);
  const today = await currentDateIn(tx);

  // Every date the picture can change: today, the date this action takes hold,
  // and every start or end already scheduled. Between two consecutive dates in
  // this set no seat begins or ends, so no date between them can be worse than
  // the one that opened the interval.
  const horizon = new Set<string>([today, effectiveOn]);
  for (const seat of seats) {
    if (seat.effectiveFrom > today) horizon.add(seat.effectiveFrom);
    if (seat.effectiveTo !== null && seat.effectiveTo > today) horizon.add(seat.effectiveTo);
  }

  for (const date of [...horizon].sort()) {
    const before = administrationPathsOn(seats, date);
    if (usableAdministrationPaths(before).length === 0) continue;

    const after = date >= effectiveOn ? remainingAdministrationPaths(before, effect) : before;

    assertAdministrationPathSurvives(after);
  }
}

/** Re-exported so a caller can build the same subject shape this module judges. */
export type { AdministrationSubject };
