"use server";

import { revalidatePath } from "next/cache";
import { requireGrant, requireRole } from "@/lib/auth/guards";
import { FLIP_ROLE_CODES, FLIP_ROLE_RULE } from "@/lib/auth/recruitment-flip-authority";
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

/** `W14`. The one interruption in the mission — gated on the four constitutional offices (`recruitment-flip-authority`), not a grant. */
export async function flipRecruitmentProspectAction(params: {
  prospectId: string;
}): Promise<RecruitmentActionState> {
  try {
    // Inside the try (LAN-423): a refusal is the card's answer, never a crashed board.
    const operator = await requireRole([...FLIP_ROLE_CODES], { rule: FLIP_ROLE_RULE });
    await flipRecruitmentProspectToJoined(operator.personId, params.prospectId);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}
