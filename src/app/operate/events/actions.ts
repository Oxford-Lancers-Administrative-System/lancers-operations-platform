"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  abandonEventDraft,
  createEventDraft,
  submitEventForApproval,
  updateEventDraft,
  validateEventDraft,
  withdrawEventSubmission,
} from "@/lib/services/events";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventFormState, EventTransitionState } from "./form-state";

/**
 * The event workflow's server actions — LAN-76.
 *
 * ## Authorization
 *
 * Every one of them opens with `requireOperator()`, which resolves the actor
 * from the **verified session** and refuses with `NotPermitted` when there is
 * no linked, active operator. None takes an actor argument, and none may: a
 * server action is a POST endpoint the browser can call directly, so an action
 * that accepted "who am I" would accept whatever was sent.
 *
 * Drafting, editing, submitting, withdrawing and abandoning are **ordinary
 * operator work** — `slice-ux.md` § 8's first row, and LAN-73's "everything
 * else in the slice is ordinary operator work". The privileged step is
 * approval, which stays President-only in `src/lib/auth/capabilities.ts` and is
 * built by LAN-77. Nothing here widens that map, and nothing here reads a role.
 *
 * ## Why a refusal is never a form message
 *
 * `NotPermitted` is deliberately excluded from the `catch` below and rethrown.
 * A refusal rendered as red text beside a field reads as "fix your input and
 * try again", which is the wrong instruction and hides an authorization event
 * inside a validation failure. Everything else a service throws — an illegal
 * transition, a constraint, a vanished event — is a sentence the operator can
 * act on, and is returned as state so the form keeps what they typed.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function readDraft(formData: FormData): RawEventDraft {
  return {
    name: text(formData, "name"),
    eventType: text(formData, "eventType"),
    origin: text(formData, "origin"),
    scheduledOn: text(formData, "scheduledOn"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    venue: text(formData, "venue"),
    termId: text(formData, "termId"),
    weekNumber: text(formData, "weekNumber"),
    attendance: text(formData, "attendance"),
    solicitsResponse: text(formData, "solicitsResponse"),
  };
}

/**
 * Turns a service failure into something an operator can read, and lets a
 * refusal through untouched.
 *
 * Rethrowing anything that is not a `ServiceError` matters as much: an
 * unexpected failure must reach the error boundary as itself rather than be
 * flattened into "something is wrong with this form".
 */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/** Create a draft. On success the operator lands on the new event. */
export async function createEventDraftAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireOperator();
  const raw = readDraft(formData);

  const validation = validateEventDraft(raw);
  if (!validation.ok) {
    return { issues: validation.issues, error: null, values: raw };
  }

  let eventId: string;
  try {
    const event = await createEventDraft(operator.personId, validation.value);
    eventId = event.id;
  } catch (error) {
    return { issues: [], error: messageFor(error), values: raw };
  }

  revalidatePath("/operate/events");
  redirect(`/operate/events/${eventId}`);
}

/** Edit a draft. Refused by the service for anything that is not a draft. */
export async function updateEventDraftAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireOperator();
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);

  const validation = validateEventDraft(raw);
  if (!validation.ok) {
    return { issues: validation.issues, error: null, values: raw };
  }

  try {
    await updateEventDraft(operator.personId, eventId, validation.value);
  } catch (error) {
    return { issues: [], error: messageFor(error), values: raw };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}`);
}

/**
 * `draft → pending_approval`.
 *
 * Lands on the event with `submitted=1`, which is what makes UX-33 — the
 * "Event submitted for approval" confirmation — a state of the event route
 * rather than a fifth screen with a route of its own.
 */
export async function submitEventAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireOperator();
  const eventId = text(formData, "eventId");

  try {
    await submitEventForApproval(operator.personId, eventId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}?submitted=1`);
}

/** `pending_approval → draft` — UX-33's "Withdraw submission". */
export async function withdrawEventSubmissionAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireOperator();
  const eventId = text(formData, "eventId");

  try {
    await withdrawEventSubmission(operator.personId, eventId);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}`);
}

/** `draft → withdrawn`. The reason is required, by the club and by the schema. */
export async function abandonEventDraftAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireOperator();
  const eventId = text(formData, "eventId");
  const reason = text(formData, "reason");

  try {
    await abandonEventDraft(operator.personId, eventId, reason);
  } catch (error) {
    return { error: messageFor(error) };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  redirect(`/operate/events/${eventId}`);
}
