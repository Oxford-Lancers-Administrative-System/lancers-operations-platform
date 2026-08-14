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

/** A current-season membership a walk-up might turn out to be — UX-73. */
export interface WalkUpCandidate {
  membershipId: string;
  displayName: string;
}

/** What UX-73 collects. One name, one optional contact, one state. */
export interface WalkUpInput {
  /** The whole name as typed. Split on the first space, never rearranged. */
  name: string;
  /** An email address or a phone number, or nothing. Stored exactly as typed. */
  contact: string | null;
  presence: AttendancePresence;
  /** An existing current-season membership this walk-up turns out to be. */
  membershipId: string | null;
}
