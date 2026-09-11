"use server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { recordRosterFormGenerated, type Kit } from "@/lib/services/roster-form";
import { ROSTER_FORM_GENERATE_FAILED, type GenerateRosterFormState } from "./action-state";

// The one write this surface makes — LAN-267, a one-line audit event. Decision history: docs/ux/tickets/LAN-267-roster-form.md.
export async function generateRosterFormAction(
  eventId: string,
  kit: Kit,
  playerCount: number,
  coachCount: number,
): Promise<GenerateRosterFormState> {
  const operator = await requireCapability("event_calendar_management");

  try {
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
