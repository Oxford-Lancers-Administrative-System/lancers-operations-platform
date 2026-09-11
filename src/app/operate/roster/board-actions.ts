"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  commitAvailability,
  commitBlues,
  commitBps,
  commitCoachGroup,
  commitEligibility,
  commitEntry,
  commitFormalwearItem,
  commitJerseyNumbers,
  commitPosition,
  type AvailabilityLevel,
  type BluesValue,
  type BpsValue,
  type EligibilityStatus,
  type FormalwearItemKey,
  type Kit,
  type PositionColumn,
} from "@/lib/services/roster-board";
import { resolveOnboardingItem, type OnboardingItemStatus } from "@/lib/services/membership";
import type { BoardActionState } from "./board-action-state";

/**
 * The board's own server actions — LAN-186. Each opens with
 * `requireCapability("person_record_authority")` (`REQ-authority`),
 * commits with no confirmation, and revalidates the roster path. Status
 * change is deliberately not here — `./actions.ts`'s `setMembershipStatusAction`
 * (same capability) owns that column instead, not `membership_activation`
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
  const operator = await requireCapability("person_record_authority");
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
  const operator = await requireCapability("person_record_authority");
  try {
    await commitJerseyNumbers({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}

export async function commitCoachGroupAction(params: {
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
  refresh();
  return OK;
}

export async function commitFormalwearItemAction(params: {
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
  refresh();
  return OK;
}

export async function commitBluesAction(params: {
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
  refresh();
  return OK;
}

export async function commitBpsAction(params: {
  membershipId: string;
  seasonId: string;
  value: BpsValue;
}): Promise<BoardActionState> {
  const operator = await requireCapability("person_record_authority");
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
  const operator = await requireCapability("person_record_authority");
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
  const operator = await requireCapability("person_record_authority");
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
  const operator = await requireCapability("person_record_authority");
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
  const operator = await requireCapability("person_record_authority");
  try {
    await commitEntry({ actorPersonId: operator.personId, ...params });
  } catch (error) {
    return stateFor(error);
  }
  refresh();
  return OK;
}
