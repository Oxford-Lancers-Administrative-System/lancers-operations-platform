"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  abandonEventDraft,
  createEventDraft,
  updateEventDraft,
  validateEventDraft,
} from "@/lib/services/events";
import { approveEvent, saveEventAudience } from "@/lib/services/event-approval";
import { dispatchEventInvitations } from "@/lib/services/delivery";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventFormState, EventTransitionState } from "./form-state";

/**
 * The event workflow's server actions — LAN-76, and the approval LAN-77 added.
 *
 * ## Authorization
 *
 * Every one of them opens with `requireCapability(…)`, which resolves the actor
 * from the **verified session** and refuses with `NotPermitted` unless they hold
 * a permitted role. None takes an actor argument, and none may: a server action
 * is a POST endpoint the browser can call directly, so an action that accepted
 * "who am I" would accept whatever was sent.
 *
 * Two capabilities are in play, and which one an action names matters:
 *
 *   * `event_calendar_management` — creating, editing and abandoning a draft.
 *   * `event_approval` — approving one, which is the only action here that
 *     creates invitations and queues messages to real people.
 *
 * They currently name the same four roles, so the distinction has no effect
 * today. It is still not a duplication to collapse: separation of duties is
 * something Brian may add later, and when he does it narrows one list in
 * `capabilities.ts` rather than needing the approval path disentangled from the
 * drafting path across several screens.
 *
 * Brian's LAN-76 clarification is what put a capability here at all. The first
 * implementation used `requireOperator()` — any linked, active operator — on
 * the reading that drafting was ordinary operator work. It is not: "the club
 * calendar is managed only by these four operator roles", and an operator who
 * can reach another part of the application does not thereby get to move
 * practices around. The role lists live in `src/lib/auth/capabilities.ts` and
 * nowhere else, so no action here carries a policy of its own.
 *
 * Nothing here submits an event for approval — Brian removed that step on 12
 * August 2026, because only calendar operators create events and so there is
 * nobody to submit one to. A saved event is a draft, and approval takes it
 * straight from there.
 *
 * There is no ownership term in any of them. Any calendar operator may edit,
 * withdraw or abandon any draft, and any approver may approve their own —
 * the calendar is the club's, and `owner_person_id` is recorded for the audit
 * trail rather than consulted for permission.
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
    scheduledOn: text(formData, "scheduledOn"),
    startsAt: text(formData, "startsAt"),
    endsAt: text(formData, "endsAt"),
    venue: text(formData, "venue"),
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
  const operator = await requireCapability("event_calendar_management");
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
  const operator = await requireCapability("event_calendar_management");
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
 * `draft → approved` — the one action in this slice that sends anything to a
 * real person. LAN-77.
 *
 * Three things about it are deliberate.
 *
 * **It guards on `event_approval`, not on `event_calendar_management`.** The two
 * capabilities currently name the same four roles, so today the check is
 * equivalent — and it is still the wrong one to reuse. Approval is the gate that
 * releases automated messages, and separation of duties is explicitly something
 * Brian may add later; when he does, it narrows one list in `capabilities.ts`
 * and this action changes not at all.
 *
 * **It carries no audience at all.** The audience is already stored against the
 * draft by `saveEventAudienceAction`, so the only thing this posts is which
 * event. A browser therefore cannot widen the list between the confirmation
 * screen and the write, because it is not sending a list.
 *
 * **It does not check the count.** The confirmation screen shows UX-42 when the
 * stored audience is empty, and that is a courtesy: a client skipping the screen
 * entirely still reaches invariant E1b's refusal in the service layer rather
 * than producing an approval nobody would receive.
 */
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

  // LAN-78. Approval is what makes distribution automatic — "event approval
  // automatically queues or initiates one WhatsApp invitation per approved
  // opted-in audience member", and there is no operator action anywhere that
  // means "now send them".
  //
  // Deliberately outside the try above, and deliberately not able to fail this
  // action. The approval is committed; a provider that is down, unconfigured or
  // rate-limiting must not turn a successful approval into an error message,
  // because retrying it would be refused — the event is no longer a draft. Each
  // job records its own failure and appears on the delivery screen as Failed or
  // Retryable, which is the surface built for exactly this.
  try {
    await dispatchEventInvitations(eventId);
  } catch {
    // Swallowed on purpose, and it is the one swallowed error in this file.
    // Every outcome worth acting on is already durable in `notification_jobs`
    // and `delivery_attempts`; what is discarded here is only the summary the
    // operator does not see anyway. Rethrowing would show them an error about
    // an approval that succeeded.
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?approved=1`);
}

/**
 * Saves the audience proposed against a draft, and moves to the confirmation.
 *
 * Separate from approval because the audience is now stored on the draft rather
 * than assembled at the moment of approval — Brian's decision, after the first
 * implementation lost a forty-person audience when he pressed **Edit draft**.
 *
 * It redirects rather than returning the saved list, so the confirmation screen
 * renders from the database rather than from whatever the browser last held.
 * That is what makes the audience survive an edit, a refresh, a closed tab and a
 * second operator — the screen has no private copy to lose.
 *
 * An empty selection is saved, not refused. Clearing an audience is a thing an
 * operator must be able to do; the confirmation screen then shows UX-42 and
 * approval refuses it under invariant E1b.
 */
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

/** `draft → withdrawn`. The reason is required, by the club and by the schema. */
export async function abandonEventDraftAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("event_calendar_management");
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
