/**
 * Attendance by capacity — LAN-504 (Lancers call, 16 October 2026).
 *
 * On an occurred event, one block per group the RSVP blocks already show —
 * Recruits, Players, Coaches — counting what the register recorded: Present,
 * Late, No-show (stored `absent`), Excused, and the people with nothing
 * recorded, so the five add up to the group's invitations.
 *
 * Counts come from the attendance record only, never from the RSVP: somebody
 * who said No and was marked Present counts as Present. The group a person is
 * tallied under is `responseCapacityOf`, the RSVP blocks' own classifier, so
 * the two rows of blocks always count the same people under the same heading.
 * A walk-up was never invited and is in neither row, as in the RSVP blocks.
 *
 * Pure. No database, no React — the rows are the participation rows the event
 * page already reads.
 */
import type { AttendancePresence } from "./attendance-vocabulary";
import { derivedEventState, type EventStatus } from "./event-input";
import {
  DISPLAY_ORDER,
  RESPONSE_CAPACITY_LABELS,
  responseCapacityOf,
  type DisplayCapacity,
  type ResponseProgressRow,
} from "./event-response-progress";

export interface AttendanceProgressRow extends ResponseProgressRow {
  readonly presence: AttendancePresence | null;
}

export interface AttendanceProgressBlock {
  readonly capacity: DisplayCapacity;
  readonly label: string;
  /** Invitations in this group — the same denominator as its RSVP block. */
  readonly total: number;
  readonly present: number;
  readonly late: number;
  /** Stored `absent`; the club calls it a no-show. */
  readonly noShow: number;
  readonly excused: number;
  readonly notRecorded: number;
}

/** One block per group present in the audience, in the RSVP blocks' order. */
export function attendanceProgressByCapacity(
  rows: readonly AttendanceProgressRow[],
): AttendanceProgressBlock[] {
  const tally = new Map<DisplayCapacity, Record<AttendancePresence | "none", number>>();

  for (const row of rows) {
    const capacity = responseCapacityOf(row);
    if (capacity === null) continue;
    const held = tally.get(capacity) ?? { present: 0, late: 0, absent: 0, excused: 0, none: 0 };
    held[row.presence ?? "none"] += 1;
    tally.set(capacity, held);
  }

  return DISPLAY_ORDER.flatMap((capacity) => {
    const held = tally.get(capacity);
    if (held === undefined) return [];
    const total = held.present + held.late + held.absent + held.excused + held.none;
    if (total === 0) return [];
    return [
      {
        capacity,
        label: RESPONSE_CAPACITY_LABELS[capacity],
        total,
        present: held.present,
        late: held.late,
        noShow: held.absent,
        excused: held.excused,
        notRecorded: held.none,
      },
    ];
  });
}

/**
 * Whether the event page shows the blocks: an approved event that has occurred
 * (D30's derived state). An upcoming event's page is unchanged.
 */
export function showsAttendanceProgress(
  event: { status: EventStatus; scheduledOn: string | null },
  today: string,
): boolean {
  return event.status === "approved" && derivedEventState(event, today) === "occurred";
}
