import { deriveTermCoordinate, type TermWindow } from "./event-input";

/**
 * The two calendar projections — Gregorian month, and the Oxford term card.
 * LAN-114.
 *
 * ## Projections, not a second scheduling model
 *
 * The event's `scheduled_on` is the only operator-entered scheduling fact, and
 * this module never contradicts it, stores anything, or offers a way to edit a
 * term or a week. Everything below is a *rearrangement* of a list of events:
 * feed it the same events and it will produce a month grid and a term card that
 * name the same records on the same days. That is the whole of the issue's
 * "same event records and actual dates; they differ only in how time is
 * organized and displayed".
 *
 * Placement into an Oxford cell comes from `deriveTermCoordinate` — the
 * function LAN-76 already uses to stamp `events.term_id` and
 * `events.week_number` when a draft is saved. Reusing it rather than
 * re-deriving is what guarantees the card and the stored coordinate agree; a
 * second implementation of the same rule is a defect waiting for a term whose
 * dates are unusual.
 *
 * ## Pure, and deliberately not `server-only`
 *
 * No database, no clock, no environment. Every input — the events, the terms,
 * today's date — is an argument, so the reference term cards in the issue can
 * be checked against this module directly, and the same functions are safe to
 * render from a client component.
 *
 * ## The week grid is Sunday-first, from the sources
 *
 * The three supplied OULAFC term cards lay their columns out Sunday through
 * Saturday, and `public.terms` stores `starts_on` as the first day of
 * `first_week` on that same footing (Source Data Analysis §5.4). The Gregorian
 * month grid uses the same first day rather than the more common Monday, so an
 * operator moving between the two views is reading the same shape of week.
 */

// ---------------------------------------------------------------------------
// What the calendar needs of an event
// ---------------------------------------------------------------------------

/**
 * The subset of an event these projections read.
 *
 * Structural rather than an import of `EventListEntry`, so this module has no
 * dependency on the service layer's row shape and can be exercised with
 * hand-written events. `EventListEntry` satisfies it.
 */
export interface CalendarEvent {
  id: string;
  name: string;
  eventType: string;
  status: string;
  /** `YYYY-MM-DD`, or `null` for an event whose date is not decided yet. */
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
}

// ---------------------------------------------------------------------------
// Bare-date arithmetic
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/**
 * Midnight UTC for a `YYYY-MM-DD`, or `null` if it will not parse.
 *
 * UTC, not the club zone, and that is not an inconsistency: `scheduled_on` is a
 * PostgreSQL `date` with no zone attached, so these values are labels for days
 * rather than instants. Anchoring every one of them at the same fixed offset is
 * what makes "add seven days" mean seven days across a daylight-saving change.
 * The club zone decides which day is *today* (`@/lib/club-time`); it has no
 * business in arithmetic between two bare dates.
 */
function dayMs(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  // `Date.parse` accepts 2026-02-31 and rolls it into March. A day that does
  // not exist is bad input, not the first of the next month.
  return formatDay(parsed) === day ? parsed : null;
}

function formatDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `day` plus `count` days, as `YYYY-MM-DD`. `null` for an unparseable day. */
export function addDays(day: string, count: number): string | null {
  const ms = dayMs(day);
  return ms === null ? null : formatDay(ms + count * MS_PER_DAY);
}

/** 0 for Sunday through 6 for Saturday, or `null` for an unparseable day. */
export function weekdayOf(day: string): number | null {
  const ms = dayMs(day);
  return ms === null ? null : new Date(ms).getUTCDay();
}

