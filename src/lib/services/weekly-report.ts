import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { readCurrentSeasonIn, type Season } from "./seasons";

/**
 * The Monday exception and action report — locked Requirement 9, invariant M5.
 * LAN-81.
 *
 * ## What this module is, and the one thing it must never become
 *
 * Two operations that look similar and are not:
 *
 *   * **Preview** computes the exceptions from current source data and writes
 *     nothing at all. It is a question about right now.
 *   * **Generate** computes the same content and *stores* it, as one immutable
 *     row. It is a statement about what leadership saw on a date.
 *
 * Invariant M5 is the whole reason for the split. A published report never
 * changes: `weekly_reports` is insert-only, has no `status` column, and derives
 * "superseded" from a later row pointing at it. Regenerating produces a new
 * version — it does not rewrite the old one, and nothing in this module can,
 * because there is no update statement in it and the table grants none.
 *
 * The corollary matters as much: **reading a stored report never recomputes
 * it.** `readStoredReport` returns the stored JSONB and the interface renders
 * that. If this module ever grows a "read the report and refresh the numbers"
 * path, "what did leadership see on the 12th?" stops being answerable, which is
 * the question the table exists to answer.
 *
 * ## Almost none of the query work is here
 *
 * The five views the issue names carry it: `invitation_response_state`
 * (invariant P7's partition, already excluding non-soliciting events per E6),
 * `nonresponse_queue`, `uninvited_audience_members`, `rsvp_attendance_mismatches`
 * and `current_availability`. This module composes them for a season and a
 * window; it re-derives none of them. A second definition of "nonresponse"
 * written here would drift from the one the attendance board reads, and the two
 * would disagree in public.
 *
 * ## Version allocation is deliberately above the database
 *
 * `docs/architecture/data-model.md` § _Rules deliberately left to TypeScript_:
 * that `version` is exactly `predecessor.version + 1`, and that the predecessor
 * is the current latest, are read-then-write decisions that need the
 * transaction to have looked at existing rows.
 *
 * Two operators pressing Generate at the same instant is therefore a real race,
 * and it is closed twice over:
 *
 *   * a transaction-scoped advisory lock on the `(season, reporting date)`
 *     series, so the second generation waits for the first to commit and then
 *     reads its row. An advisory lock rather than `select … for update` because
 *     `weekly_reports` grants `service_role` only `select, insert` — row
 *     locking needs `update`, and widening that grant to take a lock would
 *     hand the append-only table a way to be rewritten;
 *
 *   * the database's own `weekly_reports_one_per_version` and
 *     `weekly_reports_one_superseding_row`, which make a duplicate version and
 *     a forked lineage impossible regardless of what any caller does. The lock
 *     is what turns a collision into a wait; these are what make it safe.
 *
 * ## Privacy
 *
 * The snapshot contains the reasons people gave for **Not attending**, because
 * the approved MVP boundary leads the report with them. It contains no
 * availability narrative, no diagnosis and no free-text health field — the
 * schema has no column capable of holding one, `tests/schema-security.test.ts`
 * scans for one, and availability appears here as a count per level and
 * nothing else. Nothing in this module exports, emails or distributes a report;
 * the only reader is an operator holding `leadership_report`.
 */

// ---------------------------------------------------------------------------
// The constants that identify a snapshot
// ---------------------------------------------------------------------------

/**
 * The metric definitions these numbers were computed under, recorded on every
 * row so that an old snapshot stays readable when the definitions change.
 *
 * Defined in exactly one place, which is this line. It is **not** the sixteen
 * definitions recovered from the Master Table — the issue puts those out of
 * scope — and saying so is the point of versioning it: `LAN-81.1` names the
 * narrow exception-and-action set this slice computes, and a later expansion
 * (LAN-109's operating horizon, or the full sixteen) allocates its own version
 * rather than silently changing what an existing snapshot claims to be.
 */
export const METRIC_DEFINITION_VERSION = "LAN-81.1";

/** The shape of `content`, so a reader can tell a snapshot it understands. */
export const REPORT_CONTENT_SCHEMA = "lancers.monday-exception-report.v1";

