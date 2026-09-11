import "server-only";

import { roleLabel } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { NotPermitted, withTransaction } from "@/lib/db";
import type { AdministrationOperatingYear } from "./administration-events";
import { deriveOperatorAccountState, type OperatorAccountState } from "./operator-account-state";
import { resolveCommitteeYearForReading, resolveSeasonForReading } from "./operator-invitations";
import { personDisplayNameSql } from "./sql-text";

// The plural reads Administration opens on — LAN-133, WP-surfaces: who are the club's operators,
// and who holds each seat, without twenty transactions to draw one page. Three queries, no new
// rule — every fact is derived by an existing function (deriveOperatorAccountState, roleLabel, the
// same currency test readRoleHolders() applies). Both list reads are guarded at role_management,
// the capability floor (a list has no target for the target-aware guard to ask about; every write
// still asks that question inside the service that performs it). Grouping comes from
// public.role_groups, not TypeScript, because capability-map-single-source.test.ts forbids naming
// a roles.code outside the capability map. See relocations.md.

/** One holder of a seat, as the Roles index and role detail show them. */
export interface CatalogueHolder {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean; // recorded, but not in force until its start date
  readonly operatorAccountId: string | null;
  readonly operatorState: OperatorAccountState | null; // null when this Person has no operator login at all
  readonly accessDeactivated: boolean; // REQ-deactivate-and-reinstate: the holder keeps the seat — see relocations.md
}

/** One seat in the catalogue, with the holders this operating year has. */
export interface CatalogueRole {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly scope: "committee_year" | "season";
  readonly admitsMultipleHolders: boolean;
  readonly holders: readonly CatalogueHolder[];
  readonly scheduled: readonly CatalogueHolder[]; // recorded to begin later — never holders, never counted towards vacant (Brian, 20 Aug 2026; see relocations.md)
  readonly vacant: boolean; // nobody holds this seat **today** — the "Not assigned" state
  readonly cycleMissing: boolean; // the operating year this seat hangs off doesn't exist yet (e.g. between seasons) — see relocations.md
  readonly assignable: boolean; // a new assignment can be recorded today — false if cycle missing, or a season is `closing` (LAN-141 finding 2)
}

/** One approved group, in the catalogue's own order. */
export interface CatalogueGroup {
  readonly code: string;
  readonly label: string;
  readonly roles: readonly CatalogueRole[];
}

export interface RoleCatalogue {
  readonly groups: readonly CatalogueGroup[];
  readonly committeeYear: AdministrationOperatingYear | null; // null during a gap between committee years (LAN-141 finding 8)
  readonly season: AdministrationOperatingYear | null; // null only when no season is under way, closing included
  readonly seasonWritable: boolean; // false when season is null, and false for a season in `closing`
}

interface CatalogueRow {
  role_id: string;
  code: string;
  scope: "committee_year" | "season";
  is_constitutional_office: boolean;
  is_single_holder_seat: boolean;
  group_code: string;
  group_label: string;
  cycle_id: string | null;
  assignment_id: string | null;
  person_id: string | null;
  display_name: string | null;
  effective_from: string | null;
  effective_to: string | null;
  scheduled: boolean | null;
  operator_account_id: string | null;
  operator_is_active: boolean | null;
  operator_activated_at: Date | null;
  operator_delivery_failed_at: Date | null;
  operator_rehome_pending_at: Date | null;
}

