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
  PARTICIPANT_NOT_FOUND_MESSAGE,
  readAttendanceBoard,
  readWalkUpCandidates,
  recordAttendance,
  recordWalkUpAttendance,
  removeAttendance,
  WALK_UP_NAME_REQUIRED,
} from "./attendance";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn } from "./event-audience";
import {
  correctOccurrenceAssertion,
  createEventDraft,
  markEventNotHeld,
  markEventOccurred,
  readEvent,
  type EventDraftInput,
} from "./events";
import { withTransaction } from "@/lib/db";
import { openObserver, SEEDED_IDENTITY_CREATED_AT } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN80AttendanceSuite";

let observer: Client;
let actorPersonId: string;
let secondActorPersonId: string;
let seededPeople: Set<string>;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [SEEDED_IDENTITY_CREATED_AT],
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
 */
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
         or (entity_table = 'attendance_records')`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
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

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Wednesday practice`,
    eventType: "practice",
    scheduledOn: "2026-10-14",
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
    ...overrides,
  };
}

/**
 * A draft, an audience of `size` seeded players, and an approval — the state
 * every test here starts from, because attendance needs an approved event and
 * its invitations before it needs anything else.
 */
async function approvedEvent(size = 3) {
  const event = await createEventDraft(actorPersonId, draft());

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

/** The same, asserted to have happened. */
async function occurredEvent(size = 3) {
  const event = await approvedEvent(size);
  await markEventOccurred(actorPersonId, event.id);
  return event;
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
// Invariant E5 — occurrence is asserted, never inferred
// ---------------------------------------------------------------------------

describe("the occurrence assertion", () => {
  it("moves an approved event to occurred, naming who said so and when", async () => {
    const event = await approvedEvent();

    const before = await observer.query<{ outcome_recorded_at: Date | null }>(
      "select outcome_recorded_at from public.events where id = $1",
      [event.id],
    );
    expect(before.rows[0].outcome_recorded_at).toBeNull();

    const after = await markEventOccurred(actorPersonId, event.id);
    expect(after.status).toBe("occurred");

    const stored = await observer.query<{
      outcome_recorded_at: Date | null;
      outcome_recorded_by_person_id: string | null;
    }>(
      `select outcome_recorded_at, outcome_recorded_by_person_id
         from public.events where id = $1`,
      [event.id],
    );
    expect(stored.rows[0].outcome_recorded_at).not.toBeNull();
    expect(stored.rows[0].outcome_recorded_by_person_id).toBe(actorPersonId);

    const audit = await auditFor(event.id, "event.marked_occurred");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_person_id: actorPersonId,
      from_state: "approved",
      to_state: "occurred",
    });
  });

  it("moves an approved event to not held, and records that assertion too", async () => {
    const event = await approvedEvent();
    const after = await markEventNotHeld(actorPersonId, event.id);

    expect(after.status).toBe("not_held");
    const audit = await auditFor(event.id, "event.marked_not_held");
    expect(audit).toHaveLength(1);
    expect(audit[0].to_state).toBe("not_held");
  });

  it("refuses a second assertion, so a double submission cannot re-record it", async () => {
    const event = await occurredEvent();

    const error = await expectRefused(markEventOccurred(actorPersonId, event.id));
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toContain("recorded as having happened");

    expect((await auditFor(event.id, "event.marked_occurred")).length).toBe(1);
  });

  it("cannot be reached from a draft", async () => {
    const event = await createEventDraft(actorPersonId, draft());
    const error = await expectRefused(markEventOccurred(actorPersonId, event.id));
    expect(error.kind).toBe("invalid_transition");
  });

  it("is never produced by the passage of time — invariant E5", async () => {
    // The whole point, stated as a test rather than as a comment: an event
    // whose date and start time are long past is still `approved` until a
    // person says otherwise. Nothing reads a clock to decide this.
    const event = await approvedEvent();
    await observer.query("update public.events set scheduled_on = '2020-01-01' where id = $1", [
      event.id,
    ]);

    const reread = await readEvent(event.id);
    expect(reread.status).toBe("approved");

    // And the date really is in the past, so the assertion above is about a
    // clock that has passed rather than about one that has not yet. Read from
    // the database rather than from the event, because nothing on `EventDetail`
    // carries this any more — the screen's "start time has passed" caption went
    // when Brian removed it, and the computation went with the caption.
    const past = await observer.query<{ started: boolean }>(
      `select (scheduled_on + coalesce(starts_at, '00:00'::time))
                at time zone 'Europe/London' <= now() as started
         from public.events where id = $1`,
      [event.id],
    );
    expect(past.rows[0].started).toBe(true);
  });
});

