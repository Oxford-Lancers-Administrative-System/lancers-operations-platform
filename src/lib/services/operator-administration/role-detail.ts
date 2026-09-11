import { roleLabel } from "@/lib/auth/capabilities";
import { assertCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { withTransaction } from "@/lib/db";
import type { AdministrationOperatingYear } from "../administration-events";
import { deriveOperatorAccountState, type OperatorAccountState } from "../operator-account-state";
import {
  resolveActiveCommitteeYear,
  resolveCycleFor,
  resolveSeasonForReading,
} from "../operator-invitations";
import { personDisplayNameSql } from "../sql-text";
import { ADMINISTRATION_CAPABILITY, requireCycle, requireOperator, requireRole } from "./shared";

/**
 * Role detail — {@link readRoleHolders} answers who holds one seat, in one
 * operating year. Guarded at the capability floor, not the target-aware
 * guard — a holder list has no target. Holders from different years are
 * never mixed: a currency test against one day (`AS_AT`), not a period
 * overlap against the cycle (LAN-141 finding 4).
 */

interface RoleHolder {
  readonly roleAssignmentId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly scheduled: boolean;
  readonly endScheduled: boolean;
  readonly ended: boolean;
  readonly operatorAccountId: string | null;
  readonly operatorState: OperatorAccountState | null;
  /** Role detail shows this rather than a vacancy — `REQ-deactivate-and-reinstate`. */
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
  /** Recorded to begin later; never holders, never counted towards `vacant`. */
  readonly scheduled: readonly RoleHolder[];
  readonly vacant: boolean;
  readonly readOnly: boolean;
}

/** The day a seat's holders are read as at: today while the cycle runs, else the cycle's last day. */
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
    // The reading resolvers — see decision history (LAN-141 finding 4).
    const active =
      role.scope === "committee_year"
        ? await resolveActiveCommitteeYear(tx)
        : ((await resolveSeasonForReading(tx))?.year ??
          (await resolveCycleFor(tx, "season", await resolveActiveCommitteeYear(tx)))
            .operatingYear);

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
          and (ra.effective_to is null or ra.effective_to > ${AS_AT})
        order by ra.effective_from, ra.id`,
      [role.id, cycle.id],
    );

    const all = result.rows.map(toHolder);
    const holders = all.filter((holder) => !holder.scheduled);
    const scheduled = all.filter((holder) => holder.scheduled);

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
      scheduled,
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