/** Whole days from `from` to `to`, or `null` if either will not parse. */
function daysBetween(from: string, to: string): number | null {
  const fromMs = dayMs(from);
  const toMs = dayMs(to);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

/** The `YYYY-MM` a day falls in. */
export function monthOf(day: string): string | null {
  return DAY_PATTERN.test(day) && dayMs(day) !== null ? day.slice(0, 7) : null;
}

/** Sunday-first column headings, in the order the grids use them. */
export const WEEKDAY_LABELS: readonly string[] = Object.freeze([
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]);

// ---------------------------------------------------------------------------
// Ordering within a day
// ---------------------------------------------------------------------------

/**
 * Events on one day, earliest start first.
 *
 * Invariant E4 permits any number of events on a date, so a cell holds a list
 * and never a single event — the issue is explicit that two events on a day may
 * not be "overwritten, hidden, or collapsed into an incorrect uniqueness
 * assumption". An event with no start time sorts after the timed ones (it is
 * less specific, not earlier), and the name breaks a remaining tie so the order
 * is stable between renders rather than left to the query's mood.
 */
function byStartTime(left: CalendarEvent, right: CalendarEvent): number {
  const leftAt = left.startsAt ?? "99:99";
  const rightAt = right.startsAt ?? "99:99";
  if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/** Events grouped by `scheduledOn`, each group ordered, plus the undated ones. */
function groupByDay(events: readonly CalendarEvent[]): {
  byDay: Map<string, CalendarEvent[]>;
  undated: CalendarEvent[];
} {
  const byDay = new Map<string, CalendarEvent[]>();
  const undated: CalendarEvent[] = [];

  for (const event of events) {
    // An unparseable date is treated exactly like a missing one: it cannot be
    // placed on a grid, and dropping it silently is the failure mode this
    // issue names. It surfaces in the undated list instead.
    const day =
      event.scheduledOn === null
        ? null
        : dayMs(event.scheduledOn) === null
          ? null
          : event.scheduledOn;
    if (day === null) {
      undated.push(event);
      continue;
    }
    const existing = byDay.get(day);
    if (existing) existing.push(event);
    else byDay.set(day, [event]);
  }

  for (const group of byDay.values()) group.sort(byStartTime);
  undated.sort(byStartTime);

  return { byDay, undated };
}

// ---------------------------------------------------------------------------
// The Gregorian month
// ---------------------------------------------------------------------------

export interface MonthDay {
  /** `YYYY-MM-DD`. */
  day: string;
  dayOfMonth: number;
  /** False for the leading and trailing days borrowed from the months either side. */
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface MonthGrid {
  /** `YYYY-MM`. */
  month: string;
  /** Whole Sunday–Saturday weeks, enough to cover the month and no more. */
  weeks: MonthDay[][];
  /** Events with no usable date. They belong to no cell and are listed apart. */
  undated: CalendarEvent[];
  /** Events placed somewhere in the grid, including its borrowed days. */
  placedCount: number;
}

/** `YYYY-MM` if it parses as a real month, else `null`. */
export function parseMonth(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) return null;
  return dayMs(`${value}-01`) === null ? null : value;
}

/** `month` moved by `delta` months, staying a valid `YYYY-MM`. */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const shiftedYear = year + Math.floor(index / 12);
  const shiftedMonth = ((index % 12) + 12) % 12;
  return `${`${shiftedYear}`.padStart(4, "0")}-${`${shiftedMonth + 1}`.padStart(2, "0")}`;
}

/** The Sunday on or before `day`. */
function sundayOnOrBefore(day: string): string | null {
  const weekday = weekdayOf(day);
  return weekday === null ? null : addDays(day, -weekday);
}

/** The number of days in a `YYYY-MM`. */
function daysInMonth(month: string): number {
  const next = shiftMonth(month, 1);
  return daysBetween(`${month}-01`, `${next}-01`) ?? 30;
}

/**
 * One Gregorian month, as whole Sunday–Saturday weeks.
 *
 * The grid deliberately shows the leading and trailing days of the adjacent
 * months, marked `inMonth: false`, and it places events on them. A practice on
 * Sunday 1 November sitting in the last row of October is how a paper calendar
 * behaves and how an operator checks the turn of a month; blanking those cells
 * would hide real events on a page that appears to show that week.
 */
export function buildMonthGrid(
  month: string,
  events: readonly CalendarEvent[],
  today: string | null = null,
): MonthGrid {
  const { byDay, undated } = groupByDay(events);

  const first = `${month}-01`;
  const start = sundayOnOrBefore(first);
  const length = daysInMonth(month);

  if (start === null) {
    return {
      month,
      weeks: [],
      undated: [...undated, ...[...byDay.values()].flat()],
      placedCount: 0,
    };
  }

  // Whole weeks from that Sunday until the month's last day is covered — five
  // for a short month that starts on a Sunday, six for a long one that does not.
  const last = addDays(first, length - 1) as string;
  const span = (daysBetween(start, last) ?? 0) + 1;
  const weekCount = Math.ceil(span / 7);

  const weeks: MonthDay[][] = [];
  let placedCount = 0;

  for (let week = 0; week < weekCount; week += 1) {
    const row: MonthDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      const day = addDays(start, week * 7 + column) as string;
      const dayEvents = byDay.get(day) ?? [];
      placedCount += dayEvents.length;
      row.push({
        day,
        dayOfMonth: Number(day.slice(8, 10)),
        inMonth: day.slice(0, 7) === month,
        isToday: today !== null && day === today,
        events: dayEvents,
      });
    }
    weeks.push(row);
  }

  return { month, weeks, undated, placedCount };
}

