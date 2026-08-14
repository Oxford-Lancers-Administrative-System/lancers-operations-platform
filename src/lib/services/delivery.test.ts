// @vitest-environment node
/**
 * Automated delivery — LAN-78.
 *
 * Against the real local database with an **injected transport**, so every
 * provider outcome is reachable deterministically and no network is touched.
 * The database has to be real: claiming is a guarded `update`, deduplication is
 * a unique constraint, and append-only results are a privilege. None of those
 * can be demonstrated against a mock.
 *
 * Every row hangs off a person whose `given_name` is `MARKER`, deleted in
 * `afterEach`. The marker is unique to this file — Vitest runs suites in
 * parallel against one database.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";
import {
  applyProviderCallback,
  JOB_NOT_FOUND_RULE,
  dispatchEventInvitations,
  dispatchJob,
  MAX_ATTEMPTS,
  readEventDelivery,
  retryDelivery,
  revokeAndReissue,
} from "./delivery";
import { openObserver } from "../../../tests/helpers/service-layer";

const MARKER = "LAN78DeliverySuite";

/**
 * The prefix every provider message identifier this suite invents begins with,
 * and the handle `afterEach` deletes callbacks by.
 *
 * Unique per run. `delivery_callbacks.provider_event_id` is globally unique, so
 * a fixed identifier that escapes cleanup once poisons the database for every
 * later run — see `afterEach`.
 */
const PROVIDER_MESSAGE_NAMESPACE = "wamid.LAN78.";
const PROVIDER_MESSAGE_PREFIX = `${PROVIDER_MESSAGE_NAMESPACE}${crypto.randomUUID().slice(0, 8)}.`;

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
};

let observer: Client;
let seasonId: string;

/**
 * A season of this suite's own, and the reason it is not the seeded one.
 *
 * These suites commit — they have to, because commit is part of what is under
 * test — and an `active` membership in the club's current season changes the
 * roster every other suite reads. `membership.test.ts` counts that roster and
 * failed the moment this file borrowed it.
 *
 * The season is therefore `archived`, which puts it outside every "current
 * season" query in the application while remaining a perfectly legal parent for
 * a membership, an event and an invitation. Nothing under test here depends on
 * the season being the open one.
 */
beforeAll(async () => {
  observer = await openObserver();

  // A **seeded** person, not merely the oldest one in the table.
  //
  // The first version took `order by created_at limit 1`, which on a parallel
  // run can be another suite's fixture person — and naming them as this
  // season's opener makes them undeletable (`on delete restrict`), so that
  // suite's cleanup fails and every test after it fails with a foreign-key
  // error that has nothing to do with what it was testing. The seed stamps its
  // people with one fixed timestamp, and no suite ever deletes them.
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    ["2026-08-15T09:00:00Z"],
  );
  expect(anchor.rows.length).toBe(1);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );

  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on,
        opened_at, opened_by_person_id, closed_at, closed_by_person_id)
     values ($1, 'archived', $2, '2019-09-01', '2020-06-01', now(), $3, now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  const events = "(select id from public.events where name like $1)";
  const jobs = `(select id from public.notification_jobs where event_id in ${events})`;
  const invitations = `(select id from public.invitations where event_id in ${events})`;
  const scope = `${MARKER}%`;

  await observer.query(
    `delete from public.delivery_callbacks where delivery_attempt_id in
       (select id from public.delivery_attempts where notification_job_id in ${jobs})`,
    [scope],
  );
  // An **unmatched** callback has `delivery_attempt_id = null` and is therefore
  // unreachable by the delete above. Left behind, it occupies its
  // `provider_event_id` for ever — the uniqueness constraint is global — so the
  // next run's insert is refused, `applyProviderCallback` answers "duplicate",
  // and a test fails permanently on that database. CI never sees it, because CI
  // resets from empty; a developer's stack would be broken until somebody found
  // the row. Review found exactly that, on a real stack.
  await observer.query("delete from public.delivery_callbacks where provider_event_id like $1", [
    `${PROVIDER_MESSAGE_PREFIX}%`,
  ]);
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    scope,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
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
    "delete from public.audit_events where entity_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query("delete from public.events where name like $1", [scope]);
  await observer.query(
    "delete from public.season_memberships where person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query(
    "delete from public.contact_points where person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query(
    "delete from public.audit_events where actor_person_id in (select id from public.people where given_name = $1)",
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  // Audit rows written by the automated actor name a job, not a person, so they
  // are cleaned by their entity rather than their actor.
  // Scoped to this suite's own jobs. It was "any automated audit row from the
  // last ten minutes", which on a shared local stack deletes a concurrent
  // suite's, a developer's, or a hand-run pilot scenario's rows.
  await observer.query(
    `delete from public.audit_events
      where entity_table = 'notification_jobs'
        and entity_id in (select id from public.notification_jobs where event_id in ${events})`,
    [scope],
  );
});

