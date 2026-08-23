// @vitest-environment node
/**
 * Amending, re-notifying and cancelling an approved event — LAN-156, W5 and W6.
 *
 * Against the **real** local database, and it has to be. Every load-bearing
 * claim in this work package is a property of PostgreSQL doing what the schema
 * says: an event that never leaves `approved` while five tables are written; a
 * cascading composite foreign key that carries a status onto invitations; a
 * `where status = 'approved'` that refuses a write to a cancelled row; a hold
 * column that a claim query consults. A mocked transaction commits because the
 * mock says so and can demonstrate none of it.
 *
 * Every row hangs off an event whose name carries `NAME_MARKER`, and
 * `afterEach` deletes exactly those in dependency order. The marker is unique
 * to this file, because Vitest shares one database across suites.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction, type ServiceError } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import {
  AMEND_REQUIRES_APPROVED_RULE,
  amendApprovedEvent,
  CANCELLATION_NEEDS_A_REASON_RULE,
  CANCEL_REQUIRES_APPROVED_RULE,
  cancelEvent,
  EVENT_IS_CANCELLED_RULE,
  NOTHING_CHANGED_RULE,
  NOTHING_TO_RENOTIFY_RULE,
  readAmendmentContext,
  readEventChangeHistory,
  readNotifyAudienceIn,
  renotifyEvent,
  SILENCE_NEEDS_CONFIRMATION_RULE,
  AMENDMENT_NEEDS_A_DATE_RULE,
} from "./event-amendment";
import { chaseThresholdOn } from "./event-amendment-rules";
import { approveEvent, saveEventAudience } from "./event-approval";
import { listAudienceCatalogueIn, type AudienceCatalogue } from "./event-audience";
import {
  createEventDraft,
  listCurrentSeasonEvents,
  readEvent,
  type EventDraftInput,
} from "./events";
import { readEventAttendanceSummary } from "./attendance";
import { dispatchEventInvitations } from "./delivery";
import { resolveRsvpToken } from "./rsvp-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const NAME_MARKER = "LAN156AmendCancelSuite";

let observer: Client;
let actorPersonId: string;
let seededPeople: Set<string>;

beforeAll(async () => {
  observer = await openObserver();
  const people = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id",
    [await seededIdentityCreatedAt(observer)],
  );
  seededPeople = new Set(people.rows.map((row) => row.id));
  expect(seededPeople.size).toBeGreaterThan(20);
  actorPersonId = people.rows[0].id;
});

afterEach(async () => {
  const scope = `${NAME_MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  await observer.query(
    `delete from public.delivery_results where notification_job_id in (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(
    `delete from public.rsvp_responses where invitation_id in (select id from public.invitations where event_id in ${events})`,
    [scope],
  );
  await observer.query(`delete from public.attendance_records where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`, [scope]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A date comfortably ahead of the club, whatever day the suite runs on. */
function futureDay(offsetDays = 30): string {
  const today = new Date(`${todayInClubZone()}T00:00:00Z`);
  today.setUTCDate(today.getUTCDate() + offsetDays);
  return today.toISOString().slice(0, 10);
}

function pastDay(offsetDays = 30): string {
  return futureDay(-offsetDays);
}

function draft(overrides: Partial<EventDraftInput> = {}): EventDraftInput {
  return {
    name: `${NAME_MARKER} Practice`,
    eventType: "practice",
    scheduledOn: futureDay(),
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    deliveryMode: "in_person",
    description: "Full contact.",
    requiredEquipment: "Gumshield, boots",
    joiningUrl: null,
    ...overrides,
  };
}

async function catalogueFor(seasonId: string, on: string | null): Promise<AudienceCatalogue> {
  const full = await withTransaction((tx) => listAudienceCatalogueIn(tx, seasonId, on));
  const candidates = full.candidates.filter((candidate) => seededPeople.has(candidate.personId));
  return { candidates, counts: full.counts };
}

/**
 * An approved event with a real audience, real invitations, and answers on
 * some of them — which is the only state this work package is about.
 *
 * Three of the invitees say yes and one says no, so every assertion about "the
 * whole invited audience, decliners included" has a decliner to be about.
 */
