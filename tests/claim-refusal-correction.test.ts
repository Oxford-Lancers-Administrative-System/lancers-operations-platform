// @vitest-environment node
/**
 * LAN-483 — the one-off correction Brian runs against hosted for messages the
 * scheduler refused at claim time before those refusals were recorded as final
 * (`scripts/pilot/lan-483/finalise-claim-time-refusals.sql`), proved against
 * the local database with synthetic rows.
 *
 * The script corrects every matching result in the database it runs against,
 * so it never runs here outside a transaction: its own `begin;` and `commit;`
 * are stripped, and each case is rolled back.
 *
 * In `tests/` rather than beside the service because no file under `src/` may
 * name the pilot directory (`tests/pilot-data-contract.test.ts`).
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { openLocalClient, type Client } from "./helpers/domain-fixture";

const root = resolve(import.meta.dirname, "..");
const SCRIPT = join(root, "scripts", "pilot", "lan-483", "finalise-claim-time-refusals.sql");

const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.DATABASE_URL);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but the local database is not configured.");
}

const MARKER = "LAN483Fixture:claim-refusal-correction";
const REFUSAL = "This recruit has already supplied this track's completing set (fixture).";
const PROVIDER_FAILURE = "The provider could not deliver this message (fixture).";

let client: Client;

/**
 * One failed job with one attempt and its result. A claim-time refusal is
 * requested and concluded in one instant and never accepted; a provider failure
 * is requested before the call and concluded after it.
 */
async function failedJob(
  tag: string,
  shape: "claim_refusal" | "provider_failure",
): Promise<string> {
  const person = await client.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  const reason = shape === "claim_refusal" ? REFUSAL : PROVIDER_FAILURE;
  const job = await client.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, person_id, channel, attempt_count, last_error)
     values ($1, 'other', 'failed', $2, 'whatsapp', 1, $3) returning id`,
    [`${MARKER}:${tag}`, person.rows[0].id, reason],
  );
  const jobId = job.rows[0].id;
  await client.query(
    `insert into public.delivery_attempts
       (notification_job_id, attempt_number, channel, provider, requested_at,
        concluded_at, failure_reason)
     values ($1, 1, 'whatsapp', 'whatsapp_cloud',
             case when $2 then now() else now() - interval '2 seconds' end, now(), $3)`,
    [jobId, shape === "claim_refusal", reason],
  );
  await client.query(
    `insert into public.delivery_results
       (notification_job_id, attempt_number, outcome, channel, provider, detail)
     values ($1, 1, 'failed', 'whatsapp', 'whatsapp_cloud', $2)`,
    [jobId, reason],
  );
  return jobId;
}

async function outcomeOf(jobId: string): Promise<string> {
  const result = await client.query<{ outcome: string }>(
    "select outcome::text as outcome from public.delivery_results where notification_job_id = $1",
    [jobId],
  );
  return result.rows[0].outcome;
}

async function runCorrection(): Promise<void> {
  const sql = readFileSync(SCRIPT, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "begin;" && line.trim() !== "commit;")
    .join("\n");
  await client.query(sql);
}

describe("the LAN-483 correction script's shape", () => {
  it("is one transaction that opens with a preflight and closes with a commit", () => {
    const sql = readFileSync(SCRIPT, "utf8");
    const statements = sql
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("--"));
    expect(statements[0]).toBe("begin;");
    expect(statements.at(-1)).toBe("commit;");
    expect(sql).toMatch(/do \$preflight\$/);
    expect(sql).toMatch(/raise exception/);
    // Writes delivery_results.outcome and nothing else.
    expect(sql).not.toMatch(/\b(insert into|delete from|alter table|grant)\b/i);
    expect([...sql.matchAll(/\bupdate\s+public\.(\w+)/gi)].map((match) => match[1])).toEqual([
      "delivery_results",
    ]);
  });
});

describe.runIf(configured)("the LAN-483 correction, against the local database", () => {
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

  it("finalises a claim-time refusal and leaves a provider failure retryable", async () => {
    const refused = await failedJob("refused", "claim_refusal");
    const providerFailed = await failedJob("provider", "provider_failure");

    await runCorrection();

    expect(await outcomeOf(refused)).toBe("rejected");
    expect(await outcomeOf(providerFailed)).toBe("failed");
  });

  it("changes nothing the second time", async () => {
    const refused = await failedJob("twice", "claim_refusal");
    await runCorrection();
    const after = await client.query<{ outcome: string }>(
      "select outcome::text as outcome from public.delivery_results order by id",
    );

    await runCorrection();

    const again = await client.query<{ outcome: string }>(
      "select outcome::text as outcome from public.delivery_results order by id",
    );
    expect(again.rows).toEqual(after.rows);
    expect(await outcomeOf(refused)).toBe("rejected");
  });
});
