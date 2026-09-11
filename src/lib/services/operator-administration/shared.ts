import "server-only";

import {
  assertAdministrationPathSurvives,
  remainingAdministrationPaths,
  usableAdministrationPaths,
  type AdministrationPath,
  type AdministrationPathEffect,
} from "@/lib/auth/administration-authority";
import { capabilityRoleCodes } from "@/lib/auth/capabilities";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { addClubDays, formatClubDay } from "@/lib/club-time";
import {
  Conflict,
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  NotPermitted,
  UnexpectedDatabaseError,
  type Tx,
} from "@/lib/db";
import type { AdministrationOperatingYear } from "../administration-events";
import { deriveOperatorAccountState, operatorAccountState } from "../operator-account-state";
import {
  currentDateIn,
  readOperatorAccountIn,
  type OperatorAccountRecord,
  type ResolvedRole,
} from "../operator-invitations";

/**
 * Operator administration — private helpers and rule constants shared by the
 * siblings in this directory. LAN-132, mission M-OPERATOR-ADMIN-WITHOUT-SQL,
 * work package `WP-assignment`. Nothing here is exported from the barrel
 * except the rule constants. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */

export const ADMINISTRATION_CAPABILITY = "role_management" as const;

export const UNKNOWN_ROLE_RULE = "administration_role_unknown";
const UNKNOWN_ROLE_MESSAGE =
  "That role is not one of the club's roles. The list of roles is fixed and is not editable " +
  "in the application; choose one from it.";

export const PERSON_NOT_FOUND_RULE = "administration_person_not_found";
const PERSON_NOT_FOUND_MESSAGE =
  "That person is not in the club's records any more. Search again and choose from the list.";

export const MERGED_PERSON_RULE = "administration_person_merged";
const MERGED_PERSON_MESSAGE =
  "That person's record has been merged into another one. Open the record it was merged into " +
  "and make the change there.";

const ASSIGNMENT_NOT_FOUND_RULE = "administration_role_assignment_not_found";
const ASSIGNMENT_NOT_FOUND_MESSAGE =
  "That role assignment no longer exists. Reload the role and try again.";

export const ALREADY_HOLDS_ROLE_RULE = "administration_already_holds_role";
const ALREADY_HOLDS_ROLE_MESSAGE =
  "That person already holds this role over the same period. End the assignment they have " +
  "before giving them another one.";

const INVALID_DATE_RULE = "administration_date_invalid";
const INVALID_DATE_MESSAGE = "Enter the date as a calendar date, for example 2026-09-01.";

export const BACKDATING_REASON_RULE = "administration_backdating_reason_required";
const BACKDATING_REASON_MESSAGE =
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

export const REHOME_REASON_RULE = "administration_rehome_reason_required";
export const REHOME_REASON_MESSAGE =
  "Moving somebody's sign-in to a different email address has to say why. Record the reason.";

export const REHOME_SAME_ADDRESS_RULE = "administration_rehome_same_address";
export const REHOME_SAME_ADDRESS_MESSAGE =
  "That is the address this login already uses. Enter the replacement address instead.";

export const REHOME_EMAIL_TAKEN_RULE = "administration_rehome_email_taken";
const REHOME_EMAIL_TAKEN_MESSAGE =
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

export function requireOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted("You do not have access to this action. Sign in first.", {
      rule: "operator_required",
    });
  }
  return operator;
}

export function administrationAuthority(operator: ResolvedOperator) {
  return {
    kind: "capability" as const,
    capability: ADMINISTRATION_CAPABILITY,
    roleCodes: operator.roleCodes,
  };
}

export function blankToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normaliseEmail(value: string): string {
  return (value ?? "").trim().toLowerCase();
}