afterAll(async () => {
  // After `afterEach` has removed every membership and event hanging off it.
  await observer.query("delete from public.seasons where label = $1", [`${MARKER} season`]);
  await observer.end();
  await closePool();
});

/** An approved event, one invitee with a usable number, and one pending job. */
async function fixture(options: { phone?: string | null } = {}) {
  // One transaction, because `event_audience_members` and `invitations` are
  // written separately and `tests/synthetic-seed.test.ts` counts audience rows
  // that have no invitation — the approval defect it exists to report. A
  // half-built fixture visible to a parallel suite looks exactly like one.
  await observer.query("begin");
  try {
    const phone = options.phone === undefined ? "07700 900123" : options.phone;

    const person = await observer.query<{ id: string }>(
      // `created_at` is set far ahead on purpose, and this is not cosmetic.
      //
      // The seed stamps its people with a **future** timestamp (2026-08-15), so a
      // fixture person created at `now()` is the *oldest* row in `public.people`.
      // `roster.test.ts` resolves its acting operator as "the oldest person", and in
      // a parallel run it therefore adopted this suite's fixture — which this suite
      // then deleted in `afterEach`, taking that suite's actor with it and failing
      // thirteen of its tests with foreign-key errors about a table neither suite is
      // testing. Sorting these rows to the end of every ordering keeps them
      // unpickable by any suite looking for a real person.
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

    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
      [personId, seasonId],
    );

    const event = await observer.query<{ id: string }>(
      `with target as (select (now() + interval '48 hours') at time zone 'Europe/London' as local)
     insert into public.events
       (season_id, name, event_type, status, scheduled_on, starts_at, solicits_response,
        audience_confirmed_at, audience_confirmed_by_person_id, approved_at, approved_by_person_id)
     select $1, $2, 'practice', 'approved',
            (select local::date from target), (select local::time from target), true,
            now(), $3, now(), $3
     returning id`,
      [seasonId, `${MARKER} practice`, personId],
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
       (event_id, event_status, solicits_response, season_id, capacity,
        season_membership_id, status, audience_member_id)
     values ($1, 'approved', true, $2, 'player', $3, 'pending', $4) returning id`,
      [eventId, seasonId, membership.rows[0].id, audience.rows[0].id],
    );

    const job = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
     values ($1, 'invitation', 'pending', $2, $3, $4, 'whatsapp') returning id`,
      [`${MARKER}:${eventId}`, invitation.rows[0].id, eventId, personId],
    );

    await observer.query("commit");
    return {
      personId,
      eventId,
      invitationId: invitation.rows[0].id,
      jobId: job.rows[0].id,
    };
  } catch (error) {
    await observer.query("rollback");
    throw error;
  }
}

/**
 * A provider that accepts, returning a **distinct** identifier each time.
 *
 * Distinct because Meta's are: `delivery_attempts_provider_message_unique` is
 * what lets a callback name exactly one attempt, so a stub reusing one
 * identifier across two sends collides with the constraint and tests nothing
 * real. The collision itself is pinned separately, below.
 */