async function approvedEvent(overrides: Partial<EventDraftInput> = {}) {
  const event = await createEventDraft(actorPersonId, draft(overrides));
  const catalogue = await catalogueFor(event.seasonId, event.scheduledOn);
  const keys = catalogue.candidates.slice(0, 6).map((candidate) => candidate.key);
  expect(keys.length).toBe(6);

  await saveEventAudience(actorPersonId, event.id, keys);
  const outcome = await approveEvent(actorPersonId, event.id);

  const invitations = await observer.query<{ id: string }>(
    "select id from public.invitations where event_id = $1 order by id",
    [event.id],
  );

  // Three yes, one no, two silent.
  for (const [index, row] of invitations.rows.entries()) {
    const answer = index < 3 ? "yes" : index === 3 ? "no" : null;
    if (answer === null) continue;
    await observer.query(
      `insert into public.rsvp_responses
         (invitation_id, response, reason, source, responded_at, recorded_by_person_id)
       values ($1, $2::public.rsvp_value, $3, 'operator', now(), $4)`,
      [row.id, answer, answer === "no" ? "Away that weekend." : null, actorPersonId],
    );
    // What the RSVP service does alongside the response, reproduced so that
    // "nobody is asked twice" is assertable against the invitation's own state.
    await observer.query("update public.invitations set status = 'responded' where id = $1", [
      row.id,
    ]);
  }

  return {
    eventId: event.id,
    seasonId: event.seasonId,
    invitationIds: invitations.rows.map((row) => row.id),
    invitationCount: outcome.invitationCount,
  };
}

/** Every invitation and every standing answer, by identity. */
async function participationOf(eventId: string) {
  const invitations = await observer.query<{ id: string; person_id: string | null }>(
    `select i.id, coalesce(i.person_id, m.person_id) as person_id
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.event_id = $1
      order by i.id`,
    [eventId],
  );
  const answers = await observer.query<{ invitation_id: string; response: string }>(
    `select r.invitation_id, r.response::text as response
       from public.current_rsvp r
       join public.invitations i on i.id = r.invitation_id
      where i.event_id = $1
      order by r.invitation_id`,
    [eventId],
  );
  return {
    invitations: invitations.rows.map((row) => `${row.id}:${row.person_id}`),
    answers: answers.rows.map((row) => `${row.invitation_id}:${row.response}`),
  };
}

async function serviceFailure(run: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await run();
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return error;
  }
  throw new Error("Expected the service to refuse, and it did not.");
}

async function statusOf(eventId: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    "select status::text as status from public.events where id = $1",
    [eventId],
  );
  return result.rows[0].status;
}

async function jobsFor(eventId: string) {
  const result = await observer.query<{
    id: string;
    job_type: string;
    status: string;
    held_at: Date | null;
    held_reason: string | null;
    cancelled_reason: string | null;
    template_variables: Record<string, unknown>;
    channel: string | null;
  }>(
    `select id, job_type::text as job_type, status::text as status, held_at, held_reason,
            cancelled_reason, template_variables, channel::text as channel
       from public.notification_jobs
      where event_id = $1
      order by created_at, id`,
    [eventId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// REQ-amend-in-place
// ---------------------------------------------------------------------------

describe("an approved event is amended in place", () => {
  it("never leaves approved, and keeps every invitation and answer by identity", async () => {
    const fixture = await approvedEvent();
    const before = await participationOf(fixture.eventId);

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    expect(outcome.event.status).toBe("approved");
    expect(await statusOf(fixture.eventId)).toBe("approved");
    expect(outcome.event.venue).toBe("University Parks");

    const after = await participationOf(fixture.eventId);
    expect(after.invitations).toEqual(before.invitations);
    expect(after.answers).toEqual(before.answers);
    expect(after.invitations).toHaveLength(6);
    expect(after.answers).toHaveLength(4);
  });

  it("leaves the denormalised copy of the status on every invitation alone", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), startsAt: "19:00" },
      { notify: true },
    );

    const statuses = await observer.query<{ event_status: string; count: string }>(
      `select event_status::text as event_status, count(*)::text as count
         from public.invitations where event_id = $1 group by 1`,
      [fixture.eventId],
    );
    expect(statuses.rows).toEqual([{ event_status: "approved", count: "6" }]);
  });

  it("writes nothing at all when nothing moved", async () => {
    const fixture = await approvedEvent();
    const historyBefore = await readEventChangeHistory(fixture.eventId);

    const failure = await serviceFailure(() =>
      amendApprovedEvent(actorPersonId, fixture.eventId, draft(), { notify: false }),
    );

    expect(failure.rule).toBe(NOTHING_CHANGED_RULE);
    expect(await readEventChangeHistory(fixture.eventId)).toEqual(historyBefore);

    const schedule = await observer.query(
      "select 1 from public.schedule_changes where event_id = $1",
      [fixture.eventId],
    );
    expect(schedule.rowCount).toBe(0);
  });

  it("refuses to take the date away from an approved event", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() =>
      amendApprovedEvent(
        actorPersonId,
        fixture.eventId,
        { ...draft(), scheduledOn: null },
        { notify: false },
      ),
    );

    expect(failure.rule).toBe(AMENDMENT_NEEDS_A_DATE_RULE);
    expect((await readEvent(fixture.eventId)).scheduledOn).not.toBeNull();
  });

  it("refuses to amend a draft", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const failure = await serviceFailure(() =>
      amendApprovedEvent(
        actorPersonId,
        event.id,
        { ...draft(), venue: "Elsewhere" },
        { notify: false },
      ),
    );

    expect(failure.rule).toBe(AMEND_REQUIRES_APPROVED_RULE);
  });
});

