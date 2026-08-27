"use server";

import { revalidatePath } from "next/cache";

import { requireGeneralOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { recordOperatorRsvpResponse } from "@/lib/services/rsvp";

import type { RecordAnswerState } from "./record-answer-state";

/**
 * Records what an operator was told in person — W3, LAN-170.
 *
 * The floor is `requireGeneralOperator()`, matching `readOperatorParticipation`
 * exactly: the workflow's own "which operator roles may record" question is
 * still open for Brian (recorded in the packet as "Open — needs Brian"), and
 * its recommended default — "any authorized operator who can already see the
 * participation table" — is the boundary the read side already draws. This
 * action asks for nothing narrower, so it is never the reason a role that can
 * see the row cannot use the control on it.
 *
 * `RecordAnswerControl` is rendered only against a row with no answer at all —
 * see `participation-table.tsx` — but that is the courtesy the surface offers,
 * never the boundary. `recordOperatorRsvpResponse` re-resolves the invitation
 * inside its own transaction and does not trust anything this action read
 * off a stale render.
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

/**
 * Every `question:<id>` field the dialog posted, keyed back to the bare
 * question id `recordOperatorRsvpResponse` expects. A field the operator left
 * blank still arrives (an empty string), and stays blank all the way down —
 * `recordOperatorRsvpResponse` treats that as "left outstanding", never as "no
 * answer" the way a stored response would.
 */
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

  // No redirect: the dialog closes itself on `success`, and the table
  // underneath refreshes from the same revalidation — the operator keeps
  // their place in the list, the way every other row action in this
  // application already does.
  revalidatePath(`/operate/events/${eventId}`);
  return { error: null, success: true };
}
