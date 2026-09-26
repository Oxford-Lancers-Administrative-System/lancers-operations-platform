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

/**
 * A refusal is the cell's own answer, not a crash (LAN-423): `NotPermitted`
 * comes back as the state like any other service error, so the cell prints the
 * refusal and keeps the stored value. Anything that is not a service error is
 * a bug and still throws.
 */
function stateFor(error: unknown): BoardActionState {
  if (!isServiceError(error)) throw error;
  return { error: error.message };
}

const OK: BoardActionState = { error: null };

export async function commitPositionAction(params: {
  membershipId: string;
  seasonId: string;
  column: PositionColumn;
  code: string | null;
}): Promise<BoardActionState> {
  try {
    // LAN-432: Offensive or Defensive assignments at edit, by the slot written.
    const operator = await requireGrant(
      { kind: "roster", key: categoryOfPosition(params.column) },
      "edit",
    );
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "coaching" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "coaching" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "special_teams" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "kit" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "warmup" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "kit" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "availability" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "onboarding" }, "edit");
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
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
    await commitEntry({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}