// ---------------------------------------------------------------------------
// REQ-amend-notify
// ---------------------------------------------------------------------------

describe("the one notify decision", () => {
  it("makes a change notification owing to the whole invited audience, decliners included", async () => {
    const fixture = await approvedEvent();

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    expect(outcome.notified).toBe(true);
    expect(outcome.noticesOwed).toBe(6);
    expect(outcome.recipients).toBe(6);

    const notices = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "schedule_change_notice",
    );
    expect(notices).toHaveLength(6);

    // Every invitation, including the one that answered no.
    const decliner = await observer.query<{ invitation_id: string }>(
      `select i.id as invitation_id
         from public.invitations i
         join public.current_rsvp r on r.invitation_id = i.id
        where i.event_id = $1 and r.response = 'no'`,
      [fixture.eventId],
    );
    const owed = await observer.query<{ invitation_id: string }>(
      `select invitation_id from public.notification_jobs
        where event_id = $1 and job_type = 'schedule_change_notice'`,
      [fixture.eventId],
    );
    expect(owed.rows.map((row) => row.invitation_id)).toContain(decliner.rows[0].invitation_id);
  });

  it("asks nobody to answer twice — a yes stands", async () => {
    const fixture = await approvedEvent();
    const before = await participationOf(fixture.eventId);

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    expect((await participationOf(fixture.eventId)).answers).toEqual(before.answers);

    // Nothing reset an invitation to `pending` in the hope of a fresh answer.
    const responded = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.invitations
        where event_id = $1 and status = 'responded'`,
      [fixture.eventId],
    );
    expect(Number(responded.rows[0].count)).toBe(4);
  });

  it("owes nothing when the operator chooses silence on a change nobody has to hear about", async () => {
    const fixture = await approvedEvent();

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), description: "Light session." },
      { notify: false },
    );

    expect(outcome.notified).toBe(false);
    expect(outcome.noticesOwed).toBe(0);
    expect(
      (await jobsFor(fixture.eventId)).filter((job) => job.job_type === "schedule_change_notice"),
    ).toHaveLength(0);
  });

  it("makes one batch of notices for one amendment, however many fields moved", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      {
        ...draft(),
        venue: "University Parks",
        startsAt: "19:00",
        requiredEquipment: "Gumshield",
      },
      { notify: true },
    );

    const notices = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "schedule_change_notice",
    );
    expect(notices).toHaveLength(6);
  });
});

describe("silencing a change that moved a future date, time or venue", () => {
  it("is refused without the confirmation, and nothing is written", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() =>
      amendApprovedEvent(
        actorPersonId,
        fixture.eventId,
        { ...draft(), venue: "University Parks" },
        { notify: false },
      ),
    );

    expect(failure.rule).toBe(SILENCE_NEEDS_CONFIRMATION_RULE);
    expect((await readEvent(fixture.eventId)).venue).toBe("Iffley Road Astro");
    expect(await readEventChangeHistory(fixture.eventId)).toHaveLength(1);
  });

  it("is refused when the confirmation flag is anything other than true", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() =>
      amendApprovedEvent(
        actorPersonId,
        fixture.eventId,
        { ...draft(), venue: "University Parks" },
        { notify: false, silenceConfirmed: false },
      ),
    );

    expect(failure.rule).toBe(SILENCE_NEEDS_CONFIRMATION_RULE);
  });

  it("goes through once the confirmation was passed, and the record says it was silent", async () => {
    const fixture = await approvedEvent();

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );

    expect(outcome.notified).toBe(false);
    expect((await readEvent(fixture.eventId)).venue).toBe("University Parks");

    const history = await readEventChangeHistory(fixture.eventId);
    expect(history[0]).toMatchObject({ kind: "amended", notified: false, recipients: 6 });

    const schedule = await observer.query<{ notified: boolean }>(
      "select notified from public.schedule_changes where event_id = $1",
      [fixture.eventId],
    );
    expect(schedule.rows[0].notified).toBe(false);
  });

  it("asks nothing when the same change is made to an event that has passed", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft({ scheduledOn: pastDay() }), venue: "University Parks" },
      { notify: false },
    );

    expect(outcome.notified).toBe(false);
    expect((await readEvent(fixture.eventId)).venue).toBe("University Parks");
  });

  it("asks nothing for a corrected description on a future event", async () => {
    const fixture = await approvedEvent();

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), description: "Full contact. Bring a gumshield." },
      { notify: false },
    );

    expect(outcome.notified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ-amend-hold
// ---------------------------------------------------------------------------

describe("saving an amendment holds the event's unsent messages", () => {
  it("holds every unsent job, attributed and explained", async () => {
    const fixture = await approvedEvent();

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    expect(outcome.messagesHeld).toBeGreaterThan(0);

    const invitationJobs = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "invitation",
    );
    expect(invitationJobs).toHaveLength(6);
    for (const job of invitationJobs) {
      expect(job.held_at).not.toBeNull();
      expect(job.held_reason).toContain("Venue");
      // A hold, not a cancellation — the obligation survives.
      expect(job.status).toBe("pending");
    }
  });

  it("stops a held message being delivered", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const transport = vi.fn(async () => new Response("{}", { status: 200 }));
    const summary = await dispatchEventInvitations(fixture.eventId, {
      source: {
        APP_BASE_URL: "https://lancers.example.org",
        WHATSAPP_PHONE_NUMBER_ID: "5550001",
        WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
        WHATSAPP_TEMPLATE_NAME: "event_invitation",
      },
      transport,
    });

    expect(summary).toEqual({ attempted: 0, accepted: 0, refused: 0, skipped: 0 });
    expect(transport).not.toHaveBeenCalled();

    const attempts = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts
        where notification_job_id in (select id from public.notification_jobs where event_id = $1)`,
      [fixture.eventId],
    );
    expect(Number(attempts.rows[0].count)).toBe(0);
  });

  it("does not re-attribute a hold that is already on", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );
    const first = await jobsFor(fixture.eventId);
    const firstReason = first.find((job) => job.job_type === "invitation")?.held_reason;
    expect(firstReason).toContain("Venue");

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks", description: "Changed again." },
      { notify: false },
    );

    // The invitations were already held by the first amendment, and the hold's
    // attribution is the person who first stopped the message.
    const after = await jobsFor(fixture.eventId);
    for (const job of after.filter((job) => job.job_type === "invitation")) {
      expect(job.held_reason).toBe(firstReason);
    }
  });

  it("holds the change notices an earlier amendment made owing", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    // A notice describing the move to University Parks is now queued. Moving the
    // event again must stop it, for the same reason the invitations were
    // stopped: it describes a value that is no longer true.
    const second = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "Marston Road" },
      { notify: true },
    );

    expect(second.messagesHeld).toBe(6);

    const notices = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "schedule_change_notice",
    );
    expect(notices).toHaveLength(12);
    expect(notices.filter((job) => job.held_at !== null)).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// REQ-renotify
