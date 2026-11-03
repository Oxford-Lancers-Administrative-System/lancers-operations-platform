// @vitest-environment node
/**
 * LAN-524 — the one-off correction Brian runs against hosted
 * (`scripts/pilot/lan-524/correct-message-outcomes.sql`), proved against the
 * local database with synthetic rows.
 *
 * The script corrects every matching row in the database it runs against, so
 * it never runs here outside a transaction: its own `begin;` and `commit;` are
 * stripped, and each case is rolled back.
 *
 * In `tests/` rather than beside the service because no file under `src/` may
 * name the pilot directory (`tests/pilot-data-contract.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { terminalProviderReasons } from "@/lib/delivery/whatsapp-cloud";
import {
  DELIVERY_EXPIRED_REASON,
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
} from "@/lib/services/delivery";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const SCRIPT = join(root, "scripts", "pilot", "lan-524", "correct-message-outcomes.sql");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN524Fixture:message-outcome-correction";
const NOT_ON_WHATSAPP =
  "WhatsApp could not deliver to this number — it may not be a WhatsApp account.";
const PROVIDER_HICCUP = "The provider refused this message (code 131000) (fixture).";
const BEFORE_RECEIPTS = "2026-10-20T10:00:00Z";
const AFTER_RECEIPTS = "2026-11-01T10:00:00Z";

let client: Client;

interface Shape {
  readonly channel: "whatsapp" | "email";
  readonly status: "failed" | "processing";
  readonly acceptedAt: string;
  /** The result the attempt carries; `null` for none. */
  readonly result: { outcome: "failed"; detail: string } | null;
}

/** One job with one accepted attempt, in the shape a production row has. */
async function job(tag: string, shape: Shape): Promise<string> {
  const person = await client.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  const processing = shape.status === "processing";
  const inserted = await client.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, attempt_count, last_error,
        claimed_at, claimed_by)
     values ($1, 'other', $2::public.notification_job_status, $3, $4::public.notification_channel,
             1, $5, $6, $7)
     returning id`,
    [
      `${MARKER}:${tag}`,
      shape.status,
      person.rows[0].id,
      shape.channel,
      shape.result?.detail ?? null,
      processing ? shape.acceptedAt : null,
      processing ? "fixture" : null,
    ],
  );
  const jobId = inserted.rows[0].id;
  await client.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at, accepted_at,
        provider_message_id, concluded_at, failure_reason)
     values ($1, 1, $2::public.notification_channel, $3, $4::timestamptz, $4::timestamptz,
             $5, $6, $7)`,
    [
      jobId,
      shape.channel,
      shape.channel === "email" ? "resend" : "meta_whatsapp_cloud",
      shape.acceptedAt,
      `${MARKER}:${tag}:message`,
      shape.result ? shape.acceptedAt : null,
      shape.result?.detail ?? null,
    ],
  );
  if (shape.result) {
    await client.query(
      `insert into public.delivery_results
         (notification_job_id, attempt_number, outcome, channel, provider, detail)
       values ($1, 1, $2::public.delivery_outcome, $3::public.notification_channel, $4, $5)`,
      [
        jobId,
        shape.result.outcome,
        shape.channel,
        shape.channel === "email" ? "resend" : "meta_whatsapp_cloud",
        shape.result.detail,
      ],
    );
  }
  return jobId;
}

/** What the event screen, the person record and the Messaging queue read for this job. */
async function stateOf(jobId: string): Promise<string> {
  const result = await client.query<{ state: string }>(
    `select ${DELIVERY_STATE_EXPRESSION} as state
       from public.notification_jobs j
       ${DELIVERY_LATEST_RESULT_JOIN}
      where j.id = $1`,
    [jobId],
  );
  return result.rows[0].state;
}

async function runCorrection(): Promise<void> {
  const sql = readFileSync(SCRIPT, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "begin;" && line.trim() !== "commit;")
    .join("\n");
  await client.query(sql);
}

