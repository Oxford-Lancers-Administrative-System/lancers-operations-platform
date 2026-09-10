import {
  formatDatePart,
  labelFor,
  shortMonthOf,
  TERM_LABELS,
} from "@/lib/services/event-vocabulary";
import type { TermWindow } from "@/lib/services/event-input";
import { templateColourFor, type TemplateColourSwatch } from "@/lib/services/event-template-input";

/**
 * How the calendars read on screen — both arrangements, and both tiers.
 * LAN-114, moved and widened by LAN-153.
 *
 * Presentation only, and pure: the month grid, the year column and the lists
 * beside them all name the same weeks and the same dates, and a heading that
 * disagrees with a cell is a defect a reader finds before a test does.
 *
 * ## Why this sits in `/calendar` rather than under `/operate`
 *
 * Because the public calendar and the operator's are the same two arrangements
 * of the same query (`REQ-three-arrangements`), and they have to be the same
 * code or they will eventually disagree about which Sunday a week starts on.
 * The public surface is the widest and the most constrained, so the shared
 * components live with it and `/operate/events/calendar` imports them — the
 * `W1` specification's own framing: "the anonymous reader defines them".
 *
 * Nothing here is tiered. Every component in this directory takes what it should
 * say as props — the destination of a tile, the status word it prints — so that
 * a tier decision is made by a page that knows the tier, never by a component
 * that has to guess. `@/lib/auth/event-tier` is where those decisions live.
 *
 * Dates are formatted at UTC, exactly as `@/lib/services/event-vocabulary`
 * explains: `scheduled_on` is a bare `date`, so rendering it in the viewer's
 * zone would move a Wednesday practice to Tuesday for anybody east of
 * Greenwich. Which day is *today* is a different question, and it is answered
 * once in `@/lib/club-time` rather than here.
 */

/** "October 2026" — the Gregorian view's heading. */
export function formatMonthLabel(month: string): string {
  const anchor = `${month}-01`;
  return `${formatDatePart(anchor, { month: "long" })} ${formatDatePart(anchor, { year: "numeric" })}`;
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
  const startDay = formatDatePart(startsOn, { day: "numeric" });
  const endDay = formatDatePart(endsOn, { day: "numeric" });
  const startMonth = shortMonthOf(startsOn);
  const endMonth = shortMonthOf(endsOn);
  const startYear = formatDatePart(startsOn, { year: "numeric" });
  const endYear = formatDatePart(endsOn, { year: "numeric" });

  if (startYear !== endYear) {
    return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
  }
  if (startMonth !== endMonth) {
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${endYear}`;
  }
  return `${startDay} – ${endDay} ${startMonth} ${startYear}`;
}

/** "Michaelmas 2026-27" — a term named as the club names it. */
export function formatTermName(term: TermWindow): string {
  return `${labelFor(TERM_LABELS, term.name)} ${term.academicYear}`;
}

/** "Sun 27" — the day number in a term-card or month cell. */
export function formatDayNumber(day: string): string {
  return formatDatePart(day, { day: "numeric" });
}

/** "Wed 14 Oct 2026" — the accessible name a cell gives its date. */
export function formatCellDate(day: string): string {
  const weekday = formatDatePart(day, { weekday: "short" });
  const dayNumber = formatDatePart(day, { day: "numeric" });
  const month = shortMonthOf(day);
  const year = formatDatePart(day, { year: "numeric" });
  return `${weekday} ${dayNumber} ${month} ${year}`;
}

// ---------------------------------------------------------------------------
// Colour, by template
// ---------------------------------------------------------------------------

/**
 * One colour per template, for the calendars — LAN-276 correction round 1.
 *
 * ## Why the template, and not the behavioural class
 *
 * This used to be one colour per `event_type`, which was the club's own
 * seven kinds of event and nothing else. LAN-265 let operators create their
 * own templates, and every one of them takes `practice` as its class — so
 * colouring by class showed every operator-created template Practice's blue,
 * by accident. Brian, walking the review environment, 2026-09-10: "In the
 * template, swatch color should be something that gets chosen, so it gets
 * added as part of the template." Colour is now a fact the template itself
 * carries, chosen from a fixed palette on the editor.
 *
 * ## Why colour at all
 *
 * The club's own term cards colour their cells by what the event *is*, and
 * Brian's review on 14 August 2026 asked for the same: "I really like the type
 * colour coding here… every event is grey versus by type." Scanning a term card
 * is looking for the shape of a week — two practices, a chalk, a game,
 * something social — and colour is what carries that at a glance. Status
 * answers a different question and is carried in words on the tile.
 *
 * ## Colour is never the only carrier
 *
 * Every tile also prints its template's name in words, and a legend above the
 * calendar names each colour in view. That is the issue's accessibility rule
 * applied to the template rather than only to status: a reader who cannot
 * separate the teal from the green loses nothing, because the word is on the
 * tile.
 *
 * ## Not the spreadsheet's palette
 *
 * Deliberately. The issue puts "reproducing the term-card spreadsheet's
 * branding or colors pixel for pixel" out of scope, so these are chosen for
 * separation and for legible dark text on the tint, not sampled from the
 * source. `src/theme.ts` is still a neutral placeholder with no branded
 * palette, so there is nothing there to draw from either.
 *
 * The palette itself — the swatches, their hex values and the check
 * constraint that limits a stored key to one of them — lives in
 * `@/lib/services/event-template-input`, so the editor's picker and the
 * calendar read the same one rather than two copies that could drift.
 */
export type TypeColour = TemplateColourSwatch;

/** The colour for a stored key, falling back to the palette's first entry. */
export function templateColour(colourKey: string): TypeColour {
  return templateColourFor(colourKey);
}

// ---------------------------------------------------------------------------
// Empty and exception states, which must not read alike
// ---------------------------------------------------------------------------

/**
 * `W1`'s exception table, in the club's words.
 *
 * Six situations that all render as "nothing here" if nobody separates them, and
 * they are separated because the recovery differs: nothing this month is not
 * nothing all season, which is not nothing matching a filter, which is not a
 * season nobody has configured terms for. `slice-ux.md` § 9 requires the first
 * three to be distinguishable; the fourth is a configuration fault rather than
 * an empty calendar, so it is a warning and not an information note.
 *
 * None of these explains a rule or a policy. They say what is on the screen and,
 * where there is one, the smallest thing the reader can do about it.
 */
export const MONTH_EMPTY = "No event in this season falls in this month.";

export const NO_TERMS_CONFIGURED =
  "No Oxford term is configured for this year, so there is nothing to lay the year out on. " +
  "The list and Calendar View are unaffected.";

export const UNDATED_HEADLINE = "No date recorded yet";

export const UNDATED_DETAIL =
  "An event with no date cannot be placed on a calendar. It stays here, and in the list, " +
  "until a date is recorded.";

export const OUTSIDE_THE_YEAR_HEADLINE = "Outside this academic year";

export const OUTSIDE_THE_YEAR_DETAIL =
  "These events fall before the year this calendar covers. They are on their real dates in " +
  "the list.";
