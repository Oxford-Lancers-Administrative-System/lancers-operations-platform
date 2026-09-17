import "server-only";

import { ConstraintViolated, NotFound, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import type { BluesValue, BpsValue } from "./read";
import {
  COACHING_GROUP_VALUES,
  DEFENSIVE_POSITION_GROUP_VALUES,
  FORMALWEAR_ITEM_KEYS,
  OFFENSIVE_POSITION_GROUP_VALUES,
  type FormalwearItemKey,
} from "./vocabulary";
import {
  actorRequirement,
  closeCurrentRow,
  currentDateOf,
  BOARD_ELIGIBILITY_COMPETITION,
} from "./shared";

/**
 * The roster board's remaining columns — coach group, formalwear, Blues, BPS,
 * eligibility, availability, entry. LAN-186 / LAN-217, invariants S4/A1.
 */

/**
 * The coaching groups a player trains with — the whole selection, replaced
 * (LAN-387). Uncapped: Stewart's sheet has players in two of the three, and
 * nothing in the club's practice caps it. An empty list is a real answer and
 * leaves no row.
 */
export async function commitCoachingGroups(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  groups: readonly string[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const wanted = normaliseSelection(params.groups, COACHING_GROUP_VALUES, "coaching group");

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ coach_group: string }>(
      `select coach_group from public.coach_group_assignments
        where season_membership_id = $1::uuid order by coach_group`,
      [params.membershipId],
    );
    const before = existing.rows.map((row) => row.coach_group);
    if (sameSelection(before, wanted)) return;

    await tx.query(
      `delete from public.coach_group_assignments
        where season_membership_id = $1::uuid and coach_group <> all($2::text[])`,
      [params.membershipId, wanted],
    );
    for (const group of wanted) {
      await tx.query(
        `insert into public.coach_group_assignments
           (season_membership_id, season_id, coach_group, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3, $4::uuid)
         on conflict (season_membership_id, coach_group) do nothing`,
        [params.membershipId, params.seasonId, group, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "coach_group_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before.join(", ") || null,
      toState: wanted.join(", ") || null,
      context: { issue: "LAN-387" },
    });
  });
}

export type PositionGroupSide = "offence" | "defence";

/** One side's position groups — the whole selection, replaced. Same rule as the coaching group: several, uncapped, blank is no row. */
export async function commitPositionGroups(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  side: PositionGroupSide;
  groups: readonly string[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const vocabulary =
    params.side === "offence" ? OFFENSIVE_POSITION_GROUP_VALUES : DEFENSIVE_POSITION_GROUP_VALUES;
  const wanted = normaliseSelection(params.groups, vocabulary, `${params.side} position group`);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ position_group: string }>(
      `select position_group from public.membership_position_groups
        where season_membership_id = $1::uuid and side = $2::public.position_side
        order by position_group`,
      [params.membershipId, params.side],
    );
    const before = existing.rows.map((row) => row.position_group);
    if (sameSelection(before, wanted)) return;

    await tx.query(
      `delete from public.membership_position_groups
        where season_membership_id = $1::uuid and side = $2::public.position_side
          and position_group <> all($3::text[])`,
      [params.membershipId, params.side, wanted],
    );
    for (const group of wanted) {
      await tx.query(
        `insert into public.membership_position_groups
           (season_membership_id, season_id, side, position_group, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::public.position_side, $4, $5::uuid)
         on conflict (season_membership_id, side, position_group) do nothing`,
        [params.membershipId, params.seasonId, params.side, group, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "position_group_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before.join(", ") || null,
      toState: wanted.join(", ") || null,
      context: { issue: "LAN-387", side: params.side },
    });
  });
}

/** Sorted, de-duplicated and proved against the column's own vocabulary before anything is written. */
function normaliseSelection(
  chosen: readonly string[],
  vocabulary: readonly string[],
  what: string,
): string[] {
  const unique = [...new Set(chosen)];
  for (const value of unique) {
    if (!vocabulary.includes(value)) {
      throw new ConstraintViolated(`"${value}" is not a ${what}.`, {
        rule: "membership_group_in_vocabulary",
      });
    }
  }
  return unique.sort((left, right) => left.localeCompare(right, "en-GB"));
}

function sameSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * The formalwear a player holds — the whole selection, replaced (LAN-387;
 * Tie and Bow tie only, the Kit group's own two). The stored fact is free text
 * (`"Yes (paid)"` is real), so only the items whose answer actually changed
 * are written: an untouched `"Yes (paid)"` is never flattened to `"Yes"` by a
 * toggle of the other item.
 */
export async function commitFormalwearItems(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  items: readonly FormalwearItemKey[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);
  const wanted = new Set(params.items);

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ item: string; ownership: string }>(
      `select item::text as item, ownership from public.formalwear_records
        where season_membership_id = $1::uuid`,
      [params.membershipId],
    );
    const ownershipByItem = new Map(existing.rows.map((row) => [row.item, row.ownership]));
    const before = FORMALWEAR_ITEM_KEYS.filter(
      (item) => (ownershipByItem.get(item) ?? "No") !== "No",
    );
    const after = FORMALWEAR_ITEM_KEYS.filter((item) => wanted.has(item));
    if (sameSelection(before, after)) return;

    for (const item of FORMALWEAR_ITEM_KEYS) {
      const owned = wanted.has(item);
      const current = ownershipByItem.get(item) ?? null;
      const ownedNow = current !== null && current !== "No";
      if (current !== null && ownedNow === owned) continue;
      await tx.query(
        `insert into public.formalwear_records
           (season_membership_id, season_id, item, ownership, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::public.formalwear_item, $4, $5::uuid)
         on conflict (season_membership_id, item)
         do update set ownership = excluded.ownership, updated_at = now()`,
        [params.membershipId, params.seasonId, item, owned ? "Yes" : "No", params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "formalwear_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before.join(", ") || null,
      toState: after.join(", ") || null,
      context: { issue: "LAN-387" },
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