describe("the LAN-524 correction script's shape", () => {
  const sql = readFileSync(SCRIPT, "utf8");

  it("is one transaction that opens with a preflight and closes with a commit", () => {
    const statements = sql
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"));
    expect(statements[0]).toBe("begin;");
    expect(statements.at(-1)).toBe("commit;");
    expect(sql).toMatch(/do \$preflight\$/);
    expect(sql).toMatch(/raise exception/);
    expect(sql).not.toMatch(/\b(alter table|grant|create table public)\b/i);
  });

  it("names exactly the sentences the application stores for a terminal WhatsApp code", () => {
    const listed = [...sql.matchAll(/^\s+\('(.+)'\)[,;]$/gm)].map((match) =>
      match[1].replaceAll("''", "'"),
    );
    expect(listed.sort()).toEqual(terminalProviderReasons().sort());
  });

  it("matches the swept emails on the sweep's own sentence", () => {
    expect(sql).toContain(DELIVERY_EXPIRED_REASON);
  });
});

describe.runIf(configured)("the LAN-524 correction, against the local database", () => {
  beforeAll(async () => {
    client = await openLocalClient();
  });

  beforeEach(async () => {
    await client.query("begin");
  });

  afterEach(async () => {
    await client.query("rollback");
  });

  afterAll(async () => {
    await client?.end();
  });

  it("reads a not-on-WhatsApp receipt Failed and leaves a provider hiccup Retryable", async () => {
    const dead = await job("dead", {
      channel: "whatsapp",
      status: "failed",
      acceptedAt: AFTER_RECEIPTS,
      result: { outcome: "failed", detail: NOT_ON_WHATSAPP },
    });
    const hiccup = await job("hiccup", {
      channel: "whatsapp",
      status: "failed",
      acceptedAt: AFTER_RECEIPTS,
      result: { outcome: "failed", detail: PROVIDER_HICCUP },
    });
    expect(await stateOf(dead)).toBe("retryable");

    await runCorrection();

    expect(await stateOf(dead)).toBe("failed");
    expect(await stateOf(hiccup)).toBe("retryable");
  });

  it("returns an email the old sweep failed to Unknown", async () => {
    const swept = await job("swept", {
      channel: "email",
      status: "failed",
      acceptedAt: BEFORE_RECEIPTS,
      result: { outcome: "failed", detail: DELIVERY_EXPIRED_REASON },
    });
    expect(await stateOf(swept)).toBe("retryable");

    await runCorrection();

    expect(await stateOf(swept)).toBe("unknown");
  });

  it("reads an email sent before receipts Unknown and one sent after still Attempted", async () => {
    const before = await job("before", {
      channel: "email",
      status: "processing",
      acceptedAt: BEFORE_RECEIPTS,
      result: null,
    });
    const after = await job("after", {
      channel: "email",
      status: "processing",
      acceptedAt: AFTER_RECEIPTS,
      result: null,
    });
    expect(await stateOf(before)).toBe("attempted");

    await runCorrection();

    expect(await stateOf(before)).toBe("unknown");
    expect(await stateOf(after)).toBe("attempted");
  });

  it("leaves an unconfirmed WhatsApp send Attempted for the 30-day sweep", async () => {
    const pending = await job("whatsapp-open", {
      channel: "whatsapp",
      status: "processing",
      acceptedAt: BEFORE_RECEIPTS,
      result: null,
    });

    await runCorrection();

    expect(await stateOf(pending)).toBe("attempted");
  });

  it("changes nothing the second time", async () => {
    await job("twice-dead", {
      channel: "whatsapp",
      status: "failed",
      acceptedAt: AFTER_RECEIPTS,
      result: { outcome: "failed", detail: NOT_ON_WHATSAPP },
    });
    await job("twice-email", {
      channel: "email",
      status: "processing",
      acceptedAt: BEFORE_RECEIPTS,
      result: null,
    });
    const snapshot = () =>
      client.query(
        `select j.id, j.status, a.concluded_at, a.failure_reason, r.outcome
           from public.notification_jobs j
           join public.delivery_attempts a on a.notification_job_id = j.id
           left join public.delivery_results r on r.notification_job_id = j.id
          where j.idempotency_key like $1
          order by j.id`,
        [`${MARKER}:%`],
      );
    await runCorrection();
    const once = await snapshot();

    await runCorrection();

    expect((await snapshot()).rows).toEqual(once.rows);
  });
});
