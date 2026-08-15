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
 * **at most once per calendar day** per reporting date: the first look files a
 * snapshot, every later look that day returns the same stored row, and
 * tomorrow's look files the next version. Nobody presses anything, the table
 * does not fill with near-identical rows, and "what did leadership see on the
 * 12th?" still has one answer per day.
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
 * `LAN-81.2` rather than `.1` because the 15 August review changed what the
 * report *is*, not merely how it looks: the same five views now produce two
 * action lists instead of six counted categories, and a row written under `.1`
 * does not answer the same question. That is exactly what versioning the
 * definitions is for — the older snapshots stay readable and stay honest about
 * which set produced them.
 *
 * It is **not** the sixteen definitions recovered from the Master Table; the
 * issue puts those out of scope.
 */
export const METRIC_DEFINITION_VERSION = "LAN-81.2";

/** The shape of `content`, so a reader can tell a snapshot it understands. */
export const REPORT_CONTENT_SCHEMA = "lancers.monday-report.v2";

/**
 * The reporting window: the seven days ending the day before the reporting
 * date.
 *
 * Brian's decision of 15 August 2026, chosen over "since the last report" and
 * "three days either side". A Monday report covers the Monday-to-Sunday just
 * gone. The window is printed on the report and stored in the snapshot, so no
 * reader has to infer it and a later change to it is visible in old reports
 * rather than retroactive.
 */
export const REPORT_WINDOW_DAYS = 7;

export const REPORT_DATE_INVALID_MESSAGE = "Choose a reporting date in the form YYYY-MM-DD.";

export const REPORT_NOT_FOUND_MESSAGE = "That report does not exist.";

// ---------------------------------------------------------------------------
// The stored content
// ---------------------------------------------------------------------------

/**
 * Why somebody is on the chase list. Stored rather than rendered from a
 * category, so the reason survives in the snapshot exactly as the report made
 * it.
 */
export const CHASE_KINDS = Object.freeze([
  "no_answer",
  "said_no",
  "said_yes_absent",
  "said_no_attended",
  "missing_from_register",
] as const);

export type ChaseKind = (typeof CHASE_KINDS)[number];

export const FIX_KINDS = Object.freeze([
  "register_not_taken",
  "approved_never_invited",
  "walk_up_unreconciled",
] as const);

export type FixKind = (typeof FIX_KINDS)[number];

/** One person to contact, and what about. */
export interface ChaseItem {
  kind: ChaseKind;
  /** Already resolved to a display name. */
  person: string;
  /** What to say to them, in the club's words. */
  what: string;
  event: string;
  /** `YYYY-MM-DD`. */
  on: string | null;
  isMandatory: boolean;
  /**
   * The reason they gave for not attending, where there is one. The most
   * sensitive line in the slice, shown to the operator group only.
   */
  reason: string | null;
}

/** One thing for an operator to correct. Not a person to contact. */
export interface FixItem {
  kind: FixKind;
  event: string;
  on: string | null;
  what: string;
  /** Named where the defect is about somebody, as with an uninvited invitee. */
  person: string | null;
}

/** A member with a required onboarding item still outstanding. */
export interface OnboardingItem {
  person: string;
  membershipStatus: string;
  outstanding: string;
}

