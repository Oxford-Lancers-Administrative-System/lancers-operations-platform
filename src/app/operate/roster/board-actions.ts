"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachingGroups,
  commitEligibility,
  commitEntry,
  commitFormalwearItems,
  commitJerseyNumbers,
  commitPosition,
  commitPositionGroups,
  commitKitItemValues,
  commitSpecialTeamsAssignment,
  commitWarmupSmallGroup,
  type AvailabilityLevel,
  type BluesValue,
  type BpsValue,
  type EligibilityStatus,
  type FormalwearItemKey,
  type Kit,
  type PositionColumn,
  type PositionGroupSide,
  type KitItemCode,
  type SpecialTeamsSlot,
  type SpecialTeamsSquad,
} from "@/lib/services/roster-board";
import { kitValuesOf } from "@/lib/services/roster-board/vocabulary";
import { resolveOnboardingItem, type OnboardingItemStatus } from "@/lib/services/membership";
import type { BoardActionState } from "./board-action-state";
import { categoryOfPosition } from "@/lib/auth/roster-access";

/**
 * The board's own server actions — LAN-186. Each opens with
 * `requireGrant` on the cell's own roster category at `edit` (LAN-432), so a
 * seat holding the category at `view` or `none` is refused whatever the
 * browser sends; commits with no confirmation, and revalidates the roster
 * path. Status change is deliberately not here — `./actions.ts`'s
 * `setMembershipStatusAction` (Membership at `edit`) owns that column
 * (RVW-186-001).
 */

function refresh(): void {
  revalidatePath("/operate/roster");
}

function stateFor(error: unknown): BoardActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

const OK: BoardActionState = { error: null };

export async function commitPositionAction(params: {
  membershipId: string;
  seasonId: string;
  column: PositionColumn;
  code: string | null;
}): Promise<BoardActionState> {
  // LAN-432: Offensive or Defensive assignments at edit, by the slot written.
  const operator = await requireGrant(
    { kind: "roster", key: categoryOfPosition(params.column) },
    "edit",
  );
  try {
    await commitPosition({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitJerseyNumbersAction(params: {
  membershipId: string;
  seasonId: string;
  kit: Kit;
  numbers: readonly string[];
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
  try {
    await commitJerseyNumbers({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitCoachingGroupsAction(params: {
  membershipId: string;
  seasonId: string;
  groups: readonly string[];
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "coaching" }, "edit");
  try {
    await commitCoachingGroups({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitPositionGroupsAction(params: {
  membershipId: string;
  seasonId: string;
  side: PositionGroupSide;
  groups: readonly string[];
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "coaching" }, "edit");
  try {
    await commitPositionGroups({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitSpecialTeamsAssignmentAction(params: {
  membershipId: string;
  seasonId: string;
  squad: SpecialTeamsSquad;
  slot: SpecialTeamsSlot;
  positionName: string | null;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "special_teams" }, "edit");
  try {
    await commitSpecialTeamsAssignment({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitKitItemAction(params: {
  membershipId: string;
  seasonId: string;
  item: KitItemCode;
  /** One value, a whole set for Braces L / Braces R (LAN-409), or `null` to blank the cell. */
  value: string | readonly string[] | null;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "kit" }, "edit");
  try {
    await commitKitItemValues({
      actorPersonId: operator.personId,
      membershipId: params.membershipId,
      seasonId: params.seasonId,
      item: params.item,
      values: kitValuesOf(params.value),
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitWarmupSmallGroupAction(params: {
  membershipId: string;
  seasonId: string;
  smallGroup: string | null;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "warmup" }, "edit");
  try {
    await commitWarmupSmallGroup({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitFormalwearItemsAction(params: {
  membershipId: string;
  seasonId: string;
  items: readonly FormalwearItemKey[];
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "kit" }, "edit");
  try {
    await commitFormalwearItems({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitBluesAction(params: {
  membershipId: string;
  seasonId: string;
  value: BluesValue;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
  try {
    await commitBlues({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitBpsAction(params: {
  membershipId: string;
  seasonId: string;
  value: BpsValue;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
  try {
    await commitBps({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitEligibilityAction(params: {
  membershipId: string;
  seasonId: string;
  status: EligibilityStatus;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
  try {
    await commitEligibility({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitAvailabilityAction(params: {
  membershipId: string;
  level: AvailabilityLevel;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "availability" }, "edit");
  try {
    await commitAvailability({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

/**
 * Correction round 2, item 5 (LAN-217): commits through `resolveOnboardingItem`
 * — same call the record page's row makes, so history/activity log stay consistent.
 */
export async function commitOnboardingItemAction(params: {
  membershipId: string;
  itemId: string;
  status: OnboardingItemStatus;
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "onboarding" }, "edit");
  try {
    await resolveOnboardingItem({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitEntryAction(params: {
  membershipId: string;
  entry: "new" | "returning";
}): Promise<BoardActionState> {
  // LAN-432: the field's own category at edit.
  const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
  try {
    await commitEntry({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}
