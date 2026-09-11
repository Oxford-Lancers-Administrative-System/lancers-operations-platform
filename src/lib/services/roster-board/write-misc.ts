import "server-only";

import { NotFound, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import type { BluesValue, BpsValue, FormalwearItemKey } from "./read";
import {
  actorRequirement,
  closeCurrentRow,
  currentDateOf,
  BOARD_ELIGIBILITY_COMPETITION,
} from "./shared";

/**
 * The roster board's remaining columns — coach group, formalwear, Blues, BPS,
 * eligibility, availability, entry. LAN-186 / LAN-217, invariants S4/A1.
 * Decision history: docs/ux/tickets/LAN-186-roster-board.md
 */

/** One row per membership. Storage only — Mission 9 owns what the value means. */
export async function commitCoachGroup(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  coachGroup: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ coach_group: string }>(
      `select coach_group from public.coach_group_assignments where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before = existing.rows[0]?.coach_group ?? null;
    if (before === params.coachGroup) return;

    if (params.coachGroup === null) {
      await tx.query(
        `delete from public.coach_group_assignments where season_membership_id = $1::uuid`,
        [params.membershipId],
      );
    } else {
      await tx.query(
        `insert into public.coach_group_assignments
           (season_membership_id, season_id, coach_group, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3, $4::uuid)
         on conflict (season_membership_id)
         do update set coach_group = excluded.coach_group, updated_at = now()`,
        [params.membershipId, params.seasonId, params.coachGroup, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "coach_group_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.coachGroup,
      context: { issue: "LAN-186" },
    });
  });
}

/** One formalwear item, ticked or unticked. The fact is free text (`"Yes (paid)"` is real); unticking writes `"No"`, re-ticking writes plain `"Yes"`. */
export async function commitFormalwearItem(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  item: FormalwearItemKey;
  owned: boolean;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ ownership: string }>(
      `select ownership from public.formalwear_records
        where season_membership_id = $1::uuid and item = $2::public.formalwear_item`,
      [params.membershipId, params.item],
    );
    const before = existing.rows[0]?.ownership ?? null;
    const next = params.owned ? "Yes" : "No";
    if (before === next) return;

    await tx.query(
      `insert into public.formalwear_records
         (season_membership_id, season_id, item, ownership, recorded_by_person_id)
       values ($1::uuid, $2::uuid, $3::public.formalwear_item, $4, $5::uuid)
       on conflict (season_membership_id, item)
       do update set ownership = excluded.ownership, updated_at = now()`,
      [params.membershipId, params.seasonId, params.item, next, params.actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "formalwear_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: next,
      context: { issue: "LAN-186", item: params.item },
    });
  });
}

export async function commitBlues(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  value: BluesValue;
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const half = params.value === "Half";
  const full = params.value === "Full";

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ half_blue_awarded: boolean; full_blue_awarded: boolean }>(
      `select half_blue_awarded, full_blue_awarded from public.blues_awards
        where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before: BluesValue = existing.rows[0]
      ? existing.rows[0].full_blue_awarded
        ? "Full"
        : existing.rows[0].half_blue_awarded
          ? "Half"
          : "None"
      : "None";
    if (before === params.value) return;

    await tx.query(
      `insert into public.blues_awards
         (season_membership_id, season_id, half_blue_awarded, full_blue_awarded, awarded_on,
          recorded_by_person_id)
       values ($1::uuid, $2::uuid, $3, $4, case when $3 or $4 then current_date else null end, $5::uuid)
       on conflict (season_membership_id)
       do update set
         half_blue_awarded = excluded.half_blue_awarded,
         full_blue_awarded = excluded.full_blue_awarded,
         awarded_on = case
           when excluded.half_blue_awarded or excluded.full_blue_awarded
             then coalesce(public.blues_awards.awarded_on, current_date)
           else null
         end,
         updated_at = now()`,
      [params.membershipId, params.seasonId, half, full, params.actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "blues_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.value,
      context: { issue: "LAN-186" },
    });
  });
}

