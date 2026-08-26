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
  RENOTIFY_ALREADY_SENT_RULE,
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
import { readAttendanceBoard, readEventAttendanceSummary } from "./attendance";
import {
  dispatchEventInvitations,
  JOB_HELD_MESSAGE,
  JOB_HELD_RULE,
  readEventDelivery,
  retryDelivery,
} from "./delivery";
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

  it("stops the operator's Retry sending one, as a sentence rather than a shrug", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const job = await observer.query<{ id: string }>(
      `select id from public.notification_jobs
        where event_id = $1 and job_type = 'invitation' order by id limit 1`,
      [fixture.eventId],
    );

    const failure = await serviceFailure(() =>
      retryDelivery(actorPersonId, job.rows[0].id, {
        source: {},
        transport: async () => new Response("{}", { status: 200 }),
      }),
    );

    expect(failure.rule).toBe(JOB_HELD_RULE);
    expect(failure.message).toBe(JOB_HELD_MESSAGE);

    const attempts = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts
        where notification_job_id = $1`,
      [job.rows[0].id],
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

  /**
   * R156-B3, the reproduction the reviewer handed to this round. Three
   * strings on the amend and delivery screens said that notifying, or
   * pressing Re-notify, releases the hold — `queuedMessagesDetail`,
   * `describeRetryability` and the delivery held banner. Nothing in the
   * repository ever clears `held_at`; only Mission 4 decides whether a held
   * job resumes. Proved here directly: the same job's `held_at`, unmoved,
   * across a second amendment that *does* notify.
   */
  it("held_at is unchanged by an amendment that notifies", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );
    const heldAt = (await jobsFor(fixture.eventId)).find(
      (job) => job.job_type === "invitation",
    )?.held_at;
    expect(heldAt).not.toBeNull();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks", description: "Bring boots — pitch is wet." },
      { notify: true },
    );

    const after = (await jobsFor(fixture.eventId)).filter((job) => job.job_type === "invitation");
    for (const job of after) {
      expect(job.held_at).toEqual(heldAt);
      // Still held, not queued to send — notifying created a fresh notice
      // job; it did not touch this one.
      expect(job.status).toBe("pending");
    }
  });

  it("held_at is unchanged by re-notify", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );
    const heldAt = (await jobsFor(fixture.eventId)).find(
      (job) => job.job_type === "invitation",
    )?.held_at;
    expect(heldAt).not.toBeNull();

    await renotifyEvent(actorPersonId, fixture.eventId);

    const after = (await jobsFor(fixture.eventId)).filter((job) => job.job_type === "invitation");
    for (const job of after) {
      expect(job.held_at).toEqual(heldAt);
      expect(job.status).toBe("pending");
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
// The amend screen and the delivery screen, describing one event
// ---------------------------------------------------------------------------

/**
 * **Brian, 2026-08-23, at the visual gate.** The amend screen for S&C — hilary
 * week 2 said "47 messages have not gone out yet. Saving holds them…" while the
 * delivery screen for the same event said **0 Queued, 0 Delivered, 0 Failed**
 * and "Nothing has been sent for this event yet." His words: *"I don't know
 * what I'm supposed to be seeing here."*
 *
 * Both surfaces were wrong, in opposite directions, and each was self-
 * consistent — which is why neither had a failing test.
 *
 *   * `readAmendmentContext` counted **every** job type, so an event amended
 *     once counted its own `schedule_change_notice` rows back at the operator
 *     as messages awaiting delivery. It is now scoped to `invitation`.
 *   * `readEventDelivery` knew nothing about `held_at`, so a held invitation
 *     rendered as **Queued** — or as **Failed** beside a live **Retry** button
 *     that then refused it. It now reads **Held**.
 *
 * These tests bind the two together at the service layer, which is where both
 * screens get their numbers. They fail if either side drifts back.
 */
describe("the amend screen and the delivery screen agree about one event", () => {
  /**
   * The bridge between the two screens, as an identity rather than as two
   * numbers that happen to match today.
   *
   * The amend screen counts invitation jobs that have not gone out. The
   * delivery screen sorts the same jobs into states. So every job the amend
   * screen counts appears in exactly one of **Held**, **Queued**, **Failed**
   * and **Retryable**, and nothing else on the delivery screen is one of them:
   * `delivered` is `completed` and `attempted` is `processing`, neither of
   * which is unsent.
   */
  const notYetSent = (delivery: Awaited<ReturnType<typeof readEventDelivery>>) =>
    delivery.counts.held +
    delivery.counts.queued +
    delivery.counts.failed +
    delivery.counts.retryable;

  it("quotes the number the delivery screen then shows as held", async () => {
    const fixture = await approvedEvent();

    const before = await readAmendmentContext(fixture.eventId);
    const deliveryBefore = await readEventDelivery(fixture.eventId);

    expect(before.unsentMessages).toBeGreaterThan(0);
    expect(deliveryBefore.counts.held).toBe(0);
    expect(before.unsentMessages).toBe(notYetSent(deliveryBefore));

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const deliveryAfter = await readEventDelivery(fixture.eventId);

    // The number the operator was shown before saving is the number the
    // delivery screen now shows as held. This is the assertion Brian's two
    // screens would have failed: he saw 47 on one and 0 on the other.
    expect(deliveryAfter.counts.held).toBe(before.unsentMessages);
    expect(deliveryAfter.counts.queued).toBe(0);
    expect(notYetSent(deliveryAfter)).toBe(before.unsentMessages);
  });

  it("counts invitations only, and never the change notices it created itself", async () => {
    const fixture = await approvedEvent();

    // One amendment, notified: every invitation is held and a change notice per
    // invitee is created. Those notices are unsent jobs for this event, and on
    // the operator's next visit to the form the old count reported them as
    // messages awaiting delivery — against a delivery screen that does not show
    // them at all, because it reports on invitations.
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const jobs = await jobsFor(fixture.eventId);
    const unsentNotices = jobs.filter(
      (job) => job.job_type === "schedule_change_notice" && job.held_at === null,
    );
    const unsentOfEveryType = jobs.filter(
      (job) => job.held_at === null || job.job_type === "invitation",
    );
    expect(unsentNotices.length).toBeGreaterThan(0);

    const context = await readAmendmentContext(fixture.eventId);
    const delivery = await readEventDelivery(fixture.eventId);

    // The identity still holds after the amendment: the held invitations are
    // counted by both surfaces…
    expect(context.unsentMessages).toBe(notYetSent(delivery));
    expect(delivery.counts.held).toBe(context.unsentMessages);

    // …and the notices are counted by neither. The old count returned
    // `invitations + notices` here, which is what produced two screens
    // describing one event differently.
    expect(context.unsentMessages).toBeLessThan(unsentOfEveryType.length);
    expect(delivery.rows.some((row) => row.state === "queued")).toBe(false);
  });

  it("shows a held message as Held, and offers no Retry on it", async () => {
    const fixture = await approvedEvent();

    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const delivery = await readEventDelivery(fixture.eventId);
    const held = delivery.rows.filter((row) => row.state === "held");

    expect(held.length).toBeGreaterThan(0);
    expect(held).toHaveLength(delivery.counts.held);

    // `retryDelivery` throws `JOB_HELD_MESSAGE` at every one of these, so the
    // button must not be offered — `docs/ux/standards.md` rule 4. Before this
    // change the row read **Queued** and `retryable` was true.
    for (const row of held) {
      expect(row.retryable).toBe(false);
    }

    // And the refusal is still the refusal, so the screen and the service are
    // saying the same thing rather than the screen merely hiding a control.
    const failure = await serviceFailure(() =>
      retryDelivery(actorPersonId, held[0].jobId, {
        source: {},
        transport: async () => new Response("{}", { status: 200 }),
      }),
    );
    expect(failure.rule).toBe(JOB_HELD_RULE);
    expect(failure.message).toBe(JOB_HELD_MESSAGE);
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

  /**
   * R156-A5. `page.tsx` only renders the Re-notify control where the most
   * recent amendment went out silently, and until now that was the *only*
   * place the rule lived — a caller reaching `renotifyEvent` some other way
   * could double-notify a change everyone had already been told about. The
   * rule is asserted at the service directly here, with the page's own gate
   * uninvolved.
   */
  it("refuses when the last amendment already notified", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: true },
    );

    const failure = await serviceFailure(() => renotifyEvent(actorPersonId, fixture.eventId));

    expect(failure.rule).toBe(RENOTIFY_ALREADY_SENT_RULE);
  });

  it("refuses after a later amendment notified, even though an earlier one was silent", async () => {
    const fixture = await approvedEvent();
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks" },
      { notify: false, silenceConfirmed: true },
    );
    await amendApprovedEvent(
      actorPersonId,
      fixture.eventId,
      { ...draft(), venue: "University Parks", description: "Bring boots — pitch is wet." },
      { notify: true },
    );

    const failure = await serviceFailure(() => renotifyEvent(actorPersonId, fixture.eventId));

    expect(failure.rule).toBe(RENOTIFY_ALREADY_SENT_RULE);
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

    // Seventeen: the five invitations that had not gone out, plus the whole
    // of the chase ladder behind them — six invitees times two reminders
    // (round 2, Q-19, OWNER-LAN171-05: the invitation counts as WhatsApp #1,
    // so the default policy of 2 WhatsApp + 1 email produces one further
    // WhatsApp reminder and one email reminder per invitee, not two WhatsApp
    // reminders and an email).
    //
    // LAN-169 is what changed this number, and the change is the behaviour
    // rather than an accounting artefact. Before the ladder existed, cancelling
    // an event called off one queued invitation per person and there was
    // nothing else waiting; now every reminder and the email rung are queued at
    // approval, and cancelling an event that leaves them behind would chase
    // forty people for a fortnight about a match that is not happening.
    expect(outcome.messagesCancelled).toBe(17);

    const jobs = await jobsFor(fixture.eventId);
    const invitations = jobs.filter((job) => job.job_type === "invitation");
    expect(invitations.filter((job) => job.status === "cancelled")).toHaveLength(5);
    expect(invitations.filter((job) => job.status === "completed")).toHaveLength(1);

    // Every rung, not only the first. A reminder left `pending` on a cancelled
    // event is one the sweep would dispatch when its moment arrived. Six
    // invitees, two reminders each (round 2, Q-19, OWNER-LAN171-05).
    const reminders = jobs.filter((job) => job.job_type === "reminder");
    expect(reminders).toHaveLength(12);
    expect(reminders.every((job) => job.status === "cancelled")).toBe(true);

    // The notices the cancellation itself made owing are not among the ones it
    // called off.
    expect(jobs.filter((job) => job.job_type === "cancellation_notice")).toHaveLength(6);
    for (const notice of jobs.filter((job) => job.job_type === "cancellation_notice")) {
      expect(notice.status).toBe("pending");
    }
  });

  /**
   * R156-A4. Previously asserted 0 rows before and 0 rows after, on an event
   * with no attendance ever recorded — which passes identically whether
   * `cancelEvent` leaves attendance alone or deletes it outright, so it
   * proved nothing about the migration this describes
   * (`20260823090000_attendance_survives_cancellation.sql`). This records a
   * real row first, against a real membership, so the assertion can actually
   * fail against a cancellation that recalled or altered it.
   */
  it("leaves attendance records untouched where the database lets it cancel at all", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });

    // A register entry recorded before the event was called off. The insert
    // shape matches "cancelling an event that carries attendance records"
    // below, which proves the same fact against the migration's own
    // description; this one asserts it as an ordinary property of an
    // ordinary cancellation.
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
    const saved = await observer.query<{ id: string }>(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, presence, person_id,
          season_membership_id, recorded_by_person_id)
       values ($1, 'approved', $2, $6::public.invitation_capacity, 'present', $3, $4, $5)
       returning id`,
      [
        fixture.eventId,
        fixture.seasonId,
        invitee.rows[0].season_membership_id ? null : invitee.rows[0].person_id,
        invitee.rows[0].season_membership_id,
        actorPersonId,
        invitee.rows[0].capacity,
      ],
    );

    const before = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.attendance_records where event_id = $1",
      [fixture.eventId],
    );
    expect(Number(before.rows[0].count)).toBe(1);

    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Never happened.",
      notify: false,
    });

    // The same row, by identity, not merely the same count — a cancellation
    // that deleted this row and left some other row behind would pass a bare
    // count check.
    const after = await observer.query<{ id: string; presence: string; event_status: string }>(
      "select id, presence::text as presence, event_status::text as event_status " +
        "from public.attendance_records where event_id = $1",
      [fixture.eventId],
    );
    expect(after.rows).toEqual([
      { id: saved.rows[0].id, presence: "present", event_status: "cancelled" },
    ]);
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
// Cancelling an event whose register has already been opened
// ---------------------------------------------------------------------------