// ---------------------------------------------------------------------------

describe("re-notify", () => {
  it("sends the change to the same audience and alters neither the event nor its responses", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );

    const eventBefore = await readEvent(fixture.eventId);
    const participationBefore = await participationOf(fixture.eventId);

    const outcome = await renotifyEvent(actorPersonId, fixture.eventId);

    expect(outcome.recipients).toBe(6);
    expect(outcome.noticesOwed).toBe(6);
    expect(await readEvent(fixture.eventId)).toEqual(eventBefore);
    expect(await participationOf(fixture.eventId)).toEqual(participationBefore);
  });

  it("can be pressed twice without the second press doing nothing", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );

    const first = await renotifyEvent(actorPersonId, fixture.eventId);
    const second = await renotifyEvent(actorPersonId, fixture.eventId);

    expect(first.noticesOwed).toBe(6);
    expect(second.noticesOwed).toBe(6);
  });

  it("is refused on an event nothing has changed about", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() => renotifyEvent(actorPersonId, fixture.eventId));

    expect(failure.rule).toBe(NOTHING_TO_RENOTIFY_RULE);
  });

  it("appears in the history as its own entry", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );
    await renotifyEvent(actorPersonId, fixture.eventId);

    const history = await readEventChangeHistory(fixture.eventId);
    expect(history[0]).toMatchObject({ kind: "renotified", notified: true, recipients: 6 });
    // The amendment stays honest about having been silent.
    expect(history[1]).toMatchObject({ kind: "amended", notified: false });
  });
});

