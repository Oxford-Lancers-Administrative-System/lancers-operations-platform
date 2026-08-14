"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOperator } from "@/lib/auth/guards";
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
 * ## Why these guard on `requireOperator()` and not on a capability
 *
 * `docs/ux/slice-ux.md` § 8 splits attendance in two, and the split is the
 * reason this file looks less strict than `../../actions.ts`:
 *
 *   * **General attendance** — "Authorized operator after `occurred`". Not a
 *     role list. Recording who turned up is ordinary operator work in the same
 *     sense that reading the club calendar is, and the surface it lives on is
 *     the one the Exec, the Secretary and the General Manager all use.
 *
 *   * **Coach attendance** — the narrow `attendance_recorder` grant, held by
 *     the Head Coach, Offensive Coordinator and Defensive Coordinator seats.
 *     That capability exists in `capabilities.ts` and LAN-110 owns the
 *     constrained surface it opens.
 *
 * Gating this path on `attendance_recorder` would lock the Exec out of their
 * own attendance screen, which is precisely the mistake the capability map's
 * own note warns about. So the floor here is a linked, active operator — never
 * "anybody", and never inferred from the route being reachable.
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
  const operator = await requireOperator();
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
 */
export async function removeAttendanceAction(
  _previous: AttendanceSaveState,
  formData: FormData,
): Promise<AttendanceSaveState> {
  const operator = await requireOperator();
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
 * UX-73 — records somebody who was never invited, and nothing else.
 *
 * No membership, no onboarding, no recruitment record. On success it returns to
 * the board, where the new row carries the walk-up flag the view computes for
 * it.
 */
export async function recordWalkUpAction(
  _previous: WalkUpFormState,
  formData: FormData,
): Promise<WalkUpFormState> {
  const operator = await requireOperator();
  const eventId = text(formData, "eventId");

  const values = {
    name: text(formData, "name"),
    contact: text(formData, "contact"),
    presence: text(formData, "presence"),
    membershipId: text(formData, "membershipId"),
  };

  if (!isAttendancePresence(values.presence)) {
    return { error: "Choose Present, Late, Excused or Absent.", values };
  }

  try {
    await recordWalkUpAttendance(operator.personId, eventId, {
      name: values.name,
      contact: values.contact === "" ? null : values.contact,
      presence: values.presence,
      membershipId: values.membershipId === "" ? null : values.membershipId,
    });
  } catch (error) {
    return { error: messageFor(error), values };
  }

  revalidatePath(`/operate/events/${eventId}/attendance`);
  redirect(`/operate/events/${eventId}/attendance?added=walk-up`);
}
