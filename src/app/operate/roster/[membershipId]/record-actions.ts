"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { isServiceError, withTransaction } from "@/lib/db";
import { readOnboardingSendStatusIn } from "@/lib/services/onboarding-chase";
import {
  resolveOnboardingItem,
  setMembershipStatus,
  type MembershipStatus,
  type OnboardingItemStatus,
} from "@/lib/services/membership";
import {
  sendOnboardingNudges,
  type OnboardingNudgeResult,
} from "@/lib/services/messaging-scheduler";
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
import type { BoardActionState } from "../board-action-state";
import { categoryOfPosition } from "@/lib/auth/roster-access";

// Player detail's own server actions — LAN-187, `REQ-player-detail`. Each
// wraps the same commit function ../board-actions.ts uses, revalidating
// both routes since this record's collision domain is [membershipId]/**.
// Every wrapper opens with `requireGrant` on the field's own roster category
// at `edit` (LAN-432) — the same category the board's cell asks, so the
// record and the board refuse the same seats.

function refresh(membershipId: string): void {
  revalidatePath("/operate/roster");
  revalidatePath(`/operate/roster/${membershipId}`);
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

export async function recordSetStatusAction(params: {
  membershipId: string;
  status: MembershipStatus;
}): Promise<BoardActionState> {
  try {
    // LAN-429: Membership edit — the status ladder is the Membership category.
    const operator = await requireGrant({ kind: "roster", key: "membership" }, "edit");
    await setMembershipStatus({
      actorPersonId: operator.personId,
      membershipId: params.membershipId,
      status: params.status,
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitEntryAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitPositionAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitJerseyNumbersAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitCoachingGroupsAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitPositionGroupsAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitSpecialTeamsAssignmentAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitKitItemAction(params: {
  membershipId: string;
  seasonId: string;
  item: KitItemCode;
  /** One value, a whole set for Braces L / Braces R (LAN-409), or `null` to blank the field. */
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitWarmupSmallGroupAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitFormalwearItemsAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

/** BPS — the record's own copy of the board's column (LAN-387 puts it in the Membership group on both surfaces). */
export async function recordCommitBpsAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitBluesAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitEligibilityAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitAvailabilityAction(params: {
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
  refresh(params.membershipId);
  return OK;
}

// The record's own Send onboarding questionnaire — LAN-266, Brian 2026-09-09.
// Calls sendOnboardingNudges with one membership — the same function
// /operate/people/missing's Nudge calls, so both routes stay in one
// activity/audit trail. Onboarding at edit, like the items it chases.
// The refusal reason is read back from the job's own stored, provider-
// neutral sentence rather than invented (requirement 3).
export async function recordSendOnboardingQuestionnaireAction(params: {
  membershipId: string;
}): Promise<
  BoardActionState & {
    outcome: OnboardingNudgeResult["outcome"] | null;
    reason: string | null;
  }
> {
  let results: readonly OnboardingNudgeResult[];
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "onboarding" }, "edit");
    results = await sendOnboardingNudges(operator.personId, [params.membershipId]);
  } catch (error) {
    return { ...stateFor(error), outcome: null, reason: null };
  }

  revalidatePath("/operate/people/missing");
  refresh(params.membershipId);

  const outcome = results[0]?.outcome ?? null;
  let reason: string | null = null;
  // LAN-394: a deferral has no stored delivery failure to read back, because
  // nothing was attempted. Reading `last_error` for one would show the previous
  // attempt's reason beside a message that is merely waiting.
  if (outcome !== "accepted" && outcome !== "deferred") {
    const status = await withTransaction((tx) =>
      readOnboardingSendStatusIn(tx, params.membershipId),
    );
    reason = status.lastAsk?.delivery === "failed" ? status.lastAsk.reason : null;
  }
  return { error: null, outcome, reason };
}

/** One onboarding item, resolved in place — `REQ-player-detail`. Four-role only (`F-NEW-001`); a waiver's reason is optional (`REQ-reason-free-waive`). */
export async function recordResolveOnboardingItemAction(params: {
  membershipId: string;
  itemId: string;
  status: OnboardingItemStatus;
  reason?: string;
}): Promise<BoardActionState> {
  try {
    // LAN-432: the field's own category at edit.
    const operator = await requireGrant({ kind: "roster", key: "onboarding" }, "edit");
    await resolveOnboardingItem({
      actorPersonId: operator.personId,
      membershipId: params.membershipId,
      itemId: params.itemId,
      status: params.status,
      reason: params.reason,
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.membershipId);
  return OK;
}
