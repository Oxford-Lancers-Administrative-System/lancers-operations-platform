// @vitest-environment node
/**
 * Attendance, the occurrence assertion, and the wall between RSVP and
 * attendance — LAN-80.
 *
 * Against the **real** local database, because almost everything asserted here
 * is a property of PostgreSQL honouring the schema: a cascading composite
 * foreign key that makes attendance against a draft impossible, a check
 * constraint that refuses a player anchored to a person, a partial unique index
 * that makes "one row per participant per event" true rather than intended, and
 * a view that computes the club's definition of a mismatch. A mocked
 * transaction can demonstrate none of it.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`, unique to this
 * file — Vitest runs suites in parallel against one database, and a shared
 * marker means one suite deleting another's fixtures mid-test.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import {
  ATTENDANCE_CLOSED_MESSAGE,
  ATTENDANCE_TOO_EARLY_MESSAGE,
  eventStartInstant,
  PARTICIPANT_NOT_FOUND_MESSAGE,
  readAttendanceBoard,
  readEventAttendanceSummary,
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
  summariseAttendance,
  WALK_UP_FAMILY_NAME_REQUIRED,
  WALK_UP_GIVEN_NAME_REQUIRED,
  WALK_UP_PHONE_REQUIRED,
} from "./attendance";
import { formatShowedAgainstInvited } from "@/app/operate/events/[id]/attendance/presentation";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn } from "./event-audience";
import { createEventDraft, type EventDraftInput } from "./events";
import { withTransaction } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN80AttendanceSuite";

let observer: Client;
let actorPersonId: string;
let secondActorPersonId: string;
let seededPeople: Set<string>;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [await seededIdentityCreatedAt(observer)],
  );
  seededPeople = new Set(people.rows.map((row) => row.id));

  // A pass produced by an empty cohort is not a pass.
  expect(seededPeople.size).toBeGreaterThan(20);

  actorPersonId = people.rows[0].id;
  secondActorPersonId = people.rows[1].id;
});

/**
 * Dependency order. Attendance and responses hang off the event and the
 * invitations; the walk-up people this suite mints are deleted last, and only
 * the ones it minted — they carry the marker in their family name.
 *
 * The audit rows go **before** the attendance they describe, and are scoped to
 * this suite's own events. Both halves matter, and one of them was wrong: the
 * attendance clause used to read `or (entity_table = 'attendance_records')`
 * with no scope at all, so every run of this hook deleted every attendance
 * audit row in the database — including rows another suite had written seconds
 * earlier and was about to assert on. Vitest runs files in parallel against one
 * shared database, so that is not a hypothetical: `tests/slice-walkthrough.test.ts`
 * counts the four audit rows its coach writes, and would intermittently find
 * one, two or three of them, on CI and locally, for a reason nowhere near the
 * code under test.
 *
 * It could not simply be scoped where it stood, because by then the attendance
 * rows it would have keyed on were already deleted. Deleting the audit first,
 * as `tests/pilot-scenario-lan-80.test.ts` and `-110` already do, is what makes
 * the scope expressible at all.
 */
afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(
    `delete from public.rsvp_responses where invitation_id in
       (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  // LAN-169. The plan an approval freezes, and any flag its chase raised,
  // both reference their event with `on delete restrict` — so they go before
  // the event does, in the same dependency order the lines below already keep.
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in
         (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.audit_events
      where (entity_table = 'events' and entity_id in ${events})
         or (entity_table = 'attendance_records'
             and entity_id in (select id from public.attendance_records
                                where event_id in ${events}))`,
    [scope],
  );
  await observer.query(`delete from public.attendance_records where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query("delete from public.events where name like $1", [scope]);
  await observer.query(
    "delete from public.contact_points where person_id in (select id from public.people where family_name = $1)",
    [NAME_MARKER],
  );
  // A walk-on now leaves a recruitment prospect behind, and `person_id` is
  // `on delete restrict` — so without this the person delete below fails, the
  // hook aborts, and every later test in the file inherits the leftovers.
  await observer.query(
    "delete from public.recruitment_prospects where person_id in (select id from public.people where family_name = $1)",
    [NAME_MARKER],
  );
  await observer.query("delete from public.people where family_name = $1", [NAME_MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Wednesday practice`,
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    deliveryMode: "in_person",
    description: null,
    requiredEquipment: null,
    joiningUrl: null,
    ...overrides,
  };
}

/**
 * A draft, an audience of `size` seeded players, and an approval — the state
 * every test here starts from, because attendance needs an approved event and
 * its invitations before it needs anything else.
 */
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

/**
 * The same, on a date that has been and gone.
 *
 * Nobody asserts occurrence any more (D30), so this helper does nothing but
 * move the date. That is deliberate: if it had to call something, the assertion
 * would still exist.
 *
 * The date is relative to the clock rather than fixed, for two reasons that
 * point the same way. The answer being arranged is itself relative to the clock
 * — an event has occurred when its date has passed — and D71's buffer, which
 * decides whether the register is open, is relative to it too. A fixed date in
 * a file that keeps being run later drifts out of both.
 */
async function occurredEvent(size = 3) {
  return approvedEvent(size, { scheduledOn: daysFromToday(-7) });
}

