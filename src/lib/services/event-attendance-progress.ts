/**
 * Attendance by capacity — LAN-504 (Lancers call, 16 October 2026; Brian's walk
 * of 22 October 2026).
 *
 * On an occurred event, one card per group the RSVP cards already show —
 * Recruits, Players, Coaches. The headline is "<attended> attended /
 * <expected> expected":
 *
 *   attended = Present + Late
 *   expected = everyone who said yes, plus anyone the register marked Present
 *              or Late who did not (a walk-up, somebody who said no, somebody
 *              who never answered)
 *
 * Within the expected people the card counts Present, Late, No-show and
 * Excused. Somebody who said yes and has no register mark counts as a No-show;
 * there is no "not recorded" any more (Brian: the grey gap was confusing). The
 * four always add up to `expected`, so the bar spans exactly the expected
 * people. Somebody who is not expected — said no or never answered, and was
 * not marked present or late — is in no count.
 *
 * The group a person is tallied under is the RSVP cards' own classifier
 * (`responseCapacityOf`, with the LAN-440 / LAN-466 folds), applied to a walk-up
 * as well: a walk-up came, so they are expected. The same `tallyAttendance` is
 * the figure on every Everyone-asked section header (LAN-497).
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
  readonly displayName: string;
  readonly presence: AttendancePresence | null;
}

/** The counts for any set of people: a card, or one Everyone-asked section. */
export interface AttendanceTally {
  /** Present + Late. */
  readonly attended: number;
  /** Said yes, plus anyone marked Present or Late who did not. */
  readonly expected: number;
  readonly present: number;
  readonly late: number;
  /** Stored `absent`, or said yes with nothing recorded; the club calls it a no-show. */
  readonly noShow: number;
  readonly excused: number;
}

/** The four buckets a card lists names under, in the card's reading order. */
export const ATTENDANCE_BUCKETS = Object.freeze(["present", "late", "noShow", "excused"] as const);
export type AttendanceBucket = (typeof ATTENDANCE_BUCKETS)[number];

/** The bucket an expected person is counted in, or null where they are not expected at all. */
export function attendanceBucketOf(
  row: Pick<AttendanceProgressRow, "answer" | "presence">,
): AttendanceBucket | null {
  if (row.presence === "present") return "present";
  if (row.presence === "late") return "late";
  if (row.answer !== "yes") return null;
  return row.presence === "excused" ? "excused" : "noShow";
}

export function tallyAttendance(
  rows: readonly Pick<AttendanceProgressRow, "answer" | "presence">[],
): AttendanceTally {
  const held: Record<AttendanceBucket, number> = { present: 0, late: 0, noShow: 0, excused: 0 };
  for (const row of rows) {
    const bucket = attendanceBucketOf(row);
    if (bucket !== null) held[bucket] += 1;
  }
  return {
    attended: held.present + held.late,
    expected: held.present + held.late + held.noShow + held.excused,
    ...held,
  };
}

/** "8 attended / 9 expected" — the card's headline and every section header's. */
export function formatAttendanceHeadline(
  tally: Pick<AttendanceTally, "attended" | "expected">,
): string {
  return `${tally.attended} attended / ${tally.expected} expected`;
}

export interface AttendanceProgressBlock extends AttendanceTally {
  readonly capacity: DisplayCapacity;
  readonly label: string;
  /** Names in each bucket, A–Z. */
  readonly names: Readonly<Record<AttendanceBucket, readonly string[]>>;
}

/**
 * The group a row is tallied under — the RSVP cards' classifier, which leaves a
 * walk-up out because it counts invitations. A walk-up was never invited but did
 * come, so for attendance they are classified as the person they are.
 */
export function attendanceCapacityOf(row: ResponseProgressRow): DisplayCapacity | null {
  return responseCapacityOf(row.isWalkUp ? { ...row, isWalkUp: false } : row);
}

/** One card per group with anybody expected in it, in the RSVP cards' order. */
export function attendanceProgressByCapacity(
  rows: readonly AttendanceProgressRow[],
): AttendanceProgressBlock[] {
  const byCapacity = new Map<DisplayCapacity, AttendanceProgressRow[]>();
  for (const row of rows) {
    const capacity = attendanceCapacityOf(row);
    if (capacity === null) continue;
    byCapacity.set(capacity, [...(byCapacity.get(capacity) ?? []), row]);
  }

  return DISPLAY_ORDER.flatMap((capacity) => {
    const held = byCapacity.get(capacity);
    if (held === undefined) return [];
    const tally = tallyAttendance(held);
    if (tally.expected === 0) return [];

    const names = Object.fromEntries(
      ATTENDANCE_BUCKETS.map((bucket) => [
        bucket,
        held
          .filter((row) => attendanceBucketOf(row) === bucket)
          .map((row) => row.displayName)
          .sort((left, right) => left.localeCompare(right, "en-GB")),
      ]),
    ) as Record<AttendanceBucket, string[]>;

    return [{ capacity, label: RESPONSE_CAPACITY_LABELS[capacity], ...tally, names }];
  });
}

/**
 * Whether the event page shows the cards: an approved event that has occurred
 * (D30's derived state). An upcoming event's page is unchanged.
 */
export function showsAttendanceProgress(
  event: { status: EventStatus; scheduledOn: string | null },
  today: string,
): boolean {
  return event.status === "approved" && derivedEventState(event, today) === "occurred";
}
