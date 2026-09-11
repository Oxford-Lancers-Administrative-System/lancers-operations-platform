"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import { validateEventDraft } from "@/lib/services/events";
import {
  amendApprovedEvent,
  cancelEvent,
  renotifyEvent,
  type AmendableEvent,
} from "@/lib/services/event-amendment";
import type { RawEventDraft } from "@/lib/services/event-input";
import type { EventFormState, EventTransitionState } from "../form-state";
import type { CancelFormState } from "./change-state";

// The three actions W5 and W6 add to an approved event — LAN-156. All three
// guard on `event_approval`, deliberately (event-amendment.ts carries no
// authorization of its own — this guard is the only gate that exists,
// LAN-181 F-D1). silenceConfirmed is required, never defaulted, but is a
// client-asserted boolean the service cannot verify was actually shown.
// Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.

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

/** The event as the submitting form loaded it — LAN-244. Read defensively; a missing/unparseable field is "apply the whole submission". Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
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

function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/** Saves an amendment to an approved event — W5, `REQ-amend-in-place`. One call, so abandoning an amendment writes nothing, by construction. */
export async function amendEventAction(
  _previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const operator = await requireCapability("event_approval");
  const eventId = text(formData, "eventId");
  const raw = readDraft(formData);

  const validation = validateEventDraft(raw);
  if (!validation.ok) {
    // Amending never touches questions (W5 offers none), so these are the
    // same empty values EMPTY_FORM_STATE already carries.
    return {
      issues: validation.issues,
      questionIssues: [],
      error: null,
      values: raw,
      questions: null,
    };
  }

  try {
    await amendApprovedEvent(operator.personId, eventId, validation.value, {
      notify: checked(formData, "notify"),
      silenceConfirmed: checked(formData, "silenceConfirmed"),
      baseline: readBaseline(formData),
    });
  } catch (error) {
    return {
      issues: [],
      questionIssues: [],
      error: messageFor(error),
      values: raw,
      questions: null,
    };
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

/** `approved → cancelled` — W6. One operator, one action, no second approver. */
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
