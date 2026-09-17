// @vitest-environment node
/**
 * Messaging safety — LAN-394.
 *
 * Against the real local database, with an injected transport, because every
 * one of these properties is a property of the database: the guard's mutual
 * exclusion is a row lock, its accounting is a count over `delivery_attempts`,
 * and its latches are durable rows. None of that can be demonstrated against a
 * mock, and the two claims most worth proving — that two concurrent claimers
 * cannot overspend one allowance, and that a stop survives a restart — are
 * meaningless without one.
 *
 * Every fixture hangs off a person whose `given_name` is this file's own
 * marker, deleted in `afterEach` along with the safety state it produced.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));

import crypto from "node:crypto";
import type { Client } from "pg";

import { requireCapability } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { closePool, isServiceError, withTransaction } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { dispatchJob, retryDelivery, MAX_ATTEMPTS } from "./delivery";
import { runMessagingSweep } from "./messaging-scheduler";
import {
  admitSendIn,
  clearExpiredSafetyFieldsIn,
  destinationKey,
  GLOBAL_EMERGENCY_LIMIT,
  GLOBAL_SCOPE_KEY,
  pauseMessagingIn,
  readScopeIn,
  recordProviderOutcomeIn,
  RECIPIENT_DAILY_LIMIT,
  resumeMessagingIn,
  SAFETY_FIELD_RETENTION_DAYS,
  SAFETY_HEARTBEAT_EVENT,
  SAFETY_LOG_EVENT,
  setSafetyMonitor,
  SHARED_PACING_LIMIT,
  type SafetyMonitor,
} from "./messaging-safety";
import { anonymisePersonIn } from "./person-erasure/anonymise";
import {
  agePastSafetyPacing,
  clearRecipientSafetyState,
  openObserver,
  seededIdentityCreatedAt,
} from "../../../tests/helpers/service-layer";

const MARKER = "LAN394SafetySuite";
const PROVIDER_MESSAGE_PREFIX = `wamid.LAN394.${crypto.randomUUID().slice(0, 8)}.`;

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
};

const capability = vi.mocked(requireCapability);

function operator(personId: string, roleCodes: string[]): ResolvedOperator {
  return {
    authUserId: "44444444-4444-4444-8444-444444444444",
    personId,
    displayName: "Safety Suite Operator",
    roleCodes,
    isActive: true,
  };
}

let observer: Client;
let seasonId: string;
let anchorPersonId: string;
let eventId: string;

/** Ofcom's reserved drama range: never dialled, and unique per fixture. */
let phoneSerial = 0;
function uniquePhone(): string {
  phoneSerial += 1;
  // Ofcom's reserved drama range is 07700 900000–900999: never dialled, and
  // wide enough for every fixture this file makes.
  return `07700 900${String(phoneSerial).padStart(3, "0")}`;
}

/**
 * A provider that accepts, with a distinct identifier every time.
 *
 * Distinct globally, not per instance: `delivery_attempts_provider_message_unique`
 * is what lets a callback name exactly one attempt, and a burst test that makes
 * sixty transports would otherwise have sixty of them return "…1".
 */
let acceptedSerial = 0;
function accepts() {
  return vi.fn(async () => {
    acceptedSerial += 1;
    return new Response(
      JSON.stringify({ messages: [{ id: `${PROVIDER_MESSAGE_PREFIX}${acceptedSerial}` }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
}

/** A provider-scoped fault: an account-level rate limit, which is the provider's own. */
function refusesProviderWide() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { code: 130429, message: "rate limit" } }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
  );
}

/** A recipient-scoped fault: this number is not on WhatsApp. Never the provider's. */
function refusesRecipient() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { code: 131026, message: "no account" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
  );
}

beforeAll(async () => {
  observer = await openObserver();

  // Anything this file left behind on an earlier run. A suite that failed
  // part-way through leaves its season, and a season with a fixed label cannot
  // be inserted twice — which turns one bad run into every later run failing in
  // `beforeAll`, where the reason is hardest to see.
  await purgeSuiteFixtures();

  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  anchorPersonId = anchor.rows[0].id;

  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2018-09-01', '2019-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchorPersonId],
  );
  seasonId = season.rows[0].id;

  const event = await observer.query<{ id: string }>(
    `with target as (select (now() + interval '48 hours') at time zone 'Europe/London' as local)
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at,
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at,
        approved_by_person_id, template_id)
     select $1, $2, 'practice', 'approved',
            (select local::date from target), (select local::time from target),
            now(), $3, now(), $3,
            (select tpl.id from public.event_templates tpl
              where tpl.event_type = 'practice' order by lower(tpl.name) limit 1)
     returning id`,
    [seasonId, `${MARKER} practice`, anchorPersonId],
  );
  eventId = event.rows[0].id;

  capability.mockResolvedValue(operator(anchorPersonId, ["president"]));
});

