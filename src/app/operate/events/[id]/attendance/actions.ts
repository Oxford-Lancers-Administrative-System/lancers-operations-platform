"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/guards";
import { isServiceError } from "@/lib/db";
import {
  isAttendancePresence,
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
  type AttendancePresence,
} from "@/lib/services/attendance";
import type { AttendanceSaveState, WalkUpFormState } from "./action-state";

/**
 * The attendance server actions — LAN-80.
 *
 * ## Which capability, and the one this file got wrong first
 *
 * `attendance_recording` — the union of the four calendar roles and the three
 * coaching seats. `docs/ux/slice-ux.md` § 8 splits attendance in two and both
 * halves land here:
 *
 *   * **General attendance** — "Authorized operator after `occurred`". The
 *     surface the Exec, the Secretary and the General Manager use, so gating it
 *     on the narrow coaching grant would lock them out of their own screen.
 *
 *   * **Coach attendance** — Brian's 12 August 2026 decision puts the Head
 *     Coach, Offensive Coordinator and Defensive Coordinator on this workflow
 *     explicitly, which is why those three seats are in the grant too.
 *
 * The first implementation used `requireOperator()`, the ordinary-operator
 * floor, reading § 8's "authorized operator" as "any linked operator".
 * Independent review showed that fails one of LAN-80's own criteria: Brian's
 * coach decision requires that "an unauthorized coach and ordinary player are
 * refused at the service boundary, including direct action calls", and a floor
 * admitting every linked operator does not refuse an ordinary player who
 * happens to hold an operator account. The floor was not merely generous; it
 * was wrong against a recorded criterion.
 *
 * `attendance_recorder` stays exactly the three coaching seats and is untouched
 * by this. It answers a different question — "is the constrained screen yours"
 * — which LAN-110 asks. A Secretary holds `attendance_recording` and not that
 * one, and gets the operator's board.
 *
 * ## What is still refused, and by whom
 *
 *   * **The event's state.** Every write goes through the service, which locks
 *     the event and refuses anything that is not `occurred`; underneath that,
 *     the cascading composite foreign key makes the row impossible to write at
 *     all. Two independent refusals, neither relying on the other.
 *
 *   * **Who the write is about.** A posted participant key is resolved against
 *     rows that already exist for *this* event. A key naming somebody else's
 *     membership is a `NotFound`, not a new attendance record.
 *
 *   * **The occurrence assertion itself.** Not here. It is
 *     `assertEventOutcomeAction` in `../../actions.ts`, guarded on
 *     `event_occurrence_assertion`, because a recorder may say who turned up
 *     and may not say that there was anything to turn up to.
 */

function text(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

/** A refusal is rethrown; everything else becomes a sentence for the screen. */
function messageFor(error: unknown): string {
  if (!isServiceError(error)) throw error;
  if (error.kind === "not_permitted") throw error;
  return error.message;
}

/**
 * Saves one participant's attendance, and reports what is now committed.
 *
 * It deliberately does not redirect. § 9 requires the row to show `Saving…`,
 * then the committed value with its actor and time, or a failure that keeps the
 * unsaved selection visible next to what is really recorded — none of which
 * survives a navigation. `revalidatePath` still refreshes the server-rendered
 * board underneath, so the rest of the screen catches up with a second
 * recorder's saves without the operator losing their place.
 */
export async function recordAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const operator = await requireCapability("attendance_recording");
  const eventId = text(formData, "eventId");
  const key = text(formData, "participantKey");
  const presence = text(formData, "presence");

  // Narrowed here rather than cast, so the service is never handed a value the
  // enum has no member for. The service checks it again — a caller that is not
  // this action exists, and will exist more once LAN-110 adds its own surface.
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

/**
 * Removes one attendance record.
 *
 * The only way to unwind an occurrence assertion made against the wrong event:
 * the assertion cannot be corrected while attendance hangs off it, so without
 * this there is no route back at all. It is not the way to change somebody's
 * state — that is a save, which is audited as a correction and keeps the
 * history.
 *
 * ## Why this one guards on the assertion, and the other two do not. LAN-110
 *
 * Because it *is* the assertion, one step removed. This control exists so that
 * an operator who marked the wrong event `occurred` can get back out of it, and
 * LAN-110's fixed boundary is explicit that "coaches cannot mark an event
 * occurred or not held unless a separate authorization rule explicitly grants
 * that action". Leaving removal on `attendance_recording` would have handed a
 * coach the one action whose purpose is to make that assertion editable — the
 * boundary by a different door.
 *
 * It is also not in what LAN-110 permits. The capability is "record and correct
 * Present, Absent, Late or Excused"; a correction keeps the observation and the
 * history, and a removal destroys the evidence that anybody watched at all.
 *
 * This narrows LAN-80, which had removal on `attendance_recording`, and narrows
 * nothing else: the four calendar roles that could remove a record still can.
 */
export async function removeAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const operator = await requireCapability("event_occurrence_assertion");
  const eventId = text(formData, "eventId");
  const key = text(formData, "participantKey");

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

/**
 * The attendance a walk-up is always recorded with. See
 * `WALK_UP_ALWAYS_PRESENT` in `./presentation.ts` for why the form stopped
 * asking, and why this is not a lock.
 */
const WALK_UP_PRESENCE: AttendancePresence = "present";

/**
 * UX-73 — records somebody who was never invited, and nothing else.
 *
 * No membership, no onboarding, no recruitment record. On success it returns to
 * the board, where the new row carries the walk-up flag the view computes for
 * it and sits in the board's own Walk-ups group.
 */
export async function recordWalkUpAction(
  _previous: WalkUpFormState,
  formData: FormData,
): Promise<WalkUpFormState> {
  const operator = await requireCapability("attendance_recording");
  const eventId = text(formData, "eventId");

  const values = {
    name: text(formData, "name"),
    contact: text(formData, "contact"),
    presence: WALK_UP_PRESENCE,
    membershipId: text(formData, "membershipId"),
  };

  try {
    await recordWalkUpAttendance(operator.personId, eventId, {
      name: values.name,
      contact: values.contact === "" ? null : values.contact,
      // Fixed here, not read from the form — Brian, 14 August 2026. The form no
      // longer asks, so a `presence` in the body came from somewhere else, and
      // a server action is a POST endpoint anybody with a session can call. The
      // value the club's rule produces is the value that gets written, and the
      // row's four buttons correct it afterwards like any other.
      presence: WALK_UP_PRESENCE,
      membershipId: values.membershipId === "" ? null : values.membershipId,
    });
  } catch (error) {
    return { error: messageFor(error), values };
  }

  revalidatePath(`/operate/events/${eventId}/attendance`);
  redirect(`/operate/events/${eventId}/attendance?added=walk-up`);
}
