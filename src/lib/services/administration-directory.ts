import "server-only";

import { roleLabel } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { NotFound, NotPermitted, withTransaction, type Tx } from "@/lib/db";
import type { AdministrationOperatingYear } from "./administration-events";
import { deriveOperatorAccountState, type OperatorAccountState } from "./operator-account-state";
import { resolveActiveCommitteeYear, resolveActiveSeason } from "./operator-invitations";
import { personDisplayNameSql } from "./sql-text";

/**
 * The plural reads Administration opens on — LAN-133, `WP-surfaces`.
 *
 * `WP-invitation` and `WP-assignment` between them answer every question about
 * **one** operator and **one** role. Neither answers the question the two index
 * screens ask, which is the plural one: who are the club's operators, and who
 * holds each of the twenty seats. `readRoleHolders()` does the singular half
 * and calling it twenty times to draw one page would be twenty transactions and
 * twenty cycle resolutions for one list.
 *
 * So this module is three queries, and it adds no rule. Every fact it derives is
 * derived by an existing function — the account state by
 * {@link deriveOperatorAccountState}, the seat's name by {@link roleLabel}, the
 * cycle overlap by the same `daterange` expression `readRoleHolders()` explains
 * at length. Where the two disagree it is a defect here, and
 * `administration-directory.test.ts` runs both against the same data for
 * exactly that reason.
 *
 * ## Both list reads are guarded, at the capability floor
 *
 * `role_management`, the same floor `readRoleHolders()` and
 * `findOperatorCandidates()` use, for the reason given there: a list has no
 * target, so the target-aware guard has nothing to be asked about — but the
 * list itself is the club's officers with their access states attached, which
 * is not ordinary operator reading. Every **write** the screens offer still asks
 * the target-aware question inside the service that performs it, and nothing
 * here decides what may be offered.
 *
 * ## Why the grouping comes out of the database
 *
 * `REQ-static-role-catalogue` puts the three groups and their order in
 * `public.role_groups`, which the catalogue migration writes. Reading them here
 * rather than listing them in TypeScript is not only tidiness:
 * `tests/capability-map-single-source.test.ts` forbids naming a `roles.code`
 * anywhere in `src/` outside the capability map, and a hand-written grouping
 * would have had to name twenty of them.
 */

// ---------------------------------------------------------------------------
// The role catalogue, grouped, with this operating year's holders
// ---------------------------------------------------------------------------

/** One holder of a seat, as the Roles index and role detail show them. */
export interface CatalogueHolder {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** Recorded, but not in force until its start date. */
  readonly scheduled: boolean;
  readonly operatorAccountId: string | null;
  /** `null` when this Person has no operator login at all. */
  readonly operatorState: OperatorAccountState | null;
  /**
   * `REQ-deactivate-and-reinstate`: the holder keeps the seat and role detail
   * "shows that the current holder's operator access is deactivated" rather
   * than a vacancy. Decided here so no screen decides it differently.
   */
  readonly accessDeactivated: boolean;
}

/** One seat in the catalogue, with the holders this operating year has. */
export interface CatalogueRole {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly scope: "committee_year" | "season";
  readonly admitsMultipleHolders: boolean;
  readonly holders: readonly CatalogueHolder[];
  /** Nobody holds this seat this year — the **Not assigned** state. */
  readonly vacant: boolean;
  /**
   * True when the operating year this seat hangs off does not exist yet, so
   * "Not assigned" would be a claim rather than a fact. Coaching seats hang off
   * the season, and a club between seasons has none.
   */
  readonly cycleMissing: boolean;
}

/** One approved group, in the catalogue's own order. */
export interface CatalogueGroup {
  readonly code: string;
  readonly label: string;
  readonly roles: readonly CatalogueRole[];
}

