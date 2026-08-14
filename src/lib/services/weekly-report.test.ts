// @vitest-environment node
/**
 * The Monday exception and action report — LAN-81.
 *
 * Against the **real** local database, because everything worth asserting here
 * is a property of PostgreSQL honouring the schema and of five views computing
 * what the club means: an insert-only table with no status column, a composite
 * foreign key that binds a supersession to its own season and date, a unique
 * index that permits one successor per predecessor, and invariant P7's
 * partition excluding non-soliciting events. A mocked transaction demonstrates
 * none of it, and a mocked view demonstrates less than none — it would assert
 * that this module reads the fixture the test wrote.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`, unique to this
 * file: Vitest runs suites in parallel against one database, and a shared
 * marker means one suite deleting another's fixtures mid-test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn } from "./event-audience";
import { createEventDraft, markEventOccurred, type EventDraftInput } from "./events";
import { recordAttendance, recordWalkUpAttendance } from "./attendance";
import { readCurrentSeason } from "./seasons";
import {
  computeReportContent,
  generateWeeklyReport,
  listReportVersions,
  METRIC_DEFINITION_VERSION,
  normaliseReportDate,
  parseReportContent,
  previewWeeklyReport,
  readCurrentReport,
  readStoredReport,
  REPORT_CONTENT_SCHEMA,
  reportWindow,
  type ExceptionKey,
  type WeeklyReportContent,
} from "./weekly-report";

const NAME_MARKER = "LAN81ReportSuite";

/**
 * A reporting date whose window contains this suite's events and **nothing
 * else**: the synthetic season has no event at all between 18 and 24 March
 * 2027, which is what lets a count assertion here be an equality rather than a
 * delta. `OUT_OF_WINDOW` and `OTHER_REPORT_ON` sit in the next such gap.
 */
const REPORT_ON = "2027-03-25";
const IN_WINDOW = "2027-03-20";
const OUT_OF_WINDOW = "2027-04-05";
const OTHER_REPORT_ON = "2027-04-12";

let observer: Client;
let actorPersonId: string;
let seasonId: string;
let seededPeople: Set<string>;

