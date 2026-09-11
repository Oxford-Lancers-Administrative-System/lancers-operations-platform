import { ConstraintViolated } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";

/** Types, constants and date helpers shared by every sibling of the Monday report (LAN-81, invariant M5). Decision history: docs/ux/tickets/LAN-81-monday-report.md. */

/** Recorded on every row so an old snapshot stays readable when definitions change; `readReportForDate` conditions reuse on this string. Decision history: docs/ux/tickets/LAN-81-monday-report.md. */
export const METRIC_DEFINITION_VERSION = "LAN-81.5";

export const REPORT_CONTENT_SCHEMA = "lancers.monday-report.v5";

/** A week back (ending the day before the reporting date) and a week forward. Decision history: docs/ux/tickets/LAN-81-monday-report.md. */
const REPORT_WINDOW_DAYS = 7;
const REPORT_LOOKAHEAD_DAYS = 7;

const REPORT_DATE_INVALID_MESSAGE = "Choose a reporting date in the form YYYY-MM-DD.";

export const REPORT_NOT_FOUND_MESSAGE = "That report does not exist.";

/** What one of last week's events did. Decision history: docs/ux/tickets/LAN-81-monday-report.md. */
export interface EventOutcome {
  id: string;
  name: string;
  eventType: string;
  status: string;
  /** D30, derived: date has passed and not cancelled. Stored, not recomputed — a snapshot is immutable. */
  occurred: boolean;
  on: string | null;
  isMandatory: boolean;
  invited: number;
  respondedYes: number;
  respondedNo: number;
  noAnswer: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Present plus late, over invited. `null` when nobody took the register. */
  turnoutPercent: number | null;
  /** `false` when the event occurred and not one attendance row was written. */
  registerTaken: boolean;
  /** Attended with no invitation — invariant P6's walk-up. */
  walkUps: number;
  /** Confirmed in the audience and never invited: an approval defect. */
  neverInvited: number;
}

/** What one person did about one event: what they said, and what they did. Decision history: docs/ux/tickets/LAN-81-monday-report.md. */
export interface GridCell {
  eventId: string;
  rsvp: string | null;
  attendance: string | null;
  /** The most sensitive line in the slice, shown to the operator group only. */
  reason: string | null;
  /** Disagreement or silence — what puts the person on the list. */
  isDiscrepancy: boolean;
}

export interface GridColumn {
  eventId: string;
  label: string;
  on: string | null;
}

export interface GridRow {
  person: string;
  cells: GridCell[];
  problems: number;
}

/** Somebody whose standing availability is not green, and when it became so. No note field — `availability_statuses` has none. */
interface AvailabilityEntry {
  person: string;
  level: string;
  since: string | null;
  reviewOn: string | null;
}

export interface UpcomingEvent {
  id: string;
  name: string;
  eventType: string;
  status: string;
  on: string | null;
  isMandatory: boolean;
  invited: number;
  answered: number;
}

interface WalkUpEntry {
  person: string;
  event: string;
  on: string | null;
}

interface RecruitmentEntry {
  person: string;
  status: string;
  source: string | null;
  firstContactOn: string | null;
}

export interface OnboardingColumn {
  code: string;
  label: string;
}

interface OnboardingCell {
  code: string;
  status: string;
  isOutstanding: boolean;
}

export interface OnboardingRow {
  person: string;
  membershipStatus: string;
  cells: OnboardingCell[];
  outstanding: number;
  applicable: number;
}

interface AttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  eventsWithNoRegister: number;
}

interface AvailabilitySummary {
  green: number;
  orange: number;
  red: number;
}

/** The stored snapshot, in the order the report reads. Decision history: docs/ux/tickets/LAN-81-monday-report.md. */
export interface WeeklyReportContent {
  schema: string;
  metricDefinitionVersion: string;
  reportOn: string;
  lookBack: { from: string; to: string };
  lookAhead: { from: string; to: string };
  season: { id: string; label: string };
  lastWeek: EventOutcome[];
  grid: { columns: GridColumn[]; rows: GridRow[] };
  availability: AvailabilityEntry[];
  nextWeek: UpcomingEvent[];
  walkUps: WalkUpEntry[];
  recruitment: RecruitmentEntry[];
  onboarding: { columns: OnboardingColumn[]; rows: OnboardingRow[] };
  attendance: AttendanceSummary;
  availabilityCounts: AvailabilitySummary;
}

export interface StoredReport {
  id: string;
  seasonId: string;
  reportOn: string;
  version: number;
  supersedesId: string | null;
  metricDefinitionVersion: string;
  dataAsOf: string;
  generatedAt: string;
  generatedByName: string | null;
  /** `unknown` on purpose: a row written under a different `metricDefinitionVersion` is legitimate. `parseReportContent` narrows it. */
  content: unknown;
  isSuperseded: boolean;
}

export const DISPLAY_NAME = personDisplayNameSql("p");

/** A 64-bit key for the advisory lock, stable for a `(season, reporting date)` series. */
export const SERIES_LOCK = `select pg_advisory_xact_lock(
    hashtextextended($1::text || ':' || $2::text, 0))`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Two kinds of Date reach this module: asDate reads a date column from the driver; utcDay reads a midnight-UTC instant this module built.

export function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function utcDay(value: Date): string {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function asIso(value: Date | string | null): string | null {
  if (value === null) return null;
  return typeof value === "string" ? value : value.toISOString();
}

/** Validates a reporting date; refused here rather than handed to PostgreSQL, which parses `'19 October'`/`'yesterday'`. */
export function normaliseReportDate(value: string): string {
  const trimmed = value.trim();
  if (!DATE_PATTERN.test(trimmed)) {
    throw new ConstraintViolated(REPORT_DATE_INVALID_MESSAGE, { rule: "report_on_format" });
  }
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || utcDay(parsed) !== trimmed) {
    throw new ConstraintViolated(REPORT_DATE_INVALID_MESSAGE, { rule: "report_on_format" });
  }
  return trimmed;
}

export function reportWindow(reportOn: string): { from: string; to: string } {
  const end = new Date(`${reportOn}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (REPORT_WINDOW_DAYS - 1));
  return { from: utcDay(start), to: utcDay(end) };
}

export function lookaheadWindow(reportOn: string): { from: string; to: string } {
  const start = new Date(`${reportOn}T00:00:00Z`);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + REPORT_LOOKAHEAD_DAYS);
  return { from: utcDay(start), to: utcDay(end) };
}
