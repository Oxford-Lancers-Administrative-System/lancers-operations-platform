// @vitest-environment node
/**
 * The three tables LAN-78 adds, as the database sees them.
 *
 * Every rule asserted here is one the service layer would otherwise be trusted
 * to keep. That distinction is the point of the file: a token that is only
 * hashed because `rsvp-tokens.ts` remembers to hash it is one refactor away
 * from being stored in the clear, whereas a check constraint that admits only
 * a SHA-256 digest survives whoever writes the next service.
 *
 * Each test runs inside a transaction that is rolled back, so the seeded
 * dataset is never mutated and the order tests run in cannot matter.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createBaseline,
  expectAccepted,
  expectRejected,
  one,
  openLocalClient,
  type Baseline,
  type Client,
} from "./helpers/domain-fixture";

let client: Client;
let base: Baseline;

beforeAll(async () => {
  client = await openLocalClient();
});
afterAll(async () => {
  await client?.end();
});
beforeEach(async () => {
  await client.query("begin");
  base = await createBaseline(client);
});
afterEach(async () => {
  await client.query("rollback");
});

const DIGEST = "a".repeat(64);

async function insertToken(overrides: Record<string, string> = {}): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 day') returning id`,
    [base.invitationId, overrides.hash ?? DIGEST],
  );
  return row.id;
}

async function insertJob(): Promise<string> {
  const row = await one<{ id: string }>(
    client,
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, channel)
     values ('schema-lan78-' || gen_random_uuid()::text, 'invitation', 'pending', $1, $2, 'whatsapp')
     returning id`,
    [base.invitationId, base.approvedEventId],
  );
  return row.id;
}

describe("rsvp_access_tokens", () => {
  it("accepts a SHA-256 digest and refuses anything that is not one", async () => {
    await expectAccepted(
      client,
      `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 day')`,
      [base.invitationId, DIGEST],
    );

    // 43 URL-safe characters is what a minted token looks like. This is the
    // half of "the plaintext is never stored" that does not depend on the
    // service layer being correct.
    for (const notADigest of [
      "NxKSqVijxZeSPyv8JhFvPpTpnBig9CT-sk4sbBUNIA8",
      "A".repeat(64),
      DIGEST.slice(0, 63),
      "",
    ]) {
      await expectRejected(
        client,
        `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
         values ($1, $2, now() + interval '1 day')`,
        [base.invitationId, notADigest],
        "rsvp_access_tokens_hash_is_a_sha256_digest",
      );
    }
  });

  it("permits at most one live token per invitation", async () => {
    await insertToken();
    await expectRejected(
      client,
      `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 day')`,
      [base.invitationId, "b".repeat(64)],
      "rsvp_access_tokens_one_live_per_invitation",
    );
  });

  it("lets a superseded or revoked token coexist with the live one", async () => {
    const first = await insertToken();
    await client.query(
      `update public.rsvp_access_tokens set revoked_at = now(), revoked_reason = 'Reissued'
        where id = $1`,
      [first],
    );
    // The whole history stays; only one of them is live.
    await expectAccepted(
      client,
      `insert into public.rsvp_access_tokens (invitation_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 day')`,
      [base.invitationId, "b".repeat(64)],
    );
  });

  it("refuses an unexplained revocation", async () => {
    const id = await insertToken();
    await expectRejected(
      client,
      "update public.rsvp_access_tokens set revoked_at = now() where id = $1",
      [id],
      "rsvp_access_tokens_revocation_is_explained",
    );
  });

  it("refuses a supersession that names no successor", async () => {
    const id = await insertToken();
    await expectRejected(
      client,
      "update public.rsvp_access_tokens set superseded_at = now() where id = $1",
      [id],
      "rsvp_access_tokens_supersession_is_paired",
    );
  });

  it("refuses a token that expires before it was issued", async () => {
    await expectRejected(
      client,
      `insert into public.rsvp_access_tokens (invitation_id, token_hash, issued_at, expires_at)
       values ($1, $2, now(), now() - interval '1 second')`,
      [base.invitationId, DIGEST],
      "rsvp_access_tokens_expires_after_issue",
    );
  });

  it("keeps the use count and the last-used time consistent", async () => {
    const id = await insertToken();
    await expectRejected(
      client,
      "update public.rsvp_access_tokens set use_count = 1 where id = $1",
      [id],
      "rsvp_access_tokens_use_is_dated",
    );
    await expectAccepted(
      client,
      "update public.rsvp_access_tokens set use_count = 1, last_used_at = now() where id = $1",
      [id],
    );
  });

  it("cannot be deleted by the server role", async () => {
    // The record that a link existed outlives the link. `delete` is not granted.
    const grants = await one<{ has: boolean }>(
      client,
      "select has_table_privilege('service_role', 'public.rsvp_access_tokens', 'delete') as has",
    );
    expect(grants.has).toBe(false);
  });
});

describe("delivery_attempts", () => {
  it("refuses the manual channel outright", async () => {
    const jobId = await insertJob();
    // Manual sending is not a delivery path in this slice, stated where no code
    // can talk its way around it.
    await expectRejected(
      client,
      `insert into public.delivery_attempts (notification_job_id, attempt_number, channel, provider)
       values ($1, 1, 'manual', 'somebody')`,
      [jobId],
      "delivery_attempts_are_never_manual",
    );
  });

  it("refuses an acceptance that names no provider message", async () => {
    const jobId = await insertJob();
    // Without the identifier a callback could never be matched, so the message
    // would sit at "attempted" forever.
    await expectRejected(
      client,
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider, accepted_at)
       values ($1, 1, 'whatsapp', 'meta_whatsapp_cloud', now())`,
      [jobId],
      "delivery_attempts_acceptance_names_its_message",
    );
  });

  it("permits many refused attempts, each with no identifier", async () => {
    const jobId = await insertJob();
    for (const attempt of [1, 2]) {
      await expectAccepted(
        client,
        `insert into public.delivery_attempts
           (notification_job_id, attempt_number, channel, provider, concluded_at, failure_reason)
         values ($1, $2, 'whatsapp', 'meta_whatsapp_cloud', now(), 'refused')`,
        [jobId, attempt],
      );
    }
  });

  it("permits one attempt to own a provider message identifier", async () => {
    const jobId = await insertJob();
    await expectAccepted(
      client,
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider, provider_message_id, accepted_at)
       values ($1, 1, 'whatsapp', 'meta_whatsapp_cloud', 'wamid.SCHEMA', now())`,
      [jobId],
    );
    await expectRejected(
      client,
      `insert into public.delivery_attempts
         (notification_job_id, attempt_number, channel, provider, provider_message_id, accepted_at)
       values ($1, 2, 'whatsapp', 'meta_whatsapp_cloud', 'wamid.SCHEMA', now())`,
      [jobId],
      "delivery_attempts_provider_message_unique",
    );
  });
});

describe("delivery_callbacks", () => {
  it("refuses to store anything whose signature did not verify", async () => {
    // The route verifies before it parses, and this is what makes that provable
    // by reading rows rather than by reading code.
    await expectRejected(
      client,
      `insert into public.delivery_callbacks
         (provider, provider_event_id, signature_verified, applied_at)
       values ('meta_whatsapp_cloud', 'evt-1', false, now())`,
      [],
      "delivery_callbacks_are_verified_before_they_are_stored",
    );
  });

  it("deduplicates on the provider's own event identifier", async () => {
    await expectAccepted(
      client,
      `insert into public.delivery_callbacks
         (provider, provider_event_id, signature_verified, applied_at)
       values ('meta_whatsapp_cloud', 'evt-dup', true, now())`,
    );
    await expectRejected(
      client,
      `insert into public.delivery_callbacks
         (provider, provider_event_id, signature_verified, applied_at)
       values ('meta_whatsapp_cloud', 'evt-dup', true, now())`,
      [],
      "delivery_callbacks_one_per_provider_event",
    );
  });

  it("requires an unapplied callback to say why it was not applied", async () => {
    await expectRejected(
      client,
      `insert into public.delivery_callbacks
         (provider, provider_event_id, signature_verified)
       values ('meta_whatsapp_cloud', 'evt-silent', true)`,
      [],
      "delivery_callbacks_unapplied_is_explained",
    );
  });

  it("is append-only by privilege", async () => {
    for (const privilege of ["update", "delete"]) {
      const granted = await one<{ has: boolean }>(
        client,
        `select has_table_privilege('service_role', 'public.delivery_callbacks', $1) as has`,
        [privilege],
      );
      expect(granted.has, `service_role should not hold ${privilege}`).toBe(false);
    }
  });
});

describe("the access posture", () => {
  it.each(["rsvp_access_tokens", "delivery_attempts", "delivery_callbacks"])(
    "%s has RLS enabled and no policy",
    async (table) => {
      const row = await one<{ enabled: boolean; policies: string }>(
        client,
        `select c.relrowsecurity as enabled,
                (select count(*)::text from pg_policy p where p.polrelid = c.oid) as policies
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = $1`,
        [table],
      );
      expect(row.enabled).toBe(true);
      expect(row.policies).toBe("0");
    },
  );

  it.each(["rsvp_access_tokens", "delivery_attempts", "delivery_callbacks"])(
    "%s grants a browser-facing role nothing at all",
    async (table) => {
      const rows = await client.query<{ grantee: string; privilege_type: string }>(
        `select grantee, privilege_type from information_schema.role_table_grants
          where table_schema = 'public' and table_name = $1
            and grantee in ('anon', 'authenticated')`,
        [table],
      );
      expect(rows.rows).toEqual([]);
    },
  );
});