/**
 * Everything this file creates, removed in dependency order.
 *
 * People are collected by season membership as well as by name, because an
 * erased person no longer carries the marker: `anonymisePersonIn` renames them,
 * by design, and a purge that looked only for the name would leave them and
 * their season behind for ever.
 */
async function purgeSuiteFixtures(): Promise<void> {
  const seasons = "(select id from public.seasons where label like 'LAN394SafetySuite%')";
  const events = "(select id from public.events where name like 'LAN394SafetySuite%')";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;

  const owned = await observer.query<{ id: string }>(
    `select id from public.people where given_name = 'LAN394SafetySuite'
      union
     select person_id as id from public.season_memberships where season_id in ${seasons}`,
  );
  const people = owned.rows.map((row) => row.id);

  for (const statement of [
    `delete from public.delivery_results where notification_job_id in ${jobs}`,
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    `delete from public.notification_jobs where event_id in ${events}`,
    `delete from public.rsvp_access_tokens where invitation_id in (select id from public.invitations where event_id in ${events})`,
    `delete from public.person_access_tokens where season_id in ${seasons} or person_id = any($1::uuid[])`,
    `delete from public.invitations where event_id in ${events}`,
    `delete from public.event_audience_members where event_id in ${events}`,
    `delete from public.audit_events where actor_person_id = any($1::uuid[])`,
    `delete from public.audit_events where entity_id = any($1::uuid[])`,
    `delete from public.season_memberships where season_id in ${seasons} or person_id = any($1::uuid[])`,
    `delete from public.contact_points where person_id = any($1::uuid[])`,
    `delete from public.person_aliases where person_id = any($1::uuid[])`,
    `delete from public.people where id = any($1::uuid[])`,
    `delete from public.events where name like 'LAN394SafetySuite%'`,
    `delete from public.invitations where season_id in ${seasons}`,
    `delete from public.event_audience_members where season_id in ${seasons}`,
    `delete from public.seasons where label like 'LAN394SafetySuite%'`,
  ]) {
    // Not every statement names the array, and PostgreSQL refuses a parameter
    // a statement does not use.
    await observer.query(statement, statement.includes("$1") ? [people] : []);
  }
}

