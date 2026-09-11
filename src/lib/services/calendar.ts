import type { TermWindow } from "./event-input";

// The Gregorian month projection, and the week arithmetic ./oxford-year stands on — LAN-114,
// narrowed by LAN-153. Pure, a rearrangement of one event list (REQ-three-arrangements); nothing
// here stores or edits a term/week. Week grid is Sunday-first, from the term cards (SDA §5.4).
// Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE

export interface CalendarEvent {
  id: string;
  name: string;
  templateName: string; // the word the tile prints — LAN-265
  templateColour: string; // key into TEMPLATE_COLOUR_PALETTE, chosen on the template editor (LAN-276 R1)
  eventType: string; // behavioural class, never rendered — see templateColour
  scheduledOn: string | null; // YYYY-MM-DD, or null when not decided
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
}

// status used to be here and is deliberately gone (LAN-153; see relocations.md).

const MS_PER_DAY = 86_400_000;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_PATTERN = /^\d{4}-\d{2}$/;

// UTC, not the club zone — scheduled_on is a bare date, a label for a day, not an instant.
function dayMs(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null;
  const parsed = Date.parse(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed)) return null;
  return formatDay(parsed) === day ? parsed : null; // Date.parse rolls 2026-02-31 into March; refuse it instead
}

// toISOString expands to a six-digit year outside 0000-9999; unreachable from a real scheduled_on, cheap to close anyway.
function formatDay(ms: number): string {
  const iso = new Date(ms).toISOString();
  return iso.startsWith("+") || iso.startsWith("-") ? "" : iso.slice(0, 10);
}

export function addDays(day: string, count: number): string | null {
  const ms = dayMs(day);
  if (ms === null) return null;
  const shifted = formatDay(ms + count * MS_PER_DAY);
  return shifted === "" ? null : shifted;
}

export function weekdayOf(day: string): number | null {
  const ms = dayMs(day);
  return ms === null ? null : new Date(ms).getUTCDay();
}

function daysBetween(from: string, to: string): number | null {
  const fromMs = dayMs(from);
  const toMs = dayMs(to);
  if (fromMs === null || toMs === null) return null;
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

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

// Invariant E4: a cell holds a list, never a single event. No-start sorts after timed ones.
function byStartTime(left: CalendarEvent, right: CalendarEvent): number {
  const leftAt = left.startsAt ?? "99:99";
  const rightAt = right.startsAt ?? "99:99";
  if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1;
  if (left.name !== right.name) return left.name < right.name ? -1 : 1;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function groupByDay(events: readonly CalendarEvent[]): {
  byDay: Map<string, CalendarEvent[]>;
  undated: CalendarEvent[];
} {
  const byDay = new Map<string, CalendarEvent[]>();
  const undated: CalendarEvent[] = [];

  for (const event of events) {
    const day = // an unparseable date is treated like a missing one — surfaces in undated, never dropped silently
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

interface MonthDay {
  day: string; // YYYY-MM-DD
  dayOfMonth: number;
  inMonth: boolean; // false for the leading/trailing days borrowed from adjacent months
  isToday: boolean;
  events: CalendarEvent[];
}

export interface MonthGrid {
  month: string; // YYYY-MM
  weeks: MonthDay[][]; // whole Sunday-Saturday weeks, enough to cover the month and no more
  undated: CalendarEvent[]; // events with no usable date; belong to no cell
  placedCount: number; // events placed somewhere in the grid, including its borrowed days
}

export function parseMonth(value: string | null | undefined): string | null {
  if (typeof value !== "string" || !MONTH_PATTERN.test(value)) return null;
  return dayMs(`${value}-01`) === null ? null : value;
}

export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + delta;
  const shiftedYear = year + Math.floor(index / 12);
  const shiftedMonth = ((index % 12) + 12) % 12;
  return `${`${shiftedYear}`.padStart(4, "0")}-${`${shiftedMonth + 1}`.padStart(2, "0")}`;
}

function sundayOnOrBefore(day: string): string | null {
  const weekday = weekdayOf(day);
  return weekday === null ? null : addDays(day, -weekday);
}

function daysInMonth(month: string): number {
  const next = shiftMonth(month, 1);
  return daysBetween(`${month}-01`, `${next}-01`) ?? 30;
}

// Shows the leading/trailing days of adjacent months (inMonth: false) and places events on them.
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

  const last = addDays(first, length - 1) as string;
  const span = (daysBetween(start, last) ?? 0) + 1;
  const weekCount = Math.ceil(span / 7); // five for a short month starting Sunday, six otherwise

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

// Today's month whenever the season has anything in it; otherwise the nearest event's month.
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

// The Oxford *projection* is ./oxford-year; this is the arithmetic turning a term row into
// Gregorian weeks. LAN-153 retired the per-term card that used to live here (see relocations.md).
// terms.starts_on is the first day of first_week, not week 1 — Michaelmas (-1) and Hilary (0) share this.
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

export function termWeeks(term: TermWindow): number[] {
  const weeks: number[] = [];
  for (let week = term.firstWeek; week <= term.lastWeek; week += 1) weeks.push(week);
  return weeks;
}

// For the type legend, handed the same events the reader can see (see relocations.md).
export function monthGridEvents(grid: MonthGrid): CalendarEvent[] {
  return [...grid.weeks.flat().flatMap((day) => day.events), ...grid.undated];
}