/** A second invitee on the same event, for the batch-isolation test. */
async function addInvitee(tag: string) {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, created_at)
     values ($1, $2, now() + interval '100 years') returning id`,
    [MARKER, tag],
  );
  const personId = person.rows[0].id;

  await observer.query(
    `insert into public.contact_points (person_id, kind, raw_value, is_preferred)
     values ($1, 'phone', '07700 900444', true)`,
    [personId],
  );

  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, activated_on)
     values ($1, $2, 'active', 'returning', current_date, current_date) returning id`,
    [personId, seasonId],
  );

  const event = await observer.query<{ id: string; season_id: string }>(
    "select id, season_id from public.events where name like $1 limit 1",
    [`${MARKER}%`],
  );

  const audience = await observer.query<{ id: string }>(
    `insert into public.event_audience_members
       (event_id, season_id, capacity, season_membership_id, added_by_person_id)
     values ($1, $2, 'player', $3, $4) returning id`,
    [event.rows[0].id, event.rows[0].season_id, membership.rows[0].id, personId],
  );

  const invitation = await observer.query<{ id: string }>(
    `insert into public.invitations
       (event_id, event_status, solicits_response, season_id, capacity,
        season_membership_id, status, audience_member_id)
     values ($1, 'approved', true, $2, 'player', $3, 'pending', $4) returning id`,
    [event.rows[0].id, event.rows[0].season_id, membership.rows[0].id, audience.rows[0].id],
  );

  await observer.query(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
     values ($1, 'invitation', 'pending', $2, $3, $4, 'whatsapp')`,
    [`${MARKER}:${tag}:${event.rows[0].id}`, invitation.rows[0].id, event.rows[0].id, personId],
  );

  return { personId, invitationId: invitation.rows[0].id };
}

function accepts(prefix = `${PROVIDER_MESSAGE_PREFIX}ACCEPTED`) {
  let serial = 0;
  return vi.fn(async () => {
    serial += 1;
    return new Response(JSON.stringify({ messages: [{ id: `${prefix}.${serial}` }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

function refuses(code: number, status = 400) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ error: { code, fbtrace_id: "trace" } }), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

async function row(eventId: string) {
  const delivery = await readEventDelivery(eventId);
  return delivery.rows[0];
}

async function caught(run: () => Promise<unknown>): Promise<ServiceError> {
  try {
    await run();
  } catch (error) {
    if (isServiceError(error)) return error;
    throw error;
  }
  throw new Error("Expected this to be refused, and it was not.");
}

describe("dispatching after approval", () => {
  it("attempts every pending invitation once and records the provider's identifier", async () => {
    const { eventId } = await fixture();
    const transport = accepts(`${PROVIDER_MESSAGE_PREFIX}ONE`);

    const summary = await dispatchEventInvitations(eventId, { source: CONFIGURED, transport });

    expect(summary).toEqual({ attempted: 1, accepted: 1, refused: 0, skipped: 0 });
    expect(transport).toHaveBeenCalledTimes(1);

    const attempt = await observer.query<{
      provider: string;
      provider_message_id: string;
      accepted_at: Date;
      attempt_number: number;
    }>(
      `select a.provider, a.provider_message_id, a.accepted_at, a.attempt_number
         from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.event_id = $1`,
      [eventId],
    );
    expect(attempt.rows).toHaveLength(1);
    expect(attempt.rows[0].provider).toBe(WHATSAPP_CLOUD_PROVIDER);
    expect(attempt.rows[0].provider_message_id).toBe(`${PROVIDER_MESSAGE_PREFIX}ONE.1`);
    expect(attempt.rows[0].accepted_at).not.toBeNull();
    expect(attempt.rows[0].attempt_number).toBe(1);
  });

  /**
   * The rule the live test on 13 August 2026 established: Meta accepted a
   * message with HTTP 200 and never delivered it. Reporting acceptance as
   * **Delivered** would have called that a success.
   */
  it("reports an accepted message as Attempted, never as Delivered", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    expect((await row(eventId)).state).toBe("attempted");

    const delivered = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_results r
         join public.notification_jobs j on j.id = r.notification_job_id
        where j.event_id = $1 and r.outcome = 'delivered'`,
      [eventId],
    );
    expect(delivered.rows[0].count).toBe("0");
  });

  it("issues exactly one live token, carried into the message", async () => {
    const { eventId, invitationId } = await fixture();
    const transport = accepts();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport });

    const live = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [invitationId],
    );
    expect(live.rows[0].count).toBe("1");

    const [, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    const link = body.template.components[0].parameters[3].text;
    expect(link).toMatch(/^https:\/\/lancers\.example\.org\/rsvp\/[A-Za-z0-9_-]{43}$/);
  });

  it("never stores the link it sent", async () => {
    const { eventId, invitationId } = await fixture();
    const transport = accepts();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport });

    const [, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string) as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    const token = body.template.components[0].parameters[3].text.split("/").pop() as string;

    for (const table of ["rsvp_access_tokens", "delivery_attempts", "audit_events"]) {
      const rows = await observer.query(`select * from public.${table}`);
      expect(JSON.stringify(rows.rows)).not.toContain(token);
    }
    void invitationId;
  });

  it("sends nothing and says why when delivery is not configured", async () => {
    const { eventId } = await fixture();
    const transport = accepts();

    await dispatchEventInvitations(eventId, { source: {}, transport });

    expect(transport).not.toHaveBeenCalled();
    const current = await row(eventId);
    expect(current.state).toBe("retryable");
    expect(current.failureReason).toContain("WHATSAPP_ACCESS_TOKEN");
    // The names of the settings, never their values.
    expect(current.failureReason).not.toContain("not-a-real-token");
  });

  it("refuses an invitee with no usable number, without burning a token", async () => {
    const { eventId, invitationId } = await fixture({ phone: null });

    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const current = await row(eventId);
    expect(current.failureReason).toMatch(/no usable mobile number/i);

    const tokens = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.rsvp_access_tokens where invitation_id = $1",
      [invitationId],
    );
    expect(tokens.rows[0].count).toBe("0");
  });
});

