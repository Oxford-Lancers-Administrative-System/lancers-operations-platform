import { addDays, oxfordWeekRange, termWeeks, type CalendarEvent } from "./calendar";
import type { TermWindow } from "./event-input";
import { labelFor, TERM_LABELS } from "./event-vocabulary";

/**
 * The Oxford View — one continuous academic year. LAN-153, `REQ-oxford-continuous`.
 *
 * ## What replaced the term card, and why
 *
 * LAN-114 built three separate term cards behind an academic-year selector and
 * an Oxford-term selector. Stewart Humble asked for the opposite on 17 August
 * 2026: _"you can do a continuous scroll and it's going to merge from Michaelmas
 * to Christmas vacation to Hilary to Easter vacation to Trinity to long vacation
 * to the next … you might say academic year 26/27, which is all the vacations
 * and all the terms."_ D85 recorded it, and this module is that column.
 *
 * The difference is not cosmetic. A term card can only show a term, so the weeks
 * between terms had to be borrowed by whichever card was nearest — which is why
 * LAN-114 needed `nearestTerm`, a six-week reach, an ownership question asked at
 * every cell to stop one event appearing on two cards, and a leftover panel for
 * the events no card could reach. A continuous year has none of those problems
 * to solve, because **every date in the year is already inside exactly one
 * segment**. All of that machinery went with the term card.
 *
 * ## A vacation belongs to neither adjacent term
 *
 * Asked directly whether the Christmas vacation was part of Michaelmas or part
 * of Hilary, Stewart answered _"It's neither."_ So a vacation is its own
 * segment, with its own name and its own week numbering, and `YearSegment.termId`
 * is `null` for one — not the term before it and not the term after it. That is
 * what retires D9's "an out-of-term event belongs to the term that follows it as
 * a negative week" and D10's "Outside term" strip: there is nothing left for a
 * catch-all to catch.
 *
 * ## Vacation weeks are numbered forward, and are not Oxford weeks
 *
 * _"Christmas Vacation 1, 2, 3 …"_, running _"until it'll match perfectly up
 * until minus one week of Hilary"_ — Stewart again, and the Long Vacation's
 * numbering reaches the twenties. `events.week_number` is constrained to −1..8
 * and could not hold "Long Vacation 22" even if somebody wanted it to, which is
 * the other half of why these coordinates are **derived here and never stored**.
 * Nothing in this module writes anything, and nothing reads `events.term_id` or
 * `events.week_number`: the event's real date is the source of truth and the
 * coordinate follows from it.
 *
 * ## Pure, like `./calendar`
 *
 * No database, no clock, no environment. The terms, the events, today's date and
 * the season's window are all arguments, so the club's reference boundaries can
 * be checked against this module directly and the same functions render in a
 * client component.
 */

// ---------------------------------------------------------------------------
// The club's own vacation vocabulary
// ---------------------------------------------------------------------------

/**
 * What the club calls the gap after each term. Taken verbatim from Stewart
 * Humble's 17 August 2026 transcript rather than invented, which is why this is
 * a map of three entries and not a rule about months.
 *
 * Keyed on the term the vacation **follows**, because that is how the club names
 * them: the vacation after Michaelmas is the Christmas one wherever Michaelmas
 * happens to fall.
 */
export const VACATION_AFTER: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Christmas Vacation",
  hilary: "Easter Vacation",
  trinity: "Long Vacation",
});

/**
 * The vacation that runs **into** a term, for the one segment that has no term
 * before it — the Long Vacation the season opens in.
 *
 * Brian, 20 August 2026: _"Each season will have the 2026 long vacation, and
 * then there will be a 2027 long vacation. Each season has one."_ So the year
 * carries a Long Vacation at each end, and the leading one is named from the
 * term it runs into rather than from a term in a year this column is not showing.
 */
export const VACATION_BEFORE: Readonly<Record<string, string>> = Object.freeze({
  michaelmas: "Long Vacation",
});

/** What an unnamed gap is called. Reachable only if `terms.name` grows a value. */
export const UNNAMED_VACATION = "Vacation";

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type YearSegmentKind = "term" | "vacation";

