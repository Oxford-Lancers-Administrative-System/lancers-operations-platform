"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  addRecruitmentProspectNote,
  recordRecruitConsent,
  sendRecruitmentQuestionnaire,
  stopRecruitMessages,
} from "@/lib/services/recruitment-prospect";
import type { ConsentWithdrawalReason } from "@/lib/services/messaging-consent";
import type { RecruitmentQuestionnaireTrack } from "@/lib/services/recruitment-prospect";
import type { RecruitmentActionState } from "../action-state";
import { PERSON_RECORD_BRIDGE } from "@/lib/auth/grants";

function refresh(prospectId: string): void {
  revalidatePath(`/operate/recruitment/${prospectId}`);
  revalidatePath("/operate/recruitment");
  // LAN-371: the same two consent controls are on the person record, which is
  // a different route and would otherwise keep serving the old status.
  revalidatePath("/operate/people/[personId]", "page");
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
  // LAN-429 bridge: replaced by LAN-432
  const operator = await requireGrant(PERSON_RECORD_BRIDGE);
  try {
    await addRecruitmentProspectNote(operator.personId, params.prospectId, params.note);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return { error: null };
}

// W2's two SEND buttons — the 2026-09-01 amendment. Real consequence, not a
// stub: creates the notification_jobs row via declareRecruitmentCycleJobsIn.
export async function sendRecruitmentQuestionnaireAction(params: {
  prospectId: string;
  track: RecruitmentQuestionnaireTrack;
}): Promise<
  RecruitmentActionState & {
    created: readonly string[];
    /** LAN-394 added `deferred`: declared and queued behind the sending allowance. */
    delivery?: "accepted" | "refused" | "skipped" | "deferred";
    /** LAN-394. When the guard expects to let it through, where that is knowable. */
    waitingUntil?: Date | null;
    reason: "not_consented" | "not_eligible" | "already_complete" | "outstanding" | null;
  }
> {
  // LAN-429 bridge: replaced by LAN-432
  const operator = await requireGrant(PERSON_RECORD_BRIDGE);
  try {
    const result = await sendRecruitmentQuestionnaire(
      operator.personId,
      params.prospectId,
      params.track,
    );
    refresh(params.prospectId);
    return {
      error: null,
      created: result.created,
      reason: result.reason,
      delivery: result.delivery,
      waitingUntil: result.waitingUntil ?? null,
    };
  } catch (error) {
    return { ...stateFor(error), created: [], reason: null };
  }
}

/**
 * **Stop messages** — LAN-371, Brian 2026-09-16. Withdraws this season's
 * consent for this recruit, with a required reason, and cancels everything
 * still queued for them rather than leaving each send to be refused one at a
 * time. `person_record_authority` is the same capability that edits the
 * recruit, which is what the issue asks for.
 */
export async function stopMessagesAction(params: {
  prospectId: string;
  listedReason: ConsentWithdrawalReason;
  note: string;
}): Promise<RecruitmentActionState> {
  // LAN-429 bridge: replaced by LAN-432
  const operator = await requireGrant(PERSON_RECORD_BRIDGE);
  try {
    await stopRecruitMessages(operator.personId, params.prospectId, {
      listedReason: params.listedReason,
      note: params.note,
    });
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return { error: null };
}

/** **Record consent** — the reverse, with a note of how consent was given. */
export async function recordConsentAction(params: {
  prospectId: string;
  note: string;
}): Promise<RecruitmentActionState> {
  // LAN-429 bridge: replaced by LAN-432
  const operator = await requireGrant(PERSON_RECORD_BRIDGE);
  try {
    await recordRecruitConsent(operator.personId, params.prospectId, params.note);
  } catch (error) {
    return stateFor(error);
  }
  refresh(params.prospectId);
  return { error: null };
}