// The whole catalogue, grouped, with the holders of each seat **today** — not "overlaps the active
// cycle", the earlier and wrong question (three defects Brian found in one review; see
// relocations.md). Same half-open currency test as the schema's exclusion constraint:
// effective_from <= today and effective_to either absent or still future. `scheduled` is a live
// partition, not a leftover — holders are in force today, scheduled are still to begin, and only
// holders decide `vacant` (Brian's ruling, 20 August 2026).
export async function readRoleCatalogue(operator: ResolvedOperator | null): Promise<RoleCatalogue> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const committeeYear = await resolveCommitteeYearForReading(tx);
    const season = await resolveSeasonForReading(tx);

    const result = await tx.query<CatalogueRow>(
      `with cycles as (
         select 'committee_year'::public.role_scope as scope,
                cy.id, cy.starts_on, cy.ends_on
           from public.committee_years cy
          where cy.id = $1::uuid
         union all
         select 'season'::public.role_scope,
                s.id, s.starts_on, s.ends_on
           from public.seasons s
          where s.id = $2::uuid
       )
       select r.id                as role_id,
              r.code,
              r.scope,
              r.is_constitutional_office,
              r.is_single_holder_seat,
              rg.code             as group_code,
              rg.label            as group_label,
              c.id                as cycle_id,
              ra.id               as assignment_id,
              ra.person_id,
              ${personDisplayNameSql("p")} as display_name,
              ra.effective_from::text as effective_from,
              ra.effective_to::text   as effective_to,
              (ra.effective_from > current_date) as scheduled,
              oa.id               as operator_account_id,
              oa.is_active        as operator_is_active,
              oa.activated_at     as operator_activated_at,
              oa.invitation_delivery_failed_at as operator_delivery_failed_at,
              oa.email_rehome_pending_at       as operator_rehome_pending_at
         from public.roles r
         join public.role_groups rg on rg.id = r.role_group_id
         left join cycles c on c.scope = r.scope
         left join public.role_assignments ra
                on ra.role_id = r.id
               and (ra.effective_to is null or ra.effective_to > current_date)
         left join public.people p on p.id = ra.person_id
         left join public.operator_accounts oa on oa.person_id = ra.person_id
        order by rg.sort_order, r.sort_order, ra.effective_from, ra.id`,
      [committeeYear?.id ?? null, season?.year.id ?? null],
    );

    return {
      groups: groupCatalogue(result.rows, {
        committee_year: committeeYear !== null,
        season: season?.writable === true,
      }),
      committeeYear,
      season: season?.year ?? null,
      seasonWritable: season?.writable === true,
    };
  });
}

// Rows to groups — a left join, so a seat nobody holds is present and empty, not absent. Each
// seat's rows split in two: in force is a holder, recorded to start later is scheduled. Only
// holders decide vacant.
function groupCatalogue(
  rows: readonly CatalogueRow[],
  writable: Readonly<Record<"committee_year" | "season", boolean>>,
): CatalogueGroup[] {
  const groups: { code: string; label: string; roles: CatalogueRole[] }[] = [];
  const seen = new Map<string, { holders: CatalogueHolder[]; scheduled: CatalogueHolder[] }>();

  for (const row of rows) {
    let seat = seen.get(row.role_id);

    if (!seat) {
      const holders: CatalogueHolder[] = [];
      const scheduled: CatalogueHolder[] = [];
      seat = { holders, scheduled };
      seen.set(row.role_id, seat);

      const role: CatalogueRole = {
        id: row.role_id,
        code: row.code,
        label: roleLabel(row.code),
        scope: row.scope,
        admitsMultipleHolders: !row.is_constitutional_office && !row.is_single_holder_seat,
        holders,
        scheduled,
        vacant: true, // recomputed below once the whole result is in
        cycleMissing: row.cycle_id === null,
        assignable: writable[row.scope],
      };

      const group = groups.find((candidate) => candidate.code === row.group_code);
      if (group) group.roles.push(role);
      else groups.push({ code: row.group_code, label: row.group_label, roles: [role] });
    }

    if (row.assignment_id !== null && row.person_id !== null) {
      const entry = toCatalogueHolder(row);
      (entry.scheduled ? seat.scheduled : seat.holders).push(entry);
    }
  }

  return groups.map((group) => ({
    code: group.code,
    label: group.label,
    roles: group.roles.map((role) => ({ ...role, vacant: role.holders.length === 0 })),
  }));
}

function toCatalogueHolder(row: CatalogueRow): CatalogueHolder {
  const state = accountStateOf(row);

  return {
    roleAssignmentId: row.assignment_id as string,
    personId: row.person_id as string,
    displayName: row.display_name ?? UNNAMED_PERSON,
    effectiveFrom: row.effective_from as string,
    effectiveTo: row.effective_to,
    scheduled: row.scheduled === true,
    operatorAccountId: row.operator_account_id,
    operatorState: state,
    accessDeactivated: state === "deactivated",
  };
}

