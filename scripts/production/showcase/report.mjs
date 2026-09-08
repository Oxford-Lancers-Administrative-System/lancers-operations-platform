/**
 * The persisted weekly report — LAN-221.
 *
 * `weekly_reports.content` is what the report page renders, verbatim, and it
 * has to agree with the pages it summarises. So it is not invented by the plan:
 * this module runs the **same queries** `computeReportContent` in
 * `src/lib/services/weekly-report.ts` runs — transcribed, because a plain
 * Node script cannot import TypeScript — against the loaded target, and files
 * the result as version 1 and a version 2 that supersedes it, exactly as
 * pressing **Show report** twice would. `verify` recomputes and compares.
 *
 * Keep the SQL here in step with the service. `tests/showcase-loader.test.ts`
 * compares this output to `computeReportContent`'s on the same data.
 */

import { id } from "./ids.mjs";

export const METRIC_DEFINITION_VERSION = "LAN-81.5";
export const REPORT_CONTENT_SCHEMA = "lancers.monday-report.v5";
const REPORT_WINDOW_DAYS = 7;
const REPORT_LOOKAHEAD_DAYS = 7;

const DISPLAY_NAME = (alias) => `case
  when ${alias}.id is null then null
  when ${alias}.family_name is null
    then coalesce(nullif(btrim((select da.alias from public.person_aliases da where da.person_id = ${alias}.id and da.is_display_name limit 1)), ''), ${alias}.given_name)
  else coalesce(nullif(btrim((select da.alias from public.person_aliases da where da.person_id = ${alias}.id and da.is_display_name limit 1)), ''), ${alias}.given_name)
       || ' ' || ${alias}.family_name
end`;

