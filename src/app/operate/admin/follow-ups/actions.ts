"use server";

import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { sendEventChases } from "@/lib/services/messaging-scheduler";
import { WAITING_ALLOWANCE_LABEL } from "@/lib/services/messaging-safety";
import { requireInvitationsGrant } from "@/lib/services/events";
import { CHASE_NOBODY_SELECTED, CHASE_REFUSAL_UNRECORDED, NOT_CHASEABLE } from "./presentation";

/**
 * The Follow-ups queue's own action — LAN-322, built on
 * `/operate/people/missing`'s existing selection-and-nudge shape rather than a
 * second one (`actions.ts` there).
 *
 * Gated on Manage on the template of every selected row's event (LAN-431),
 * not on the page's own floor: the queue is open to View because reading who
 * is silent harms nobody, but pressing this sends real messages to players
 * about a real event, which is the same act `retryDeliveryAction` and
 * `revokeAndReissueAction` require Manage for. The checkboxes are hidden on a
 * row without it; this guard is what actually decides.
 */
export interface ChaseActionResult {
  readonly error: string | null;
  readonly accepted: number;
  /** Named on the row rather than counted — the screen holds the names, so it says them. */
  readonly refusals: readonly ChaseRefusal[];
  /** LAN-394. Chases that exist and are waiting on the sending allowance. */
  readonly waiting: readonly ChaseRefusal[];
  readonly notOutstandingInvitationIds: readonly string[];
}

/**
 * One person the chase did not reach, and why — LAN-322's walk.
 *
 * The invitation id alone was what this returned before, and the notice it fed
 * could only say "3 people could not be chased:" and list names. An operator
 * reading that has no idea whether to fix a phone number, ask the club's
 * administrator for the deployment's settings, or do nothing at all, and those
 * are three entirely different next actions. The reason travels with the name
 * so the notice can say which.
 */
interface ChaseRefusal {
  readonly invitationId: string;
  readonly reason: string;
}

const EMPTY: Omit<ChaseActionResult, "error"> = Object.freeze({
  accepted: 0,
  refusals: Object.freeze([]),
  waiting: Object.freeze([]),
  notOutstandingInvitationIds: Object.freeze([]),
});

export async function chaseSelectedAction(
  invitationIds: readonly string[],
): Promise<ChaseActionResult> {
  try {
    await requireGrant({ anyOf: "template", minimum: "manage" });
  } catch (error) {
    return refusedChase(error);
  }

  const ids = Array.from(new Set(invitationIds.filter((id) => id.trim() !== "")));
  if (ids.length === 0) {
    return { ...EMPTY, error: CHASE_NOBODY_SELECTED };
  }

  try {
    // LAN-431: Manage on the template of every selected row's event, read from the invitations.
    const operator = await requireInvitationsGrant(ids, "manage");
    const results = await sendEventChases(operator.personId, ids);

    revalidatePath("/operate/admin/follow-ups");

    return {
      error: null,
      accepted: results.filter((result) => result.outcome === "accepted").length,
      // LAN-394. Counted apart from both accepted and refused. The chase job
      // exists and is waiting on the sending allowance; the invitee's link is
      // untouched and no attempt was spent.
      waiting: results
        .filter((result) => result.outcome === "deferred")
        .map((result) => ({
          invitationId: result.invitationId,
          reason: result.reason ?? WAITING_ALLOWANCE_LABEL,
        })),
      // A recruit refused for `REQ-never-harsh` and a person the provider
      // would not take are both refusals to the operator: nothing was sent,
      // and the row says so.
      //
      // The recruit's reason is the queue's own word for the rule
      // (`NOT_CHASEABLE`, already on the row's own Chase cell) rather than a
      // second sentence written in the service: no job is ever created for a
      // recruit, so there is no recorded failure to read, and the screen that
      // already says "Recruit — not chased from here" beside the name should
      // not say something different inside the notice.
      refusals: results
        .filter((result) => result.outcome === "refused" || result.outcome === "not_chaseable")
        .map((result) => ({
          invitationId: result.invitationId,
          reason:
            result.outcome === "not_chaseable"
              ? NOT_CHASEABLE
              : (result.reason ?? CHASE_REFUSAL_UNRECORDED),
        })),
      notOutstandingInvitationIds: results
        .filter((result) => result.outcome === "not_outstanding")
        .map((result) => result.invitationId),
    };
  } catch (error) {
    return refusedChase(error);
  }
}

/** A service failure, a refusal included (LAN-423), as the notice's error; a bug still throws. */
function refusedChase(error: unknown): ChaseActionResult {
  if (!isServiceError(error)) throw error;
  return { ...EMPTY, error: error.message };
}
