"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { sendEventChases } from "@/lib/services/messaging-scheduler";

/**
 * The Follow-ups queue's own action — LAN-322, built on
 * `/operate/people/missing`'s existing selection-and-nudge shape rather than a
 * second one (`actions.ts` there).
 *
 * Gated on `delivery_administration`, not on the page's own floor: the queue
 * is open to any seated operator because reading who is silent harms nobody,
 * but pressing this sends real messages to players about a real event, which
 * is the same act `retryDeliveryAction` and `revokeAndReissueAction` already
 * require that capability for. The checkboxes are hidden from a seat without
 * it; this guard is what actually decides.
 */
export interface ChaseActionResult {
  readonly error: string | null;
  readonly accepted: number;
  /** Named on the row rather than counted — the screen holds the names, so it says them. */
  readonly refusedInvitationIds: readonly string[];
  readonly notOutstandingInvitationIds: readonly string[];
}

const EMPTY: Omit<ChaseActionResult, "error"> = Object.freeze({
  accepted: 0,
  refusedInvitationIds: Object.freeze([]),
  notOutstandingInvitationIds: Object.freeze([]),
});

export async function chaseSelectedAction(
  invitationIds: readonly string[],
): Promise<ChaseActionResult> {
  const operator = await requireCapability("delivery_administration");

  const ids = Array.from(new Set(invitationIds.filter((id) => id.trim() !== "")));
  if (ids.length === 0) {
    return { ...EMPTY, error: "Select at least one person to chase." };
  }

  try {
    const results = await sendEventChases(operator.personId, ids);

    revalidatePath("/operate/admin/follow-ups");

    return {
      error: null,
      accepted: results.filter((result) => result.outcome === "accepted").length,
      // A recruit refused for `REQ-never-harsh` and a person the provider
      // would not take are both refusals to the operator: nothing was sent,
      // and the row says so.
      refusedInvitationIds: results
        .filter((result) => result.outcome === "refused" || result.outcome === "not_chaseable")
        .map((result) => result.invitationId),
      notOutstandingInvitationIds: results
        .filter((result) => result.outcome === "not_outstanding")
        .map((result) => result.invitationId),
    };
  } catch (error) {
    if (!isServiceError(error)) throw error;
    if (error.kind === "not_permitted") throw error;
    return { ...EMPTY, error: error.message };
  }
}
