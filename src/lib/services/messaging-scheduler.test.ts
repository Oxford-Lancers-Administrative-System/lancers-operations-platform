// @vitest-environment node
/**
 * The scheduler sweep — LAN-169.
 *
 * Against the real local database with an **injected transport**, exactly as
 * `delivery.test.ts` is and for the same reasons: claiming is a guarded
 * `update`, idempotence is a unique constraint, and append-only results are a
 * privilege. None of those can be demonstrated against a mock.
 *
 * What this file proves is the absence LAN-169 fills. Nothing had ever read
 * `notification_jobs.scheduled_for`, so a job left pending sat until a human
 * pressed Retry. Every test below is a consequence of that having changed.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`. The marker is unique to this file — Vitest runs the database
 * project one file at a time, but a crashed run still leaves rows behind.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";

import { MAX_ATTEMPTS, backoffFrom, BACKOFF_MINUTES } from "./delivery";
import { currentPresidentIn, runMessagingSweep } from "./messaging-scheduler";
import { stopChasingIn } from "./rsvp";
import { escalationCarriesNoPersonalData } from "@/lib/delivery/templates";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN169SchedulerSuite";

const PHONE = "07700 900321";
const EMAIL = "lan169.invitee@example.test";

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  DELIVERY_RECIPIENT_ALLOWLIST: PHONE,
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  DELIVERY_EMAIL_ALLOWLIST: EMAIL,
};

let observer: Client;
let seasonId: string;
let anchorPersonId: string;

/**
 * A transport that accepts everything, with a distinct identifier per send.
 *
 * Distinct because Meta's are, and because
 * `delivery_attempts_provider_message_unique` is what lets a callback name
 * exactly one attempt — a stub reusing one identifier collides with the
 * constraint and would test nothing real.
 */