/**
 * The reporting window: the seven days ending the day before the reporting
 * date.
 *
 * A Monday report covers the Monday-to-Sunday just gone. This is a lead
 * decision recorded on the pull request, not a club fact: nothing in Linear,
 * the UX contract or the frozen model states the window's length, and the
 * wireframes show a reporting date without one. Two things constrain it, and
 * both point the same way — the approved MVP boundary makes this an
 * exception-and-action report about what has already happened, and the
 * current-week and next-week horizon is explicitly LAN-109's.
 *
 * The window is printed on the preview and stored in the snapshot, so no reader
 * has to infer it and a later change to it is visible in old reports rather
 * than retroactive.
 */
export const REPORT_WINDOW_DAYS = 7;

export const REPORT_DATE_INVALID_MESSAGE = "Choose a reporting date in the form YYYY-MM-DD.";

export const REPORT_NOT_FOUND_MESSAGE = "That report does not exist.";

// ---------------------------------------------------------------------------
// The stored content
// ---------------------------------------------------------------------------

/** The six exception categories, in the order the approved MVP boundary sets. */
export const EXCEPTION_KEYS = Object.freeze([
  "nonresponses",
  "not_attending",
  "mismatches",
  "absences",
  "onboarding",
  "uninvited_audience",
] as const);

export type ExceptionKey = (typeof EXCEPTION_KEYS)[number];

/** One line in an exception section. Free-form by section, always displayable. */
export interface ExceptionItem {
  /** The person the exception is about, already resolved to a display name. */
  person: string | null;
  /** The event it happened at, where there is one. */
  event: string | null;
  /** `YYYY-MM-DD`, where there is one. */
  on: string | null;
  /** What is wrong, in the club's language. */
  detail: string | null;
}

export interface ExceptionSection {
  key: ExceptionKey;
  /** 1–6. Stored so the order survives in the snapshot rather than in code. */
  position: number;
  title: string;
  count: number;
  /** The one-line summary the card shows under its title. */
  summary: string;
  /** The second line — the breakdown, or what to do about it. */
  note: string;
  /**
   * `true` only for the uninvited audience: an approval defect, not a chase.
   * Stored rather than derived on read, so the distinction survives in the
   * snapshot exactly as the report made it.
   */
  isApprovalDefect: boolean;
  items: ExceptionItem[];
}

export interface EventInWindow {
  id: string;
  name: string;
  eventType: string;
  status: string;
  on: string | null;
  solicitsResponse: boolean;
}

export interface ResponseBreakdownRow {
  eventId: string;
  eventName: string;
  on: string | null;
  respondedYes: number;
  respondedNo: number;
  awaitingResponse: number;
  expiredWithoutResponse: number;
  cancelled: number;
  neverInvited: number;
}

export interface AttendanceSummary {
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** Occurred events in the window for which not one row was recorded. */
  eventsWithNoRegister: number;
}

/** Counts per level. Canonical level names; no narrative, and no room for one. */
export interface AvailabilitySummary {
  green: number;
  orange: number;
  red: number;
}

export interface WeeklyReportContent {
  schema: string;
  metricDefinitionVersion: string;
  reportOn: string;
  window: { from: string; to: string };
  season: { id: string; label: string };
  /** The lead: the six exception categories, in their approved order. */
  exceptions: ExceptionSection[];
  events: EventInWindow[];
  responseBreakdown: ResponseBreakdownRow[];
  attendance: AttendanceSummary;
  availability: AvailabilitySummary;
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
   * under a different `metricDefinitionVersion` — the seed contains two — is a
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

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Academic 3 · Injury 2" — the two commonest reasons, and nothing about who. */
function topReasons(reasons: (string | null)[]): string {
  const tally = new Map<string, number>();
  for (const reason of reasons) {
    const key = (reason ?? "").trim();
    if (key === "") continue;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (ranked.length === 0) return "No reason recorded";
  return ranked
    .slice(0, 3)
    .map(([reason, count]) => `${reason} ${count}`)
    .join(" · ");
}

const MISMATCH_LABELS: Readonly<Record<string, string>> = Object.freeze({
  said_yes_no_attendance_recorded: "Attending, no attendance recorded",
  said_yes_marked_absent: "Attending but absent",
  said_no_but_attended: "Not attending but turned up",
  attended_without_invitation: "Turned up without an invitation",
});

const PRESENCE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  present: "Present",
  absent: "Absent",
  late: "Late",
  excused: "Excused",
});