beforeAll(async () => {
  const { openObserver, SEEDED_IDENTITY_CREATED_AT } =
    await import("../../../tests/helpers/service-layer");
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [SEEDED_IDENTITY_CREATED_AT],
  );
  seededPeople = new Set(people.rows.map((row) => row.id));

  // A pass produced by an empty cohort is not a pass.
  expect(seededPeople.size).toBeGreaterThan(20);
  actorPersonId = people.rows[0].id;
  seasonId = (await readCurrentSeason()).id;

  // The premise every equality in this file rests on. If the seed ever grows an
  // event into this week, the counts below start measuring the seed and this
  // fails first, naming why.
  const { from, to } = reportWindow(REPORT_ON);
  const collisions = await observer.query<{ count: string }>(
    "select count(*)::text as count from public.events where scheduled_on between $1::date and $2::date",
    [from, to],
  );
  expect(Number(collisions.rows[0].count)).toBe(0);
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(
    `delete from public.rsvp_responses where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.attendance_records where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id in ${events})
         or entity_table = 'attendance_records'
         or (entity_table = 'weekly_reports' and entity_id in
              (select id from public.weekly_reports where report_on = $2::date))`,
    [scope, REPORT_ON],
  );
  await observer.query(`delete from public.events where name like $1`, [scope]);

  // Newest first, so a superseding row never blocks its predecessor —
  // `supersedes_id` is `on delete restrict`, and RESTRICT is checked
  // immediately, so one statement removing a whole chain is refused. `delete`
  // takes no `order by`, so the chain is unwound a generation at a time.
  for (let generation = 0; generation < 20; generation += 1) {
    const removed = await observer.query(
      `delete from public.weekly_reports
        where report_on = $1::date
          and not exists (
            select 1 from public.weekly_reports later
             where later.supersedes_id = public.weekly_reports.id)`,
      [REPORT_ON],
    );
    if (removed.rowCount === 0) break;
  }
  await observer.query("delete from public.people where family_name = $1", [NAME_MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Wednesday practice`,
    eventType: "practice",
    scheduledOn: IN_WINDOW,
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    ...overrides,
  };
}

async function approvedEvent(size = 3, overrides: Partial<EventDraftInput> = {}) {
  const event = await createEventDraft(actorPersonId, draft(overrides));

  const catalogue = await withTransaction((tx) =>
    listAudienceCatalogueIn(tx, event.seasonId, event.scheduledOn),
  );
  const keys = catalogue.candidates
    .filter((candidate) => candidate.capacity === "player" && seededPeople.has(candidate.personId))
    .slice(0, size)
    .map((candidate) => candidate.key);
  expect(keys).toHaveLength(size);

  await saveEventAudience(actorPersonId, event.id, keys);
  await approveEvent(actorPersonId, event.id);
  return event;
}

async function occurredEvent(size = 3, overrides: Partial<EventDraftInput> = {}) {
  const event = await approvedEvent(size, overrides);
  await markEventOccurred(actorPersonId, event.id);
  return event;
}

async function invitationsFor(eventId: string) {
  const result = await observer.query<{ id: string; season_membership_id: string }>(
    "select id, season_membership_id from public.invitations where event_id = $1 order by id",
    [eventId],
  );
  return result.rows;
}

async function answer(invitationId: string, response: "yes" | "no", reason: string | null) {
  await observer.query(
    `insert into public.rsvp_responses (invitation_id, response, reason, source, responded_at)
     values ($1, $2::public.rsvp_value, $3, 'operator', now())`,
    [invitationId, response, reason],
  );
  await observer.query("update public.invitations set status = 'responded' where id = $1", [
    invitationId,
  ]);
}

function sectionOf(content: WeeklyReportContent, key: ExceptionKey) {
  const section = content.exceptions.find((entry) => entry.key === key);
  if (!section) throw new Error(`No section ${key}`);
  return section;
}

async function refusalFrom(run: () => Promise<unknown>): Promise<ServiceError> {
  let thrown: unknown;
  try {
    await run();
  } catch (error) {
    thrown = error;
  }
  if (thrown === undefined) throw new Error("Expected a refusal, and there was none.");
  if (!isServiceError(thrown)) throw new Error(`Expected a ServiceError, got ${String(thrown)}`);
  return thrown;
}

/** The content for this suite's window, computed without writing anything. */
async function preview(): Promise<WeeklyReportContent> {
  return (await previewWeeklyReport(REPORT_ON)).content;
}

// ---------------------------------------------------------------------------
// The window
// ---------------------------------------------------------------------------

describe("the reporting window", () => {
  it("is the seven days ending the day before the reporting date", () => {
    expect(reportWindow("2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("crosses a month and a year boundary without arithmetic drift", () => {
    expect(reportWindow("2027-01-04")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
    expect(reportWindow("2027-03-01")).toEqual({ from: "2027-02-22", to: "2027-02-28" });
  });

  it("refuses a reporting date PostgreSQL would happily have parsed", async () => {
    // `date 'yesterday'` and `date '19 October'` both parse. A report filed
    // under a date the operator did not mean is filed there forever.
    for (const value of ["yesterday", "19 October", "2026-13-01", "2026-02-30", "", "  "]) {
      expect(() => normaliseReportDate(value)).toThrow();
    }
    expect(normaliseReportDate(" 2026-10-19 ")).toBe("2026-10-19");
  });
});

// ---------------------------------------------------------------------------
// Invariant M5 — the snapshot
// ---------------------------------------------------------------------------

describe("invariant M5 — a published report is immutable", () => {
  it("allocates version 1, then version 2 superseding it, and leaves version 1 alone", async () => {
    await occurredEvent();

    const first = await generateWeeklyReport(actorPersonId, REPORT_ON);
    expect(first.version).toBe(1);
    expect(first.supersedesId).toBeNull();

    // Read through a connection that is not the one that wrote it, and read as
    // the database's own text rather than as a re-serialised object — the point
    // is the stored bytes, and `JSON.stringify` would compare this module's
    // formatting to PostgreSQL's instead.
    const readRaw = async (id: string) => {
      const result = await observer.query<{
        content: string;
        generated_at: Date;
        data_as_of: Date;
      }>(
        `select content::text as content, generated_at, data_as_of
           from public.weekly_reports where id = $1`,
        [id],
      );
      return result.rows[0];
    };

    const before = await readRaw(first.id);
    expect(before.content.length).toBeGreaterThan(200);

    const second = await generateWeeklyReport(actorPersonId, REPORT_ON);
    expect(second.version).toBe(2);
    expect(second.supersedesId).toBe(first.id);

    const after = await readRaw(first.id);
    expect(after.content).toBe(before.content);
    expect(after.generated_at.toISOString()).toBe(before.generated_at.toISOString());
    expect(after.data_as_of.toISOString()).toBe(before.data_as_of.toISOString());

    // And version 1 now reports itself superseded, derived rather than stored.
    expect((await readStoredReport(first.id)).isSuperseded).toBe(true);
    expect((await readStoredReport(second.id)).isSuperseded).toBe(false);
  });

  it("shows a stored snapshot unchanged after the underlying data changes", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away at a conference.");

    const generated = await generateWeeklyReport(actorPersonId, REPORT_ON);
    const stored = parseReportContent((await readStoredReport(generated.id)).content);
    const declinedWhenGenerated = sectionOf(stored as WeeklyReportContent, "not_attending").count;
    expect(declinedWhenGenerated).toBe(1);

    // Change the world underneath it: two more people decline.
    await answer(invitations[1].id, "no", "Injured.");
    await answer(invitations[2].id, "no", "Working.");

    // The recomputed picture moved.
    expect(sectionOf(await preview(), "not_attending").count).toBe(3);

    // The snapshot did not. This is the whole of M5: "what leadership saw on
    // the 15th" is still answerable, and the answer is still one.
    const reread = parseReportContent((await readStoredReport(generated.id)).content);
    expect(sectionOf(reread as WeeklyReportContent, "not_attending").count).toBe(1);
  });

  it("records the actor, the definitions version and an audit row", async () => {
    await occurredEvent();
    const generated = await generateWeeklyReport(actorPersonId, REPORT_ON);

    const row = await observer.query<{
      generated_by_person_id: string;
      metric_definition_version: string;
    }>(
      `select generated_by_person_id, metric_definition_version
         from public.weekly_reports where id = $1`,
      [generated.id],
    );
    expect(row.rows[0].generated_by_person_id).toBe(actorPersonId);
    expect(row.rows[0].metric_definition_version).toBe(METRIC_DEFINITION_VERSION);

    const audit = await observer.query<{
      action: string;
      actor_person_id: string;
      context: unknown;
    }>(
      `select action, actor_person_id, context from public.audit_events
        where entity_table = 'weekly_reports' and entity_id = $1`,
      [generated.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].action).toBe("weekly_report_generated");
    expect(audit.rows[0].actor_person_id).toBe(actorPersonId);
    expect(audit.rows[0].context).toMatchObject({ version: 1, report_on: REPORT_ON });
  });

  it("refuses a supersession across a season or a date, in the club's words", async () => {
    await occurredEvent();
    const first = await generateWeeklyReport(actorPersonId, REPORT_ON);

    // The composite foreign key is the guarantee. What is under test is that a
    // caller meets a sentence rather than a raw integrity error — the issue
    // asks for exactly this.
    const refusal = await refusalFrom(async () =>
      withTransaction(async (tx) =>
        tx.query(
          `insert into public.weekly_reports
             (season_id, report_on, version, supersedes_id, metric_definition_version,
              data_as_of, content)
           values ($1, $2::date, 2, $3, 'test', now(), '{}'::jsonb)`,
          [seasonId, "2027-03-22", first.id],
        ),
      ),
    );
    expect(refusal.rule).toBe("weekly_reports_supersedes_the_same_report");
    expect(refusal.message).toContain("the same season and the same reporting date");
    expect(refusal.message).not.toMatch(/violates|constraint|fkey/i);
  });

  it("refuses a second successor to the same predecessor, readably", async () => {
    await occurredEvent();
    const first = await generateWeeklyReport(actorPersonId, REPORT_ON);
    await generateWeeklyReport(actorPersonId, REPORT_ON);

    const refusal = await refusalFrom(async () =>
      withTransaction(async (tx) =>
        tx.query(
          `insert into public.weekly_reports
             (season_id, report_on, version, supersedes_id, metric_definition_version,
              data_as_of, content)
           values ($1, $2::date, 3, $3, 'test', now(), '{}'::jsonb)`,
          [seasonId, REPORT_ON, first.id],
        ),
      ),
    );
    expect(refusal.kind).toBe("conflict");
    expect(refusal.message).toMatch(/single line of versions/);
  });

  it("has no path that updates or deletes a stored report", async () => {
    await occurredEvent();
    await generateWeeklyReport(actorPersonId, REPORT_ON);

    // Structural rather than behavioural: the module cannot rewrite a snapshot
    // because it contains no statement that could. A future edit that added one
    // fails here rather than in production, where the evidence would already be
    // gone.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./weekly-report.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/update\s+public\.weekly_reports/i);
    expect(source).not.toMatch(/delete\s+from\s+public\.weekly_reports/i);
  });

  it("lists every version for a date, newest first, with the current one marked", async () => {
    await occurredEvent();
    await generateWeeklyReport(actorPersonId, REPORT_ON);
    await generateWeeklyReport(actorPersonId, REPORT_ON);

    const versions = await listReportVersions(REPORT_ON);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[0].isSuperseded).toBe(false);
    expect(versions[1].isSuperseded).toBe(true);
    expect(versions[0].supersedesId).toBe(versions[1].id);
    expect(versions[1].supersedesId).toBeNull();

    const current = await readCurrentReport(REPORT_ON);
    expect(current?.id).toBe(versions[0].id);
  });

  it("has no stored report before one is generated, which is not an all-clear", async () => {
    await occurredEvent();
    expect(await readCurrentReport(REPORT_ON)).toBeNull();
    expect(await listReportVersions(REPORT_ON)).toEqual([]);

    // And the exceptions were there the whole time.
    expect(sectionOf(await preview(), "nonresponses").count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Preview writes nothing
// ---------------------------------------------------------------------------

describe("preview and generate are different operations", () => {
  it("writes nothing at all, however many times it is run", async () => {
    await occurredEvent();

    // Scoped to what a preview could conceivably have written, rather than to
    // whole tables. Vitest runs these suites in parallel against one database
    // and the other service suites write `audit_events` constantly, so a
    // table-wide count measures them and fails at random.
    const countRows = async (from: string) => {
      const result = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.${from}`,
      );
      return result.rows[0].count;
    };
    const scoped = async () => ({
      reports: await countRows(`weekly_reports where report_on = '${REPORT_ON}'::date`),
      audit: await countRows("audit_events where entity_table = 'weekly_reports'"),
      actions: await countRows("follow_up_actions"),
    });

    const before = await scoped();

    await previewWeeklyReport(REPORT_ON);
    await previewWeeklyReport(REPORT_ON);

    expect(await scoped()).toEqual(before);
  });

  it("stores exactly what the preview showed", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away.");

    const shown = await preview();
    const generated = await generateWeeklyReport(actorPersonId, REPORT_ON);
    const stored = parseReportContent((await readStoredReport(generated.id)).content);

    for (const key of shown.exceptions.map((section) => section.key)) {
      expect(sectionOf(stored as WeeklyReportContent, key).count).toBe(sectionOf(shown, key).count);
    }
    expect(stored?.window).toEqual(shown.window);
    expect(stored?.schema).toBe(REPORT_CONTENT_SCHEMA);
  });
});