// ---------------------------------------------------------------------------
// REQ-cancel
// ---------------------------------------------------------------------------

describe("cancelling an event", () => {
  it("is one action, keeps every response, and tells everyone by default", async () => {
    const fixture = await approvedEvent();
    const before = await participationOf(fixture.eventId);

    const outcome = await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged after overnight rain.",
      notify: true,
    });

    expect(outcome.event.status).toBe("cancelled");
    expect(outcome.notified).toBe(true);
    expect(outcome.noticesOwed).toBe(6);

    const after = await participationOf(fixture.eventId);
    expect(after.invitations).toEqual(before.invitations);
    expect(after.answers).toEqual(before.answers);
  });

  it("refuses to cancel a draft — an abandoned draft is deleted, not cancelled", async () => {
    const event = await createEventDraft(actorPersonId, draft());

    const failure = await serviceFailure(() =>
      cancelEvent(actorPersonId, event.id, { reason: "Changed my mind.", notify: false }),
    );

    expect(failure.rule).toBe(CANCEL_REQUIRES_APPROVED_RULE);
    expect(await statusOf(event.id)).toBe("draft");
  });

  it("refuses without a reason", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() =>
      cancelEvent(actorPersonId, fixture.eventId, { reason: "   ", notify: true }),
    );

    expect(failure.rule).toBe(CANCELLATION_NEEDS_A_REASON_RULE);
    expect(await statusOf(fixture.eventId)).toBe("approved");
  });

  it("refuses a silent future cancellation without the confirmation", async () => {
    const fixture = await approvedEvent();

    const failure = await serviceFailure(() =>
      cancelEvent(actorPersonId, fixture.eventId, {
        reason: "Pitch waterlogged.",
        notify: false,
      }),
    );

    expect(failure.rule).toBe(SILENCE_NEEDS_CONFIRMATION_RULE);
    expect(await statusOf(fixture.eventId)).toBe("approved");
  });

  it("cancels a past event silently with nothing asked", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });

    const outcome = await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Never happened; tidying the record.",
      notify: false,
    });

    expect(outcome.event.status).toBe("cancelled");
    expect(outcome.noticesOwed).toBe(0);
  });

  it("calls off the messages that had not gone out, and recalls nothing that had", async () => {
    const fixture = await approvedEvent();
    // One invitation has already been delivered.
    await observer.query(
      `update public.notification_jobs set status = 'completed'
        where event_id = $1 and job_type = 'invitation'
          and id = (select id from public.notification_jobs
                     where event_id = $1 and job_type = 'invitation' order by id limit 1)`,
      [fixture.eventId],
    );

    const outcome = await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged.",
      notify: true,
    });

    expect(outcome.messagesCancelled).toBe(5);

    const jobs = await jobsFor(fixture.eventId);
    const invitations = jobs.filter((job) => job.job_type === "invitation");
    expect(invitations.filter((job) => job.status === "cancelled")).toHaveLength(5);
    expect(invitations.filter((job) => job.status === "completed")).toHaveLength(1);

    // The notices the cancellation itself made owing are not among the ones it
    // called off.
    expect(jobs.filter((job) => job.job_type === "cancellation_notice")).toHaveLength(6);
    for (const notice of jobs.filter((job) => job.job_type === "cancellation_notice")) {
      expect(notice.status).toBe("pending");
    }
  });

  it("leaves attendance records untouched where the database lets it cancel at all", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });
    const attendance = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.attendance_records where event_id = $1",
      [fixture.eventId],
    );
    expect(Number(attendance.rows[0].count)).toBe(0);

    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Never happened.",
      notify: false,
    });

    const after = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.attendance_records where event_id = $1",
      [fixture.eventId],
    );
    expect(Number(after.rows[0].count)).toBe(0);
  });
});

