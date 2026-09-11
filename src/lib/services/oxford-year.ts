import { addDays, oxfordWeekRange, termWeeks, type CalendarEvent } from "./calendar";
import type { TermWindow } from "./event-input";
import { labelFor, TERM_LABELS } from "./event-vocabulary";

// The Oxford View — one continuous academic year, LAN-153. Every date is inside exactly one
// segment; a vacation belongs to neither adjacent term. Pure.

/** What the club calls the gap after each term (Stewart Humble, 17 August 2026), keyed on the term it follows. */
const VACATION_AFTER: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Christmas Vacation",
  hilary: "Easter Vacation",
  trinity: "Long Vacation",
});

/** The vacation that runs into a term, for the segment with no term before it (Brian, 20 August 2026). */
const VACATION_BEFORE: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Long Vacation",
});

const UNNAMED_VACATION = "Vacation";

type YearSegmentKind = "term" | "vacation";

interface YearDay {
  day: string;
  weekday: number;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface YearWeek {
  segmentKey: string;
  /** The Oxford week on a term row (−1 … 8), or the forward count on a vacation row (1, 2, 3 …). */
  week: number;
  /** "−1st week", "3rd week", "Christmas Vacation 2". */
  label: string;
  startsOn: string;
  endsOn: string;
  days: YearDay[];
}

export interface YearSegment {
  key: string;
  kind: YearSegmentKind;
  name: string;
  /** What a reader is shown — the club's word, not the stored enum value. */
  jumpLabel: string;
  /** `null` for a vacation — load-bearing: it belongs to neither adjacent term. */
  termId: string | null;
  startsOn: string;
  endsOn: string;
  weeks: YearWeek[];
}

export interface AcademicYearColumn {
  academicYear: string;
  /** Long Vacation → Michaelmas → … → Trinity → Long Vacation, in order. */
  segments: YearSegment[];
  undated: CalendarEvent[];
  /** Dated events outside the year this column covers — normally empty. */
  outsideTheYear: CalendarEvent[];
  placedCount: number;
}

/** "−1st week" … "8th week", spelled out rather than computed, as `presentation.ts` did for the term card. */
const OXFORD_WEEK_ORDINALS: Readonly<Record<string, string>> = Object.freeze({
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

/** "3rd week". Falls back to the bare number for a week the club has no word for. */
export function formatOxfordWeek(week: number): string {
  return `${OXFORD_WEEK_ORDINALS[`${week}`] ?? `${week}`} week`;
}

/** "Christmas Vacation 2" — a vacation row, numbered forward from 1. */
export function formatVacationWeek(name: string, week: number): string {
  return `${name} ${week}`;
}

const MS_PER_DAY = 86_400_000;

function dayMs(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Whole days from `from` to `to`, or `null` if either will not parse. */
function daysBetween(from: string, to: string): number | null {
  const fromMs = dayMs(from);
  const toMs = dayMs(to);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

/** The first and last Gregorian days a term's configured weeks cover. */
function termSpan(term: TermWindow): { startsOn: string; endsOn: string } | null {
  const first = oxfordWeekRange(term, term.firstWeek);
  const last = oxfordWeekRange(term, term.lastWeek);
  return first && last ? { startsOn: first.startsOn, endsOn: last.endsOn } : null;
}

/** The terms of one academic year, earliest first, each with a usable span. */
function termsOfYear(
  terms: readonly TermWindow[],
  academicYear: string,
): { term: TermWindow; span: { startsOn: string; endsOn: string } }[] {
  return terms
    .filter((term) => term.academicYear === academicYear)
    .map((term) => ({ term, span: termSpan(term) }))
    .filter(
      (entry): entry is { term: TermWindow; span: { startsOn: string; endsOn: string } } =>
        entry.span !== null,
    )
    .sort((left, right) => (left.span.startsOn < right.span.startsOn ? -1 : 1));
}

/** Which academic year this column is, derived from term dates alone (LAN-153). Today, else the season's start, else the latest configured. */
export function academicYearFor(
  terms: readonly TermWindow[],
  options: { today?: string | null; seasonStartsOn?: string | null } = {},
): string | null {
  const years = [...new Set(terms.map((term) => term.academicYear))]
    .map((year) => ({ year, entries: termsOfYear(terms, year) }))
    .filter((candidate) => candidate.entries.length > 0)
    .map((candidate) => ({
      year: candidate.year,
      startsOn: candidate.entries[0].span.startsOn,
      endsOn: candidate.entries[candidate.entries.length - 1].span.endsOn,
    }))
    .sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1));

  if (years.length === 0) return null;

  for (const anchor of [options.today, options.seasonStartsOn]) {
    if (!anchor) continue;
    const hit = years.find((year) => year.startsOn <= anchor && anchor <= year.endsOn);
    if (hit) return hit.year;
  }

  return years[years.length - 1].year;
}

/** Events by day, and the ones with no usable date. */
function groupByDay(events: readonly CalendarEvent[]): {
  byDay: Map<string, CalendarEvent[]>;
  undated: CalendarEvent[];
} {
  const byDay = new Map<string, CalendarEvent[]>();
  const undated: CalendarEvent[] = [];

  for (const event of events) {
    const day = event.scheduledOn;
    if (day === null || dayMs(day) === null) {
      undated.push(event);
      continue;
    }
    const bucket = byDay.get(day);
    if (bucket) bucket.push(event);
    else byDay.set(day, [event]);
  }

  for (const bucket of byDay.values()) bucket.sort(byStartTime);
  return { byDay, undated };
}

/** Earliest start first; an untimed event is less specific, so it sorts after. */
function byStartTime(left: CalendarEvent, right: CalendarEvent): number {
  const leftAt = left.startsAt ?? "99:99";
  const rightAt = right.startsAt ?? "99:99";
  if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.id < right.id ? -1 : 1;
}

function byDate(left: CalendarEvent, right: CalendarEvent): number {
  const leftOn = left.scheduledOn ?? "";
  const rightOn = right.scheduledOn ?? "";
  if (leftOn !== rightOn) return leftOn < rightOn ? -1 : 1;
  return byStartTime(left, right);
}

/** How the trailing Long Vacation is bounded with no next Michaelmas configured yet; one week minimum. */
const MINIMUM_TRAILING_VACATION_WEEKS = 1;

/**
 * How much of the year's two Long Vacations is drawn — BG-153-1, Brian at the
 * visual gate. Trimmed to the last/first N weeks of records, extended (never
 * shortened) to reach a distant event. Does not renumber, does not touch
 * terms, does not special-case Christmas/Easter.
 */
export const LEADING_VACATION_WEEKS = 5;

export const TRAILING_VACATION_WEEKS = 1;

/** Which end of a vacation is kept when it is longer than it needs to be. */
type VacationTrim = "none" | "keep-last" | "keep-first";

function weekHasEvents(week: YearWeek): boolean {
  return week.days.some((day) => day.events.length > 0);
}

/** The weeks of a vacation that are actually drawn — extends only as far as the outermost event. */
function trimVacationWeeks(weeks: YearWeek[], trim: VacationTrim): YearWeek[] {
  if (trim === "none" || weeks.length === 0) return weeks;

  if (trim === "keep-last") {
    const earliest = weeks.findIndex(weekHasEvents);
    const reach = earliest === -1 ? 0 : weeks.length - earliest;
    return weeks.slice(-Math.min(weeks.length, Math.max(LEADING_VACATION_WEEKS, reach)));
  }

  let latest = -1;
  weeks.forEach((week, index) => {
    if (weekHasEvents(week)) latest = index;
  });
  const reach = latest === -1 ? 0 : latest + 1;
  return weeks.slice(0, Math.min(weeks.length, Math.max(TRAILING_VACATION_WEEKS, reach)));
}

export interface AcademicYearOptions {
  today?: string | null;
  seasonEndsOn?: string | null;
}

/** One continuous academic year. `terms` is every term, not just this year's — the leading vacation numbers from the previous year's last term. */
export function buildAcademicYear(
  academicYear: string,
  terms: readonly TermWindow[],
  events: readonly CalendarEvent[],
  options: AcademicYearOptions = {},
): AcademicYearColumn {
  const today = options.today ?? null;
  const { byDay, undated } = groupByDay(events);
  const entries = termsOfYear(terms, academicYear);

  if (entries.length === 0) {
    return {
      academicYear,
      segments: [],
      undated,
      outsideTheYear: [...byDay.values()].flat().sort(byDate),
      placedCount: 0,
    };
  }

  const segments: YearSegment[] = [];

  /** One row, seven days, each cell holding whatever that day has. */
  const emitWeek = (
    segmentKey: string,
    week: number,
    label: string,
    startsOn: string,
    lastDay: string | null,
  ): YearWeek => {
    const days: YearDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      const day = addDays(startsOn, column);
      if (day === null) break;
      if (lastDay !== null && day > lastDay) break;
      const dayEvents = byDay.get(day) ?? [];
      days.push({
        day,
        weekday: column,
        isToday: today !== null && day === today,
        events: dayEvents,
      });
    }
    return {
      segmentKey,
      week,
      label,
      startsOn,
      endsOn: days.length > 0 ? days[days.length - 1].day : startsOn,
      days,
    };
  };

  /** A vacation segment, numbered forward from 1, filling `startsOn`..`endsOn`. */
  const emitVacation = (
    name: string,
    jumpLabel: string,
    key: string,
    startsOn: string,
    endsOn: string,
    trim: VacationTrim = "none",
  ) => {
    const length = daysBetween(startsOn, endsOn);
    if (length === null || length < 0) return;

    const weeks: YearWeek[] = [];
    let cursor: string | null = startsOn;
    let week = 1;
    while (cursor !== null && cursor <= endsOn) {
      weeks.push(emitWeek(key, week, formatVacationWeek(name, week), cursor, endsOn));
      cursor = addDays(cursor, 7);
      week += 1;
    }
    if (weeks.length === 0) return;

    // Trimmed after building, never before.
    const drawn = trimVacationWeeks(weeks, trim);
    if (drawn.length === 0) return;

    segments.push({
      key,
      kind: "vacation",
      name,
      jumpLabel,
      termId: null,
      startsOn: drawn[0].startsOn,
      endsOn: drawn[drawn.length - 1].endsOn,
      weeks: drawn,
    });
  };

  /** "Long Vacation 2026" — the calendar year a vacation starts in. */
  const vacationJumpLabel = (name: string, startsOn: string) =>
    name === "Long Vacation" ? `${name} ${startsOn.slice(0, 4)}` : name;

  // The leading Long Vacation, numbered from the day after the previous year's last term ends.
  const firstEntry = entries[0];
  const previousYearEnd = [...terms]
    .map((term) => termSpan(term))
    .filter((span): span is { startsOn: string; endsOn: string } => span !== null)
    .filter((span) => span.endsOn < firstEntry.span.startsOn)
    .sort((left, right) => (left.endsOn < right.endsOn ? -1 : 1))
    .pop();

  if (previousYearEnd) {
    const leadingStart = addDays(previousYearEnd.endsOn, 1);
    const leadingEnd = addDays(firstEntry.span.startsOn, -1);
    if (leadingStart !== null && leadingEnd !== null && leadingStart <= leadingEnd) {
      const name = VACATION_BEFORE[firstEntry.term.name] ?? UNNAMED_VACATION;
      emitVacation(
        name,
        vacationJumpLabel(name, leadingStart),
        `vacation-before-${firstEntry.term.id}`,
        leadingStart,
        leadingEnd,
        "keep-last",
      );
    }
  }

  entries.forEach((entry, index) => {
    const { term, span } = entry;

    segments.push({
      key: `term-${term.id}`,
      kind: "term",
      name: term.name,
      jumpLabel: labelFor(TERM_LABELS, term.name),
      termId: term.id,
      startsOn: span.startsOn,
      endsOn: span.endsOn,
      weeks: termWeeks(term).flatMap((week) => {
        const range = oxfordWeekRange(term, week);
        if (range === null) return [];
        return [emitWeek(`term-${term.id}`, week, formatOxfordWeek(week), range.startsOn, null)];
      }),
    });

    const next = entries[index + 1];
    const gapStart = addDays(span.endsOn, 1);
    const name = VACATION_AFTER[term.name] ?? UNNAMED_VACATION;

    if (next) {
      const gapEnd = addDays(next.span.startsOn, -1);
      if (gapStart !== null && gapEnd !== null && gapStart <= gapEnd) {
        emitVacation(
          name,
          vacationJumpLabel(name, gapStart),
          `vacation-after-${term.id}`,
          gapStart,
          gapEnd,
        );
      }
      return;
    }

    if (gapStart === null) return;

    const nextYearStart = [...terms]
      .map((candidate) => termSpan(candidate))
      .filter((candidate): candidate is { startsOn: string; endsOn: string } => candidate !== null)
      .filter((candidate) => candidate.startsOn > span.endsOn)
      .sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1))[0];

    const boundedByNextTerm = nextYearStart ? addDays(nextYearStart.startsOn, -1) : null;

    let gapEnd: string | null = boundedByNextTerm;
    if (gapEnd === null) {
      const lastEventDay = [...byDay.keys()]
        .filter((day) => day >= gapStart)
        .sort()
        .pop();
      const reaches = [
        options.seasonEndsOn ?? null,
        lastEventDay ?? null,
        addDays(gapStart, MINIMUM_TRAILING_VACATION_WEEKS * 7 - 1),
      ]
        .filter((value): value is string => typeof value === "string" && value >= gapStart)
        .sort();
      gapEnd = reaches.length > 0 ? reaches[reaches.length - 1] : null;
    }
    if (gapEnd === null) return;

    emitVacation(
      name,
      vacationJumpLabel(name, gapStart),
      `vacation-after-${term.id}`,
      gapStart,
      gapEnd,
      "keep-first",
    );
  });

