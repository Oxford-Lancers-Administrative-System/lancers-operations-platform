"use server";

import { revalidatePath } from "next/cache";

import { isServiceError } from "@/lib/db";
import { requireEventGrant } from "@/lib/services/events";
import { recordOperatorRsvpResponse } from "@/lib/services/rsvp";

import type { RecordAnswerState } from "./record-answer-state";

/**
 * Records what an operator was told in person — W3, LAN-170. LAN-431: Manage
 * on the event's template; under View the control is absent. `RecordAnswerControl`
 * is rendered only against a row with no answer at all, but that is the
 * surface's courtesy, not the boundary: `recordOperatorRsvpResponse`
 * re-resolves the invitation inside its own transaction.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Every service failure, a refusal included (LAN-423), becomes a sentence for the dialog; a bug still throws. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  return error.message;
}

const QUESTION_FIELD_PREFIX = "question:";

/** Every `question:<id>` field the dialog posted, keyed to the bare question id. A blank field stays blank — treated as "left outstanding", not "no answer". */
function questionAnswersFrom(formData: FormData): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(QUESTION_FIELD_PREFIX) || typeof value !== "string") continue;
    answers[key.slice(QUESTION_FIELD_PREFIX.length)] = value;
  }
  return answers;
}

export async function recordOperatorAnswerAction(
  _previous: RecordAnswerState,
  formData: FormData,
): Promise<RecordAnswerState> {
  const eventId = text(formData, "eventId");
  let operator: Awaited<ReturnType<typeof requireEventGrant>>;
  try {
    operator = await requireEventGrant(eventId, "manage");
  } catch (error) {
    return { error: messageFor(error), success: false };
  }
  const invitationId = text(formData, "invitationId");
  const response = text(formData, "response");

  if (response !== "yes" && response !== "no") {
    return { error: "Choose Yes or No before recording.", success: false };
  }

  try {
    await recordOperatorRsvpResponse(operator.personId, eventId, invitationId, {
      response,
      reason: text(formData, "reason"),
      respondedAtDate: text(formData, "respondedAtDate"),
      respondedAtTime: text(formData, "respondedAtTime"),
      questionAnswers: questionAnswersFrom(formData),
    });
  } catch (error) {
    return { error: messageFor(error), success: false };
  }

  // No redirect: the dialog closes on `success`, table refreshes from revalidation.
  revalidatePath(`/operate/events/${eventId}`);
  return { error: null, success: true };
}
