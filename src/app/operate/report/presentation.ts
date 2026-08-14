import type { ExceptionKey } from "@/lib/services/weekly-report";

/**
 * The Monday report's copy and formatting — UX-80, UX-81, UX-82 and UX-83.
 *
 * Beside the screens rather than inside them for the reason the other tickets
 * split it the same way: the client components and the tests both import from
 * here, and a `"use server"` module may export only async functions. Nothing in
 * this file touches the database, so importing it never drags `pg` into the
 * browser bundle.
 *
 * The strings are the wireframes' strings. Where UX-80 and UX-81 name the same
 * section differently — the preview numbers its cards and says "Audience
 * defects", the stored report does not number and says "Uninvited audience
 * defects" — both are kept, because the approved wireframes show both and a
 * tidied-up single spelling would be a deviation nobody recorded.
 *
 * Dates are formatted in `en-GB` at UTC and instants in `Europe/London`, the
 * same split the events screens use and for the same reason: `report_on` is a
 * `date` with no zone and means the day it says, while `generated_at` is a real
 * instant and means the moment the club was at.
 */

// ---------------------------------------------------------------------------
// UX-80 — Prepare Monday report
// ---------------------------------------------------------------------------

export const PREVIEW_HEADLINE = "Prepare Monday report";
export const GENERATE_REPORT = "Generate report";
export const CHANGE_REPORTING_DATE = "Change reporting date";
export const PREVIEW_MEANING =
  "Preview is computed from current source data. Generate creates an immutable stored snapshot.";

/**
 * Said on the preview and stored in every snapshot, because a reporting date
 * on its own does not say which seven days it covers, and a reader who guesses
 * wrong misreads every number under it.
 */
export const WINDOW_PREFIX = "Covering";

// ---------------------------------------------------------------------------
// UX-81 — the stored snapshot
// ---------------------------------------------------------------------------

export const REPORT_HEADLINE = "Monday exception and action report";
export const OPEN_FIRST_ACTION = "Open first action";
export const VIEW_REPORT_VERSIONS = "View report versions";
export const OPEN_STORED_LIST = "Open stored list";
export const STORED_ONLY_NOTE =
  "This view reads stored snapshot content only; regeneration creates a new version and " +
  "never rewrites this one.";
export const SNAPSHOT_VERSION_LABEL = "Snapshot version";
export const METRIC_DEFINITIONS_LABEL = "Metric definitions";
export const AVAILABILITY_HEADLINE = "Availability by level";
export const AVAILABILITY_NOTE = "No narrative or diagnosis";

/**
 * What a reader sees when the stored content was written under metric
 * definitions this build does not know — the synthetic seed contains two such
 * snapshots, under `master-table-v1`.
 *
 * The snapshot is still shown, with its metadata, rather than hidden or
 * "upgraded". Invariant M5 exists so that an old report stays readable, and
 * quietly recomputing one under today's definitions would answer a different
 * question from the one the reader asked.
 */
export const OTHER_METRIC_VERSION_NOTE =
  "This snapshot was generated under different metric definitions, so its sections are not " +
  "the ones below. Its stored content and metadata are shown unchanged — a stored report is " +
  "never recomputed.";

// ---------------------------------------------------------------------------
// UX-82 — Report versions
// ---------------------------------------------------------------------------

export const VERSIONS_HEADLINE = "Report versions";
export const OPEN_CURRENT_REPORT = "Open current report";
export const VERSIONS_NOTE =
  "Every snapshot stores version, supersedes, generated_at, data_as_of, generated_by and " +
  "metric_definition_version.";
export const VERSION_CURRENT = "Current";
export const VERSION_SUPERSEDED = "Superseded";

// ---------------------------------------------------------------------------
// UX-83 — no stored report for this date
// ---------------------------------------------------------------------------

export const EMPTY_HEADLINE = "No stored report for this date";
export const EMPTY_DETAIL =
  "Preview current exceptions before generating the first immutable snapshot.";
