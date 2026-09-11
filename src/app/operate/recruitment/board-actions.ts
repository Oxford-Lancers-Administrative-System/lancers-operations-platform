"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, requireRole } from "@/lib/auth/guards";
import { FLIP_ROLE_CODES, FLIP_ROLE_RULE } from "@/lib/auth/recruitment-flip-authority";
import { isServiceError } from "@/lib/db";
import {
  flipRecruitmentProspectToJoined,
  updateRecruitmentProspectStatus,
} from "@/lib/services/recruitment-prospect";
import type { ProspectStatus } from "@/lib/services/recruitment-vocabulary";
import type { RecruitmentActionState } from "./action-state";

// The board's own server actions — LAN-204. Decision history: docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md.

function refresh(prospectId?: string): void {
  revalidatePath("/operate/recruitment");
  if (prospectId) revalidatePath(`/operate/recruitment/${prospectId}`);
}

function stateFor(error: unknown): RecruitmentActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

const OK: RecruitmentActionState = { error: null };

/** Every status except `joined` — `W13`'s three exits plus re-engagement. Decision history: docs/ux/tickets/LAN-204-recruit-board-record-exits-flip.md. */
export async function setRecruitmentStatusAction(params: {
  prospectId: string;
  toStatus: Exclude<ProspectStatus, "joined">;
  reason?: string;
}): Promise<RecruitmentActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await updateRecruitmentProspectStatus(operator.personId, params.prospectId, params.toStatus, {
      reason: params.reason,
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}

/** `W14`. The one interruption in the mission — gated on the four constitutional offices, not `person_record_authority`. */
export async function flipRecruitmentProspectAction(params: {
  prospectId: string;
}): Promise<RecruitmentActionState> {
  const operator = await requireRole([...FLIP_ROLE_CODES], { rule: FLIP_ROLE_RULE });
  try {
    await flipRecruitmentProspectToJoined(operator.personId, params.prospectId);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}