export interface RoleCatalogue {
  readonly groups: readonly CatalogueGroup[];
  readonly committeeYear: AdministrationOperatingYear;
  /** `null` only when the club has no season under way. */
  readonly season: AdministrationOperatingYear | null;
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

/**
 * The whole catalogue, grouped, with the holders of each seat **today**.
 *
 * ## Why this asks about today rather than about the cycle
 *
 * It used to join every assignment whose period *overlapped the active cycle*,
 * and that is a different question from the one `REQ-admin-surfaces` asks. The
 * page says "current holders", and an assignment can overlap this year's
 * committee term without being in force this morning. Brian found all three
 * faces of that in one review:
 *
 *   * A Vice-President ended **today** still appeared as the current holder.
 *     The period `[10 Jun 2026, 20 Aug 2026)` overlaps the committee year, so
 *     the old join kept it — but the range is half-open, and an assignment
 *     whose `effective_to` is today is already over.
 *   * A Head Coach ended with a **future** date showed the seat as
 *     `Not assigned`. His appointment `[20 Aug, 27 Aug)` sits *before* the
 *     active season opens on 27 Sep, so it overlapped no cycle at all and was
 *     dropped — even though he holds the seat today.
 *   * Successors who have not started appeared as holders, tagged
 *     "not started yet", which the top level is not supposed to list at all.
 *
 * One predicate caused all three, and one predicate answers all three: the
 * same half-open currency test the schema's own exclusion constraint uses —
 * `effective_from <= today` and `effective_to` either absent or still in the
 * future. `readRoleHolders()` carried the identical cycle-overlap defect and
 * was corrected with it; the agreement test between the two readers is what
 * caught that, and is why it exists.
 *
 * "Holders from different years are never mixed" (`REQ-explicit-cycle-assignment`)
 * survives this, and is better served by it: everyone listed holds the seat on
 * the same day, so there is only one year in the answer by construction. The
 * cycle is still read, because `cycleMissing` — "no season under way" — is a
 * genuinely different state from a vacancy and still has to be told apart from
 * one.
 *
 * `scheduled` is now always false here and is deliberately kept: it is the
 * seam a future decision to surface an incoming holder on the index would use,
 * and re-deriving it later would mean re-deriving this predicate too.
 */
export async function readRoleCatalogue(operator: ResolvedOperator | null): Promise<RoleCatalogue> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const committeeYear = await resolveActiveCommitteeYear(tx);
    const season = await activeSeasonOrNull(tx);

    const result = await tx.query<CatalogueRow>(
      `with cycles as (
         select 'committee_year'::public.role_scope as scope,
                cy.id, cy.starts_on, cy.ends_on
           from public.committee_years cy
          where cy.id = $1
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
               and ra.effective_from <= current_date
               and (ra.effective_to is null or ra.effective_to > current_date)
         left join public.people p on p.id = ra.person_id
         left join public.operator_accounts oa on oa.person_id = ra.person_id
        order by rg.sort_order, r.sort_order, ra.effective_from, ra.id`,
      [committeeYear.id, season?.id ?? null],
    );

    return { groups: groupCatalogue(result.rows), committeeYear, season };
  });
}

/**
 * Rows to groups. One row per seat with no holder, one row per holder
 * otherwise — a `left join`, so a vacant seat is present and empty rather than
 * absent.
 */
