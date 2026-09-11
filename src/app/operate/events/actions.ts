"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  createEventDraft,
  deleteEventDraft,
  updateEventDraft,
  updateEventQuestions,
  validateEventDraft,
  validateEventQuestions,
} from "@/lib/services/events";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { dispatchEventInvitations } from "@/lib/services/delivery";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventQuestionInput, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { EventFormState, EventTransitionState } from "./form-state";

// The event workflow's server actions — LAN-76, LAN-77. Every action opens
// with requireCapability() against the verified session; NotPermitted is
// rethrown, not a form message. No ownership term.

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
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

/** Turns a service failure into a readable message; rethrows a refusal or anything not a `ServiceError`. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/** The questions the form posted. `null` (not empty) when the form carried no questions section at all. */
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

/** Where a successful save lands. A whitelist, not a path, so a crafted post can't redirect elsewhere. */
function destinationAfterSave(formData: FormData, eventId: string): string {
  return formData.get("then") === "audience"
    ? `/operate/events/${eventId}?step=audience`
    : `/operate/events/${eventId}`;
}

export async function createEventDraftAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireCapability("event_calendar_management");
  const raw = readDraft(formData);
  const rawQuestions = readQuestions(formData);

  const validation = validateEventDraft(raw);
  const questions = validateEventQuestions(rawQuestions ?? []);
  if (!validation.ok || !questions.ok) {
    return {
      issues: validation.ok ? [] : validation.issues,
      questionIssues: questions.ok ? [] : questions.issues,
      error: null,
      values: raw,
      questions: rawQuestions,
    };
  }

  let eventId: string;
  try {
    const event = await createEventDraft(
      operator.personId,
      validation.value,
      // undefined, not [], so the draft inherits its type's default questions.
      rawQuestions === null ? undefined : (questions.value as EventQuestionInput[]),
    );
    eventId = event.id;
  } catch (error) {
    return {
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: raw,
      questions: rawQuestions,
    };
  }

  revalidatePath("/operate/events");
  redirect(destinationAfterSave(formData, eventId));
}

export async function updateEventDraftAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireCapability("event_calendar_management");
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);
  const rawQuestions = readQuestions(formData);

  const validation = validateEventDraft(raw);
  const questions = validateEventQuestions(rawQuestions ?? []);
  if (!validation.ok || !questions.ok) {
    return {
      issues: validation.ok ? [] : validation.issues,
      questionIssues: questions.ok ? [] : questions.issues,
      error: null,
      values: raw,
      questions: rawQuestions,
    };
  }

  try {
    await updateEventDraft(
      operator.personId,
      eventId,
      validation.value,
      rawQuestions === null ? undefined : (questions.value as EventQuestionInput[]),
    );
  } catch (error) {
    return {
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: raw,
      questions: rawQuestions,
    };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(destinationAfterSave(formData, eventId));
}

/**
 * Changes what an approved event asks — LAN-318, amending D41. The same question editor the draft
 * uses, on its own, with nothing else on the form and no Remove control. Nothing is sent: this
 * action queues no notification and touches no delivery.
 */
export async function updateEventQuestionsAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireCapability("event_calendar_management");
  const eventId = text(formData, "eventId");
  const rawQuestions = readQuestions(formData);

  const questions = validateEventQuestions(rawQuestions ?? []);
  if (!questions.ok) {
    return {
      issues: [],
      questionIssues: questions.issues,
      error: null,
      values: null,
      questions: rawQuestions,
    };
  }

  try {
    await updateEventQuestions(operator.personId, eventId, questions.value as EventQuestionInput[]);
  } catch (error) {
    return {
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: null,
      questions: rawQuestions,
    };
  }

  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}`);
}

/** Deletes a draft, permanently — `REQ-delete-draft`, D29. */
export async function deleteEventDraftAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("event_calendar_management");
  const eventId = text(formData, "eventId");

  try {
    await deleteEventDraft(operator.personId, eventId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/operate/events");
  revalidatePath("/operate/events/calendar");
  redirect("/operate/events?deleted=1");
}

/** `draft → approved` — the one action that sends anything to a real person. LAN-77. */
export async function approveEventAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");

  try {
    await approveEvent(operator.personId, eventId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  // Dispatches only what's due now (LAN-78/LAN-169, W1); never fails this action — relocations.md.
  try {
    await dispatchEventInvitations(eventId);
  } catch {
    // Swallowed on purpose — see relocations.md. Every outcome worth acting on
    // is already durable in notification_jobs / delivery_attempts.
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?approved=1`);
}

/** Saves the proposed audience against a draft, and moves to the confirmation. */
export async function saveEventAudienceAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");
  const keys = formData
    .getAll("audienceKey")
    .filter((key): key is string => typeof key === "string");

  try {
    await saveEventAudience(operator.personId, eventId, keys);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}?step=review`);
}

// Retired, not moved: occurrence assertion (D30) and abandonEventDraftAction (superseded by deleteEventDraftAction, D29).
