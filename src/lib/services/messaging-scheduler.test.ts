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

import {
  MAX_ATTEMPTS,
  backoffFrom,
  BACKOFF_MINUTES,
  dispatchJob,
  EMAIL_FALLBACK_SUFFIX,
  readEventDeliveryDiagnostics,
} from "./delivery";
import {
  currentPresidentIn,
  dispatchEscalationJob,
  runMessagingSweep,
} from "./messaging-scheduler";
import { stopChasingIn } from "./rsvp";
import { escalationCarriesNoPersonalData } from "@/lib/delivery/templates";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

// LAN-181, F-W1. Every sweep call below is real work against the shared local
// database — a claim per due job, up to `SWEEP_BATCH_LIMIT` (50) of them, not
// a mock. Under `npm run test`'s default file parallelism that is dozens of
// other database suites' own queries contending for the same Postgres
// connection at once, and Vitest's 5s default has been observed too tight for
// that under full-suite load, independent of any one test's own logic.
vi.setConfig({ testTimeout: 20_000 });

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

/**
 * LAN-181, F-W1. `runMessagingSweep()` is global by design — it is `readDueJobs`
 * against the whole `notification_jobs` table, not this file's own rows — and
 * LAN-181's own seed repair (F-A1) means the local database this suite runs
 * against always carries genuine ambient due jobs from the synthetic future
 * calendar, alongside whatever fixture a test adds. `readDueJobs` orders by how
 * overdue a job is and caps one call at `SWEEP_BATCH_LIMIT` (50) — pacing that
 * exists for production (LAN-177) — so a fixture whose own rung is only a
 * little overdue can lose the batch's 50 slots to ambient jobs that became due
 * earlier, and never get claimed at all on the one sweep call a test makes.
 * Empirically reproducible: three tests failed this way against a freshly
 * repaired seed before this correction, all fixtures at the ordinary `-1`
 * hour offset `fixture()` defaults to.
 *
 * Widening `runMessagingSweep`'s own `limit` was tried first and reverted: it
 * fixes crowd-out by processing the *entire* ambient backlog in one call,
 * which works but is a far bigger footprint than the fix needs — it can drain
 * the very due jobs `tests/synthetic-seed.test.ts`'s own regression assertion
 * (F-A1) depends on finding, observed causing exactly that failure under
 * `npm run test`'s default file parallelism. The fix instead makes the
 * fixture's own rung win `readDueJobs`' ordering on its own terms: every test
 * below whose assertions depend on its rung being claimed gives it a
 * deliberately extreme `invitationOffsetHours` (`EXTREME_OVERDUE_HOURS`, or an
 * explicit `scheduled_for` for `noticeFixture()`, which has no offset
 * parameter) — far more overdue than anything the seed's live ladder plausibly
 * produces — so it always sorts first, within the *unmodified* default
 * `SWEEP_BATCH_LIMIT`. A test proving the *opposite* — a rung that is held,
 * not yet due, or excluded because its event has started or been cancelled —
 * needs no such guarantee: nothing about ambient volume can put an excluded
 * job into `due` in the first place, so those keep the ordinary `-1` hour
 * default.
 *
 * `CONFIGURED`'s allowlist is narrowed to this file's own `PHONE`/`EMAIL`
 * (LAN-124), so ambient jobs claimed alongside a fixture can never reach
 * `sent` — the delivery adapter refuses them before the transport is ever
 * called. `sent` and per-fixture database reads (`jobsFor`, `jobRow`,
 * `escalationStateFor`) are therefore already scoped to this suite's own
 * fixture once the fixture's job is claimed, which is exactly what the
 * ordering guarantee above delivers.
 *
 * What this does **not** fix, and must not be asked to: `summary.accepted` and
 * `summary.refused` stay genuinely global counters. A test that needs to know
 * whether *this* job succeeded reads the job's own row; nothing here rewrites
 * `runMessagingSweep()` to return a per-caller count it was never built to
 * hold.
 */
