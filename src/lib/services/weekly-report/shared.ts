import { ConstraintViolated } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";

/**
 * Types, constants and date helpers shared by every sibling of the Monday
 * report (LAN-81, invariant M5). Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */

/**
 * The metric definitions these numbers were computed under, recorded on every
 * row so that an old snapshot stays readable when the definitions change.
 *
 * Bumping it is not bookkeeping: `readReportForDate` reuses today's snapshot,
 * and reuse is conditioned on this string, so a shape change that left it
 * alone would serve the morning's snapshot into an interface that cannot read
 * it. Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */
export const METRIC_DEFINITION_VERSION = "LAN-81.5";

/** The shape of `content`, so a reader can tell a snapshot it understands. */
export const REPORT_CONTENT_SCHEMA = "lancers.monday-report.v5";

/**
 * The report looks a week back (the seven days ending the day before the
 * reporting date) and a week forward (the reporting date and the seven days
 * after it). Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */
const REPORT_WINDOW_DAYS = 7;
const REPORT_LOOKAHEAD_DAYS = 7;

const REPORT_DATE_INVALID_MESSAGE = "Choose a reporting date in the form YYYY-MM-DD.";

export const REPORT_NOT_FOUND_MESSAGE = "That report does not exist.";

/**
 * What one of last week's events did. Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */
export interface EventOutcome {
  id: string;
  name: string;
  eventType: string;
  status: string;
  /**
   * D30, derived: the date has passed and the event was not cancelled. Stored
   * on the snapshot because a snapshot is immutable — recomputing it against
   * today's clock would make last month's report change its mind.
   */
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

/**
 * What one person did about one event: what they said, and what they did.
 * Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */
export interface GridCell {
  eventId: string;
  /** `yes`, `no`, or `null` for never answered. */
  rsvp: string | null;
  /** `present`, `late`, `excused`, `absent`, or `null` for not on the register. */
  attendance: string | null;
  /**
   * The reason given for not attending, where there is one. The most sensitive
   * line in the slice, shown to the operator group only.
   */
  reason: string | null;
  /**
   * `true` where what they said and what they did do not agree, or where they
   * said nothing at all. What puts the person on the list.
   */
  isDiscrepancy: boolean;
}

export interface GridColumn {
  eventId: string;
  /** Short enough for a column head. */
  label: string;
  on: string | null;
}

export interface GridRow {
  person: string;
  /** One per column, in column order. A person invited to none has none. */
  cells: GridCell[];
  /** How many of this person's cells disagree with themselves. */
  problems: number;
}

/**
 * Somebody whose standing availability is not green, and when it became so.
 *
 * A level and two dates. There is no note, because `availability_statuses` has
 * no column that could hold one and none is to be added until the Oxford
 * guidance arrives.
 */
interface AvailabilityEntry {
  person: string;
  level: string;
  since: string | null;
  reviewOn: string | null;
}

/** An event in the week ahead. Read-only here; the link is where you change it. */
export interface UpcomingEvent {
  id: string;
  name: string;
  eventType: string;
  status: string;
  on: string | null;
  isMandatory: boolean;
  /** Invitations that exist. Zero means nothing has gone out yet. */
  invited: number;
  /** Of those, how many have answered either way. */
  answered: number;
}

/** Somebody who turned up without an invitation, and has not been reconciled. */
interface WalkUpEntry {
  person: string;
  event: string;
  on: string | null;
}

/** An open recruitment prospect. Empty in most weeks, and that is fine. */
interface RecruitmentEntry {
  person: string;
  status: string;
  source: string | null;
  firstContactOn: string | null;
}

/** One of the club's onboarding items, as a column head. */
export interface OnboardingColumn {
  code: string;
  label: string;
}

/** Where one member has got to with one item. */
interface OnboardingCell {
  code: string;
  /** `complete`, `waived`, `not_applicable`, `pending`, `invited`. */
  status: string;
  /** Anything that is not done, waived, or not their problem. */
  isOutstanding: boolean;
}

export interface OnboardingRow {
  person: string;
  membershipStatus: string;
  /** One per column, in column order. */
  cells: OnboardingCell[];
  outstanding: number;
  /** Items that actually apply to them — the denominator. */
  applicable: number;
}

interface AttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Occurred events in the look-back week for which not one row was recorded. */
  eventsWithNoRegister: number;
}