describe("failure and retry", () => {
  it("records a terminal refusal as Failed even with attempts remaining", async () => {
    const { eventId } = await fixture();
    // 131026 — not a WhatsApp account. No number of retries fixes that.
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: refuses(131026),
    });

    const current = await row(eventId);
    expect(current.state).toBe("failed");
    expect(current.attemptCount).toBe(1);
    // Still offered, because a human may have corrected the roster since.
    expect(current.retryable).toBe(true);

    const result = await observer.query<{ outcome: string }>(
      `select r.outcome::text as outcome from public.delivery_results r
         join public.notification_jobs j on j.id = r.notification_job_id
        where j.event_id = $1`,
      [eventId],
    );
    expect(result.rows[0].outcome).toBe("rejected");
  });

  it("records a transient refusal as Retryable", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: refuses(130429, 429),
    });

    const current = await row(eventId);
    expect(current.state).toBe("retryable");
  });

  it("retries the same job rather than creating a second one", async () => {
    const { eventId, jobId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: refuses(130429, 429),
    });

    await retryDelivery(await anyPerson(), jobId, {
      source: CONFIGURED,
      transport: accepts("wamid.RETRIED"),
    });

    const jobs = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.notification_jobs where event_id = $1",
      [eventId],
    );
    expect(jobs.rows[0].count).toBe("1");

    const attempts = await observer.query<{ attempt_number: number }>(
      `select a.attempt_number from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.event_id = $1 order by a.attempt_number`,
      [eventId],
    );
    expect(attempts.rows.map((each) => each.attempt_number)).toEqual([1, 2]);
    expect((await row(eventId)).state).toBe("attempted");
  });

  it("creates no invitation and no audience row, ever", async () => {
    const { eventId, jobId, invitationId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: refuses(130429, 429),
    });
    // Distinct prefixes because each `accepts()` counts from one of its own, and
    // two attempts may never share a provider message identifier.
    await retryDelivery(await anyPerson(), jobId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}RETRY`),
    });
    await revokeAndReissue(await anyPerson(), invitationId, "Wrong link", {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}REISSUE`),
    });

    // LAN-77 froze the audience at approval. Repair must be provably unable to
    // widen it, which is why this asserts counts rather than intent.
    for (const table of ["invitations", "event_audience_members"]) {
      const rows = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.${table} where event_id = $1`,
        [eventId],
      );
      expect(rows.rows[0].count).toBe("1");
    }
  });

  it("stops retrying at the ceiling, and says so", async () => {
    const { eventId, jobId } = await fixture();
    const person = await anyPerson();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await dispatchJob(jobId, { source: CONFIGURED, transport: refuses(130429, 429) });
    }

    const current = await row(eventId);
    expect(current.attemptCount).toBe(MAX_ATTEMPTS);
    expect(current.state).toBe("failed");
    expect(current.retryable).toBe(false);

    const error = await caught(() =>
      retryDelivery(person, jobId, { source: CONFIGURED, transport: accepts() }),
    );
    expect(error.kind).toBe("invalid_transition");
  });
});

describe("provider message identifiers", () => {
  it("refuses to attach one identifier to two attempts", async () => {
    const { eventId, jobId } = await fixture();

    // Meta never reuses a message identifier, and the schema relies on that:
    // it is the only handle a callback has. A provider that did reuse one would
    // otherwise make "delivered" ambiguous between two attempts.
    const reused = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: `${PROVIDER_MESSAGE_PREFIX}REUSED` }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await dispatchJob(jobId, { source: CONFIGURED, transport: reused });
    await observer.query("update public.notification_jobs set status = 'pending' where id = $1", [
      jobId,
    ]);

    const error = await caught(() => dispatchJob(jobId, { source: CONFIGURED, transport: reused }));
    expect(error.kind).toBe("conflict");

    const ids = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.event_id = $1 and a.provider_message_id = $2`,
      [eventId, `${PROVIDER_MESSAGE_PREFIX}REUSED`],
    );
    expect(ids.rows[0].count).toBe("1");
  });
});

describe("revoke and reissue", () => {
  it("kills the old token, issues one new live token, and sends it", async () => {
    const { eventId, invitationId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const before = await observer.query<{ id: string }>(
      `select id from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [invitationId],
    );

    await revokeAndReissue(await anyPerson(), invitationId, "Sent to the wrong number", {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}REISSUED`),
    });

    const live = await observer.query<{ id: string }>(
      `select id from public.rsvp_access_tokens
        where invitation_id = $1 and revoked_at is null and superseded_at is null`,
      [invitationId],
    );
    expect(live.rows).toHaveLength(1);
    expect(live.rows[0].id).not.toBe(before.rows[0].id);

    const dead = await observer.query<{ revoked_reason: string | null }>(
      "select revoked_reason from public.rsvp_access_tokens where id = $1",
      [before.rows[0].id],
    );
    expect(dead.rows[0].revoked_reason).toBe("Sent to the wrong number");
  });

  it("has to say why", async () => {
    const { eventId, invitationId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const person = await anyPerson();
    const error = await caught(() =>
      revokeAndReissue(person, invitationId, "  ", { source: CONFIGURED }),
    );
    expect(error.kind).toBe("constraint_violated");
  });
});

