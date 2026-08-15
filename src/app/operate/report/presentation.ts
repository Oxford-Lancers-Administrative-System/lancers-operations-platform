/**
 * The Monday report's copy and formatting.
 *
 * Beside the screen rather than inside it: the client components and the tests
 * both import from here, and a `"use server"` module may export only async
 * functions. Nothing in this file touches the database, so importing it never
 * drags `pg` into the browser bundle.
 *
 * Every heading names a thing the club already has a word for — an event, a
 * walk-up, recruitment, onboarding, availability. Brian's instruction of
 * 15 August 2026, after an abstract "Fix these things" bucket: "I'm organizing
 * around things that they would know how to use."
 *
 * Dates are formatted in `en-GB` at UTC and instants in `Europe/London`, the
 * same split the events screens use and for the same reason: `scheduled_on` is
 * a `date` with no zone and means the day it says, while `generated_at` is a
 * real instant and means the moment the club was at.
 */

export const REPORT_HEADLINE = "Monday report";

export const LAST_WEEK_HEADLINE = "Last week's events";
export const GRID_HEADLINE = "Attendance";
export const AVAILABILITY_HEADLINE = "Availability";
export const NEXT_WEEK_HEADLINE = "Next week";
export const WALK_UPS_HEADLINE = "Walk-ups";
export const RECRUITMENT_HEADLINE = "Recruitment";
export const ONBOARDING_HEADLINE = "Onboarding still outstanding";
export const WEEK_IN_NUMBERS = "The week in numbers";

export const LAST_WEEK_EMPTY = "No events last week.";
export const GRID_EMPTY = "Everybody answered and everybody turned up.";
export const AVAILABILITY_EMPTY = "Everybody is available.";
export const NEXT_WEEK_EMPTY = "Nothing scheduled in the next seven days.";
export const WALK_UPS_EMPTY = "No walk-ups last week.";
export const RECRUITMENT_EMPTY = "No open prospects.";
export const ONBOARDING_EMPTY = "Every active member is up to date.";

/**
 * § 9 requires an empty state to distinguish filter-empty, system-empty and
 * nothing-to-report. This is the third, and the distinction it draws is the one
 * that costs the club something if it is blurred: a quiet week and a week
 * nobody ran look identical on a screen and mean opposite things.
 */
export const NOTHING_AT_ALL =
  "No events last week and nothing outstanding. If that is a surprise, check that last " +
  "week's events were approved and marked occurred — an empty report can mean a quiet week " +
  "or a week nobody recorded.";

export const CHANGE_DATE_LABEL = "Reporting date";
export const CHANGE_DATE_SUBMIT = "Show report";

/** Said once, at the bottom, where it explains rather than interrupts. */
export const STORED_NOTE =
  "This is the report as it stood when it was first opened today. It is kept exactly as it was.";

/**
 * What a reader sees when the stored content was written under metric
 * definitions this build does not know.
 *
 * The snapshot is still shown, with its metadata, rather than hidden or
 * "upgraded". Invariant M5 exists so that an old report stays readable, and
 * quietly recomputing one under today's definitions would answer a different
 * question from the one the reader asked.
 */
export const OTHER_METRIC_VERSION_NOTE =
  "This report was generated under earlier metric definitions, so it is not organised the way " +
  "the current one is. It is shown unchanged — a filed report is never recomputed.";

/** The two sub-columns under every event. */
export const RSVP_COLUMN = "RSVP";
export const ATTENDED_COLUMN = "Attended";

/** What was said. `null` — never answered — is the dash. */
export const RSVP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

/** What was done. `null` — not on the register — is the dash. */
export const ATTENDANCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

export const NOT_RECORDED = "—";

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

/** `event_status`, in the club's words. Matches the events screens. */
export const EVENT_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  draft: "Draft",
  pending_approval: "Awaiting approval",
  approved: "Approved",
  occurred: "Occurred",
  not_held: "Not held",
  cancelled: "Cancelled",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
});

export function labelFor(labels: Readonly<Record<string, string>>, key: string): string {
  return labels[key] ?? key;
}

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

/** "Wed 14 Oct" — beside an event, where the year is already established. */
export function formatShortDay(day: string | null): string {
  if (!day) return "No date";
  return `${datePart(day, { weekday: "short" })} ${datePart(day, { day: "numeric" })} ${datePart(
    day,
    { month: "short" },
  )}`;
}

/** "12 – 18 October" — a window, said as briefly as it can be. */
export function formatSpan(window: { from: string; to: string }): string {
  const fromDay = datePart(window.from, { day: "numeric" });
  const fromMonth = datePart(window.from, { month: "long" });
  const toDay = datePart(window.to, { day: "numeric" });
  const toMonth = datePart(window.to, { month: "long" });
  return fromMonth === toMonth
    ? `${fromDay} – ${toDay} ${toMonth}`
    : `${fromDay} ${fromMonth} – ${toDay} ${toMonth}`;
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