  segments.sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1));

  const covered = new Set<string>();
  for (const segment of segments) {
    for (const week of segment.weeks) {
      for (const day of week.days) covered.add(day.day);
    }
  }

  const outsideTheYear: CalendarEvent[] = [];
  let placedCount = 0;
  for (const [day, group] of byDay) {
    if (covered.has(day)) placedCount += group.length;
    else outsideTheYear.push(...group);
  }
  outsideTheYear.sort(byDate);

  return {
    academicYear,
    segments,
    undated,
    outsideTheYear,
    placedCount,
  };
}

export interface YearCoordinate {
  segmentKey: string;
  kind: YearSegmentKind;
  segmentName: string;
  week: number;
}

/** The coordinate for one day, looked up in an already-built column — so the list and the Oxford View agree (`REQ-three-arrangements`). */
export function yearCoordinateOf(
  column: AcademicYearColumn,
  day: string | null,
): YearCoordinate | null {
  if (day === null) return null;

  for (const segment of column.segments) {
    if (day < segment.startsOn || day > segment.endsOn) continue;
    for (const week of segment.weeks) {
      if (day < week.startsOn || day > week.endsOn) continue;
      return {
        segmentKey: segment.key,
        kind: segment.kind,
        segmentName: segment.name,
        week: week.week,
      };
    }
  }

  return null;
}

/** Every event a column actually renders — its cells, and what it states beneath. */
export function academicYearEvents(column: AcademicYearColumn): CalendarEvent[] {
  return [
    ...column.segments.flatMap((segment) =>
      segment.weeks.flatMap((week) => week.days.flatMap((day) => day.events)),
    ),
    ...column.outsideTheYear,
    ...column.undated,
  ];
}
