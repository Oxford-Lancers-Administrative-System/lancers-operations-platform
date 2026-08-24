import "server-only";

import { listTermWindows } from "@/lib/services/seasons";
import {
  academicYearFor,
  buildAcademicYear,
  yearCoordinateOf,
  type AcademicYearColumn,
} from "@/lib/services/oxford-year";
import type { CalendarEvent } from "@/lib/services/calendar";
import { labelFor, TERM_LABELS } from "@/lib/services/event-vocabulary";
import type { SegmentChoice } from "./calendar-controls";

/**
 * The one academic year every event surface reads. LAN-153.
 *
 * ## Why the list builds a calendar
 *
 * `REQ-three-arrangements`: the list, Calendar View and Oxford View "cannot
 * disagree about which events exist or when they are". Which events is the
 * query's job — all three read one. **When** is this module's: the list's *Term
 * and week* column, the Oxford View's row labels and the list's *This term*
 * bucket are all read off one built column, so they cannot drift.
 *
 * The alternative — the list deriving its own coordinate from
 * `deriveTermCoordinate`, and the calendar deriving another — is what would
 * drift, and it would drift exactly where the club cares: a vacation event would
 * read "Outside term" in the list and "Christmas Vacation 2" on the calendar.
 * `events.week_number` cannot even hold the second (it is constrained to −1..8),
 * which is why the coordinate is derived at read time rather than looked up.
 */

export interface EventYear {
  column: AcademicYearColumn;
  /** The choices the jump control offers, in the order they appear. */
  segments: SegmentChoice[];
  /** The segment holding today, for the jump control's initial value. */
  currentSegmentKey: string;
  /**
   * The first day of the segment holding today, or `null` when today is in
   * none. Paired with `currentSegmentEndsOn`; together, what the list's
   * **This term** period means (C7/Q-18) — the segment's own start, not
   * today.
   */
  currentSegmentStartsOn: string | null;
  /**
   * The last day of the segment holding today, or `null` when today is in none.
   * What the list's **This term** bucket means.
   */
  currentSegmentEndsOn: string | null;
  /** "MT 2nd", "Christmas Vacation 2", or "No date yet". */
  coordinateLabel: (scheduledOn: string | null) => string;
}

/**
 * Abbreviations for the list's narrow **Term and week** column.
 *
 * Terms only. A vacation keeps its full name there — "Christmas Vacation 2" —
 * because the club's names for the vacations came verbatim from Stewart Humble
 * and abbreviating them would be inventing club vocabulary to save six
 * characters. The approved mockup shows "MT 2nd" for a term, which is where
 * these three come from.
 */
const TERM_ABBREVIATIONS: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "MT",
  hilary: "HT",
  trinity: "TT",
});

/** "−1st", "0th", "2nd" — the ordinal alone, for the list's short form. */
const SHORT_ORDINALS: Readonly<Record<string, string>> = Object.freeze({
  "-1": "−1st",
  "0": "0th",
  "1": "1st",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "5": "5th",
  "6": "6th",
  "7": "7th",
  "8": "8th",
});

/**
 * The open season's academic year, built once for a page.
 *
 * `events` is what the page is already showing, so the column places exactly the
 * events the reader can see. `today` decides which cell is highlighted and which
 * segment the jump control opens on — from `@/lib/club-time`, in the club's
 * zone, and passed in rather than read here so one page cannot ask two clocks.
 */
export async function readEventYear(
  events: readonly CalendarEvent[],
  options: { today: string; seasonStartsOn?: string | null; seasonEndsOn?: string | null },
): Promise<EventYear | null> {
  const terms = await listTermWindows();
  const academicYear = academicYearFor(terms, {
    today: options.today,
    seasonStartsOn: options.seasonStartsOn ?? null,
  });
  if (academicYear === null) return null;

  const column = buildAcademicYear(academicYear, terms, events, {
    today: options.today,
    seasonEndsOn: options.seasonEndsOn ?? null,
  });

  const today = column.segments.find(
    (segment) => segment.startsOn <= options.today && options.today <= segment.endsOn,
  );

  return {
    column,
    segments: column.segments.map((segment) => ({ key: segment.key, label: segment.jumpLabel })),
    currentSegmentKey: today?.key ?? column.segments[0]?.key ?? "",
    currentSegmentStartsOn: today?.startsOn ?? null,
    currentSegmentEndsOn: today?.endsOn ?? null,
    coordinateLabel: (scheduledOn: string | null) => {
      const coordinate = yearCoordinateOf(column, scheduledOn);
      if (coordinate === null) return scheduledOn === null ? "No date yet" : "Outside this year";
      if (coordinate.kind === "vacation") {
        return `${coordinate.segmentName} ${coordinate.week}`;
      }
      const term =
        TERM_ABBREVIATIONS[coordinate.segmentName] ?? labelFor(TERM_LABELS, coordinate.segmentName);
      return `${term} ${SHORT_ORDINALS[`${coordinate.week}`] ?? coordinate.week}`;
    },
  };
}