/** `YYYY-MM-DD`, `offset` days from today in the club's own zone. */
function daysFromToday(offset: number): string {
  const day = new Date(`${todayInClubZone()}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + offset);
  return day.toISOString().slice(0, 10);
}

async function participants(eventId: string) {
  const board = await readAttendanceBoard(eventId);
  return board.participants;
}

function failure(error: unknown): ServiceError {
  if (!isServiceError(error)) throw error;
  return error;
}

async function expectRefused(action: Promise<unknown>): Promise<ServiceError> {
  try {
    await action;
  } catch (error) {
    return failure(error);
  }
  throw new Error("Expected the service to refuse this, and it did not.");
}

async function attendanceRows(eventId: string) {
  const result = await observer.query<{
    capacity: string;
    season_membership_id: string | null;
    person_id: string | null;
    presence: string;
    event_status: string;
    recorded_by_person_id: string | null;
  }>(
    `select capacity::text as capacity, season_membership_id, person_id,
            presence::text as presence, event_status::text as event_status,
            recorded_by_person_id
       from public.attendance_records where event_id = $1 order by recorded_at`,
    [eventId],
  );
  return result.rows;
}

async function auditFor(eventId: string, action: string) {
  const result = await observer.query<{
    actor_person_id: string | null;
    from_state: string | null;
    to_state: string | null;
    reason: string | null;
  }>(
    `select actor_person_id, from_state, to_state, reason
       from public.audit_events
      where action = $2
        and (entity_id = $1
             or entity_id in (select id from public.attendance_records where event_id = $1)
             or context->>'eventId' = $1::text)
      order by occurred_at`,
    [eventId, action],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// D30 — occurrence is derived, and nobody asserts it
// ---------------------------------------------------------------------------

/*
 * Two describe blocks stood here: "the occurrence assertion" and "correcting an
 * occurrence assertion". LAN-151 removed both with the thing they tested.
 *
 * Invariant E5 said the passage of time never equals occurrence and only a
 * person could say an event had happened. D30 reverses exactly that: an event
 * has occurred when its date has passed and it was not cancelled, nothing
 * stores it, and there is no *Mark occurred*, *Mark not held*, *Confirm what
 * happened* or *Correct this to not held* anywhere in the application.
 *
 * There is correspondingly nothing to correct. What the correction path existed
 * for — an operator who pressed the wrong button on the wrong event — cannot
 * happen, because there is no button.
 */

describe("occurrence, derived", () => {
  it("opens the register for an approved event whose date has passed", async () => {
    const event = await occurredEvent();

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(true);
    expect(board.participants.length).toBeGreaterThan(0);
  });

  it("leaves it shut for an approved event that has not happened yet", async () => {
    const event = await approvedEvent(3, { scheduledOn: daysFromToday(7) });

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(false);
    expect(board.participants).toEqual([]);
  });

  it("stores nothing about it — the event row is untouched by the passing date", async () => {
    const event = await occurredEvent();

    // Both halves matter. The status is what it always was, and the columns
    // that used to record who asserted occurrence are gone from the schema
    // rather than merely unwritten.
    const stored = await observer.query<{ status: string; columns: string }>(
      `select e.status::text as status,
              (select count(*)::text from information_schema.columns
                where table_schema = 'public' and table_name = 'events'
                  and column_name in ('outcome_recorded_at', 'outcome_recorded_by_person_id'))
                as columns
         from public.events e where e.id = $1`,
      [event.id],
    );
    expect(stored.rows[0].status).toBe("approved");
    expect(stored.rows[0].columns).toBe("0");
  });

  it("writes no audit row, because nobody did anything", async () => {
    const event = await occurredEvent();

    for (const action of [
      "event.marked_occurred",
      "event.marked_not_held",
      "event.occurrence_corrected",
    ]) {
      expect(await auditFor(event.id, action), action).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant P5 — attendance requires an event that has occurred
// ---------------------------------------------------------------------------

describe("the attendance gate", () => {
  it("refuses a write against an approved event whose register has not opened", async () => {
    const event = await approvedEvent(3, { scheduledOn: daysFromToday(7) });
    const board = await readAttendanceBoard(event.id);

    expect(board.isOpen).toBe(false);
    expect(board.closedReason).toBe("before_buffer");
    expect(board.participants).toEqual([]);

    // The board is closed, so it names nobody — which is exactly the state a
    // caller bypassing the screen would be in. A key that cannot be produced is
    // still refused for the right reason: the event, not the participant.
    //
    // And the refusal says which of the two closed states this is. The write
    // path asks `closedReasonFor`, the same function the board asks, so a
    // screen cannot offer a sheet the save then refuses — the defect LAN-152
    // found on the event page, kept fixed here on the way in.
    const error = await expectRefused(
      recordAttendance(
        actorPersonId,
        event.id,
        "player:00000000-0000-4000-8000-000000000000",
        "present",
      ),
    );
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toBe(ATTENDANCE_TOO_EARLY_MESSAGE);
    expect(await attendanceRows(event.id)).toEqual([]);
  });

  it("accepts a write once the buffer has lifted, though the event is still on", async () => {
    // D71's whole point: the person taking a register is standing at the pitch
    // as people arrive, so the sheet opens before the evening is over. Asked at
    // a stated instant rather than at whatever the clock says during the run.
    const scheduledOn = daysFromToday(7);
    const event = await approvedEvent(3, { scheduledOn });
    // Kick-off itself: hours after the buffer lifted and before the evening is
    // over, which is the window the old "its date has passed" rule refused.
    const kickOff = eventStartInstant({ scheduledOn, startsAt: "20:00" })!;

    const board = await readAttendanceBoard(event.id, kickOff);
    const target = board.participants[0];

    expect(board.isOpen).toBe(true);
    expect(target).toBeDefined();

    const recorded = await recordAttendance(
      actorPersonId,
      event.id,
      target.key,
      "present",
      kickOff,
    );

    expect(recorded.presence).toBe("present");
  });

  it("refuses a write against a draft, past date or not", async () => {
    // The database's half of P5 as well as the service's: a draft was never
    // held, and `attendance_records_require_an_approved_event` would refuse the
    // row even if this check were removed.
    const event = await createEventDraft(actorPersonId, draft({ scheduledOn: daysFromToday(-7) }));

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(false);

    const error = await expectRefused(
      recordAttendance(
        actorPersonId,
        event.id,
        "player:00000000-0000-4000-8000-000000000000",
        "present",
      ),
    );
    expect(error.kind).toBe("invalid_transition");
    // A-4: the text, not only the reason code. The import was here and unused
    // after the merge, which is exactly what an unasserted message looks like —
    // the sentence a recorder is shown could have changed to anything.
    expect(error.message).toBe(ATTENDANCE_CLOSED_MESSAGE);
    expect(await attendanceRows(event.id)).toEqual([]);
  });

  it("refuses a write against a cancelled event whose date has passed", async () => {
    const event = await occurredEvent();
    // No application path produces `cancelled` yet — W6 is a later work package
    // in this mission — so the state is created directly. The refusal under
    // test is the service's, and it must not depend on how the event got there.
    // The date has passed, so only the cancellation can be what shuts this.
    await observer.query(
      `update public.events
          set status = 'cancelled', decision_reason = 'Pitch unavailable'
        where id = $1`,
      [event.id],
    );

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(false);

    const error = await expectRefused(
      recordAttendance(
        actorPersonId,
        event.id,
        "player:00000000-0000-4000-8000-000000000000",
        "present",
      ),
    );
    expect(error.kind).toBe("invalid_transition");
    expect(await attendanceRows(event.id)).toEqual([]);
  });

  it("refuses a participant this event never invited and never recorded", async () => {
    const event = await occurredEvent();
    const foreign = await observer.query<{ id: string }>(
      `select sm.id from public.season_memberships sm
        where not exists (select 1 from public.invitations i
                           where i.event_id = $1 and i.season_membership_id = sm.id)
        limit 1`,
      [event.id],
    );

    const error = await expectRefused(
      recordAttendance(actorPersonId, event.id, `player:${foreign.rows[0].id}`, "present"),
    );

    expect(error.kind).toBe("not_found");
    expect(error.message).toBe(PARTICIPANT_NOT_FOUND_MESSAGE);
    expect(await attendanceRows(event.id)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Recording and correcting
// ---------------------------------------------------------------------------

describe("recording attendance", () => {
  it("writes the row with the player's membership anchor and the operator", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);

    const saved = await recordAttendance(actorPersonId, event.id, first.key, "present");
    expect(saved.presence).toBe("present");
    expect(saved.previousPresence).toBeNull();

    const rows = await attendanceRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      capacity: "player",
      person_id: null,
      presence: "present",
      event_status: "approved",
      recorded_by_person_id: actorPersonId,
    });
    // Invariant P8: the anchor is the membership, and the person column is null.
    expect(rows[0].season_membership_id).not.toBeNull();

    const audit = await auditFor(event.id, "attendance.recorded");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_person_id: actorPersonId,
      from_state: null,
      to_state: "present",
    });
  });

  it("accepts all four states", async () => {
    const event = await occurredEvent();
    const board = await participants(event.id);

    for (const [index, presence] of (["present", "late", "excused", "absent"] as const).entries()) {
      const target = board[index % board.length];
      const saved = await recordAttendance(actorPersonId, event.id, target.key, presence);
      expect(saved.presence).toBe(presence);
    }
  });

  it("corrects in place, keeps one row, and keeps the earlier value in the audit", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);

    await recordAttendance(actorPersonId, event.id, first.key, "absent");
    const corrected = await recordAttendance(actorPersonId, event.id, first.key, "present");

    expect(corrected.previousPresence).toBe("absent");
    expect(await attendanceRows(event.id)).toHaveLength(1);

    const audit = await auditFor(event.id, "attendance.corrected");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ from_state: "absent", to_state: "present" });
  });

  it("shows the latest committed value and its actor when two recorders disagree", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);

    await recordAttendance(actorPersonId, event.id, first.key, "absent");
    await recordAttendance(secondActorPersonId, event.id, first.key, "late");

    const rows = await attendanceRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].presence).toBe("late");
    expect(rows[0].recorded_by_person_id).toBe(secondActorPersonId);

    const board = await readAttendanceBoard(event.id);
    const line = board.participants.find((participant) => participant.key === first.key);
    expect(line?.presence).toBe("late");
    expect(line?.recordedByName).not.toBeNull();

    // The earlier value is not lost. Both writes are in the trail, in order.
    const trail = await auditFor(event.id, "attendance.corrected");
    expect(trail).toHaveLength(1);
    expect(trail[0]).toMatchObject({ from_state: "absent", to_state: "late" });
  });

  it("refuses a state the enum has no member for", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);

    const error = await expectRefused(
      // The cast is the point: this is what a hand-rolled caller or a posted
      // form value looks like when it is wrong, and the service refuses it
      // before the database has to.
      recordAttendance(actorPersonId, event.id, first.key, "showed_up" as never),
    );
    expect(error.kind).toBe("constraint_violated");
    expect(await attendanceRows(event.id)).toEqual([]);
  });
});

describe("removing a recorded attendance", () => {
  it("deletes the row, reports what it removed, and audits it", async () => {
    // Not an edit to `absent`: the two say different things. "Absent" is an
    // observation somebody made; removal is the correction of a row that should
    // never have been written, and the audit trail is what tells them apart.
    const event = await occurredEvent();
    const [first] = await participants(event.id);
    await recordAttendance(actorPersonId, event.id, first.key, "late");

    const removed = await removeAttendance(actorPersonId, event.id, first.key);
    expect(removed.removedPresence).toBe("late");
    expect(await attendanceRows(event.id)).toEqual([]);

    const audit = await auditFor(event.id, "attendance.removed");
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_person_id).toBe(actorPersonId);

    // And the board shows them unrecorded again, rather than absent.
    const [again] = await participants(event.id);
    expect(again.presence).toBeNull();
  });

  it("refuses a person this event has no attendance for", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);

    const error = await expectRefused(removeAttendance(actorPersonId, event.id, first.key));
    expect(error.kind).toBe("not_found");
  });

  it("refuses a removal against an event whose register has not opened", async () => {
    const event = await approvedEvent(3, { scheduledOn: daysFromToday(7) });

    const error = await expectRefused(
      removeAttendance(actorPersonId, event.id, "player:00000000-0000-4000-8000-000000000000"),
    );
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toBe(ATTENDANCE_TOO_EARLY_MESSAGE);
  });
});

// ---------------------------------------------------------------------------
// Invariant P6 — the walk-up
// ---------------------------------------------------------------------------

/**
 * The walk-on — invariant P6, and Brian's 14 August 2026 rebuild of it.
 *
 * It used to mint a bare person and nothing else. It now creates the person,
 * their contact points and a **recruitment prospect**, and still no season
 * membership: "not in the roster, not in the season roster, but in the person
 * in the recruitment… they're not on the team yet."
 */
describe("walk-ons", () => {
  const WALK_ON = {
    givenName: "Devon",
    familyName: NAME_MARKER,
    phone: "+44 7700 900105",
    email: "devon@example.ac.ox",
    presence: "present" as const,
  };

  /** The person this scenario minted, by the marker their surname carries. */
  async function mintedPerson() {
    const result = await observer.query<{ id: string; given_name: string; family_name: string }>(
      "select id, given_name, family_name from public.people where family_name = $1",
      [NAME_MARKER],
    );
    return result.rows;
  }

  it("records somebody who was never invited, at recruit capacity", async () => {
    const event = await occurredEvent();

    const saved = await recordWalkUpAttendance(actorPersonId, event.id, WALK_ON);

    expect(saved.presence).toBe("present");

    const rows = await attendanceRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ capacity: "recruit", season_membership_id: null });
    expect(rows[0].person_id).not.toBeNull();

    // Invariant P6, stated the way the schema states it: no invitation exists,
    // and none was created to make the attendance legal.
    const invitations = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.invitations
        where event_id = $1 and person_id = $2`,
      [event.id, rows[0].person_id],
    );
    expect(Number(invitations.rows[0].count)).toBe(0);

    const board = await readAttendanceBoard(event.id);
    const walkUp = board.participants.find((participant) => participant.isWalkUp);
    expect(walkUp?.presence).toBe("present");
    expect(board.walkUpCount).toBe(1);
  });

  it("stores the first and last name as two columns, not one string split apart", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, WALK_ON);

    const people = await mintedPerson();
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ given_name: "Devon", family_name: NAME_MARKER });
  });

  it("creates a recruitment prospect against the event's season, and no membership", async () => {
    // The change Brian asked for. They are somebody to follow up, not somebody
    // on the team sheet that then has to be taken off again.
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, WALK_ON);

    const person = (await mintedPerson())[0];

    const prospect = await observer.query<{
      season_id: string;
      status: string;
      source: string;
      first_contact_on: Date;
      converted_membership_id: string | null;
    }>(
      `select season_id, status::text as status, source, first_contact_on,
              converted_membership_id
         from public.recruitment_prospects where person_id = $1`,
      [person.id],
    );

    expect(prospect.rows).toHaveLength(1);
    expect(prospect.rows[0].season_id).toBe(event.seasonId);
    expect(prospect.rows[0].status).toBe("identified");
    expect(prospect.rows[0].source).toContain("Walk-up");
    expect(prospect.rows[0].converted_membership_id).toBeNull();

    const memberships = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.season_memberships where person_id = $1",
      [person.id],
    );
    expect(Number(memberships.rows[0].count), "no membership is created").toBe(0);
  });

  it("stores both contact points exactly as they were given", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      ...WALK_ON,
      phone: " +44 7700 900105 ",
      email: " devon@example.ac.ox ",
    });

    const contact = await observer.query<{
      kind: string;
      raw_value: string;
      is_preferred: boolean;
    }>(
      `select kind::text as kind, raw_value, is_preferred from public.contact_points
        where person_id in (select id from public.people where family_name = $1)
        order by kind`,
      [NAME_MARKER],
    );

    expect(contact.rows).toHaveLength(2);
    // Trimmed at the edges and otherwise untouched: `raw_value` has no format
    // constraint on purpose, so `devon@example.ac.ox` — not a real domain —
    // survives exactly as typed, and normalisation stays a separate reversible
    // step. Only the surrounding whitespace goes.
    expect(contact.rows[0]).toMatchObject({ kind: "email", raw_value: "devon@example.ac.ox" });
    expect(contact.rows[1]).toMatchObject({
      kind: "phone",
      raw_value: "+44 7700 900105",
      is_preferred: true,
    });
  });

  it("records the phone alone when no email was given", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, { ...WALK_ON, email: null });

    const contact = await observer.query<{ kind: string }>(
      `select kind::text as kind from public.contact_points
        where person_id in (select id from public.people where family_name = $1)`,
      [NAME_MARKER],
    );
    expect(contact.rows.map((row) => row.kind)).toEqual(["phone"]);
  });

  it.each([
    ["givenName", WALK_UP_GIVEN_NAME_REQUIRED],
    ["familyName", WALK_UP_FAMILY_NAME_REQUIRED],
    ["phone", WALK_UP_PHONE_REQUIRED],
  ] as const)("requires the %s, and writes nothing without it", async (field, message) => {
    // Stricter than the returner intake, deliberately: a walk-on with no
    // surname and no number is a row nobody can follow up.
    const event = await occurredEvent();

    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, { ...WALK_ON, [field]: "   " }),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(error.message).toBe(message);
    expect(await attendanceRows(event.id)).toEqual([]);
    expect(await mintedPerson()).toEqual([]);
  });

  it("refuses a phone number with no digits in it, and writes nothing", async () => {
    const event = await occurredEvent();
    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, { ...WALK_ON, phone: "ask Sam" }),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(await attendanceRows(event.id)).toEqual([]);
    expect(await mintedPerson()).toEqual([]);
  });

  it("refuses an address with no @, and writes nothing", async () => {
    const event = await occurredEvent();
    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, { ...WALK_ON, email: "devon at example" }),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(await attendanceRows(event.id)).toEqual([]);
    expect(await mintedPerson()).toEqual([]);
  });

  it("accepts the messy contacts the club's real files contain", async () => {
    // As forgiving as LAN-74's intake, for the recorded reason: a contact the
    // club cannot store is a contact the club loses.
    const event = await occurredEvent();

    await recordWalkUpAttendance(actorPersonId, event.id, {
      ...WALK_ON,
      phone: "07700 90010",
      email: "devon@example.ac.ox",
    });

    expect(await attendanceRows(event.id)).toHaveLength(1);
  });

  /**
   * The person, the contacts and the prospect are one act with the attendance
   * row, and this is the only test that proves it.
   *
   * The failure has to happen **inside** the transaction, after
   * `mintWalkUpProspect` has written. An earlier version of this test injected
   * an invalid `presence`, which `requirePresence` rejects thirteen lines
   * before `withTransaction` opens — so it asserted that nothing was written by
   * a call that had executed no SQL, and would have stayed green if the prospect
   * were committed on its own connection. Independent review caught it.
   *
   * An unresolvable actor does the job: `requireActor` only checks the string
   * is not blank, so a syntactically valid id that matches no person passes
   * every check and then violates `attendance_records.recorded_by_person_id`'s
   * foreign key on the last insert of the transaction.
   */
  it("leaves nothing behind when the write fails inside the transaction", async () => {
    const event = await occurredEvent();
    const strangerId = "00000000-0000-4000-8000-0000000000ff";

    await expectRefused(recordWalkUpAttendance(strangerId, event.id, WALK_ON));

    expect(await attendanceRows(event.id)).toEqual([]);
    expect(await mintedPerson(), "the person must be rolled back too").toEqual([]);

    // Both scoped to this suite's own marker, not to the whole database. Vitest
    // runs suites in parallel against one stack, and the local stack is also
    // the review environment — a global count would report on whatever somebody
    // else had just done.
    for (const table of ["recruitment_prospects", "contact_points"] as const) {
      const rows = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.${table}
          where person_id in (select id from public.people where family_name = $1)`,
        [NAME_MARKER],
      );
      expect(Number(rows.rows[0].count), `${table} must be rolled back`).toBe(0);
    }
  });

  it("still refuses a blank actor before it opens a transaction", async () => {
    // The cheap guard is still there, and still fires first. Kept as its own
    // case so the test above stays honestly about the transaction boundary
    // rather than quietly covering two different refusals.
    const event = await occurredEvent();

    const error = await expectRefused(recordWalkUpAttendance("   ", event.id, WALK_ON));

    expect(error.kind).toBe("constraint_violated");
    expect(await mintedPerson()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Locked Requirement 7 — a Yes never becomes a Present
// ---------------------------------------------------------------------------

describe("the wall between RSVP and attendance", () => {
  async function answer(invitationId: string, response: "yes" | "no", reason: string | null) {
    await observer.query(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at)
       values ($1, $2::public.rsvp_value, $3, 'operator', now())`,
      [invitationId, response, reason],
    );
  }

  async function invitationsFor(eventId: string) {
    const result = await observer.query<{ id: string; season_membership_id: string }>(
      "select id, season_membership_id from public.invitations where event_id = $1 order by id",
      [eventId],
    );
    return result.rows;
  }

  it("leaves a yes responder with no attendance record at all", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "yes", null);

    // Nothing is recorded. The point is that reading the board — the one place
    // an RSVP and an attendance appear together — creates nothing.
    const board = await readAttendanceBoard(event.id);
    const line = board.participants.find(
      (participant) => participant.key === `player:${invitations[0].season_membership_id}`,
    );
    expect(line?.rsvp).toBe("yes");
    expect(line?.presence).toBeNull();

    expect(await attendanceRows(event.id)).toEqual([]);
  });

  it("never puts an RSVP reason in the attendance payload", async () => {
    const event = await occurredEvent();
    const invitations = await invitationsFor(event.id);
    await answer(invitations[0].id, "no", "Away at a family wedding all weekend.");

    const board = await readAttendanceBoard(event.id);
    const serialised = JSON.stringify(board);

    expect(serialised).not.toContain("family wedding");
    // And no field that could carry one later, either.
    for (const participant of board.participants) {
      expect(Object.keys(participant).sort()).toEqual([
        "capacity",
        "displayName",
        "isWalkUp",
        "key",
        "mismatch",
        "presence",
        "recordedAt",
        "recordedByName",
        "rsvp",
      ]);
    }
  });

  it("computes the mismatches and changes nothing about them", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationsFor(event.id);
    const board = await participants(event.id);

    const keyFor = (index: number) => `player:${invitations[index].season_membership_id}`;

    // A said yes and is not recorded. B said no and turned up. C said yes and
    // was marked absent. Plus a walk-up nobody invited.
    await answer(invitations[0].id, "yes", null);
    await answer(invitations[1].id, "no", "Working.");
    await answer(invitations[2].id, "yes", null);

    await recordAttendance(actorPersonId, event.id, keyFor(1), "present");
    await recordAttendance(actorPersonId, event.id, keyFor(2), "absent");
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "+44 7700 900105",
      email: null,
      presence: "present",
    });

    expect(board).toHaveLength(3);

    const view = await observer.query<{ mismatch: string }>(
      "select mismatch from public.rsvp_attendance_mismatches where event_id = $1",
      [event.id],
    );
    // All four classifications, since LAN-81 corrected the view. Until then
    // `attended_without_invitation` was absent from this list and from every
    // other, because the view could not emit it for an event that had any
    // invitations at all — which is every approved event.
    expect(view.rows.map((row) => row.mismatch).sort()).toEqual([
      "attended_without_invitation",
      "said_no_but_attended",
      "said_yes_marked_absent",
      "said_yes_no_attendance_recorded",
    ]);

    // The view classifies four, but the board counts three: A said yes and
    // has nothing recorded, which is `said_yes_no_attendance_recorded` — an
    // absence, not a disagreement, and LAN-165 excludes it from the board's
    // count at every stage of recording, not only while the sheet is empty.
    const withMismatches = await readAttendanceBoard(event.id);
    expect(withMismatches.mismatchCount).toBe(3);
    expect(
      withMismatches.participants.find((participant) => participant.key === keyFor(0))?.mismatch,
    ).toBeNull();

    // The walk-up is now flagged twice over, by two independent routes: the
    // board derives it from the absence of an invitation, and the view
    // classifies it. Both are asserted, because the board's derivation is what
    // kept the screen honest while the view was wrong.
    expect(withMismatches.walkUpCount).toBe(1);
    expect(withMismatches.participants.some((participant) => participant.isWalkUp)).toBe(true);

    // Nothing was reconciled by looking at it. Both the responses and the
    // attendance are exactly as they were left.
    const after = await observer.query<{ mismatch: string }>(
      "select mismatch from public.rsvp_attendance_mismatches where event_id = $1",
      [event.id],
    );
    expect(after.rows).toHaveLength(4);
    expect(await attendanceRows(event.id)).toHaveLength(3);

    const responses = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.rsvp_responses
        where invitation_id in (select id from public.invitations where event_id = $1)`,
      [event.id],
    );
    expect(Number(responses.rows[0].count)).toBe(3);
  });

  /**
   * The gap LAN-80 pinned, and LAN-81 closed.
   *
   * `public.rsvp_attendance_mismatches` defined `attended_without_invitation`
   * and could not emit it for any event with at least one invitation — which is
   * every approved event. The view joined attendance to invitations and
   * admitted an unmatched attendance row only through `or i.id is null`, and
   * `i.id` is null only when the event has no invitations at all, so the
   * walk-up paired with nothing and was never returned. It was real rather than
   * theoretical: the synthetic seed contains two walk-ups and the view reported
   * the classification zero times.
   *
   * LAN-80 reported it rather than authoring a migration, on Brian's decision
   * of 14 August 2026, and asserted the defect here so it could not be
   * forgotten. LAN-81 is the issue that reads the view, so LAN-81 corrected it,
   * and this assertion is the inversion that comment promised: the count is now
   * greater than zero for exactly the case that used to vanish.
   *
   * Both routes stay asserted. The board derives the walk-up flag from the
   * absence of an invitation, which is what kept the screen honest while the
   * view was wrong, and a correction to one must not quietly become the only
   * evidence for the other.
   */
  it("reports attended_without_invitation — the gap LAN-80 pinned, corrected in LAN-81", async () => {
    const event = await occurredEvent(2);
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "+44 7700 900105",
      email: null,
      presence: "present",
    });

    // The event has invitations — which is the whole point. Under the old view
    // this fact alone was enough to make the classification unreachable.
    const invited = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.invitations where event_id = $1",
      [event.id],
    );
    expect(Number(invited.rows[0].count)).toBeGreaterThan(0);

    const view = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.rsvp_attendance_mismatches
        where event_id = $1 and mismatch = 'attended_without_invitation'`,
      [event.id],
    );
    expect(Number(view.rows[0].count)).toBeGreaterThan(0);

    const board = await readAttendanceBoard(event.id);
    const walkUp = board.participants.find((participant) => participant.isWalkUp);
    expect(walkUp).toBeDefined();
    expect(board.walkUpCount).toBe(1);
  });

  /**
   * The correction did not widen the view.
   *
   * A full outer join is a bigger population than a left join, so the risk of
   * the fix is the opposite of the defect: classifications that used to be
   * right becoming over-counted, or an invitee pairing with somebody else's
   * attendance row. An event where every invitee answered and every answer was
   * honoured must still report nothing at all.
   */
  it("reports nothing when intent and reality agree", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationsFor(event.id);
    const keyFor = (index: number) => `player:${invitations[index].season_membership_id}`;

    await answer(invitations[0].id, "yes", null);
    await answer(invitations[1].id, "yes", null);
    await recordAttendance(actorPersonId, event.id, keyFor(0), "present");
    await recordAttendance(actorPersonId, event.id, keyFor(1), "late");

    const view = await observer.query<{ mismatch: string }>(
      "select mismatch from public.rsvp_attendance_mismatches where event_id = $1",
      [event.id],
    );
    expect(view.rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D74 — a mismatch is never counted against an unrecorded yes, at any stage
// of taking the register. LAN-152, corrected by LAN-165.
// ---------------------------------------------------------------------------

/**
 * The defect this package exists to kill, and the one LAN-165 found still
 * living in it.
 *
 * The board on `main` first reported **zero recorded and thirty mismatches at
 * the same time**, on every occurred event whose register nobody had opened.
 * It was a counting fault: `said_yes_no_attendance_recorded` fires per person,
 * so a session nobody assessed came back as thirty separate accusations that
 * thirty people had let the club down. D74's two-state axis says an unrecorded
 * event must not read like a badly-attended one, and those two numbers side by
 * side are exactly that reading.
 *
 * LAN-152's fix suppressed the classification only while the whole register
 * was untouched, so the moment one person was recorded, every other unrecorded
 * yes flipped back into a "mismatch" — the same reading D74 forbids, now
 * reached one save at a time instead of all at once. LAN-165 is the fix for
 * that: a `said_yes_no_attendance_recorded` row never counts, whether the
 * sheet is empty or half-filled, because it marks an absence rather than a
 * disagreement either way.
 *
 * Assertions at several scales: the view still emits the classification
 * (nothing was hidden in the database); the board no longer reports it, empty
 * or partially recorded (the rule is applied where the club's definition is
 * read); and the whole synthetic season satisfies the invariant (it holds over
 * real-shaped data, not just the rows this file mints).
 */
describe("a mismatch counted against nothing recorded", () => {
  async function answerYes(invitationId: string) {
    await observer.query(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at)
       values ($1, 'yes'::public.rsvp_value, null, 'operator', now())`,
      [invitationId],
    );
  }

  async function invitationIds(eventId: string) {
    const result = await observer.query<{ id: string; season_membership_id: string }>(
      "select id, season_membership_id from public.invitations where event_id = $1 order by id",
      [eventId],
    );
    return result.rows;
  }

  it("is never reported while the register is untouched", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);
    for (const invitation of invitations) await answerYes(invitation.id);

    // The view says three, and that is left alone: it is the club's stored
    // definition and this package does not rewrite schema. What changed is
    // what the board makes of it.
    const view = await observer.query<{ mismatch: string }>(
      "select mismatch from public.rsvp_attendance_mismatches where event_id = $1",
      [event.id],
    );
    expect(view.rows.map((row) => row.mismatch)).toEqual([
      "said_yes_no_attendance_recorded",
      "said_yes_no_attendance_recorded",
      "said_yes_no_attendance_recorded",
    ]);

    const board = await readAttendanceBoard(event.id);
    expect(board.recordedCount).toBe(0);
    expect(board.mismatchCount).toBe(0);
    expect(board.participants.every((participant) => participant.mismatch === null)).toBe(true);
  });

  /**
   * The partially-recorded state — LAN-165.
   *
   * Nothing above exercised it: one test leaves the sheet completely empty,
   * and `"computes the mismatches and changes nothing about them"` records
   * everybody. The defect lived in between. Measured in a real browser on a
   * 47-invited, 29-yes event: recording a single matching Present moved the
   * visible Mismatches count from a would-be 29 to 28, not to 0 — every
   * not-yet-recorded yes was still being read off
   * `said_yes_no_attendance_recorded` the moment anybody else on the sheet was
   * saved. An unrecorded yes is an absence, not a disagreement, at every stage
   * of taking the register, not only while it is completely untouched.
   *
   * Both assertions below run against the real database this suite already
   * uses (`readAttendanceBoard` inside `withTransaction`), so a regression
   * that only shows up once Postgres actually classifies the mismatch — not a
   * hand-built fixture — would be caught.
   */
  it("stays at zero once a matching Present is recorded, with other yeses still unrecorded", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);
    for (const invitation of invitations) await answerYes(invitation.id);

    // Only the first is recorded, and it agrees with the RSVP. The other two
    // are exactly where an operator leaves them mid-register: said yes,
    // nothing recorded yet.
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[0].season_membership_id}`,
      "present",
    );

    const board = await readAttendanceBoard(event.id);
    expect(board.recordedCount).toBe(1);
    expect(board.mismatchCount).toBe(0);
    expect(board.participants.every((participant) => participant.mismatch === null)).toBe(true);
  });

  it("moves to exactly one once a recorded attendance actually contradicts the RSVP", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);
    for (const invitation of invitations) await answerYes(invitation.id);

    // The first agrees (present). The second is the real disagreement: said
    // yes, marked absent. The third is still bare unrecorded — and must not
    // join the count just because the sheet is now in use.
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
      "absent",
    );

    const board = await readAttendanceBoard(event.id);
    expect(board.recordedCount).toBe(2);
    expect(board.mismatchCount).toBe(1);

    const flaggedKeys = board.participants
      .filter((participant) => participant.mismatch !== null)
      .map((participant) => participant.key);
    expect(flaggedKeys).toEqual([`player:${invitations[1].season_membership_id}`]);
  });

  it("holds across the whole synthetic season, not just this suite's fixtures", async () => {
    // The seed carries fifteen occurred sessions nobody recorded, which is what
    // put thirty mismatches on a board reporting nothing. Asserting over all of
    // them is what makes this a property rather than an example — and it is
    // real-shaped data rather than a tidy fixture, which is the point of having
    // a synthetic season at all.
    const untouched = await observer.query<{ id: string; mismatches: string }>(
      `select e.id,
              (select count(*) from public.rsvp_attendance_mismatches m
                where m.event_id = e.id)::text as mismatches
         from public.events e
        where e.status = 'approved'
          and e.scheduled_on < (now() at time zone 'Europe/London')::date
          and not exists (select 1 from public.attendance_records a where a.event_id = e.id)
        order by e.scheduled_on desc
        limit 8`,
      [],
    );

    // A pass produced by an empty population is not a pass, and the view really
    // does still classify these — the numbers below are the defect, unchanged.
    expect(untouched.rows.length).toBeGreaterThan(0);
    expect(untouched.rows.some((row) => Number(row.mismatches) > 0)).toBe(true);

    for (const row of untouched.rows) {
      const board = await readAttendanceBoard(row.id);
      expect(board.recordedCount, `event ${row.id} recorded`).toBe(0);
      expect(board.mismatchCount, `event ${row.id} mismatches`).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// D71 and D72 — the register's window. LAN-152.
// ---------------------------------------------------------------------------

describe("when the register opens", () => {
  async function moveTo(eventId: string, scheduledOn: string, startsAt: string) {
    await observer.query(
      "update public.events set scheduled_on = $2::date, starts_at = $3::time where id = $1",
      [eventId, scheduledOn, startsAt],
    );
  }

  it("is closed before the buffer lifts, and says why", async () => {
    const event = await occurredEvent();
    await moveTo(event.id, "2099-01-01", "20:00");

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(false);
    expect(board.closedReason).toBe("before_buffer");
    expect(board.participants).toEqual([]);

    // And it says when, because a refusal that names no step is a dead end —
    // `docs/ux/standards.md` rule 4.
    // January, so the club is on GMT: a 20:00 start is 20:00Z and the buffer
    // lifts at 14:00Z the same day.
    expect(board.registerOpensAt).toBe("2099-01-01T14:00:00.000Z");
  });

  it("opens on the buffer, six hours before the start", async () => {
    const event = await occurredEvent();
    await moveTo(event.id, "2026-11-25", "20:00");

    const opens = new Date("2026-11-25T14:00:00.000Z");
    expect((await readAttendanceBoard(event.id, new Date(opens.getTime() - 1))).isOpen).toBe(false);
    expect((await readAttendanceBoard(event.id, opens)).isOpen).toBe(true);
  });

  it("stays open for a register that already has something in it", async () => {
    // D72, at the point it actually bites. The synthetic season carries
    // sessions recorded as having happened whose dates are still ahead of
    // today, and this is the state that found the defect on screen: twenty-one
    // names already saved, and a product refusing to show the sheet they were
    // saved on. A register with anything in it has been opened, so the buffer
    // cannot take it back.
    const event = await occurredEvent(3);
    const invitations = await observer.query<{ season_membership_id: string }>(
      "select season_membership_id from public.invitations where event_id = $1 order by id limit 1",
      [event.id],
    );
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations.rows[0].season_membership_id}`,
      "present",
    );

    await moveTo(event.id, "2099-01-01", "20:00");

    const board = await readAttendanceBoard(event.id);
    expect(board.isOpen).toBe(true);
    expect(board.closedReason).toBeNull();
    expect(board.recordedCount).toBe(1);
  });

  it("never closes, so last term's forgotten session can still be filled in", async () => {
    const event = await occurredEvent();
    await moveTo(event.id, "2026-06-10", "20:00");

    const board = await readAttendanceBoard(event.id, new Date("2031-01-01T00:00:00.000Z"));
    expect(board.isOpen).toBe(true);
    expect(board.closedReason).toBeNull();
  });

  it("distinguishes an unapproved event from one whose buffer has not lifted", async () => {
    // Two closed states, two different sentences on the screen: one waits on a
    // person and the other only on the clock. Since LAN-151 the person's step
    // is the approval — there is no assertion left to wait for.
    const draftEvent = await createEventDraft(actorPersonId, draft());
    const notApproved = await readAttendanceBoard(draftEvent.id);
    expect(notApproved.isOpen).toBe(false);
    expect(notApproved.closedReason).toBe("not_approved");

    const ahead = await approvedEvent(3, { scheduledOn: daysFromToday(7) });
    const tooEarly = await readAttendanceBoard(ahead.id);
    expect(tooEarly.isOpen).toBe(false);
    expect(tooEarly.closedReason).toBe("before_buffer");
  });
});

// ---------------------------------------------------------------------------
// REQ-headline-numbers — D62, D73, D74. LAN-152.
// ---------------------------------------------------------------------------

describe("the event page's headline numbers", () => {
  async function answer(invitationId: string, response: "yes" | "no") {
    // A no carries a reason — `rsvp_responses_no_requires_a_reason`. The reason
    // itself is never read by anything under test here, and the assertions
    // below prove it never reaches the payload either.
    await observer.query(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at)
       values ($1, $2::public.rsvp_value, $3, 'operator', now())`,
      [invitationId, response, response === "no" ? "Working." : null],
    );
  }

  async function invitationIds(eventId: string) {
    const result = await observer.query<{ id: string; season_membership_id: string }>(
      "select id, season_membership_id from public.invitations where event_id = $1 order by id",
      [eventId],
    );
    return result.rows;
  }

  it("counts an approved event nobody has recorded as not recorded", async () => {
    // And it counts it at all, which is the reason this is not the board: an
    // approved event a fortnight away has a register that will not open for a
    // fortnight, and "forty-seven asked, twenty-one said yes" is true today.
    const event = await approvedEvent(3);
    const invitations = await invitationIds(event.id);
    await answer(invitations[0].id, "yes");
    await answer(invitations[1].id, "no");

    const summary = await readEventAttendanceSummary(event.id);
    expect(summary).toEqual({
      invited: 3,
      saidYes: 1,
      showed: 0,
      recorded: 0,
      walkUps: 0,
      registerSaved: false,
    });
    expect(formatShowedAgainstInvited(summary)).toBe("— / 3");
  });

  it("reports a real zero once a register is saved with everybody absent", async () => {
    // The pair the packet names, at the scale this suite can build: the sheet
    // was taken and nobody came. `0 / 3` here is `0 / 37` on the club's own
    // event, and it must not be the same string as the case above.
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);
    for (const invitation of invitations) await answer(invitation.id, "yes");
    for (const invitation of invitations) {
      await recordAttendance(
        actorPersonId,
        event.id,
        `player:${invitation.season_membership_id}`,
        "absent",
      );
    }

    const summary = await readEventAttendanceSummary(event.id);
    expect(summary.registerSaved).toBe(true);
    expect(summary.showed).toBe(0);
    expect(summary.recorded).toBe(3);
    expect(formatShowedAgainstInvited(summary)).toBe("0 / 3");
  });

  it("counts Late among the people who showed, and a walk-up too", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);

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
    await recordAttendance(
      actorPersonId,
      event.id,
      `player:${invitations[2].season_membership_id}`,
      "excused",
    );
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Devon",
      familyName: NAME_MARKER,
      phone: "+44 7700 900131",
      email: null,
      presence: "present",
    });

    const summary = await readEventAttendanceSummary(event.id);
    expect(summary.showed).toBe(3);
    expect(summary.recorded).toBe(4);
    expect(summary.walkUps).toBe(1);
    expect(summary.invited).toBe(3);
    // Invariant P6 in one string: more people showed than were asked, which is
    // a fact about the evening rather than a number to clamp.
    expect(formatShowedAgainstInvited(summary)).toBe("3 / 3");
  });

  /**
   * `docs/ux/standards.md` rule 7 — two surfaces, one answer.
   *
   * The event page reads five aggregates in one round trip and the register
   * derives the same five from its own participant rows. Two derivations of one
   * fact is a design decision here rather than an accident — drawing the page
   * through the board's `full outer join` and its view read would be a query
   * the headline has no use for — so the two are pinned to each other, on data
   * staged to include the cases a naive count gets wrong: a walk-up with no
   * invitation, a Late, an Excused, and an invitee nobody marked.
   */
  it("agrees exactly with the register's own counts, on the same event", async () => {
    const event = await occurredEvent(3);
    const invitations = await invitationIds(event.id);
    await answer(invitations[0].id, "yes");
    await answer(invitations[1].id, "no");

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
      "excused",
    );
    await recordWalkUpAttendance(actorPersonId, event.id, {
      givenName: "Marlow",
      familyName: NAME_MARKER,
      phone: "+44 7700 900132",
      email: null,
      presence: "present",
    });

    const board = await readAttendanceBoard(event.id);
    const headline = await readEventAttendanceSummary(event.id);

    expect(headline).toEqual(board.summary);
    expect(headline).toEqual(summariseAttendance(board.participants));
  });

  it("refuses an identifier that names no event, rather than reporting zeroes", async () => {
    // Five zeroes would read as a real event nobody was invited to.
    const error = await expectRefused(
      readEventAttendanceSummary("00000000-0000-4000-8000-000000000000"),
    );
    expect(error.kind).toBe("not_found");
  });
});

