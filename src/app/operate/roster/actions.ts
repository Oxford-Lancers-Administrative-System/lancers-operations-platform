"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  resolveOnboardingItem,
  setMembershipStatus,
  type MembershipStatus,
  type OnboardingItemStatus,
} from "@/lib/services/membership";
import type { MembershipActionState } from "./action-state";

// The membership workflow's server actions — LAN-75, LAN-186 (Q-12). Both
// guard on `person_record_authority` (`REQ-authority`). Decision history: docs/ux/tickets/LAN-75-roster-and-player-detail.md · missions/intake/M-PEOPLE-AND-ROSTER/decision-history.md.

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function stateFor(error: unknown): MembershipActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

function refreshMembership(membershipId: string): void {
  revalidatePath("/operate/roster");
  revalidatePath(`/operate/roster/${membershipId}`);
}

/** Sets a membership's status to any value in the ladder — no reason, no confirmation, no legality check; `setMembershipStatus()` is the whole rule. */
export async function setMembershipStatusAction(params: {
  membershipId: string;
  status: MembershipStatus;
}): Promise<MembershipActionState> {
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

  refreshMembership(params.membershipId);
  return { error: null };
}

/** Marks one onboarding item complete/waived/not-applicable, or reopens it. `pending`/`invited`/`claimed` are process states, not operator decisions — a crafted request naming one is refused. */
export async function resolveOnboardingItemAction(
  _previous: MembershipActionState,
  formData: FormData,
): Promise<MembershipActionState> {
  const operator = await requireCapability("person_record_authority");
  const membershipId = text(formData, "membershipId");

  try {
    await resolveOnboardingItem({
      actorPersonId: operator.personId,
      membershipId,
      itemId: text(formData, "itemId"),
      status: text(formData, "status") as OnboardingItemStatus,
      reason: text(formData, "reason"),
    });
  } catch (error) {
    return stateFor(error);
  }

  refreshMembership(membershipId);
  return { error: null };
}
