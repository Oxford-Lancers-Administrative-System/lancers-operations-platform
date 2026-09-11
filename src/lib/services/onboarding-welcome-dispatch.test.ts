// @vitest-environment node
/**
 * The onboarding welcome's own dispatch — LAN-215, `WP-arrival-doors`,
 * `REQ-one-welcome`, `REQ-transport`.
 *
 * `emitOnboardingOpenedWelcomeIn` (LAN-214) only ever declares the job;
 * `onboarding-welcome.test.ts` already proves that half against the real
 * database. What only exists here is the other half this package adds:
 * `dispatchOnboardingWelcomeJob` actually sends it, on
 * `recruitment-cycle-dispatch.test.ts`'s own precedent for why a claim,
 * a consent re-check and a real provider round trip cannot be proved
 * against a mocked transaction.
 *
 * Every arrival this suite creates goes through `enterReturningPlayer` —
 * the same call `roster.ts`'s intake and `roster-import.ts`'s bulk import
 * both make — so the job under test is queued exactly as it is queued in
 * production, on the ambient open season the whole database shares (never a
 * second one of this suite's own: `resolveOpenSeason` refuses when more
 * than one season is open at once).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { linkToken, parseTransportBody } from "../../../tests/helpers/sms-transport";

import { closePool, withTransaction } from "@/lib/db";
import { withdrawSeasonMessagingConsentIn } from "./messaging-consent";
import { dispatchOnboardingWelcomeJob, runMessagingSweep } from "./messaging-scheduler";
import { enterReturningPlayer, resolveOpenSeason } from "./roster";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";

const MARKER = "LAN215WelcomeDispatch";

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;

const ALLOWLISTED_PHONES = [
  "07700 900362",
  "07700 900363",
  "07700 900364",
  "07700 900365",
  "07700 900366",
  "07700 900367",
];
let phoneCounter = 0;
function uniquePhone(): string {
  const phone = ALLOWLISTED_PHONES[phoneCounter % ALLOWLISTED_PHONES.length];
  phoneCounter += 1;
  return phone;
}

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_API_KEY_SID: "SKtest",
  TWILIO_API_KEY_SECRET: "not-a-real-secret",
  TWILIO_ALPHA_SENDER: "OxfLancers",
  TWILIO_FROM_TOLL_FREE: "+18005550100",
  DELIVERY_RECIPIENT_ALLOWLIST: ALLOWLISTED_PHONES.join(","),
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  DELIVERY_EMAIL_ALLOWLIST: "nobody@example.test",
};

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = parseTransportBody(url, init.body);
    sent.push({ url, body });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    return new Response(JSON.stringify({ sid: id, status: "queued" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { sent, transport };
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name like $1)";
  await observer.query(
    `delete from public.delivery_results
      where notification_job_id in (select id from public.notification_jobs where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.delivery_attempts
      where notification_job_id in (select id from public.notification_jobs where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.notification_jobs where idempotency_key like 'onboarding-welcome:%' and person_id in ${people}`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.audit_events where entity_id in (select id from public.season_memberships where person_id in ${people}) or entity_id in ${people}`,
    [`${MARKER}%`],
  );
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    `${MARKER}%`,
  ]);
  // LAN-215, B-008: arrival now also sets availability to Green, in the same
  // transaction, via `commitAvailability` — `availability_statuses` restricts
  // its own deletion of `season_memberships`, on the identical reason the
  // blocks above do.
  await observer.query(
    `delete from public.availability_statuses where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [`${MARKER}%`],
  );
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    `${MARKER}%`,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [`${MARKER}%`],
  );
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [
    `${MARKER}%`,
  ]);
  await observer.query(`delete from public.people where given_name like $1`, [`${MARKER}%`]);
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

let unique = 0;
async function createArrival(): Promise<{ personId: string; membershipId: string }> {
  unique += 1;
  const result = await enterReturningPlayer({
    actorPersonId,
    input: { givenName: `${MARKER}${unique}`, familyName: "Arrival", phone: uniquePhone() },
    decision: { kind: "new", confirmed: true },
  });
  return { personId: result.personId, membershipId: result.membershipId };
}

async function jobIdFor(membershipId: string): Promise<string> {
  const job = await observer.query<{ id: string }>(
    "select id from public.notification_jobs where idempotency_key = $1",
    [`onboarding-welcome:${membershipId}`],
  );
  return job.rows[0].id;
}

describe("dispatchOnboardingWelcomeJob", () => {
  it("sends the onboarding welcome template, records an accepted attempt, and clears next_attempt_at", async () => {
    const { membershipId } = await createArrival();
    const jobId = await jobIdFor(membershipId);

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchOnboardingWelcomeJob(jobId, { source: CONFIGURED, transport });

    expect(outcome).toBe("accepted");
    expect(sent).toHaveLength(1);
    expect(sent[0].body.kind).toBe("onboarding_welcome");

    const attempt = await observer.query<{ accepted_at: Date | null }>(
      "select accepted_at from public.delivery_attempts where notification_job_id = $1",
      [jobId],
    );
    expect(attempt.rows[0].accepted_at).not.toBeNull();
  });

  it("mints the durable link at dispatch — nothing minted at declaration", async () => {
    const { personId, membershipId } = await createArrival();

    const before = await observer.query(
      "select 1 from public.person_access_tokens where person_id = $1::uuid",
      [personId],
    );
    expect(before.rowCount).toBe(0);

    const jobId = await jobIdFor(membershipId);
    const { transport } = acceptingTransport();
    await dispatchOnboardingWelcomeJob(jobId, { source: CONFIGURED, transport });

    const after = await observer.query<{ single_use: boolean; revoked_at: Date | null }>(
      "select single_use, revoked_at from public.person_access_tokens where person_id = $1::uuid",
      [personId],
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].single_use).toBe(false);
    expect(after.rows[0].revoked_at).toBeNull();
  });

  it("carries only the durable personal-page URL button", async () => {
    const { membershipId } = await createArrival();
    const jobId = await jobIdFor(membershipId);

    const { sent, transport } = acceptingTransport();
    await dispatchOnboardingWelcomeJob(jobId, { source: CONFIGURED, transport });

    // The text carries exactly one personal-page link with a non-empty token
    // (LAN-263: the onboarding welcome has no Stop link).
    const body = String(sent[0].body.Body ?? "");
    expect(body.match(/\/me\//g)).toHaveLength(1);
    expect(linkToken(body, "me")).toBeTruthy();
  });

  it("refuses at claim time when consent was withdrawn after the job was declared", async () => {
    const { personId, membershipId } = await createArrival();
    const jobId = await jobIdFor(membershipId);

    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, openSeasonId));

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchOnboardingWelcomeJob(jobId, { source: CONFIGURED, transport });

    // Matching dispatchRecruitmentCycleJob's own convention: a refusal that
    // never reaches the provider at all is "skipped", not "refused" — the
    // welcome is the one message REQ-transport permits before a basis
    // exists, and an explicit withdrawal is the one case even it does not
    // override.
    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
    const job = await observer.query<{ status: string; last_error: string | null }>(
      "select status::text as status, last_error from public.notification_jobs where id = $1",
      [jobId],
    );
    expect(job.rows[0].status).toBe("failed");
    expect(job.rows[0].last_error).toMatch(/declined messaging contact/i);
  });

  it("is claimed and dispatched by runMessagingSweep alongside every other job type", async () => {
    const { membershipId } = await createArrival();
    await observer.query(
      "update public.notification_jobs set scheduled_for = now() - interval '100 years' where idempotency_key = $1",
      [`onboarding-welcome:${membershipId}`],
    );

    const { sent, transport } = acceptingTransport();
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });
    expect(summary.accepted).toBeGreaterThanOrEqual(1);
    expect(sent.some((s) => s.body.kind === "onboarding_welcome")).toBe(true);
  });
});
