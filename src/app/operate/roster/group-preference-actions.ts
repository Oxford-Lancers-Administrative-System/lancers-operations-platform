"use server";

import { requireOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { writeRosterCollapsedGroups } from "@/lib/services/operator-preferences";

/**
 * Remembers which roster groups this operator has folded away — LAN-387,
 * Brian's visual pass of 2026-09-17, item 1. The board and the membership
 * record share one setting, because they show the same groups.
 *
 * `requireOperator`, not `requireCapability`: this writes nothing about a
 * person, a membership or a season, so a capability over the roster is not what
 * is at stake. What matters is whose settings are written, and that is not an
 * input — the action takes no subject and the service writes the row for the
 * person the session resolved to.
 *
 * It deliberately does not `revalidatePath`. A preference is written *after*
 * the screen has already moved; re-rendering the route from the server would
 * throw away the state the operator is looking at to replace it with the state
 * they just chose.
 */
export async function saveCollapsedGroupsAction(groups: string[]): Promise<void> {
  const operator = await requireOperator();
  try {
    await writeRosterCollapsedGroups({ actorPersonId: operator.personId, groups });
  } catch (error) {
    // A refusal from below is still a refusal; a preference that did not store
    // is not worth interrupting an operator mid-task for, and the next toggle
    // writes the whole state again anyway.
    if (!isServiceError(error)) throw error;
  }
}