afterEach(async () => {
  await clearRecipientSafetyState(observer);
  await observer.query(
    `update public.messaging_safety_scopes
        set paused_at = null, paused_by_person_id = null, paused_reason = null,
            latched_at = null, latch_reason_code = null, incident_alert_at = null,
            capacity_alert_at = null, queue_alert_at = null
      where scope_kind = 'global'`,
  );

  const jobs = "(select id from public.notification_jobs where event_id = $1)";
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    eventId,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [eventId],
  );
  await observer.query("delete from public.notification_jobs where event_id = $1", [eventId]);
  await observer.query(
    "delete from public.rsvp_access_tokens where invitation_id in (select id from public.invitations where event_id = $1)",
    [eventId],
  );
  await observer.query(
    "delete from public.person_access_tokens where person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query("delete from public.invitations where event_id = $1", [eventId]);
  await observer.query("delete from public.event_audience_members where event_id = $1", [eventId]);
  await observer.query(
    "delete from public.audit_events where actor_person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query(
    "delete from public.audit_events where entity_table = 'messaging_safety_scopes'",
  );
  await observer.query(
    "delete from public.season_memberships where person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query(
    "delete from public.contact_points where person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  capability.mockResolvedValue(operator(anchorPersonId, ["president"]));
});

afterAll(async () => {
  await purgeSuiteFixtures();
  await observer.end();
  await closePool();
});

interface Invitee {
  readonly personId: string;
  readonly invitationId: string;
  readonly jobId: string;
  readonly phone: string;
}

/** One more invitee on the suite's event, with a pending invitation job. */
async function invitee(tag: string, phone = uniquePhone()): Promise<Invitee> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, created_at)
     values ($1, $2, now() + interval '100 years') returning id`,
    [MARKER, tag],
  );
  const personId = person.rows[0].id;

  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
     values ($1, 'phone', $2, true)`,
    [personId, phone],
  );

  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
    [personId, seasonId],
  );

  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, invitee_person_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4, $5) returning id`,
    [eventId, seasonId, membership.rows[0].id, personId, anchorPersonId],
  );

  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, season_id, capacity, season_membership_id, status, audience_member_id)
     values ($1, 'approved', $2, 'player', $3, 'pending', $4) returning id`,
    [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
  );

  const job = await observer.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
     values ($1, 'invitation', 'pending', $2, $3, $4, 'whatsapp') returning id`,
    [`${MARKER}:${tag}:${eventId}`, invitation.rows[0].id, eventId, personId],
  );

  return { personId, invitationId: invitation.rows[0].id, jobId: job.rows[0].id, phone };
}

async function jobRow(jobId: string) {
  const result = await observer.query<{
    status: string;
    attempt_count: number;
    last_error: string | null;
    safety_reason_code: string | null;
    safety_retry_at: Date | null;
  }>(
    `select status::text as status, attempt_count, last_error, safety_reason_code, safety_retry_at
       from public.notification_jobs where id = $1`,
    [jobId],
  );
  return result.rows[0];
}

async function attemptCount(jobId: string): Promise<number> {
  const result = await observer.query<{ count: string }>(
    "select count(*)::text as count from public.delivery_attempts where notification_job_id = $1",
    [jobId],
  );
  return Number(result.rows[0].count);
}

/**
 * Writes admitted attempts directly, to stand a rolling window up without
 * making thousands of real sends.
 *
 * They are real rows in the real table the guard counts — not a stub — hung off
 * one job with ascending attempt numbers, which the schema permits
 * (`delivery_attempts_attempt_number_positive` is the only bound).
 */
async function seedAdmissions(
  jobId: string,
  count: number,
  options: { personId?: string | null; destination?: string | null; ageMinutes?: number } = {},
): Promise<void> {
  await observer.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at,
        safety_admitted_at, safety_person_id, safety_destination_key)
     select $1, 1000 + g, 'whatsapp', 'test', now() - ($5 || ' minutes')::interval,
            now() - ($5 || ' minutes')::interval, $2::uuid, $3
       from generate_series(1, $4) as g`,
    [
      jobId,
      options.personId ?? null,
      options.destination ?? null,
      count,
      String(options.ageMinutes ?? 1),
    ],
  );
}

async function globalScope() {
  return withTransaction((tx) => readScopeIn(tx, "global", GLOBAL_SCOPE_KEY));
}

async function pauseGlobally(reason = "Testing"): Promise<void> {
  const scope = await globalScope();
  await withTransaction((tx) =>
    pauseMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, reason),
  );
}

// ---------------------------------------------------------------------------

describe("a paused club sends nothing, and costs the message nothing", () => {
  it("defers instead of sending, and leaves the job exactly as it found it", async () => {
    const target = await invitee("Paused");
    await pauseGlobally("Wrong number list imported");

    const transport = accepts();
    const outcome = await dispatchJob(target.jobId, { source: CONFIGURED, transport });

    expect(outcome).toBe("deferred");
    expect(transport).not.toHaveBeenCalled();

    const job = await jobRow(target.jobId);
    // Not attempted, not failed, and no provider sentence written against it.
    expect(job.status).toBe("pending");
    expect(job.attempt_count).toBe(0);
    expect(job.last_error).toBeNull();
    expect(job.safety_reason_code).toBe("paused_by_operator");
    expect(await attemptCount(target.jobId)).toBe(0);

    // And no token was minted, so nothing the invitee may already hold was
    // superseded by a message that never went.
    const tokens = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where invitation_id = $1",
      [target.invitationId],
    );
    expect(tokens.rows[0].count).toBe("0");
  });

  it("does not invalidate a working link, and does not spend a retry", async () => {
    const target = await invitee("LinkSurvives");
    await dispatchJob(target.jobId, { source: CONFIGURED, transport: accepts() });

    const before = await observer.query<{ id: string }>(
      `select id from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [target.invitationId],
    );
    expect(before.rows).toHaveLength(1);

    await observer.query("update public.notification_jobs set status = 'failed' where id = $1", [
      target.jobId,
    ]);
    await pauseGlobally("Paused after the first attempt");

    const outcome = await retryDelivery(anchorPersonId, target.jobId, {
      source: CONFIGURED,
      transport: accepts(),
    });
    expect(outcome).toBe("deferred");

    const after = await observer.query<{ id: string }>(
      `select id from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [target.invitationId],
    );
    expect(after.rows.map((row) => row.id)).toEqual(before.rows.map((row) => row.id));
    expect((await jobRow(target.jobId)).attempt_count).toBe(1);
  });

  it("lets a claim taken before the pause finish, and refuses every claim after it", async () => {
    // The pause-versus-claim race, run for real on two connections.
    //
    // A second session takes the global safety row and holds it, which is
    // exactly what `pauseMessagingIn` does for the length of its transaction.
    // The dispatch below therefore blocks at the guard rather than racing past
    // it, and when the pause commits it observes the paused row — which is the
    // whole of the linearisation claim: no later claim passes a committed
    // pause.
    const before = await invitee("BeforeThePause");
    const after = await invitee("AfterThePause");

    const accepted = await dispatchJob(before.jobId, {
      source: CONFIGURED,
      transport: accepts(),
    });
    expect(accepted).toBe("accepted");
    await agePastSafetyPacing(observer);

    const scope = await globalScope();
    const blocker = await openObserver();
    await blocker.query("begin");
    await blocker.query("select id from public.messaging_safety_scopes where id = $1 for update", [
      scope!.id,
    ]);

    const transport = accepts();
    const racing = dispatchJob(after.jobId, { source: CONFIGURED, transport });

    // The pause commits while that dispatch is waiting on the row.
    await blocker.query(
      `update public.messaging_safety_scopes
          set paused_at = now(), paused_by_person_id = $2, paused_reason = 'race',
              version = version + 1, updated_at = now()
        where id = $1`,
      [scope!.id, anchorPersonId],
    );
    await blocker.query("commit");
    await blocker.end();

    expect(await racing).toBe("deferred");
    expect(transport).not.toHaveBeenCalled();

    // The message claimed before the pause is untouched by it.
    expect((await jobRow(before.jobId)).attempt_count).toBe(1);
  });
});

