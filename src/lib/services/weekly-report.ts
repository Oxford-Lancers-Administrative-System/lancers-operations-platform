import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { readCurrentSeasonIn, type Season } from "./seasons";

/**
 * The Monday report — locked Requirement 9, invariant M5. LAN-81.
 *
 * ## What it is, after Brian's 15 August review
 *
 * **A to-do list, not a dashboard.** The first build presented six counted
 * exception categories and asked the operator to open each one; Brian's verdict
 * on it was that it is "just lists of information, and it's not particularly
 * well organized". So the report is now two lists in the club's own words —
 * *chase these people*, *fix these things* — with the onboarding backlog as a
 * short third block, and nothing else competing with them.
 *
 * The six categories still exist: they are what the two lists are built from,
 * and every one of them is still stored in the snapshot. What changed is that
 * a category is no longer a thing the reader has to navigate.
 *
 * ## Versioning is real, and invisible
 *
 * Invariant M5 makes a published report immutable: `weekly_reports` is
 * insert-only, has no `status` column, and derives "superseded" from a later
 * row pointing at it. That is unchanged and unchangeable — but Brian's second
 * verdict was that he should "just have a report for the day of, and that's
 * it", and he was right that the version machinery had no business on screen.
 *
 * So the interface never mentions a version, and `readReportForDate` files one
 * whenever **Show Report** is pressed — and only then, aside from the cases
 * where nothing readable is on file. Arriving, sorting and refreshing show what
 * is already stored. Nobody is asked about versions, and "what did leadership
 * see on the 12th?" is answered by the snapshot they were looking at.
 *
 * The screen therefore still renders **stored content and never a live
 * recompute** — the property the whole table exists for, and the one thing that
 * would have been quietly lost by making the page "just show the numbers".
 *
 * ## Almost none of the query work is here
 *
 * The five views the issue names carry it: `invitation_response_state`
 * (invariant P7's partition, already excluding non-soliciting events per E6),
 * `nonresponse_queue`, `uninvited_audience_members`, `rsvp_attendance_mismatches`
 * and `current_availability`. This module composes them; it re-derives none of
 * them. A second definition of "nonresponse" written here would drift from the
 * one the attendance board reads, and the two would disagree in public.
 *
 * ## Privacy
 *
 * The snapshot contains the reasons people gave for **Not attending**, because
 * the approved MVP boundary leads the report with them. It contains no
 * availability narrative, no diagnosis and no free-text health field — the
 * schema has no column capable of holding one, `tests/schema-security.test.ts`
 * scans for one, and availability appears here as a count per level and nothing
 * else. Nothing in this module exports, emails or distributes a report; the only
 * reader is an operator holding `leadership_report`.
 */

// ---------------------------------------------------------------------------
// The constants that identify a snapshot
// ---------------------------------------------------------------------------

/**
 * The metric definitions these numbers were computed under, recorded on every
 * row so that an old snapshot stays readable when the definitions change.
 *
 * It has moved four times in a day, and each move earned it. `.1` was six
 * counted exception categories; `.2` was two action lists; `.3` reorganised
 * around events with a week either side; `.4` splits every event in the
 * attendance grid into what somebody said and what they then did; `.5` turns
 * onboarding into the same kind of grid.
 *
 * Bumping it is not bookkeeping. `readReportForDate` reuses today's snapshot,
 * and reuse is conditioned on this string — so a shape change that left it
 * alone would serve the morning's snapshot into an interface that cannot read
 * it, and the reader would get a page of blanks. That happened once, on `.3`,
 * and is why the condition exists at all.
 *
 * It is **not** the sixteen definitions recovered from the Master Table; the
 * issue puts those out of scope.
 */
export const METRIC_DEFINITION_VERSION = "LAN-81.5";

/** The shape of `content`, so a reader can tell a snapshot it understands. */
export const REPORT_CONTENT_SCHEMA = "lancers.monday-report.v5";

/**
 * The report looks a week back and a week forward.
 *
 * **Back** is the seven days ending the day before the reporting date: the week
 * just gone, which is what the attendance and the chasing are about.
 *
 * **Forward** is the reporting date and the seven days after it: what is coming,
 * so an operator can see which of next week's events are still drafts and which
 * have already gone out.
 *
 * The forward half is a bounded amendment to LAN-81, made by Brian on 15 August
 * 2026 after seeing the backward-only report — "we don't have to do the 3
 * weeks, but can we do 1 week". It is deliberately **one** week and read-only:
 * the three-week planning horizon, and anything that edits from here, remain
 * LAN-109's. Both halves are printed on the report and stored in the snapshot,
 * so no reader has to infer them and a later change is visible in old reports
 * rather than retroactive.
 */