describe("provider callbacks", () => {
  async function attemptFor(eventId: string) {
    const result = await observer.query<{ provider_message_id: string }>(
      `select a.provider_message_id from public.delivery_attempts a
         join public.notification_jobs j on j.id = a.notification_job_id
        where j.event_id = $1`,
      [eventId],
    );
    return result.rows[0].provider_message_id;
  }

  it("moves an attempted delivery to Delivered", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}CB`),
    });

    const applied = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${await attemptFor(eventId)}:delivered`,
        providerMessageId: await attemptFor(eventId),
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );

    expect(applied).toBe("applied");
    expect((await row(eventId)).state).toBe("delivered");
  });

  it("ignores a repeated callback entirely", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}DUP`),
    });
    const messageId = await attemptFor(eventId);
    const event = {
      providerEventId: `${messageId}:delivered`,
      providerMessageId: messageId,
      providerStatus: "delivered",
      outcome: "delivered" as const,
      detail: null,
    };

    expect(
      await applyProviderCallback(WHATSAPP_CLOUD_PROVIDER, event, { signatureVerified: true }),
    ).toBe("applied");
    // Providers retry. The second copy must change nothing at all.
    expect(
      await applyProviderCallback(WHATSAPP_CLOUD_PROVIDER, event, { signatureVerified: true }),
    ).toBe("duplicate");

    const results = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.delivery_results r
         join public.notification_jobs j on j.id = r.notification_job_id
        where j.event_id = $1`,
      [eventId],
    );
    expect(results.rows[0].count).toBe("1");
  });

  it("records a status it has no outcome for, and applies nothing", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}READ`),
    });
    const messageId = await attemptFor(eventId);

    const outcome = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${messageId}:read`,
        providerMessageId: messageId,
        providerStatus: "read",
        outcome: null,
        detail: null,
      },
      { signatureVerified: true },
    );

    expect(outcome).toBe("not_applicable");
    expect((await row(eventId)).state).toBe("attempted");

    const stored = await observer.query<{ ignored_reason: string }>(
      "select ignored_reason from public.delivery_callbacks where provider_event_id = $1",
      [`${messageId}:read`],
    );
    expect(stored.rows[0].ignored_reason).toContain("read");
  });

  it("records a callback for a message it has never seen, and applies nothing", async () => {
    // The per-run prefix, not a fixed identifier — and no cleanup inside the
    // test body. This row has `delivery_attempt_id = null`, so the
    // attempt-scoped delete in `afterEach` cannot reach it; only the prefix
    // delete can. It previously used `${MARKER}:unmatched:delivered` and tidied
    // up on the line after the assertion, so any failure of that assertion left
    // the row behind — and because `provider_event_id` is globally unique, the
    // next run then reported `duplicate` and the suite was red on that machine
    // for ever. Review reproduced exactly that.
    const providerEventId = `${PROVIDER_MESSAGE_PREFIX}unmatched:delivered`;

    const outcome = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId,
        providerMessageId: `${PROVIDER_MESSAGE_PREFIX}unknown`,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );
    expect(outcome).toBe("unmatched");
  });

  it("leaves no callback behind that its own cleanup cannot reach", async () => {
    // Scoped to this suite's own namespace, `wamid.LAN78.`, and NOT to the whole
    // table.
    //
    // The unscoped version measured "no row any writer has ever committed falls
    // outside this run's prefix" while claiming to measure "every identifier
    // this suite invents begins with it". Those are different properties, and
    // the first turns a leftover row belonging to `route.test.ts` — or to a
    // hand-run pilot script — into a permanent red for this file. That is the
    // poisoning this assertion exists to prevent, with its polarity reversed.
    //
    // Scoping to the namespace still catches the real hazard: a row this suite
    // wrote on an earlier run and failed to clean up.
    const stray = await observer.query<{ provider_event_id: string }>(
      `select provider_event_id from public.delivery_callbacks
        where provider_event_id like $1
          and provider_event_id not like $2`,
      [`${PROVIDER_MESSAGE_NAMESPACE}%`, `${PROVIDER_MESSAGE_PREFIX}%`],
    );
    expect(stray.rows.map((each) => each.provider_event_id)).toEqual([]);
  });

  it("invents no identifier outside the namespace its cleanup searches", () => {
    // The code-level half, which no shared database can perturb.
    expect(PROVIDER_MESSAGE_PREFIX.startsWith(PROVIDER_MESSAGE_NAMESPACE)).toBe(true);
  });

  it("refuses to record anything whose signature was not verified", async () => {
    const error = await caught(() =>
      applyProviderCallback(
        WHATSAPP_CLOUD_PROVIDER,
        {
          providerEventId: `${MARKER}:unsigned`,
          providerMessageId: null,
          providerStatus: "delivered",
          outcome: "delivered",
          detail: null,
        },
        { signatureVerified: false },
      ),
    );
    expect(error.kind).toBe("constraint_violated");

    const stored = await observer.query<{ count: string }>(
      "select count(*)::text as count from public.delivery_callbacks where provider_event_id = $1",
      [`${MARKER}:unsigned`],
    );
    expect(stored.rows[0].count).toBe("0");
  });

  it("moves a failed callback to Failed with a safe reason", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}FAIL`),
    });
    const messageId = await attemptFor(eventId);

    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${messageId}:failed`,
        providerMessageId: messageId,
        providerStatus: "failed",
        outcome: "failed",
        detail: "WhatsApp could not deliver to this number.",
      },
      { signatureVerified: true },
    );

    const current = await row(eventId);
    expect(current.state).toBe("retryable");
    expect(current.failureReason).toContain("could not deliver");
  });
});

