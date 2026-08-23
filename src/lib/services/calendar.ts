import type { TermWindow } from "./event-input";

/**
 * The Gregorian month projection, and the week arithmetic the Oxford one stands
 * on. LAN-114, narrowed by LAN-153.
 *
 * The continuous academic year is `./oxford-year`. What is left here is the
 * month grid — unchanged, by Brian's instruction of 20 August 2026 ("The
 * Gregorian calendar is fine as it is") — and `oxfordWeekRange`/`termWeeks`,
 * which both projections and `deriveTermCoordinate` share.
 *
 * ## Projections, not a second scheduling model
 *
 * The event's `scheduled_on` is the only operator-entered scheduling fact, and
 * this module never contradicts it, stores anything, or offers a way to edit a
 * term or a week. Everything below is a *rearrangement* of a list of events:
 * feed it the same events and it will produce a month grid and a year column
 * that name the same records on the same days. That is the whole of
 * `REQ-three-arrangements` — three arrangements of one query, which "cannot
 * disagree about which events exist or when they are".
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
  /** `YYYY-MM-DD`, or `null` for an event whose date is not decided yet. */
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
}

/*
 * `status` used to be here and is deliberately gone — LAN-153.
 *
 * Nothing in this module or in `./oxford-year` ever read it: placing an event on
 * a date does not depend on what state the event is in, and D5 means no state
 * hides an event from a calendar anyway. It was only ever passed through to the
 * tile, which is now handed the word it should print (`CalendarEntry`'s
 * `statusWord`) rather than deriving one.
 *
 * That is what lets these projections serve both tiers from one implementation.
 * The public tier has no status to give — `REQ-three-tiers` puts the status
 * column on the operator's side of the line — so a `CalendarEvent` that required
 * one would have forced the public list to invent a value, and "approved" for a
 * draft is exactly the kind of quiet lie a screen reader would then read out.
 */

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

/**
 * `YYYY-MM-DD` for an instant, or `""` past year 9999.
 *
 * `toISOString` switches to an expanded six-digit year outside 0000–9999, so
 * `addDays("9999-12-31", 1)` would otherwise return the string `"+010000-01"`.
 * `dayMs`'s round-trip guard cannot catch that, because the *input* parsed
 * fine. Unreachable from any plausible `scheduled_on`, and cheaper to close
 * than to reason about again later.
 */
function formatDay(ms: number): string {
  const iso = new Date(ms).toISOString();
  return iso.startsWith("+") || iso.startsWith("-") ? "" : iso.slice(0, 10);
}

/** `day` plus `count` days, as `YYYY-MM-DD`. `null` for an unparseable day. */
export function addDays(day: string, count: number): string | null {
  const ms = dayMs(day);
  if (ms === null) return null;
  const shifted = formatDay(ms + count * MS_PER_DAY);
  return shifted === "" ? null : shifted;
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
// Oxford week arithmetic
//
// The Oxford *projection* is `./oxford-year`, which arranges a whole academic
// year as one continuous column. What stays here is the arithmetic that turns
// a term row into Gregorian weeks, because the month grid, that column and
// `deriveTermCoordinate` all stand on it and none of them should own it.
//
// LAN-114 also built a per-term *card* here — `buildTermCard`, `nearestTerm`,
// `termOwning`, a six-week reach and a leftover panel. LAN-153 retired all of
// it along with the surface it drew (D85). Those functions existed to decide
// which term should borrow a vacation week; a continuous year has no vacation
// weeks to lend, so the questions they answered no longer arise.
// ---------------------------------------------------------------------------

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
 * Every event a month grid actually renders — the cells, and the undated list
 * beneath it.
 *
 * For the type legend, which claims to name "the types actually in view" and
 * has to be handed the same events the reader can see. Independent review found
 * it being fed the whole season instead, which named colours for types that
 * were nowhere on the screen.
 */
export function monthGridEvents(grid: MonthGrid): CalendarEvent[] {
  return [...grid.weeks.flat().flatMap((day) => day.events), ...grid.undated];
}