describe("the shared allowance cannot be overspent, however many claimers", () => {
  it("admits exactly one of two concurrent claims for the last slot", async () => {
    const holder = await invitee("AllowanceHolder");
    const first = await invitee("RacerOne");
    const second = await invitee("RacerTwo");

    // One slot left in the rolling five minutes.
    await seedAdmissions(holder.jobId, SHARED_PACING_LIMIT - 1);

    const firstTransport = accepts();
    const secondTransport = accepts();
    const [a, b] = await Promise.all([
      dispatchJob(first.jobId, { source: CONFIGURED, transport: firstTransport }),
      dispatchJob(second.jobId, { source: CONFIGURED, transport: secondTransport }),
    ]);

    const outcomes = [a, b].sort();
    expect(outcomes).toEqual(["accepted", "deferred"]);
    expect(firstTransport.mock.calls.length + secondTransport.mock.calls.length).toBe(1);

    const admitted = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts
        where safety_admitted_at > now() - interval '5 minutes'`,
    );
    expect(Number(admitted.rows[0].count)).toBe(SHARED_PACING_LIMIT);
  });
});

describe("the global emergency stop", () => {
  it("trips on a run of ordinary successful sends, and survives a restart", async () => {
    const holder = await invitee("CeilingHolder");
    const last = await invitee("TheLastOne");
    const next = await invitee("TheOneAfter");

    // One admission short of the ceiling, all of them successful sends rather
    // than failures: the stop exists for a loop that is *working*, which is the
    // case no provider error would ever reveal.
    await seedAdmissions(holder.jobId, GLOBAL_EMERGENCY_LIMIT - 1, { ageMinutes: 120 });

    expect(await dispatchJob(last.jobId, { source: CONFIGURED, transport: accepts() })).toBe(
      "accepted",
    );

    const latched = await globalScope();
    expect(latched?.latchedAt).not.toBeNull();
    expect(latched?.latchReasonCode).toBe("global_emergency_stop");

    // A restart: the pool is closed and re-opened, so nothing in memory
    // survives. The latch is a row, so it does.
    await closePool();
    const transport = accepts();
    expect(await dispatchJob(next.jobId, { source: CONFIGURED, transport })).toBe("deferred");
    expect(transport).not.toHaveBeenCalled();
    expect((await jobRow(next.jobId)).safety_reason_code).toBe("global_emergency_stop");

    // And the rolling window ageing out does not clear it either — only an
    // operator resume does.
    await observer.query(
      "update public.delivery_attempts set safety_admitted_at = safety_admitted_at - interval '2 days' where safety_admitted_at is not null",
    );
    expect(await dispatchJob(next.jobId, { source: CONFIGURED, transport: accepts() })).toBe(
      "deferred",
    );
  }, 60_000);
});

describe("a recipient hold contains one recipient", () => {
  it("holds the person who reached the ceiling and nobody else", async () => {
    const held = await invitee("HeldPerson");
    const other = await invitee("UnaffectedPerson");

    await seedAdmissions(held.jobId, RECIPIENT_DAILY_LIMIT, {
      personId: held.personId,
      destination: destinationKey("whatsapp", "447700900999"),
      ageMinutes: 120,
    });

    const heldTransport = accepts();
    expect(await dispatchJob(held.jobId, { source: CONFIGURED, transport: heldTransport })).toBe(
      "deferred",
    );
    expect(heldTransport).not.toHaveBeenCalled();
    expect((await jobRow(held.jobId)).safety_reason_code).toBe("person_hold");

    const scope = await withTransaction((tx) => readScopeIn(tx, "person", held.personId));
    expect(scope?.latchedAt).not.toBeNull();

    // The other person is not affected at all.
    expect(await dispatchJob(other.jobId, { source: CONFIGURED, transport: accepts() })).toBe(
      "accepted",
    );

    // Resume clears that one scope and nothing else, and does not refund the
    // usage — so the held person is eligible again only once their own window
    // has moved on.
    await withTransaction((tx) =>
      resumeMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, "Reviewed"),
    );
    const resumed = await withTransaction((tx) => readScopeIn(tx, "person", held.personId));
    expect(resumed?.latchedAt).toBeNull();

    const stillCounted = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.delivery_attempts where safety_person_id = $1",
      [held.personId],
    );
    expect(Number(stillCounted.rows[0].count)).toBe(RECIPIENT_DAILY_LIMIT);
  });
});

describe("the provider circuit", () => {
  it("cools down after a run of provider-side faults, and a bad recipient never counts", async () => {
    const recipientFaults = await invitee("RecipientFault");

    // Five recipient-scoped refusals: this number is not on WhatsApp. The
    // provider is perfectly well, and the circuit must not move.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await agePastSafetyPacing(observer);
      await dispatchJob(recipientFaults.jobId, {
        source: CONFIGURED,
        transport: refusesRecipient(),
      });
    }
    const healthy = await withTransaction((tx) => readScopeIn(tx, "provider", "whatsapp"));
    expect(healthy?.consecutiveFaults).toBe(0);
    expect(healthy?.cooldownUntil).toBeNull();

    // Five account-level rate limits inside five minutes is the provider.
    const providerFaults = await invitee("ProviderFault");
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await agePastSafetyPacing(observer);
      await dispatchJob(providerFaults.jobId, {
        source: CONFIGURED,
        transport: refusesProviderWide(),
      });
    }

    const cooled = await withTransaction((tx) => readScopeIn(tx, "provider", "whatsapp"));
    expect(cooled?.consecutiveFaults).toBeGreaterThanOrEqual(5);
    expect(cooled?.cooldownUntil).not.toBeNull();

    // Email is a separate scope and is untouched.
    const email = await withTransaction((tx) => readScopeIn(tx, "provider", "email"));
    expect(email?.cooldownUntil).toBeNull();

    // Nothing further is sent on WhatsApp while it cools down, and no retry is
    // spent trying.
    const blocked = await invitee("BlockedByCooldown");
    await agePastSafetyPacing(observer);
    const transport = accepts();
    expect(await dispatchJob(blocked.jobId, { source: CONFIGURED, transport })).toBe("deferred");
    expect(transport).not.toHaveBeenCalled();
    expect((await jobRow(blocked.jobId)).attempt_count).toBe(0);
    expect((await jobRow(blocked.jobId)).safety_reason_code).toBe("provider_cooldown");
  }, 60_000);

  it("admits exactly one probe when the cooldown elapses, and arms the next one first", async () => {
    const probe = await invitee("Probe");
    const second = await invitee("SecondProbe");

    await observer.query(
      `update public.messaging_safety_scopes
          set consecutive_faults = 5, first_fault_at = now() - interval '1 minute',
              cooldown_stage = 1, cooldown_until = now() - interval '1 second'
        where scope_kind = 'provider' and scope_key = 'whatsapp'`,
    );

    const firstTransport = accepts();
    expect(await dispatchJob(probe.jobId, { source: CONFIGURED, transport: firstTransport })).toBe(
      "accepted",
    );
    expect(firstTransport).toHaveBeenCalledTimes(1);

    // An accepted probe closes the circuit. Had it failed, the longer cooldown
    // armed before the call would already be in place, which is why a second
    // send cannot slip through in between.
    const closed = await withTransaction((tx) => readScopeIn(tx, "provider", "whatsapp"));
    expect(closed?.cooldownUntil).toBeNull();
    expect(closed?.cooldownStage).toBe(0);

    // A stale outcome from an older probe generation cannot reopen or close a
    // newer incident.
    await observer.query(
      `update public.messaging_safety_scopes
          set consecutive_faults = 5, cooldown_stage = 2, cooldown_until = now() + interval '10 minutes',
              probe_generation = probe_generation + 5
        where scope_kind = 'provider' and scope_key = 'whatsapp'`,
    );
    await withTransaction((tx) =>
      recordProviderOutcomeIn(tx, "whatsapp", { status: "accepted", providerMessageId: "old" }, 0),
    );
    const untouched = await withTransaction((tx) => readScopeIn(tx, "provider", "whatsapp"));
    expect(untouched?.cooldownUntil).not.toBeNull();

    await agePastSafetyPacing(observer);
    expect(await dispatchJob(second.jobId, { source: CONFIGURED, transport: accepts() })).toBe(
      "deferred",
    );
  });
});

describe("a burst of arrivals is saved, waits, and drains", () => {
  it("keeps every business row and paces the sending across ticks", async () => {
    const burst: Invitee[] = [];
    for (let index = 0; index < SHARED_PACING_LIMIT + 5; index += 1) {
      burst.push(await invitee(`Burst${index}`));
    }

    // Every sign-up is saved, whatever the guard decides about messaging.
    const saved = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.invitations where event_id = $1",
      [eventId],
    );
    expect(Number(saved.rows[0].count)).toBe(burst.length);

    let sent = 0;
    for (const target of burst) {
      const transport = accepts();
      const outcome = await dispatchJob(target.jobId, { source: CONFIGURED, transport });
      if (outcome === "accepted") sent += 1;
      else expect(outcome).toBe("deferred");
    }
    // The allowance, exactly — no more, and the rest are waiting rather than
    // failed.
    expect(sent).toBe(SHARED_PACING_LIMIT);

    const waiting = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.notification_jobs
        where event_id = $1 and status = 'pending' and safety_reason_code = 'shared_pacing'`,
      [eventId],
    );
    expect(Number(waiting.rows[0].count)).toBe(5);

    // And nothing is a failure.
    const failures = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where event_id = $1 and status = 'failed'",
      [eventId],
    );
    expect(failures.rows[0].count).toBe("0");

    // The window moves on and the rest drain.
    await agePastSafetyPacing(observer);
    for (const target of burst) {
      if ((await jobRow(target.jobId)).status !== "pending") continue;
      await dispatchJob(target.jobId, { source: CONFIGURED, transport: accepts() });
      await agePastSafetyPacing(observer);
    }
    const stillWaiting = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where event_id = $1 and status = 'pending'",
      [eventId],
    );
    expect(stillWaiting.rows[0].count).toBe("0");
  }, 120_000);

  it("reaches an unrelated job past a blocked one in the same sweep", async () => {
    // RT-04's concrete case, at a size a test can run: several due jobs for one
    // held recipient, then an independent one. The bounded keyset scan must get
    // past the block within the same tick rather than filling the batch with it.
    const shared = uniquePhone();
    const blocked: Invitee[] = [];
    for (let index = 0; index < 5; index += 1) {
      blocked.push(await invitee(`Blocked${index}`, shared));
    }
    const independent = await invitee("Independent");

    await observer.query(
      `update public.notification_jobs
          set scheduled_for = now() - interval '100 years'
        where id = any($1::uuid[])`,
      [blocked.map((each) => each.jobId)],
    );
    await observer.query(
      "update public.notification_jobs set scheduled_for = now() - interval '99 years' where id = $1",
      [independent.jobId],
    );

    await runMessagingSweep({
      source: CONFIGURED,
      transport: accepts(),
      limit: 10,
      scanLimit: 200,
    });

    // One of the five shared-destination jobs went; the independent one went
    // too, in the same tick, rather than waiting behind the other four.
    expect((await jobRow(independent.jobId)).status).toBe("processing");
    const sentFromBlocked = await Promise.all(blocked.map((each) => jobRow(each.jobId)));
    expect(sentFromBlocked.filter((row) => row.status === "processing")).toHaveLength(1);
  }, 60_000);
});