export interface YearDay {
  /** `YYYY-MM-DD`. */
  day: string;
  /** 0 for Sunday through 6 for Saturday — the column this cell is in. */
  weekday: number;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface YearWeek {
  /** The segment this row belongs to. */
  segmentKey: string;
  /**
   * The Oxford week on a term row (−1 … 8), or the forward count on a vacation
   * row (1, 2, 3 …).
   *
   * One field rather than two because a row has exactly one number either way,
   * and `kind` on the segment says which kind of number it is. What must never
   * happen is a vacation count being read as an Oxford week: `week: 22` on a
   * vacation row is "Long Vacation 22", and the schema would refuse to store it
   * as a week.
   */
  week: number;
  /** The row's own label — "−1st week", "3rd week", "Christmas Vacation 2". */
  label: string;
  /** The exact Gregorian Sunday this week starts on. */
  startsOn: string;
  /** The exact Gregorian Saturday it ends on — or earlier on a clipped row. */
  endsOn: string;
  days: YearDay[];
}

export interface YearSegment {
  /** Stable within one year — the jump control's value and the row anchor. */
  key: string;
  kind: YearSegmentKind;
  /** "Michaelmas", "Christmas Vacation", "Long Vacation". */
  name: string;
  /**
   * What a reader is shown — the club's word, not the stored one.
   *
   * `name` is `terms.name` for a term, which is the lower-case enum value the
   * schema holds; this is "Michaelmas". The two Long Vacations carry the
   * calendar year they start in, because a year has two of them and "Long
   * Vacation" twice in one menu names neither (Brian, 20 August 2026: "Each
   * season will have the 2026 long vacation, and then there will be a 2027 long
   * vacation").
   */
  jumpLabel: string;
  /**
   * The term this segment **is**, or `null` for a vacation.
   *
   * `null` is the load-bearing value: a vacation belongs to neither adjacent
   * term, so there is deliberately no field here naming the term before or after
   * it. Stewart, asked directly: "It's neither."
   */
  termId: string | null;
  startsOn: string;
  endsOn: string;
  weeks: YearWeek[];
}

export interface AcademicYearColumn {
  /** `terms.academic_year` — never parsed out of a heading. */
  academicYear: string;
  /** Long Vacation → Michaelmas → … → Trinity → Long Vacation, in order. */
  segments: YearSegment[];
  /** Events with no date at all. They have no week and no cell. */
  undated: CalendarEvent[];
  /**
   * Dated events outside the year this column covers.
   *
   * Normally empty, and structurally so: the column spans the whole academic
   * year, so a season's events are inside it. It exists because a date can be
   * recorded that predates the year's leading vacation, and dropping an event
   * silently is worse than listing it.
   */
  outsideTheYear: CalendarEvent[];
  /** Events placed in a cell. */
  placedCount: number;
}

// ---------------------------------------------------------------------------
// Week labels
// ---------------------------------------------------------------------------

/**
 * "−1st week" … "8th week" — the Oxford row labels, with a real minus sign.
 *
 * Spelled out rather than computed from the last digit, exactly as
 * `src/app/operate/events/calendar/presentation.ts` did for the term card: the
 * range is eleven values, and a rule that has to be right for eleven values is
 * better written as eleven values.
 */
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

// ---------------------------------------------------------------------------
// Building the year
// ---------------------------------------------------------------------------

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

/**
 * Which academic year this column is, derived from the term dates alone.
 *
 * Never from a heading, a season label or any other text: `LAN-153` makes that
 * an acceptance criterion, because a column that took its year from a string
 * would place Michaelmas correctly right up until somebody renamed a season.
 *
 * The rule, in order:
 *
 *   1. the year whose configured terms span **today** — what an operator opening
 *      the calendar in the middle of Hilary means by "this year";
 *   2. otherwise the year whose terms span the open season's start, which is
 *      what the club is operating even when today is outside every term;
 *   3. otherwise the latest year configured, so a calendar opened before the
 *      first term of a new year shows that year rather than nothing.
 */
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

/**
 * How the trailing Long Vacation is bounded when the next Michaelmas has not
 * been configured yet.
 *
 * A vacation with no term after it has no natural end, and the club's year has
 * to stop somewhere. It runs to the season's own `ends_on` where there is one,
 * and otherwise as far as the club's records reach — the last dated event in the
 * season. **One week at minimum**, so the segment exists and is named even in a
 * season whose events all fall inside term: a column that ended at Trinity 8th
 * week would not be the continuous year Stewart described.
 */
const MINIMUM_TRAILING_VACATION_WEEKS = 1;

export interface AcademicYearOptions {
  /** Today in the club's zone, `YYYY-MM-DD`. Highlights one column of cells. */
  today?: string | null;
  /** `seasons.ends_on`, which bounds the trailing Long Vacation when it is set. */
  seasonEndsOn?: string | null;
}

/**
 * One continuous academic year: Long Vacation, Michaelmas, Christmas Vacation,
 * Hilary, Easter Vacation, Trinity, Long Vacation.
 *
 * `terms` is **every** term, not just this year's: the leading Long Vacation is
 * numbered from the end of the previous year's last term, which is the only
 * place its week 1 can come from.
 */
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
  const placed = new Set<string>();

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
      for (const event of dayEvents) placed.add(event.id);
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