function asDate(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const dayOfMonth = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

function shiftUtc(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function reportWindow(reportOn) {
  return { from: shiftUtc(reportOn, -REPORT_WINDOW_DAYS), to: shiftUtc(reportOn, -1) };
}

export function lookaheadWindow(reportOn) {
  return { from: reportOn, to: shiftUtc(reportOn, REPORT_LOOKAHEAD_DAYS) };
}

function columnLabel(name) {
  const head = name.split(/\s+[—-]\s+/)[0].trim();
  return head.length > 18 ? `${head.slice(0, 17)}…` : head;
}

/** A transcription of `computeReportContent`, query for query. */
export async function computeReportContent(client, season, reportOn) {
  const lookBack = reportWindow(reportOn);
  const lookAhead = lookaheadWindow(reportOn);
  const back = [season.id, lookBack.from, lookBack.to];
  const P = DISPLAY_NAME("p");

  const events = await client.query(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status,
            e.scheduled_on, e.is_mandatory,
            (e.status = 'approved' and e.scheduled_on is not null and e.scheduled_on < $4::date) as occurred,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.attendance_records a where a.event_id = e.id) as recorded
       from public.events e
      where e.season_id = $1 and e.scheduled_on between $2::date and $3::date
      order by e.scheduled_on, e.name`,
    [...back, reportOn],
  );
  const breakdown = await client.query(
    `select s.event_id, s.response_state, count(*)::int as tally
       from public.invitation_response_state s
       join public.events e on e.id = s.event_id
      where s.season_id = $1 and e.scheduled_on between $2::date and $3::date
      group by s.event_id, s.response_state`,
    back,
  );
  const silent = await client.query(
    `select q.event_id, count(*)::int as tally
       from public.nonresponse_queue q
      where q.season_id = $1 and q.scheduled_on between $2::date and $3::date
      group by q.event_id`,
    back,
  );
  const presence = await client.query(
    `select a.event_id, a.presence::text as presence, count(*)::int as tally
       from public.attendance_records a
       join public.events e on e.id = a.event_id
      where a.season_id = $1 and e.scheduled_on between $2::date and $3::date
      group by a.event_id, a.presence`,
    back,
  );
  const walkUpRows = await client.query(
    `select a.event_id, ${P} as display_name, null::text as reason
       from public.attendance_records a
       join public.events e on e.id = a.event_id
       left join public.season_memberships m on m.id = a.season_membership_id
       left join public.people p on p.id = coalesce(a.person_id, m.person_id)
      where a.season_id = $1 and e.scheduled_on between $2::date and $3::date
        and not exists (
          select 1 from public.invitations i
           where i.event_id = a.event_id
             and coalesce(i.season_membership_id, i.person_id) = coalesce(a.season_membership_id, a.person_id))`,
    back,
  );
  const neverInvited = await client.query(
    `select u.event_id, ${P} as display_name, null::text as reason
       from public.uninvited_audience_members u
       left join public.season_memberships m on m.id = u.season_membership_id
       left join public.people p on p.id = coalesce(u.person_id, m.person_id)
      where u.season_id = $1 and u.scheduled_on between $2::date and $3::date`,
    back,
  );

  const tally = (rows, eventId) => rows.filter((row) => row.event_id === eventId).length;
  const stateOf = (eventId, state) =>
    breakdown.rows.find((row) => row.event_id === eventId && row.response_state === state)?.tally ??
    0;
  const presenceOf = (eventId, value) =>
    presence.rows.find((row) => row.event_id === eventId && row.presence === value)?.tally ?? 0;

  const lastWeek = events.rows.map((row) => {
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
      turnoutPercent:
        registerTaken && row.invited > 0
          ? Math.round(((present + late) / row.invited) * 100)
          : null,
      registerTaken,
      walkUps: tally(walkUpRows.rows, row.id),
      neverInvited: tally(neverInvited.rows, row.id),
    };
  });

  const said = await client.query(
    `select i.event_id, ${P} as display_name, r.response::text as rsvp, a.presence::text as attendance, r.reason
       from public.invitations i
       join public.events e on e.id = i.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       left join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join public.current_rsvp r on r.invitation_id = i.id
       left join public.attendance_records a
         on a.event_id = i.event_id
        and coalesce(a.season_membership_id, a.person_id) = coalesce(i.season_membership_id, i.person_id)
      where e.season_id = $1 and e.scheduled_on between $2::date and $3::date
      order by i.event_id, i.id`,
    back,
  );
  const columns = events.rows.map((row) => ({
    eventId: row.id,
    label: columnLabel(row.name),
    on: asDate(row.scheduled_on),
  }));
  const columnIds = new Set(columns.map((column) => column.eventId));
  const registerTakenFor = (eventId) =>
    lastWeek.find((entry) => entry.id === eventId)?.registerTaken ?? false;
  const disagrees = (cell) => {
    if (cell.rsvp === null) return true;
    if (cell.rsvp === "no") return true;
    if (cell.rsvp !== "yes") return false;
    if (cell.attendance === "present") return false;
    if (cell.attendance === null && !registerTakenFor(cell.eventId)) return false;
    return true;
  };
  const cellsByPerson = new Map();
  for (const row of said.rows) {
    if (!row.display_name || !columnIds.has(row.event_id)) continue;
    const reason = (row.reason ?? "").trim();
    const cell = {
      eventId: row.event_id,
      rsvp: row.rsvp,
      attendance: row.attendance,
      reason: reason === "" ? null : reason,
      isDiscrepancy: false,
    };
    cell.isDiscrepancy = disagrees(cell);
    const cells = cellsByPerson.get(row.display_name) ?? [];
    const existing = cells.find((entry) => entry.eventId === cell.eventId);
    if (!existing) cells.push(cell);
    else if (cell.isDiscrepancy && !existing.isDiscrepancy) Object.assign(existing, cell);
    else if (cell.isDiscrepancy && existing.isDiscrepancy && existing.reason === null)
      existing.reason = cell.reason;
    cellsByPerson.set(row.display_name, cells);
  }
  const order = new Map(columns.map((column, at) => [column.eventId, at]));
  const rows = [...cellsByPerson.entries()]
    .map(([person, cells]) => ({
      person,
      cells: cells.sort(
        (left, right) => (order.get(left.eventId) ?? 0) - (order.get(right.eventId) ?? 0),
      ),
      problems: cells.filter((cell) => cell.isDiscrepancy).length,
    }))
    .filter((row) => row.problems > 0)
    .sort(
      (left, right) => right.problems - left.problems || left.person.localeCompare(right.person),
    );

  const availabilityRows = await client.query(
    `select ${P} as display_name, a.level::text as level, a.effective_from, a.review_on
       from public.current_availability a
       join public.season_memberships m on m.id = a.season_membership_id
       join public.people p on p.id = m.person_id
      where a.season_id = $1 and a.level <> 'green'
      order by a.effective_from desc, display_name`,
    [season.id],
  );
  const upcoming = await client.query(
    `select e.id, e.name, e.event_type::text as event_type, e.status::text as status, e.scheduled_on, e.is_mandatory,
            (select count(*)::int from public.invitations i where i.event_id = e.id) as invited,
            (select count(*)::int from public.invitations i join public.current_rsvp r on r.invitation_id = i.id where i.event_id = e.id) as answered
       from public.events e
      where e.season_id = $1 and e.scheduled_on between $2::date and $3::date
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
  const recruitment = await client.query(
    `select ${P} as display_name, r.status::text as status, r.source, r.first_contact_on
       from public.recruitment_prospects r
       join public.people p on p.id = r.person_id
      where r.season_id = $1 and r.converted_membership_id is null
      order by r.first_contact_on desc nulls last, display_name`,
    [season.id],
  );
  const onboardingItems = await client.query(
    `select t.code, t.label, t.sort_order, oi.status::text as status, ${P} as display_name, m.status::text as membership_status
       from public.onboarding_items oi
       join public.onboarding_item_types t on t.id = oi.item_type_id
       join public.season_memberships m on m.id = oi.season_membership_id
       join public.people p on p.id = m.person_id
      where m.season_id = $1 and m.status in ('onboarding', 'active')
      order by t.sort_order`,
    [season.id],
  );
  const onboardingColumns = [];
  for (const row of onboardingItems.rows) {
    if (!onboardingColumns.some((column) => column.code === row.code))
      onboardingColumns.push({ code: row.code, label: row.label });
  }
  const settled = new Set(["complete", "waived", "not_applicable"]);
  const onboardingByPerson = new Map();
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
      applicable: entry.cells.filter((cell) => cell.status !== "not_applicable").length,
    }))
    .filter((entry) => entry.outstanding > 0)
    .sort(
      (left, right) =>
        right.outstanding / Math.max(right.applicable, 1) -
          left.outstanding / Math.max(left.applicable, 1) ||
        right.outstanding - left.outstanding ||
        left.person.localeCompare(right.person),
    );
  const availabilityCounts = await client.query(
    `select level::text as key, count(*)::int as tally from public.current_availability where season_id = $1 group by level`,
    [season.id],
  );
  const levelOf = (key) => availabilityCounts.rows.find((row) => row.key === key)?.tally ?? 0;
  const sum = (value) => lastWeek.reduce((total, entry) => total + value(entry), 0);

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
    availabilityCounts: { green: levelOf("green"), orange: levelOf("orange"), red: levelOf("red") },
  };
}

