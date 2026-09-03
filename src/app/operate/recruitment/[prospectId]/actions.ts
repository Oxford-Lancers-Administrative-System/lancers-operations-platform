"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  addRecruitmentProspectNote,
  sendRecruitmentQuestionnaire,
} from "@/lib/services/recruitment-prospect";
import type { RecruitmentQuestionnaireTrack } from "@/lib/services/recruitment-prospect";
import type { RecruitmentActionState } from "../action-state";

function refresh(prospectId: string): void {
  revalidatePath(`/operate/recruitment/${prospectId}`);
  revalidatePath("/operate/recruitment");
}

function stateFor(error: unknown): RecruitmentActionState {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return { error: error.message };
}

export async function addRecruitmentNoteAction(params: {
  prospectId: string;
  note: string;
}): Promise<RecruitmentActionState> {
  const operator = await requireCapability("person_record_authority");
  try {
    await addRecruitmentProspectNote(operator.personId, params.prospectId, params.note);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return { error: null };
}

/**
 * `W2`'s two SEND buttons — the 2026-09-01 amendment's own machinery. Real
 * consequence, not a stub: this creates the `notification_jobs` row through
 * `declareRecruitmentCycleJobsIn`, gated on consent and the two-ask cap, as
 * `sendRecruitmentQuestionnaireIn`'s own doc comment explains.
 */
export async function sendRecruitmentQuestionnaireAction(params: {
  prospectId: string;
  track: RecruitmentQuestionnaireTrack;
}): Promise<
  RecruitmentActionState & {
    created: readonly string[];
    reason: "not_consented" | "not_eligible" | "already_complete" | "outstanding" | null;
  }
> {
  const operator = await requireCapability("person_record_authority");
  try {
    const result = await sendRecruitmentQuestionnaire(
      operator.personId,
      params.prospectId,
      params.track,
    );
    refresh(params.prospectId);
    return { error: null, created: result.created, reason: result.reason };
  } catch (error) {
    return { ...stateFor(error), created: [], reason: null };
  }
}
