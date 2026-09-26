"use server";

import { isServiceError } from "@/lib/db";
import { requireEventGrant } from "@/lib/services/events";
import { recordRosterFormGenerated, type Kit } from "@/lib/services/roster-form";
import { ROSTER_FORM_GENERATE_FAILED, type GenerateRosterFormState } from "./action-state";

// The one write this surface makes — LAN-267, a one-line audit event.
export async function generateRosterFormAction(
  eventId: string,
  kit: Kit,
  playerCount: number,
  coachCount: number,
): Promise<GenerateRosterFormState> {
  try {
    // LAN-431: Manage on this event's template. Inside the try (LAN-423): a
    // refusal is the button's own error, never a crashed page.
    const operator = await requireEventGrant(eventId, "manage");
    await recordRosterFormGenerated({
      actorPersonId: operator.personId,
      eventId,
      kit,
      playerCount,
      coachCount,
    });
  } catch (error) {
    return {
      generatedAt: null,
      error: isServiceError(error) ? error.message : ROSTER_FORM_GENERATE_FAILED,
    };
  }

  return { generatedAt: new Date().toISOString(), error: null };
}