export const REPORT_WINDOW_DAYS = 7;
export const REPORT_LOOKAHEAD_DAYS = 7;

export const REPORT_DATE_INVALID_MESSAGE = "Choose a reporting date in the form YYYY-MM-DD.";

export const REPORT_NOT_FOUND_MESSAGE = "That report does not exist.";

// ---------------------------------------------------------------------------
// The stored content
// ---------------------------------------------------------------------------

/**
 * What one of last week's events did.
 *
 * The report opens with these because Brian opens the report with these: "I
 * want to see the last week in attendance. I want to see the event. I want to
 * see the RSVP numbers. I want to see the attendance percentage." Everything
 * that used to live under a heading called "Fix these things" is a property of
 * an event, so it is a property of this row.
 */
export interface EventOutcome {
  id: string;
  name: string;
  eventType: string;
  status: string;
  on: string | null;
  isMandatory: boolean;
  solicitsResponse: boolean;
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
 *
 * Two values per event rather than one verdict, because Brian's whole reason
 * for the section is the gap between them — "did they RSVP, or did they not
 * RSVP? Did they attend, or did they not attend? We're looking for
 * discrepancies there." A single collapsed state hides exactly the comparison
 * he is making.
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
export interface AvailabilityEntry {
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
  solicitsResponse: boolean;
  /** Invitations that exist. Zero means nothing has gone out yet. */
  invited: number;
  /** Of those, how many have answered either way. */
  answered: number;
}

/** Somebody who turned up without an invitation, and has not been reconciled. */
export interface WalkUpEntry {
  person: string;
  event: string;
  on: string | null;
}

/** An open recruitment prospect. Empty in most weeks, and that is fine. */
export interface RecruitmentEntry {
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
export interface OnboardingCell {
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

export interface AttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Occurred events in the look-back week for which not one row was recorded. */
  eventsWithNoRegister: number;
}

/** Counts per level. Canonical level names; no narrative, and no room for one. */
export interface AvailabilitySummary {
  green: number;
  orange: number;
  red: number;
}

/**
 * The stored snapshot, in the order the report reads.
 *
 * Every section is named for a thing the club already has a word for — an
 * event, a walk-up, recruitment, onboarding. Brian's instruction on 15 August
 * 2026, after an abstract "Fix these things" bucket: "I'm organizing around
 * things that they would know how to use."
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
   * under a different `metricDefinitionVersion` — the seed contains two, and so
   * does every report this branch filed before the 15 August review — is a
   * legitimate row this module must read without pretending it matches the
   * current shape. `parseReportContent` is the only thing that narrows it.
   */
  content: unknown;
  /** `true` when a later version supersedes this one. Derived, never stored. */
  isSuperseded: boolean;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A `date` column as `YYYY-MM-DD`, whatever the driver handed back. */
function asDate(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function asIso(value: Date | string | null): string | null {
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
  if (Number.isNaN(parsed.getTime()) || asDate(parsed) !== trimmed) {
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
  return { from: asDate(start) as string, to: asDate(end) as string };
}

/** The reporting date and the seven days after it. */
export function lookaheadWindow(reportOn: string): { from: string; to: string } {
  const start = new Date(`${reportOn}T00:00:00Z`);
  const end = new Date(start.getTime());
  end.setUTCDate(end.getUTCDate() + REPORT_LOOKAHEAD_DAYS);
  return { from: asDate(start) as string, to: asDate(end) as string };
}

// ---------------------------------------------------------------------------
// Computing the content
// ---------------------------------------------------------------------------

/** The display-name expression. Same shape the other services use. */
const DISPLAY_NAME = `case
    when p.id is null then null
    when p.family_name is null
      then coalesce(nullif(btrim(p.known_as), ''), p.given_name)
    else coalesce(nullif(btrim(p.known_as), ''), p.given_name) || ' ' || p.family_name
  end`;

interface EventRow {
  id: string;
  name: string;
  event_type: string;
  status: string;
  scheduled_on: Date | string | null;
  solicits_response: boolean;
  is_mandatory: boolean;
  invited: number;
  recorded: number;
}

interface PersonEventRow {
  event_id: string;
  display_name: string | null;
  reason: string | null;
}

interface SaidAndDidRow {
  event_id: string;
  display_name: string | null;
  rsvp: string | null;
  attendance: string | null;
  reason: string | null;
}

interface OnboardingItemRow {
  code: string;
  label: string;
  sort_order: number;
  status: string;
  display_name: string | null;
  membership_status: string;
}

interface AvailabilityRow {
  display_name: string | null;
  level: string;
  effective_from: Date | string | null;
  review_on: Date | string | null;
}

interface RecruitmentRow {
  display_name: string | null;
  status: string;
  source: string | null;
  first_contact_on: Date | string | null;
}

interface UpcomingRow {
  id: string;
  name: string;
  event_type: string;
  status: string;
  scheduled_on: Date | string | null;
  solicits_response: boolean;
  is_mandatory: boolean;
  invited: number;
  answered: number;
}

interface BreakdownRow {
  event_id: string;
  response_state: string;
  tally: number;
}

interface PresenceRow {
  event_id: string;
  presence: string;
  tally: number;
}

interface CountRow {
  key: string;
  tally: number;
}

/** "Practice — hilary week 1" is too long for a column head; this is not. */
function columnLabel(name: string): string {
  const head = name.split(/\s+[—-]\s+/)[0].trim();
  return head.length > 18 ? `${head.slice(0, 17)}…` : head;
}

/**
 * Everything the report says, computed from the five views for one season, the
 * week just gone and the week ahead.
 *
 * Read-only by construction: there is no insert, update or delete in it.
 */
export async function computeReportContent(
  tx: Tx,
  season: Season,
  reportOn: string,
): Promise<WeeklyReportContent> {
  const lookBack = reportWindow(reportOn);
  const lookAhead = lookaheadWindow(reportOn);
  const back = [season.id, lookBack.from, lookBack.to];

  // -------------------------------------------------------------------------
  // 1. Last week, event by event
  // -------------------------------------------------------------------------

  const events = await tx.query<EventRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.solicits_response, e.is_mandatory,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.attendance_records a where a.event_id = e.id) as recorded
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      order by e.scheduled_on, e.name`,
    back,
  );

  const breakdown = await tx.query<BreakdownRow>(
    `select s.event_id, s.response_state, count(*)::int as tally
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
      where s.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      group by s.event_id, s.response_state`,
    back,
  );

  // Requirement 6's escalation queue. The "silent" column on each event's row
  // comes from here rather than from the P7 partition, because this view *is*
  // the club's definition of somebody who was asked and has not answered, and a
  // second definition written here would drift from the one the rest of the
  // slice reads.
  const silent = await tx.query<{ event_id: string; tally: number }>(
    `select q.event_id, count(*)::int as tally
       from public.nonresponse_queue q
      where q.season_id = $1
        and q.scheduled_on between $2::date and $3::date
      group by q.event_id`,
    back,
  );

  const presence = await tx.query<PresenceRow>(
    `select a.event_id, a.presence::text as presence, count(*)::int as tally
       from public.attendance_records a
       join public.events e on e.id = a.event_id
      where a.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      group by a.event_id, a.presence`,
    back,
  );

  // The two event-level exceptions. Both are properties of an event, which is
  // why they are columns on its row rather than a list of their own.
  const walkUpRows = await tx.query<PersonEventRow>(
    `select x.event_id, ${DISPLAY_NAME} as display_name, null::text as reason
       from public.rsvp_attendance_mismatches x
       left join public.season_memberships m on m.id = x.season_membership_id
       left join public.people p on p.id = coalesce(x.person_id, m.person_id)
      where x.season_id = $1
        and x.scheduled_on between $2::date and $3::date
        and x.mismatch = 'attended_without_invitation'`,
    back,
  );

  const neverInvited = await tx.query<PersonEventRow>(
    `select u.event_id, ${DISPLAY_NAME} as display_name, null::text as reason
       from public.uninvited_audience_members u
       left join public.season_memberships m on m.id = u.season_membership_id
       left join public.people p on p.id = coalesce(u.person_id, m.person_id)
      where u.season_id = $1
        and u.scheduled_on between $2::date and $3::date`,
    back,
  );

  const tally = (rows: { event_id: string }[], eventId: string) =>
    rows.filter((row) => row.event_id === eventId).length;

  const stateOf = (eventId: string, state: string) =>
    breakdown.rows.find((row) => row.event_id === eventId && row.response_state === state)?.tally ??
    0;

  const presenceOf = (eventId: string, value: string) =>
    presence.rows.find((row) => row.event_id === eventId && row.presence === value)?.tally ?? 0;

  const lastWeek: EventOutcome[] = events.rows.map((row) => {
    const present = presenceOf(row.id, "present");
    const late = presenceOf(row.id, "late");
    const registerTaken = row.recorded > 0;
    return {
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      status: row.status,
      on: asDate(row.scheduled_on),
      isMandatory: row.is_mandatory,
      solicitsResponse: row.solicits_response,
      invited: row.invited,
      respondedYes: stateOf(row.id, "responded_yes"),
      respondedNo: stateOf(row.id, "responded_no"),
      noAnswer: silent.rows.find((entry) => entry.event_id === row.id)?.tally ?? 0,
      present,
      late,
      excused: presenceOf(row.id, "excused"),
      absent: presenceOf(row.id, "absent"),
      // Turnout over invited, because that is the question an operator asks:
      // of the people we asked, how many came. `null` where nobody took the
      // register, so an untaken register never reads as nobody turning up.
      turnoutPercent:
        registerTaken && row.invited > 0
          ? Math.round(((present + late) / row.invited) * 100)
          : null,
      registerTaken,
      walkUps: tally(walkUpRows.rows, row.id),
      neverInvited: tally(neverInvited.rows, row.id),
    };
  });

  // -------------------------------------------------------------------------
  // 2. The grid: people down, last week's events across
  // -------------------------------------------------------------------------

  // One row per person per event they were asked about: what they said, and
  // what they did. Two values rather than one verdict, because the gap between
  // them is the entire subject of this section.
  //
  // The pairing is `coalesce(season_membership_id, person_id)` on both sides —
  // invariant P8 guarantees exactly one of those is set, and it is the same
  // anchor the attendance board and the corrected mismatch view both use.
  const said = await tx.query<SaidAndDidRow>(
    `select i.event_id,
            ${DISPLAY_NAME} as display_name,
            r.response::text as rsvp,
            a.presence::text as attendance,
            r.reason
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       left join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join public.current_rsvp r on r.invitation_id = i.id
       left join public.attendance_records a
         on a.event_id = i.event_id
        and coalesce(a.season_membership_id, a.person_id)
              = coalesce(i.season_membership_id, i.person_id)
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and e.solicits_response`,
    back,
  );

  const columns: GridColumn[] = events.rows
    .filter((row) => row.solicits_response)
    .map((row) => ({
      eventId: row.id,
      label: columnLabel(row.name),
      on: asDate(row.scheduled_on),
    }));

  const columnIds = new Set(columns.map((column) => column.eventId));
  const registerTakenFor = (eventId: string) =>
    lastWeek.find((entry) => entry.id === eventId)?.registerTaken ?? false;

  /**
   * Does what they said and what they did disagree?
   *
   * Three ways, and one deliberate exclusion:
   *
   *   * they never answered — Requirement 6's nonresponse, and the one case
   *     where there is nothing to compare against;
   *   * they said no — Brian asked to see those "regardless of who it is";
   *   * they said yes and were not present, which includes late and excused.
   *
   * The exclusion: a yes with nothing on the register, where **nobody** was put
   * on that register. Every invitee matches it, the club's problem is one
   * untaken register, and last week's own row already says so.
   */
  const disagrees = (cell: { eventId: string; rsvp: string | null; attendance: string | null }) => {
    if (cell.rsvp === null) return true;
    if (cell.rsvp === "no") return true;
    if (cell.rsvp !== "yes") return false;
    if (cell.attendance === "present") return false;
    if (cell.attendance === null && !registerTakenFor(cell.eventId)) return false;
    return true;
  };

  const cellsByPerson = new Map<string, GridCell[]>();
  for (const row of said.rows) {
    if (!row.display_name || !columnIds.has(row.event_id)) continue;
    const reason = (row.reason ?? "").trim();
    const cell: GridCell = {
      eventId: row.event_id,
      rsvp: row.rsvp,
      attendance: row.attendance,
      reason: reason === "" ? null : reason,
      isDiscrepancy: false,
    };
    cell.isDiscrepancy = disagrees(cell);

    const cells = cellsByPerson.get(row.display_name) ?? [];

    // One cell per person per event, and the disagreement wins.
    //
    // A person can hold **two invitations to one event** — invariant P8 anchors
    // a player to their membership and a coach or committee member to their
    // person, and the same human is often both. The seeded week has 32 of them:
    // player + committee, player + coach. Pushing a cell each produced two
    // cells in one column, of which the table rendered the first and the
    // problem count counted both — so a real discrepancy could be hidden behind
    // a benign second invitation, and the ordering was skewed by double
    // counting.
    //
    // Merging keeps the row honest: if either invitation disagrees, the person
    // is on the list and it is the disagreement they see.
    const existing = cells.find((entry) => entry.eventId === cell.eventId);
    if (!existing) {
      cells.push(cell);
    } else if (cell.isDiscrepancy && !existing.isDiscrepancy) {
      Object.assign(existing, cell);
    } else if (cell.isDiscrepancy && existing.isDiscrepancy && existing.reason === null) {
      existing.reason = cell.reason;
    }

    cellsByPerson.set(row.display_name, cells);
  }

  const order = new Map(columns.map((column, at) => [column.eventId, at]));

  const rows: GridRow[] = [...cellsByPerson.entries()]
    .map(([person, cells]) => ({
      person,
      cells: cells.sort(
        (left, right) => (order.get(left.eventId) ?? 0) - (order.get(right.eventId) ?? 0),
      ),
      problems: cells.filter((cell) => cell.isDiscrepancy).length,
    }))
    // Only people something went wrong for. Everybody else answered and turned
    // up, and a list of them is not a thing anybody opens a report to read.
    .filter((row) => row.problems > 0)
    .sort(
      (left, right) => right.problems - left.problems || left.person.localeCompare(right.person),
    );

  // -------------------------------------------------------------------------
  // 3. Availability that is not green
  // -------------------------------------------------------------------------

  const availabilityRows = await tx.query<AvailabilityRow>(
    `select ${DISPLAY_NAME} as display_name, a.level::text as level,
            a.effective_from, a.review_on
       from public.current_availability a
       join public.season_memberships m on m.id = a.season_membership_id
       join public.people p on p.id = m.person_id
      where a.season_id = $1
        and a.level <> 'green'
      order by a.effective_from desc, display_name`,
    [season.id],
  );

  // -------------------------------------------------------------------------
  // 4. The week ahead
  // -------------------------------------------------------------------------

  const upcoming = await tx.query<UpcomingRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.solicits_response, e.is_mandatory,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.invitations i
              join public.current_rsvp r on r.invitation_id = i.id
             where i.event_id = e.id) as answered
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and e.status <> 'withdrawn'
      order by e.scheduled_on, e.name`,
    [season.id, lookAhead.from, lookAhead.to],
  );

  // -------------------------------------------------------------------------
  // 5, 6, 7. Things the club already has words for
  // -------------------------------------------------------------------------

  const walkUps: WalkUpEntry[] = walkUpRows.rows.map((row) => {
    const event = lastWeek.find((entry) => entry.id === row.event_id);
    return {
      person: row.display_name ?? "Unnamed",
      event: event?.name ?? "Unknown event",
      on: event?.on ?? null,
    };
  });

  const recruitment = await tx.query<RecruitmentRow>(
    `select ${DISPLAY_NAME} as display_name, r.status::text as status, r.source,
            r.first_contact_on
       from public.recruitment_prospects r
       join public.people p on p.id = r.person_id
      where r.season_id = $1
        and r.converted_membership_id is null
      order by r.first_contact_on desc nulls last, display_name`,
    [season.id],
  );

  // Every onboarding item the club has, not only the required ones. Brian,
  // 15 August 2026: "It should just be all the things that are considered
  // onboarding things." Subscription paid is the reason that matters — it is
  // not `is_required`, because subscription never gates activation, and it is
  // still the thing a treasurer opens this section to find.
  const onboardingItems = await tx.query<OnboardingItemRow>(
    `select t.code, t.label, t.sort_order, oi.status::text as status,
            ${DISPLAY_NAME} as display_name, m.status::text as membership_status
       from public.onboarding_items oi
       join public.onboarding_item_types t on t.id = oi.item_type_id
       join public.season_memberships m on m.id = oi.season_membership_id
       join public.people p on p.id = m.person_id
      where m.season_id = $1
        and m.status in ('onboarding', 'active')
      order by t.sort_order`,
    [season.id],
  );

  const onboardingColumns: OnboardingColumn[] = [];
  for (const row of onboardingItems.rows) {
    if (!onboardingColumns.some((column) => column.code === row.code)) {
      onboardingColumns.push({ code: row.code, label: row.label });
    }
  }

  /** Done, waived, or not theirs to do. Everything else is outstanding. */
  const settled = new Set(["complete", "waived", "not_applicable"]);

  const onboardingByPerson = new Map<string, OnboardingRow>();
  for (const row of onboardingItems.rows) {
    const person = row.display_name ?? "Unnamed member";
    const entry = onboardingByPerson.get(person) ?? {
      person,
      membershipStatus: row.membership_status,
      cells: [],
      outstanding: 0,
      applicable: 0,
    };
    entry.cells.push({
      code: row.code,
      status: row.status,
      isOutstanding: !settled.has(row.status),
    });
    onboardingByPerson.set(person, entry);
  }

  const onboardingRows = [...onboardingByPerson.values()]
    .map((entry) => ({
      ...entry,
      outstanding: entry.cells.filter((cell) => cell.isOutstanding).length,
      // Not applicable is not a thing anybody has to do, so it is not part of
      // the denominator either — otherwise a member excused from half the list
      // reads as better-organised than one who simply is not.
      applicable: entry.cells.filter((cell) => cell.status !== "not_applicable").length,
    }))
    // Only members with something outstanding. Everybody else is done, and a
    // list of people who are done is not what this section is for.
    .filter((entry) => entry.outstanding > 0)
    .sort(
      (left, right) =>
        right.outstanding / Math.max(right.applicable, 1) -
          left.outstanding / Math.max(left.applicable, 1) ||
        right.outstanding - left.outstanding ||
        left.person.localeCompare(right.person),
    );

  // -------------------------------------------------------------------------
  // 8. The week in numbers
  // -------------------------------------------------------------------------

  const availabilityCounts = await tx.query<CountRow>(
    `select level::text as key, count(*)::int as tally
       from public.current_availability
      where season_id = $1
      group by level`,
    [season.id],
  );

  const levelOf = (key: string) =>
    availabilityCounts.rows.find((row) => row.key === key)?.tally ?? 0;

  const sum = (value: (entry: EventOutcome) => number) =>
    lastWeek.reduce((total, entry) => total + value(entry), 0);

  return {
    schema: REPORT_CONTENT_SCHEMA,
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    reportOn,
    lookBack,
    lookAhead,
    season: { id: season.id, label: season.label },
    lastWeek,
    grid: { columns, rows },
    availability: availabilityRows.rows.map((row) => ({
      person: row.display_name ?? "Unnamed member",
      level: row.level,
      since: asDate(row.effective_from),
      reviewOn: asDate(row.review_on),
    })),
    nextWeek: upcoming.rows.map((row) => ({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      status: row.status,
      on: asDate(row.scheduled_on),
      isMandatory: row.is_mandatory,
      solicitsResponse: row.solicits_response,
      invited: row.invited,
      answered: row.answered,
    })),
    walkUps,
    recruitment: recruitment.rows.map((row) => ({
      person: row.display_name ?? "Unnamed",
      status: row.status,
      source: row.source,
      firstContactOn: asDate(row.first_contact_on),
    })),
    onboarding: { columns: onboardingColumns, rows: onboardingRows },
    attendance: {
      present: sum((entry) => entry.present),
      late: sum((entry) => entry.late),
      excused: sum((entry) => entry.excused),
      absent: sum((entry) => entry.absent),
      eventsWithNoRegister: lastWeek.filter(
        (entry) => entry.status === "occurred" && !entry.registerTaken,
      ).length,
    },
    availabilityCounts: {
      green: levelOf("green"),
      orange: levelOf("orange"),
      red: levelOf("red"),
    },
  };
}

// ---------------------------------------------------------------------------
// Filing a snapshot
// ---------------------------------------------------------------------------

export interface GeneratedReport {
  id: string;
  version: number;
  supersedesId: string | null;
  reportOn: string;
}

/**
 * A 64-bit key for the advisory lock, stable for a `(season, reporting date)`
 * series and derived from nothing else.
 */
const SERIES_LOCK = `select pg_advisory_xact_lock(
    hashtextextended($1::text || ':' || $2::text, 0))`;

const STORED_SELECT = (where: string) => `select w.id,
       w.season_id,
       w.report_on,
       w.version,
       w.supersedes_id,
       w.metric_definition_version,
       w.data_as_of,
       w.generated_at,
       ${DISPLAY_NAME} as generated_by_name,
       w.content,
       exists (
         select 1 from public.weekly_reports later where later.supersedes_id = w.id
       ) as is_superseded
  from public.weekly_reports w
  left join public.people p on p.id = w.generated_by_person_id
 where ${where}`;

interface StoredRow {
  id: string;
  season_id: string;
  report_on: Date | string;
  version: number;
  supersedes_id: string | null;
  metric_definition_version: string;
  data_as_of: Date | string;
  generated_at: Date | string;
  generated_by_name: string | null;
  content: unknown;
  is_superseded: boolean;
}

function toStoredReport(row: StoredRow): StoredReport {
  return {
    id: row.id,
    seasonId: row.season_id,
    reportOn: asDate(row.report_on) as string,
    version: row.version,
    supersedesId: row.supersedes_id,
    metricDefinitionVersion: row.metric_definition_version,
    dataAsOf: asIso(row.data_as_of) as string,
    generatedAt: asIso(row.generated_at) as string,
    generatedByName: row.generated_by_name,
    content: row.content,
    isSuperseded: row.is_superseded,
  };
}

/**
 * Files one immutable snapshot, inside the caller's transaction, and returns
 * what it allocated.
 *
 * Version allocation is deliberately above the database —
 * `docs/architecture/data-model.md` § _Rules deliberately left to TypeScript_:
 * that `version` is exactly `predecessor.version + 1`, and that the predecessor
 * is the current latest, are read-then-write decisions that need the
 * transaction to have looked at existing rows.
 *
 * Two operators opening the report at the same instant is therefore a real
 * race, and it is closed twice over:
 *
 *   * the caller's transaction-scoped advisory lock on the
 *     `(season, reporting date)` series, so the second waits for the first to
 *     commit and then sees its row. An advisory lock rather than
 *     `select … for update` because `weekly_reports` grants `service_role` only
 *     `select, insert` — row locking needs `update`, and widening that grant to
 *     take a lock would hand the append-only table a way to be rewritten;
 *
 *   * the database's own `weekly_reports_one_per_version` and
 *     `weekly_reports_one_superseding_row`, which make a duplicate version and
 *     a forked lineage impossible regardless of what any caller does.
 */
async function fileSnapshot(
  tx: Tx,
  season: Season,
  actorPersonId: string,
  reportOn: string,
): Promise<GeneratedReport> {
  const latest = await tx.query<{ id: string; version: number }>(
    `select id, version
       from public.weekly_reports
      where season_id = $1 and report_on = $2::date
      order by version desc
      limit 1`,
    [season.id, reportOn],
  );

  const predecessor = latest.rows[0] ?? null;
  const version = predecessor ? predecessor.version + 1 : 1;
  const supersedesId = predecessor ? predecessor.id : null;

  const content = await computeReportContent(tx, season, reportOn);
  const now = await tx.query<{ at: Date }>("select now() as at");

  // No `try` around this. The two constraints that close the race the lock
  // already narrowed, and the composite foreign key that refuses a cross-season
  // supersession, are all named in `CONSTRAINT_MESSAGES`, so a violation
  // arrives as a readable `Conflict` or `ConstraintViolated` for every caller.
  const inserted = await tx.query<{ id: string }>(
    `insert into public.weekly_reports
       (season_id, report_on, version, supersedes_id, metric_definition_version,
        data_as_of, generated_by_person_id, content)
     values ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb)
     returning id`,
    [
      season.id,
      reportOn,
      version,
      supersedesId,
      METRIC_DEFINITION_VERSION,
      now.rows[0].at,
      actorPersonId,
      JSON.stringify(content),
    ],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "weekly_report_generated",
    entityTable: "weekly_reports",
    entityId: inserted.rows[0].id,
    toState: `version ${version}`,
    context: {
      report_on: reportOn,
      version,
      supersedes_id: supersedesId,
      metric_definition_version: METRIC_DEFINITION_VERSION,
      look_back_from: content.lookBack.from,
      look_back_to: content.lookBack.to,
      look_ahead_to: content.lookAhead.to,
    },
  });

