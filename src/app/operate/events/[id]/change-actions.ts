"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import {
  previewEventQuestionChanges,
  readEventQuestions,
  requireEventGrant,
  updateEventQuestions,
  validateEventDraft,
} from "@/lib/services/events";
import {
  eventQuestionsDiffer,
  validateEventQuestions,
  type RawEventQuestion,
} from "@/lib/services/event-questions-input";
import {
  amendApprovedEvent,
  cancelEvent,
  NOTHING_CHANGED_RULE,
  renotifyEvent,
  type AmendableEvent,
} from "@/lib/services/event-amendment";
import { addEventAudienceMembers } from "@/lib/services/event-audience-amendment";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventFormState, EventTransitionState } from "../form-state";
import type { CancelFormState } from "./change-state";

// The actions W5 and W6 add to an approved event — LAN-156. Every one guards
// on Manage on the event's stored template (LAN-431; `event_approval` before
// it), deliberately (event-amendment.ts carries no authorization of its own —
// this guard is the only gate that exists, LAN-181 F-D1). silenceConfirmed is
// required, never defaulted, but is a client-asserted boolean the service
// cannot verify was actually shown.
//
// LAN-419 replaced `amendEventAction` with `editApprovedEventAction`: one
// save for the details and the questions together. Nothing posts the details
// alone any more.

/**
 * Manage on this event's template; a missing event or a refusal is a message
 * (LAN-423): a seat whose Manage was lowered under an open page gets the
 * refusal in the page's Notice, never "This page couldn't load".
 */
async function managerOf(eventId: string): Promise<ResolvedOperator | { error: string }> {
  try {
    return await requireEventGrant(eventId, "manage");
  } catch (error) {
    return { error: messageFor(error) };
  }
}

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function checked(formData: FormData, field: string): boolean {
  return text(formData, field) === "on" || text(formData, field) === "true";
}

function readDraft(formData: FormData): RawEventDraft {
  return {
    name: text(formData, "name"),
    templateId: text(formData, "templateId"),
    scheduledOn: text(formData, "scheduledOn"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    deliveryMode: text(formData, "deliveryMode"),
    venue: text(formData, "venue"),
    description: text(formData, "description"),
    requiredEquipment: text(formData, "requiredEquipment"),
    joiningUrl: text(formData, "joiningUrl"),
    attendance: text(formData, "attendance"),
  };
}

/**
 * The question cards a submission carries — LAN-419, the same reading
 * `events/actions.ts` does for the draft form, because it is the same
 * `QuestionEditor` posting the same fields. `null` is "this form posted no
 * questions at all", which is not the same as "it posted none".
 */
function readQuestions(formData: FormData): RawEventQuestion[] | null {
  if (formData.get("questionsPresent") === null) return null;

  const strings = (field: string) =>
    formData.getAll(field).map((value) => (typeof value === "string" ? value : ""));

  const ids = strings("questionId");
  const prompts = strings("questionPrompt");
  const answerTypes = strings("questionAnswerType");
  const required = strings("questionRequired");
  const choices = strings("questionChoices");
  const fromTemplate = strings("questionFromTemplate");

  return prompts.map((prompt, index) => ({
    id: ids[index] ?? "",
    prompt,
    answerType: answerTypes[index] ?? "",
    required: required[index] ?? "",
    choices: choices[index] ?? "",
    fromTemplate: fromTemplate[index] ?? "false",
  }));
}

/** The event as the submitting form loaded it — LAN-244. Read defensively; a missing/unparseable field is "apply the whole submission". */
function readBaseline(formData: FormData): AmendableEvent | undefined {
  const raw = formData.get("baseline");
  if (typeof raw !== "string" || raw === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    return parsed as AmendableEvent;
  } catch {
    return undefined;
  }
}

/**
 * A form's message for any service failure, a refusal included — LAN-423. A
 * save refused because Manage was lowered under an open form comes back as the
 * form's own error, shown in its Notice with every entry intact, rather than a
 * crashed page. Anything that is not a `ServiceError` still throws.
 */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  return error.message;
}

/**
 * LAN-419 — one save for an approved event's details *and* its questions.
 *
 * Brian, on the 2026-09-22 call: "for some reason when the system made its
 * decision edit event and edit questions were two buttons. Why? No idea why…
 * Edit event and edit question should be in one." A draft has always been
 * editable whole; an approved event was the odd one out.
 *
 * What each half does is untouched. A detail change still goes through
 * `amendApprovedEvent` — the amendment path, its notify decision and its
 * re-notification (W5, LAN-244). A question change still goes through
 * `updateEventQuestions`, which sends nothing for a wording change, voids and
 * re-asks a changed question (LAN-367), removes nothing, and honours D3's
 * correction tick. This composes them; it decides nothing new.
 *
 * Three things are worth saying about the composition.
 *
 * It guards once, on Manage on the event's template (LAN-431): the amendment
 * and the questions are both Manage, so there is one decision, not two.
 *
 * Nothing is written until the whole save is confirmed. LAN-367's confirmation
 * comes back before either write, so an operator who abandons it at the
 * confirmation has changed neither the venue nor the questions — the same
 * "abandoning writes nothing, by construction" the amendment already had.
 *
 * The questions half runs only when the questions actually differ.
 * `updateEventQuestions` records an audit row on every call, and "the operator
 * changed the questions" is not true of a save that only moved the venue.
 */