/**
 * The four corrections independent review produced. Each one is a state an
 * operator could reach, and each was wrong or misleading before.
 */
describe("what an operator is told after a repair", () => {
  it("stops showing the previous failure once a new attempt is accepted", async () => {
    const { eventId, jobId } = await fixture();

    // 131026 — not a WhatsApp account. Terminal, and it sets `last_error`.
    await dispatchJob(jobId, { source: CONFIGURED, transport: refuses(131026) });
    expect((await row(eventId)).failureReason).toMatch(/not be a WhatsApp account/i);

    // The cause is fixed off-screen and the operator retries. The provider
    // accepts. The panel must not now render "Latest result: Attempted" above
    // the *old* reason — which is what it did, on the commonest repair path.
    await retryDelivery(await anyPerson(), jobId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}REPAIRED`),
    });

    const current = await row(eventId);
    expect(current.state).toBe("attempted");
    expect(current.failureReason).toBeNull();
  });

  it("does not offer retry for a send the provider has already accepted", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    // `retryDelivery` refuses anything that is not pending, ready or failed, so
    // an offered control here could only ever answer "already in progress".
    const current = await row(eventId);
    expect(current.state).toBe("attempted");
    expect(current.retryable).toBe(false);
  });

  it("does not spend the attempt ceiling on a deployment that cannot send", async () => {
    const { eventId, jobId } = await fixture();

    // Six unconfigured dispatches — one more than the ceiling. Nothing was
    // attempted: no provider was called and no message could have been sent.
    for (let attempt = 0; attempt < MAX_ATTEMPTS + 1; attempt += 1) {
      await dispatchJob(jobId, { source: {}, transport: accepts() });
    }

    const current = await row(eventId);
    expect(current.attemptCount).toBe(0);
    expect(current.failureReason).toContain("WHATSAPP_ACCESS_TOKEN");
    // Still repairable: setting the secrets and pressing Retry is a complete
    // fix, which it would not be if the ceiling had been consumed.
    expect(current.retryable).toBe(true);

    await retryDelivery(await anyPerson(), jobId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}CONFIGURED`),
    });
    expect((await row(eventId)).state).toBe("attempted");
  });

  it("keeps the job and the authoritative result from disagreeing", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(`${PROVIDER_MESSAGE_PREFIX}RACE`),
    });

    const messageId = `${PROVIDER_MESSAGE_PREFIX}RACE.1`;
    const base = { providerMessageId: messageId, detail: null } as const;

    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        ...base,
        providerEventId: `${messageId}:failed`,
        providerStatus: "failed",
        outcome: "failed",
      },
      { signatureVerified: true },
    );
    expect((await row(eventId)).state).toBe("retryable");

    // A second, *different* terminal callback for the same attempt. Only one
    // `delivery_results` row may exist per attempt (invariant M4), so the
    // second is refused — and the job must not move either, or the screen
    // would read Delivered while the recorded outcome stayed `failed`.
    const outcome = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        ...base,
        providerEventId: `${messageId}:delivered`,
        providerStatus: "delivered",
        outcome: "delivered",
      },
      { signatureVerified: true },
    );

    expect(outcome).toBe("superseded");
    expect((await row(eventId)).state).toBe("retryable");

    const results = await observer.query<{ outcome: string }>(
      `select r.outcome::text as outcome from public.delivery_results r
         join public.notification_jobs j on j.id = r.notification_job_id
        where j.event_id = $1`,
      [eventId],
    );
    expect(results.rows.map((each) => each.outcome)).toEqual(["failed"]);

    // And the stored callback says so. It applied nothing, so recording it with
    // `applied_at` set and no reason would make this table — the durable,
    // auditable evidence the issue asks for — assert something untrue.
    const stored = await observer.query<{ applied: boolean; ignored_reason: string | null }>(
      `select applied_at is not null as applied, ignored_reason
         from public.delivery_callbacks
        where provider_event_id = $1`,
      [`${messageId}:delivered`],
    );
    expect(stored.rows[0].applied).toBe(false);
    expect(stored.rows[0].ignored_reason).toMatch(/already has a recorded outcome/i);
  });
});