/** One seat an operator holds, or is about to. */
export interface DirectoryRole {
  readonly roleAssignmentId: string;
  readonly roleId: string;
  readonly code: string;
  readonly label: string;
  readonly groupCode: string; // the catalogue group this seat sits in — what the sections are built from
  readonly groupLabel: string;
  readonly groupSortOrder: number; // the catalogue's own order, so a screen never re-derives it
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean; // recorded, but not in force until its start date
}

/** One operator account, as the Operators index and its detail page read it. */
export interface DirectoryOperator {
  readonly operatorAccountId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly loginEmail: string | null;
  readonly state: OperatorAccountState;
  readonly invitedAt: Date | null;
  readonly activatedAt: Date | null;
  readonly deliveryFailedAt: Date | null;
  readonly deliveryFailureReason: string | null; // LAN131-A5: stored since WP-invitation but never rendered until now (see relocations.md)
  readonly emailRehomePendingAt: Date | null;
  readonly roles: readonly DirectoryRole[]; // every seat not yet ended, in catalogue order; empty is legitimate
}

export interface OperatorDirectory {
  readonly operators: readonly DirectoryOperator[];
  readonly committeeYear: AdministrationOperatingYear | null; // null during a gap between committee years
}

interface DirectoryOperatorRow {
  id: string;
  person_id: string;
  display_name: string | null;
  login_email: string | null;
  is_active: boolean;
  invited_at: Date | null;
  activated_at: Date | null;
  invitation_delivery_failed_at: Date | null;
  invitation_delivery_failure_reason: string | null;
  email_rehome_pending_at: Date | null;
}

interface DirectoryRoleRow {
  assignment_id: string;
  person_id: string;
  role_id: string;
  code: string;
  group_code: string;
  group_label: string;
  group_sort_order: number;
  effective_from: string;
  effective_to: string | null;
  scheduled: boolean;
}

// **Every** operator account, including one whose seats have all ended — invisible on this page is
// unfixable. Seats are "not yet ended", not "in force today" (matches includeScheduled: true) — an
// invitation for a handover seat is ordinary here; see relocations.md.
export async function readOperatorDirectory(
  operator: ResolvedOperator | null,
  options: { operatorAccountId?: string } = {},
): Promise<OperatorDirectory> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const committeeYear = await resolveCommitteeYearForReading(tx);

    const wanted = options.operatorAccountId ?? null; // one account or all, through the same query — see relocations.md

    const accounts = await tx.query<DirectoryOperatorRow>(
      `select oa.id,
              oa.person_id,
              ${personDisplayNameSql("p")} as display_name,
              oa.login_email,
              oa.is_active,
              oa.invited_at,
              oa.activated_at,
              oa.invitation_delivery_failed_at,
              oa.invitation_delivery_failure_reason,
              oa.email_rehome_pending_at
         from public.operator_accounts oa
         join public.people p on p.id = oa.person_id
        where $1::uuid is null or oa.id = $1::uuid
        order by display_name, oa.id`,
      [wanted],
    );

    if (accounts.rows.length === 0) return { operators: [], committeeYear };

    const roles = await tx.query<DirectoryRoleRow>(
      `select ra.id       as assignment_id,
              ra.person_id,
              r.id        as role_id,
              r.code,
              rg.code     as group_code,
              rg.label    as group_label,
              rg.sort_order as group_sort_order,
              ra.effective_from::text as effective_from,
              ra.effective_to::text   as effective_to,
              (ra.effective_from > current_date) as scheduled
         from public.role_assignments ra
         join public.roles r on r.id = ra.role_id
         join public.role_groups rg on rg.id = r.role_group_id
        where ra.person_id = any($1::uuid[])
          and (ra.effective_to is null or ra.effective_to > current_date)
        order by rg.sort_order, r.sort_order, ra.effective_from`,
      [accounts.rows.map((row) => row.person_id)],
    );

    const byPerson = new Map<string, DirectoryRole[]>();
    for (const row of roles.rows) {
      const held = byPerson.get(row.person_id) ?? [];
      held.push({
        roleAssignmentId: row.assignment_id,
        roleId: row.role_id,
        code: row.code,
        label: roleLabel(row.code),
        groupCode: row.group_code,
        groupLabel: row.group_label,
        groupSortOrder: row.group_sort_order,
        effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to,
        scheduled: row.scheduled,
      });
      byPerson.set(row.person_id, held);
    }

    return {
      committeeYear,
      operators: accounts.rows.map((row) => ({
        operatorAccountId: row.id,
        personId: row.person_id,
        displayName: row.display_name ?? UNNAMED_PERSON,
        loginEmail: row.login_email,
        state: deriveOperatorAccountState({
          isActive: row.is_active,
          activatedAt: row.activated_at,
          invitationDeliveryFailedAt: row.invitation_delivery_failed_at,
          emailChangePending: row.email_rehome_pending_at !== null,
        }),
        invitedAt: row.invited_at,
        activatedAt: row.activated_at,
        deliveryFailedAt: row.invitation_delivery_failed_at,
        deliveryFailureReason: row.invitation_delivery_failure_reason,
        emailRehomePendingAt: row.email_rehome_pending_at,
        roles: byPerson.get(row.person_id) ?? [],
      })),
    };
  });
}

