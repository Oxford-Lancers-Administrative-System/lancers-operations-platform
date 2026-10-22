// @vitest-environment node
/**
 * Resend's delivery receipts — LAN-484.
 *
 * Against the real database for the reason the WhatsApp route's suite gives:
 * the question is whether a row appears, so an unverified request must leave
 * `delivery_callbacks` untouched, and a verified one must move the attempt's
 * job to the state every delivery surface reads (`DELIVERY_STATE_EXPRESSION`)
 * with no special case for email.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";
import type { Client } from "pg";

import { closePool } from "@/lib/db";
import { EMAIL_PROVIDER } from "@/lib/delivery/email";
import { DELIVERY_LATEST_RESULT_JOIN, DELIVERY_STATE_EXPRESSION } from "@/lib/services/delivery";
import { openObserver } from "../../../../../tests/helpers/service-layer";
import { MAX_CALLBACK_BYTES, POST } from "./route";

/** Test-only. A `whsec_` secret in Svix's shape; it signs nothing that exists. */
const SECRET_KEY = Buffer.from("lan484-route-suite-signing-key-not-real");
const SIGNING_SECRET = `whsec_${SECRET_KEY.toString("base64")}`;

/** Every row this suite writes carries it, so cleanup cannot overreach. */
const MARKER = "lan484-route-suite";

let observer: Client;

beforeAll(async () => {
  observer = await openObserver();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const jobs = "(select id from public.notification_jobs where idempotency_key like $1)";
  await observer.query("delete from public.delivery_callbacks where provider_event_id like $1", [
    `${MARKER}%`,
  ]);
  await observer.query(
    `delete from public.audit_events where entity_table = 'notification_jobs' and entity_id in ${jobs}`,
    [`${MARKER}%`],
  );
  await observer.query(`delete from public.delivery_results where notification_job_id in ${jobs}`, [
    `${MARKER}%`,
  ]);
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobs}`,
    [`${MARKER}%`],
  );
  await observer.query("delete from public.notification_jobs where idempotency_key like $1", [
    `${MARKER}%`,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

function configured(): void {
  vi.stubEnv("EMAIL_WEBHOOK_SECRET", SIGNING_SECRET);
}

/** An email Resend accepted and has said nothing about since: Attempted. */
async function acceptedEmail(tag: string): Promise<{ jobId: string; emailId: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name, created_at)
     values ($1, $2, now() + interval '100 years') returning id`,
    [MARKER, tag],
  );
  const emailId = `${MARKER}-email-${tag}-${crypto.randomUUID()}`;
  const job = await observer.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, attempt_count, claimed_at, claimed_by)
     values ($1, 'other', 'processing', $2, 'email', 1, now(), 'lan484-suite') returning id`,
    [`${MARKER}:${tag}:${crypto.randomUUID()}`, person.rows[0].id],
  );
  await observer.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, provider_message_id,
        requested_at, accepted_at)
     values ($1, 1, 'email', $2, $3, now(), now())`,
    [job.rows[0].id, EMAIL_PROVIDER, emailId],
  );
  return { jobId: job.rows[0].id, emailId };
}

async function stateOf(jobId: string): Promise<string> {
  const result = await observer.query<{ state: string }>(
    `select ${DELIVERY_STATE_EXPRESSION} as state
       from public.notification_jobs j
       ${DELIVERY_LATEST_RESULT_JOIN}
      where j.id = $1`,
    [jobId],
  );
  return result.rows[0].state;
}

function receipt(type: string, emailId: string): string {
  return JSON.stringify({
    type,
    created_at: "2026-10-19T09:00:00.000Z",
    data: { email_id: emailId, subject: "Synthetic" },
  });
}

