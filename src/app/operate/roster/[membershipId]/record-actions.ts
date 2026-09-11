"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
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
  commitCoachGroup,
  commitEligibility,
  commitEntry,
  commitFormalwearItem,
  commitJerseyNumbers,
  commitPosition,
  type AvailabilityLevel,
  type BluesValue,
  type EligibilityStatus,
  type FormalwearItemKey,
  type Kit,
  type PositionColumn,
} from "@/lib/services/roster-board";
import type { BoardActionState } from "../board-action-state";

// Player detail's own server actions — LAN-187, `REQ-player-detail`. Each
// wraps the same commit function ../board-actions.ts uses, revalidating
// both routes since this record's collision domain is [membershipId]/**.
// Every season-fact wrapper opens with `requireCapability("person_record_authority")`
// (`REQ-authority`), including recordResolveOnboardingItemAction as of
// LAN-214 round 2 (F-NEW-001, OD7-four-role-only, Brian 2026-09-02).

function refresh(membershipId: string): void {
  revalidatePath("/operate/roster");
  revalidatePath(`/operate/roster/${membershipId}`);
}

function stateFor(error: unknown): BoardActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

const OK: BoardActionState = { error: null };

export async function recordSetStatusAction(params: {
  membershipId: string;
  status: MembershipStatus;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
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
  const operator = await requireCapability("person_record_authority");
  try {
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
  const operator = await requireCapability("person_record_authority");
  try {
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
  const operator = await requireCapability("person_record_authority");
  try {
    await commitJerseyNumbers({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitCoachGroupAction(params: {
  membershipId: string;
  seasonId: string;
  coachGroup: string | null;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitCoachGroup({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.membershipId);
  return OK;
}

export async function recordCommitFormalwearItemAction(params: {
  membershipId: string;
  seasonId: string;
  item: FormalwearItemKey;
  owned: boolean;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await commitFormalwearItem({ actorPersonId: operator.personId, ...params });
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
  const operator = await requireCapability("person_record_authority");
  try {
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
  const operator = await requireCapability("person_record_authority");
  try {
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
  const operator = await requireCapability("person_record_authority");
  try {
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
// activity/audit trail. person_record_authority, same as every other write.
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
  const operator = await requireCapability("person_record_authority");
  let results: readonly OnboardingNudgeResult[];
  try {
    results = await sendOnboardingNudges(operator.personId, [params.membershipId]);
  } catch (error) {
    return { ...stateFor(error), outcome: null, reason: null };
  }

  revalidatePath("/operate/people/missing");
  refresh(params.membershipId);

  const outcome = results[0]?.outcome ?? null;
  let reason: string | null = null;
  if (outcome !== "accepted") {
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
  const operator = await requireCapability("person_record_authority");
  try {
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
