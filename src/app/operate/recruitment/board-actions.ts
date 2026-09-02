"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  flipRecruitmentProspectToJoined,
  updateRecruitmentProspectStatus,
} from "@/lib/services/recruitment-prospect";
import type { ProspectStatus } from "@/lib/services/recruitment-vocabulary";
import type { RecruitmentActionState } from "./action-state";

/**
 * The board's own server actions — LAN-204. Both open with
 * `requireCapability("person_record_authority")`, the same four-office gate
 * `W1` and `W14` both name, resolved from the verified session rather than
 * accepted as an argument (`../roster/actions.ts`'s own reasoning: a server
 * action is a POST endpoint the browser can call directly).
 */

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

/**
 * Every status except `joined` — `W13`'s three exits, one control each, and
 * re-engagement. `joined` reaching here is refused by the service layer,
 * naming the flip instead of silently writing a status nobody can reach this
 * way.
 */
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

/** `W14`. The one interruption in the mission — confirmed on the client before this ever runs. */
export async function flipRecruitmentProspectAction(params: {
  prospectId: string;
}): Promise<RecruitmentActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await flipRecruitmentProspectToJoined(operator.personId, params.prospectId);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return OK;
}