describe("correcting an occurrence assertion", () => {
  it("needs a reason, because it is a correction", async () => {
    const event = await occurredEvent();
    const error = await expectRefused(correctOccurrenceAssertion(actorPersonId, event.id, "  "));
    expect(error.kind).toBe("constraint_violated");
    expect(error.rule).toBe("event_occurrence_correction_is_explained");
  });

  it("turns occurred into not held, and records why", async () => {
    const event = await occurredEvent();
    const after = await correctOccurrenceAssertion(
      actorPersonId,
      event.id,
      "Recorded against the wrong Wednesday.",
    );

    expect(after.status).toBe("not_held");
    const audit = await auditFor(event.id, "event.occurrence_corrected");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ from_state: "occurred", to_state: "not_held" });
    expect(audit[0].reason).toBe("Recorded against the wrong Wednesday.");
  });

  it("turns not held back into occurred", async () => {
    const event = await approvedEvent();
    await markEventNotHeld(actorPersonId, event.id);

    const after = await correctOccurrenceAssertion(actorPersonId, event.id, "It did happen.");
    expect(after.status).toBe("occurred");
  });

  it("is refused while attendance exists, in a sentence about the attendance", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);
    await recordAttendance(actorPersonId, event.id, first.key, "present");

    const error = await expectRefused(
      correctOccurrenceAssertion(actorPersonId, event.id, "Wrong event."),
    );

    expect(error.kind).toBe("invalid_transition");
    expect(error.rule).toBe("event_occurrence_locked_by_attendance");
    expect(error.message).toContain("1 attendance record");
    // Readable, and specifically not the raw constraint the cascade would have
    // broken. This is the half of invariant P5 an operator ever sees.
    expect(error.message).not.toContain("attendance_records_require_an_occurred_event");

    expect((await readEvent(event.id)).status).toBe("occurred");
  });

  it("is possible again once the attendance is removed", async () => {
    const event = await occurredEvent();
    const [first] = await participants(event.id);
    await recordAttendance(actorPersonId, event.id, first.key, "present");
    await removeAttendance(actorPersonId, event.id, first.key);

    const after = await correctOccurrenceAssertion(actorPersonId, event.id, "Wrong event.");
    expect(after.status).toBe("not_held");
  });
});

// ---------------------------------------------------------------------------
// Invariant P5 — attendance requires an occurred event
// ---------------------------------------------------------------------------