/** Counts per level. Canonical level names; no narrative, and no room for one. */
interface AvailabilitySummary {
  green: number;
  orange: number;
  red: number;
}

/**
 * The stored snapshot, in the order the report reads. Decision history: docs/ux/tickets/LAN-81-monday-report.md.
 */
export interface WeeklyReportContent {
  schema: string;
  metricDefinitionVersion: string;
  reportOn: string;
  lookBack: { from: string; to: string };
  lookAhead: { from: string; to: string };
  season: { id: string; label: string };
  /** 1. Last week, event by event. */
  lastWeek: EventOutcome[];
  /** 2. Who needs chasing: people down, last week's events across. */
  grid: { columns: GridColumn[]; rows: GridRow[] };
  /** 3. Availability that is not green. */
  availability: AvailabilityEntry[];
  /** 4. The week ahead. */
  nextWeek: UpcomingEvent[];
  /** 5, 6, 7. Named for what they are, not for what to do about them. */
  walkUps: WalkUpEntry[];
  recruitment: RecruitmentEntry[];
  onboarding: { columns: OnboardingColumn[]; rows: OnboardingRow[] };
  /** 8. The week in numbers. */
  attendance: AttendanceSummary;
  availabilityCounts: AvailabilitySummary;
}

/** A stored row, with its content read back as it was written. */
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
  /**
   * Exactly what was stored. Typed as `unknown` on purpose: a snapshot written
   * under a different `metricDefinitionVersion` is a legitimate row this
   * module must read without pretending it matches the current shape.
   * `parseReportContent` is the only thing that narrows it.
   */
  content: unknown;
  /** `true` when a later version supersedes this one. Derived, never stored. */
  isSuperseded: boolean;
}

/** The display-name expression. Same shape the other services use. */
export const DISPLAY_NAME = personDisplayNameSql("p");

/**
 * A 64-bit key for the advisory lock, stable for a `(season, reporting date)`
 * series and derived from nothing else.
 */
export const SERIES_LOCK = `select pg_advisory_xact_lock(
    hashtextextended($1::text || ':' || $2::text, 0))`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Two kinds of `Date` reach this module and must be read differently — see
 * `relocations.md` for why. `asDate` reads a `date` column from the driver;
 * `utcDay` reads a midnight-UTC instant this module built itself.
 */

/** A `date` column as `YYYY-MM-DD`, whatever the driver handed back. */
export function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** A midnight-UTC instant this module built itself, as `YYYY-MM-DD`. */
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

/**
 * Validates a reporting date and refuses anything else.
 *
 * Refused here rather than handed to PostgreSQL because `date '19 October'`
 * parses, `date 'yesterday'` parses, and a report whose `report_on` is not the
 * date the operator meant is a snapshot filed under the wrong day forever.
 */
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

/** The seven days ending the day before the reporting date. */
export function reportWindow(reportOn: string): { from: string; to: string } {
  const end = new Date(`${reportOn}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end.getTime());
  start.setUTCDate(start.getUTCDate() - (REPORT_WINDOW_DAYS - 1));
  return { from: utcDay(start), to: utcDay(end) };
}

/** The reporting date and the seven days after it. */
export function lookaheadWindow(reportOn: string): { from: string; to: string } {
  const start = new Date(`${reportOn}T00:00:00Z`);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + REPORT_LOOKAHEAD_DAYS);
  return { from: utcDay(start), to: utcDay(end) };
}