  return { id: inserted.rows[0].id, version, supersedesId, reportOn };
}

/** Files a snapshot unconditionally. The pilot scripts and the tests use this. */
export async function generateWeeklyReport(
  actorPersonId: string,
  reportOn: string,
): Promise<GeneratedReport> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    await tx.query(SERIES_LOCK, [season.id, on]);
    return fileSnapshot(tx, season, actorPersonId, on);
  });
}

// ---------------------------------------------------------------------------
// Reading — the only thing the interface calls
// ---------------------------------------------------------------------------

/**
 * The report for a date: the snapshot on file, or a new one.
 *
 * ## When a snapshot is filed
 *
 * Brian's decision of 15 August 2026, taken after the cost was measured rather
 * than guessed at — one snapshot is 6.6 KB stored and 36 ms of querying, against
 * a full season of 110 events and 4,892 invitations. Being frugal about filing
 * them was protecting the meaning of the version chain, not the disk.
 *
 * So: **pressing Show Report files one, every time.** Arriving at the route,
 * changing how a grid is sorted, or refreshing does not — those show what is
 * already on file. The three cases where a read files anyway are the ones where
 * there is nothing honest to show: no snapshot exists for that date at all, or
 * the newest was written under superseded metric definitions.
 *
 * The consequence, stated plainly because it is unusual: **this read can
 * write.** It is guarded by `leadership_report` at every entry point and
 * serialized by an advisory lock, so two people pressing at once get two
 * versions in a line rather than a fork. It writes nothing else, ever.
 *
 * The screen therefore still renders **stored content and never a live
 * recompute** — invariant M5's whole point, and the property that would have
 * been quietly lost by making the page "just show the numbers".
 */
