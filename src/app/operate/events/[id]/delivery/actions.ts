"use server";

import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { retryDelivery, revokeAndReissue } from "@/lib/services/delivery";
import type { EventTransitionState } from "../../form-state";

// The two repair actions UX-52 offers. Decision history: docs/ux/tickets/LAN-78-delivery.md.

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/** Retry one failed or queued delivery — idempotent where it counts (a guarded update claims the job). */
export async function retryDeliveryAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("delivery_administration");
  const eventId = text(formData, "eventId");
  const jobId = text(formData, "jobId");

  let outcome: Awaited<ReturnType<typeof retryDelivery>>;
  try {
    outcome = await retryDelivery(operator.personId, jobId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);

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
  const operator = await requireCapability("delivery_administration");
  const eventId = text(formData, "eventId");
  const invitationId = text(formData, "invitationId");
  const reason = text(formData, "reason");

  let outcome: Awaited<ReturnType<typeof revokeAndReissue>>;
  try {
    outcome = await revokeAndReissue(operator.personId, invitationId, reason);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}/delivery`);

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
