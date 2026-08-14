import type { AttendancePresence } from "@/lib/services/attendance-vocabulary";

/**
 * The words the attendance screens use — UX-70 through UX-75, LAN-80.
 *
 * A module of its own, and pure, for the reason the other presentation modules
 * are: the client components that render these strings must not pull the
 * service layer (and therefore `pg`) into the browser bundle, and the tests
 * that assert the approved labels must be able to import them without a
 * database.
 *
 * `docs/ux/slice-ux.md` § 6 is the authority for every label below. The four
 * attendance states and the two occurrence assertions are fixed club
 * vocabulary; none of them is a synonym chosen here.
 */

// ---------------------------------------------------------------------------
// The four states — § 6
// ---------------------------------------------------------------------------

export const PRESENCE_LABELS: Readonly<Record<AttendancePresence, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

/**
 * Which MUI colour each state carries.
 *
 * § 7: the phone presentation must expose state "without relying on color
 * alone", so every one of these is also rendered as its word. The colour is the
 * second channel, never the only one.
 */
export const PRESENCE_COLORS: Readonly<
  Record<AttendancePresence, "success" | "warning" | "info" | "error">
> = Object.freeze({
  present: "success",
  late: "warning",
  excused: "info",
  absent: "error",
});

// ---------------------------------------------------------------------------
// RSVP, shown for context and never as an attendance value — § 6
// ---------------------------------------------------------------------------

/**
 * "Delivered never means responded. Attending is intent; Present is observed
 * attendance." The prefix is deliberately kept on every one of these so that a
 * recorder scanning a column never reads an intent as an observation.
 */
export function describeRsvp(rsvp: "yes" | "no" | null, isWalkUp: boolean): string {
  if (isWalkUp) return "Walk-up · never invited";
  if (rsvp === "yes") return "RSVP: Attending";
  if (rsvp === "no") return "RSVP: Not attending";
  return "RSVP: No response";
}

/** `public.rsvp_attendance_mismatches.mismatch`, in the club's words. */
export const MISMATCH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  said_yes_no_attendance_recorded: "Said Attending · nothing recorded",
  said_yes_marked_absent: "Said Attending · marked Absent",
  said_no_but_attended: "Said Not attending · turned up",
  attended_without_invitation: "Attended without an invitation",
});

export function describeMismatch(mismatch: string | null): string | null {
  if (mismatch === null) return null;
  return MISMATCH_LABELS[mismatch] ?? mismatch;
}

// ---------------------------------------------------------------------------
// UX-70 — Confirm what happened
// ---------------------------------------------------------------------------

export const OCCURRENCE_HEADLINE = "Confirm what happened";

export const OCCURRENCE_DETAIL =
  "This human assertion is required before attendance. Coaches with LAN-110 access cannot " +
  "perform it.";

export const OCCURRENCE_NOT_ASSERTED = "Not yet asserted";

export const OCCURRENCE_NEVER_INFERRED = "Never inferred from time";

export const START_HAS_PASSED = "Start time has passed";

export const START_IS_AHEAD = "Start time has not passed";

export const ATTENDANCE_UNAVAILABLE = "Unavailable";

export const ATTENDANCE_OPENS_AFTER = "Opens only after Mark occurred";

// ---------------------------------------------------------------------------
// UX-75 — Event marked not held
// ---------------------------------------------------------------------------

export const NOT_HELD_HEADLINE = "Event marked not held";

export const NOT_HELD_DETAIL =
  "Attendance remains unavailable. The occurrence decision and actor are retained in the " +
  "audit trail.";

// ---------------------------------------------------------------------------
// UX-71 — Attendance is not available yet
// ---------------------------------------------------------------------------

export const ATTENDANCE_LOCKED_HEADLINE = "Attendance is not available yet";

export const ATTENDANCE_LOCKED_DETAIL =
  "An authorized operator must first mark this event as occurred.";

export const ATTENDANCE_LOCKED_RULE =
  "The service rejects attendance writes while occurrence is unset or the event is marked " +
  "not held.";

// ---------------------------------------------------------------------------
// UX-72 — the board
// ---------------------------------------------------------------------------

export const ATTENDANCE_HEADLINE_PREFIX = "Attendance ·";

export const RSVP_STAYS_SEPARATE =
  "RSVP and attendance remain separate. Mismatches are visible and never auto-reconciled.";

export const NOT_MARKED = "Not marked";

export const NOBODY_INVITED =
  "Nobody was invited to this event, and nothing has been recorded. Anyone who turned up can " +
  "still be added as a walk-up.";

export const NO_MATCHING_PARTICIPANTS =
  "No one on this event matches these filters. Clear them to see everybody.";

export const ADD_WALK_UP = "Add walk-up";

export const COMPLETE_ATTENDANCE = "Complete attendance";

/**
 * What **Complete attendance** actually does, said on the screen.
 *
 * There is no finalisation column in `attendance_records` and LAN-80 forbids
 * authoring a migration without Brian, so this button closes the recorder's
 * session and returns to the event. Every value it leaves behind stays
 * correctable. Saying so is better than a button that implies a lock the
 * database does not have — the gap is reported in the pull request.
 */
export const COMPLETE_ATTENDANCE_MEANING =
  "Finishes recording and returns to the event. Values stay correctable afterwards.";

// ---------------------------------------------------------------------------
// The save line — § 9, Saving / Saved / failed save
// ---------------------------------------------------------------------------

export const SAVING = "Saving…";

export const SAVE_FAILED_HEADLINE = "We could not save this change";

/** "Saved · Casey North · 20:07" — UX-72's committed line, exactly. */
export function describeCommitted(
  recordedAt: string | null,
  recordedByName: string | null,
): string | null {
  if (recordedAt === null) return null;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(new Date(recordedAt));

  return recordedByName ? `Saved · ${recordedByName} · ${time}` : `Saved · ${time}`;
}

// ---------------------------------------------------------------------------
// UX-73 / UX-97 — the walk-up
// ---------------------------------------------------------------------------

export const WALK_UP_HEADLINE = "Add walk-up attendance";

export const WALK_UP_DETAIL = "Capture only enough identity to record attendance now.";

export const WALK_UP_RECONCILIATION_NOTE =
  "The walk-up is visibly flagged for later reconciliation. This does not create or activate " +
  "a membership.";

/**
 * The deferred workflow, named on the screen.
 *
 * Brian's 12 August 2026 decision requires the interface to link the deferred
 * roster/onboarding work to LAN-85 without implementing any of it here, so this
 * says which issue owns it and stops.
 */
export const WALK_UP_DEFERRED_WORKFLOW =
  "Turning a walk-up into a member — recruitment, onboarding and the rest of the roster " +
  "record — is LAN-85 and is not done here.";

export const WALK_UP_NAME_LABEL = "Name";

export const WALK_UP_CONTACT_LABEL = "Email or phone";

export const WALK_UP_PRESENCE_LABEL = "Attendance";

export const WALK_UP_MATCH_LABEL = "Possible roster match";

export const WALK_UP_MATCH_NONE = "None selected";

export const WALK_UP_MATCH_HELP =
  "If they are already on this season's roster, choose them here so the attendance is " +
  "recorded against their membership rather than against a second record of the same person.";

export const WALK_UP_SUBMIT = "Add walk-up";

/** The reconciliation flag, in the club's words. Derived, never a column. */
export const WALK_UP_CHIP = "Walk-up · to reconcile";