/**
 * The month the calendar opens on.
 *
 * Today's month is the answer whenever the season has anything in it, because
 * that is what an operator opening the calendar in the middle of a term wants.
 * Outside that — and the club spends the summer outside it — an empty grid for
 * August says nothing true about a season that runs September to June, so the
 * month of the nearest event is a better first screen: the next one if the
 * season has not started, the most recent one if it has finished.
 */
export function defaultMonth(events: readonly CalendarEvent[], today: string): string {
  const fallback = monthOf(today) ?? today.slice(0, 7);

  const dated = events
    .map((event) => event.scheduledOn)
    .filter((day): day is string => day !== null && dayMs(day) !== null)
    .sort();

  if (dated.length === 0) return fallback;
  if (dated.some((day) => day.slice(0, 7) === fallback)) return fallback;

  const next = dated.find((day) => day >= today);
  return (next ?? dated[dated.length - 1]).slice(0, 7);
}

// ---------------------------------------------------------------------------
// The Oxford term card
// ---------------------------------------------------------------------------

export interface TermCardDay {
  /** `YYYY-MM-DD`. */
  day: string;
  /** 0 for Sunday through 6 for Saturday — the column this cell is in. */
  weekday: number;
  isToday: boolean;
  events: CalendarEvent[];
}

export interface TermCardWeek {
  /**
   * The Oxford week, or `null` for a context row outside the term.
   *
   * −1 and 0 are real weeks, not placeholders, which is why "no week" has to be
   * `null` rather than a number outside the range. A context row genuinely has
   * no Oxford week: the club does not call the week before Michaelmas "−2nd",
   * and inventing a number the schema refuses would be a worse answer than
   * saying the row sits outside term and giving its dates.
   */
  week: number | null;
  /** `"before"` or `"after"` on a context row; `null` on a real Oxford week. */
  outside: "before" | "after" | null;
  /** The exact Gregorian Sunday this week starts on. */
  startsOn: string;
  /** The exact Gregorian Saturday it ends on. */
  endsOn: string;
  days: TermCardDay[];
}

/** Events no term card can hold. */
export interface TermCardElsewhere {
  /**
   * Events with no usable date. They have no week, no term and no cell, and
   * they are the only thing left over once the card extends to reach the rest.
   */
  undated: CalendarEvent[];
  /**
   * Dated events too far from any term for a card to reach — beyond
   * `MAX_CONTEXT_WEEKS` from the nearest one. Normally empty.
   */
  farFromAnyTerm: CalendarEvent[];
  total: number;
}

export interface TermCard {
  term: TermWindow;
  weeks: TermCardWeek[];
  elsewhere: TermCardElsewhere;
  /** Events placed on this card, including on its context rows. */
  placedCount: number;
}

/**
 * The exact Gregorian week a term's Oxford week occupies, or `null` if the term
 * does not have that week.
 *
 * `terms.starts_on` is the first day of `first_week` — not of week 1 — which is
 * why Michaelmas, beginning at week −1, and Hilary, beginning at 0th, can share
 * one arithmetic. Weeks are seven days from there, so the range is the seven
 * days beginning `(week − first_week) × 7` after the term's start.
 *
 * Checked against all three supplied 2026–27 term cards in this module's tests,
 * to the day and at both ends.
 */
export function oxfordWeekRange(
  term: TermWindow,
  week: number,
): { startsOn: string; endsOn: string } | null {
  if (!Number.isInteger(week) || week < term.firstWeek || week > term.lastWeek) return null;

  const startsOn = addDays(term.startsOn, (week - term.firstWeek) * 7);
  if (startsOn === null) return null;

  const endsOn = addDays(startsOn, 6);
  return endsOn === null ? null : { startsOn, endsOn };
}

/** Every Oxford week a term is configured to have, in order. */
export function termWeeks(term: TermWindow): number[] {
  const weeks: number[] = [];
  for (let week = term.firstWeek; week <= term.lastWeek; week += 1) weeks.push(week);
  return weeks;
}