interface NonresponseRow {
  event_name: string;
  scheduled_on: Date | string | null;
  invitation_status: string;
  display_name: string | null;
}

interface NotAttendingRow {
  event_name: string;
  scheduled_on: Date | string | null;
  reason: string | null;
  display_name: string | null;
}

interface MismatchRow {
  event_name: string;
  scheduled_on: Date | string | null;
  mismatch: string | null;
  display_name: string | null;
}

interface AbsenceRow {
  event_name: string;
  scheduled_on: Date | string | null;
  presence: string;
  display_name: string | null;
}

interface RegisterGapRow {
  name: string;
  scheduled_on: Date | string | null;
  invited: number;
}

interface OnboardingRow {
  display_name: string | null;
  membership_status: string;
  outstanding: string;
  outstanding_count: number;
}

interface UninvitedRow {
  event_name: string;
  scheduled_on: Date | string | null;
  event_status: string;
  display_name: string | null;
}

interface EventRow {
  id: string;
  name: string;
  event_type: string;
  status: string;
  scheduled_on: Date | string | null;
  solicits_response: boolean;
}

interface BreakdownRow {
  event_id: string;
  event_name: string;
  scheduled_on: Date | string | null;
  response_state: string;
  tally: number;
}

interface CountRow {
  key: string;
  tally: number;
}

/**
 * Everything the report says, computed from the five views for one season and
 * one window.
 *
 * Read-only by construction: there is no insert, update or delete in it. It is
 * shared by preview and generation precisely so that the preview cannot show
 * one thing and the snapshot record another.
 */
