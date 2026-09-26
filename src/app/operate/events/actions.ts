"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireGrant } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import {
  ANY_TEMPLATE_MANAGE,
  createEventDraft,
  deleteEventDraft,
  requireEventGrant,
  requireTemplateGrant,
  updateEventDraft,
  validateEventDraft,
  validateEventQuestions,
} from "@/lib/services/events";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { dispatchEventInvitations } from "@/lib/services/delivery";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventQuestionInput, RawEventQuestion } from "@/lib/services/event-questions-input";
import type { EventFormState, EventTransitionState } from "./form-state";

// The event workflow's server actions — LAN-76, LAN-77. Every action requires
// Manage on the event's template (LAN-431) against the verified session: the
// template read from the stored event, and for a create or a change of
// template, the template posted as well. NotPermitted is rethrown, not a form
// message — except by the edit save, which hands it back to the open form
// (LAN-423). No ownership term.

/** Manage on this event's template; a missing event is a message for the form, a refusal is thrown. */
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

/**
 * A form's message for any service failure, a refusal included — LAN-423. A
 * save refused because Manage was lowered under an open form comes back as the
 * form's own error, shown in its Notice with every entry intact, rather than a
 * crashed page. Anything that is not a `ServiceError` still throws.
 */
function formMessageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
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
  await requireGrant(ANY_TEMPLATE_MANAGE);
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

  // Only a template this seat manages; a forged one is refused, not saved.
  const operator = await requireTemplateGrant(validation.value.templateId, "manage");

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
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);
  const rawQuestions = readQuestions(formData);

  // LAN-423: every failure from here on, a refusal included, is the form's
  // own error, and the operator's entries come back with it.
  const refused = (error: unknown): EventFormState => ({
    issues: [],
    questionIssues: [],
    error: formMessageFor(error),
    values: raw,
    questions: rawQuestions,
  });

  try {
    await requireEventGrant(eventId, "manage");
  } catch (error) {
    return refused(error);
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
    };
  }

  try {
    // A draft may move to another template only one this seat also manages.
    const operator = await requireTemplateGrant(validation.value.templateId, "manage");
    await updateEventDraft(
      operator.personId,
      eventId,
      validation.value,
      rawQuestions === null ? undefined : (questions.value as EventQuestionInput[]),
    );
  } catch (error) {
    return refused(error);
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(destinationAfterSave(formData, eventId));
}

/** Deletes a draft, permanently — `REQ-delete-draft`, D29. */
export async function deleteEventDraftAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const eventId = text(formData, "eventId");
  const operator = await managerOf(eventId);
  if ("error" in operator) return operator;

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
  const eventId = text(formData, "eventId");
  const operator = await managerOf(eventId);
  if ("error" in operator) return operator;

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
  const eventId = text(formData, "eventId");
  const operator = await managerOf(eventId);
  if ("error" in operator) return operator;
  const keys = formData
    .getAll("audienceKey")
    .filter((key): key is string => typeof key === "string");
  // LAN-392: which group buttons were pressed, posted beside the keys rather
  // than inferred from them. The service decides which of them this event's
  // type actually offers.
  const groups = formData
    .getAll("audienceGroup")
    .filter((group): group is string => typeof group === "string");

  try {
    await saveEventAudience(operator.personId, eventId, keys, groups);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}?step=review`);
}

// Retired, not moved: occurrence assertion (D30) and abandonEventDraftAction (superseded by deleteEventDraftAction, D29).
