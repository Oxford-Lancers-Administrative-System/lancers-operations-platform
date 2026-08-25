"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { validateEventDraft } from "@/lib/services/events";
import { amendApprovedEvent, cancelEvent, renotifyEvent } from "@/lib/services/event-amendment";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventFormState, EventTransitionState } from "../form-state";
import type { CancelFormState } from "./change-state";

/**
 * The three actions W5 and W6 add to an approved event — LAN-156.
 *
 * ## Authorization
 *
 * All three guard on `event_approval`, and that is the deliberate choice rather
 * than the convenient one. `event_calendar_management` names the same four
 * roles today, so the check is currently equivalent either way — and
 * `event_approval` is the capability whose action is "approve an event and
 * release its invitations", which is exactly what these three do. An amendment
 * that notifies, a re-notify and a cancellation all make a message owing to
 * every invited person. When Brian narrows one of the two lists, these actions
 * follow the one that gates messages to real people.
 *
 * W5 states it directly — "Approval capability is required, enforced in the
 * service layer" — and W6's "a non-operator attempts it: refused in the service
 * layer" is the same sentence from the other end. The guard here is the
 * courtesy; `event-amendment.ts` refuses regardless of which button was
 * rendered.
 *
 * ## Why the silence confirmation is checked twice — R156-A3
 *
 * The screen shows the confirmation and posts `silenceConfirmed` only after the
 * operator has passed it. That is what the operator experiences, and it is not
 * the whole guarantee: a server action is a POST endpoint the browser can
 * call directly, so a client that skips the screen entirely and posts
 * `notify=off` with no `silenceConfirmed` field at all is refused —
 * `amendApprovedEvent` and `cancelEvent` require the flag, rather than
 * defaulting a missing one to `false` and silencing by accident.
 *
 * What this does **not** guarantee: `silenceConfirmed` is itself a
 * client-asserted boolean, indistinguishable on the wire from a screen an
 * operator actually clicked through and a raw POST that simply sets it to
 * `true`. The service can refuse an omitted confirmation; it cannot tell a
 * confirmed dialog from a forged one, because nothing about the request ties
 * it to having been shown. The acceptance evidence — "cannot be done without
 * passing a confirmation" — is asserted against the service, and is true in
 * exactly that narrower sense.
 *
 * ## Why a refusal is never a form message
 *
 * `NotPermitted` is rethrown rather than rendered, exactly as `../actions.ts`
 * does it and for the same reason: a refusal shown as red text beside a field
 * reads as "fix your input", which hides an authorization event inside a
 * validation failure.
 */

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
    eventType: text(formData, "eventType"),
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

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/**
 * Saves an amendment to an approved event — W5, REQ-amend-in-place.
 *
 * One call, with everything: the fields, the single notify decision, and
 * whether the silence confirmation was passed. There is no half-saved
 * amendment anywhere, which is what makes "abandoning an amendment writes
 * nothing" true by construction rather than by a cleanup path.
 */
export async function amendEventAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);

  const validation = validateEventDraft(raw);
  if (!validation.ok) {
    return { issues: validation.issues, error: null, values: raw };
  }

  try {
    await amendApprovedEvent(operator.personId, eventId, validation.value, {
      notify: checked(formData, "notify"),
      silenceConfirmed: checked(formData, "silenceConfirmed"),
    });
  } catch (error) {
    return { issues: [], error: messageFor(error), values: raw };
  }

  revalidatePath("/operate/events");
  revalidatePath(`/operate/events/${eventId}`);
  revalidatePath(`/operate/events/${eventId}/delivery`);
  redirect(`/operate/events/${eventId}?amended=1`);
}

/**
 * D54's recovery path — sends the change to the same audience, and nothing else.
 *
 * A `revalidatePath` on the event and on delivery, and none on the event list:
 * nothing about the event changed, so the list has nothing to re-read.
 */
export async function renotifyEventAction(
  _previous: EventTransitionState,
  formData: FormData,
): Promise<EventTransitionState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");

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
 * `approved → cancelled` — W6. One operator, one action, no second approver.
 *
 * The reason comes back on the state when the save is refused, so an operator
 * who typed two sentences about a waterlogged pitch does not retype them.
 */
export async function cancelEventAction(
  _previous: CancelFormState,
  formData: FormData,
): Promise<CancelFormState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");
  const reason = text(formData, "reason");

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