/**
 * The corrections review produced, each with the test it should have shipped
 * with. Every one survived injection when it had none.
 */
describe("what the dispatcher refuses to do", () => {
  it("retries an invitation job and nothing else", async () => {
    const { eventId, invitationId, personId } = await fixture();

    // Every job is an invitation today only because nothing else creates one.
    // LAN-79's reminders would make an unconstrained retry a way to fire an
    // unrelated job from the delivery screen.
    const reminder = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, invitation_id, event_id, person_id, channel)
       values ($1, 'reminder', 'pending', $2, $3, $4, 'whatsapp') returning id`,
      [`${MARKER}:reminder:${eventId}`, invitationId, eventId, personId],
    );

    const error = await caught(() =>
      retryDelivery(personId, reminder.rows[0].id, { source: CONFIGURED, transport: accepts() }),
    );
    expect(error.rule).toBe(JOB_NOT_FOUND_RULE);
  });

  it("sends to the preferred number when a person has more than one", async () => {
    const { eventId, personId } = await fixture({ phone: "07700 900111" });
    // `contact_points_one_preferred_per_kind` permits one preferred phone per
    // person, so the old one is demoted before the new one is added.
    await observer.query(
      "update public.contact_points set is_preferred = false where person_id = $1",
      [personId],
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, valid_from)
       values ($1, 'phone', '07700 900222', true, current_date - 1)`,
      [personId],
    );

    const transport = accepts();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport });

    const [, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    // Unordered, this was whatever PostgreSQL returned — sending to an
    // arbitrary one of somebody's two numbers is the kind of wrong that looks
    // like working software.
    expect(JSON.parse(init.body as string).to).toBe("447700900222");
  });

  it("ignores a number that is not current yet", async () => {
    const { eventId, personId } = await fixture({ phone: null });
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, valid_from)
       values ($1, 'phone', '07700 900333', true, current_date + 30)`,
      [personId],
    );

    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    expect((await row(eventId)).failureReason).toMatch(/no usable mobile number/i);
  });

  it("attempts the rest of the audience when one invitation cannot be prepared", async () => {
    const { eventId } = await fixture();
    const second = await addInvitee("Second");

    // The first invitation's event start is moved into the past, so issuing its
    // token throws inside the claim. Before this was isolated per job, that
    // ended the loop and nobody after it was ever attempted.
    await observer.query(
      `update public.invitations set expires_at = now() - interval '1 day' where id = $1`,
      [second.invitationId],
    );
    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 hour') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 hour') at time zone 'Europe/London')::time
        where id = $1`,
      [eventId],
    );

    const summary = await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts(),
    });

    // Both refused — the event has started — but both were *reached*, and both
    // recorded a reason rather than one failing and the other going silent.
    expect(summary.attempted).toBe(2);
    const delivery = await readEventDelivery(eventId);
    for (const each of delivery.rows) {
      expect(each.failureReason, `${each.inviteeName} recorded no reason`).not.toBeNull();
    }
  });
});

