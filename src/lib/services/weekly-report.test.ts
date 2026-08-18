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
  lookaheadWindow,
  METRIC_DEFINITION_VERSION,
  normaliseReportDate,
  parseReportContent,
  readCurrentReport,
  readReportForDate,
  readStoredReport,
  REPORT_CONTENT_SCHEMA,
  reportWindow,
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
  // Every clause is scoped to this suite's own rows.
  //
  // The attendance clause was `entity_table = 'attendance_records'` with no
  // scope at all, copied from the attendance suite's cleanup where the whole
  // file owns those rows. Here it deleted *every* attendance audit row in the
  // database, and Vitest runs these suites in parallel against one stack — so
  // it removed LAN-110's audit rows out from under its assertions. It passed
  // locally on timing and failed in CI, which is the wrong way round.
  await observer.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id in ${events})
         or (entity_table = 'attendance_records' and entity_id in
              (select id from public.attendance_records where event_id in ${events}))
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

/** A second invitation to one event for one person, anchored to the person. */
async function secondInvitationFor(eventId: string, invitationId: string) {
  const person = await observer.query<{ person_id: string }>(
    `select m.person_id from public.invitations i
       join public.season_memberships m on m.id = i.season_membership_id
      where i.id = $1`,
    [invitationId],
  );
  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, person_id, added_by_person_id)
     values ($1, $2, 'coach', $3, $4) returning id`,
    [eventId, seasonId, person.rows[0].person_id, actorPersonId],
  );
  await observer.query(
    `insert into public.invitations
       (event_id, event_status, solicits_response, season_id, capacity, person_id,
        audience_member_id, status, issued_at)
     values ($1, 'occurred', true, $2, 'coach', $3, $4, 'issued', now())`,
    [eventId, seasonId, person.rows[0].person_id, audience.rows[0].id],
  );
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

/** Every cell in the grid that disagrees with itself, whoever it belongs to. */
function discrepancies(content: WeeklyReportContent) {
  return content.grid.rows.flatMap((row) => row.cells.filter((cell) => cell.isDiscrepancy));
}

/** One of last week's events by name. */
function eventNamed(content: WeeklyReportContent, name: string) {
  const found = content.lastWeek.find((entry) => entry.name === name);
  if (!found) throw new Error(`No event named ${name} in last week`);
  return found;
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

    expect((await compute()).lastWeek.map((entry) => entry.id)).not.toContain(outside.id);
    expect((await compute(OTHER_REPORT_ON)).lastWeek.map((entry) => entry.id)).toContain(
      outside.id,
    );
  });
});

// ---------------------------------------------------------------------------
// Chase these people
// ---------------------------------------------------------------------------

describe("last week, event by event", () => {
  it("counts who was asked, who answered and who turned up", async () => {
    const event = await occurredEvent(3, { name: `${NAME_MARKER} Wednesday practice` });
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);
    await answer(invitations[1].id, "no", "Working.");
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    const outcome = eventNamed(await compute(), `${NAME_MARKER} Wednesday practice`);

    expect(outcome.invited).toBe(3);
    expect(outcome.respondedYes).toBe(1);
    expect(outcome.respondedNo).toBe(1);
    expect(outcome.noAnswer).toBe(1);
    expect(outcome.present).toBe(1);
    expect(outcome.registerTaken).toBe(true);
    // Turnout is over the people asked, which is the question an operator has.
    expect(outcome.turnoutPercent).toBe(33);
  });

  it("counts late as having turned up, and absent as not", async () => {
    const event = await occurredEvent(2);
    const invitations = await invitationsFor(event.id);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "late",
    );
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[1].season_membership_id}`,
      "absent",
    );

    const outcome = eventNamed(await compute(), `${NAME_MARKER} Wednesday practice`);
    expect(outcome.late).toBe(1);
    expect(outcome.absent).toBe(1);
    expect(outcome.turnoutPercent).toBe(50);
  });

  /**
   * A register nobody took must never read as nobody turning up.
   *
   * Those are opposite operational facts and the same 0%, which is exactly the
   * kind of number a Monday meeting acts on.
   */
  it("reports no turnout at all when nobody took the register", async () => {
    await occurredEvent(3);

    const outcome = eventNamed(await compute(), `${NAME_MARKER} Wednesday practice`);
    expect(outcome.registerTaken).toBe(false);
    expect(outcome.turnoutPercent).toBeNull();
    expect(outcome.present + outcome.late).toBe(0);
  });

  it("carries the walk-up and the approval defect on the event they belong to", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "07700 900081",
      email: null,
      presence: "present",
    });

    // Somebody the approver confirmed and nobody invited. Inserting the
    // audience row directly is the only way to produce it, because the
    // application deliberately invites everybody it confirms.
    const membership = await observer.query<{ id: string }>(
      `select m.id from public.season_memberships m
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

    const outcome = eventNamed(await compute(), `${NAME_MARKER} Wednesday practice`);
    expect(outcome.walkUps).toBe(1);
    expect(outcome.neverInvited).toBe(1);
  });

  it("orders the week as it happened", async () => {
    await occurredEvent(2, { name: `${NAME_MARKER} Friday`, scheduledOn: "2027-03-19" });
    await occurredEvent(2, { name: `${NAME_MARKER} Monday`, scheduledOn: "2027-03-22" });

    const names = (await compute()).lastWeek.map((entry) => entry.name);
    expect(names.indexOf(`${NAME_MARKER} Friday`)).toBeLessThan(
      names.indexOf(`${NAME_MARKER} Monday`),
    );
  });
});

describe("the attendance grid", () => {
  it("gives each person one row and each soliciting event one column", async () => {
    const friday = await occurredEvent(2, {
      name: `${NAME_MARKER} Friday`,
      scheduledOn: "2027-03-19",
    });
    const monday = await occurredEvent(2, {
      name: `${NAME_MARKER} Monday`,
      scheduledOn: "2027-03-22",
    });

    const content = await compute();

    // Column heads are shortened on purpose — a full event name is far too
    // wide for one — so this asserts identity and order rather than text.
    expect(content.grid.columns.map((column) => column.eventId)).toEqual([friday.id, monday.id]);
    // The same two people are invited to both, and they appear once each.
    expect(content.grid.rows).toHaveLength(2);
    expect(content.grid.rows.every((row) => row.cells.length === 2)).toBe(true);
  });

  /**
   * The section's whole subject, and why one collapsed verdict per event was
   * wrong: Brian is comparing what somebody said against what they did.
   */
  it("carries what they said and what they did, side by side", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "absent",
    );

    const cell = discrepancies(await compute()).find((entry) => entry.rsvp === "yes");
    expect(cell?.rsvp).toBe("yes");
    expect(cell?.attendance).toBe("absent");
    expect(cell?.isDiscrepancy).toBe(true);
  });

  it("flags somebody who never answered", async () => {
    const event = await occurredEvent();
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
      "present",
    );

    const flagged = discrepancies(await compute());
    expect(flagged).toHaveLength(1);
    expect(flagged[0].rsvp).toBeNull();
  });

  it("flags a decline regardless of what they then did, and keeps the reason", async () => {
    // Brian: "They said no to coming there, and I want to see their value
    // regardless of who it is."
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Coursework deadline.");

    const decline = discrepancies(await compute()).find((cell) => cell.rsvp === "no");
    expect(decline?.isDiscrepancy).toBe(true);
    expect(decline?.reason).toBe("Coursework deadline.");
  });

  it("does not flag somebody who said yes and turned up", async () => {
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

    // Late is not present, so it is still a discrepancy — "didn't come to the
    // event, were late, or something else" — and the person who was present is
    // not on the list at all.
    const content = await compute();
    expect(content.grid.rows).toHaveLength(1);
    expect(content.grid.rows[0].cells[0].attendance).toBe("late");
  });

  /**
   * The single change that made the first build unreadable, pinned.
   *
   * A yes with nothing on the register matches for *every* invitee of an event
   * whose register nobody took — 163 of them in one seeded week. None was a
   * person to contact: the club's problem is one untaken register, which last
   * week's own row already says.
   */
  it("does not flag anybody when the register was simply never taken", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    for (const invitation of invitations) await answer(invitation.id, "yes", null);

    const content = await compute();
    expect(content.grid.rows).toEqual([]);
    expect(eventNamed(content, `${NAME_MARKER} Wednesday practice`).registerTaken).toBe(false);
  });

  it("does flag somebody the register was taken without", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    for (const invitation of invitations) await answer(invitation.id, "yes", null);
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    const flagged = discrepancies(await compute());
    expect(flagged).toHaveLength(2);
    expect(flagged.every((cell) => cell.rsvp === "yes" && cell.attendance === null)).toBe(true);
  });

  /**
   * A person can hold two invitations to one event, and the grid must still
   * give them one cell — with the disagreement in it, whichever invitation the
   * database hands over first.
   *
   * Invariant P8 anchors a player to their membership and a coach or committee
   * member to their person, and the same human is routinely both; the seeded
   * week has 32 such pairs. Before the merge, each invitation pushed its own
   * cell: the table rendered the first and the problem count counted both.
   *
   * This runs the same scenario twice, with the ids arranged so that the
   * benign invitation sorts first in one and the disagreeing one first in the
   * other. Independent review caught the earlier version passing only because
   * PostgreSQL happened to return the disagreeing row first — deleting the
   * promote branch entirely left all 3,154 tests green.
   */
  describe("one cell per person per event, when they hold two invitations to it", () => {
    /**
     * Gives one member of `event` a second invitation, anchored to their person
     * rather than their membership, with an id chosen so the caller controls
     * which of the two the ordered query returns first.
     */
    async function secondInvitation(eventId: string, invitationId: string, id: string) {
      const person = await observer.query<{ person_id: string }>(
        `select m.person_id from public.invitations i
           join public.season_memberships m on m.id = i.season_membership_id
          where i.id = $1`,
        [invitationId],
      );
      const audience = await observer.query<{ id: string }>(
        `insert into public.event_audience_members
           (event_id, season_id, capacity, person_id, added_by_person_id)
         values ($1, $2, 'coach', $3, $4) returning id`,
        [eventId, seasonId, person.rows[0].person_id, actorPersonId],
      );
      await observer.query(
        `insert into public.invitations
           (id, event_id, event_status, solicits_response, season_id, capacity, person_id,
            audience_member_id, status, issued_at)
         values ($1, $2, 'occurred', true, $3, 'coach', $4, $5, 'issued', now())`,
        [id, eventId, seasonId, person.rows[0].person_id, audience.rows[0].id],
      );
    }

    /**
     * `coachId` decides the order: the player invitation's id is a random uuid
     * from the application, so an all-zeroes id always sorts before it and an
     * all-fs id always after.
     */
    async function runWith(coachId: string) {
      const event = await occurredEvent(2);
      const invitations = await invitationsFor(event.id);
      await secondInvitation(event.id, invitations[0].id, coachId);

      // The other invitee never answers either, so their cell is on the grid
      // too — everything below is scoped to the person under test.
      const named = await observer.query<{ display_name: string }>(
        `select coalesce(nullif(btrim(p.known_as), ''), p.given_name)
                || case when p.family_name is null then '' else ' ' || p.family_name end
                  as display_name
           from public.invitations i
           join public.season_memberships m on m.id = i.season_membership_id
           join public.people p on p.id = m.person_id
          where i.id = $1`,
        [invitations[0].id],
      );
      const person = named.rows[0].display_name;

      // The membership invitation is answered and honoured. The coach one is
      // never answered, so it disagrees — and must be what shows.
      await answer(invitations[0].id, "yes", null);
      await recordAttendance(
        actorPersonId,
        event.id,
        `player:${invitations[0].season_membership_id}`,
        "present",
      );

      const content = await compute();
      const row = content.grid.rows.find((entry) => entry.person === person);
      const cells = (row?.cells ?? []).filter((cell) => cell.eventId === event.id);
      return { content, cells, row, eventId: event.id, person };
    }

    it("keeps the disagreement when the disagreeing invitation arrives first", async () => {
      // An all-zeroes id always sorts before the application's random uuid, so
      // the never-answered coach invitation is the one the merge sees first.
      const { cells } = await runWith("00000000-0000-4000-8000-000000000081");

      expect(cells).toHaveLength(1);
      expect(cells[0].isDiscrepancy).toBe(true);
      expect(cells[0].rsvp).toBeNull();
    });

    it("keeps the disagreement when the benign invitation arrives first", async () => {
      // All-fs sorts after, so the honoured player invitation is seen first and
      // the disagreement has to displace it. This is the case that exercises
      // the promote branch, and the one that used to pass by luck: independent
      // review disabled the branch and all 3,154 tests stayed green.
      const { cells } = await runWith("ffffffff-ffff-4fff-8fff-ffffffffff81");

      expect(cells).toHaveLength(1);
      expect(cells[0].isDiscrepancy).toBe(true);
      expect(cells[0].rsvp).toBeNull();
    });

    it("counts the merged cell once, with the benign invitation first", async () => {
      const { row } = await runWith("ffffffff-ffff-4fff-8fff-ffffffffff82");

      expect(row?.problems).toBe(1);
    });
  });

  /**
   * The snapshot is immutable, so computing it twice from unchanged data must
   * produce the same bytes. Without an order on the query behind the grid, a
   * person with two invitations to one event could be filed either way round.
   */
  /**
   * The determinism above cannot fail for the reason it exists.
   *
   * Two identical queries in one session return the same physical order anyway,
   * so removing the `order by` leaves that test green — independent review
   * proved it. This one is structural, in the style of the M5 no-mutation scan
   * below: it fails deterministically and says what it means.
   *
   * The ordering is load-bearing twice over. It makes an immutable snapshot
   * reproducible, and it is what makes the two duplicate-invitation tests above
   * discriminate at all — without it the "benign arrives first" case degenerates
   * into the other one and passes trivially.
   */
  it("orders the query behind the grid, so a snapshot is reproducible", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("./weekly-report.ts", import.meta.url), "utf8");
    const query = source.slice(source.indexOf("const said = await tx.query"));

    expect(query.slice(0, query.indexOf("`,"))).toMatch(/order by i\.event_id, i\.id/);
  });

  it("computes the same content twice from unchanged data", async () => {
    const event = await occurredEvent(2);
    const invitations = await invitationsFor(event.id);
    await secondInvitationFor(event.id, invitations[0].id);
    await answer(invitations[0].id, "no", "Coursework deadline.");

    const first = await compute();
    const second = await compute();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("puts the people with the most discrepancies at the top", async () => {
    const first = await occurredEvent(2, {
      name: `${NAME_MARKER} Friday`,
      scheduledOn: "2027-03-19",
    });
    await occurredEvent(2, { name: `${NAME_MARKER} Monday`, scheduledOn: "2027-03-22" });

    // One of the two answers the first event and turns up, so they have one
    // discrepancy instead of two.
    const invitations = await invitationsFor(first.id);
    await answer(invitations[0].id, "yes", null);
    await recordAttendance(
      actorPersonId,
      first.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    const rows = (await compute()).grid.rows;
    expect(rows[0].problems).toBe(2);
    expect(rows[rows.length - 1].problems).toBe(1);
  });

  it("leaves out anybody the week went right for", async () => {
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
      "present",
    );

    const content = await compute();
    expect(content.grid.rows).toEqual([]);
    expect(content.walkUps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The dates the report prints — LAN-127 finding 1
// ---------------------------------------------------------------------------

/**
 * The report says the day the club actually met, in the club's own timezone.
 *
 * This suite forces `Europe/London` because the defect it guards is invisible
 * anywhere else. `pg` parses a `date` column into a `Date` at **local**
 * midnight; reading that back with UTC getters asks a different question, and
 * for any zone ahead of UTC the answer is the previous day. At UTC — CI, Cloud
 * Run — and at every negative offset the two readings agree, so a machine in
 * London was the only place this was visible. It shipped, and the whole suite
 * stayed green.
 *
 * Node applies a change to `process.env.TZ` to every `Date` created afterwards,
 * which is what makes this testable at all. The zone is restored afterwards so
 * nothing else in the worker inherits it.
 *
 * The driver parses under whichever zone is current when the query runs, so the
 * zone has to be set before the report is computed, not merely before the
 * assertion.
 */
describe("the dates the report prints, in the club's timezone", () => {
  const CLUB_ZONE = "Europe/London";

  /**
   * A summer date, and this suite does not work without one.
   *
   * The rest of this file reports on 2027-03-25 with its events on 2027-03-20 —
   * both of which fall **before** British Summer Time starts on 28 March 2027.
   * London is at UTC+0 then, local midnight and UTC midnight are the same
   * instant, and the two readings agree. A test written on those dates passes
   * whether or not the defect is present, which is exactly the trap that let
   * the defect ship.
   *
   * June is UTC+1, so these dates are the ones that can tell the difference.
   */
  const SUMMER_REPORT_ON = "2027-06-21";
  const SUMMER_EVENT_ON = "2027-06-16";
  const SUMMER_EVENT = `${NAME_MARKER} Club timezone practice`;

  let originalZone: string | undefined;

  beforeAll(() => {
    originalZone = process.env.TZ;
    process.env.TZ = CLUB_ZONE;
  });

  afterAll(() => {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  });

  it("gives an event the date it is actually scheduled on", async () => {
    const event = await occurredEvent(2, {
      name: SUMMER_EVENT,
      scheduledOn: SUMMER_EVENT_ON,
    });
    expect(event.scheduledOn).toBe(SUMMER_EVENT_ON);

    const entry = eventNamed(await compute(SUMMER_REPORT_ON), SUMMER_EVENT);

    // The exact day is the whole claim. Read with UTC getters this is
    // "2027-06-15", one day early, while every other assertion in this file
    // still passes.
    expect(entry.on).toBe(SUMMER_EVENT_ON);
  });

  /**
   * The windows keep working in the club's zone. This does **not** guard the
   * other half of the split — see the negative-offset suite below for why, and
   * for the assertion that does.
   */
  it("keeps the windows correct in the same timezone", () => {
    expect(reportWindow("2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(normaliseReportDate("2026-10-19")).toBe("2026-10-19");
  });

  /**
   * British Summer Time starts on 28 March 2027, inside the look-ahead of this
   * suite's reporting date — so the window arithmetic crosses an offset change
   * while the process is in a zone that observes one.
   */
  it("does not drift across the start of British Summer Time", () => {
    expect(reportWindow("2027-04-01")).toEqual({ from: "2027-03-25", to: "2027-03-31" });
    expect(lookaheadWindow("2027-03-25")).toEqual({ from: "2027-03-25", to: "2027-04-01" });
  });
});

/**
 * The other half of the split, guarded from the other side — LAN-127.
 *
 * `reportWindow`, `lookaheadWindow` and `normaliseReportDate` build their own
 * midnight-UTC instants and must keep reading them with UTC getters. The
 * asymmetry that makes this suite necessary: reading a midnight-UTC instant
 * with **local** getters gives the same calendar day at every offset at or
 * ahead of UTC, and the previous day only behind it. So the club's own zone
 * cannot see that mutation, and neither can UTC — which is what CI and Cloud
 * Run use, and therefore what every green run to date proved nothing about.
 *
 * Independent review caught exactly this: the first version of these tests was
 * checked by mutating `utcDay` and watching the suite fail, but the failures
 * came from the implementer's machine being at America/New_York. The same
 * mutation passes 55 of 55 under `TZ=UTC`.
 *
 * A zone behind UTC is therefore the only place the guard bites, so this suite
 * pins one. Between the two suites the split is now covered in both
 * directions on any runner: `asDate` proven from Europe/London, `utcDay`
 * proven from America/New_York.
 */
describe("the report windows, from a timezone behind UTC", () => {
  const WESTERN_ZONE = "America/New_York";
  let originalZone: string | undefined;

  beforeAll(() => {
    originalZone = process.env.TZ;
    process.env.TZ = WESTERN_ZONE;
  });

  afterAll(() => {
    if (originalZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalZone;
  });

  it("counts back seven days from the reporting date, not from the local evening before", () => {
    // Read with local getters at a negative offset these become 2026-10-11 and
    // 2026-10-17 — the whole window slides a day earlier.
    expect(reportWindow("2026-10-19")).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(reportWindow("2027-01-04")).toEqual({ from: "2026-12-28", to: "2027-01-03" });
  });

  it("looks ahead from the reporting date itself", () => {
    expect(lookaheadWindow("2027-03-25")).toEqual({ from: "2027-03-25", to: "2027-04-01" });
  });

  /**
   * `normaliseReportDate` round-trips the date it was given through the same
   * helper, so a local-getter reading makes it reject every valid date it is
   * handed — the report becomes unusable rather than subtly wrong.
   */
  it("still accepts a valid reporting date, and still refuses what PostgreSQL would take", () => {
    expect(normaliseReportDate("2026-10-19")).toBe("2026-10-19");
    expect(normaliseReportDate(" 2027-01-04 ")).toBe("2027-01-04");
    for (const value of ["yesterday", "19 October", "2026-13-01", "2026-02-30", "", "  "]) {
      expect(() => normaliseReportDate(value)).toThrow();
    }
  });
});

describe("the week ahead", () => {
  it("lists the reporting date and the seven days after it, and nothing behind", async () => {
    const behind = await occurredEvent(2, {
      name: `${NAME_MARKER} Behind`,
      scheduledOn: "2027-03-22",
    });
    const ahead = await approvedEvent(2, {
      name: `${NAME_MARKER} Ahead`,
      scheduledOn: "2027-03-28",
    });
    const beyond = await approvedEvent(2, {
      name: `${NAME_MARKER} Beyond`,
      scheduledOn: "2027-04-08",
    });

    const content = await compute();
    const ids = content.nextWeek.map((entry) => entry.id);

    expect(ids).toContain(ahead.id);
    expect(ids).not.toContain(behind.id);
    // One week, not three: the planning horizon is still LAN-109's.
    expect(ids).not.toContain(beyond.id);
  });

  it("says whether anything has gone out, and how many have answered", async () => {
    const event = await approvedEvent(3, {
      name: `${NAME_MARKER} Ahead`,
      scheduledOn: "2027-03-28",
    });
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);

    const upcoming = (await compute()).nextWeek.find((entry) => entry.id === event.id);
    expect(upcoming?.invited).toBe(3);
    expect(upcoming?.answered).toBe(1);
    expect(upcoming?.status).toBe("approved");
  });

  it("includes a draft, which has no invitations at all", async () => {
    const draftEvent = await createEventDraft(
      actorPersonId,
      draft({ name: `${NAME_MARKER} Draft ahead`, scheduledOn: "2027-03-28" }),
    );

    const upcoming = (await compute()).nextWeek.find((entry) => entry.id === draftEvent.id);
    expect(upcoming?.status).toBe("draft");
    expect(upcoming?.invited).toBe(0);
  });
});

describe("walk-ups and availability", () => {
  it("names a walk-up and the event they turned up to", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "07700 900081",
      email: null,
      presence: "present",
    });

    const walkUps = (await compute()).walkUps;
    expect(walkUps).toHaveLength(1);
    expect(walkUps[0].event).toBe(`${NAME_MARKER} Wednesday practice`);
  });

  it("lists everybody whose availability is not green, and nobody who is", async () => {
    await occurredEvent();
    const content = await compute();

    const direct = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.current_availability
        where season_id = $1 and level <> 'green'`,
      [seasonId],
    );
    expect(content.availability).toHaveLength(Number(direct.rows[0].count));
    expect(content.availability.length).toBeGreaterThan(0);
    expect(content.availability.every((entry) => entry.level !== "green")).toBe(true);

    // A level and two dates. There is no note, because the schema has no column
    // that could hold one.
    expect(Object.keys(content.availability[0]).sort()).toEqual([
      "level",
      "person",
      "reviewOn",
      "since",
    ]);
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
    expect(content.lastWeek.map((entry) => entry.id)).toContain(event.id);
    expect(eventNamed(content, `${NAME_MARKER} Wednesday practice`).status).toBe("occurred");
    expect(eventNamed(content, `${NAME_MARKER} Wednesday practice`).respondedYes).toBe(1);
    expect(content.attendance.present).toBe(1);
  });

  it("gives onboarding a column per item and a row per member who owes one", async () => {
    await occurredEvent();
    const content = await compute();

    // Every item the club has, not only the required ones — Brian's
    // instruction, and the reason subscription paid is visible at all.
    const types = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.onboarding_item_types where season_id = $1`,
      [seasonId],
    );
    expect(content.onboarding.columns).toHaveLength(Number(types.rows[0].count));
    expect(content.onboarding.columns.map((column) => column.code)).toContain("subs_paid");

    const owing = await observer.query<{ count: string }>(
      `select count(distinct m.person_id)::text as count
         from public.onboarding_items oi
         join public.season_memberships m on m.id = oi.season_membership_id
        where m.season_id = $1 and m.status in ('onboarding', 'active')
          and oi.status not in ('complete', 'waived', 'not_applicable')`,
      [seasonId],
    );
    expect(content.onboarding.rows).toHaveLength(Number(owing.rows[0].count));
    expect(content.onboarding.rows.length).toBeGreaterThan(0);
  });

  it("counts what a member still owes out of what actually applies to them", async () => {
    await occurredEvent();
    const row = (await compute()).onboarding.rows[0];

    expect(row.outstanding).toBe(row.cells.filter((cell) => cell.isOutstanding).length);
    expect(row.applicable).toBe(
      row.cells.filter((cell) => cell.status !== "not_applicable").length,
    );
    // Not applicable is not something anybody has to do, so it is not part of
    // the denominator either.
    expect(row.applicable).toBeLessThanOrEqual(row.cells.length);
    expect(row.outstanding).toBeGreaterThan(0);
  });

  it("treats done, waived and not-applicable as settled, and nothing else", async () => {
    await occurredEvent();
    const cells = (await compute()).onboarding.rows.flatMap((row) => row.cells);

    for (const cell of cells) {
      const settled = ["complete", "waived", "not_applicable"].includes(cell.status);
      expect(cell.isOutstanding).toBe(!settled);
    }
  });

  it("puts the member who owes the largest share of their list first", async () => {
    await occurredEvent();
    const rows = (await compute()).onboarding.rows;

    const share = (row: (typeof rows)[number]) =>
      row.applicable === 0 ? 0 : row.outstanding / row.applicable;
    for (let at = 1; at < rows.length; at += 1) {
      expect(share(rows[at - 1])).toBeGreaterThanOrEqual(share(rows[at]));
    }
  });

  it("leaves out anybody with nothing outstanding", async () => {
    await occurredEvent();
    const rows = (await compute()).onboarding.rows;

    expect(rows.every((row) => row.outstanding > 0)).toBe(true);
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
      expect(content.availabilityCounts[row.level as "green" | "orange" | "red"]).toBe(
        Number(row.tally),
      );
    }

    // Three numbers, and nothing else. A note, a narrative or a free-text field
    // would have to appear as a fourth key.
    expect(Object.keys(content.availabilityCounts).sort()).toEqual(["green", "orange", "red"]);
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
    expect(content.lastWeek.map((entry) => entry.id)).toContain(informational.id);
    expect(content.lastWeek.find((entry) => entry.id === informational.id)?.solicitsResponse).toBe(
      false,
    );

    // And nobody is being chased about it.
    expect(content.grid.columns.map((column) => column.eventId)).not.toContain(informational.id);
    expect(content.grid.columns.map((column) => column.eventId)).not.toContain(informational.id);

    // Non-vacuous: an otherwise identical soliciting event does produce chases.
    const soliciting = await approvedEvent(3, { name: `${NAME_MARKER} Wednesday practice` });
    const withBoth = await compute();
    expect(withBoth.grid.columns.map((column) => column.eventId)).toContain(soliciting.id);
    expect(withBoth.grid.columns.map((column) => column.eventId)).toContain(soliciting.id);
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
    expect(
      stored?.grid.rows.flatMap((row) => row.cells.filter((cell) => cell.rsvp === "no")),
    ).toHaveLength(1);

    // Change the world underneath it: two more people decline.
    await answer(invitations[1].id, "no", "Injured.");
    await answer(invitations[2].id, "no", "Working.");

    // The recomputed picture moved.
    expect(
      (await compute()).grid.rows.flatMap((row) => row.cells.filter((cell) => cell.rsvp === "no")),
    ).toHaveLength(3);

    // The snapshot did not. This is the whole of M5.
    const reread = parseReportContent((await readStoredReport(generated.id)).content);
    expect(
      reread?.grid.rows.flatMap((row) => row.cells.filter((cell) => cell.rsvp === "no")),
    ).toHaveLength(1);
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
  it("files one on the first look, because there is nothing else to show", async () => {
    await occurredEvent();
    expect(await readCurrentReport(REPORT_ON)).toBeNull();

    const first = await readReportForDate(actorPersonId, REPORT_ON);
    expect(first.version).toBe(1);
  });

  it("shows what is on file when somebody arrives, sorts or refreshes", async () => {
    await occurredEvent();
    const first = await readReportForDate(actorPersonId, REPORT_ON);

    const second = await readReportForDate(actorPersonId, REPORT_ON);
    const third = await readReportForDate(actorPersonId, REPORT_ON);

    // The same row, three times. Landing on the route, re-sorting a grid and
    // refreshing are all reads.
    expect(second.id).toBe(first.id);
    expect(third.id).toBe(first.id);
    expect(await listReportVersions(REPORT_ON)).toHaveLength(1);
  });

  /**
   * Brian's decision of 15 August 2026, once the cost was measured: a snapshot
   * is 6.6 KB and 36 ms, so pressing the button files one every time.
   */
  it("files a new one every time Show Report is pressed", async () => {
    await occurredEvent();

    const first = await readReportForDate(actorPersonId, REPORT_ON, { fileNew: true });
    const second = await readReportForDate(actorPersonId, REPORT_ON, { fileNew: true });
    const third = await readReportForDate(actorPersonId, REPORT_ON, { fileNew: true });

    expect([first.version, second.version, third.version]).toEqual([1, 2, 3]);
    expect(second.supersedesId).toBe(first.id);
    expect(third.supersedesId).toBe(second.id);
    expect(await listReportVersions(REPORT_ON)).toHaveLength(3);
  });

  it("returns the stored snapshot, not a recomputation, until the next press", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away at a conference.");

    const first = await readReportForDate(actorPersonId, REPORT_ON);
    expect(
      parseReportContent(first.content)?.grid.rows.flatMap((row) =>
        row.cells.filter((cell) => cell.rsvp === "no"),
      ),
    ).toHaveLength(1);

    await answer(invitations[1].id, "no", "Injured.");

    // A plain read still shows what was filed.
    const again = await readReportForDate(actorPersonId, REPORT_ON);
    expect(again.id).toBe(first.id);
    expect(
      parseReportContent(again.content)?.grid.rows.flatMap((row) =>
        row.cells.filter((cell) => cell.rsvp === "no"),
      ),
    ).toHaveLength(1);

    // Pressing the button files the newer picture, and leaves the older one
    // exactly where it is — which is the whole of M5.
    const pressed = await readReportForDate(actorPersonId, REPORT_ON, { fileNew: true });
    expect(pressed.id).not.toBe(first.id);
    expect(
      parseReportContent(pressed.content)?.grid.rows.flatMap((row) =>
        row.cells.filter((cell) => cell.rsvp === "no"),
      ),
    ).toHaveLength(2);
    expect(
      parseReportContent((await readStoredReport(first.id)).content)?.grid.rows.flatMap((row) =>
        row.cells.filter((cell) => cell.rsvp === "no"),
      ),
    ).toHaveLength(1);
  });

  it("files a fresh snapshot when the newest was written under earlier definitions", async () => {
    // Brian opened the report on the morning the definitions changed and got an
    // empty screen: a snapshot filed hours earlier under the previous set was
    // handed back, and this build cannot organise its shape. Without the
    // version term in the reuse condition that happens on every definitions
    // change, to whoever looks first, until somebody presses the button.
    await occurredEvent();

    const stale = await observer.query<{ id: string }>(
      `insert into public.weekly_reports
         (season_id, report_on, version, metric_definition_version, data_as_of,
          generated_by_person_id, content)
       values ($1, $2::date, 1, 'LAN-81.4', now(), $3,
               '{"schema": "lancers.monday-report.v4", "lastWeek": []}'::jsonb)
       returning id`,
      [seasonId, REPORT_ON, actorPersonId],
    );

    const opened = await readReportForDate(actorPersonId, REPORT_ON);

    expect(opened.id).not.toBe(stale.rows[0].id);
    expect(opened.metricDefinitionVersion).toBe(METRIC_DEFINITION_VERSION);
    expect(opened.version).toBe(2);
    expect(opened.supersedesId).toBe(stale.rows[0].id);
    // And it is readable, which is the whole point.
    expect(parseReportContent(opened.content)).not.toBeNull();

    // The older row is untouched. It is still what leadership saw under those
    // definitions, and M5 does not permit rewriting it to tidy this up.
    const kept = await readStoredReport(stale.rows[0].id);
    expect(kept.metricDefinitionVersion).toBe("LAN-81.4");
    expect(parseReportContent(kept.content)).toBeNull();
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
      parseReportContent({ schema: "lancers.monday-report.v4", lastWeek: [], nextWeek: [] }),
    ).toBeNull();
    expect(
      parseReportContent({
        schema: REPORT_CONTENT_SCHEMA,
        lastWeek: [],
        nextWeek: [],
        grid: { columns: [], rows: [] },
        reportOn: "2027-03-25",
      }),
    ).not.toBeNull();
  });
});
