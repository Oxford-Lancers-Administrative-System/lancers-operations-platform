// The Monday report's copy and formatting — Brian, 15 August 2026. Decision history: docs/ux/tickets/LAN-81-monday-report.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.

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

/** § 9's nothing-to-report empty state, distinct from filter-empty and system-empty. Decision history: docs/ux/tickets/LAN-81-monday-report.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export const NOTHING_AT_ALL =
  "No events last week and nothing outstanding. If that is a surprise, check that last " +
  "week's events were approved — an empty report can mean a quiet week or a week nobody " +
  "recorded.";

export const CHANGE_DATE_LABEL = "Reporting date";
export const CHANGE_DATE_SUBMIT = "Show report";

export const STORED_NOTE =
  "This is the report as it stood when it was first opened today. It is kept exactly as it was.";

/** Shown, not hidden or "upgraded" — invariant M5: an old report stays readable, never quietly recomputed. */
export const OTHER_METRIC_VERSION_NOTE =
  "This report was generated under earlier metric definitions, so it is not organised the way " +
  "the current one is. It is shown unchanged — a filed report is never recomputed.";

export const RSVP_COLUMN = "RSVP";
export const ATTENDED_COLUMN = "Attended";

export const RSVP_LABELS: Readonly<Record<string, string>> = Object.freeze({
  yes: "Yes",
  no: "No",
});

export const ATTENDANCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  present: "Present",
  late: "Late",
  excused: "Excused",
  absent: "Absent",
});

export const NOT_RECORDED = "—";

/** Denominator is the person's own week, not the club's — Brian, 15 August 2026. Decision history: docs/ux/tickets/LAN-81-monday-report.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export const ISSUES_COLUMN = "Issues";
export const OUTSTANDING_COLUMN = "Outstanding";

export function formatIssues(problems: number, asked: number): string {
  return `${problems} of ${asked}`;
}

export const ONBOARDING_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  complete: "Done",
  waived: "Waived",
  not_applicable: "N/A",
  pending: "Pending",
  invited: "Invited",
});

const GRID_SORTS = Object.freeze(["issues", "person"] as const);

export type GridSort = (typeof GRID_SORTS)[number];

export function isGridSort(value: string): value is GridSort {
  return (GRID_SORTS as readonly string[]).includes(value);
}

/** The frozen model keeps green/orange/red; only the label is the wireframe's — UX-81. */
export const AVAILABILITY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  green: "Active",
  orange: "Limited",
  red: "Unavailable",
});

// Re-exported, not copied — the two files had already drifted once. Decision history: docs/ux/tickets/LAN-81-monday-report.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
export { STATUS_LABELS as EVENT_STATUS_LABELS } from "../events/presentation";

export { labelFor } from "../labels";

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

export function todayInClubZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
