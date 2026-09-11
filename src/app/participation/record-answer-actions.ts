"use server";

import { revalidatePath } from "next/cache";

import { requireGeneralOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { recordOperatorRsvpResponse } from "@/lib/services/rsvp";

import type { RecordAnswerState } from "./record-answer-state";

/**
 * Records what an operator was told in person — W3, LAN-170. Floor is
 * `requireGeneralOperator()`, matching `readOperatorParticipation` — "which
 * operator roles may record" is still open for Brian. `RecordAnswerControl`
 * is rendered only against a row with no answer at all, but that is the
 * surface's courtesy, not the boundary: `recordOperatorRsvpResponse`
 * re-resolves the invitation inside its own transaction.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** A refusal is rethrown; everything else becomes a sentence for the dialog. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
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
  const operator = await requireGeneralOperator();
  const eventId = text(formData, "eventId");
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
