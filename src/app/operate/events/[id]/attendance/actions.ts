"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { isServiceError } from "@/lib/db";
import {
  isAttendancePresence,
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
  type AttendancePresence,
} from "@/lib/services/attendance";
import { requireEventGrant } from "@/lib/services/events";
import type { AttendanceSaveState, WalkUpFormState } from "./action-state";

// The attendance server actions — LAN-80. `attendance_recording` (general
// operators + coaching seats, `slice-ux.md` § 8) guards record/save/walk-up;
// Manage on the event's template guards removal (LAN-431; LAN-110 excludes
// coaches from that, and a coaching seat holds no template by default).

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** Every service failure, a refusal included (LAN-423), becomes a sentence for the screen; a bug still throws. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  return error.message;
}

/** A guard's refusal as the row's own state (LAN-423): the row keeps what was stored. */
function rowRefusal(key: string, error: unknown): AttendanceSaveState {
  return {
    key,
    presence: null,
    recordedAt: null,
    recordedByName: null,
    attempted: null,
    error: messageFor(error),
  };
}

/** Saves one participant's attendance; never redirects — § 9 needs the row's own Saving/Saved state. */
export async function recordAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const eventId = text(formData, "eventId");
  const key = text(formData, "participantKey");
  const presence = text(formData, "presence");

  let operator: ResolvedOperator;
  try {
    operator = await requireCapability("attendance_recording");
  } catch (error) {
    return rowRefusal(key, error);
  }

  // Narrowed here rather than cast, so the service is never handed a value the
  // enum has no member for.
  if (!isAttendancePresence(presence)) {
    return {
      key,
      presence: null,
      recordedAt: null,
      recordedByName: null,
      attempted: null,
      error: "Choose Present, Late, Excused or Absent.",
    };
  }
  const attempted: AttendancePresence = presence;

  try {
    const saved = await recordAttendance(operator.personId, eventId, key, attempted);
    revalidatePath(`/operate/events/${eventId}/attendance`);
    return {
      key: saved.key,
      presence: saved.presence,
      recordedAt: saved.recordedAt,
      recordedByName: saved.recordedByName,
      attempted: null,
      error: null,
    };
  } catch (error) {
    return {
      key,
      presence: null,
      recordedAt: null,
      recordedByName: null,
      attempted,
      error: messageFor(error),
    };
  }
}

/** Removes one attendance record — the only way to unwind a mistaken row. Guarded on Manage on the event's template (LAN-431), not LAN-110's coach capability. */
export async function removeAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const eventId = text(formData, "eventId");
  const key = text(formData, "participantKey");

  let operator: ResolvedOperator;
  try {
    operator = await requireEventGrant(eventId, "manage");
  } catch (error) {
    return rowRefusal(key, error);
  }

  try {
    await removeAttendance(operator.personId, eventId, key);
  } catch (error) {
    return {
      key,
      presence: null,
      recordedAt: null,
      recordedByName: null,
      attempted: null,
      error: messageFor(error),
    };
  }

  revalidatePath(`/operate/events/${eventId}/attendance`);
  redirect(`/operate/events/${eventId}/attendance`);
}

const WALK_UP_PRESENCE: AttendancePresence = "present";

/** UX-73 — records somebody never invited, and nothing else (a person, contacts, a recruitment prospect; no membership, no onboarding). */
export async function recordWalkUpAction(
  _previous: WalkUpFormState,
  formData: FormData,
): Promise<WalkUpFormState> {
  const eventId = text(formData, "eventId");

  const values = {
    givenName: text(formData, "givenName"),
    familyName: text(formData, "familyName"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
  };

  let operator: ResolvedOperator;
  try {
    operator = await requireCapability("attendance_recording");
  } catch (error) {
    return { error: messageFor(error), values };
  }

  try {
    await recordWalkUpAttendance(operator.personId, eventId, {
      givenName: values.givenName,
      familyName: values.familyName,
      phone: values.phone,
      email: values.email === "" ? null : values.email,
      // Fixed here, not read from the form — Brian, 14 August 2026.
      presence: WALK_UP_PRESENCE,
    });
  } catch (error) {
    return { error: messageFor(error), values };
  }

  revalidatePath(`/operate/events/${eventId}/attendance`);
  redirect(`/operate/events/${eventId}/attendance?added=walk-up`);
}