function sign(body: string, id: string, timestamp: number, key: Buffer = SECRET_KEY): string {
  const digest = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`, "utf8")
    .digest("base64");
  return `v1,${digest}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function post(body: string, headers: Record<string, string>): Promise<Response> {
  return POST(
    new Request("https://lancers.example.org/api/webhooks/email", {
      method: "POST",
      headers,
      body,
    }),
  );
}

/** A correctly signed delivery of `body`, with a fresh `svix-id` unless one is given. */
function signedPost(body: string, id = `${MARKER}-${crypto.randomUUID()}`): Promise<Response> {
  const timestamp = nowSeconds();
  return post(body, {
    "svix-id": id,
    "svix-timestamp": String(timestamp),
    "svix-signature": sign(body, id, timestamp),
  });
}

async function callbackCount(): Promise<number> {
  const result = await observer.query<{ n: string }>(
    "select count(*)::text as n from public.delivery_callbacks where provider_event_id like $1",
    [`${MARKER}%`],
  );
  return Number(result.rows[0].n);
}

describe("POST — an unsigned, forged or stale request reaches nothing", () => {
  it.each([
    ["no signature headers at all", () => ({})],
    [
      "a signature from the wrong secret",
      (body: string, id: string, at: number) => ({
        "svix-id": id,
        "svix-timestamp": String(at),
        "svix-signature": sign(body, id, at, Buffer.from("some-other-key")),
      }),
    ],
    [
      "a signature for a different svix-id",
      (body: string, id: string, at: number) => ({
        "svix-id": id,
        "svix-timestamp": String(at),
        "svix-signature": sign(body, `${id}-other`, at),
      }),
    ],
    [
      "a signed request older than five minutes",
      (body: string, id: string) => {
        const stale = nowSeconds() - 6 * 60;
        return {
          "svix-id": id,
          "svix-timestamp": String(stale),
          "svix-signature": sign(body, id, stale),
        };
      },
    ],
    [
      "a signed request from the future",
      (body: string, id: string) => {
        const ahead = nowSeconds() + 6 * 60;
        return {
          "svix-id": id,
          "svix-timestamp": String(ahead),
          "svix-signature": sign(body, id, ahead),
        };
      },
    ],
  ])("refuses %s with 403 and writes nothing", async (_case, headersFor) => {
    configured();
    const { jobId, emailId } = await acceptedEmail("forged");
    const body = receipt("email.delivered", emailId);

    const before = await callbackCount();
    const response = await post(body, headersFor(body, `${MARKER}-forged`, nowSeconds()));

    expect(response.status).toBe(403);
    expect(await callbackCount()).toBe(before);
    expect(await stateOf(jobId)).toBe("attempted");
  });

  it("refuses a body that was tampered with after signing", async () => {
    configured();
    const { jobId, emailId } = await acceptedEmail("tampered");
    const id = `${MARKER}-tampered`;
    const at = nowSeconds();
    const signature = sign(receipt("email.delivered", emailId), id, at);

    const response = await post(receipt("email.bounced", emailId), {
      "svix-id": id,
      "svix-timestamp": String(at),
      "svix-signature": signature,
    });

    expect(response.status).toBe(403);
    expect(await stateOf(jobId)).toBe("attempted");
  });

  it("refuses everything when the deployment has no signing secret", async () => {
    vi.stubEnv("EMAIL_WEBHOOK_SECRET", "");
    const { emailId } = await acceptedEmail("unconfigured");

    const response = await signedPost(receipt("email.delivered", emailId));

    expect(response.status).toBe(503);
    expect(await callbackCount()).toBe(0);
  });

  it("refuses an oversized body outright", async () => {
    configured();
    const response = await signedPost("x".repeat(MAX_CALLBACK_BYTES + 1));
    expect(response.status).toBe(413);
  });
});

describe("POST — a verified receipt moves the email to its outcome", () => {
  it("reads Delivered once Resend reports it delivered", async () => {
    configured();
    const { jobId, emailId } = await acceptedEmail("delivered");

    const response = await signedPost(receipt("email.delivered", emailId));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 1, applied: 1 });
    expect(await stateOf(jobId)).toBe("delivered");
  });

  it.each(["email.bounced", "email.failed"])(
    "reads Failed, and never Retryable, on %s",
    async (type) => {
      configured();
      const { jobId, emailId } = await acceptedEmail(type.replace(".", "-"));

      const response = await signedPost(receipt(type, emailId));

      expect(response.status).toBe(200);
      expect(await stateOf(jobId)).toBe("failed");
      const result = await observer.query<{ outcome: string; detail: string }>(
        "select outcome::text as outcome, detail from public.delivery_results where notification_job_id = $1",
        [jobId],
      );
      expect(result.rows[0].outcome).toBe("rejected");
      // Provider-neutral wording, and nothing of the recipient's.
      expect(result.rows[0].detail).not.toMatch(/@|resend/i);
    },
  );

  it.each(["email.delivery_delayed", "email.complained", "email.opened"])(
    "acknowledges %s and changes nothing",
    async (type) => {
      configured();
      const { jobId, emailId } = await acceptedEmail(type.replace(".", "-"));

      const response = await signedPost(receipt(type, emailId));

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ received: 1, applied: 0 });
      expect(await stateOf(jobId)).toBe("attempted");
      expect(await callbackCount()).toBe(1);
    },
  );

  it("deduplicates by svix-id, so Svix's own retry applies nothing twice", async () => {
    configured();
    const { jobId, emailId } = await acceptedEmail("twice");
    const id = `${MARKER}-twice`;

    await signedPost(receipt("email.delivered", emailId), id);
    const again = await signedPost(receipt("email.delivered", emailId), id);

    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ received: 1, applied: 0 });
    expect(await callbackCount()).toBe(1);
    expect(await stateOf(jobId)).toBe("delivered");
  });

  it("keeps the first outcome authoritative when a bounce follows a delivery", async () => {
    configured();
    const { jobId, emailId } = await acceptedEmail("late-bounce");

    await signedPost(receipt("email.delivered", emailId));
    await signedPost(receipt("email.bounced", emailId));

    expect(await stateOf(jobId)).toBe("delivered");
  });

  it("acknowledges a receipt for an email it never sent", async () => {
    configured();
    const response = await signedPost(receipt("email.delivered", `${MARKER}-unknown-email`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: 1, applied: 0 });
  });

  it("acknowledges a signed body it cannot parse, rather than making Svix retry forever", async () => {
    configured();
    const response = await signedPost("{not json");
    expect(response.status).toBe(200);
    expect(await callbackCount()).toBe(0);
  });
});