export interface EventInWindow {
  id: string;
  name: string;
  eventType: string;
  status: string;
  on: string | null;
  solicitsResponse: boolean;
  isMandatory: boolean;
  invited: number;
  recorded: number;
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
  /** The lead. People to contact, most recent event first. */
  chase: ChaseItem[];
  /** The second list. Operator corrections, most recent event first. */
  fix: FixItem[];
  /** The third block. Not about the week, so not mixed into the two above. */
  onboarding: OnboardingItem[];
  /**
   * Everything below here is stored because `slice-ux.md` § 10 requires the
   * snapshot to carry it, and shown compactly because it is not what the
   * operator opens the report to do.
   */
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

/**
 * How urgent each kind of chase is, when two sit on the same event.
 *
 * Brian chose "soonest event first" on 15 August, and the window looks
 * backwards, so the event ordering is most-recent-first: last night's practice
 * above last Tuesday's. This breaks the remaining ties, worst first — somebody
 * who said they were coming and was marked absent is a conversation, and
 * somebody who declined with a reason is an acknowledgement.
 */
const CHASE_SEVERITY: Readonly<Record<ChaseKind, number>> = Object.freeze({
  said_yes_absent: 0,
  missing_from_register: 1,
  no_answer: 2,
  said_no_attended: 3,
  said_no: 4,
});

const CHASE_WORDS: Readonly<Record<ChaseKind, string>> = Object.freeze({
  no_answer: "Never answered",
  said_no: "Not attending",
  said_yes_absent: "Said yes, marked absent",
  said_no_attended: "Said no, turned up",
  missing_from_register: "Said yes, not on the register",
});

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

interface NonresponseRow {
  event_id: string;
  event_name: string;
  scheduled_on: Date | string | null;
  display_name: string | null;
}

interface NotAttendingRow {
  event_id: string;
  event_name: string;
  scheduled_on: Date | string | null;
  reason: string | null;
  display_name: string | null;
}

interface MismatchRow {
  event_id: string;
  event_name: string;
  scheduled_on: Date | string | null;
  mismatch: string | null;
  display_name: string | null;
}

interface OnboardingRow {
  display_name: string | null;
  membership_status: string;
  outstanding: string;
}

interface UninvitedRow {
  event_id: string;
  event_name: string;
  scheduled_on: Date | string | null;
  display_name: string | null;
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
 * Read-only by construction: there is no insert, update or delete in it.
 */
export async function computeReportContent(
  tx: Tx,
  season: Season,
  reportOn: string,
): Promise<WeeklyReportContent> {
  const { from, to } = reportWindow(reportOn);
  const scope = [season.id, from, to];

  // The window's events, each with the two counts the lists below need: how
  // many people were asked, and whether anybody took the register at all.
  const events = await tx.query<EventRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.solicits_response, e.is_mandatory,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.attendance_records a where a.event_id = e.id) as recorded
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      order by e.scheduled_on desc, e.name`,
    scope,
  );

  const eventById = new Map(events.rows.map((row) => [row.id, row]));
  const mandatory = (eventId: string) => eventById.get(eventId)?.is_mandatory ?? false;

  // Requirement 6's escalation queue, for the window's events only. An audience
  // member who was never invited is deliberately NOT here: they were not asked,
  // so there is nothing to chase, and they are an approval defect below.
  const nonresponses = await tx.query<NonresponseRow>(
    `select q.event_id, q.event_name, q.scheduled_on, ${DISPLAY_NAME} as display_name
       from public.nonresponse_queue q
       left join public.season_memberships m on m.id = q.season_membership_id
       left join public.people p on p.id = coalesce(q.person_id, m.person_id)
      where q.season_id = $1
        and q.scheduled_on between $2::date and $3::date`,
    scope,
  );

  // From invariant P7's partition, which already excludes non-soliciting
  // events — invariant E6, and the reason an AGM never reaches this list.
  const notAttending = await tx.query<NotAttendingRow>(
    `select s.event_id, e.name as event_name, e.scheduled_on, s.reason,
            ${DISPLAY_NAME} as display_name
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
       left join public.season_memberships m on m.id = s.season_membership_id
       left join public.people p on p.id = coalesce(s.person_id, m.person_id)
      where s.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and s.response_state = 'responded_no'`,
    scope,
  );

  // Computed by the view, surfaced here, and never reconciled by either.
  const mismatches = await tx.query<MismatchRow>(
    `select x.event_id, x.event_name, x.scheduled_on, x.mismatch,
            ${DISPLAY_NAME} as display_name
       from public.rsvp_attendance_mismatches x
       left join public.season_memberships m on m.id = x.season_membership_id
       left join public.people p on p.id = coalesce(x.person_id, m.person_id)
      where x.season_id = $1
        and x.scheduled_on between $2::date and $3::date`,
    scope,
  );

  // The approval defect: somebody the approver confirmed who was never asked.
  const uninvited = await tx.query<UninvitedRow>(
    `select u.event_id, u.event_name, u.scheduled_on, ${DISPLAY_NAME} as display_name
       from public.uninvited_audience_members u
       left join public.season_memberships m on m.id = u.season_membership_id
       left join public.people p on p.id = coalesce(u.person_id, m.person_id)
      where u.season_id = $1
        and u.scheduled_on between $2::date and $3::date`,
    scope,
  );

  // Not scoped to the window: an outstanding required item is a standing
  // exception rather than something that happened last week, which is why
  // Brian put it in its own block rather than in the chase list.
  const onboarding = await tx.query<OnboardingRow>(
    `select ${DISPLAY_NAME} as display_name,
            m.status::text as membership_status,
            string_agg(t.label, ', ' order by t.sort_order) as outstanding
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

