import "server-only";

import { isServiceError, withTransaction } from "@/lib/db";
import { amendApprovedEvent, NOTHING_CHANGED_RULE } from "./event-amendment";
import type { AmendmentOptions } from "./event-amendment/amend";
import type { EventDraftInput } from "./event-input";
import type { EventMessageInput } from "./event-messages-input";
import { saveApprovedEventMessages } from "./event-messages/store";
import type { EventQuestionInput } from "./event-questions-input";
import { updateEventQuestions } from "./events";

/**
 * One save of an approved event's edit page — the details, the questions and
 * the event messages (LAN-419, LAN-508) — committed together or not at all.
 *
 * Each half keeps its own service and its own refusals. They run inside one
 * transaction (every nested `withTransaction` joins it), so a refusal in a
 * later half — a sent event message removed, or resent after the start —
 * leaves the details and the questions exactly as they were, rather than
 * half the edit saved behind an error.
 *
 * The amendment's "nothing changed" refusal is that half having nothing to
 * do, not a failure, when another half has something to save. It is thrown
 * before the amendment writes anything, so the transaction carries on.
 */
export interface ApprovedEventEdit {
  readonly details: EventDraftInput;
  readonly amendment: AmendmentOptions;
  /** `null` when the questions did not change: their service audits every call. */
  readonly questions: {
    readonly submitted: readonly EventQuestionInput[];
    readonly correction: boolean;
  } | null;
  /** `null` when the event messages did not change. */
  readonly messages: {
    readonly submitted: readonly EventMessageInput[];
    readonly resend: boolean;
  } | null;
}

export async function saveApprovedEventEdit(
  actorPersonId: string,
  eventId: string,
  edit: ApprovedEventEdit,
): Promise<void> {
  await withTransaction(async () => {
    try {
      await amendApprovedEvent(actorPersonId, eventId, edit.details, edit.amendment);
    } catch (error) {
      if (
        !isServiceError(error) ||
        error.rule !== NOTHING_CHANGED_RULE ||
        (edit.questions === null && edit.messages === null)
      ) {
        throw error;
      }
    }
    if (edit.questions !== null) {
      await updateEventQuestions(actorPersonId, eventId, edit.questions.submitted, {
        correction: edit.questions.correction,
      });
    }
    if (edit.messages !== null) {
      await saveApprovedEventMessages(actorPersonId, eventId, edit.messages.submitted, {
        resend: edit.messages.resend,
      });
    }
  });
}