describe("the attendance gate", () => {
  it("refuses a write against an approved event", async () => {
    const event = await approvedEvent();
    const board = await readAttendanceBoard(event.id);

    expect(board.isOpen).toBe(false);
    expect(board.participants).toEqual([]);

    // The board is closed, so it names nobody — which is exactly the state a
    // caller bypassing the screen would be in. A key that cannot be produced is
    // still refused for the right reason: the event, not the participant.
    const error = await expectRefused(
      recordAttendance(
        actorPersonId,
        event.id,
        "player:00000000-0000-4000-8000-000000000000",
        "present",
      ),
    );
    expect(error.kind).toBe("invalid_transition");
    expect(error.message).toBe(ATTENDANCE_CLOSED_MESSAGE);
    expect(await attendanceRows(event.id)).toEqual([]);
  });

  it("refuses a write against an event marked not held", async () => {
    const event = await approvedEvent();
    await markEventNotHeld(actorPersonId, event.id);

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

  it("refuses a write against a cancelled event", async () => {
    const event = await approvedEvent();
    // No application path produces `cancelled` yet — LAN-77 leaves it to a
    // later issue — so the state is created directly. The refusal under test is
    // the service's, and it must not depend on how the event got there.
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
      event_status: "occurred",
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

// ---------------------------------------------------------------------------
// Invariant P6 — the walk-up
// ---------------------------------------------------------------------------

describe("walk-ups", () => {
  it("records somebody who was never invited, at guest capacity", async () => {
    const event = await occurredEvent();

    const saved = await recordWalkUpAttendance(actorPersonId, event.id, {
      name: `Devon ${NAME_MARKER}`,
      contact: "+44 7700 900105",
      presence: "present",
      membershipId: null,
    });

    expect(saved.presence).toBe("present");

    const rows = await attendanceRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ capacity: "guest", season_membership_id: null });
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

  it("creates no membership, no onboarding and no recruitment record", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      name: `Devon ${NAME_MARKER}`,
      contact: null,
      presence: "present",
      membershipId: null,
    });

    const person = await observer.query<{ id: string }>(
      "select id from public.people where family_name = $1",
      [NAME_MARKER],
    );
    expect(person.rows).toHaveLength(1);

    // Both tables key on the person directly, so "nothing was started for them"
    // is one count each. Onboarding items hang off a membership, and there is
    // no membership — which the first of these proves.
    for (const table of ["season_memberships", "recruitment_prospects"] as const) {
      const rows = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.${table} where person_id = $1`,
        [person.rows[0].id],
      );
      expect(Number(rows.rows[0].count), `${table} should be untouched`).toBe(0);
    }
  });

  it("stores the contact exactly as it was given, and only when given", async () => {
    const event = await occurredEvent();
    await recordWalkUpAttendance(actorPersonId, event.id, {
      name: `Devon ${NAME_MARKER}`,
      contact: " devon@example.ac.ox ",
      presence: "late",
      membershipId: null,
    });

    const contact = await observer.query<{ kind: string; raw_value: string }>(
      `select kind::text as kind, raw_value from public.contact_points
        where person_id in (select id from public.people where family_name = $1)`,
      [NAME_MARKER],
    );
    expect(contact.rows).toHaveLength(1);
    expect(contact.rows[0]).toMatchObject({ kind: "email", raw_value: "devon@example.ac.ox" });
  });

  it("refuses a contact that is neither an address nor a number, and writes nothing", async () => {
    const event = await occurredEvent();
    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, {
        name: `Devon ${NAME_MARKER}`,
        contact: "ask Sam",
        presence: "present",
        membershipId: null,
      }),
    );

    expect(error.kind).toBe("constraint_violated");
    expect(await attendanceRows(event.id)).toEqual([]);
    const person = await observer.query("select id from public.people where family_name = $1", [
      NAME_MARKER,
    ]);
    expect(person.rowCount).toBe(0);
  });

  it("needs a name, and says which name", async () => {
    const event = await occurredEvent();
    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, {
        name: "   ",
        contact: null,
        presence: "present",
        membershipId: null,
      }),
    );
    expect(error.message).toBe(WALK_UP_NAME_REQUIRED);
  });

  it("anchors to the membership when the operator recognises them, not to a new person", async () => {
    const event = await occurredEvent(2);
    const candidates = await readWalkUpCandidates(event.id);
    expect(candidates.length).toBeGreaterThan(0);

    await recordWalkUpAttendance(actorPersonId, event.id, {
      name: "Ignored, because the membership names them",
      contact: null,
      presence: "present",
      membershipId: candidates[0].membershipId,
    });

    const rows = await attendanceRows(event.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      capacity: "player",
      season_membership_id: candidates[0].membershipId,
      person_id: null,
    });

    // No second person was minted for somebody the club already has.
    const minted = await observer.query("select id from public.people where family_name = $1", [
      NAME_MARKER,
    ]);
    expect(minted.rowCount).toBe(0);
  });

  it("offers no candidate who is already invited to this event", async () => {
    const event = await occurredEvent(3);
    const invited = await observer.query<{ season_membership_id: string }>(
      "select season_membership_id from public.invitations where event_id = $1",
      [event.id],
    );

    const candidates = await readWalkUpCandidates(event.id);
    const offered = new Set(candidates.map((candidate) => candidate.membershipId));
    for (const row of invited.rows) {
      expect(offered.has(row.season_membership_id)).toBe(false);
    }
  });

  it("refuses a roster match from another season", async () => {
    const event = await occurredEvent();
    const foreign = await observer.query<{ id: string }>(
      `select sm.id from public.season_memberships sm
        where sm.season_id <> $1 limit 1`,
      [event.seasonId],
    );

    const error = await expectRefused(
      recordWalkUpAttendance(actorPersonId, event.id, {
        name: `Devon ${NAME_MARKER}`,
        contact: null,
        presence: "present",
        membershipId: foreign.rows[0].id,
      }),
    );
    expect(error.kind).toBe("not_found");
    expect(await attendanceRows(event.id)).toEqual([]);
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
      name: `Devon ${NAME_MARKER}`,
      contact: null,
      presence: "present",
      membershipId: null,
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

    const withMismatches = await readAttendanceBoard(event.id);
    expect(withMismatches.mismatchCount).toBe(4);

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
      name: `Devon ${NAME_MARKER}`,
      contact: null,
      presence: "present",
      membershipId: null,
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
         values ($1, 'occurred', $2, 'player', $3, 'present')`,
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
         values ($1, 'occurred', $2, 'guest', $3, 'present')`,
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
         values ($1, 'occurred', $2, 'player', $3, 'absent')`,
        [event.id, event.seasonId, membership],
      ),
    ).rejects.toMatchObject({ constraint: "attendance_records_one_per_player_per_event" });
  });
});
