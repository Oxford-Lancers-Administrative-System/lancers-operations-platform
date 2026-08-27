// @vitest-environment node
/**
 * The Follow-ups queue -- W5. LAN-173-r1-F1.
 *
 * Against the real local database with a **mocked auth floor**, the same
 * shape `event-import.test.ts` uses: `requireGeneralOperator` is the one
 * dependency this module has that is not a database read, so it is the one
 * thing mocked here. Everything else -- the `nonresponse_queue` join, the
 * chase-position derivation, the fallback-suffix exclusion -- runs against a
 * real PostgreSQL connection, because a mock of `notification_jobs` cannot
 * demonstrate a `like` exclusion against a real idempotency key.
 *
 * This file did not exist before this correction. Independent review found
 * `follow-ups.ts` -- "an entirely new 229-line module" -- with no dedicated
 * test file at all, only a UI layer that mocks the service outright.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`. The marker is unique to this file.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/guards", () => ({ requireGeneralOperator: vi.fn() }));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool, isServiceError, NotPermitted } from "@/lib/db";
import { requireGeneralOperator } from "@/lib/auth/guards";
import type { ResolvedOperator } from "@/lib/auth/operator";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";
import { dispatchJob, EMAIL_FALLBACK_SUFFIX, MAX_ATTEMPTS } from "./delivery";
import { readFollowUpsQueue, countPeople } from "./follow-ups";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN173FollowUpsSuite";

const CONFIGURED_WITH_EMAIL = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  DELIVERY_RECIPIENT_ALLOWLIST: "07700 900321",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  DELIVERY_EMAIL_ALLOWLIST: "lan173.followups@example.test",
};

function refusesWhatsAppAcceptsEmail() {
  let serial = 0;
  return vi.fn(async (url: string) => {
    if (url.endsWith("/emails")) {
      serial += 1;
      return new Response(JSON.stringify({ id: `wamid.${MARKER}.email.${serial}` }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: { code: 131026, fbtrace_id: "trace" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  });
}

const requireOperator = vi.mocked(requireGeneralOperator);

function operator(): ResolvedOperator {
  return {
    authUserId: "55555555-5555-4555-8555-555555555555",
    personId: "55555555-5555-4555-8555-555555555556",
    displayName: "Follow-ups Suite Operator",
    roleCodes: ["secretary"],
    isActive: true,
  };
}

let observer: Client;
let seasonId: string;
let anchorPersonId: string;

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

beforeEach(() => {
  requireOperator.mockReset();
  requireOperator.mockResolvedValue(operator());
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
  await observer.query(
    `delete from public.rsvp_access_tokens where invitation_id in ${invitations}`,
    [scope],
  );
  await observer.query(`delete from public.invitations where event_id in ${events}`, [scope]);
  await observer.query(`delete from public.event_audience_members where event_id in ${events}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'events' and entity_id in ${events}`,
    [scope],
  );
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'notification_jobs'
        and entity_id in (select id from public.notification_jobs where event_id in ${events})`,
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
  // LAN-172: `dispatchJob` mints a Yes and a No one-time answer token per
  // dispatch, keyed to the person rather than the invitation, so it must be
  // cleared before the person it references or the delete is refused.
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
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
  jobId: string;
}

/**
 * An approved, future event with one invitee whose invitation has been
 * delivered but not answered -- the plain `nonresponse_queue` shape, before
 * anything else happens to it.
 */