/** The identifiers the report phase owns, so verify and rollback can name them. */
export function reportIds(plan) {
  const { labels, anchor, seasonId } = plan.context;
  return {
    v1: id("weekly_reports", labels.currentSeason, anchor, "1"),
    v2: id("weekly_reports", labels.currentSeason, anchor, "2"),
    audit: id("audit_events", `weekly_report_generated:${anchor}`),
    followUps: FOLLOW_UPS.map((entry) =>
      id("follow_up_actions", labels.currentSeason, anchor, entry.category, entry.status),
    ),
    followUpsOpen: FOLLOW_UPS.filter((entry) => ["open", "in_progress"].includes(entry.status)).map(
      (entry) =>
        id("follow_up_actions", labels.currentSeason, anchor, entry.category, entry.status),
    ),
    followUpsClosed: FOLLOW_UPS.filter((entry) =>
      ["resolved", "cancelled"].includes(entry.status),
    ).map((entry) =>
      id("follow_up_actions", labels.currentSeason, anchor, entry.category, entry.status),
    ),
    seasonId,
  };
}

const FOLLOW_UPS = Object.freeze([
  {
    category: "nonresponse",
    description: "Chase the players who have not answered Sunday's session.",
    status: "open",
    due: 3,
  },
  {
    category: "availability",
    description: "Decide whether the red-flagged players travel to the away fixture.",
    status: "in_progress",
    due: 5,
  },
  {
    category: "rsvp_attendance_mismatch",
    description: "Reconcile the players who said yes and were not marked present.",
    status: "resolved",
    due: -2,
    resolution: "All four spoken to at training.",
  },
  {
    category: "subscription",
    description: "Follow up unpaid subscriptions before the end of term.",
    status: "open",
    due: 14,
  },
  {
    category: "onboarding",
    description: "Nudge the three players with kit still outstanding.",
    status: "cancelled",
    due: -1,
    resolution: "Kit arrived; nothing to chase.",
  },
  {
    category: "kit_return",
    description: "Collect kit from the two members who departed.",
    status: "open",
    due: 10,
  },
]);

