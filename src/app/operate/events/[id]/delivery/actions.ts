"use server";

import { revalidatePath } from "next/cache";
import { isServiceError } from "@/lib/db";
import { retryDelivery, revokeAndReissue } from "@/lib/services/delivery";
import { requireInvitationsGrant, requireNotificationJobGrant } from "@/lib/services/events";
import type { EventTransitionState } from "../../form-state";

// The two repair actions UX-52 offers. LAN-431: Manage on the template of the
// event the job or invitation belongs to — read from the job or invitation
// itself, never from the posted event id.

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Every service failure, a refusal included (LAN-423), as the page's message; a bug still throws. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  return error.message;
}

/** Retry one failed or queued delivery — idempotent where it counts (a guarded update claims the job). */
export async function retryDeliveryAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const eventId = text(formData, "eventId");
  const jobId = text(formData, "jobId");
  let outcome: Awaited<ReturnType<typeof retryDelivery>>;
  try {
    const operator = await requireNotificationJobGrant(jobId, "manage");
    outcome = await retryDelivery(operator.personId, jobId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);

  // LAN-394. Three answers, not two. A retry the messaging safety guard
  // deferred was never offered to the provider: no attempt was spent, no link
  // was superseded, and the invitation is queued. Saying "the provider did not
  // accept this" about it would be false, and would invite a second press that
  // achieves nothing.
  if (outcome === "deferred") {
    return {
      error: null,
      notice: "Queued — waiting for the sending allowance. Nothing was sent yet.",
    };
  }

  // "Failures are safely visible" — reporting a refused attempt as success would break it.
  return {
    error:
      outcome === "accepted"
        ? null
        : "The provider did not accept this invitation. The reason is shown against it below.",
  };
}

/** Withdraws the live link and issues a new one, then sends it — never without sending. Reason required (`rsvp_access_tokens_revocation_is_explained`). */
export async function revokeAndReissueAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const eventId = text(formData, "eventId");
  const invitationId = text(formData, "invitationId");
  const reason = text(formData, "reason");

  let outcome: Awaited<ReturnType<typeof revokeAndReissue>>;
  try {
    const operator = await requireInvitationsGrant([invitationId], "manage");
    outcome = await revokeAndReissue(operator.personId, invitationId, reason);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);

  // LAN-394. Revocation is an explicit security act and it has happened: the
  // old link is dead either way. What changes is the truth about the
  // replacement — waiting, not refused — and the operator is told both halves.
  if (outcome === "deferred") {
    return {
      error: null,
      notice:
        "The previous link has been withdrawn. The replacement is queued — waiting for the " +
        "sending allowance.",
    };
  }

  // Revocation happens first, so a refused send leaves no working link — the more destructive control gets the more honest answer.
  return {
    error:
      outcome === "accepted"
        ? null
        : "The previous link has been withdrawn, but the replacement was not accepted by the " +
          "provider. This person currently has no working link. The reason is shown against " +
          "them below.",
  };
}
