"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { MOVE_TO_JOINED } from "@/lib/auth/roster-access";
import { isServiceError } from "@/lib/db";
import {
  flipRecruitmentProspectToJoined,
  updateRecruitmentProspectStatus,
} from "@/lib/services/recruitment-prospect";
import type { ProspectStatus } from "@/lib/services/recruitment-vocabulary";
import type { RecruitmentActionState } from "./action-state";

// The board's own server actions — LAN-204.

function refresh(prospectId?: string): void {
  revalidatePath("/operate/recruitment");
  if (prospectId) revalidatePath(`/operate/recruitment/${prospectId}`);
}

/** A `NotPermitted` comes back as state like any service error (LAN-423); a bug still throws. */
function stateFor(error: unknown): RecruitmentActionState {
  if (!isServiceError(error)) throw error;
  return { error: error.message };
}

const OK: RecruitmentActionState = { error: null };

/** Every status except `joined` — `W13`'s three exits plus re-engagement. */
export async function setRecruitmentStatusAction(params: {
  prospectId: string;
  toStatus: Exclude<ProspectStatus, "joined">;
  reason?: string;
}): Promise<RecruitmentActionState> {
  try {
    // LAN-432: Recruit details at edit. Inside the try: a refusal is the
    // cell's answer, shown beside the stored status, never a crashed board.
    const operator = await requireGrant({ kind: "recruiting", key: "recruit_details" }, "edit");
    await updateRecruitmentProspectStatus(operator.personId, params.prospectId, params.toStatus, {
      reason: params.reason,
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}

/**
 * `W14`. The one interruption in the mission. LAN-505 (Brian, 16 October
 * 2026): gated on the May move recruits to Joined switch, which replaced the
 * fixed four-office rule. The switch alone is enough — whatever the seat's
 * Recruit details level — so it can never be granted in a state where it does
 * nothing.
 */
export async function flipRecruitmentProspectAction(params: {
  prospectId: string;
}): Promise<RecruitmentActionState> {
  try {
    // Inside the try (LAN-423): a refusal is the card's answer, never a crashed board.
    const operator = await requireGrant(MOVE_TO_JOINED);
    await flipRecruitmentProspectToJoined(operator.personId, params.prospectId);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}
