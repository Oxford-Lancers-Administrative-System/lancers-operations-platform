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

import type { Client } from "pg";

import { closePool, isServiceError, type ServiceError } from "@/lib/db";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";
import {
  applyProviderCallback,
  dispatchEventInvitations,
  dispatchJob,
  MAX_ATTEMPTS,
  readEventDelivery,
  retryDelivery,
  revokeAndReissue,
} from "./delivery";
import { openObserver } from "../../../tests/helpers/service-layer";

const MARKER = "LAN78DeliverySuite";

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
  await observer.query(
    "delete from public.audit_events where entity_table = 'notification_jobs' and actor_label like 'system: automated%' and occurred_at > now() - interval '10 minutes'",
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
function accepts(prefix = "wamid.ACCEPTED") {
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
    const transport = accepts("wamid.ONE");

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
    expect(attempt.rows[0].provider_message_id).toBe("wamid.ONE.1");
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
      transport: accepts("wamid.RETRY"),
    });
    await revokeAndReissue(await anyPerson(), invitationId, "Wrong link", {
      source: CONFIGURED,
      transport: accepts("wamid.REISSUE"),
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
        new Response(JSON.stringify({ messages: [{ id: "wamid.REUSED" }] }), {
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
        where j.event_id = $1 and a.provider_message_id = 'wamid.REUSED'`,
      [eventId],
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
      transport: accepts("wamid.REISSUED"),
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
    await dispatchEventInvitations(eventId, { source: CONFIGURED, transport: accepts("wamid.CB") });

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
      transport: accepts("wamid.DUP"),
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
      transport: accepts("wamid.READ"),
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
    const outcome = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}:unmatched:delivered`,
        providerMessageId: `${MARKER}.unknown`,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );
    expect(outcome).toBe("unmatched");

    await observer.query("delete from public.delivery_callbacks where provider_event_id = $1", [
      `${MARKER}:unmatched:delivered`,
    ]);
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
      transport: accepts("wamid.FAIL"),
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
      transport: accepts("wamid.REPAIRED"),
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
      transport: accepts("wamid.CONFIGURED"),
    });
    expect((await row(eventId)).state).toBe("attempted");
  });

  it("keeps the job and the authoritative result from disagreeing", async () => {
    const { eventId } = await fixture();
    await dispatchEventInvitations(eventId, {
      source: CONFIGURED,
      transport: accepts("wamid.RACE"),
    });

    const messageId = "wamid.RACE.1";
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