  /**
   * A vacation segment, numbered forward from 1, filling `startsOn`..`endsOn`.
   *
   * Whole Sunday–Saturday rows, and a short final row if the gap is not a whole
   * number of weeks. Terms start on a Sunday and end on a Saturday, so a short
   * row means a term's dates and week bounds disagree — worth rendering
   * truthfully rather than rounding away.
   */
  const emitVacation = (
    name: string,
    jumpLabel: string,
    key: string,
    startsOn: string,
    endsOn: string,
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

    segments.push({
      key,
      kind: "vacation",
      name,
      jumpLabel,
      termId: null,
      startsOn,
      endsOn,
      weeks,
    });
  };

  /** "Long Vacation 2026" — the calendar year a vacation starts in. */
  const vacationJumpLabel = (name: string, startsOn: string) =>
    name === "Long Vacation" ? `${name} ${startsOn.slice(0, 4)}` : name;

  // --- the leading Long Vacation -------------------------------------------
  //
  // Numbered from the day after the previous academic year's last term ends, so
  // "Long Vacation 14" is the fourteenth week of the actual vacation and not the
  // fourteenth week this column happens to draw. Without a previous year there
  // is nothing to number from, and the segment is omitted rather than invented.
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
      );
    }
  }

  // --- the terms, and the vacations between them ---------------------------
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

    // --- the trailing Long Vacation ---------------------------------------
    if (gapStart === null) return;

    const nextYearStart = [...terms]
      .map((candidate) => termSpan(candidate))
      .filter((candidate): candidate is { startsOn: string; endsOn: string } => candidate !== null)
      .filter((candidate) => candidate.startsOn > span.endsOn)
      .sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1))[0];

    // A next Michaelmas, once one is configured, ends this vacation exactly
    // where the club's year says it ends. Everything below is the fallback for
    // the year nobody has entered yet.
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
  for (const [day, group] of byDay) {
    if (!covered.has(day)) outsideTheYear.push(...group);
  }
  outsideTheYear.sort(byDate);

  return {
    academicYear,
    segments,
    undated,
    outsideTheYear,
    placedCount: placed.size,
  };
}

// ---------------------------------------------------------------------------
// Reading one date's coordinate off the same column
// ---------------------------------------------------------------------------

/** Where one date sits in the year — the segment, and the week within it. */
export interface YearCoordinate {
  segmentKey: string;
  kind: YearSegmentKind;
  /** "Michaelmas", "Christmas Vacation". */
  segmentName: string;
  /** The Oxford week, or the vacation's forward count. */
  week: number;
}

/**
 * The coordinate for one day, looked up in a column that has already been built.
 *
 * The list's **Term and week** column reads this rather than deriving its own
 * answer, and that is the whole point: `REQ-three-arrangements` requires the
 * list and the Oxford View to agree about when an event is, and two derivations
 * of one rule is the way that stops being true. It is also why nothing here
 * consults `events.term_id` or `events.week_number` — the stored coordinate is
 * derived from the date too, and reading it back would quietly make a cached
 * value authoritative for its own projection.
 */
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
