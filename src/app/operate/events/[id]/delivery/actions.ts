"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { retryDelivery, revokeAndReissue } from "@/lib/services/delivery";
import type { EventTransitionState } from "../../form-state";

/**
 * The two repair actions UX-52 offers, and the two it deliberately does not.
 *
 * **Offered:** Retry delivery, and Revoke and reissue link. Both are auditable
 * system actions that act on an invitation that already exists.
 *
 * **Not offered, and not implementable from here:** copy link, send message,
 * post to group, mark as sent, add a recipient. None has a service function
 * behind it, so none could be added by writing a button — the absence is in the
 * service layer and in the schema, not in this file's restraint.
 *
 * ## Authorization
 *
 * Both open with `requireCapability("delivery_administration")`, which resolves
 * the actor from the verified session. Neither takes an actor argument: a
 * Server Action is a POST endpoint the browser can call directly, so an action
 * accepting "who am I" would accept whatever was sent.
 *
 * ## Why a refusal is rethrown rather than returned
 *
 * The same reason as the event actions: a `NotPermitted` rendered as red text
 * beside a button reads as "try again", which is the wrong instruction and
 * hides an authorization event inside what looks like a transient failure.
 *
 * ## Why neither redirects
 *
 * The operator stays on the invitee they were repairing, so they can see the
 * result against the person it concerns. `revalidatePath` re-reads the delivery
 * state from the database, so the screen shows what actually happened rather
 * than what was requested.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/**
 * Retry one failed or queued delivery.
 *
 * Idempotent where it counts. The service claims the job with a guarded
 * `update`, so a double-press produces one further attempt and the second press
 * finds the job already in progress and says so. It creates no invitation and
 * cannot reach the audience.
 */
export async function retryDeliveryAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("delivery_administration");
  const eventId = text(formData, "eventId");
  const jobId = text(formData, "jobId");

  try {
    await retryDelivery(operator.personId, jobId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);
  return { error: null };
}

/**
 * Withdraw the live link and issue a new one, then send it.
 *
 * The reason is required by `rsvp_access_tokens_revocation_is_explained` and by
 * the service before it — withdrawing somebody's link is a decision, and an
 * unexplained one is a decision nobody can review later.
 *
 * There is no way to reissue a link *without* sending it, and that is
 * deliberate: a token nobody can read is worthless unless it goes somewhere,
 * and an operator holding one on screen is the manual path this issue exists to
 * remove.
 */
export async function revokeAndReissueAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("delivery_administration");
  const eventId = text(formData, "eventId");
  const invitationId = text(formData, "invitationId");
  const reason = text(formData, "reason");

  try {
    await revokeAndReissue(operator.personId, invitationId, reason);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);
  return { error: null };
}