describe("the controls", () => {
  it("are refused to an operator without the capability, and audited when taken", async () => {
    const scope = await globalScope();

    capability.mockRejectedValueOnce(
      Object.assign(new Error("not permitted"), {
        name: "NotPermitted",
        kind: "not_permitted",
        serviceError: true,
      }),
    );
    await expect(
      withTransaction((tx) =>
        pauseMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, "No authority"),
      ),
    ).rejects.toThrow();

    // With the capability, and with a reason.
    await pauseGlobally("Numbers look wrong");

    const audited = await observer.query<{ action: string; reason: string; actor: string }>(
      `select action, reason, actor_person_id as actor from public.audit_events
        where entity_table = 'messaging_safety_scopes' order by occurred_at desc limit 1`,
    );
    expect(audited.rows[0].action).toBe("messaging_safety.paused");
    expect(audited.rows[0].reason).toBe("Numbers look wrong");
    expect(audited.rows[0].actor).toBe(anchorPersonId);
  });

  it("refuse a reason nobody gave, and a version somebody else has moved on from", async () => {
    const scope = await globalScope();

    await expect(
      withTransaction((tx) =>
        pauseMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, "   "),
      ),
    ).rejects.toThrow();

    await pauseGlobally("First");
    // The browser still holds the version it was drawn with.
    const stale = await withTransaction((tx) =>
      resumeMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, "Stale").catch(
        (error: unknown) => error,
      ),
    );
    expect(isServiceError(stale)).toBe(true);
  });

  it("resume re-checks eligibility rather than releasing a backlog", async () => {
    const target = await invitee("ResumedButPaced");
    const holder = await invitee("PacingHolder");

    await pauseGlobally("Paused");
    expect(await dispatchJob(target.jobId, { source: CONFIGURED, transport: accepts() })).toBe(
      "deferred",
    );

    // The allowance is spent while the pause is on.
    await seedAdmissions(holder.jobId, SHARED_PACING_LIMIT);

    const scope = await globalScope();
    await withTransaction((tx) =>
      resumeMessagingIn(tx, { scopeId: scope!.id, version: scope!.version }, "Looked at it"),
    );

    // Resumed, and still paced: nothing was refunded and no backlog is
    // released in a burst.
    const transport = accepts();
    expect(await dispatchJob(target.jobId, { source: CONFIGURED, transport })).toBe("deferred");
    expect(transport).not.toHaveBeenCalled();
    expect((await jobRow(target.jobId)).safety_reason_code).toBe("shared_pacing");
  });
});