export async function computeReportContent(
  tx: Tx,
  season: Season,
  reportOn: string,
): Promise<WeeklyReportContent> {
  const { from, to } = reportWindow(reportOn);
  const scope = [season.id, from, to];

  // 1 — Nonresponses. Requirement 6's escalation queue, for the window's
  //     events only. An audience member who was never invited is deliberately
  //     NOT here: that is section 6, and it is a different exception.
  const nonresponses = await tx.query<NonresponseRow>(
    `select q.event_name,
            q.scheduled_on,
            q.invitation_status::text as invitation_status,
            ${DISPLAY_NAME} as display_name
       from public.nonresponse_queue q
       left join public.season_memberships m on m.id = q.season_membership_id
       left join public.people p on p.id = coalesce(q.person_id, m.person_id)
      where q.season_id = $1
        and q.scheduled_on between $2::date and $3::date
      order by q.scheduled_on, display_name`,
    scope,
  );

  // 2 — Not attending, with the reason. From invariant P7's partition, which
  //     already excludes non-soliciting events (invariant E6).
  const notAttending = await tx.query<NotAttendingRow>(
    `select e.name as event_name,
            e.scheduled_on,
            s.reason,
            ${DISPLAY_NAME} as display_name
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
       left join public.season_memberships m on m.id = s.season_membership_id
       left join public.people p on p.id = coalesce(s.person_id, m.person_id)
      where s.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and s.response_state = 'responded_no'
      order by e.scheduled_on, display_name`,
    scope,
  );

  // 3 — RSVP against attendance. Computed by the view, surfaced here, and
  //     never reconciled by either.
  const mismatches = await tx.query<MismatchRow>(
    `select x.event_name,
            x.scheduled_on,
            x.mismatch,
            ${DISPLAY_NAME} as display_name
       from public.rsvp_attendance_mismatches x
       left join public.season_memberships m on m.id = x.season_membership_id
       left join public.people p on p.id = coalesce(x.person_id, m.person_id)
      where x.season_id = $1
        and x.scheduled_on between $2::date and $3::date
      order by x.scheduled_on, display_name`,
    scope,
  );

  // 4a — Absences actually recorded.
  const absences = await tx.query<AbsenceRow>(
    `select e.name as event_name,
            e.scheduled_on,
            a.presence::text as presence,
            ${DISPLAY_NAME} as display_name
       from public.attendance_records a
       join public.events e on e.id = a.event_id
       left join public.season_memberships m on m.id = a.season_membership_id
       left join public.people p on p.id = coalesce(a.person_id, m.person_id)
      where a.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and a.presence = 'absent'
      order by e.scheduled_on, display_name`,
    scope,
  );

  // 4b — And the register nobody filled in. An occurred event with invitations
  //      and not one attendance row is the other half of "missing attendance",
  //      and it is the half an absent row can never show.
  const registerGaps = await tx.query<RegisterGapRow>(
    `select e.name,
            e.scheduled_on,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and e.status = 'occurred'
        and not exists (select 1 from public.attendance_records a where a.event_id = e.id)
      order by e.scheduled_on, e.name`,
    scope,
  );

  // 5 — Onboarding exceptions. A member who is being operated as part of the
  //     squad with a required item still outstanding. Not scoped to the window:
  //     an outstanding item is a standing exception, not an event.
  const onboarding = await tx.query<OnboardingRow>(
    `select ${DISPLAY_NAME} as display_name,
            m.status::text as membership_status,
            string_agg(t.label, ', ' order by t.sort_order) as outstanding,
            count(*)::int as outstanding_count
       from public.onboarding_items oi
       join public.onboarding_item_types t on t.id = oi.item_type_id
       join public.season_memberships m on m.id = oi.season_membership_id
       join public.people p on p.id = m.person_id
      where m.season_id = $1
        and m.status in ('onboarding', 'active')
        and t.is_required
        and oi.status not in ('complete', 'waived', 'not_applicable')
      group by p.id, p.given_name, p.family_name, p.known_as, m.status
      order by display_name`,
    [season.id],
  );

  // 6 — The approval defect: somebody the approver confirmed who was never
  //     asked. Separate from section 1 on purpose — it is not a chase.
  const uninvited = await tx.query<UninvitedRow>(
    `select u.event_name,
            u.scheduled_on,
            u.event_status::text as event_status,
            ${DISPLAY_NAME} as display_name
       from public.uninvited_audience_members u
       left join public.season_memberships m on m.id = u.season_membership_id
       left join public.people p on p.id = coalesce(u.person_id, m.person_id)
      where u.season_id = $1
        and u.scheduled_on between $2::date and $3::date
      order by u.scheduled_on, display_name`,
    scope,
  );

  const events = await tx.query<EventRow>(
    `select id, name, event_type::text as event_type, status::text as status,
            scheduled_on, solicits_response
       from public.events
      where season_id = $1
        and scheduled_on between $2::date and $3::date
      order by scheduled_on, name`,
    scope,
  );

  const breakdown = await tx.query<BreakdownRow>(
    `select s.event_id,
            e.name as event_name,
            e.scheduled_on,
            s.response_state,
            count(*)::int as tally
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
      where s.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      group by s.event_id, e.name, e.scheduled_on, s.response_state
      order by e.scheduled_on, e.name`,
    scope,
  );

  const presence = await tx.query<CountRow>(
    `select a.presence::text as key, count(*)::int as tally
       from public.attendance_records a
       join public.events e on e.id = a.event_id
      where a.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      group by a.presence`,
    scope,
  );

  // Availability is the standing level per membership — a count per level and
  // nothing else. There is no note column to select and none is to be added.
  const availability = await tx.query<CountRow>(
    `select level::text as key, count(*)::int as tally
       from public.current_availability
      where season_id = $1
      group by level`,
    [season.id],
  );

  const notAttendingItems = notAttending.rows.map((row) => ({
    person: row.display_name,
    event: row.event_name,
    on: asDate(row.scheduled_on),
    detail: (row.reason ?? "").trim() === "" ? "No reason recorded" : (row.reason as string),
  }));

  const mismatchItems = mismatches.rows.map((row) => ({
    person: row.display_name,
    event: row.event_name,
    on: asDate(row.scheduled_on),
    detail: row.mismatch ? (MISMATCH_LABELS[row.mismatch] ?? row.mismatch) : null,
  }));

  const absenceItems: ExceptionItem[] = [
    ...absences.rows.map((row) => ({
      person: row.display_name,
      event: row.event_name,
      on: asDate(row.scheduled_on),
      detail: PRESENCE_LABELS[row.presence] ?? row.presence,
    })),
    ...registerGaps.rows.map((row) => ({
      person: null,
      event: row.name,
      on: asDate(row.scheduled_on),
      detail: `No attendance recorded — ${plural(row.invited, "person was invited", "people were invited")}`,
    })),
  ];

  const nonresponseEvents = new Set(nonresponses.rows.map((row) => row.event_name));
  const mismatchTally = new Map<string, number>();
  for (const row of mismatches.rows) {
    if (!row.mismatch) continue;
    mismatchTally.set(row.mismatch, (mismatchTally.get(row.mismatch) ?? 0) + 1);
  }
  const commonestMismatch = [...mismatchTally.entries()].sort((a, b) => b[1] - a[1])[0];

  const exceptions: ExceptionSection[] = [
    {
      key: "nonresponses",
      position: 1,
      title: "Nonresponses",
      count: nonresponses.rows.length,
      summary: `${plural(nonresponses.rows.length, "player", "players")} across ${plural(
        nonresponseEvents.size,
        "event",
        "events",
      )}`,
      note: nonresponses.rows.length === 0 ? "Nothing outstanding" : "Review queue",
      isApprovalDefect: false,
      items: nonresponses.rows.map((row) => ({
        person: row.display_name,
        event: row.event_name,
        on: asDate(row.scheduled_on),
        detail: row.invitation_status === "expired" ? "Deadline passed" : "Outstanding",
      })),
    },
    {
      key: "not_attending",
      position: 2,
      title: "Not attending",
      count: notAttendingItems.length,
      summary: `${plural(notAttendingItems.length, "response", "responses")} and reasons`,
      note:
        notAttendingItems.length === 0
          ? "Nobody declined"
          : topReasons(notAttending.rows.map((row) => row.reason)),
      isApprovalDefect: false,
      items: notAttendingItems,
    },
    {
      key: "mismatches",
      position: 3,
      title: "RSVP / attendance mismatches",
      count: mismatchItems.length,
      summary: `${plural(mismatchItems.length, "record", "records")}`,
      note: commonestMismatch
        ? `${MISMATCH_LABELS[commonestMismatch[0]] ?? commonestMismatch[0]} ${commonestMismatch[1]}`
        : "Intent and reality agree",
      isApprovalDefect: false,
      items: mismatchItems,
    },
    {
      key: "absences",
      position: 4,
      title: "Absences / missing attendance",
      count: absenceItems.length,
      summary: `${plural(absences.rows.length, "absence", "absences")}`,
      note:
        registerGaps.rows.length === 0
          ? "Every register was completed"
          : `${plural(registerGaps.rows.length, "incomplete register", "incomplete registers")}`,
      isApprovalDefect: false,
      items: absenceItems,
    },
    {
      key: "onboarding",
      position: 5,
      title: "Onboarding exceptions",
      count: onboarding.rows.length,
      summary: `${plural(onboarding.rows.length, "member", "members")}`,
      note: onboarding.rows.length === 0 ? "Nothing outstanding" : "Required item outstanding",
      isApprovalDefect: false,
      items: onboarding.rows.map((row) => ({
        person: row.display_name,
        event: null,
        on: null,
        detail: `${row.membership_status} · ${row.outstanding}`,
      })),
    },
    {
      key: "uninvited_audience",
      position: 6,
      title: "Uninvited audience defects",
      count: uninvited.rows.length,
      summary: `${plural(uninvited.rows.length, "approval defect", "approval defects")}`,
      // Never a chase. The approver confirmed these people and nobody asked
      // them, which is a defect in the approval rather than a nonresponse.
      note:
        uninvited.rows.length === 0
          ? "Everybody confirmed was invited"
          : "Approved but never invited — requires review",
      isApprovalDefect: true,
      items: uninvited.rows.map((row) => ({
        person: row.display_name,
        event: row.event_name,
        on: asDate(row.scheduled_on),
        detail: "Confirmed in the audience and never invited",
      })),
    },
  ];

  const byEvent = new Map<string, ResponseBreakdownRow>();
  for (const row of breakdown.rows) {
    const existing = byEvent.get(row.event_id) ?? {
      eventId: row.event_id,
      eventName: row.event_name,
      on: asDate(row.scheduled_on),
      respondedYes: 0,
      respondedNo: 0,
      awaitingResponse: 0,
      expiredWithoutResponse: 0,
      cancelled: 0,
      neverInvited: 0,
    };
    if (row.response_state === "responded_yes") existing.respondedYes = row.tally;
    if (row.response_state === "responded_no") existing.respondedNo = row.tally;
    if (row.response_state === "awaiting_response") existing.awaitingResponse = row.tally;
    if (row.response_state === "expired_without_response") {
      existing.expiredWithoutResponse = row.tally;
    }
    if (row.response_state === "cancelled") existing.cancelled = row.tally;
    if (row.response_state === "never_invited") existing.neverInvited = row.tally;
    byEvent.set(row.event_id, existing);
  }

  const presenceOf = (key: string) => presence.rows.find((row) => row.key === key)?.tally ?? 0;
  const availabilityOf = (key: string) =>
    availability.rows.find((row) => row.key === key)?.tally ?? 0;

  return {
    schema: REPORT_CONTENT_SCHEMA,
    metricDefinitionVersion: METRIC_DEFINITION_VERSION,
    reportOn,
    window: { from, to },
    season: { id: season.id, label: season.label },
    exceptions,
    events: events.rows.map((row) => ({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      status: row.status,
      on: asDate(row.scheduled_on),
      solicitsResponse: row.solicits_response,
    })),
    responseBreakdown: [...byEvent.values()],
    attendance: {
      present: presenceOf("present"),
      late: presenceOf("late"),
      excused: presenceOf("excused"),
      absent: presenceOf("absent"),
      eventsWithNoRegister: registerGaps.rows.length,
    },
    availability: {
      green: availabilityOf("green"),
      orange: availabilityOf("orange"),
      red: availabilityOf("red"),
    },
  };
}