/**
 * § 9 requires an empty state to distinguish filter-empty, system-empty and
 * no-generated-snapshot. This is the third, and the sentence is the wireframe's
 * because the distinction it draws is the one that matters operationally: a
 * quiet week and an ungenerated report look identical and mean opposite things.
 */
export const EMPTY_IS_NOT_AN_ALL_CLEAR =
  "This is an absence of a generated snapshot, not an all-clear operational conclusion.";
export const PREVIEW_REPORT = "Preview report";
export const CHOOSE_ANOTHER_DATE = "Choose another date";

// ---------------------------------------------------------------------------
// Section titles
// ---------------------------------------------------------------------------

/** UX-80's numbered cards, in the approved lead order. */
export const PREVIEW_SECTION_TITLES: Readonly<Record<ExceptionKey, string>> = Object.freeze({
  nonresponses: "1. Nonresponses",
  not_attending: "2. Not attending",
  mismatches: "3. RSVP / attendance mismatches",
  absences: "4. Absences / missing attendance",
  onboarding: "5. Onboarding exceptions",
  uninvited_audience: "6. Audience defects",
});

/** UX-80's four summary tiles, and the sections they count. */
export const PREVIEW_TILES: ReadonlyArray<{ key: ExceptionKey; label: string }> = Object.freeze([
  Object.freeze({ key: "nonresponses" as ExceptionKey, label: "Nonresponses" }),
  Object.freeze({ key: "not_attending" as ExceptionKey, label: "Not attending" }),
  Object.freeze({ key: "mismatches" as ExceptionKey, label: "RSVP mismatches" }),
  Object.freeze({ key: "absences" as ExceptionKey, label: "Missing attendance" }),
]);

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

/** "Monday, 19 October 2026" — the reporting date, as UX-80 shows it. */
export function formatReportDate(day: string): string {
  const weekday = datePart(day, { weekday: "long" });
  const date = datePart(day, { day: "numeric" });
  const month = datePart(day, { month: "long" });
  const year = datePart(day, { year: "numeric" });
  return `${weekday}, ${date} ${month} ${year}`;
}

/** "19 October 2026" — UX-82's subtitle, which shows no weekday. */
export function formatPlainDate(day: string): string {
  const date = datePart(day, { day: "numeric" });
  const month = datePart(day, { month: "long" });
  const year = datePart(day, { year: "numeric" });
  return `${date} ${month} ${year}`;
}

/** "12 Oct" — inside a stored list, where the year is already established. */
export function formatDayAndMonth(day: string | null): string {
  if (!day) return "";
  return `${datePart(day, { day: "numeric" })} ${datePart(day, { month: "short" })}`;
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

/** "19 Oct 2026, 08:05" — UX-81's generated stamp. */
export function formatInstant(iso: string): string {
  const day = instantPart(iso, { day: "numeric" });
  const month = instantPart(iso, { month: "short" });
  const year = instantPart(iso, { year: "numeric" });
  const time = instantPart(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month} ${year}, ${time}`;
}

/** "08:04" — the data-as-of stamp, which shares the generated stamp's day. */
export function formatClock(iso: string): string {
  return instantPart(iso, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "19 Oct, 08:05" — UX-82's Generated and Data as of columns. */
export function formatTableInstant(iso: string): string {
  const day = instantPart(iso, { day: "numeric" });
  const month = instantPart(iso, { month: "short" });
  return `${day} ${month}, ${formatClock(iso)}`;
}

/** "Generated 19 Oct 2026, 08:05 · Data as of 08:04". */
export function formatSnapshotStamp(generatedAt: string, dataAsOf: string): string {
  return `Generated ${formatInstant(generatedAt)} · Data as of ${formatClock(dataAsOf)}`;
}

/** Today, in the club's zone, as `YYYY-MM-DD`. The reporting date's default. */
export function todayInClubZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return parts;
}