export async function readReportForDate(
  actorPersonId: string,
  reportOn: string,
  options: { fileNew?: boolean } = {},
): Promise<StoredReport> {
  const on = normaliseReportDate(reportOn);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    await tx.query(SERIES_LOCK, [season.id, on]);

    const latest = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")}
       order by w.version desc
       limit 1`,
      [season.id, on],
    );

    const existing = latest.rows[0];
    const reusable =
      existing !== undefined &&
      !options.fileNew &&
      // A snapshot from superseded definitions is not one this interface can
      // organise, so it is shown to nobody by default — it stays on file, and a
      // current one is filed beside it. Without this, the first person to open
      // the report on a definitions-change day would see a page it could not
      // lay out, all day.
      existing.metric_definition_version === METRIC_DEFINITION_VERSION;

    if (reusable) return toStoredReport(existing);

    const filed = await fileSnapshot(tx, season, actorPersonId, on);
    const stored = await tx.query<StoredRow>(STORED_SELECT("w.id = $1"), [filed.id]);
    return toStoredReport(stored.rows[0]);
  });
}

/**
 * The current version for a reporting date, or `null` when none was ever filed.
 *
 * Nothing in the interface calls this — opening the report files one — but the
 * pilot scenario and the M5 tests need to ask the question without causing the
 * answer.
 */
export async function readCurrentReport(reportOn: string): Promise<StoredReport | null> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")}
       order by w.version desc
       limit 1`,
      [season.id, on],
    );
    const row = result.rows[0];
    return row ? toStoredReport(row) : null;
  });
}