/**
 * How far past its own weeks a card will reach for an event.
 *
 * The longest gap between two consecutive Oxford terms in a real club year is
 * the Christmas vacation — five weeks between Michaelmas ending on 5 December
 * 2026 and Hilary starting on 10 January 2027. Six weeks therefore reaches any
 * event in any real vacation from the term on either side of it, while still
 * bounding a card: an event a year adrift does not drag fifty empty rows onto
 * the screen behind it.
 */
export const MAX_CONTEXT_WEEKS = 6;

/**
 * The term whose card should carry a date that falls in no term at all.
 *
 * By distance to the nearest end of each term's window, so a mid-December
 * social belongs to Michaelmas and a late-January one to Hilary; a tie goes to
 * the earlier term, which reads as "after Michaelmas" rather than "long before
 * Hilary". `null` when the date is further than `MAX_CONTEXT_WEEKS` from every
 * term, which is what the screen reports as unreachable.
 */
export function nearestTerm(day: string, terms: readonly TermWindow[]): TermWindow | null {
  let best: { term: TermWindow; distance: number } | null = null;

  for (const term of terms) {
    const before = daysBetween(day, term.startsOn);
    const after = daysBetween(term.endsOn, day);
    if (before === null || after === null) continue;

    // Inside the window is distance zero; otherwise however many days outside.
    const distance = Math.max(0, before, after);
    if (distance > MAX_CONTEXT_WEEKS * 7) continue;

    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && term.startsOn < best.term.startsOn)
    ) {
      best = { term, distance };
    }
  }

  return best?.term ?? null;
}

/**
 * One term card: the term's Oxford weeks as rows, Sunday–Saturday as columns,
 * and however many dated context rows either side it takes to reach the events
 * around the term.
 *
 * ## Why the card reaches past the term
 *
 * The first version pushed everything outside the configured weeks into a list
 * underneath — other terms, vacation events, undated events, all together.
 * Brian's review on 14 August 2026 was that this is the wrong shape: an event a
 * few days either side of term should be *on the card*, in its real week, and
 * the panel underneath should be small and only for what genuinely has nowhere
 * to go. The links out to other terms' cards went with it; the term selector is
 * how you reach another term.
 *
 * So a card grows. Every dated event in the season attaches to its nearest
 * term (`nearestTerm`), and the card emits whole Sunday–Saturday rows before
 * its first week and after its last until it covers the ones attached to it.
 * Those rows carry `week: null` and an `outside` marker: the club has no name
 * for the week before −1st week, and inventing "−2nd" would assert an Oxford
 * week that does not exist and that the schema would refuse.
 *
 * Rows are emitted only as far as there is something to show. A term with no
 * events around it renders exactly its own weeks, as before.
 *
 * ## Placement inside the term
 *
 * From `deriveTermCoordinate` over the full term list, never from the event's
 * stored `term_id`. Both agree today, because both are that same function; but
 * the issue makes the actual date authoritative and the coordinate derived, and
 * reading the derived column back would quietly make a stored value the source
 * of truth for its own projection.
 */
export function buildTermCard(
  term: TermWindow,
  terms: readonly TermWindow[],
  events: readonly CalendarEvent[],
  today: string | null = null,
): TermCard {
  const { byDay, undated } = groupByDay(events);

  const firstRange = oxfordWeekRange(term, term.firstWeek);
  const lastRange = oxfordWeekRange(term, term.lastWeek);
  if (!firstRange || !lastRange) {
    return {
      term,
      weeks: [],
      elsewhere: { undated, farFromAnyTerm: [], total: undated.length },
      placedCount: 0,
    };
  }

  // How far the card has to reach in each direction. Only events this term is
  // the nearest to count: a Hilary fixture is Hilary's to show, and pulling it
  // onto the Michaelmas card would put one event on two cards.
  const farFromAnyTerm: CalendarEvent[] = [];
  let weeksBefore = 0;
  let weeksAfter = 0;

  for (const [day, group] of byDay) {
    const coordinate = deriveTermCoordinate(day, terms);
    if (coordinate.termId !== null) continue;

    const owner = nearestTerm(day, terms);
    if (owner === null) {
      farFromAnyTerm.push(...group);
      continue;
    }
    if (owner.id !== term.id) continue;

    const before = daysBetween(day, firstRange.startsOn);
    const after = daysBetween(lastRange.endsOn, day);
    if (before !== null && before > 0) weeksBefore = Math.max(weeksBefore, Math.ceil(before / 7));
    if (after !== null && after > 0) weeksAfter = Math.max(weeksAfter, Math.ceil(after / 7));
  }

  weeksBefore = Math.min(weeksBefore, MAX_CONTEXT_WEEKS);
  weeksAfter = Math.min(weeksAfter, MAX_CONTEXT_WEEKS);

  const weeks: TermCardWeek[] = [];
  const placed = new Set<string>();

  const emit = (startsOn: string, week: number | null, outside: "before" | "after" | null) => {
    const days: TermCardDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      const day = addDays(startsOn, column) as string;
      const dayEvents = byDay.get(day) ?? [];
      for (const event of dayEvents) placed.add(event.id);
      days.push({
        day,
        weekday: column,
        isToday: today !== null && day === today,
        events: dayEvents,
      });
    }
    weeks.push({ week, outside, startsOn, endsOn: addDays(startsOn, 6) as string, days });
  };

  for (let offset = weeksBefore; offset >= 1; offset -= 1) {
    const startsOn = addDays(firstRange.startsOn, -offset * 7);
    if (startsOn !== null) emit(startsOn, null, "before");
  }

  for (const week of termWeeks(term)) {
    const range = oxfordWeekRange(term, week);
    if (range !== null) emit(range.startsOn, week, null);
  }

  for (let offset = 1; offset <= weeksAfter; offset += 1) {
    const startsOn = addDays(lastRange.endsOn, (offset - 1) * 7 + 1);
    if (startsOn !== null) emit(startsOn, null, "after");
  }

  farFromAnyTerm.sort(byDate);

  return {
    term,
    weeks,
    elsewhere: {
      undated,
      farFromAnyTerm,
      total: undated.length + farFromAnyTerm.length,
    },
    placedCount: placed.size,
  };
}