describe("the internal cancellation reason", () => {
  const REASON = "Pitch waterlogged after overnight rain, and the referee called it off.";

  it("is in the record and in no recipient-facing payload", async () => {
    const fixture = await approvedEvent();

    await cancelEvent(actorPersonId, fixture.eventId, { reason: REASON, notify: true });

    expect((await readEvent(fixture.eventId)).decisionReason).toBe(REASON);

    const audit = await observer.query<{ reason: string | null }>(
      `select reason from public.audit_events
        where entity_table = 'events' and entity_id = $1 and action = 'event.cancelled'`,
      [fixture.eventId],
    );
    expect(audit.rows[0].reason).toBe(REASON);

    // Asserted on the payload, not on rendered text: every column of every job
    // for this event, as text, and none of them carries the reason.
    const leaked = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.notification_jobs
        where event_id = $1 and (
          coalesce(template_variables::text, '') like '%waterlogged%'
          or coalesce(cancelled_reason, '') like '%waterlogged%'
          or coalesce(last_error, '') like '%waterlogged%'
          or coalesce(held_reason, '') like '%waterlogged%'
          or idempotency_key like '%waterlogged%')`,
      [fixture.eventId],
    );
    expect(Number(leaked.rows[0].count)).toBe(0);
  });

  it("says only that the event was cancelled on the jobs it called off", async () => {
    const fixture = await approvedEvent();

    await cancelEvent(actorPersonId, fixture.eventId, { reason: REASON, notify: true });

    const cancelled = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "invitation",
    );
    for (const job of cancelled) {
      expect(job.cancelled_reason).toBe("The event was cancelled.");
    }
  });

  it("leaves the notice payloads empty", async () => {
    const fixture = await approvedEvent();

    await cancelEvent(actorPersonId, fixture.eventId, { reason: REASON, notify: true });

    const notices = (await jobsFor(fixture.eventId)).filter(
      (job) => job.job_type === "cancellation_notice",
    );
    expect(notices).toHaveLength(6);
    for (const notice of notices) {
      expect(notice.template_variables).toEqual({});
      // Which channel it travels over is Mission 4's question.
      expect(notice.channel).toBeNull();
    }
  });
});

describe("cancellation is terminal — D60", () => {
  async function cancelled() {
    const fixture = await approvedEvent();
    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged.",
      notify: true,
    });
    return fixture;
  }

  it("refuses an amendment by direct service call", async () => {
    const fixture = await cancelled();

    const failure = await serviceFailure(() =>
      amendApprovedEvent(
        actorPersonId,
        fixture.eventId,
        { ...draft(), venue: "University Parks" },
        { notify: true },
      ),
    );

    expect(failure.rule).toBe(EVENT_IS_CANCELLED_RULE);
    expect(await statusOf(fixture.eventId)).toBe("cancelled");
  });

  it("refuses a second cancellation by direct service call", async () => {
    const fixture = await cancelled();

    const failure = await serviceFailure(() =>
      cancelEvent(actorPersonId, fixture.eventId, { reason: "Again.", notify: true }),
    );

    expect(failure.rule).toBe(EVENT_IS_CANCELLED_RULE);
  });

  it("refuses a re-notify by direct service call", async () => {
    const fixture = await cancelled();

    const failure = await serviceFailure(() => renotifyEvent(actorPersonId, fixture.eventId));

    expect(failure.rule).toBe(EVENT_IS_CANCELLED_RULE);
  });

  it("has no service function anywhere that writes a status other than cancelled onto it", async () => {
    const fixture = await cancelled();

    // Approval is the one other status-writing path in the application, and it
    // is guarded on `status = 'draft'`. Named here rather than assumed, because
    // "by any route" is the acceptance criterion.
    const failure = await serviceFailure(() => approveEvent(actorPersonId, fixture.eventId));
    expect(failure.kind).toBe("invalid_transition");

    expect(await statusOf(fixture.eventId)).toBe("cancelled");
  });

  it("shuts the signed RSVP link without taking an answer", async () => {
    const fixture = await approvedEvent();
    const token = "a".repeat(43);
    await observer.query(
      `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
       values ($1, encode(digest($2, 'sha256'), 'hex'), now() + interval '30 days')`,
      [fixture.invitationIds[0], token],
    );

    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged.",
      notify: true,
    });

    const resolution = await resolveRsvpToken(token);
    expect(resolution.state).toBe("cancelled");
    expect(resolution.writable).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// REQ-feed-cancelled
// ---------------------------------------------------------------------------

describe("a cancelled event is never removed", () => {
  it("stays on the operator list, marked cancelled", async () => {
    const fixture = await approvedEvent();
    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged.",
      notify: true,
    });

    const list = await listCurrentSeasonEvents();
    const listed = list.events.find((entry) => entry.id === fixture.eventId);

    expect(listed).toBeDefined();
    expect(listed?.status).toBe("cancelled");
  });

  it("is still readable on its own page, with its counts", async () => {
    const fixture = await approvedEvent();
    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch waterlogged.",
      notify: true,
    });

    const event = await readEvent(fixture.eventId);
    expect(event.invitationCount).toBe(6);
    expect(event.responseCount).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// The record — §4.13
// ---------------------------------------------------------------------------

describe("the change history", () => {
  it("records the actor, the change and the notify choice", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const history = await readEventChangeHistory(fixture.eventId);
    const amendment = history.find((entry) => entry.kind === "amended");

    expect(amendment).toBeDefined();
    expect(amendment?.actorName).toBeTruthy();
    expect(amendment?.notified).toBe(true);
    expect(amendment?.recipients).toBe(6);
    expect(amendment?.changes).toEqual([
      expect.objectContaining({
        field: "venue",
        previous: "Iffley Road Astro",
        next: "University Parks",
      }),
    ]);
  });

  it("sees a description-only amendment, which `schedule_changes` structurally cannot", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), description: "Light session, no contact." },
      { notify: false },
    );

    // The typed schedule history has no columns for a description, and its
    // `something_actually_changed` constraint would refuse the row.
    const schedule = await observer.query(
      "select 1 from public.schedule_changes where event_id = $1",
      [fixture.eventId],
    );
    expect(schedule.rowCount).toBe(0);

    // The amendment is recorded regardless — this is why the history reads the
    // audit stream. See the module header on `schedule_changes`' fitness.
    const history = await readEventChangeHistory(fixture.eventId);
    expect(history[0]).toMatchObject({ kind: "amended", notified: false });
    expect(history[0].changes[0]).toMatchObject({ field: "description" });
  });

  it("writes the typed schedule row when a schedule-shaped field moved", async () => {
    const fixture = await approvedEvent();
    const newDate = futureDay(60);

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), scheduledOn: newDate, startsAt: "19:00" },
      { notify: true },
    );

    const schedule = await observer.query<{
      previous_scheduled_on: Date;
      new_scheduled_on: Date;
      previous_starts_at: string;
      new_starts_at: string;
      notified: boolean;
      source: string;
      recorded_by_person_id: string;
    }>(
      `select previous_scheduled_on, new_scheduled_on,
              previous_starts_at::text as previous_starts_at,
              new_starts_at::text as new_starts_at,
              notified, source::text as source, recorded_by_person_id
         from public.schedule_changes where event_id = $1`,
      [fixture.eventId],
    );

    expect(schedule.rowCount).toBe(1);
    expect(schedule.rows[0].new_starts_at).toBe("19:00:00");
    expect(schedule.rows[0].notified).toBe(true);
    expect(schedule.rows[0].source).toBe("club");
    expect(schedule.rows[0].recorded_by_person_id).toBe(actorPersonId);
  });
});

// ---------------------------------------------------------------------------
// OD-1/Q6 — the chase threshold
// ---------------------------------------------------------------------------

describe("rescheduling recomputes the chase threshold", () => {
  it("recomputes it against the new date, with the type's own stored days", async () => {
    const fixture = await approvedEvent();
    const newDate = futureDay(60);

    const outcome = await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), scheduledOn: newDate },
      { notify: true },
    );

    const days = await observer.query<{ days: number }>(
      "select chase_threshold_days as days from public.event_type_settings where event_type = 'practice'",
    );
    expect(outcome.chaseThresholdOn).toBe(chaseThresholdOn(newDate, days.rows[0].days));

    const audit = await observer.query<{ context: Record<string, unknown> }>(
      `select context from public.audit_events
        where entity_table = 'events' and entity_id = $1 and action = 'event.amended'`,
      [fixture.eventId],
    );
    expect(audit.rows[0].context).toMatchObject({
      chaseThresholdDays: days.rows[0].days,
      chaseThresholdOn: chaseThresholdOn(newDate, days.rows[0].days),
      rescheduled: true,
    });
  });

  it("uses the game threshold for a game and the practice threshold for a practice", async () => {
    const practice = await approvedEvent();
    const game = await approvedEvent({
      name: `${NAME_MARKER} Game`,
      eventType: "game",
    });
    const newDate = futureDay(60);

    const practiceOutcome = await amendApprovedEvent(
      actorPersonId,
      practice.eventId,
      { ...draft(), scheduledOn: newDate },
      { notify: true },
    );
    const gameOutcome = await amendApprovedEvent(
      actorPersonId,
      game.eventId,
      { ...draft({ name: `${NAME_MARKER} Game`, eventType: "game" }), scheduledOn: newDate },
      { notify: true },
    );

    expect(practiceOutcome.chaseThresholdOn).toBe(chaseThresholdOn(newDate, 2));
    expect(gameOutcome.chaseThresholdOn).toBe(chaseThresholdOn(newDate, 7));
  });
});

// ---------------------------------------------------------------------------
// The counts two surfaces state — `docs/ux/standards.md` rule 7
// ---------------------------------------------------------------------------

describe("the confirmations count the same people the event page counts", () => {
  it("agrees with the headline numbers on invited and said yes", async () => {
    const fixture = await approvedEvent();

    const audience = await withTransaction((tx) => readNotifyAudienceIn(tx, fixture.eventId));
    const summary = await readEventAttendanceSummary(fixture.eventId);

    expect(audience.invited).toBe(summary.invited);
    expect(audience.saidYes).toBe(summary.saidYes);
  });

  it("partitions the audience into yes, no and no answer", async () => {
    const fixture = await approvedEvent();

    const audience = await withTransaction((tx) => readNotifyAudienceIn(tx, fixture.eventId));

    expect(audience).toEqual({ invited: 6, saidYes: 3, saidNo: 1, noAnswer: 2 });
  });
});

describe("readAmendmentContext", () => {
  it("states what the screen has to say before anything is typed", async () => {
    const fixture = await approvedEvent();

    const context = await readAmendmentContext(fixture.eventId);

    expect(context.event.status).toBe("approved");
    expect(context.audience).toEqual({ invited: 6, saidYes: 3, saidNo: 1, noAnswer: 2 });
    expect(context.unsentMessages).toBe(6);
    expect(context.chaseThresholdDays).toBe(2);
    expect(context.isFuture).toBe(true);
    expect(context.lastAmendment).toBeNull();
  });

  it("names the last amendment once there has been one", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );

    const context = await readAmendmentContext(fixture.eventId);

    expect(context.lastAmendment).toMatchObject({ kind: "amended", notified: false });
  });
});

// ---------------------------------------------------------------------------
// The constraint this work package could not clear
// ---------------------------------------------------------------------------

describe("cancelling an event that carries attendance records", () => {
  /**
   * **This test pins a defect rather than a decision.**
   *
   * `attendance_records` carries a denormalised copy of the event's status,
   * bound by a composite foreign key declared `on update cascade`, and
   * `attendance_records_require_an_approved_event` says that copy must read
   * `approved`. Cancelling the event therefore cascades `cancelled` onto every
   * attendance row and the check refuses it.
   *
   * W6 says the opposite in words — "attendance records, if any, are
   * untouched", and a cancelled event stays visible with its history and its
   * responses — and D31 permits cancelling a past event as an administrative
   * correction. The realistic case is live: a coach opens the register at
   * 14:00 because the buffer lifted, the pitch floods at 18:00, and the
   * operator cannot call the event off.
   *
   * Clearing it requires widening that check constraint to
   * `event_status in ('approved', 'cancelled')` — exactly what `invitations`
   * already carries — which is a **migration**, and this work package owns
   * none. The test asserts today's behaviour so that the constraint is pinned:
   * when the migration lands, this test fails and is replaced by the one that
   * asserts the cancellation succeeds and the attendance rows survive.
   */
  it("is refused by the database today, and the event stays approved", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });

    // A register saved before the event was called off.
    const invitee = await observer.query<{
      person_id: string;
      season_membership_id: string | null;
      capacity: string;
    }>(
      `select coalesce(i.person_id, m.person_id) as person_id, i.season_membership_id,
              i.capacity::text as capacity
         from public.invitations i
         left join public.season_memberships m on m.id = i.season_membership_id
        where i.event_id = $1 order by i.id limit 1`,
      [fixture.eventId],
    );
    await observer.query(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, presence, person_id,
          season_membership_id, recorded_by_person_id)
       values ($1, 'approved', $2, $6::public.invitation_capacity, 'present', $3, $4, $5)`,
      [
        fixture.eventId,
        fixture.seasonId,
        invitee.rows[0].season_membership_id ? null : invitee.rows[0].person_id,
        invitee.rows[0].season_membership_id,
        actorPersonId,
        invitee.rows[0].capacity,
      ],
    );

    const failure = await serviceFailure(() =>
      cancelEvent(actorPersonId, fixture.eventId, {
        reason: "Pitch flooded after the register was taken.",
        notify: false,
      }),
    );

    // The refusal reaches the operator as a sentence rather than as a stack
    // trace — `docs/ux/standards.md` rule 6 — but it is a sentence about a rule
    // W6 says should not apply here, which is the finding.
    expect(failure.rule).toBe("attendance_records_require_an_approved_event");

    // The transaction rolled back whole: the event is untouched, and so is the
    // register.
    expect(await statusOf(fixture.eventId)).toBe("approved");
    const attendance = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.attendance_records where event_id = $1",
      [fixture.eventId],
    );
    expect(Number(attendance.rows[0].count)).toBe(1);
  });
});