/**
 * Every version for a reporting date, newest first.
 *
 * Also not reachable from the interface, and deliberately so: Brian's decision
 * removed the version list from the screen, not the versions from the database.
 * This is how a test — and, one day, a support question — reads the lineage M5
 * keeps.
 */
export async function listReportVersions(reportOn: string): Promise<StoredReport[]> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `${STORED_SELECT("w.season_id = $1 and w.report_on = $2::date")} order by w.version desc`,
      [season.id, on],
    );
    return result.rows.map(toStoredReport);
  });
}

/** One stored snapshot by id, or `NotFound`. Reads; never recomputes. */
export async function readStoredReport(id: string): Promise<StoredReport> {
  return withTransaction(async (tx) => {
    const result = await tx.query<StoredRow>(STORED_SELECT("w.id = $1"), [id]);
    const row = result.rows[0];
    if (!row) throw new NotFound(REPORT_NOT_FOUND_MESSAGE, { rule: "weekly_report_not_found" });
    return toStoredReport(row);
  });
}

/**
 * Narrows a stored snapshot's content, or returns `null`.
 *
 * `null` is not a failure. `weekly_reports` deliberately stores whatever the
 * metric definitions of that version produced — the seed contains two under
 * `master-table-v1`, and this branch filed several under `LAN-81.1` before the
 * review changed the shape — and a reader that threw on one would make an
 * immutable record unreadable, which is the opposite of what M5 is for.
 */
export function parseReportContent(content: unknown): WeeklyReportContent | null {
  if (typeof content !== "object" || content === null) return null;
  const candidate = content as Partial<WeeklyReportContent>;
  if (candidate.schema !== REPORT_CONTENT_SCHEMA) return null;
  if (!Array.isArray(candidate.lastWeek) || !Array.isArray(candidate.nextWeek)) return null;
  if (typeof candidate.grid !== "object" || candidate.grid === null) return null;
  if (typeof candidate.reportOn !== "string") return null;
  return candidate as WeeklyReportContent;
}
