import { TERM_LABELS, labelFor, shortMonthOf } from "../presentation";
import type { TermWindow } from "@/lib/services/event-input";

/**
 * How the two calendars read on screen. LAN-114.
 *
 * Presentation only, and pure, for the same reason `../presentation.ts` is: the
 * month grid, the term card and the lists beside them all name the same weeks
 * and the same statuses, and a heading that disagrees with a cell is a defect
 * an operator finds before a test does.
 *
 * Dates are formatted at UTC, exactly as `../presentation.ts` explains:
 * `scheduled_on` is a bare `date`, so rendering it in the viewer's zone would
 * move a Wednesday practice to Tuesday for anybody east of Greenwich. Which day
 * is *today* is a different question, and it is answered once in
 * `@/lib/club-time` rather than here.
 */

function part(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** "October 2026" — the Gregorian view's heading. */
export function formatMonthLabel(month: string): string {
  const anchor = `${month}-01`;
  return `${part(anchor, { month: "long" })} ${part(anchor, { year: "numeric" })}`;
}

/** "2026-10" as a `<input type="month">` understands it. Identity, but named. */
export function monthInputValue(month: string): string {
  return month;
}

/**
 * "11 – 17 Oct 2026" — the exact Gregorian range on a term-card week row.
 *
 * The issue requires the exact range on every row, and the supplied cards show
 * it as "1st (25th-1st May)" — a form that leaves the reader to infer the month
 * of the first date and the year of both. The month is repeated whenever the
 * week crosses one, and the year whenever it crosses that, so no row needs
 * another row to be read.
 */
export function formatWeekRange(startsOn: string, endsOn: string): string {
  const startDay = part(startsOn, { day: "numeric" });
  const endDay = part(endsOn, { day: "numeric" });
  const startMonth = shortMonthOf(startsOn);
  const endMonth = shortMonthOf(endsOn);
  const startYear = part(startsOn, { year: "numeric" });
  const endYear = part(endsOn, { year: "numeric" });

  if (startYear !== endYear) {
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `${startDay} – ${endDay} ${startMonth} ${startYear}`;
}

/**
 * "−1st week", "0th week", "1st week" — the row labels the sources use.
 *
 * A real minus sign for week −1, matching `../presentation.ts`'s
 * `describeTermCoordinate`. The ordinal suffixes are spelled out rather than
 * computed from the last digit, because the range is −1 to 8 and a rule that
 * has to be right for eleven values is better written as eleven values.
 */
const WEEK_ORDINALS: Readonly<Record<string, string>> = Object.freeze({
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

export function formatOxfordWeek(week: number): string {
  return `${WEEK_ORDINALS[`${week}`] ?? `${week}`} week`;
}

/**
 * A term-card row's label — an Oxford week, or the fact that it is not one.
 *
 * Context rows say "Before term" and "After term" rather than inventing "−2nd
 * week". The club has no name for the week before −1st week, `week_number` is
 * constrained to −1 through 8, and a made-up ordinal would read as an Oxford
 * week that the rest of the system would refuse to store. The row's date range
 * sits underneath either way, so a context row is never ambiguous about which
 * seven days it covers.
 */
export function formatWeekLabel(week: {
  week: number | null;
  outside: "before" | "after" | null;
}): string {
  if (week.week !== null) return formatOxfordWeek(week.week);
  return week.outside === "before" ? "Before term" : "After term";
}

/** "Michaelmas 2026-27" — a term named as the club names it. */
export function formatTermName(term: TermWindow): string {
  return `${labelFor(TERM_LABELS, term.name)} ${term.academicYear}`;
}

/** "Sun 27" — the day number in a term-card or month cell. */
export function formatDayNumber(day: string): string {
  return part(day, { day: "numeric" });
}

/** "Wed 14 Oct 2026" — the accessible name a cell gives its date. */
export function formatCellDate(day: string): string {
  const weekday = part(day, { weekday: "short" });
  const dayNumber = part(day, { day: "numeric" });
  const month = shortMonthOf(day);
  const year = part(day, { year: "numeric" });
  return `${weekday} ${dayNumber} ${month} ${year}`;
}

/** The heading above each calendar, saying what it is showing and from where. */
export const CALENDAR_SOURCE_NOTE =
  "The list, the Gregorian calendar and the Oxford term card show the same events on the " +
  "same dates. Oxford term, week and day are derived from each event’s actual date; there " +
  "is no separate term or week to edit.";

/** Read access is not management, said once rather than implied by absence. */
export const CALENDAR_READ_ONLY_NOTE =
  "Every linked, active operator can read this calendar, including saved drafts. Creating " +
  "and changing events stays with the President, Vice President, Secretary and General " +
  "Manager.";

/**
 * One line under the card, saying where the rest of the season is.
 *
 * The card itself now carries the weeks either side of term, so the only events
 * it does not show are the ones another term's card does. Naming that in a
 * sentence is enough — the earlier version listed or counted every other term
 * and offered links to their cards, which Brian's review found both too
 * prominent and redundant with the term selector directly above.
 */
export const OTHER_TERMS_NOTE =
  "Events in the season’s other Oxford terms appear on those terms’ cards — use the term " +
  "selector above. Every event in the season is also in the list and in the Gregorian calendar.";

export const UNDATED_HEADLINE = "No date recorded yet";

export const UNDATED_DETAIL =
  "An event with no date cannot be placed on either calendar. It stays here, and in the list, " +
  "until a date is recorded.";

export const OUTSIDE_ANY_TERM_LABEL = "Too far from any term to show";

export const OUTSIDE_ANY_TERM_DETAIL =
  "These events are more than six weeks from the nearest Oxford term, so no term card reaches " +
  "them. They are on their real dates in the Gregorian calendar and in the list.";

/** Empty states — distinguished, because the recovery differs. */
export const MONTH_EMPTY = "No event in this season falls in this month.";

export const TERM_CARD_EMPTY = "No event in this season falls in this term.";

export const NO_TERMS_CONFIGURED =
  "No Oxford term is configured, so there is no term card to show. The Gregorian calendar " +
  "and the list are unaffected.";
