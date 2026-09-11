import {
  formatDatePart,
  labelFor,
  shortMonthOf,
  TERM_LABELS,
} from "@/lib/services/event-vocabulary";
import type { TermWindow } from "@/lib/services/event-input";
import { templateColourFor, type TemplateColourSwatch } from "@/lib/services/event-template-input";

/**
 * How the calendars read on screen — both arrangements, both tiers. LAN-114,
 * moved and widened by LAN-153. Presentation only, pure. Lives in `/calendar`
 * (not `/operate`) because both tiers share one query and must share this
 * code, or they will disagree about which Sunday a week starts on;
 * `/operate/events/calendar` imports it. Nothing here is tiered — every
 * component takes what it should say as props. Dates are formatted at UTC:
 * `scheduled_on` is a bare `date` with no zone to convert.
 */

export function formatMonthLabel(month: string): string {
  const anchor = `${month}-01`;
  return `${formatDatePart(anchor, { month: "long" })} ${formatDatePart(anchor, { year: "numeric" })}`;
}

/** Month/year repeat whenever the week crosses one, so no row needs another to be read. */
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

export function formatTermName(term: TermWindow): string {
  return `${labelFor(TERM_LABELS, term.name)} ${term.academicYear}`;
}

export function formatDayNumber(day: string): string {
  return formatDatePart(day, { day: "numeric" });
}

/** The accessible name a cell gives its date. */
export function formatCellDate(day: string): string {
  const weekday = formatDatePart(day, { weekday: "short" });
  const dayNumber = formatDatePart(day, { day: "numeric" });
  const month = shortMonthOf(day);
  const year = formatDatePart(day, { year: "numeric" });
  return `${weekday} ${dayNumber} ${month} ${year}`;
}

// Colour, by template

/**
 * One colour per template, for the calendars — LAN-276 correction round 1.
 * Colour by template, not behavioural class: every operator-created template
 * (LAN-265) takes `practice` as its class, so colouring by class showed all
 * of them Practice's blue. Never the only carrier — the template's name is
 * also printed in words, and a legend names each colour in view. The palette
 * itself lives in `@/lib/services/event-template-input`, so the editor and
 * calendar share it.
 */
export type TypeColour = TemplateColourSwatch;

/** The colour for a stored key, falling back to the palette's first entry. */
export function templateColour(colourKey: string): TypeColour {
  return templateColourFor(colourKey);
}

// Empty and exception states, which must not read alike

/** `W1`'s exception table, in the club's words — six situations kept distinguishable per `slice-ux.md` § 9 because the recovery differs. */
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