// ---------------------------------------------------------------------------
// Preview — UX-80
// ---------------------------------------------------------------------------

export interface ReportPreview {
  season: Season;
  reportOn: string;
  window: { from: string; to: string };
  content: WeeklyReportContent;
  /** The moment the numbers were read, shown so a preview cannot look stored. */
  computedAt: string;
}

/**
 * The computed exceptions for a date, written nowhere.
 *
 * A transaction because the eleven queries must see one consistent picture of
 * the database — a preview whose nonresponse count and response breakdown came
 * from two different instants is a report that contradicts itself.
 */
export async function previewWeeklyReport(reportOn: string): Promise<ReportPreview> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const now = await tx.query<{ at: Date }>("select now() as at");
    const content = await computeReportContent(tx, season, on);
    return {
      season,
      reportOn: on,
      window: content.window,
      content,
      computedAt: asIso(now.rows[0].at) as string,
    };
  });
}

// ---------------------------------------------------------------------------
// Generation — the immutable snapshot
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
 *
 * `hashtextextended` rather than `hashtext` because two series colliding would
 * only cost one of them a wait, but a 32-bit space makes that likely enough to
 * be worth avoiding for one function call.
 */
const SERIES_LOCK = `select pg_advisory_xact_lock(
    hashtextextended($1::text || ':' || $2::text, 0))`;