describe("the independent alert route", () => {
  it("carries counts and codes, and never a person", async () => {
    const records: Record<string, unknown>[] = [];
    const monitor: SafetyMonitor = (record) => records.push({ ...record });
    const previous = setSafetyMonitor(monitor);
    try {
      const holder = await invitee("AlertHolder");
      const last = await invitee("AlertLast");
      await seedAdmissions(holder.jobId, GLOBAL_EMERGENCY_LIMIT - 1, {
        personId: holder.personId,
        destination: destinationKey("whatsapp", holder.phone),
        ageMinutes: 120,
      });
      await dispatchJob(last.jobId, { source: CONFIGURED, transport: accepts() });

      const opened = records.find(
        (record) => record.event === SAFETY_LOG_EVENT && record.kind === "global_emergency_stop",
      );
      expect(opened).toBeDefined();
      expect(Object.keys(opened!).sort()).toEqual(
        ["counts", "event", "kind", "page", "phase", "reasonCode", "scope", "severity"].sort(),
      );

      const serialised = JSON.stringify(records);
      expect(serialised).not.toContain(holder.personId);
      expect(serialised).not.toContain(last.personId);
      expect(serialised).not.toContain(holder.phone.replace(/\s/g, ""));
      expect(serialised).not.toContain(destinationKey("whatsapp", holder.phone));
      expect(serialised).not.toContain(MARKER);
    } finally {
      setSafetyMonitor(previous);
    }
  }, 60_000);

  it("writes a heartbeat on every tick, so silence is noticeable", async () => {
    const records: Record<string, unknown>[] = [];
    const previous = setSafetyMonitor((record) => records.push({ ...record }));
    try {
      await runMessagingSweep({ source: CONFIGURED, transport: accepts(), limit: 1 });
    } finally {
      setSafetyMonitor(previous);
    }
    const heartbeat = records.find((record) => record.event === SAFETY_HEARTBEAT_EVENT);
    expect(heartbeat).toBeDefined();
    expect(Object.keys(heartbeat!).sort()).toEqual(["counts", "event", "page", "severity"]);
  }, 60_000);
});