// null covers both "no such account" and "not an identifier at all", deliberately — a route
// parameter from a URL must not confirm which ids exist. Capability asserted before either answer.
export async function readOperatorRecord(
  operator: ResolvedOperator | null,
  operatorAccountId: string,
): Promise<DirectoryOperator | null> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);
  if (!UUID.test(operatorAccountId)) return null;

  const directory = await readOperatorDirectory(operator, { operatorAccountId });
  return directory.operators[0] ?? null;
}

/** The current season's player membership of one Person. */
export interface PlayerMembershipSummary {
  readonly membershipId: string;
  readonly seasonLabel: string;
  readonly status: string; // the stored membership_status; the screen turns it into the club's word
}

// DEC-one-person-multiple-capacities: a player who becomes an officer/coach reuses the same
// durable Person, at most one login. null is a real answer (REQ-coach-operator-onboarding: an
// external coach may have none), not an omission.
export async function readPlayerMembership(
  operator: ResolvedOperator | null,
  personId: string,
): Promise<PlayerMembershipSummary | null> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const season = await resolveSeasonForReading(tx);
    if (!season) return null;

    const result = await tx.query<{ id: string; status: string; label: string }>(
      `select sm.id, sm.status::text as status, s.label
         from public.season_memberships sm
         join public.seasons s on s.id = sm.season_id
        where sm.person_id = $1 and sm.season_id = $2`,
      [personId, season.year.id],
    );

    if (result.rows.length === 0) return null;
    return {
      membershipId: result.rows[0].id,
      seasonLabel: result.rows[0].label,
      status: result.rows[0].status,
    };
  });
}

const ADMINISTRATION_CAPABILITY = "role_management" as const;

const UNNAMED_PERSON = "Unnamed person";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i; // checked before ::uuid so a mistyped route answers "no such record", not a database error

function requireOperator(operator: ResolvedOperator | null): ResolvedOperator {
  if (!operator) {
    throw new NotPermitted("You do not have access to this action. Sign in first.", {
      rule: "operator_required",
    });
  }
  return operator;
}

function accountStateOf(row: {
  operator_account_id: string | null;
  operator_is_active: boolean | null;
  operator_activated_at: Date | null;
  operator_delivery_failed_at: Date | null;
  operator_rehome_pending_at: Date | null;
}): OperatorAccountState | null {
  if (row.operator_account_id === null) return null;
  return deriveOperatorAccountState({
    isActive: row.operator_is_active === true,
    activatedAt: row.operator_activated_at,
    invitationDeliveryFailedAt: row.operator_delivery_failed_at,
    emailChangePending: row.operator_rehome_pending_at !== null,
  });
}