/**
 * Generates one immutable snapshot, and returns what it allocated.
 *
 * Everything happens in one transaction: the lock, the reads the numbers come
 * from, the version allocation, the insert and the audit row. A snapshot whose
 * audit row survived a rolled-back insert would be a record of a report that
 * does not exist.
 *
 * `data_as_of` is the transaction's own `now()` rather than a clock read in
 * TypeScript, because it must be the instant the numbers were true at — which
 * is the instant this transaction's snapshot was taken, not the instant the
 * request arrived.
 */
export async function generateWeeklyReport(
  actorPersonId: string,
  reportOn: string,
): Promise<GeneratedReport> {
  const on = normaliseReportDate(reportOn);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);

    // Serialises this series against a concurrent generation. Released on
    // commit or rollback, by the transaction, without anything to remember.
    await tx.query(SERIES_LOCK, [season.id, on]);

    const latest = await tx.query<{ id: string; version: number }>(
      `select id, version
         from public.weekly_reports
        where season_id = $1 and report_on = $2::date
        order by version desc
        limit 1`,
      [season.id, on],
    );

    const predecessor = latest.rows[0] ?? null;
    const version = predecessor ? predecessor.version + 1 : 1;
    const supersedesId = predecessor ? predecessor.id : null;

    const content = await computeReportContent(tx, season, on);
    const now = await tx.query<{ at: Date }>("select now() as at");
    const dataAsOf = now.rows[0].at;

    // No `try` around this. The two constraints that close the race the lock
    // already narrowed — one row per version, one successor per predecessor —
    // and the composite foreign key that refuses a cross-season supersession
    // are all named in `CONSTRAINT_MESSAGES`, so a violation arrives as a
    // readable `Conflict` or `ConstraintViolated` for every caller rather than
    // only for this one.
    const inserted = await tx.query<{ id: string; generated_at: Date }>(
      `insert into public.weekly_reports
         (season_id, report_on, version, supersedes_id, metric_definition_version,
          data_as_of, generated_by_person_id, content)
       values ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb)
       returning id, generated_at`,
      [
        season.id,
        on,
        version,
        supersedesId,
        METRIC_DEFINITION_VERSION,
        dataAsOf,
        actorPersonId,
        JSON.stringify(content),
      ],
    );

    const row = inserted.rows[0];

    await recordAudit(tx, {
      actorPersonId,
      action: "weekly_report_generated",
      entityTable: "weekly_reports",
      entityId: row.id,
      toState: `version ${version}`,
      context: {
        report_on: on,
        version,
        supersedes_id: supersedesId,
        metric_definition_version: METRIC_DEFINITION_VERSION,
        window_from: content.window.from,
        window_to: content.window.to,
      },
    });

    return { id: row.id, version, supersedesId, reportOn: on };
  });
}

