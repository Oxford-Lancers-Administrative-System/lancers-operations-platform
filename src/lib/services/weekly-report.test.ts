// @vitest-environment node
/**
 * The Monday report — LAN-81.
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
 * Rewritten after Brian's 15 August 2026 review, which replaced six counted
 * categories with two action lists and took the version machinery off the
 * screen. What did *not* change is what most of this file checks: the snapshot
 * is still immutable, the reader still reads stored content, and every number
 * still comes from the view that owns it.
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
  readCurrentReport,
  readReportForDate,
  readStoredReport,
  REPORT_CONTENT_SCHEMA,
  reportWindow,
  type ChaseKind,
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
              (select id from public.weekly_reports
                where report_on in ($2::date, $3::date)))`,
    [scope, REPORT_ON, OTHER_REPORT_ON],
  );
  await observer.query(`delete from public.events where name like $1`, [scope]);

  // The whole version chain in one statement: the composite foreign key binding
  // a supersession to its own report is `no action`, which is checked at the end
  // of the statement rather than per row.
  await observer.query(
    "delete from public.weekly_reports where report_on in ($1::date, $2::date)",
    [REPORT_ON, OTHER_REPORT_ON],
  );

  // The walk-up this suite records is a person the application minted, and
  // LAN-110 made it a recruitment prospect too — `person_id` is
  // `on delete restrict`, so without these two the person delete below fails,
  // the hook aborts, and every later test in the file inherits the leftovers.
  await observer.query(
    "delete from public.recruitment_prospects where person_id in (select id from public.people where family_name = $1)",
    [NAME_MARKER],
  );
  await observer.query(
    "delete from public.contact_points where person_id in (select id from public.people where family_name = $1)",
    [NAME_MARKER],
  );
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

/** The content for this suite's window, computed without filing anything. */
async function compute(reportOn = REPORT_ON): Promise<WeeklyReportContent> {
  const season = await readCurrentSeason();
  return withTransaction((tx) => computeReportContent(tx, season, reportOn));
}

function kinds(content: WeeklyReportContent): ChaseKind[] {
  return content.chase.map((item) => item.kind);
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

  it("refuses a reporting date PostgreSQL would happily have parsed", () => {
    // `date 'yesterday'` and `date '19 October'` both parse. A report filed
    // under a date the operator did not mean is filed there forever.
    for (const value of ["yesterday", "19 October", "2026-13-01", "2026-02-30", "", "  "]) {
      expect(() => normaliseReportDate(value)).toThrow();
    }
    expect(normaliseReportDate(" 2026-10-19 ")).toBe("2026-10-19");
  });

  it("excludes an event outside it, and includes the same event inside it", async () => {
    const outside = await occurredEvent(3, {
      name: `${NAME_MARKER} April practice`,
      scheduledOn: OUT_OF_WINDOW,
    });

    expect((await compute()).events.map((entry) => entry.id)).not.toContain(outside.id);
    expect((await compute(OTHER_REPORT_ON)).events.map((entry) => entry.id)).toContain(outside.id);
  });
});

// ---------------------------------------------------------------------------
// Chase these people
// ---------------------------------------------------------------------------