describe("cancelling an event that carries attendance records", () => {
  /**
   * The case W6 describes and this branch's second migration cleared.
   *
   * `attendance_records` carries a denormalised copy of the event's status,
   * bound by a composite foreign key declared `on update cascade`, and
   * `attendance_records_require_an_approved_event` used to say that copy must
   * read exactly `approved`. Cancelling the event cascaded `cancelled` onto
   * every attendance row and the check refused it, so an event whose register
   * had been opened could not be called off at all.
   *
   * That contradicted W6 — "attendance records, if any, are untouched", and a
   * cancelled event stays visible with its history and its responses (D57) —
   * and D31, which permits cancelling a past event as an administrative
   * correction. It was not an edge case either: D71's buffer opens the register
   * before the event starts, so a coach opens it at 14:00, the pitch floods at
   * 18:00, and the operator cannot act.
   *
   * `20260823090000_attendance_survives_cancellation.sql` widens the check to
   * `event_status in ('approved', 'cancelled')` — exactly what `invitations`
   * already carries for invariant P1. Mission question Q-8, decided.
   */
  it("succeeds, and every attendance record survives by count and identity", async () => {
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
    const saved = await observer.query<{ id: string }>(
      `insert into public.attendance_records
         (event_id, event_status, season_id, capacity, presence, person_id,
          season_membership_id, recorded_by_person_id)
       values ($1, 'approved', $2, $6::public.invitation_capacity, 'present', $3, $4, $5)
       returning id`,
      [
        fixture.eventId,
        fixture.seasonId,
        invitee.rows[0].season_membership_id ? null : invitee.rows[0].person_id,
        invitee.rows[0].season_membership_id,
        actorPersonId,
        invitee.rows[0].capacity,
      ],
    );

    const outcome = await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch flooded after the register was taken.",
      notify: false,
    });

    expect(outcome.event.status).toBe("cancelled");
    expect(await statusOf(fixture.eventId)).toBe("cancelled");

    // The same row, not a replacement, and not a second one: W6's "untouched"
    // is about identity, so counting is not enough on its own. The cascade has
    // rewritten its copy of the status, which is the whole mechanism — the row
    // still points at the event it was recorded against.
    const attendance = await observer.query<{
      id: string;
      event_status: string;
      presence: string;
    }>(
      `select id, event_status::text as event_status, presence::text as presence
         from public.attendance_records where event_id = $1`,
      [fixture.eventId],
    );
    expect(attendance.rows).toHaveLength(1);
    expect(attendance.rows[0].id).toBe(saved.rows[0].id);
    expect(attendance.rows[0].presence).toBe("present");
    expect(attendance.rows[0].event_status).toBe("cancelled");
  });

  /**
   * The half of invariant P5 that did **not** move. Widening the check to admit
   * `cancelled` must not make attendance attachable to a draft, and the service
   * refuses it before the database is asked — `closedReasonFor` in
   * `attendance.ts` returns `not_approved` for any status that is not
   * `approved`. The database's own refusal of a draft is proved in
   * `tests/schema-invariants.test.ts`.
   */
  it("does not make a cancelled event's register writable again", async () => {
    const fixture = await approvedEvent({ scheduledOn: pastDay() });
    await cancelEvent(actorPersonId, fixture.eventId, {
      reason: "Pitch flooded.",
      notify: false,
    });

    const board = await readAttendanceBoard(fixture.eventId);

    expect(board.isOpen).toBe(false);
    expect(board.closedReason).toBe("not_approved");
  });
});
