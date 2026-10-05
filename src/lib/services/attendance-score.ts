import type { AttendancePresence } from "./attendance-vocabulary";

/**
 * The attendance score — LAN-457. One rule, used by the roster board's
 * Attendance group and by the player record's Attendance section, so the two
 * can never disagree. Pure: no database, safe in a client bundle.
 *
 * Brian's rule (2 October 2026), for one player, this season:
 *
 * - **Counted** events have already happened, the player was invited to them
 *   as a player, and the register marks them Present, Late or Absent.
 * - **Attended** is Present or Late.
 * - Excused is removed from the equation entirely.
 * - An invitation never messaged (`message_withheld_reason` set) counts as
 *   excused: it is not counted.
 * - A happened event with no register mark is left out.
 * - Availability excuses nobody; only the register's Excused does.
 *
 * Mandatory counts mandatory events; BPS counts strength and conditioning
 * events (`event_type = 'strength_and_conditioning'`); All events counts every
 * event.
 */

/** `public.event_type`'s strength and conditioning value — what makes an event a BPS event. */
export const BPS_EVENT_TYPE = "strength_and_conditioning";

/** One player-anchored invitation, with what the register says about it. */
export interface AttendanceScoreInput {
  readonly isMandatory: boolean;
  /** `public.events.event_type`. */
  readonly eventType: string;
  /** `public.events.status` — `draft`, `approved` or `cancelled`. */
  readonly eventStatus: string;
  /** `YYYY-MM-DD`, or `null` for an event with no date yet. */
  readonly scheduledOn: string | null;
  /** `public.invitations.capacity`. */
  readonly capacity: string;
  /** `message_withheld_reason is null` — a message was (or will be) sent against it. */
  readonly messaged: boolean;
  /** The register's mark, or `null` when nothing is recorded. */
  readonly presence: AttendancePresence | null;
}

export interface AttendanceTally {
  readonly attended: number;
  readonly counted: number;
}

export interface AttendanceScore {
  readonly mandatory: AttendanceTally;
  readonly bps: AttendanceTally;
  readonly all: AttendanceTally;
}

const EMPTY: AttendanceTally = Object.freeze({ attended: 0, counted: 0 });

export const EMPTY_ATTENDANCE_SCORE: AttendanceScore = Object.freeze({
  mandatory: EMPTY,
  bps: EMPTY,
  all: EMPTY,
});

/**
 * Whether the event has already happened: approved and dated today or
 * earlier. Today counts, because the register opens on the day and an
 * unmarked event drops out anyway; a cancelled event never happened.
 */
function hasHappened(input: AttendanceScoreInput, today: string): boolean {
  return (
    input.eventStatus === "approved" && input.scheduledOn !== null && input.scheduledOn <= today
  );
}

/** Whether one invitation is in the bottom number, and whether it is in the top. */
function countOf(
  input: AttendanceScoreInput,
  today: string,
): { counted: boolean; attended: boolean } {
  const counted =
    input.capacity === "player" &&
    input.messaged &&
    hasHappened(input, today) &&
    (input.presence === "present" || input.presence === "late" || input.presence === "absent");
  return { counted, attended: counted && input.presence !== "absent" };
}

function add(tally: AttendanceTally, attended: boolean): AttendanceTally {
  return { attended: tally.attended + (attended ? 1 : 0), counted: tally.counted + 1 };
}

/** One player's three tallies. `today` is `todayInClubZone()`, passed in so the rule stays pure. */
export function scoreAttendance(
  inputs: readonly AttendanceScoreInput[],
  today: string,
): AttendanceScore {
  let mandatory = EMPTY;
  let bps = EMPTY;
  let all = EMPTY;
  for (const input of inputs) {
    const { counted, attended } = countOf(input, today);
    if (!counted) continue;
    all = add(all, attended);
    if (input.isMandatory) mandatory = add(mandatory, attended);
    if (input.eventType === BPS_EVENT_TYPE) bps = add(bps, attended);
  }
  return { mandatory, bps, all };
}

/** The fraction attended, or `null` when nothing is counted — what the board sorts on, dash last. */
export function attendanceRatio(tally: AttendanceTally): number | null {
  return tally.counted === 0 ? null : tally.attended / tally.counted;
}

/** The whole percentage the figure prints, or `null` when nothing is counted. */
function attendancePercent(tally: AttendanceTally): number | null {
  return tally.counted === 0 ? null : Math.round((tally.attended / tally.counted) * 100);
}

/** `9/9 · 100%`, or `null` when nothing is counted (drawn as a dash). */
export function formatAttendanceTally(tally: AttendanceTally): string | null {
  const pct = attendancePercent(tally);
  if (pct === null) return null;
  return `${tally.attended}/${tally.counted} · ${pct}%`;
}

export type AttendanceBand = "green" | "amber" | "red";

/**
 * The figure's colour band (Brian, 5 October 2026): 80–100 % green, 60–79 %
 * amber, below 60 % red; `null` for a dash. Judged on the rounded percentage
 * the figure prints, so the colour and the number never disagree.
 */
export function attendanceBand(tally: AttendanceTally): AttendanceBand | null {
  const pct = attendancePercent(tally);
  if (pct === null) return null;
  if (pct >= 80) return "green";
  if (pct >= 60) return "amber";
  return "red";
}