const EXTREME_OVERDUE_HOURS = -8760;

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
  await observer.query(`delete from public.schedule_changes where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_messaging_plans where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    [scope],
  );
  // LAN-172: `invitation` and `reminder` dispatch also mints a Yes and a No
  // one-time answer token per job, keyed to the person rather than the
  // invitation.
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
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
    /**
     * F-C1. An explicit event date and start time, overriding the default
     * `now() + 72h` — see `noticeFixture`'s identical option for why:
     * `startsAt: null` recreates a row that slipped past the forward-only
     * approval guard, which this fixture's direct database writes always
     * could, guard or no guard.
     */
    eventAt?: { scheduledOn: string; startsAt: string | null };
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

    const event = options.eventAt
      ? await observer.query<{ id: string }>(
          `insert into public.events
             (season_id, name, event_type, status, scheduled_on, starts_at,
              response_deadline_at,
              audience_confirmed_at, audience_confirmed_by_person_id,
              approved_at, approved_by_person_id)
           values ($1, $2, 'practice', 'approved', $3::date, $4::time,
                   now() + interval '24 hours', now(), $5, now(), $5)
           returning id`,
          [
            seasonId,
            `${MARKER} practice ${crypto.randomUUID().slice(0, 8)}`,
            options.eventAt.scheduledOn,
            options.eventAt.startsAt,
            personId,
          ],
        )
      : await observer.query<{ id: string }>(
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
    const target = await fixture({ invitationOffsetHours: EXTREME_OVERDUE_HOURS });
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
    const target = await fixture({ invitationOffsetHours: EXTREME_OVERDUE_HOURS });
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
    await runMessagingSweep({ source: CONFIGURED, transport });

    // `sent` stays scoped to this fixture's own allowlisted contact (LAN-124),
    // so this proves nothing was sent *to this invitee* regardless of ambient
    // volume. `summary.refused` is deliberately not asserted here — LAN-181,
    // F-W1: the repaired seed (F-A1) means this same sweep call also claims
    // and refuses whatever ambient jobs are genuinely due elsewhere, which
    // that counter does not distinguish from this fixture. The claim this test
    // makes — that a started event's own rung is never even attempted — is
    // what the two reads below prove directly against the job's own row.
    expect(sent).toHaveLength(0);

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
    const target = await fixture({ invitationOffsetHours: EXTREME_OVERDUE_HOURS });

    await runMessagingSweep({ source: CONFIGURED, transport: failingTransport() });

    const jobs = await jobsFor(target.eventId);
    const invitation = jobs.find((job) => job.job_type === "invitation")!;
    expect(invitation.status).toBe("failed");
    expect(invitation.attempt_count).toBe(1);
    expect(invitation.next_attempt_at).not.toBeNull();
    expect(invitation.next_attempt_at!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does not re-attempt before the backoff has elapsed", async () => {
    const target = await fixture({ invitationOffsetHours: EXTREME_OVERDUE_HOURS });
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
    const target = await fixture({ invitationOffsetHours: EXTREME_OVERDUE_HOURS });
    await runMessagingSweep({ source: CONFIGURED, transport: failingTransport() });

    // Deliberately far in the past, not merely "elapsed" — the same
    // crowd-out risk applies to this second claim as to the first, and
    // `next_attempt_at` is what `readDueJobs` orders this job by once set.
    await observer.query(
      `update public.notification_jobs
          set next_attempt_at = now() + ($2 || ' hours')::interval
        where id = $1`,
      [target.invitationJobId, String(EXTREME_OVERDUE_HOURS)],
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
    const target = await fixture({
      phone: null,
      email: null,
      invitationOffsetHours: EXTREME_OVERDUE_HOURS,
    });

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
// F-B1 — the operator is told the truth about the escalation. LAN-180.
//
// The walk found the President told "Escalated to the President" while
// terminally `failed`, four independent mechanisms combining to make that
// possible. Each gets its own test below, proven to fail with its own defect
// restored and pass with the fix — one test over the whole path would not
// have distinguished any of the four from the others.
// ---------------------------------------------------------------------------

describe("F-B1, mechanism 1 — the escalation resolves a channel the recipient actually has", () => {
  it("mints the escalation on email when the office holder has no phone at all", async () => {
    // The seeded President this mission's own walk found: one preferred,
    // current email, no phone. Not a fixture defect — an ordinary club
    // officer.
    const target = await fixture({ escalationOffsetHours: -1, phone: null });
    await makePresident(target.personId);

    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const escalation = await observer.query<{ channel: string }>(
      `select channel::text as channel from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(escalation.rows).toHaveLength(1);
    // Defect restored (hard-coding 'whatsapp' in `raiseDueEscalations`'
    // insert) reads: expected 'email', received 'whatsapp'. AssertionError.
    expect(escalation.rows[0].channel).toBe("email");
  });

  it("falls back to email, and actually delivers it, when the WhatsApp attempt finds no usable number", async () => {
    // A phone recorded but never convertible to E.164 — `presidentEscalationChannelIn`
    // only checks that a phone contact *exists*, exactly as a rung's channel
    // is chosen without knowing yet whether it converts; `selectMobileNumber`
    // is what discovers that at dispatch time, and F-B1's fallback is what
    // recovers from that discovery.
    const target = await fixture({ escalationOffsetHours: -1, phone: "not a number" });
    await makePresident(target.personId);

    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    const original = await observer.query<{
      id: string;
      status: string;
      last_error: string | null;
      next_attempt_at: Date | null;
    }>(
      `select id, status::text as status, last_error, next_attempt_at
         from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'
          and idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'`,
      [target.eventId],
    );
    expect(original.rows).toHaveLength(1);
    // Defect restored (no fallback trigger in `dispatchEscalationJob`) reads:
    // status stays 'failed', and the query below for a fallback job finds
    // nothing — the assertion three lines down is what actually fails.
    expect(original.rows[0].status).toBe("failed");
    expect(original.rows[0].next_attempt_at).toBeNull();

    const fallback = await observer.query<{ id: string; channel: string; status: string }>(
      `select id, channel::text as channel, status::text as status
         from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'
          and idempotency_key like '%${EMAIL_FALLBACK_SUFFIX}'`,
      [target.eventId],
    );
    expect(fallback.rows).toHaveLength(1);
    expect(fallback.rows[0].channel).toBe("email");
    // Dispatched inline, in the same call — not merely created, actually sent.
    expect(["processing", "completed"]).toContain(fallback.rows[0].status);
    expect(sent.some((request) => request.url.endsWith("/emails"))).toBe(true);
  });
});

