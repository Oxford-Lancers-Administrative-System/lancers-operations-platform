/**
 * The attendance vocabulary and the shapes the screens render — pure, and with
 * no import that reaches a database. LAN-80.
 *
 * ## Why this is a separate module
 *
 * `./attendance.ts` is `server-only` and imports `@/lib/db`, which imports
 * `pg`. The attendance board's four state buttons are a **client** component —
 * they need `useActionState` for the Saving/Saved/failed line — and a client
 * component that imported the four state names from the service would drag the
 * PostgreSQL driver into the browser bundle. The build says so, in exactly
 * those words.
 *
 * So the split is the same one `./event-input.ts` already makes for the event
 * form, for the same reason: values the browser needs live in a module with no
 * server dependency, and `./attendance.ts` re-exports every one of them so a
 * server caller never has to know the split exists.
 *
 * Nothing here decides anything. It is names, and the shape of a row.
 */

/**
 * `public.attendance_presence`, in the order the interface offers them.
 *
 * Present first because it is the answer most of the time, and Absent last
 * because it is the one nobody wants to press by accident on a phone. The
 * order is presentation; the four values are the club's fixed vocabulary
 * (`docs/ux/slice-ux.md` § 6) and are not synonyms chosen here.
 */
export const ATTENDANCE_PRESENCES = Object.freeze([
  "present",
  "late",
  "excused",
  "absent",
] as const);

export type AttendancePresence = (typeof ATTENDANCE_PRESENCES)[number];

/** A narrowing check, so a posted value never reaches the enum untested. */
export function isAttendancePresence(value: unknown): value is AttendancePresence {
  return typeof value === "string" && (ATTENDANCE_PRESENCES as readonly string[]).includes(value);
}

/**
 * One line of the attendance board — UX-72.
 *
 * ## What is deliberately not on it
 *
 * `rsvp` is the standing answer and nothing else. The **reason** behind a "no"
 * is not read, not selected and not returned, and neither is a contact detail,
 * an availability record or an injury note. `docs/ux/slice-ux.md` § 3 forbids
 * all of them on this surface for a coach, and there is no version of this
 * payload that carries them for anybody — a field that is never selected cannot
 * leak to the wrong reader, whereas a field filtered in the component is one
 * refactor from the DOM.
 */
export interface AttendanceParticipant {
  /**
   * `capacity:anchorId` — stable across a save, and the only handle a form
   * posts. Resolved server-side; never trusted as a description of anything.
   */
  key: string;
  displayName: string;
  capacity: string;
  /** The standing answer, or `null` for no response and for a walk-up. */
  rsvp: "yes" | "no" | null;
  /** `true` when there is no invitation at all — invariant P6. */
  isWalkUp: boolean;
  /** The latest committed value, or `null` when nothing is recorded yet. */
  presence: AttendancePresence | null;
  /** When that value was committed, ISO-8601. */
  recordedAt: string | null;
  /** Who committed it. Shown so a second recorder sees whose value they have. */
  recordedByName: string | null;
  /** The `rsvp_attendance_mismatches` classification, when the view flags one. */
  mismatch: string | null;
}

/**
 * What the walk-on form collects — Brian, 14 August 2026.
 *
 * The same four fields the returner intake asks for, in the same order, because
 * adding somebody who turned up should not be a different act from adding
 * anybody else: "it should be almost identical to adding a player… first name,
 * last name, phone, and email, to grab as much as they can".
 *
 * Stricter than intake in one direction, and that is deliberate too. Intake
 * requires only a first name, because the club's own files are full of records
 * that never had more. A walk-on is different: they are standing in front of
 * you, and the whole point of recording them is that somebody follows them up
 * afterwards — a walk-on with no surname and no number is a row nobody can act
 * on. So first name, last name and phone are all required, and only the email
 * is optional.
 */
export interface WalkUpInput {
  /** Required. `people.given_name`. */
  givenName: string;
  /** Required here, though the column is nullable. See above. */
  familyName: string;
  /** Required. Stored exactly as typed — normalisation is a separate step. */
  phone: string;
  /** Optional. Stored exactly as typed. */
  email: string | null;
  presence: AttendancePresence;
}
