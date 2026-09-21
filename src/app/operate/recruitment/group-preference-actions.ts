"use server";

import { requireOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { writeRecruitmentCollapsedGroups } from "@/lib/services/operator-preferences";

/**
 * Remembers which recruitment groups this operator has folded away — LAN-404,
 * the same ask LAN-387 answered on the roster board, and the same shape: the
 * setting is on the operator's account, so it follows them between devices.
 *
 * `requireOperator`, not `requireCapability`, for the reason the roster's own
 * action gives: this writes nothing about a person, a prospect or a season, and
 * the only subject it could have — whose settings these are — is not an input.
 *
 * It deliberately does not `revalidatePath`. A preference is written after the
 * screen has already moved; re-rendering the route would throw away the state
 * the operator is looking at to replace it with the state they just chose.
 */
export async function saveRecruitmentCollapsedGroupsAction(groups: string[]): Promise<void> {
  const operator = await requireOperator();
  try {
    await writeRecruitmentCollapsedGroups({ actorPersonId: operator.personId, groups });
  } catch (error) {
    // A refusal from below is still a refusal; a preference that did not store
    // is not worth interrupting an operator mid-task for, and the next toggle
    // writes the whole state again anyway.
    if (!isServiceError(error)) throw error;
  }
}
