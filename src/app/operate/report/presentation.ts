import type { ChaseKind, FixKind } from "@/lib/services/weekly-report";

/**
 * The Monday report's copy and formatting.
 *
 * Beside the screen rather than inside it: the client components and the tests
 * both import from here, and a `"use server"` module may export only async
 * functions. Nothing in this file touches the database, so importing it never
 * drags `pg` into the browser bundle.
 *
 * The wording is Brian's, from the 15 August 2026 review — "chase these people"
 * and "fix these things" are what he asked for, in that order, and the earlier
 * six-category vocabulary is gone with the screen that used it.
 *
 * Dates are formatted in `en-GB` at UTC and instants in `Europe/London`, the
 * same split the events screens use and for the same reason: `report_on` is a
 * `date` with no zone and means the day it says, while `generated_at` is a real
 * instant and means the moment the club was at.
 */

export const REPORT_HEADLINE = "Monday report";

/** The two lists, and the third block. */
export const CHASE_HEADLINE = "Chase these people";
export const FIX_HEADLINE = "Fix these things";
export const ONBOARDING_HEADLINE = "Onboarding still outstanding";

export const CHASE_EMPTY = "Nobody to chase this week.";
export const FIX_EMPTY = "Nothing to fix this week.";
export const ONBOARDING_EMPTY = "Every active member is up to date.";

/**
 * § 9 requires an empty state to distinguish filter-empty, system-empty and
 * nothing-to-report. This is the third, and the distinction it draws is the one
 * that costs the club something if it is blurred: a quiet week and a week
 * nobody ran look identical on a screen and mean opposite things.
 */
export const NOTHING_AT_ALL =
  "Nothing to chase and nothing to fix. If that is a surprise, check that last week's events " +
  "were approved and marked occurred — an empty report can mean a quiet week or a week nobody " +
  "recorded.";

export const CHANGE_DATE_LABEL = "Reporting date";
export const CHANGE_DATE_SUBMIT = "Show report";

export const WINDOW_PREFIX = "Covering";

/** Said once, at the bottom, where it explains rather than interrupts. */
export const STORED_NOTE =
  "This is the report as it stood when it was first opened today. It is kept exactly as it was.";

export const WEEK_IN_NUMBERS = "The week in numbers";
export const AVAILABILITY_HEADLINE = "Availability";
export const AVAILABILITY_NOTE = "Level only — no narrative or diagnosis is recorded anywhere.";

/**
 * What a reader sees when the stored content was written under metric
 * definitions this build does not know — the seed contains two, and this branch
 * filed several under `LAN-81.1` before the review changed the report's shape.
 *
 * The snapshot is still shown, with its metadata, rather than hidden or
 * "upgraded". Invariant M5 exists so that an old report stays readable, and
 * quietly recomputing one under today's definitions would answer a different
 * question from the one the reader asked.
 */
export const OTHER_METRIC_VERSION_NOTE =
  "This report was generated under earlier metric definitions, so it is not organised the way " +
  "the current one is. It is shown unchanged — a filed report is never recomputed.";

/** What each chase is, in the club's words, for the badge beside the name. */
export const CHASE_LABELS: Readonly<Record<ChaseKind, string>> = Object.freeze({
  no_answer: "Never answered",
  said_no: "Not attending",
  said_yes_absent: "Said yes, absent",
  said_no_attended: "Said no, turned up",
  missing_from_register: "Not on the register",
});

export const FIX_LABELS: Readonly<Record<FixKind, string>> = Object.freeze({
  register_not_taken: "Register",
  approved_never_invited: "Approval defect",
  walk_up_unreconciled: "Walk-up",
});

/**
 * Availability levels, in the words the approved wireframe shows.
 *
 * The stored snapshot keeps the frozen model's own level names — `green`,
 * `orange`, `red` — and only the label is the wireframe's. Renaming a state in
 * the data would be a change to the approved domain model; naming it for a
 * reader is presentation, and UX-81 is the authority for that.
 */
export const AVAILABILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  green: "Active",
  orange: "Limited",
  red: "Unavailable",
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function datePart(day: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** "Monday, 19 October 2026" — the reporting date under the headline. */
export function formatReportDate(day: string): string {
  const weekday = datePart(day, { weekday: "long" });
  const date = datePart(day, { day: "numeric" });
  const month = datePart(day, { month: "long" });
  const year = datePart(day, { year: "numeric" });
  return `${weekday}, ${date} ${month} ${year}`;
}

/** "Wed 14 Oct" — beside a person, where the year is already established. */
export function formatShortDay(day: string | null): string {
  if (!day) return "No date";
  return `${datePart(day, { weekday: "short" })} ${datePart(day, { day: "numeric" })} ${datePart(
    day,
    { month: "short" },
  )}`;
}

/** "Covering Monday 12 – Sunday 18 October 2026". */
export function formatWindow(window: { from: string; to: string }): string {
  const from = `${datePart(window.from, { weekday: "long" })} ${datePart(window.from, { day: "numeric" })}`;
  const to = `${datePart(window.to, { weekday: "long" })} ${datePart(window.to, { day: "numeric" })}`;
  const month = datePart(window.to, { month: "long" });
  const year = datePart(window.to, { year: "numeric" });
  const fromMonth = datePart(window.from, { month: "long" });
  const left = fromMonth === month ? from : `${from} ${fromMonth}`;
  return `${WINDOW_PREFIX} ${left} – ${to} ${month} ${year}`;
}

function instantPart(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(
    new Date(iso),
  );
}

/** "19 Oct 2026, 08:05". */
export function formatInstant(iso: string): string {
  const day = instantPart(iso, { day: "numeric" });
  const month = instantPart(iso, { month: "short" });
  const year = instantPart(iso, { year: "numeric" });
  const time = instantPart(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month} ${year}, ${time}`;
}

/** Today, in the club's zone, as `YYYY-MM-DD`. The reporting date's default. */
export function todayInClubZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