describe("the chase list", () => {
  it("names everybody who was asked and never answered", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);

    const direct = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.nonresponse_queue
        where season_id = $1 and scheduled_on between $2::date and $3::date`,
      [seasonId, ...Object.values(reportWindow(REPORT_ON))],
    );

    const content = await compute();
    const silent = content.chase.filter((item) => item.kind === "no_answer");
    expect(silent).toHaveLength(Number(direct.rows[0].count));
    // Non-vacuous: two of this event's three invitees never answered.
    expect(silent.length).toBe(2);
    expect(silent.every((item) => item.person !== "Unnamed member")).toBe(true);
  });

  it("carries the reason a decline gave, beside the person who gave it", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Injury — ankle.");
    await answer(invitations[1].id, "no", "Academic deadline.");

    const declines = (await compute()).chase.filter((item) => item.kind === "said_no");
    expect(declines).toHaveLength(2);
    expect(declines.map((item) => item.reason)).toEqual(
      expect.arrayContaining(["Injury — ankle.", "Academic deadline."]),
    );
    expect(declines.every((item) => item.person !== "Unnamed member")).toBe(true);
  });

  it("chases somebody who said yes and was marked absent", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "absent",
    );

    expect(kinds(await compute())).toContain("said_yes_absent");
  });

  it("chases somebody who said no and turned up", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Working.");
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    expect(kinds(await compute())).toContain("said_no_attended");
  });

  /**
   * The single change that made the first build unreadable, pinned.
   *
   * `said_yes_no_attendance_recorded` fires for every invitee of an event whose
   * register nobody took, and the seeded season produced 163 of them for one
   * week. None was a person anybody should have contacted: the club's problem
   * was one uncompleted register. So it becomes a chase only when the register
   * *was* taken and this person is missing from it.
   */
  describe("said yes with no attendance recorded", () => {
    it("is one thing to fix, not a person to chase, when nobody took the register", async () => {
      const event = await occurredEvent();
      const invitations = await invitationsFor(event.id);
      for (const invitation of invitations) await answer(invitation.id, "yes", null);

      const content = await compute();

      expect(kinds(content)).not.toContain("missing_from_register");
      expect(content.chase).toHaveLength(0);
      expect(content.fix.filter((item) => item.kind === "register_not_taken")).toHaveLength(1);
      expect(content.fix[0].what).toMatch(/Register never taken/);
      expect(content.fix[0].what).toMatch(/3 people were asked/);
    });

    it("is a person to chase when somebody took the register and left them off it", async () => {
      const event = await occurredEvent();
      const invitations = await invitationsFor(event.id);
      for (const invitation of invitations) await answer(invitation.id, "yes", null);

      // The register was taken — for one of the three.
      await recordAttendance(
        actorPersonId,
        event.id,
        `player:${invitations[0].season_membership_id}`,
        "present",
      );

      const content = await compute();
      expect(content.chase.filter((item) => item.kind === "missing_from_register")).toHaveLength(2);
      expect(content.fix.filter((item) => item.kind === "register_not_taken")).toHaveLength(0);
    });
  });

  it("puts the most recent event first, and a mandatory event above an optional one", async () => {
    // Brian chose "soonest event first" and a window that only looks backwards,
    // so the ordering is most-recent-first: last night's practice above last
    // Tuesday's.
    await occurredEvent(2, {
      name: `${NAME_MARKER} Monday optional`,
      scheduledOn: "2027-03-22",
      isMandatory: false,
    });
    await occurredEvent(2, {
      name: `${NAME_MARKER} Monday mandatory`,
      scheduledOn: "2027-03-22",
      isMandatory: true,
    });
    await occurredEvent(2, {
      name: `${NAME_MARKER} Friday practice`,
      scheduledOn: "2027-03-19",
      isMandatory: true,
    });

    const order = (await compute()).chase.map((item) => item.event);

    expect(order[0]).toBe(`${NAME_MARKER} Monday mandatory`);
    expect(order.indexOf(`${NAME_MARKER} Monday optional`)).toBeLessThan(
      order.indexOf(`${NAME_MARKER} Friday practice`),
    );
  });

  it("puts the worst kind first when two sit on one event", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Working.");
    await answer(invitations[1].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[1].season_membership_id}`,
      "absent",
    );

    const order = kinds(await compute());
    expect(order.indexOf("said_yes_absent")).toBeLessThan(order.indexOf("no_answer"));
    expect(order.indexOf("no_answer")).toBeLessThan(order.indexOf("said_no"));
  });
});

// ---------------------------------------------------------------------------
// Fix these things
// ---------------------------------------------------------------------------

