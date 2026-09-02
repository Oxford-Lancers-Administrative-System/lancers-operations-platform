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

/**
 * The board's own server actions — LAN-204.
 *
 * `setRecruitmentStatusAction` opens with `requireCapability("person_record_authority")`,
 * the same four-office-plus-administrative-seat gate `W1` names for reading
 * and changing the board's own facts — `../roster/actions.ts`'s own precedent
 * (LAN-124: the administrative seat holds every capability in the file), and
 * unaffected by this file's other correction.
 *
 * `flipRecruitmentProspectAction` is narrower — `FLIP_ROLE_CODES`
 * (`@/lib/auth/recruitment-flip-authority`) is the full reasoning, kept in
 * its own module rather than here so this file stays inside
 * `tests/capability-map-single-source.test.ts`'s row-8 scan: correction
 * round 1 first put this whole file in that scan's allow-list, and the
 * reviewer proved the cost (F-LAN204-CORR1-008) by slipping an unrelated
 * role literal in here and watching the invariant pass anyway.
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

/**
 * `W14`. The one interruption in the mission — confirmed on the client
 * before this ever runs, and gated on the four constitutional offices alone
 * (see the module comment) rather than on `person_record_authority`.
 */
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
