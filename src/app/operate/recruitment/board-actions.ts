"use server";

import { revalidatePath } from "next/cache";
import { requireCapability, requireRole } from "@/lib/auth/guards";
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
 * `flipRecruitmentProspectAction` is narrower. `W14` (locked) names exactly
 * "President, Vice President, Secretary and General Manager, and nobody
 * else, ever" for the mission's one irreversible action, and `REQ-core-four`
 * is explicit that recruitment mints no new capability — so this is not
 * `person_record_authority` (which admits `it_officer`, LAN-124's standing
 * administrative exception, correct for every other surface in this package
 * but not for this one) and it is not a new entry in `capabilities.ts`
 * either. `requireRole()` (LAN-73) is the mechanism built for exactly this:
 * a literal role-code check against the verified session, independent of the
 * capability map — found by review after `board-actions.test.ts` proved an
 * IT-Officer-only operator could reach the flip through
 * `person_record_authority` (F-LAN204-001).
 */
const FLIP_ROLE_CODES = ["president", "vice_president", "secretary", "general_manager"] as const;
const FLIP_ROLE_RULE = "recruitment_flip_core_four_only";

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