describe("the identifying counting fields", () => {
  it("are cleared after the retention window, leaving the delivery history alone", async () => {
    const target = await invitee("Retention");
    await dispatchJob(target.jobId, { source: CONFIGURED, transport: accepts() });

    await observer.query(
      `update public.delivery_attempts
          set safety_admitted_at = now() - ($2 || ' days')::interval
        where notification_job_id = $1`,
      [target.jobId, String(SAFETY_FIELD_RETENTION_DAYS + 1)],
    );

    const cleared = await withTransaction((tx) => clearExpiredSafetyFieldsIn(tx));
    expect(cleared).toBeGreaterThanOrEqual(1);

    const row = await observer.query<{
      safety_person_id: string | null;
      safety_destination_key: string | null;
      safety_admitted_at: Date | null;
      provider_message_id: string | null;
      accepted_at: Date | null;
    }>(
      `select safety_person_id, safety_destination_key, safety_admitted_at,
              provider_message_id, accepted_at
         from public.delivery_attempts where notification_job_id = $1`,
      [target.jobId],
    );
    expect(row.rows[0].safety_person_id).toBeNull();
    expect(row.rows[0].safety_destination_key).toBeNull();
    // The delivery history itself is untouched, and the admission is still
    // counted globally — conservative, as designed.
    expect(row.rows[0].safety_admitted_at).not.toBeNull();
    expect(row.rows[0].provider_message_id).not.toBeNull();
    expect(row.rows[0].accepted_at).not.toBeNull();
  });

  it("are cleared for an erased person, along with their destination's hold", async () => {
    const target = await invitee("Erased");
    await dispatchJob(target.jobId, { source: CONFIGURED, transport: accepts() });

    // A hold on the number this person was messaged at.
    const key = destinationKey("whatsapp", `44${target.phone.replace(/\D/g, "").slice(1)}`);
    await observer.query(
      `insert into public.messaging_safety_scopes (scope_kind, scope_key, latched_at, latch_reason_code)
       select 'destination', a.safety_destination_key, now(), 'destination_hold'
         from public.delivery_attempts a
        where a.notification_job_id = $1 and a.safety_destination_key is not null
       on conflict (scope_kind, scope_key) do nothing`,
      [target.jobId],
    );
    expect(key).toBeTruthy();

    await withTransaction((tx) => anonymisePersonIn(tx, target.personId));

    const row = await observer.query<{
      safety_person_id: string | null;
      safety_destination_key: string | null;
    }>(
      "select safety_person_id, safety_destination_key from public.delivery_attempts where notification_job_id = $1",
      [target.jobId],
    );
    expect(row.rows[0].safety_person_id).toBeNull();
    expect(row.rows[0].safety_destination_key).toBeNull();

    const scopes = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.messaging_safety_scopes where scope_kind = 'destination'",
    );
    expect(scopes.rows[0].count).toBe("0");
  });
});