// ---------------------------------------------------------------------------
// Invariant P8 — the anchor matches the capacity
// ---------------------------------------------------------------------------

describe("invariant P8", () => {
  it("refuses a player-capacity attendance row anchored to a person", async () => {
    const event = await occurredEvent();
    const membership = await observer.query<{ person_id: string }>(
      `select sm.person_id from public.season_memberships sm
         join public.invitations i on i.season_membership_id = sm.id
        where i.event_id = $1 limit 1`,
      [event.id],
    );

    // The service cannot produce this — a target resolves to exactly one anchor
    // — so the refusal under test is the database's, which is the one that
    // holds for every caller including the ones that do not exist yet.
    await expect(
      observer.query(
        `insert into public.attendance_records
           (event_id, event_status, season_id, capacity, person_id, presence)
         values ($1, 'approved', $2, 'player', $3, 'present')`,
        [event.id, event.seasonId, membership.rows[0].person_id],
      ),
    ).rejects.toMatchObject({ constraint: "attendance_records_anchor_matches_capacity" });
  });

  it("refuses a guest-capacity attendance row anchored to a membership", async () => {
    const event = await occurredEvent();
    const membership = await observer.query<{ season_membership_id: string }>(
      "select season_membership_id from public.invitations where event_id = $1 limit 1",
      [event.id],
    );

    await expect(
      observer.query(
        `insert into public.attendance_records
           (event_id, event_status, season_id, capacity, season_membership_id, presence)
         values ($1, 'approved', $2, 'guest', $3, 'present')`,
        [event.id, event.seasonId, membership.rows[0].season_membership_id],
      ),
    ).rejects.toMatchObject({ constraint: "attendance_records_anchor_matches_capacity" });
  });

  it("refuses two attendance rows for one participant at one event", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);
    await recordAttendance(actorPersonId, event.id, first.key, "present");

    const membership = first.key.split(":")[1];
    await expect(
      observer.query(
        `insert into public.attendance_records
           (event_id, event_status, season_id, capacity, season_membership_id, presence)
         values ($1, 'approved', $2, 'player', $3, 'absent')`,
        [event.id, event.seasonId, membership],
      ),
    ).rejects.toMatchObject({ constraint: "attendance_records_one_per_player_per_event" });
  });
});