function groupCatalogue(rows: readonly CatalogueRow[]): CatalogueGroup[] {
  const groups: { code: string; label: string; roles: CatalogueRole[] }[] = [];
  const seen = new Map<string, CatalogueHolder[]>();

  for (const row of rows) {
    let holders = seen.get(row.role_id);

    if (!holders) {
      holders = [];
      seen.set(row.role_id, holders);

      const role: CatalogueRole = {
        id: row.role_id,
        code: row.code,
        label: roleLabel(row.code),
        scope: row.scope,
        admitsMultipleHolders: !row.is_constitutional_office && !row.is_single_holder_seat,
        holders,
        // Recomputed below, once the whole result is in: a seat with no holder
        // arrives as one row with null assignment columns, which is
        // indistinguishable from "not read yet" while the rows are streaming.
        vacant: true,
        cycleMissing: row.cycle_id === null,
      };

      const group = groups.find((candidate) => candidate.code === row.group_code);
      if (group) group.roles.push(role);
      else groups.push({ code: row.group_code, label: row.group_label, roles: [role] });
    }

    if (row.assignment_id !== null && row.person_id !== null) {
      holders.push(toCatalogueHolder(row));
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

// ---------------------------------------------------------------------------
// The operator directory
// ---------------------------------------------------------------------------

/** One seat an operator holds, or is about to. */
export interface DirectoryRole {
  readonly roleAssignmentId: string;
  readonly roleId: string;
  readonly code: string;
  readonly label: string;
  /** The catalogue group this seat sits in — what the sections are built from. */
  readonly groupCode: string;
  readonly groupLabel: string;
  /** The catalogue's own group order, so a screen never re-derives it. */
  readonly groupSortOrder: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  /** Recorded, but not in force until its start date. */
  readonly scheduled: boolean;
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
  /**
   * Why the last invitation could not be delivered, in the transport's own
   * words — LAN131-A5. The column has been written since `WP-invitation` and
   * nothing rendered it, which meant the one sentence telling an administrator
   * how to recover an abandoned invitation was stored and shown to nobody.
   */
  readonly deliveryFailureReason: string | null;
  readonly emailRehomePendingAt: Date | null;
  /** Every seat not yet ended, in catalogue order. Empty is legitimate. */
  readonly roles: readonly DirectoryRole[];
}

export interface OperatorDirectory {
  readonly operators: readonly DirectoryOperator[];
  readonly committeeYear: AdministrationOperatingYear;
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

/**
 * Every operator account the club holds, with the seats each one carries.
 *
 * **Every** account, including one whose seats have all ended: an account that
 * can still sign in and is absent from the only page listing accounts is
 * exactly the thing an administrator cannot fix because they cannot see it. The
 * screen decides which section such an operator falls in; this decides only
 * that they are in the list.
 *
 * Seats are "not yet ended" rather than "in force today", which is the same
 * widening `readAdministrationSubject({ includeScheduled: true })` makes and for
 * a related reason: an invitation sent for a seat beginning at a handover is an
 * ordinary case for this screen, and an operator listed with no role at all
 * until the handover date would read as an account nobody meant to create. Each
 * seat says whether it has started, so the surface never implies otherwise.
 */
export async function readOperatorDirectory(
  operator: ResolvedOperator | null,
  options: { operatorAccountId?: string } = {},
): Promise<OperatorDirectory> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const committeeYear = await resolveActiveCommitteeYear(tx);

    // One account or all of them, through the same query. A separate
    // single-account read would be a second copy of the state derivation and
    // the seat filter, and the two would eventually disagree about the account
    // one screen links to from the other.
    const wanted = options.operatorAccountId ?? null;

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

/**
 * One operator account, derived exactly as the list derives it, or `null`.
 *
 * `null` covers both "no such account" and "that is not an identifier at all",
 * and deliberately does not distinguish them: the route parameter comes from a
 * URL, and a surface that answered differently for a well-formed unknown id
 * would confirm which ids exist. The capability is asserted before either
 * answer, so an unauthorized caller learns nothing from the shape of the
 * refusal.
 */
export async function readOperatorRecord(
  operator: ResolvedOperator | null,
  operatorAccountId: string,
): Promise<DirectoryOperator | null> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);
  if (!UUID.test(operatorAccountId)) return null;

  const directory = await readOperatorDirectory(operator, { operatorAccountId });
  return directory.operators[0] ?? null;
}

// ---------------------------------------------------------------------------
// One person's other capacities
// ---------------------------------------------------------------------------

/** The current season's player membership of one Person. */
export interface PlayerMembershipSummary {
  readonly membershipId: string;
  readonly seasonLabel: string;
  /** The stored `membership_status`. The screen turns it into the club's word. */
  readonly status: string;
}

/**
 * Whether this Person is also a player this season, or `null`.
 *
 * `DEC-one-person-multiple-capacities` is why operator detail says this at all:
 * "a player who becomes an officer or coach reuses the same durable Person and
 * at most one operator login", and the page showing somebody's seats is the page
 * where a reader would otherwise assume the club holds two records for them.
 * `REQ-coach-operator-onboarding` needs the negative just as much — "an external
 * coach may have none" — which is why `null` is an answer rather than an
 * omission.
 */
export async function readPlayerMembership(
  operator: ResolvedOperator | null,
  personId: string,
): Promise<PlayerMembershipSummary | null> {
  assertCapability(requireOperator(operator), ADMINISTRATION_CAPABILITY);

  return withTransaction(async (tx) => {
    const season = await activeSeasonOrNull(tx);
    if (!season) return null;

    const result = await tx.query<{ id: string; status: string; label: string }>(
      `select sm.id, sm.status::text as status, s.label
         from public.season_memberships sm
         join public.seasons s on s.id = sm.season_id
        where sm.person_id = $1 and sm.season_id = $2`,
      [personId, season.id],
    );

    if (result.rows.length === 0) return null;
    return {
      membershipId: result.rows[0].id,
      seasonLabel: result.rows[0].label,
      status: result.rows[0].status,
    };
  });
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------

/** The capability floor. See the module note for why it is the floor here. */
const ADMINISTRATION_CAPABILITY = "role_management" as const;

/** What a Person row with no name at all is called. Never blank on screen. */
const UNNAMED_PERSON = "Unnamed person";

/**
 * A shape check, so a route parameter never reaches `::uuid` as a cast that
 * fails. PostgreSQL raises on a malformed uuid literal, and a page whose URL
 * was mistyped would answer with an unhandled database error rather than with
 * "no such record".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The same refusal `operator-administration.ts` gives an absent operator. */
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

/**
 * The season coaching seats hang off, or `null` when the club is between them.
 *
 * `resolveActiveSeason()` refuses, correctly, for the write it was built for: a
 * coaching appointment with no season to hang off cannot be recorded. A
 * *reading* screen must not inherit that refusal, or the Roles page goes blank
 * for all twenty seats because the club has not opened next season yet — and
 * the ten committee seats have nothing to do with the season at all.
 */
async function activeSeasonOrNull(tx: Tx): Promise<AdministrationOperatingYear | null> {
  try {
    return await resolveActiveSeason(tx);
  } catch (error) {
    if (error instanceof NotFound) return null;
    throw error;
  }
}
