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

// ---------------------------------------------------------------------------
// The headline numbers — D62, D73 and D74. LAN-152.
// ---------------------------------------------------------------------------

/**
 * The attendance states that mean somebody **turned up**.
 *
 * `late` counts. Arriving at 20:20 is arriving; the distinction the club draws
 * with it is about punctuality, not about presence, and a turnout figure that
 * dropped the people who were late would say fewer people came to a session
 * than the coach watched walk onto the pitch. `excused` and `absent` are the
 * two that did not come, and both are genuine observations rather than silence
 * — which is the whole point of the axis below.
 */
export const SHOWED_PRESENCES = Object.freeze(["present", "late"] as const);

/** Whether one recorded value means the person turned up. */
export function isShowedPresence(presence: AttendancePresence | null): boolean {
  return presence !== null && (SHOWED_PRESENCES as readonly string[]).includes(presence);
}

/**
 * One event's attendance, counted.
 *
 * ## `registerSaved` is the whole idea
 *
 * Attendance is a **two-state axis**: *not recorded* against *recorded*. The
 * save is the signal, and nothing else is — there is no finalisation column and
 * this deliberately does not invent one. A sheet saved with all thirty-seven
 * people marked absent is a real, hard-won zero, and it has to be
 * distinguishable at a glance from a sheet nobody opened. That is why `showed`
 * means nothing until this is `true`, and why every reader consults it before
 * printing a number.
 *
 * The counts themselves are **raw pairs, never percentages** (D62). A club of
 * forty-seven reading "43%" has to do arithmetic to get back to the fact it
 * wanted, and the fact it wanted was "twenty of them came".
 */
export interface AttendanceSummary {
  /** Invitations. Structurally zero below `approved` — invariant P1. */
  invited: number;
  /** Invitations whose standing answer is yes. Intent, never observation. */
  saidYes: number;
  /** Attendance rows recorded `present` or `late`. */
  showed: number;
  /** Attendance rows of any value, walk-ups included. */
  recorded: number;
  /** Attendance rows with no invitation behind them — invariant P6. */
  walkUps: number;
  /**
   * `true` once **anything** has been recorded against the event.
   *
   * Not "everybody has been marked". A partly-filled sheet is a sheet somebody
   * opened and saved, and the club's answer to "was this session assessed?" is
   * yes.
   */
  registerSaved: boolean;
}

/**
 * The counts, derived from the board's own rows.
 *
 * One derivation, shared by the register and by the event page's headline
 * numbers, because `docs/ux/standards.md` rule 7 is exactly about two screens
 * answering one question two ways. `src/lib/services/attendance.test.ts` pins
 * this to the aggregate the event page reads, on the same event.
 */
export function summariseAttendance(
  participants: readonly AttendanceParticipant[],
): AttendanceSummary {
  const recorded = participants.filter((participant) => participant.presence !== null);

  return {
    invited: participants.filter((participant) => !participant.isWalkUp).length,
    saidYes: participants.filter(
      (participant) => !participant.isWalkUp && participant.rsvp === "yes",
    ).length,
    showed: recorded.filter((participant) => isShowedPresence(participant.presence)).length,
    recorded: recorded.length,
    walkUps: participants.filter((participant) => participant.isWalkUp).length,
    registerSaved: recorded.length > 0,
  };
}