describe("the late failure write does not stamp another worker's claim", () => {
  /**
   * The path this guard exists for, reached the way it is really reached.
   *
   * `claimJobIn` runs inside a transaction. When `issueTokenIn` refuses — a
   * started or cancelled event — that transaction rolls back, so the claim is
   * undone and `claimed_by` reverts to whatever it was. `recordDispatchFailure`
   * then runs in a **new** transaction, and without a discriminating predicate
   * it stamps `failed` over whatever it finds, including another dispatcher's
   * live claim.
   *
   * The predicate was `claimed_by is null or claimed_by = <one shared
   * constant>`, and that constant was the only non-null value anything ever
   * wrote to the column — so it matched every row and refused nothing. A
   * fencing token per dispatch is what makes it discriminate.
   */
  it("refuses to conclude a job another dispatcher is holding", async () => {
    const { eventId, jobId } = await fixture();

    const foreign = "system: automated delivery:00000000-0000-4000-8000-00000000ffff";
    await observer.query("update public.notification_jobs set claimed_by = $2 where id = $1", [
      jobId,
      foreign,
    ]);

    // Move the event into the past so `issueTokenIn` refuses and the claim
    // transaction rolls back, leaving the foreign claim in place.
    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 hour') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 hour') at time zone 'Europe/London')::time
        where id = $1`,
      [eventId],
    );

    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const after = await observer.query<{ status: string; claimed_by: string | null }>(
      "select status::text as status, claimed_by from public.notification_jobs where id = $1",
      [jobId],
    );
    expect(after.rows[0].claimed_by).toBe(foreign);
    expect(after.rows[0].status).toBe("pending");
  });

  it("concludes its own committed claim, which is the case the disjunct exists for", async () => {
    const { eventId, jobId } = await fixture();

    /**
     * The only path that distinguishes a working guard from a dead one.
     *
     * Both tests around this one reach `recordDispatchFailure` through
     * `issueTokenIn` refusing, which rolls the claim back — so both exercise
     * only `claimed_by is null`, and a guard naming a token nothing ever wrote
     * passes them. The disjunct exists for the case where the claim **commits**
     * and the dispatch then throws.
     *
     * Forced by making the recording transaction fail: another job already owns
     * the provider message identifier this send will return, and
     * `delivery_attempts_provider_message_unique` refuses the second. So the
     * claim commits, the provider accepts, and the write that records it
     * throws — exactly the shape of a pool exhaustion or a lost connection at
     * that moment.
     */
    const collidingId = `${PROVIDER_MESSAGE_PREFIX}COLLIDE`;
    const other = await addInvitee("Collider");
    const otherJob = await observer.query<{ id: string }>(
      "select id from public.notification_jobs where invitation_id = $1",
      [other.invitationId],
    );
    await observer.query(
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider, provider_message_id, accepted_at)
       values ($1, 1, 'whatsapp', $2, $3, now())`,
      [otherJob.rows[0].id, WHATSAPP_CLOUD_PROVIDER, collidingId],
    );

    const reused = vi.fn(
      async () =>
        new Response(JSON.stringify({ messages: [{ id: collidingId }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: reused });

    // The guard has to recognise the claim this dispatch itself committed. If
    // it names a value nothing wrote, nothing matches, and the job is left
    // `processing` with no reason — Attempted for ever, with an audit row
    // asserting a failure the job denies.
    const after = await observer.query<{ status: string; last_error: string | null }>(
      "select status::text as status, last_error from public.notification_jobs where id = $1",
      [jobId],
    );
    expect(after.rows[0].status).toBe("failed");
    expect(after.rows[0].last_error).not.toBeNull();
  });

  it("does conclude a job nobody else holds", async () => {
    const { eventId, jobId } = await fixture();
    await observer.query(
      `update public.events
          set scheduled_on = ((now() - interval '1 hour') at time zone 'Europe/London')::date,
              starts_at = ((now() - interval '1 hour') at time zone 'Europe/London')::time
        where id = $1`,
      [eventId],
    );

    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    // Unclaimed, so the failure is recorded — the invitee shows a reason rather
    // than a silence, which is the whole point of recording it at all.
    const after = await observer.query<{ status: string; last_error: string | null }>(
      "select status::text as status, last_error from public.notification_jobs where id = $1",
      [jobId],
    );
    expect(after.rows[0].status).toBe("failed");
    expect(after.rows[0].last_error).toMatch(/already started/i);
  });
});

describe("the operator's read model", () => {
  it("keeps delivery and RSVP as separate facts", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const current = await row(eventId);
    // "Delivered never means responded" — slice-ux.md § 6.
    expect(current.state).toBe("attempted");
    expect(current.responseState).toBe("awaiting_response");
  });

  it("counts the audience even before anything is attempted", async () => {
    const { eventId } = await fixture();
    const delivery = await readEventDelivery(eventId);
    expect(delivery.counts.audience).toBe(1);
    expect(delivery.counts.queued).toBe(1);
    expect(delivery.rows[0].tokenState).toBe("none");
  });

  it("carries no phone number and no link in what a screen receives", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts() });

    const delivery = await readEventDelivery(eventId);
    const payload = JSON.stringify(delivery);
    expect(payload).not.toContain("447700900123");
    expect(payload).not.toContain("/rsvp/");
  });
});

/** Any person, for the actor argument. The actor is audited, not authorised here. */
async function anyPerson(): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "select id from public.people where given_name = $1 limit 1",
    [MARKER],
  );
  return result.rows[0].id;
}