/** BPS — a plain yes/no roster attribute (LAN-217), a coaching selection never chased or gating anything. `commitBlues`'s own shape, one boolean. */
export async function commitBps(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  value: BpsValue;
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const isSelected = params.value === "Yes";

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ is_selected: boolean }>(
      `select is_selected from public.bps_selections
        where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before: BpsValue = existing.rows[0]?.is_selected ? "Yes" : "No";
    if (before === params.value) return;

    await tx.query(
      `insert into public.bps_selections
         (season_membership_id, season_id, is_selected, recorded_by_person_id)
       values ($1::uuid, $2::uuid, $3, $4::uuid)
       on conflict (season_membership_id)
       do update set is_selected = excluded.is_selected, updated_at = now()`,
      [params.membershipId, params.seasonId, isSelected, params.actorPersonId],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "bps_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.value,
      context: { issue: "LAN-217" },
    });
  });
}

export type EligibilityStatus = "pending" | "eligible" | "ineligible" | "expired";

/** Eligibility for the `club_play` competition — the one every player needs regardless of representative-side qualification. */
export async function commitEligibility(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  status: EligibilityStatus;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const today = await currentDateOf(tx);
    const current = await tx.query<{ id: string; status: string; effective_from: string }>(
      `select id, status::text as status, to_char(effective_from, 'YYYY-MM-DD') as effective_from
         from public.eligibility_records
        where season_membership_id = $1::uuid and competition = $2::public.competition_scope
          and effective_to is null
        for update`,
      [params.membershipId, BOARD_ELIGIBILITY_COMPETITION],
    );
    const before = current.rows[0]?.status ?? null;
    if (before === params.status) return;

    if (current.rows[0]) {
      await closeCurrentRow(
        tx,
        "eligibility_records",
        current.rows[0].id,
        current.rows[0].effective_from,
        today,
      );
    }

    await tx.query(
      `insert into public.eligibility_records
         (season_membership_id, season_id, competition, status, determining_authority,
          checked_at, effective_from)
       values ($1::uuid, $2::uuid, $3::public.competition_scope, $4::public.eligibility_status,
               $5, now(), $6::date)`,
      [
        params.membershipId,
        params.seasonId,
        BOARD_ELIGIBILITY_COMPETITION,
        params.status,
        "Operator (roster board)",
        today,
      ],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "eligibility_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.status,
      context: { issue: "LAN-186", competition: BOARD_ELIGIBILITY_COMPETITION },
    });
  });
}

export type AvailabilityLevel = "green" | "orange" | "red";

/**
 * A new current availability status, append-only (invariant A1), never an
 * update. The acting operator is the confirmer for Green
 * (`availability_statuses_green_records_its_confirmer`). `effectiveFrom`
 * defaults to today; LAN-215 B-008 passes it explicitly for a joining date
 * that is not today.
 */
export async function commitAvailability(params: {
  actorPersonId: string;
  membershipId: string;
  level: AvailabilityLevel;
  effectiveFrom?: string;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const effectiveFrom = params.effectiveFrom ?? (await currentDateOf(tx));
    const current = await tx.query<{ level: string }>(
      `select level::text as level from public.current_availability where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const before = current.rows[0]?.level ?? null;
    if (before === params.level) return;

    await tx.query(
      `insert into public.availability_statuses
         (season_membership_id, level, effective_from, reported_by_person_id, confirmed_by_person_id)
       values ($1::uuid, $2::public.availability_level, $3::date, $4::uuid, $5::uuid)`,
      [
        params.membershipId,
        params.level,
        effectiveFrom,
        params.actorPersonId,
        params.level === "green" ? params.actorPersonId : null,
      ],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "availability_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.level,
      context: { issue: "LAN-186" },
    });
  });
}

/** `season_memberships.entry` — new or returning. A plain field, no effective dating unlike `status`. */
export async function commitEntry(params: {
  actorPersonId: string;
  membershipId: string;
  entry: "new" | "returning";
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  return withTransaction(async (tx) => {
    const current = await tx.query<{ entry: string }>(
      `select entry::text as entry from public.season_memberships where id = $1::uuid for update`,
      [params.membershipId],
    );
    if (!current.rows[0]) {
      throw new NotFound("That membership no longer exists.", {
        rule: "season_memberships_not_found",
      });
    }
    const before = current.rows[0].entry;
    if (before === params.entry) return;

    await tx.query(
      `update public.season_memberships set entry = $2::public.membership_entry, updated_at = now()
        where id = $1::uuid`,
      [params.membershipId, params.entry],
    );

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "membership_entry_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.entry,
      context: { issue: "LAN-186" },
    });
  });
}