export function assertIsoDate(value: string): void {
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
 * One catalogue row, by code, looked up **exactly** — not trimmed or
 * lowercased; see `./operator-invitations.ts` and `WP-authorization`.
 * Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export async function requireRole(tx: Tx, code: string): Promise<RoleRow> {
  const found = await tx.query<RoleRow>(
    `select ${ROLE_COLUMNS} from public.roles where code = $1`,
    [code ?? ""],
  );
  if (found.rows.length === 0) {
    throw new NotFound(UNKNOWN_ROLE_MESSAGE, { rule: UNKNOWN_ROLE_RULE });
  }
  return found.rows[0];
}

export async function requireRoleById(tx: Tx, roleId: string): Promise<RoleRow> {
  const found = await tx.query<RoleRow>(`select ${ROLE_COLUMNS} from public.roles where id = $1`, [
    roleId,
  ]);
  if (found.rows.length === 0) {
    throw new NotFound(UNKNOWN_ROLE_MESSAGE, { rule: UNKNOWN_ROLE_RULE });
  }
  return found.rows[0];
}

export async function requireAssignablePerson(tx: Tx, personId: string): Promise<void> {
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

export async function operatorAccountIdFor(tx: Tx, personId: string): Promise<string | null> {
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
 * One assignment, locked `for update` for the length of the transaction, so
 * two administrators ending or replacing the same holder serialize.
 * Decision history (the residual race): missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export async function lockAssignment(tx: Tx, roleAssignmentId: string): Promise<AssignmentRow> {
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

export function refuseAlreadyEnded(assignment: AssignmentRow): void {
  if (assignment.effectiveTo === null) return;
  throw new InvalidTransition(
    `This assignment already ends on ${formatClubDay(assignment.effectiveTo)}. History is not ` +
      "rewritten here — if the seat needs somebody in it again, assign it.",
    { rule: ALREADY_ENDED_RULE },
  );
}

/**
 * The earliest date one assignment may be given as its end, as `YYYY-MM-DD`
 * — the day after it started (`role_assignments_period_ordered`). Exported
 * so the surfaces use the same answer as the guard. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export function earliestEndFor(assignment: { readonly effectiveFrom: string }): string {
  return addClubDays(assignment.effectiveFrom, 1) ?? assignment.effectiveFrom;
}

export function refuseEndBeforeStart(assignment: AssignmentRow, effectiveTo: string): void {
  if (effectiveTo > assignment.effectiveFrom) return;
  throw new ConstraintViolated(
    `This assignment started on ${formatClubDay(assignment.effectiveFrom)}, so it cannot end on ` +
      `or before that date. The earliest it can end is ${formatClubDay(earliestEndFor(assignment))}.`,
    { rule: END_BEFORE_START_RULE },
  );
}

/** The dates and reason for a new assignment, checked before anything is written; same three rules as an invitation's initial roles. */
export async function resolveDates(
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

/** One person may not hold one seat twice over the same period; refused rather than de-duplicated. */
export async function refuseOverlappingHolding(
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
export async function operatingYearForAssignment(
  tx: Tx,
  assignment: AssignmentRow,
): Promise<AdministrationOperatingYear> {
  if (assignment.scope === "committee_year" && assignment.committeeYearId !== null) {
    return readCycle(tx, "committee_years", assignment.committeeYearId, "committee_year");
  }
  if (assignment.seasonId !== null) {
    return readCycle(tx, "seasons", assignment.seasonId, "season");
  }
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

export async function requireCycle(
  tx: Tx,
  scope: "committee_year" | "season",
  id: string,
): Promise<AdministrationOperatingYear> {
  return readCycle(tx, scope === "committee_year" ? "committee_years" : "seasons", id, scope);
}

export async function lockAccount(
  tx: Tx,
  operatorAccountId: string,
): Promise<OperatorAccountRecord> {
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

/** Applies a fragment to one account row and re-reads it. `$1` is always the account id; the fragment is written by this module, never a caller. */
export async function updateAccount(
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

export async function refuseTakenEmail(
  tx: Tx,
  email: string,
  exceptAccountId: string,
): Promise<void> {
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
 * Which accounts this flow is for: active, or already pending (a retry).
 * Every other state is refused and told which flow to use instead.
 * Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export function refuseUnlessRehomable(account: OperatorAccountRecord): void {
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

/**
 * One administration seat, with the period it is held over — seats rather
 * than people, dates rather than a snapshot. Decision history (LAN132-B2): missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
interface AdministrationSeat {
  readonly personId: string;
  readonly roleCode: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly usable: boolean;
}

/**
 * Every administration seat the club has that has not already lapsed
 * (seats not yet started are included; lapsed seats are not), with its
 * holder's account state carried forward unchanged. Decision history: missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
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

/** The club's administration paths on one date; `[effectiveFrom, effectiveTo)`, half-open like the GiST exclusion constraints. */
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

export async function administrationPathFor(
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
 * `REQ-final-admin-protection`: applied to ending a role, replacing a holder
 * and deactivating an account — deliberately not to email recovery. Checked
 * on every date the answer can change (not only today), and the effect is
 * applied only from `effectiveOn`. Decision history (LAN132-B2, LAN129-A1): missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
 */
export async function assertClubKeepsAnAdministrator(
  tx: Tx,
  effect: AdministrationPathEffect,
  effectiveOn: string,
): Promise<void> {
  const seats = await readAdministrationSeats(tx);
  const today = await currentDateIn(tx);

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