describe("the fix list", () => {
  it("names an occurred event whose register nobody took", async () => {
    await occurredEvent(2, { name: `${NAME_MARKER} Empty register` });

    const fix = (await compute()).fix;
    expect(fix.filter((item) => item.kind === "register_not_taken")).toHaveLength(1);
    expect(fix[0].event).toBe(`${NAME_MARKER} Empty register`);
    expect(fix[0].person).toBeNull();
  });

  it("names the approval defect, and never as a chase", async () => {
    // An audience member with no invitation. Adding the row directly is the
    // only way to produce it, because the application deliberately invites
    // everybody it confirms.
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

    const content = await compute();
    const defects = content.fix.filter((item) => item.kind === "approved_never_invited");
    expect(defects).toHaveLength(1);
    expect(defects[0].what).toMatch(/never invited/i);
    expect(defects[0].what).not.toMatch(/chase|remind/i);

    // And the same person is not on the chase list. They were never asked, so
    // there is nothing to chase — the distinction the two views exist to draw.
    const person = await observer.query<{ name: string }>(
      `select coalesce(nullif(btrim(known_as), ''), given_name) || ' ' || family_name as name
         from public.people where id = $1`,
      [membership.rows[0].person_id],
    );
    expect(defects[0].person).toBe(person.rows[0].name);
    expect(content.chase.map((item) => item.person)).not.toContain(person.rows[0].name);
  });

  it("names a walk-up to reconcile — the classification the corrected view now emits", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "07700 900081",
      email: null,
      presence: "present",
    });

    const walkUps = (await compute()).fix.filter((item) => item.kind === "walk_up_unreconciled");
    expect(walkUps).toHaveLength(1);
    expect(walkUps[0].what).toMatch(/reconciled/);
  });

  it("is empty when the week went as intended", async () => {
    const event = await occurredEvent(2);
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);
    await answer(invitations[1].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[1].season_membership_id}`,
      "late",
    );

    const content = await compute();
    expect(content.chase).toEqual([]);
    expect(content.fix).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The rest of the stored content
// ---------------------------------------------------------------------------

describe("what the snapshot still stores, whatever the screen leads with", () => {
  it("stores the window's events, the response breakdown and the attendance", async () => {
    // `slice-ux.md` § 10 requires all three, and the screen showing two action
    // lists does not relieve the snapshot of carrying them.
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    const content = await compute();
    expect(content.events.map((entry) => entry.id)).toContain(event.id);
    expect(content.events.find((entry) => entry.id === event.id)?.status).toBe("occurred");
    expect(content.responseBreakdown.find((row) => row.eventId === event.id)?.respondedYes).toBe(1);
    expect(content.attendance.present).toBe(1);
  });

  it("lists a member with a required onboarding item outstanding, in its own block", async () => {
    await occurredEvent();
    const content = await compute();

    const direct = await observer.query<{ count: string }>(
      `select count(distinct m.person_id)::text as count
         from public.onboarding_items oi
         join public.onboarding_item_types t on t.id = oi.item_type_id
         join public.season_memberships m on m.id = oi.season_membership_id
        where m.season_id = $1 and m.status in ('onboarding', 'active')
          and t.is_required and oi.status not in ('complete', 'waived', 'not_applicable')`,
      [seasonId],
    );

    expect(content.onboarding).toHaveLength(Number(direct.rows[0].count));
    expect(content.onboarding.length).toBeGreaterThan(0);
    // And they are nowhere near the week's chases: Brian put them in their own
    // block precisely because they would otherwise swamp it.
    expect(content.chase.map((item) => item.person)).not.toContain(content.onboarding[0].person);
  });

  it("reports availability as a level count, and offers nowhere to write a diagnosis", async () => {
    await occurredEvent();
    const content = await compute();

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
  it("keeps its audience off the chase list and out of the breakdown", async () => {
    const informational = await approvedEvent(3, {
      name: `${NAME_MARKER} Committee briefing`,
      solicitsResponse: false,
      isMandatory: false,
    });

    const content = await compute();

    // It is an event in the window, and the snapshot says so — the exclusion is
    // about responses, not about the event's existence.
    expect(content.events.map((entry) => entry.id)).toContain(informational.id);
    expect(content.events.find((entry) => entry.id === informational.id)?.solicitsResponse).toBe(
      false,
    );

    // And nobody is being chased about it.
    expect(content.responseBreakdown.map((row) => row.eventId)).not.toContain(informational.id);
    expect(content.chase.map((item) => item.event)).not.toContain(informational.name);

    // Non-vacuous: an otherwise identical soliciting event does produce chases.
    const soliciting = await approvedEvent(3, { name: `${NAME_MARKER} Wednesday practice` });
    const withBoth = await compute();
    expect(withBoth.responseBreakdown.map((row) => row.eventId)).toContain(soliciting.id);
    expect(withBoth.chase.map((item) => item.event)).toContain(soliciting.name);
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

    // Read as the database's own text rather than as a re-serialised object:
    // the point is the stored bytes.
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

    // Superseded-ness is derived from a later row pointing at this one, never
    // stored — `weekly_reports` has no status column on purpose.
    expect((await readStoredReport(first.id)).isSuperseded).toBe(true);
    expect((await readStoredReport(second.id)).isSuperseded).toBe(false);
  });

  it("shows a stored snapshot unchanged after the underlying data changes", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away at a conference.");

    const generated = await generateWeeklyReport(actorPersonId, REPORT_ON);
    const stored = parseReportContent((await readStoredReport(generated.id)).content);
    expect(stored?.chase.filter((item) => item.kind === "said_no")).toHaveLength(1);

    // Change the world underneath it: two more people decline.
    await answer(invitations[1].id, "no", "Injured.");
    await answer(invitations[2].id, "no", "Working.");

    // The recomputed picture moved.
    expect((await compute()).chase.filter((item) => item.kind === "said_no")).toHaveLength(3);

    // The snapshot did not. This is the whole of M5.
    const reread = parseReportContent((await readStoredReport(generated.id)).content);
    expect(reread?.chase.filter((item) => item.kind === "said_no")).toHaveLength(1);
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
    // caller meets a sentence rather than a raw integrity error.
    const refusal = await refusalFrom(async () =>
      withTransaction(async (tx) =>
        tx.query(
          `insert into public.weekly_reports
             (season_id, report_on, version, supersedes_id, metric_definition_version,
              data_as_of, content)
           values ($1, $2::date, 2, $3, 'test', now(), '{}'::jsonb)`,
          [seasonId, OTHER_REPORT_ON, first.id],
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
    // Structural rather than behavioural: the module cannot rewrite a snapshot
    // because it contains no statement that could. A future edit that added one
    // fails here rather than in production, where the evidence would already be
    // gone.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./weekly-report.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/update\s+public\.weekly_reports/i);
    expect(source).not.toMatch(/delete\s+from\s+public\.weekly_reports/i);
  });

  it("keeps the lineage readable even though no screen shows it", async () => {
    // Brian's decision removed the version list from the interface, not the
    // versions from the database.
    await occurredEvent();
    await generateWeeklyReport(actorPersonId, REPORT_ON);
    await generateWeeklyReport(actorPersonId, REPORT_ON);

    const versions = await listReportVersions(REPORT_ON);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(versions[0].supersedesId).toBe(versions[1].id);
    expect(versions[1].supersedesId).toBeNull();
    expect(versions[0].isSuperseded).toBe(false);
    expect(versions[1].isSuperseded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Opening the report — the only thing the interface calls
// ---------------------------------------------------------------------------

describe("opening the report", () => {
  it("files one snapshot on the first look and reuses it for the rest of the day", async () => {
    await occurredEvent();
    expect(await readCurrentReport(REPORT_ON)).toBeNull();

    const first = await readReportForDate(actorPersonId, REPORT_ON);
    expect(first.version).toBe(1);

    const second = await readReportForDate(actorPersonId, REPORT_ON);
    const third = await readReportForDate(actorPersonId, REPORT_ON);

    // The same row, three times. Brian never presses anything, and the table
    // does not fill with a near-identical snapshot per page view.
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await listReportVersions(REPORT_ON)).toHaveLength(1);
  });

  it("returns the stored snapshot, not a recomputation, on the second look", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away at a conference.");

    const first = await readReportForDate(actorPersonId, REPORT_ON);
    expect(
      parseReportContent(first.content)?.chase.filter((item) => item.kind === "said_no"),
    ).toHaveLength(1);

    await answer(invitations[1].id, "no", "Injured.");

    const again = await readReportForDate(actorPersonId, REPORT_ON);
    expect(again.id).toBe(first.id);
    // The live picture has two declines; what leadership sees today still has
    // the one it had when the report was opened.
    expect((await compute()).chase.filter((item) => item.kind === "said_no")).toHaveLength(2);
    expect(
      parseReportContent(again.content)?.chase.filter((item) => item.kind === "said_no"),
    ).toHaveLength(1);
  });

  it("files tomorrow's look as the next version, superseding today's", async () => {
    await occurredEvent();
    const today = await readReportForDate(actorPersonId, REPORT_ON);

    // Age today's snapshot by a day, which is what tomorrow will look like.
    await observer.query(
      "update public.weekly_reports set generated_at = generated_at - interval '1 day' where id = $1",
      [today.id],
    );

    const tomorrow = await readReportForDate(actorPersonId, REPORT_ON);
    expect(tomorrow.id).not.toBe(today.id);
    expect(tomorrow.version).toBe(2);
    expect(tomorrow.supersedesId).toBe(today.id);
  });

  it("refuses an unparseable date before it writes anything", async () => {
    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.weekly_reports",
    );

    await expect(readReportForDate(actorPersonId, "last Monday")).rejects.toThrow(/YYYY-MM-DD/);

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.weekly_reports",
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
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
    // The first build's own shape, which this one no longer understands.
    expect(
      parseReportContent({ schema: "lancers.monday-exception-report.v1", exceptions: [] }),
    ).toBeNull();
    expect(
      parseReportContent({
        schema: REPORT_CONTENT_SCHEMA,
        chase: [],
        fix: [],
        reportOn: "2027-03-25",
      }),
    ).not.toBeNull();
  });
});
