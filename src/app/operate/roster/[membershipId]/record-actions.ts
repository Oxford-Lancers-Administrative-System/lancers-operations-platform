"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  resolveOnboardingItem,
  setMembershipStatus,
  type MembershipStatus,
} from "@/lib/services/membership";
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

/**
 * Player detail's own server actions — LAN-187, `REQ-player-detail`.
 *
 * Every one of these calls straight into `roster-board.ts`'s commit
 * functions or `membership.ts`'s own writes — the exact functions
 * `../board-actions.ts` and `../actions.ts` call for the board's identical
 * cells. Nothing here reimplements a commit; this file exists only because
 * this package's collision domain is `[membershipId]/**` and the board's own
 * action module only revalidates `/operate/roster`, never this record's own
 * route. Every wrapper below revalidates both, so an edit made here is
 * reflected on the board without a manual refresh, and vice versa.
 *
 * `REQ-authority` again, at the write boundary and not only the read one:
 * every season-fact wrapper — `recordResolveOnboardingItemAction` included, as
 * of LAN-214 correction round 2 (`F-NEW-001`) — opens with
 * `requireCapability("person_record_authority")`, the same four-role gate
 * this page's own read gate uses (`page.tsx`). `recordResolveOnboardingItemAction`
 * previously called `requireGeneralOperator()`, on the reading that resolving
 * an onboarding item was ordinary roster work rather than Exec-only; `OD7-four-
 * role-only` (Brian, 2026-09-02) and `REQ-reason-free-waive` supersede that —
 * only the four-role group ever resolves an item, waive and reopen
 * explicitly included, and the physical act (handing out kit, say) is
 * anyone's without that meaning they record it here.
 */

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

/**
 * One onboarding item, resolved in place — `REQ-player-detail`'s retirement
 * of the per-item `Resolve … ▾` / `SAVE` pair. Calls the same
 * `resolveOnboardingItem()` the shipped `OnboardingItemForm` always has;
 * only the control above it changed. Four-role only (`person_record_authority`),
 * `F-NEW-001` — `REQ-checklist-fixed`: "only the four-role group resolves
 * anything." A waiver's reason is optional (`REQ-reason-free-waive`); the
 * author is still required, and `resolveOnboardingItem()` supplies it from
 * the verified operator this gate resolves.
 */
export async function recordResolveOnboardingItemAction(params: {
  membershipId: string;
  itemId: string;
  status: "complete" | "waived" | "not_applicable";
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
