import type { Tx } from "@/lib/db";
import type { Season } from "../seasons";
import {
  DISPLAY_NAME,
  METRIC_DEFINITION_VERSION,
  REPORT_CONTENT_SCHEMA,
  asDate,
  reportWindow,
  lookaheadWindow,
} from "./shared";
import type {
  EventOutcome,
  GridCell,
  GridColumn,
  GridRow,
  OnboardingColumn,
  OnboardingRow,
  WeeklyReportContent,
} from "./shared";

/** Composes the report from the season's views. Read-only: LAN-151 moved the one derived exception (walk-ups) here directly. */

interface EventRow {
  id: string;
  name: string;
  event_type: string;
  status: string;
  scheduled_on: Date | string | null;
  occurred: boolean;
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

/** Everything the report says, for one season, the week just gone and the week ahead. Read-only by construction. */
export async function computeReportContent(
  tx: Tx,
  season: Season,
  reportOn: string,
): Promise<WeeklyReportContent> {
  const lookBack = reportWindow(reportOn);
  const lookAhead = lookaheadWindow(reportOn);
  const back = [season.id, lookBack.from, lookBack.to];

  const events = await tx.query<EventRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.is_mandatory,
            -- D30: the event is approved and its date has passed. Nothing
            -- asserts it.
            --
            -- Judged against the REPORTING DATE rather than against the clock,
            -- which matters and is not a shortcut. A Monday report is about the
            -- week before its own date; regenerating January's report in March
            -- must produce January's answer, and asking the clock would make an
            -- immutable snapshot depend on when somebody happened to ask.
            (e.status = 'approved'
              and e.scheduled_on is not null
              and e.scheduled_on < $4::date) as occurred,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.attendance_records a where a.event_id = e.id) as recorded
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      order by e.scheduled_on, e.name`,
    [...back, reportOn],
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

  // Requirement 6's escalation queue: this view is the club's own definition of "asked and not answered".
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

  // Walk-up: attendance with no invitation behind it (invariant P6), stated directly (not the view — LAN-151, occurrence must key off reportOn, not now()).
  const walkUpRows = await tx.query<PersonEventRow>(
    `select a.event_id, ${DISPLAY_NAME} as display_name, null::text as reason
       from public.attendance_records a
       join public.events e on e.id = a.event_id
       left join public.season_memberships m on m.id = a.season_membership_id
       left join public.people p on p.id = coalesce(a.person_id, m.person_id)
      where a.season_id = $1
        and e.scheduled_on between $2::date and $3::date
        and not exists (
          select 1 from public.invitations i
           where i.event_id = a.event_id
             and coalesce(i.season_membership_id, i.person_id)
                   = coalesce(a.season_membership_id, a.person_id))`,
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
      occurred: row.occurred,
      isMandatory: row.is_mandatory,
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

  // One row per person per event: what they said, and what they did — two values, not one verdict.
  // Paired via coalesce(season_membership_id, person_id) on both sides (invariant P8).
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
      -- Deterministic, because a snapshot is immutable and has to be
      -- reproducible. A person can hold two invitations to one event, and
      -- without an order the database may return them either way round, which
      -- decides whose reason is kept — so the same data could be filed two
      -- different ways. The invitation id is arbitrary and stable, which is
      -- exactly what is wanted here: nothing about the order should mean
      -- anything.
      order by i.event_id, i.id`,
    back,
  );

  // Every event in the window is a column (D23 removed "Response requested").
  const columns: GridColumn[] = events.rows.map((row) => ({
    eventId: row.id,
    label: columnLabel(row.name),
    on: asDate(row.scheduled_on),
  }));

  const columnIds = new Set(columns.map((column) => column.eventId));
  const registerTakenFor = (eventId: string) =>
    lastWeek.find((entry) => entry.id === eventId)?.registerTaken ?? false;

  // Disagreement: never answered, said no, or said yes and was not present. Excludes a yes with an untaken register.
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

    // One cell per name per event, disagreement wins — display name is not a join key (LAN-294), so a merge here still matters.
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
    // Only people something went wrong for.
    .filter((row) => row.problems > 0)
    .sort(
      (left, right) => right.problems - left.problems || left.person.localeCompare(right.person),
    );

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

  const upcoming = await tx.query<UpcomingRow>(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.is_mandatory,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.invitations i
              join public.current_rsvp r on r.invitation_id = i.id
             where i.event_id = e.id) as answered
       from public.events e
      where e.season_id = $1
        and e.scheduled_on between $2::date and $3::date
      order by e.scheduled_on, e.name`,
    [season.id, lookAhead.from, lookAhead.to],
  );

  const walkUps = walkUpRows.rows.map((row) => {
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

  // Every onboarding item, not only the required ones — Subscription paid never gates activation but still belongs here.
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
      // Not applicable is excluded from the denominator too.
      applicable: entry.cells.filter((cell) => cell.status !== "not_applicable").length,
    }))
    // Only members with something outstanding.
    .filter((entry) => entry.outstanding > 0)
    .sort(
      (left, right) =>
        right.outstanding / Math.max(right.applicable, 1) -
          left.outstanding / Math.max(left.applicable, 1) ||
        right.outstanding - left.outstanding ||
        left.person.localeCompare(right.person),
    );

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
      eventsWithNoRegister: lastWeek.filter((entry) => entry.occurred && !entry.registerTaken)
        .length,
    },
    availabilityCounts: {
      green: levelOf("green"),
      orange: levelOf("orange"),
      red: levelOf("red"),
    },
  };
}