  const breakdown = await tx.query<BreakdownRow>(
    `select s.event_id, e.name as event_name, e.scheduled_on, s.response_state,
            count(*)::int as tally
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
      where s.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      group by s.event_id, e.name, e.scheduled_on, s.response_state`,
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

  // -------------------------------------------------------------------------
  // Chase these people
  // -------------------------------------------------------------------------

  const chase: ChaseItem[] = [];

  const push = (
    kind: ChaseKind,
    row: { event_id: string; event_name: string; scheduled_on: Date | string | null },
    person: string | null,
    reason: string | null = null,
  ) => {
    chase.push({
      kind,
      person: person ?? "Unnamed member",
      what: CHASE_WORDS[kind],
      event: row.event_name,
      on: asDate(row.scheduled_on),
      isMandatory: mandatory(row.event_id),
      reason,
    });
  };

  for (const row of nonresponses.rows) push("no_answer", row, row.display_name);
  for (const row of notAttending.rows) {
    const reason = (row.reason ?? "").trim();
    push("said_no", row, row.display_name, reason === "" ? null : reason);
  }

  for (const row of mismatches.rows) {
    if (row.mismatch === "said_yes_marked_absent") {
      push("said_yes_absent", row, row.display_name);
    } else if (row.mismatch === "said_no_but_attended") {
      push("said_no_attended", row, row.display_name);
    } else if (row.mismatch === "said_yes_no_attendance_recorded") {
      // Only when somebody *did* take the register and this person is missing
      // from it. Where the register was never taken at all, every invitee
      // matches this classification and the club's problem is one uncompleted
      // register rather than twenty-four people to ring — so it belongs in the
      // fix list below, once, and these rows are deliberately dropped.
      //
      // This is the single largest reason the first build read as noise: the
      // seeded season produced 163 of these for one week, and none of them was
      // a person anybody should have contacted.
      if ((eventById.get(row.event_id)?.recorded ?? 0) > 0) {
        push("missing_from_register", row, row.display_name);
      }
    }
  }

  // Most recent event first — Brian's "soonest event first", read inside a
  // window that only looks backwards. A mandatory event outranks an optional
  // one on the same day, and `CHASE_SEVERITY` breaks what is left.
  chase.sort((left, right) => {
    if (left.on !== right.on) return (right.on ?? "").localeCompare(left.on ?? "");
    if (left.isMandatory !== right.isMandatory) return left.isMandatory ? -1 : 1;
    if (left.kind !== right.kind) return CHASE_SEVERITY[left.kind] - CHASE_SEVERITY[right.kind];
    return left.person.localeCompare(right.person);
  });

  // -------------------------------------------------------------------------
  // Fix these things
  // -------------------------------------------------------------------------

  const fix: FixItem[] = [];

  for (const row of events.rows) {
    if (row.status !== "occurred" || row.recorded > 0) continue;
    fix.push({
      kind: "register_not_taken",
      event: row.name,
      on: asDate(row.scheduled_on),
      what: `Register never taken — ${plural(row.invited, "person was asked", "people were asked")}`,
      person: null,
    });
  }

  for (const row of uninvited.rows) {
    fix.push({
      kind: "approved_never_invited",
      event: row.event_name,
      on: asDate(row.scheduled_on),
      what: "Approved for this event and never invited",
      person: row.display_name,
    });
  }

  for (const row of mismatches.rows) {
    if (row.mismatch !== "attended_without_invitation") continue;
    fix.push({
      kind: "walk_up_unreconciled",
      event: row.event_name,
      on: asDate(row.scheduled_on),
      what: "Turned up without an invitation — still to be reconciled",
      person: row.display_name,
    });
  }

  fix.sort((left, right) => {
    if (left.on !== right.on) return (right.on ?? "").localeCompare(left.on ?? "");
    return left.what.localeCompare(right.what);
  });

  // -------------------------------------------------------------------------
  // The rest, stored because § 10 requires it
  // -------------------------------------------------------------------------

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
    chase,
    fix,
    onboarding: onboarding.rows.map((row) => ({
      person: row.display_name ?? "Unnamed member",
      membershipStatus: row.membership_status,
      outstanding: row.outstanding,
    })),
    events: events.rows.map((row) => ({
      id: row.id,
      name: row.name,
      eventType: row.event_type,
      status: row.status,
      on: asDate(row.scheduled_on),
      solicitsResponse: row.solicits_response,
      isMandatory: row.is_mandatory,
      invited: row.invited,
      recorded: row.recorded,
    })),
    responseBreakdown: [...byEvent.values()],
    attendance: {
      present: presenceOf("present"),
      late: presenceOf("late"),
      excused: presenceOf("excused"),
      absent: presenceOf("absent"),
      eventsWithNoRegister: fix.filter((item) => item.kind === "register_not_taken").length,
    },
    availability: {
      green: availabilityOf("green"),
      orange: availabilityOf("orange"),
      red: availabilityOf("red"),
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
      window_from: content.window.from,
      window_to: content.window.to,
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
 * The report for a date: today's snapshot, filing one first if today has not
 * produced one yet.
 *
 * ## Why a read files a row
 *
 * Brian's decision of 15 August 2026. He should "just have a report for the day
 * of, and that's it" — no Preview, no Generate, no version list — and invariant
 * M5 still requires the thing he read to be a snapshot rather than a live
 * query. Filing on first sight of the day is what satisfies both: he presses
 * nothing, the screen renders stored content, and the table gains at most one
 * row per reporting date per day instead of one per page view.
 *
 * The consequence, stated plainly because it is unusual: **this read writes.**
 * It is guarded by `leadership_report` at every entry point, it is idempotent
 * within the day, and the advisory lock makes two simultaneous first-looks
 * produce one row rather than two. It writes nothing else, ever.
 *
 * "Today" is the club's day, in `Europe/London`, because the report belongs to
 * a Monday morning in Oxford rather than to a UTC boundary at 01:00.
 *
 * ## And only today's snapshot *under the current definitions*
 *
 * The reuse is additionally conditioned on `metric_definition_version`, which
 * looks like belt and braces and is not. Brian opened the report on the morning
 * the definitions changed and got an empty screen: a snapshot filed hours
 * earlier under the previous set was still "today's", so it was handed back, and
 * the current build does not understand its shape — so the page correctly
 * reported that it could not organise it, and correctly showed nothing.
 *
 * Without this term that happens on every definitions change, to whoever opened
 * the report first that day, for the rest of that day. With it, a snapshot from
 * an older set is left exactly where it is — still immutable, still readable as
 * the record of what leadership saw — and a new version is filed under the
 * definitions now in force.
 */
export async function readReportForDate(
  actorPersonId: string,
  reportOn: string,
): Promise<StoredReport> {
  const on = normaliseReportDate(reportOn);

  return withTransaction(async (tx) => {
    const season = await readCurrentSeasonIn(tx);
    await tx.query(SERIES_LOCK, [season.id, on]);

    const filedToday = await tx.query<StoredRow>(
      `${STORED_SELECT(
        `w.season_id = $1
           and w.report_on = $2::date
           and w.metric_definition_version = $3
           and (w.generated_at at time zone 'Europe/London')::date
                 = (now() at time zone 'Europe/London')::date`,
      )}
       order by w.version desc
       limit 1`,
      [season.id, on, METRIC_DEFINITION_VERSION],
    );

    if (filedToday.rows[0]) return toStoredReport(filedToday.rows[0]);

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
  if (!Array.isArray(candidate.chase) || !Array.isArray(candidate.fix)) return null;
  if (typeof candidate.reportOn !== "string") return null;
  return candidate as WeeklyReportContent;
}