export async function editApprovedEventAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);
  const rawQuestions = readQuestions(formData);

  // LAN-423: every failure from here on, a refusal included, is the form's
  // own error, and the operator's entries come back with it.
  const refused = (message: string): EventFormState => ({
    issues: [],
    questionIssues: [],
    error: message,
    values: raw,
    questions: rawQuestions,
    questionChange: null,
  });

  let operator: ResolvedOperator;
  try {
    operator = await requireEventGrant(eventId, "manage");
  } catch (error) {
    return refused(messageFor(error));
  }

  const validation = validateEventDraft(raw);
  const questions = validateEventQuestions(rawQuestions ?? []);
  if (!validation.ok || !questions.ok) {
    return {
      issues: validation.ok ? [] : validation.issues,
      questionIssues: questions.ok ? [] : questions.issues,
      error: null,
      values: raw,
      questions: rawQuestions,
      questionChange: null,
    };
  }

  const submitted = questions.value;
  const confirmed = text(formData, "confirm") === "1";
  const correction = text(formData, "correction") === "1";

  let questionsChanged: boolean;
  try {
    const stored = await readEventQuestions(eventId);
    questionsChanged =
      rawQuestions !== null &&
      eventQuestionsDiffer(
        stored.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          answerType: question.answerType,
          isRequired: question.isRequired,
          choices: question.choices,
          fromTemplate: question.fromTemplate,
        })),
        submitted,
      );
  } catch (error) {
    return refused(messageFor(error));
  }

  if (questionsChanged && !confirmed) {
    try {
      const preview = await previewEventQuestionChanges(eventId, submitted);
      if (
        preview.peopleToAsk > 0 &&
        (preview.changedPrompts.length > 0 || preview.addedCount > 0)
      ) {
        return {
          issues: [],
          questionIssues: [],
          error: null,
          values: raw,
          questions: rawQuestions,
          questionChange: {
            changedPrompts: [...preview.changedPrompts],
            addedCount: preview.addedCount,
            peopleToAsk: preview.peopleToAsk,
          },
        };
      }
    } catch (error) {
      return refused(messageFor(error));
    }
  }

  try {
    await amendApprovedEvent(operator.personId, eventId, validation.value, {
      notify: checked(formData, "notify"),
      silenceConfirmed: checked(formData, "silenceConfirmed"),
      baseline: readBaseline(formData),
    });
  } catch (error) {
    // A questions-only save reaches the amendment with an empty diff, and the
    // amendment is right to refuse an empty one — it would write a schedule
    // change nobody made and hold every queued message for it. That refusal is
    // this page's "there was nothing to do on the details half", and nothing
    // else. Every other refusal is still a refusal.
    if (!isServiceError(error) || error.rule !== NOTHING_CHANGED_RULE || !questionsChanged) {
      return refused(messageFor(error));
    }
  }

  try {
    if (questionsChanged) {
      await updateEventQuestions(operator.personId, eventId, submitted, { correction });
    }
  } catch (error) {
    return refused(messageFor(error));
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?amended=1`);
}

/** D54's recovery path — sends the change to the same audience, and nothing else. */
export async function renotifyEventAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const eventId = text(formData, "eventId");
  const operator = await managerOf(eventId);
  if ("error" in operator) return operator;

  try {
    await renotifyEvent(operator.personId, eventId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?renotified=1`);
}

/**
 * LAN-393 — adding a named person to an approved event's audience.
 *
 * Its own action for the same reason it is its own service: the amendment diff
 * refuses an audience-only change outright. Guarded on Manage on the event's
 * template, like the three above.
 */
export async function addEventAudienceAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const eventId = text(formData, "eventId");
  const operator = await managerOf(eventId);
  if ("error" in operator) return operator;
  const keys = formData
    .getAll("audienceKey")
    .filter((key): key is string => typeof key === "string");

  try {
    await addEventAudienceMembers(operator.personId, eventId, keys);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?audienceAdded=1`);
}

/** `approved → cancelled` — W6. One operator, one action, no second approver. */
export async function cancelEventAction(
  _previous: CancelFormState,
  formData: FormData,
): Promise<CancelFormState> {
  const eventId = text(formData, "eventId");
  const reason = text(formData, "reason");
  const operator = await managerOf(eventId);
  if ("error" in operator) return { error: operator.error, reason };

  try {
    await cancelEvent(operator.personId, eventId, {
      reason,
      notify: checked(formData, "notify"),
      silenceConfirmed: checked(formData, "silenceConfirmed"),
    });
  } catch (error) {
    return { error: messageFor(error), reason };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?cancelled=1`);
}
