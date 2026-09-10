"use server";

import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { recordRosterFormGenerated, type Kit } from "@/lib/services/roster-form";
import {
  ROSTER_FORM_GENERATE_FAILED,
  type GenerateRosterFormState,
} from "./action-state";

/**
 * The one write this surface makes — LAN-267: "A one-line audit event when a
 * form is generated (who, which event, when)."
 *
 * Nothing is stored beyond that row. The form itself is the page, printed; the
 * ticket puts storing generated PDFs and a document library explicitly out of
 * scope, and a copy of a dozen student numbers sitting in object storage is
 * exactly the thing a generated-on-demand form avoids.
 *
 * `event_calendar_management` is the gate — the same capability every other
 * deliberate act on a game already requires, and the narrowest existing one
 * that fits. It is deliberately not a new capability: the capability map is a
 * recorded authority decision (`capabilities.ts`, and
 * `tests/capability-map-single-source.test.ts` makes it the only place a role
 * code decides anything), and adding a row to it is Brian's, not this
 * package's.
 */
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