/**
 * Files version 1 and version 2 of the anchor's report from live data, and
 * the follow-ups hanging off it. Idempotent: `weekly_reports` is append-only,
 * so a second run leaves the filed versions as they are.
 */
export async function fileReport(client, plan, { actorPersonId }) {
  const ids = reportIds(plan);
  const { anchor, labels } = plan.context;
  const season = { id: ids.seasonId, label: labels.currentSeason };
  const content = await computeReportContent(client, season, anchor);

  const insertReport = async (reportId, version, supersedesId, dataAsOf) => {
    const result = await client.query(
      `insert into public.weekly_reports
         (id, season_id, report_on, version, supersedes_id, metric_definition_version, data_as_of, generated_at, generated_by_person_id, content)
       values ($1, $2, $3::date, $4, $5, $6, $7::timestamptz, $7::timestamptz, $8, $9::jsonb)
       on conflict (id) do nothing
       returning id`,
      [
        reportId,
        season.id,
        anchor,
        version,
        supersedesId,
        METRIC_DEFINITION_VERSION,
        dataAsOf,
        actorPersonId,
        JSON.stringify(content),
      ],
    );
    return result.rowCount;
  };
  let created = 0;
  created += await insertReport(ids.v1, 1, null, `${anchor}T07:00:00Z`);
  created += await insertReport(ids.v2, 2, ids.v1, `${anchor}T07:30:00Z`);

  await client.query(
    `insert into public.audit_events (id, actor_person_id, action, entity_table, entity_id, to_state, context)
     values ($1, $2, 'weekly_report_generated', 'weekly_reports', $3, 'version 2', $4::jsonb)
     on conflict (id) do nothing`,
    [
      ids.audit,
      actorPersonId,
      ids.v2,
      JSON.stringify({
        issue: "LAN-221",
        report_on: anchor,
        version: 2,
        supersedes_id: ids.v1,
        metric_definition_version: METRIC_DEFINITION_VERSION,
      }),
    ],
  );

  for (const [index, entry] of FOLLOW_UPS.entries()) {
    const dueOn = shiftUtc(anchor, entry.due);
    const closed = ["resolved", "cancelled"].includes(entry.status);
    const result = await client.query(
      `insert into public.follow_up_actions
         (id, season_id, weekly_report_id, category, description, status, owner_person_id, due_on, resolved_at, resolution_note)
       values ($1, $2, $3, $4::public.follow_up_category, $5, $6::public.follow_up_status, $7, $8::date, $9::timestamptz, $10)
       on conflict (id) do update set status = excluded.status, resolved_at = excluded.resolved_at, resolution_note = excluded.resolution_note
       returning (xmax = 0) as inserted`,
      [
        ids.followUps[index],
        season.id,
        ids.v2,
        entry.category,
        entry.description,
        entry.status,
        actorPersonId,
        dueOn,
        closed ? `${anchor}T07:35:00Z` : null,
        closed ? entry.resolution : null,
      ],
    );
    if (result.rows[0]?.inserted) created += 1;
  }

  return { created, content, ids };
}

/** Reads the stored version 2 back, for reconciliation. */
export async function readFiledReport(client, plan) {
  const ids = reportIds(plan);
  const result = await client.query(
    "select content, version from public.weekly_reports where id = $1",
    [ids.v2],
  );
  return result.rows[0] ?? null;
}