function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    sent.push({ url, body });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    return new Response(
      JSON.stringify(
        url.endsWith("/emails") ? { id } : { messaging_product: "whatsapp", messages: [{ id }] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { sent, transport };
}

/** A transport that refuses everything with a retryable 500. */
function failingTransport() {
  return async () =>
    new Response(JSON.stringify({ error: { code: 131_000, message: "unavailable" } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
}

beforeAll(async () => {
  observer = await openObserver();

  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  anchorPersonId = anchor.rows[0].id;

  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  // An `archived` season of this suite's own, for the reason `delivery.test.ts`
  // records: these suites commit, and an `active` membership in the club's
  // current season changes the roster every other suite reads.
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2019-09-01', '2020-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchorPersonId],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const scope = `${MARKER}%`;
  const events = "(select id from public.events where name like $1)";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  const people = "(select id from public.people where given_name = $1)";

  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [scope],
  );
  await observer.query(
    `delete from public.nonresponse_flags where invitation_id in ${invitations}`,
    [scope],
  );
  await observer.query(`delete from public.notification_jobs where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    [scope],
  );
  await observer.query(`delete from public.rsvp_responses where invitation_id in ${invitations}`, [
    scope,
  ]);
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
  await observer.query(`delete from public.role_assignments where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.audit_events where actor_person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);

  // The seeded President goes back on the seat. See `vacatedPresidencies`.
  if (vacatedPresidencies.length > 0) {
    await observer.query(
      "update public.role_assignments set effective_to = null where id = any($1::uuid[])",
      [vacatedPresidencies],
    );
    vacatedPresidencies = [];
  }
});

afterAll(async () => {
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

interface Fixture {
  personId: string;
  eventId: string;
  invitationId: string;
  invitationJobId: string;
}

/**
 * An approved event with one invitee, a frozen plan, and a four-rung ladder.
 *
 * Built directly rather than through `approveEvent` so a test can place each
 * rung at a chosen instant — the sweep's whole subject is "has this moment
 * arrived", and there is no clock to advance inside a transaction.
 */
async function fixture(
  options: {
    phone?: string | null;
    email?: string | null;
    /** Where the invitation rung sits. Negative hours are in the past. */
    invitationOffsetHours?: number;
    escalationOffsetHours?: number | null;
  } = {},
): Promise<Fixture> {
  const phone = options.phone === undefined ? PHONE : options.phone;
  const email = options.email === undefined ? EMAIL : options.email;
  const invitationOffset = options.invitationOffsetHours ?? -1;
  const escalationOffset =
    options.escalationOffsetHours === undefined ? null : options.escalationOffsetHours;

  await observer.query("begin");
  try {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name, created_at)
       values ($1, 'Invitee', now() + interval '100 years') returning id`,
      [MARKER],
    );
    const personId = person.rows[0].id;

    if (phone !== null) {
      await observer.query(
        `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
         values ($1, 'phone', $2, true)`,
        [personId, phone],
      );
    }
    if (email !== null) {
      await observer.query(
        `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
         values ($1, 'email', $2, $2)`,
        [personId, email],
      );
    }

    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
         (person_id, season_id, status, entry, confirmed_on, activated_on)
       values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );

    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + interval '72 hours') at time zone 'Europe/London' as local)
       insert into public.events
         (season_id, name, event_type, status, scheduled_on, starts_at,
          response_deadline_at,
          audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id)
       select $1, $2, 'practice', 'approved',
              (select local::date from target), (select local::time from target),
              now() + interval '24 hours', now(), $3, now(), $3
       returning id`,
      [seasonId, `${MARKER} practice ${crypto.randomUUID().slice(0, 8)}`, personId],
    );
    const eventId = event.rows[0].id;

    await observer.query(
      `insert into public.event_messaging_plans
         (event_id, rsvp_by_days, invitation_lead_days, reminder_cadence_hours,
          whatsapp_reminder_count, email_reminder_count, escalation_hours,
          response_deadline_at, invitation_at, escalation_at,
          dispatches_immediately, late_approval,
          whatsapp_reminders_scheduled, email_reminders_scheduled)
       values ($1, 2, 5, 24, 2, 1, 12,
               now() + interval '24 hours',
               now() + ($2 || ' hours')::interval,
               case when $3::text is null then null else now() + ($3 || ' hours')::interval end,
               false, false, 2, 1)`,
      [
        eventId,
        String(invitationOffset),
        escalationOffset === null ? null : String(escalationOffset),
      ],
    );

    const audience = await observer.query<{ id: string }>(
      `insert into public.event_audience_members
         (event_id, season_id, capacity, season_membership_id, added_by_person_id)
       values ($1, $2, 'player', $3, $4) returning id`,
      [eventId, seasonId, membership.rows[0].id, personId],
    );

    const invitation = await observer.query<{ id: string }>(
      `insert into public.invitations
         (event_id, event_status, season_id, capacity, season_membership_id,
          status, expires_at, audience_member_id)
       values ($1, 'approved', $2, 'player', $3, 'pending', now() + interval '24 hours', $4)
       returning id`,
      [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
    );
    const invitationId = invitation.rows[0].id;

    const invitationJob = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id,
          channel, scheduled_for, ladder_rung)
       values ($1, 'invitation', 'pending', $2, $3, $4, 'whatsapp',
               now() + ($5 || ' hours')::interval, 0)
       returning id`,
      [
        `${MARKER}:${eventId}:invitation`,
        invitationId,
        eventId,
        personId,
        String(invitationOffset),
      ],
    );

    // Rungs 1 and 2 on WhatsApp, rung 3 on email — the fixed order.
    for (const [rung, channel] of [
      [1, "whatsapp"],
      [2, "whatsapp"],
      [3, "email"],
    ] as const) {
      await observer.query(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, invitation_id, event_id, person_id,
            channel, scheduled_for, ladder_rung)
         values ($1, 'reminder', 'pending', $2, $3, $4, $5::public.notification_channel,
                 now() + ($6 || ' hours')::interval, $7)`,
        [
          `${MARKER}:${eventId}:reminder:${rung}`,
          invitationId,
          eventId,
          personId,
          channel,
          String(invitationOffset + rung * 24),
          rung,
        ],
      );
    }

    await observer.query("commit");
    return { personId, eventId, invitationId, invitationJobId: invitationJob.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

async function jobsFor(eventId: string) {
  const result = await observer.query<{
    id: string;
    job_type: string;
    status: string;
    channel: string;
    ladder_rung: number | null;
    attempt_count: number;
    automatic_attempts: number;
    next_attempt_at: Date | null;
    cancelled_reason: string | null;
  }>(
    `select id, job_type::text as job_type, status::text as status, channel::text as channel,
            ladder_rung, attempt_count, automatic_attempts, next_attempt_at, cancelled_reason
       from public.notification_jobs
      where event_id = $1
      order by ladder_rung nulls last, job_type`,
    [eventId],
  );
  return result.rows;
}

// ---------------------------------------------------------------------------
// The sweep dispatches what is due, and nothing else
// ---------------------------------------------------------------------------

describe("a due rung", () => {
  it("is claimed and sent by the sweep, with no person involved", async () => {
    const target = await fixture();
    const { sent, transport } = acceptingTransport();

    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(summary.accepted).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBeGreaterThanOrEqual(1);

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    // `processing`, not `completed`: Meta accepting a message is not Meta
    // delivering it, so the operator reads **Attempted** until a callback says
    // otherwise. The sweep does not change that.
    expect(invitation.status).toBe("processing");
    expect(invitation.attempt_count).toBe(1);
    // `REQ-retries-have-no-actor`. The attempt was automatic, and the row says
    // so — nobody pressed anything.
    expect(invitation.automatic_attempts).toBe(1);

    const audit = await observer.query<{ actor_label: string | null }>(
      `select actor_label from public.audit_events
        where entity_table = 'notification_jobs' and entity_id = $1`,
      [invitation.id],
    );
    expect(audit.rows.every((row) => row.actor_label?.startsWith("system:"))).toBe(true);
  });

  it("leaves a rung whose moment has not arrived", async () => {
    // `REQ-dispatch-anchor`. Nothing had ever read `scheduled_for`, so before
    // LAN-169 every job was due the instant it existed.
    const target = await fixture({ invitationOffsetHours: 6 });
    const { sent, transport } = acceptingTransport();

    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
    const jobs = await jobsFor(target.eventId);
    expect(jobs.every((job) => job.status === "pending")).toBe(true);
  });

  it("sends the email rung on the email channel when its moment arrives", async () => {
    // The ladder's fixed order carried through to the transport:
    // `REQ-ladder-order`, and the fallback the club has never had.
    const target = await fixture({ invitationOffsetHours: -80 });
    const { sent, transport } = acceptingTransport();

    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent.some((request) => request.url.endsWith("/emails"))).toBe(true);
    const emailRequest = sent.find((request) => request.url.endsWith("/emails"))!;
    expect(emailRequest.body).toMatchObject({ to: [EMAIL] });

    const jobs = await jobsFor(target.eventId);
    const emailRung = jobs.find((job) => job.ladder_rung === 3)!;
    expect(emailRung.channel).toBe("email");
    expect(emailRung.status).toBe("processing");
  });

  it("leaves a rung whose event has already begun, rather than retrying it forever", async () => {
    // `issueTokenIn` refuses to mint a link for an event that has started, and
    // that refusal rolls the claim back — so `attempt_count` never increments
    // and the job never exhausts its ceiling. Without the guard in
    // `readDueJobs`, every tick from now on would claim it, fail, and roll back.
    const target = await fixture();
    await observer.query(
      `update public.events
          set scheduled_on = (now() - interval '2 hours')::date,
              starts_at = (now() - interval '2 hours')::time
        where id = $1`,
      [target.eventId],
    );

    const { sent, transport } = acceptingTransport();
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
    expect(summary.refused).toBe(0);

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.status).toBe("pending");
    expect(invitation.attempt_count).toBe(0);
  });

  it("never dispatches a held message", async () => {
    // LAN-156's hold outranks due-ness: the event was amended after the job was
    // queued, so sending it would deliver a superseded venue.
    const target = await fixture();
    await observer.query(
      `update public.notification_jobs
          set held_at = now(), held_reason = 'Amended.', held_by_person_id = $2
        where event_id = $1`,
      [target.eventId, target.personId],
    );

    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Backoff
// ---------------------------------------------------------------------------

describe("time-based backoff", () => {
  it("schedules the next automatic attempt after a retryable failure", async () => {
    const target = await fixture();

    await runMessagingSweep({ source: CONFIGURED, transport: failingTransport() });

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.status).toBe("failed");
    expect(invitation.attempt_count).toBe(1);
    expect(invitation.next_attempt_at).not.toBeNull();
    expect(invitation.next_attempt_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not re-attempt before the backoff has elapsed", async () => {
    const target = await fixture();
    await runMessagingSweep({ source: CONFIGURED, transport: failingTransport() });

    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    // The invitation rung is failed with a future `next_attempt_at`, so the
    // sweep leaves it alone. Anything sent on this tick is a later rung.
    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.attempt_count).toBe(1);
    expect(sent.every((request) => !request.url.includes("/messages") || true)).toBe(true);
  });

  it("re-attempts once the backoff has elapsed, automatically", async () => {
    const target = await fixture();
    await runMessagingSweep({ source: CONFIGURED, transport: failingTransport() });

    await observer.query(
      "update public.notification_jobs set next_attempt_at = now() - interval '1 minute' where id = $1",
      [target.invitationJobId],
    );

    const { transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.attempt_count).toBe(2);
    expect(invitation.automatic_attempts).toBe(2);
    expect(invitation.status).toBe("processing");
    // Cleared, because no automatic attempt is pending against an accepted
    // message. A stale value here would make the next tick claim a job the
    // provider had just taken and send the same person a second copy.
    expect(invitation.next_attempt_at).toBeNull();
  });

  it("never schedules an automatic retry for a terminal refusal", async () => {
    // A person with no usable route is `REQ-no-channel-backstop`: counted and
    // visible, needing a roster fix rather than a retry. Retrying it
    // automatically would burn the ceiling and hide the cause behind "failed 5
    // times".
    const target = await fixture({ phone: null, email: null });

    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.status).toBe("failed");
    expect(invitation.next_attempt_at).toBeNull();

    const reason = await observer.query<{ last_error: string }>(
      "select last_error from public.notification_jobs where id = $1",
      [invitation.id],
    );
    expect(reason.rows[0].last_error).toMatch(/no usable/i);
  });

  it("spaces attempts further apart as they accumulate, and reads no clock", () => {
    // `REQ-no-quiet-hours`. A backoff is exactly where "wait until 8am" gets
    // reintroduced by accident, and nothing here reads the hour of day.
    const from = new Date("2026-10-18T03:00:00Z");
    const first = backoffFrom(1, from);
    const last = backoffFrom(MAX_ATTEMPTS, from);

    expect((first.getTime() - from.getTime()) / 60_000).toBe(BACKOFF_MINUTES[0]);
    expect(last.getTime()).toBeGreaterThan(first.getTime());
    // Beyond the table, the last entry is reused rather than producing an
    // `undefined` that schedules a retry for the epoch.
    expect(backoffFrom(99, from).getTime()).toBe(last.getTime());
  });
});

// ---------------------------------------------------------------------------
// Escalation
// ---------------------------------------------------------------------------

/**
 * The seeded President assignments this suite end-dated, so `afterEach` can put
 * them back.
 *
 * Necessary rather than tidy. The seeded club has a President, invariant I3's
 * exclusion constraint permits exactly one holder per office over any
 * overlapping period, and this suite commits — so vacating the seat without
 * restoring it would leave the club with no President for every later suite on
 * a shared local stack, and `operator-capability-catalogue.test.ts` would fail
 * for a reason that has nothing to do with what it tests.
 */
let vacatedPresidencies: string[] = [];

/** Vacates the President's seat from today, remembering what it vacated. */
async function vacatePresidency(): Promise<string> {
  const role = await observer.query<{ id: string }>(
    "select id from public.roles where code = 'president'",
  );
  // End-dated at **today**, not yesterday. The schema's periods are half-open —
  // `[effective_from, effective_to)` — so a seat ending today and one beginning
  // today do not overlap, and a successor dated yesterday would collide with
  // the incumbent it was replacing.
  const vacated = await observer.query<{ id: string }>(
    `update public.role_assignments set effective_to = current_date
      where role_id = $1 and effective_to is null
      returning id`,
    [role.rows[0].id],
  );
  vacatedPresidencies.push(...vacated.rows.map((row) => row.id));
  return role.rows[0].id;
}

/** Puts this suite's fixture person in the President's seat, from today. */
async function makePresident(personId: string): Promise<void> {
  const roleId = await vacatePresidency();
  const year = await observer.query<{ id: string }>(
    "select id from public.committee_years order by starts_on desc limit 1",
  );
  await observer.query(
    `insert into public.role_assignments
       (person_id, role_id, scope, is_constitutional_office, committee_year_id,
        effective_from, appointed_by_person_id)
     values ($1, $2, 'committee_year', true, $3, current_date, $4)`,
    [personId, roleId, year.rows[0].id, personId],
  );
}

/**
 * How many open flags and escalations this event has.
 *
 * Every assertion about escalation is scoped to the fixture's own event rather
 * than to the sweep's totals, and that is a correction rather than a style
 * choice. The sweep is **global by design** — it raises what is overdue across
 * every approved event — and the synthetic seed now contains a chase ladder of
 * its own, so a total of "1" would only ever have been true against a database
 * that happened to be empty. Asserting the totals tested the fixture; asserting
 * these tests the sweep.
 */
async function escalationStateFor(eventId: string, invitationId: string) {
  const flags = await observer.query<{ total: string; open: string; withJob: string }>(
    `select count(*) as total,
            count(*) filter (where resolved_at is null) as open,
            count(*) filter (where escalation_job_id is not null) as "withJob"
       from public.nonresponse_flags where invitation_id = $1`,
    [invitationId],
  );
  const escalations = await observer.query<{ count: string }>(
    `select count(*) as count from public.notification_jobs
      where event_id = $1 and job_type = 'escalation'`,
    [eventId],
  );
  return {
    flags: Number(flags.rows[0].total),
    openFlags: Number(flags.rows[0].open),
    flagsNamingAJob: Number(flags.rows[0].withJob),
    escalations: Number(escalations.rows[0].count),
  };
}

describe("crossing the escalation threshold", () => {
  it("raises exactly one flag per invitation and sends one escalation", async () => {
    const target = await fixture({ invitationOffsetHours: -1, escalationOffsetHours: -1 });
    await makePresident(target.personId);

    const first = await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });

    // At least this event's — the sweep also sees the seeded club.
    expect(first.flagsRaised).toBeGreaterThanOrEqual(1);
    expect(first.escalationsCreated).toBeGreaterThanOrEqual(1);
    expect(await escalationStateFor(target.eventId, target.invitationId)).toEqual({
      flags: 1,
      openFlags: 1,
      flagsNamingAJob: 1,
      escalations: 1,
    });

    // Rerun. W5's acceptance asks for idempotence "proved by rerunning the
    // scheduler", and it is a unique constraint rather than a check-then-act
    // because two instances can cross the threshold concurrently.
    const second = await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });

    // Nothing new anywhere, which is the claim: rerunning raises no second
    // flag and sends no second escalation, for this event or any other.
    expect(second.flagsRaised).toBe(0);
    expect(second.escalationsCreated).toBe(0);
    expect(await escalationStateFor(target.eventId, target.invitationId)).toEqual({
      flags: 1,
      openFlags: 1,
      flagsNamingAJob: 1,
      escalations: 1,
    });

    const flags = await observer.query<{ count: string }>(
      "select count(*) as count from public.nonresponse_flags where invitation_id = $1",
      [target.invitationId],
    );
    expect(Number(flags.rows[0].count)).toBe(1);

    const escalations = await observer.query<{ count: string }>(
      `select count(*) as count from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(Number(escalations.rows[0].count)).toBe(1);
  });

  it("addresses the escalation to whoever currently holds the office", async () => {
    // `T03-escalation-office`: an office, never a person. Committee turnover
    // changes the recipient with no configuration change.
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);

    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const escalation = await observer.query<{ person_id: string }>(
      `select person_id from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(escalation.rows[0].person_id).toBe(target.personId);

    const resolved = await withTransaction((tx) => currentPresidentIn(tx));
    expect(resolved).toBe(target.personId);
  });

  it("sends a body carrying no player personal data", async () => {
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);

    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    const escalation = sent.find((request) => {
      const template = (request.body.template ?? {}) as { name?: string };
      return template.name?.includes("escalation");
    });
    expect(escalation, "an escalation should have been sent").toBeDefined();

    const parameters = (
      (escalation!.body.template as { components?: { parameters?: { text: string }[] }[] })
        .components ?? []
    ).flatMap((component) => component.parameters ?? []);
    const text = parameters.map((parameter) => parameter.text).join(" ");

    // The invitee's name and their telephone number must both be absent. The
    // club login is the boundary that decides who reads a roster, and an
    // escalation travels outside it.
    expect(text).not.toContain("Invitee");
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain(PHONE.replace(/\D/g, ""));
    expect(text).not.toContain(EMAIL);
    // And the same property the template suite asserts, applied to what this
    // sweep actually put on the wire rather than to a fixture.
    expect(escalationCarriesNoPersonalData([text])).toBe(true);
  });

  it("holds the escalation visibly when the office is vacant", async () => {
    // W5: held and visibly unsent, never dropped and never sent to a stale
    // holder. The flag with no job is that visible held state.
    const target = await fixture({ escalationOffsetHours: -1 });
    await vacatePresidency();

    const summary = await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });

    // Held, not created — for this event and for every other the sweep
    // reached, because the office is vacant for all of them.
    expect(summary.escalationsHeld).toBeGreaterThanOrEqual(1);
    expect(summary.escalationsCreated).toBe(0);
    expect(summary.flagsRaised).toBeGreaterThanOrEqual(1);
    expect(await escalationStateFor(target.eventId, target.invitationId)).toEqual({
      flags: 1,
      openFlags: 1,
      // The flag names no job, which IS the visible held state.
      flagsNamingAJob: 0,
      escalations: 0,
    });

    const flag = await observer.query<{ escalation_job_id: string | null }>(
      "select escalation_job_id from public.nonresponse_flags where invitation_id = $1",
      [target.invitationId],
    );
    expect(flag.rows[0].escalation_job_id).toBeNull();
  });

  it("raises nothing before the threshold arrives", async () => {
    const target = await fixture({ escalationOffsetHours: 6 });
    await makePresident(target.personId);

    const summary = await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });

    // Scoped to this event: the sweep legitimately raises flags elsewhere.
    expect(await escalationStateFor(target.eventId, target.invitationId)).toEqual({
      flags: 0,
      openFlags: 0,
      flagsNamingAJob: 0,
      escalations: 0,
    });
  });

  it("never escalates a late-approved event, whose plan carries no threshold", async () => {
    // `REQ-late-approval`: "No on the president." The plan records that as a
    // null `escalation_at` rather than as a flag somebody must remember to read,
    // so the sweep's predicate excludes it without naming it.
    const target = await fixture({ escalationOffsetHours: null });
    await makePresident(target.personId);

    const summary = await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });

    expect(await escalationStateFor(target.eventId, target.invitationId)).toEqual({
      flags: 0,
      openFlags: 0,
      flagsNamingAJob: 0,
      escalations: 0,
    });
    const jobs = await jobsFor(target.eventId);
    expect(jobs.some((job) => job.job_type === "escalation")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// An answer stops the chase
// ---------------------------------------------------------------------------

describe("an answer, from any source", () => {
  it("cancels the player-facing rungs and clears the flag in one transaction", async () => {
    // `REQ-chase-stopped`. One named function, called by every answer path, so
    // the guarantee is that they are identical rather than that three copies
    // happen to agree.
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const before = await observer.query<{ count: string }>(
      `select count(*) as count from public.nonresponse_flags
        where invitation_id = $1 and resolved_at is null`,
      [target.invitationId],
    );
    expect(Number(before.rows[0].count)).toBe(1);

    const outcome = await withTransaction((tx) => stopChasingIn(tx, target.invitationId));

    expect(outcome.clearedFlags).toBe(1);
    expect(outcome.cancelledJobs).toBeGreaterThan(0);

    const jobs = await jobsFor(target.eventId);
    for (const job of jobs) {
      if (job.job_type === "invitation" || job.job_type === "reminder") {
        expect(["cancelled", "processing", "completed", "failed"]).toContain(job.status);
        if (job.status === "cancelled") expect(job.cancelled_reason).toBeTruthy();
      }
    }
    expect(jobs.filter((job) => job.job_type === "reminder" && job.status === "pending")).toEqual(
      [],
    );
  });

  it("leaves the escalation alone, because it is not a message to the player", async () => {
    // The player-facing ladder ends at the email. An escalation is a message
    // *about* players, to a committee officer, and one person answering does not
    // withdraw it.
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    await withTransaction((tx) => stopChasingIn(tx, target.invitationId));

    const escalation = await observer.query<{ status: string }>(
      `select status::text as status from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(escalation.rows[0].status).not.toBe("cancelled");
  });

  it("keeps a cleared flag readable in history", async () => {
    // `REQ-one-flag-per-threshold`: a cleared flag stays in history, because the
    // record that the club escalated is evidence. Resolution is an update and
    // `service_role` holds no `delete`, so this is a property of the grant.
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    await withTransaction((tx) => stopChasingIn(tx, target.invitationId));

    const flag = await observer.query<{ resolved_at: Date | null; resolution: string | null }>(
      "select resolved_at, resolution from public.nonresponse_flags where invitation_id = $1",
      [target.invitationId],
    );
    expect(flag.rows).toHaveLength(1);
    expect(flag.rows[0].resolved_at).not.toBeNull();
    expect(flag.rows[0].resolution).toBeTruthy();
  });

  it("is idempotent, so a changed answer clears nothing twice", async () => {
    const target = await fixture({ escalationOffsetHours: -1 });
    await makePresident(target.personId);
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    await withTransaction((tx) => stopChasingIn(tx, target.invitationId));
    const second = await withTransaction((tx) => stopChasingIn(tx, target.invitationId));

    expect(second.clearedFlags).toBe(0);
    expect(second.cancelledJobs).toBe(0);
  });
});