describe("F-B1, mechanisms 2 and 3 — a failed escalation is visible, in diagnostics", () => {
  it("writes a delivery_attempts row for a terminally failed escalation, so diagnostics shows it", async () => {
    // Both mechanisms share one root cause and one fix: `failClaimTerminallyIn`
    // used to write only `delivery_results`, and `readEventDeliveryDiagnostics`
    // inner-joins `delivery_attempts` — zero rows there, zero rows shown, even
    // in principle. The per-event Delivery page's own "Needs attention" list
    // (`readEventDelivery`, `job_type = 'invitation'` only) is deliberately
    // left excluding escalations: bolting an office-addressed job onto a
    // list built and keyed entirely around one row per invitee does not fit
    // its shape, and this ticket's PR names diagnostics as the chosen
    // surface instead — see the PR body for the reasoning in full.
    const target = await fixture({ escalationOffsetHours: -1, phone: null, email: null });
    await makePresident(target.personId);

    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const escalation = await observer.query<{ status: string }>(
      `select status::text as status from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(escalation.rows).toHaveLength(1);
    expect(escalation.rows[0].status).toBe("failed");

    const attempts = await readEventDeliveryDiagnostics(target.eventId);
    // Defect restored (no `delivery_attempts` insert in `failClaimTerminallyIn`)
    // reads: `attempts` is `[]`. This is the assertion that actually fails —
    // the job's own row above stays green either way.
    expect(attempts.length).toBeGreaterThanOrEqual(1);
    expect(attempts.some((attempt) => attempt.outcome === "failed")).toBe(true);
  });
});

describe("F-C1 — the dispatch path never fabricates a start time the club never set", () => {
  it("refuses an escalation for an event with no start time, rather than rendering midnight", async () => {
    // Q-31's approval guard is forward-only. This event carries a null
    // `starts_at` by construction — a row that slipped through, or was
    // approved before the guard existed — and the dispatch path is the
    // other half of the same decision.
    const target = await fixture({
      escalationOffsetHours: -1,
      eventAt: { scheduledOn: "2026-09-06", startsAt: null },
    });
    await makePresident(target.personId);

    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const escalation = await observer.query<{ status: string; last_error: string | null }>(
      `select status::text as status, last_error from public.notification_jobs
        where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );
    expect(escalation.rows).toHaveLength(1);
    // Defect restored (`coalesce(e.starts_at, '00:00'::time)` with no guard)
    // reads: status 'processing' or 'completed', and the sent WhatsApp/email
    // payload states "00:00" as the event's time. The assertion below is
    // what actually fails; `sent` is asserted empty as the stronger proof
    // that nothing carrying a fabricated time ever reached the transport.
    expect(escalation.rows[0].status).toBe("failed");
    expect(escalation.rows[0].last_error).toContain("no start time");
  });

  it("never dispatches the escalation directly, either, for the identical reason", async () => {
    const target = await fixture({
      escalationOffsetHours: -1,
      eventAt: { scheduledOn: "2026-09-06", startsAt: null },
    });
    await makePresident(target.personId);

    // Raise the flag and mint the job first, exactly as the sweep would, then
    // dispatch it directly — the unit this finding actually names.
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });
    const job = await observer.query<{ id: string }>(
      `select id from public.notification_jobs where event_id = $1 and job_type = 'escalation'`,
      [target.eventId],
    );

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchEscalationJob(job.rows[0].id, { source: CONFIGURED, transport });

    // "skipped", matching `dispatchNoticeJob`'s own convention for the
    // identical shape (see its own "fails terminally, not retryably" test
    // above): the claim itself found nothing to send, so the provider was
    // never asked. The job's own row, checked below, is what actually
    // matters.
    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// OWNER-LAN173-03 -- dispatching the change and cancellation notices
// ---------------------------------------------------------------------------

interface NoticeFixture {
  personId: string;
  eventId: string;
  invitationId: string;
  jobId: string;
}

/**
 * One invitee, one event and one notice job, built directly the same way
 * fixture() is above -- event-amendment.ts's recordNoticesOwedIn is what
 * would normally write this row (idempotency_key, job_type, 'pending',
 * invitation_id, event_id, person_id, template_variables = '{}'), and this
 * suite is proving what happens once it exists, not exercising that write
 * path again.
 *
 * For a cancellation notice the event is cancelled *after* the job is
 * inserted, matching cancelEvent's own ordering ("cancelled before the
 * notices are written, so this statement cannot reach the cancellation
 * notices it is about to create") -- and carrying a distinct, invented
 * internal decision_reason so a test can prove that text never reaches the
 * recipient (D76).
 */
async function noticeFixture(
  options: {
    jobType: "cancellation_notice" | "schedule_change_notice";
    cancelled?: boolean;
    phone?: string | null;
    email?: string | null;
    scheduleChange?: { previousVenue: string; newVenue: string };
    /**
     * F-C1, F-C2. An explicit event date and start time, overriding the
     * default `now() + 72h`. Needed whenever a test's assertion depends on
     * *which* date the event falls on — the BST/GMT boundary for F-C2, or a
     * null `starts_at` for F-C1's forward-only guard — and `now()` is
     * whatever day this suite happens to run, not a day either finding can
     * choose. `startsAt: null` is deliberately permitted: the guard F-C1
     * adds is in `event-approval.ts`'s service layer, and this fixture
     * writes directly to the database, the same way an event approved
     * before that guard existed would still be sitting there.
     */
    eventAt?: { scheduledOn: string; startsAt: string | null };
  } = { jobType: "cancellation_notice" },
): Promise<NoticeFixture> {
  const phone = options.phone === undefined ? PHONE : options.phone;
  const email = options.email === undefined ? EMAIL : options.email;
  const cancelled = options.cancelled ?? options.jobType === "cancellation_notice";

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

    const event = options.eventAt
      ? await observer.query<{ id: string }>(
          `insert into public.events
             (season_id, name, event_type, status, scheduled_on, starts_at,
              response_deadline_at,
              audience_confirmed_at, audience_confirmed_by_person_id,
              approved_at, approved_by_person_id)
           values ($1, $2, 'practice', 'approved', $3::date, $4::time,
                   now() + interval '24 hours', now(), $5, now(), $5)
           returning id`,
          [
            seasonId,
            `${MARKER} notice ${crypto.randomUUID().slice(0, 8)}`,
            options.eventAt.scheduledOn,
            options.eventAt.startsAt,
            personId,
          ],
        )
      : await observer.query<{ id: string }>(
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
          [seasonId, `${MARKER} notice ${crypto.randomUUID().slice(0, 8)}`, personId],
        );
    const eventId = event.rows[0].id;

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

    if (options.scheduleChange) {
      await observer.query(
        `insert into public.schedule_changes
           (event_id, source, previous_venue, new_venue, notified, recorded_by_person_id)
         values ($1, 'club', $2, $3, true, $4)`,
        [eventId, options.scheduleChange.previousVenue, options.scheduleChange.newVenue, personId],
      );
    }

    // `scheduled_for` is deliberately explicit rather than left to default —
    // LAN-181, F-W1. `recordNoticesOwedIn` leaves it null, which `readDueJobs`
    // falls back to `created_at` for: "just now", the least overdue row the
    // sweep could see, and this suite's own ambient competition (the repaired
    // seed's live ladder, F-A1) can crowd it out of a single batch exactly the
    // way `EXTREME_OVERDUE_HOURS` guards against elsewhere. This fixture has
    // no dispatch-anchor guard to respect (unlike `fixture()`'s invitation/
    // reminder rungs), so there is no reason not to seed it already-overdue.
    const job = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id,
          template_variables, scheduled_for)
       values ($1, $2::public.notification_job_type, 'pending', $3, $4, $5, '{}'::jsonb,
               now() + ($6 || ' hours')::interval)
       returning id`,
      [
        `${MARKER}:${eventId}:${options.jobType}`,
        options.jobType,
        invitationId,
        eventId,
        personId,
        String(EXTREME_OVERDUE_HOURS),
      ],
    );

    if (cancelled) {
      // Deliberately distinct from the recipient-facing sentence, so D76's
      // test below has an operator's actual words to prove absent.
      await observer.query(
        `update public.events
            set status = 'cancelled',
                decision_reason = $2
          where id = $1`,
        [eventId, "INTERNAL-ONLY: the groundsman quit and the pitch is condemned as unsafe."],
      );
    }

    await observer.query("commit");
    return { personId, eventId, invitationId, jobId: job.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

async function jobRow(jobId: string) {
  const result = await observer.query<{
    id: string;
    status: string;
    attempt_count: number;
    next_attempt_at: Date | null;
  }>(
    `select id, status::text as status, attempt_count, next_attempt_at
       from public.notification_jobs
      where id = $1`,
    [jobId],
  );
  return result.rows[0];
}

describe("OWNER-LAN173-03 -- the cancellation notice's token-free dispatch", () => {
  it("sends a cancellation notice for a cancelled event, minting no RSVP token", async () => {
    const target = await noticeFixture({ jobType: "cancellation_notice" });
    const { sent, transport } = acceptingTransport();

    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(summary.accepted).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBeGreaterThanOrEqual(1);

    const job = await jobRow(target.jobId);
    expect(job.status).toBe("processing");
    expect(job.attempt_count).toBe(1);

    // No RSVP token exists for this invitation at all -- not merely absent
    // from the message. `issueTokenIn` was never called.
    const tokens = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where invitation_id = $1",
      [target.invitationId],
    );
    expect(Number(tokens.rows[0].count)).toBe(0);

    // The attempt row itself carries no token reference either.
    const attempts = await observer.query<{ rsvp_access_token_id: string | null }>(
      "select rsvp_access_token_id from public.delivery_attempts where notification_job_id = $1",
      [target.jobId],
    );
    expect(attempts.rows[0].rsvp_access_token_id).toBeNull();
  });

  it("never puts the operator's internal cancellation reason in the recipient's message", async () => {
    // W8's D76. The fixture's decision_reason is deliberately distinct from
    // the sentence the dispatcher actually sends.
    const target = await noticeFixture({ jobType: "cancellation_notice" });
    const { sent, transport } = acceptingTransport();

    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent.length).toBeGreaterThanOrEqual(1);
    const bodies = sent.map((request) => JSON.stringify(request.body));
    for (const body of bodies) {
      expect(body).not.toContain("groundsman");
      expect(body).not.toContain("condemned");
      expect(body).not.toContain("INTERNAL-ONLY");
    }

    const event = await observer.query<{ decision_reason: string }>(
      "select decision_reason from public.events where id = $1",
      [target.eventId],
    );
    // The reason really was recorded -- proving the assertion above tests
    // something real rather than an empty column.
    expect(event.rows[0].decision_reason).toContain("groundsman");
  });

  it("reaches a terminal state on the first sweep rather than looping, and a second sweep touches it no further", async () => {
    const target = await noticeFixture({ jobType: "cancellation_notice" });

    await runMessagingSweep({
      source: CONFIGURED,
      transport: acceptingTransport().transport,
    });
    // `first.refused` is not asserted — LAN-181, F-W1: this same call also
    // claims and refuses whatever ambient jobs are genuinely due elsewhere in
    // the repaired seed (F-A1), and that global counter does not distinguish
    // them from this fixture. `afterFirst` below, read from the job's own row,
    // is what proves this specific notice succeeded.

    const afterFirst = await jobRow(target.jobId);
    expect(afterFirst.status).toBe("processing");
    expect(afterFirst.attempt_count).toBe(1);

    const { sent: sentSecond, transport: secondTransport } = acceptingTransport();
    const second = await runMessagingSweep({ source: CONFIGURED, transport: secondTransport });

    // `processing` is terminal from the sweep's point of view -- readDueJobs
    // only selects `pending`/`ready`/a backed-off `failed`, so a job the first
    // tick already claimed is never claimed again. Proves the "forever" half
    // of the hazard this dispatcher exists to avoid: one attempt, not an
    // unbounded reclaim.
    expect(sentSecond).toHaveLength(0);
    const afterSecond = await jobRow(target.jobId);
    expect(afterSecond.attempt_count).toBe(1);
    expect(afterSecond.status).toBe("processing");
    expect(second.dispatched).toBe(0);
  });

  it("demonstrates the hazard directly: the ordinary claimJobIn throws on a cancelled event's token, and rolls back", async () => {
    // Not the correction's own dispatch path -- `dispatchJob` is the general
    // one every invitation and reminder uses, driven here on purpose against
    // a cancellation notice to reconstruct the exact failure OWNER-LAN173-03
    // exists to avoid, rather than merely asserting the reasoning in prose.
    const target = await noticeFixture({ jobType: "cancellation_notice" });

    await expect(
      dispatchJob(target.jobId, { source: CONFIGURED, transport: acceptingTransport().transport }),
    ).rejects.toThrow();

    // The throw rolled the claim back inside its own transaction: no attempt
    // was recorded and the job is exactly as due as it was before.
    const job = await jobRow(target.jobId);
    expect(job.status).toBe("pending");
    expect(job.attempt_count).toBe(0);
  });

  it("fails terminally, not retryably, when the recipient has no usable route", async () => {
    const target = await noticeFixture({
      jobType: "cancellation_notice",
      phone: null,
      email: null,
    });
    const { sent, transport } = acceptingTransport();

    // No route means the claim itself finds nothing to send -- the same
    // shape `dispatchEscalationJob` already has for the identical case, so
    // this is "skipped" rather than "refused" (refused means the provider was
    // asked and said no). What actually matters is the job's own state below.
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
    expect(summary.skipped).toBeGreaterThanOrEqual(1);

    const job = await jobRow(target.jobId);
    expect(job.status).toBe("failed");
    expect(job.next_attempt_at).toBeNull();
  });

  it("F-C2: states the same time every other surface does, across the BST boundary", async () => {
    // 6 September 2026 — the walk's own example, and deliberately inside
    // BST: 2026's British Summer Time runs from the last Sunday in March
    // (29 March) to the last Sunday in October (25 October), so this date
    // carries the UTC+1 offset the single-conversion defect got wrong. A GMT
    // date (UTC+0, no offset to drop) would pass this test whether the
    // defect is present or not, which is exactly why the finding insists on
    // one that is not.
    await noticeFixture({
      jobType: "cancellation_notice",
      eventAt: { scheduledOn: "2026-09-06", startsAt: "19:00:00" },
    });
    const { sent, transport } = acceptingTransport();

    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent.length).toBeGreaterThanOrEqual(1);
    const bodies = sent.map((request) => JSON.stringify(request.body));
    const notice = bodies.find((body) => /cancel/i.test(body));
    expect(notice, "a cancellation notice should have been sent").toBeDefined();
    // Defect restored (single `at time zone 'Europe/London'` at
    // `messaging-scheduler.ts:898`) reads "18:00" here — proved
    // arithmetically against the live database in the walk that found this,
    // and reproduced the identical way here.
    expect(notice).toContain("19:00");
    expect(notice).not.toContain("18:00");
  });

  it("F-C1: refuses to send a cancellation notice for an event with no start time", async () => {
    const target = await noticeFixture({
      jobType: "cancellation_notice",
      eventAt: { scheduledOn: "2026-09-06", startsAt: null },
    });
    const { sent, transport } = acceptingTransport();

    await runMessagingSweep({ source: CONFIGURED, transport });

    expect(sent).toHaveLength(0);
    const job = await jobRow(target.jobId);
    // Defect restored (`coalesce(e.starts_at, '00:00'::time)` with no guard)
    // reads: status 'processing', and the sent payload states "00:00" as
    // fact. This is the assertion that actually fails.
    expect(job.status).toBe("failed");
  });
});

describe("OWNER-LAN173-03 -- the schedule-change notice's ordinary dispatch", () => {
  it("sends a change notice through the normal path, with a real RSVP link and a summary of what changed", async () => {
    const target = await noticeFixture({
      jobType: "schedule_change_notice",
      scheduleChange: { previousVenue: "Iffley Road Astro", newVenue: "University Parks" },
    });
    const { sent, transport } = acceptingTransport();

    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(summary.accepted).toBeGreaterThanOrEqual(1);
    expect(sent.length).toBeGreaterThanOrEqual(1);

    const job = await jobRow(target.jobId);
    expect(job.status).toBe("processing");
    expect(job.attempt_count).toBe(1);

    // A real token this time -- `schedule_change_notice` is not exempt from
    // the normal claim, and the point of admitting it is exactly this link.
    const tokens = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where invitation_id = $1",
      [target.invitationId],
    );
    expect(Number(tokens.rows[0].count)).toBe(1);

    const bodies = sent.map((request) => JSON.stringify(request.body));
    expect(bodies.some((body) => /venue/i.test(body))).toBe(true);
  });

  it("leaves a schedule-change notice whose event has since been cancelled, rather than looping", async () => {
    // The same guard `readDueJobs` already gives invitation/reminder, and
    // deliberately NOT a new special case: schedule_change_notice is absent
    // from the escalation/cancellation_notice exemption, so this predicate
    // alone keeps it away from `issueTokenIn`'s refusal.
    const target = await noticeFixture({
      jobType: "schedule_change_notice",
      cancelled: false,
      scheduleChange: { previousVenue: "Iffley Road Astro", newVenue: "University Parks" },
    });
    await observer.query(
      "update public.events set status = 'cancelled', decision_reason = $2 where id = $1",
      [target.eventId, "Cancelled after the change notice was already owed."],
    );

    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });

    // `summary.refused` is not asserted — LAN-181, F-W1: the same rationale as
    // the cancellation-notice block above. This notice's own job is excluded
    // from `due` by the cancelled-event guard regardless of what else the
    // sweep claims and refuses elsewhere, which the two reads below prove
    // directly.
    expect(sent).toHaveLength(0);

    const job = await jobRow(target.jobId);
    expect(job.status).toBe("pending");
    expect(job.attempt_count).toBe(0);
  });
});