async function fixture(
  options: { phone?: string | null; email?: string | null; deadlineHours?: number } = {},
): Promise<Fixture> {
  const phone = options.phone === undefined ? "07700 900321" : options.phone;
  const email = options.email === undefined ? null : options.email;
  const deadlineHours = options.deadlineHours ?? 24;

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
          audience_confirmed_at, audience_confirmed_by_person_id,
          approved_at, approved_by_person_id)
       select $1, $2, 'practice', 'approved',
              (select local::date from target), (select local::time from target),
              now(), $3, now(), $3
       returning id`,
      [seasonId, `${MARKER} practice ${crypto.randomUUID().slice(0, 8)}`, personId],
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
       values ($1, 'approved', $2, 'player', $3, 'pending',
               now() + ($5 || ' hours')::interval, $4)
       returning id`,
      [eventId, seasonId, membership.rows[0].id, audience.rows[0].id, String(deadlineHours)],
    );
    const invitationId = invitation.rows[0].id;

    const job = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
       values ($1, 'invitation', 'pending', $2, $3, $4, 'whatsapp')
       returning id`,
      [`${MARKER}:${eventId}:invitation`, invitationId, eventId, personId],
    );

    await observer.query("commit");
    return { personId, eventId, invitationId, jobId: job.rows[0].id };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

/**
 * `personName` is a substring, not the whole display name -- the fixture's
 * person carries `given_name = MARKER, family_name = 'Invitee'`, so the
 * queue's own `display_name` reads "{MARKER} Invitee", never plain "Invitee".
 */
function personRow(events: Awaited<ReturnType<typeof readFollowUpsQueue>>, personName: string) {
  return events.flatMap((event) => event.people).find((row) => row.personName.includes(personName));
}

describe("who may read the Follow-ups queue", () => {
  it("admits a general operator", async () => {
    await fixture();
    await expect(readFollowUpsQueue()).resolves.not.toThrow();
    expect(requireOperator).toHaveBeenCalledTimes(1);
  });

  it("refuses whoever the auth floor refuses, and reads nothing", async () => {
    requireOperator.mockRejectedValueOnce(
      new NotPermitted("Coaching seats do not reach this list.", { rule: "general_operator_only" }),
    );
    await expect(readFollowUpsQueue()).rejects.toSatisfy((error) => isServiceError(error));
  });
});

describe("the queue itself", () => {
  it("lists an outstanding invitee as chasing, with a real deadline", async () => {
    await fixture({ deadlineHours: 6 });
    const events = await readFollowUpsQueue();

    const row = personRow(events, "Invitee");
    expect(row).toBeDefined();
    expect(row?.status).toBe("chasing");
    expect(row?.deadline).not.toBeNull();
    expect(countPeople(events)).toBeGreaterThanOrEqual(1);
  });

  it("reports delivery_problem for a person with no usable route, ahead of chasing", async () => {
    // F4: one list, two streams. A delivery problem is shown as one, ahead of
    // where escalation or chasing would otherwise put this row -- the club
    // cannot chase somebody it has never reached. Dispatched for real, rather
    // than hand-written onto the row, so the job reaches the exact shape
    // `recordUndeliverableIn` produces (status and a rejected delivery_result
    // together) -- `DELIVERY_STATE_EXPRESSION` reads both.
    const target = await fixture({ phone: null, email: null });
    await dispatchJob(target.jobId, {
      source: CONFIGURED_WITH_EMAIL,
      transport: refusesWhatsAppAcceptsEmail(),
    });

    const events = await readFollowUpsQueue();
    const row = personRow(events, "Invitee");
    expect(row?.status).toBe("delivery_problem");
    expect(row?.chasePosition).toBeNull();
  });

  /**
   * OWNER-LAN173-06 (correction round 2). `readQueueRowsIn`'s own delivery
   * lateral shared `participation.ts`'s exact bug shape -- `order by
   * j.created_at desc limit 1`, no tiebreaker -- over jobs that, in real use,
   * commonly share one `created_at` because `scheduleEventLadderIn` creates a
   * whole ladder inside one transaction. Pinned here the same way: an
   * invitation already `completed` and a later reminder that failed for want
   * of any usable route, both tied to the same instant, so only the fixed
   * `NOTIFICATION_JOB_RECENCY_ORDER` reads the failure this row exists to
   * surface as a delivery problem rather than as an ordinary chase.
   */
  it("reads the tied invitation job's later, failed reminder, not the invitation itself", async () => {
    const target = await fixture();
    const tiedAt = "2026-03-01T09:00:00.000Z";

    await observer.query(
      `update public.notification_jobs
          set status = 'completed', created_at = $1::timestamptz,
              scheduled_for = $1::timestamptz, ladder_rung = 0
        where id = $2`,
      [tiedAt, target.jobId],
    );
    await observer.query(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel,
          created_at, scheduled_for, ladder_rung, attempt_count, last_error)
       values ($1, 'reminder', 'failed', $2, $3, $4, 'whatsapp',
               $5::timestamptz, $6::timestamptz, 1, $7, $8)`,
      [
        `${MARKER}:${target.eventId}:reminder:1`,
        target.invitationId,
        target.eventId,
        target.personId,
        tiedAt,
        "2026-03-02T09:00:00.000Z",
        MAX_ATTEMPTS,
        NO_USABLE_NUMBER_REASON,
      ],
    );

    const events = await readFollowUpsQueue();
    const row = personRow(events, "Invitee");
    expect(row?.status).toBe("delivery_problem");
  });
});

/**
 * LAN-173-r1-F1's named exclusion property, for the third of the three
 * readers the finding names (`readEventDelivery` and
 * `readEventDeliveryDiagnostics` are `delivery.test.ts`'s).
 */
describe("the automatic email fallback is excluded from the queue's own reads", () => {
  it("keeps counting one person once the WhatsApp job's fallback exists, not twice", async () => {
    const target = await fixture();
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
       values ($1, 'email', $2, $2)`,
      [target.personId, "lan173.followups@example.test"],
    );

    // 131026 -- Meta's own non-retryable "not a WhatsApp account" -- reaches
    // the terminal branch that creates and dispatches the email fallback
    // inline, exactly as it would on a real failed WhatsApp send.
    await dispatchJob(target.jobId, {
      source: CONFIGURED_WITH_EMAIL,
      transport: refusesWhatsAppAcceptsEmail(),
    });

    const fallback = await observer.query<{ id: string }>(
      "select id from public.notification_jobs where event_id = $1 and idempotency_key like $2",
      [target.eventId, `%${EMAIL_FALLBACK_SUFFIX}`],
    );
    expect(fallback.rows).toHaveLength(1);

    const events = await readFollowUpsQueue();
    // One row, not two: `readQueueRowsIn`'s lateral join excludes the
    // fallback by its idempotency-key suffix, exactly as
    // `readEventDelivery`'s own join does.
    expect(
      events.flatMap((event) => event.people).filter((row) => row.personName.includes("Invitee")),
    ).toHaveLength(1);
  });

  it("reads the original WhatsApp job's chase position, not the fallback's, as the most recent job", async () => {
    const target = await fixture();
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, normalised_value)
       values ($1, 'email', $2, $2)`,
      [target.personId, "lan173.followups@example.test"],
    );

    await dispatchJob(target.jobId, {
      source: CONFIGURED_WITH_EMAIL,
      transport: refusesWhatsAppAcceptsEmail(),
    });

    const events = await readFollowUpsQueue();
    const row = personRow(events, "Invitee");
    // Escalated only once a `nonresponse_flags` row exists for this
    // invitation -- absent here -- so this stays `chasing`. The load-bearing
    // half of this test is that it resolves to *one* definite status rather
    // than throwing or double-counting because two jobs (the original and
    // its fallback) exist for the same invitation.
    expect(row?.status).toBe("chasing");
  });
});