// ---------------------------------------------------------------------------
// Reading a stored snapshot — UX-81 and UX-82
// ---------------------------------------------------------------------------

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

const STORED_COLUMNS = `w.id,
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
       ) as is_superseded`;

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
 * The current version for a reporting date, or `null` when none was ever
 * generated — which is UX-83, and is an absence of a snapshot rather than an
 * all-clear.
 *
 * "Current" is the highest version, and superseded-ness is derived from a later
 * row pointing at this one. Neither is stored, because `weekly_reports` has no
 * status column on purpose: a status column would need an update, and the table
 * is insert-only so that a published report cannot be rewritten.
 */
export async function readCurrentReport(reportOn: string): Promise<StoredReport | null> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `select ${STORED_COLUMNS}
         from public.weekly_reports w
         left join public.people p on p.id = w.generated_by_person_id
        where w.season_id = $1 and w.report_on = $2::date
        order by w.version desc
        limit 1`,
      [season.id, on],
    );
    const row = result.rows[0];
    return row ? toStoredReport(row) : null;
  });
}

/** Every version for a reporting date, newest first. UX-82. */
export async function listReportVersions(reportOn: string): Promise<StoredReport[]> {
  const on = normaliseReportDate(reportOn);
  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    const result = await tx.query<StoredRow>(
      `select ${STORED_COLUMNS}
         from public.weekly_reports w
         left join public.people p on p.id = w.generated_by_person_id
        where w.season_id = $1 and w.report_on = $2::date
        order by w.version desc`,
      [season.id, on],
    );
    return result.rows.map(toStoredReport);
  });
}

/** One stored snapshot by id, or `NotFound`. Reads; never recomputes. */
export async function readStoredReport(id: string): Promise<StoredReport> {
  return withTransaction(async (tx) => {
    const result = await tx.query<StoredRow>(
      `select ${STORED_COLUMNS}
         from public.weekly_reports w
         left join public.people p on p.id = w.generated_by_person_id
        where w.id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new NotFound(REPORT_NOT_FOUND_MESSAGE, { rule: "weekly_report_not_found" });
    return toStoredReport(row);
  });
}

/**
 * Narrows a stored snapshot's content, or returns `null`.
 *
 * `null` is not a failure. `weekly_reports` deliberately stores whatever the
 * metric definitions of that version produced — the synthetic seed contains two
 * snapshots under `master-table-v1`, whose shape this issue never wrote — and a
 * reader that threw on one would make an immutable record unreadable, which is
 * the opposite of what M5 is for. The interface renders what it recognises and
 * says plainly when a snapshot predates the current definitions.
 */
export function parseReportContent(content: unknown): WeeklyReportContent | null {
  if (typeof content !== "object" || content === null) return null;
  const candidate = content as Partial<WeeklyReportContent>;
  if (candidate.schema !== REPORT_CONTENT_SCHEMA) return null;
  if (!Array.isArray(candidate.exceptions)) return null;
  if (typeof candidate.reportOn !== "string") return null;
  return candidate as WeeklyReportContent;
}