describe("the guard itself", () => {
  it("counts a committed admission even when the outcome is never learned", async () => {
    const target = await invitee("Ambiguous");

    // Admitted inside a transaction that then commits, with no provider call
    // at all — the crash-after-claim shape. It still counts.
    await withTransaction(async (tx) => {
      const admission = await admitSendIn(tx, {
        jobId: target.jobId,
        personId: target.personId,
        channel: "whatsapp",
        recipient: "447700900001",
      });
      expect(admission.admitted).toBe(true);
      if (!admission.admitted) return;
      await tx.query(
        `insert into public.delivery_attempts
           (notification_job_id, attempt_number, channel, provider,
            safety_admitted_at, safety_person_id, safety_destination_key)
         values ($1, 1, 'whatsapp', 'test', $2, $3, $4)`,
        [target.jobId, admission.admittedAt, admission.personId, admission.destinationKey],
      );
    });

    const second = await withTransaction((tx) =>
      admitSendIn(tx, {
        jobId: target.jobId,
        personId: target.personId,
        channel: "whatsapp",
        recipient: "447700900001",
      }),
    );
    expect(second.admitted).toBe(false);
    if (second.admitted) return;
    expect(second.reasonCode).toBe("person_pacing");
    expect(second.nextEligibleAt).not.toBeNull();
  });

  it("refuses to send when the policy the database was set up for is not the one running", async () => {
    const target = await invitee("PolicyMismatch");
    await observer.query(
      "update public.messaging_safety_scopes set policy_version = 'something-else' where scope_kind = 'global'",
    );
    try {
      const transport = accepts();
      expect(await dispatchJob(target.jobId, { source: CONFIGURED, transport })).toBe("deferred");
      expect(transport).not.toHaveBeenCalled();
      expect((await jobRow(target.jobId)).safety_reason_code).toBe("safety_unavailable");
    } finally {
      await observer.query(
        "update public.messaging_safety_scopes set policy_version = 'lan-394-v1' where scope_kind = 'global'",
      );
    }
  });
});