/** Date first, then the within-day order. For the lists beside the card. */
function byDate(left: CalendarEvent, right: CalendarEvent): number {
  const leftOn = left.scheduledOn ?? "";
  const rightOn = right.scheduledOn ?? "";
  if (leftOn !== rightOn) return leftOn < rightOn ? -1 : 1;
  return byStartTime(left, right);
}

// ---------------------------------------------------------------------------
// Choosing a term
// ---------------------------------------------------------------------------

export interface AcademicYearTerms {
  academicYear: string;
  /** Michaelmas, then Hilary, then Trinity — by their real dates, not by name. */
  terms: TermWindow[];
}

/**
 * The configured terms, grouped by academic year, newest year first and each
 * year's terms in the order the club lives them.
 *
 * Ordered by `starts_on` rather than by the `term_name` enum on purpose: the
 * order Michaelmas, Hilary, Trinity is a fact about when those terms happen,
 * and reading it off the dates keeps the selector correct for a year whose
 * terms were configured in any order.
 *
 * The academic-year label comes from the `terms` row, never from a heading in a
 * spreadsheet. The supplied HT27 and TT27 cards are headed "HT2026" and
 * "TT2026" while their dates are January and April **2027**; the issue calls
 * that stale source labelling, and the only defence against it is that no code
 * path here reads a year from anything but the configured term.
 */
export function groupTermsByAcademicYear(terms: readonly TermWindow[]): AcademicYearTerms[] {
  const years = new Map<string, TermWindow[]>();

  for (const term of terms) {
    const bucket = years.get(term.academicYear);
    if (bucket) bucket.push(term);
    else years.set(term.academicYear, [term]);
  }

  return [...years.entries()]
    .map(([academicYear, yearTerms]) => ({
      academicYear,
      terms: [...yearTerms].sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1)),
    }))
    .sort((left, right) => (left.academicYear < right.academicYear ? 1 : -1));
}

/**
 * The term the Oxford view opens on.
 *
 * The term containing today, when there is one. Otherwise the next term to
 * start — in August, which is where the club year turns, that is Michaelmas
 * rather than the Trinity that has just finished. Only if there is no future
 * term does it fall back to the most recent one.
 */
export function defaultTerm(terms: readonly TermWindow[], today: string): TermWindow | null {
  if (terms.length === 0) return null;

  const byStart = [...terms].sort((left, right) => (left.startsOn < right.startsOn ? -1 : 1));

  const current = byStart.find((term) => term.startsOn <= today && today <= term.endsOn);
  if (current) return current;

  const next = byStart.find((term) => term.startsOn > today);
  return next ?? byStart[byStart.length - 1];
}

/** The configured term with this id, or `null`. */
export function findTerm(terms: readonly TermWindow[], termId: string | null): TermWindow | null {
  if (!termId) return null;
  return terms.find((term) => term.id === termId) ?? null;
}