// ---------------------------------------------------------------------------
// The five views, and what each section is
// ---------------------------------------------------------------------------

describe("every section comes from the view that owns it", () => {
  it("counts nonresponses exactly as nonresponse_queue does for the window", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);

    const direct = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.nonresponse_queue
        where season_id = $1 and scheduled_on between $2::date and $3::date`,
      [seasonId, ...Object.values(reportWindow(REPORT_ON))],
    );

    const content = await preview();
    expect(sectionOf(content, "nonresponses").count).toBe(Number(direct.rows[0].count));
    // Non-vacuous: this event contributed two of them.
    expect(sectionOf(content, "nonresponses").count).toBeGreaterThanOrEqual(2);
  });

  it("counts declines and carries their reasons, from invitation_response_state", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Injury — ankle.");
    await answer(invitations[1].id, "no", "Academic deadline.");

    const section = sectionOf(await preview(), "not_attending");
    expect(section.count).toBe(2);

    const details = section.items.map((item) => item.detail);
    expect(details).toContain("Injury — ankle.");
    expect(details).toContain("Academic deadline.");
    // The reason is displayed to the operator group, and the person it belongs
    // to is displayed with it — an unattributed reason is not actionable.
    expect(section.items.every((item) => item.person !== null)).toBe(true);
  });

  it("counts mismatches exactly as rsvp_attendance_mismatches does", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    const key = (index: number) => `player:${invitations[index].season_membership_id}`;

    await answer(invitations[0].id, "yes", null);
    await answer(invitations[1].id, "no", "Working.");
    await recordAttendance(actorPersonId, event.id, key(1), "present");
    await recordAttendance(actorPersonId, event.id, key(2), "present");

    const direct = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.rsvp_attendance_mismatches
        where season_id = $1 and scheduled_on between $2::date and $3::date`,
      [seasonId, ...Object.values(reportWindow(REPORT_ON))],
    );

    const section = sectionOf(await preview(), "mismatches");
    expect(section.count).toBe(Number(direct.rows[0].count));
    expect(section.items.map((item) => item.detail)).toContain("Not attending but turned up");
  });

  it("includes a walk-up as a mismatch, which the corrected view now emits", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      name: `Devon ${NAME_MARKER}`,
      contact: null,
      presence: "present",
      membershipId: null,
    });

    const section = sectionOf(await preview(), "mismatches");
    expect(section.items.map((item) => item.detail)).toContain("Turned up without an invitation");
  });

  it("counts absences and the registers nobody completed", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "absent",
    );

    // A second occurred event with no attendance at all — the half an absence
    // row can never show, and the one an operator has to be told about.
    await occurredEvent(2, { name: `${NAME_MARKER} Friday session` });

    const section = sectionOf(await preview(), "absences");
    expect(section.items.some((item) => item.detail === "Absent")).toBe(true);
    expect(section.items.some((item) => item.detail?.startsWith("No attendance recorded"))).toBe(
      true,
    );
    expect(section.note).toMatch(/incomplete register/);
  });

  it("counts uninvited audience members from their own view, and never as a chase", async () => {
    // An audience member with no invitation: the approval defect. Adding the
    // row directly is the only way to produce it, because the application
    // deliberately invites everybody it confirms.
    const event = await occurredEvent();
    const membership = await observer.query<{ id: string; person_id: string }>(
      `select m.id, m.person_id from public.season_memberships m
        where m.season_id = $1 and m.status = 'active'
          and m.id not in (select season_membership_id from public.event_audience_members
                            where event_id = $2 and season_membership_id is not null)
        limit 1`,
      [seasonId, event.id],
    );
    await observer.query(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4)`,
      [event.id, seasonId, membership.rows[0].id, actorPersonId],
    );

    const content = await preview();
    const defect = sectionOf(content, "uninvited_audience");
    expect(defect.count).toBe(1);
    expect(defect.isApprovalDefect).toBe(true);
    expect(defect.note).toMatch(/never invited/i);
    expect(defect.note).not.toMatch(/chase|remind/i);

    // And the same person is not counted as a nonresponse. They were never
    // asked, so there is nothing to chase — which is the distinction the two
    // views exist to draw.
    const nonresponders = sectionOf(content, "nonresponses").items.map((item) => item.person);
    const person = await observer.query<{ name: string }>(
      `select coalesce(nullif(btrim(known_as), ''), given_name) || ' ' || family_name as name
         from public.people where id = $1`,
      [membership.rows[0].person_id],
    );
    expect(defect.items.map((item) => item.person)).toContain(person.rows[0].name);
    expect(nonresponders).not.toContain(person.rows[0].name);
  });

  it("reports availability as a level count, and offers nowhere to write a diagnosis", async () => {
    await occurredEvent();
    const content = await preview();

    const direct = await observer.query<{ level: string; tally: string }>(
      `select level::text as level, count(*)::text as tally from public.current_availability
        where season_id = $1 group by level`,
      [seasonId],
    );
    for (const row of direct.rows) {
      expect(content.availability[row.level as "green" | "orange" | "red"]).toBe(Number(row.tally));
    }

    // Three numbers, and nothing else. A note, a narrative or a free-text field
    // would have to appear as a fourth key.
    expect(Object.keys(content.availability).sort()).toEqual(["green", "orange", "red"]);
  });

  it("carries no availability narrative anywhere in the stored content", async () => {
    await occurredEvent();
    const generated = await generateWeeklyReport(actorPersonId, REPORT_ON);
    const raw = await observer.query<{ content: string }>(
      "select content::text as content from public.weekly_reports where id = $1",
      [generated.id],
    );

    for (const forbidden of ["diagnosis", "injuryNote", "injury_note", "narrative", "healthNote"]) {
      expect(raw.rows[0].content.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant E6
// ---------------------------------------------------------------------------

describe("invariant E6 — a non-soliciting event never enters the response stream", () => {
  it("keeps its audience out of the breakdown and out of the nonresponse queue", async () => {
    // Approved, in the window, with an audience, and soliciting nothing.
    const informational = await approvedEvent(3, {
      name: `${NAME_MARKER} Committee briefing`,
      solicitsResponse: false,
      isMandatory: false,
    });

    const content = await preview();

    // It is an event in the window, and the report says so — the exclusion is
    // about responses, not about the event's existence.
    expect(content.events.map((entry) => entry.id)).toContain(informational.id);
    expect(content.events.find((entry) => entry.id === informational.id)?.solicitsResponse).toBe(
      false,
    );

    // And nobody is awaiting a response to it.
    expect(content.responseBreakdown.map((row) => row.eventId)).not.toContain(informational.id);
    expect(sectionOf(content, "nonresponses").items.map((item) => item.event)).not.toContain(
      informational.name,
    );

    // Non-vacuous: an otherwise identical soliciting event does appear.
    const soliciting = await approvedEvent(3, { name: `${NAME_MARKER} Wednesday practice` });
    const withBoth = await preview();
    expect(withBoth.responseBreakdown.map((row) => row.eventId)).toContain(soliciting.id);
  });
});

// ---------------------------------------------------------------------------
// The window bounds what is counted
// ---------------------------------------------------------------------------

describe("the window bounds the report", () => {
  it("excludes an event outside it, and includes the same event inside it", async () => {
    const outside = await occurredEvent(3, {
      name: `${NAME_MARKER} February practice`,
      scheduledOn: OUT_OF_WINDOW,
    });

    const content = await preview();
    expect(content.events.map((entry) => entry.id)).not.toContain(outside.id);

    // The same rows, read for a reporting date whose window contains them.
    const other = await previewWeeklyReport(OTHER_REPORT_ON);
    expect(other.content.events.map((entry) => entry.id)).toContain(outside.id);
  });

  it("computes the content for the season it is given, and records which", async () => {
    await occurredEvent();
    const season = await readCurrentSeason();
    const content = await withTransaction((tx) => computeReportContent(tx, season, REPORT_ON));

    expect(content.season).toEqual({ id: season.id, label: season.label });
    expect(content.reportOn).toBe(REPORT_ON);
    expect(content.metricDefinitionVersion).toBe(METRIC_DEFINITION_VERSION);
    expect(content.exceptions.map((section) => section.key)).toEqual([
      "nonresponses",
      "not_attending",
      "mismatches",
      "absences",
      "onboarding",
      "uninvited_audience",
    ]);
    expect(content.exceptions.map((section) => section.position)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ---------------------------------------------------------------------------
// Reading a snapshot this build did not write
// ---------------------------------------------------------------------------

describe("a snapshot under other metric definitions stays readable", () => {
  it("returns null content rather than throwing, and keeps the metadata", async () => {
    // The synthetic seed contains two, under `master-table-v1`. An immutable
    // record that a later build cannot open is not immutable in any useful
    // sense.
    const seeded = await observer.query<{ id: string }>(
      `select id from public.weekly_reports
        where metric_definition_version <> $1 order by version limit 1`,
      [METRIC_DEFINITION_VERSION],
    );
    expect(seeded.rows.length).toBeGreaterThan(0);

    const stored = await readStoredReport(seeded.rows[0].id);
    expect(stored.metricDefinitionVersion).not.toBe(METRIC_DEFINITION_VERSION);
    expect(parseReportContent(stored.content)).toBeNull();
    expect(stored.generatedAt).toBeTruthy();
    expect(typeof stored.content).toBe("object");
  });

  it("rejects content of the wrong shape without inventing sections", () => {
    expect(parseReportContent(null)).toBeNull();
    expect(parseReportContent("a string")).toBeNull();
    expect(parseReportContent({})).toBeNull();
    expect(parseReportContent({ schema: REPORT_CONTENT_SCHEMA })).toBeNull();
    expect(
      parseReportContent({ schema: REPORT_CONTENT_SCHEMA, exceptions: [], reportOn: "2027-03-15" }),
    ).not.toBeNull();
  });
});
