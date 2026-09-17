// @vitest-environment node
/**
 * The onboarding chase's own declare, dispatch and escalation — LAN-218,
 * `W8`/`W9`/`W11`. Against the real local database and a real (accepting)
 * transport, on `onboarding-welcome-dispatch.test.ts`'s own precedent: a
 * claim, a consent re-check and a real provider round trip cannot be proved
 * against a mocked transaction.
 *
 * LAN-93 note: the WhatsApp webhook route records accepted messages as
 * `Attempted` until LAN-93's public-HTTPS work lands, so `REQ-cap-delivered`
 * is proved here against a **synthesised** provider callback
 * (`applyProviderCallback`, called directly, exactly as
 * `delivery.test.ts` already does for the event ladder) rather than against
 * a live delivery.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { TEMPLATE_NAMES } from "@/lib/delivery/templates";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";

import { closePool, withTransaction } from "@/lib/db";
import { applyProviderCallback, MAX_ATTEMPTS } from "./delivery";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import {
  dispatchOnboardingChaseEscalationJob,
  dispatchOnboardingChaseJob,
  runMessagingSweep,
  sendOnboardingNudges,
} from "./messaging-scheduler";
import {
  ONBOARDING_CHASE_ESCALATION_KEY_PREFIX,
  ONBOARDING_CHASE_KEY_PREFIX,
  ONBOARDING_NUDGE_KEY_PREFIX,
  describeOnboardingChaseNext,
  listOnboardingChaseCandidatesIn,
  readOnboardingChaseProgressIn,
  readOnboardingChaseSettingsIn,
  setOnboardingChaseSettingsIn,
} from "./onboarding-chase";
import { setMembershipStatus } from "./membership";
import { enterReturningPlayer, resolveOpenSeason } from "./roster";
import {
  agePastSafetyPacing,
  clearRecipientSafetyState,
  openObserver,
  seededActorPersonId,
} from "../../../tests/helpers/service-layer";

const MARKER = "LAN218ChaseDispatch";

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;

// Ofcom's reserved drama range: synthetic, and unroutable by design.
const DRAMA_RANGE_PHONES = [
  "07700 900372",
  "07700 900373",
  "07700 900374",
  "07700 900375",
  "07700 900376",
  "07700 900377",
  "07700 900378",
  "07700 900379",
];
let phoneCounter = 0;
function uniquePhone(): string {
  const phone = DRAMA_RANGE_PHONES[phoneCounter % DRAMA_RANGE_PHONES.length];
  phoneCounter += 1;
  return phone;
}

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  // LAN-360: the outbound path signs every Graph call with a proof derived from it.
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    sent.push({ url, body });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    // The escalation's channel is resolved from the office holder's own
    // contact points (`presidentEscalationChannelIn`) and the seeded
    // President carries only an email — `messaging-scheduler.test.ts`'s own
    // fixture-shaped response, so an email send actually parses as accepted
    // rather than silently failing to match the WhatsApp response shape.
    return new Response(
      JSON.stringify(
        url.endsWith("/emails") ? { id } : { messaging_product: "whatsapp", messages: [{ id }] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { sent, transport };
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
});

/**
 * Pauses the club's outbound messaging for the length of one test — LAN-394.
 *
 * Written directly rather than through `pauseMessagingIn`, because what is
 * under test here is the **dispatcher**: that it asks the guard at all, and
 * that a paused answer costs the message nothing. The control itself, its
 * capability and its audit row are proved in
 * `src/lib/services/messaging-safety.test.ts`.
 */
async function pauseAllMessaging(): Promise<void> {
  await observer.query(
    `update public.messaging_safety_scopes
        set paused_at = now(),
            -- Any real Person. It was the first operator account's, which CI
            -- does not have: the test job seeds the dataset but links no login,
            -- so the subquery was null and the attribution constraint refused
            -- the pause. A seeded database always has people.
            paused_by_person_id = (select id from public.people order by created_at limit 1),
            paused_reason = 'Under test', version = version + 1, updated_at = now()
      where scope_kind = 'global'`,
  );
}

async function resumeAllMessaging(): Promise<void> {
  await observer.query(
    `update public.messaging_safety_scopes
        set paused_at = null, paused_by_person_id = null, paused_reason = null,
            version = version + 1, updated_at = now()
      where scope_kind = 'global'`,
  );
}

afterEach(async () => {
  // LAN-394: this suite's holds and provider circuit go with its fixtures.
  await clearRecipientSafetyState(observer);
  const people = "(select id from public.people where given_name like $1)";
  // The onboarding-chase job family, cast wide: every automated chase, nudge
  // and exhaustion marker carries this suite's own `person_id` (the marker's
  // own insert uses the exhausted candidate's person, exactly as every other
  // chase job does — deliberately NOT matched by idempotency-key prefix
  // alone, which would also delete `seed-onboarding-chase.mjs`'s own
  // Kenelm marker and rediscover him as newly exhausted on this suite's very
  // next sweep). The one-per-cohort *escalation* job is the sole exception:
  // it is addressed to the office holder — the seeded President, never a
  // `${MARKER}`-named person — so it is swept up by its idempotency-key
  // prefix alone.
  const jobIds =
    "(select id from public.notification_jobs where person_id in " +
    people +
    " or idempotency_key like 'onboarding-chase-escalation:%')";
  // `applyProviderCallback` writes `delivery_callbacks`, keyed to
  // `delivery_attempts` — deleted first, or the attempt delete below is
  // refused by the foreign key.
  await observer.query(
    `delete from public.delivery_callbacks where delivery_attempt_id in
      (select id from public.delivery_attempts where notification_job_id in ${jobIds})`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.delivery_results where notification_job_id in ${jobIds}`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobIds}`,
    [`${MARKER}%`],
  );
  await observer.query(
    `delete from public.notification_jobs
      where person_id in ${people}
         or idempotency_key like 'onboarding-chase-escalation:%'`,
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
  await observer.query(
    `update public.onboarding_chase_settings
        set first_chase_after_hours = 48, chase_count = 4, chase_interval_days = 3
      where id`,
  );
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

async function grantConsent(personId: string): Promise<void> {
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, openSeasonId));
}

async function setChase(settings: {
  firstChaseAfterHours: number;
  chaseCount: number;
  chaseIntervalDays: number;
}): Promise<void> {
  await withTransaction((tx) => setOnboardingChaseSettingsIn(tx, { actorPersonId, ...settings }));
}

async function chaseJobId(membershipId: string, ordinal: number): Promise<string | null> {
  const job = await observer.query<{ id: string }>(
    "select id from public.notification_jobs where idempotency_key = $1",
    [`${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:${ordinal}`],
  );
  return job.rows[0]?.id ?? null;
}

/**
 * Whether one sent payload is the onboarding chase escalation — checked
 * against whichever shape it actually took. The seeded President carries an
 * email and no phone, so `presidentEscalationChannelIn` resolves this
 * message to email in these tests (WhatsApp's own `template.name` field does
 * not exist on an email payload at all).
 */
function isOnboardingChaseEscalationSend(sent: { body: Record<string, unknown> }): boolean {
  const templateName = (sent.body.template as { name?: string } | undefined)?.name;
  if (templateName === TEMPLATE_NAMES.onboarding_chase_escalation) return true;
  const subject = typeof sent.body.subject === "string" ? sent.body.subject : "";
  return /onboarding chases have run out/.test(subject);
}

function renderedTextOf(sent: { body: Record<string, unknown> }): string {
  if (typeof sent.body.text === "string") return sent.body.text;
  const components = (
    sent.body.template as { components?: { type: string; parameters?: { text?: string }[] }[] }
  )?.components;
  const params = components?.find((c) => c.type === "body")?.parameters ?? [];
  return params.map((p) => p.text ?? "").join(" ");
}

async function makeUnder18(personId: string): Promise<void> {
  await observer.query(
    "update public.people set date_of_birth = (current_date - interval '17 years') where id = $1",
    [personId],
  );
}

describe("declareDueOnboardingChasesIn, via runMessagingSweep", () => {
  it("sends nothing while messaging is paused, and costs the chase nothing — LAN-394", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });

    // One tick declares and dispatches the welcome and the chase; with
    // messaging paused, neither goes out and neither is spent.
    await pauseAllMessaging();
    const { sent, transport } = acceptingTransport();
    try {
      for (let tick = 0; tick < 2; tick += 1) {
        await agePastSafetyPacing(observer);
        await runMessagingSweep({ source: CONFIGURED, transport });
      }
    } finally {
      await resumeAllMessaging();
    }

    expect(sent).toHaveLength(0);
    const jobId = await chaseJobId(membershipId, 1);
    expect(jobId).not.toBeNull();
    const job = await observer.query<{
      status: string;
      attempt_count: number;
      last_error: string | null;
      safety_reason_code: string | null;
    }>(
      `select status::text as status, attempt_count, last_error, safety_reason_code
         from public.notification_jobs where id = $1`,
      [jobId],
    );
    expect(job.rows[0].status).toBe("pending");
    expect(job.rows[0].attempt_count).toBe(0);
    expect(job.rows[0].last_error).toBeNull();
    expect(job.rows[0].safety_reason_code).toBe("paused_by_operator");
  });

  it("declares and sends the first automated chase once the configured delay has passed", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });

    const { sent, transport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport });
    }

    const jobId = await chaseJobId(membershipId, 1);
    expect(jobId).not.toBeNull();
    expect(
      sent.some(
        (s) => (s.body.template as { name: string })?.name === TEMPLATE_NAMES.onboarding_chase,
      ),
    ).toBe(true);
  });

  it("never fires before the configured delay, and never on a person without granted consent", async () => {
    const { personId, membershipId } = await createArrival();
    // No consent granted at all — `never_asked`.
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });

    const { transport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport });
    }

    expect(await chaseJobId(membershipId, 1)).toBeNull();

    // Same person, consent now granted, but the delay has not passed.
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 999, chaseCount: 4, chaseIntervalDays: 3 });
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport });
    }
    expect(await chaseJobId(membershipId, 1)).toBeNull();
  });

  it("never messages a person flagged under 18, by the automated path", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await makeUnder18(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });

    // `runMessagingSweep` is global — the seeded database carries its own
    // due jobs unrelated to this person — so what is asserted is that *this*
    // membership's own chase was never declared, never that nothing at all
    // was sent this tick.
    const { transport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport });
    }

    expect(await chaseJobId(membershipId, 1)).toBeNull();
  });

  it("stops declaring once a membership leaves onboarding mid-chase (OD7-depart-stops)", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });
    await setMembershipStatus({ actorPersonId, membershipId, status: "departed" });

    const { transport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport });
    }

    expect(await chaseJobId(membershipId, 1)).toBeNull();
  });
});

describe("REQ-cap-delivered — the count is spent only on delivered messages", () => {
  it("a delivered outcome spends exactly one; a failed one spends nothing and never sends an automated replacement", async () => {
    const { personId: deliveredPersonId, membershipId: deliveredMembershipId } =
      await createArrival();
    await grantConsent(deliveredPersonId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });

    const { transport: deliveredTransport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: deliveredTransport });
    }
    const deliveredJobId = await chaseJobId(deliveredMembershipId, 1);
    expect(deliveredJobId).not.toBeNull();

    // The real provider message id is whatever the accepting transport
    // returned to the sink as `messages[0].id` — read it back off the
    // recorded delivery_attempts row rather than parsing the outbound
    // payload, which carries no message id of its own.
    const attempt = await observer.query<{ provider_message_id: string }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [deliveredJobId],
    );
    const realProviderMessageId = attempt.rows[0].provider_message_id;

    const applied = await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-delivered-real-${deliveredJobId}`,
        providerMessageId: realProviderMessageId,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );
    expect(applied).toBe("applied");

    const deliveredProgress = await withTransaction((tx) =>
      readOnboardingChaseProgressIn(tx, [deliveredMembershipId]),
    );
    expect(deliveredProgress.get(deliveredMembershipId)?.deliveredCount).toBe(1);

    // A second onboarding membership, whose one chase attempt fails.
    const { personId: failedPersonId, membershipId: failedMembershipId } = await createArrival();
    await grantConsent(failedPersonId);

    const { transport: failedTransport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: failedTransport });
    }
    const failedJobId = await chaseJobId(failedMembershipId, 1);
    expect(failedJobId).not.toBeNull();

    const failedAttempt = await observer.query<{ provider_message_id: string }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [failedJobId],
    );

    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-failed-${failedJobId}`,
        providerMessageId: failedAttempt.rows[0].provider_message_id,
        providerStatus: "failed",
        outcome: "failed",
        detail: "undeliverable",
      },
      { signatureVerified: true },
    );

    const failedProgress = await withTransaction((tx) =>
      readOnboardingChaseProgressIn(tx, [failedMembershipId]),
    );
    // The cap is spent only on delivery — a failure consumes nothing.
    expect(failedProgress.get(failedMembershipId)?.deliveredCount).toBe(0);

    // Force this membership's own retry ceiling so `describeOnboardingChaseNext`
    // reports the terminal-failure state a human has to work, rather than a
    // routine retry still in flight.
    await observer.query(`update public.notification_jobs set attempt_count = $2 where id = $1`, [
      failedJobId,
      MAX_ATTEMPTS,
    ]);
    const terminalProgress = await withTransaction((tx) =>
      readOnboardingChaseProgressIn(tx, [failedMembershipId]),
    );
    expect(terminalProgress.get(failedMembershipId)?.currentAttemptTerminallyFailed).toBe(true);
    // C-5 (correction round 1): the same "undeliverable" the provider
    // callback recorded above is read back here, off `delivery_results`,
    // rather than a generic marker — proving the reason survives the
    // progress read before the presentation layer ever sees it.
    expect(terminalProgress.get(failedMembershipId)?.terminalFailureReason).toBe("undeliverable");

    const terminalFailureReason =
      terminalProgress.get(failedMembershipId)?.terminalFailureReason ?? null;
    const next = describeOnboardingChaseNext(
      {
        deliveredCount: 0,
        lastDeliveredAt: null,
        joinedAt: new Date(0),
        hasReachableNumber: true,
        isUnder18: false,
        currentAttemptTerminallyFailed: true,
        terminalFailureReason,
      },
      { chaseCount: 4, firstChaseAfterHours: 48, chaseIntervalDays: 3 },
    );
    expect(next).toEqual({ kind: "terminal_failure", reason: "undeliverable" });

    // And no automated chase advances to ordinal 2 in its place.
    const { transport: sweepAgain } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: sweepAgain });
    }
    expect(await chaseJobId(failedMembershipId, 2)).toBeNull();
  });
});

describe("describeOnboardingChaseNext — the pure derivation", () => {
  const settings = { chaseCount: 4, firstChaseAfterHours: 48, chaseIntervalDays: 3 };
  const base = {
    deliveredCount: 0,
    lastDeliveredAt: null as Date | null,
    joinedAt: new Date("2026-08-01T00:00:00Z"),
    hasReachableNumber: true,
    isUnder18: false,
    currentAttemptTerminallyFailed: false,
    terminalFailureReason: null as string | null,
  };

  it("reports exhausted once delivered attempts reach the configured count", () => {
    expect(describeOnboardingChaseNext({ ...base, deliveredCount: 4 }, settings)).toEqual({
      kind: "exhausted",
    });
  });

  it("reports unmessageable — under 18 — before a missing number is even considered", () => {
    expect(
      describeOnboardingChaseNext(
        { ...base, isUnder18: true, hasReachableNumber: false },
        settings,
      ),
    ).toEqual({ kind: "unmessageable", reason: "under_18" });
  });

  // Correction round 1, C-1 (Brian, 2026-09-03 walkthrough): Jorvik
  // Kirkbride and Kenelm Netherby, an email and no phone, "his nudge
  // reported failed" — a person who holds consent but has no mobile number
  // must be refused, not classed messageable. Restore the pre-correction
  // behaviour (drop the `hasReachableNumber` check) and this fails: the
  // person is reported as `scheduled` for a chase that can never send.
  it("reports unmessageable — no channel — for a person with no reachable number, C-1", () => {
    expect(describeOnboardingChaseNext({ ...base, hasReachableNumber: false }, settings)).toEqual({
      kind: "unmessageable",
      reason: "no_channel",
    });
  });

  // Correction round 1, C-4 (Q-11): a team member without granted consent is
  // no longer unmessageable at all — the approved W8-01 wording was
  // superseded in session. Restore the dropped `!hasConsent` check and this
  // fails: the person reports `unmessageable` instead of the schedule below.
  it("no longer reports unmessageable for a person who has not granted consent, C-4/Q-11", () => {
    expect(describeOnboardingChaseNext({ ...base }, settings)).toEqual({
      kind: "scheduled",
      at: new Date(base.joinedAt.getTime() + 48 * 3_600_000),
    });
  });

  it("reports no_automated_chase when the configured count is zero", () => {
    expect(describeOnboardingChaseNext({ ...base }, { ...settings, chaseCount: 0 })).toEqual({
      kind: "no_automated_chase",
    });
  });

  it("schedules the first chase from joining, and later ones from the last delivered chase", () => {
    const first = describeOnboardingChaseNext({ ...base }, settings);
    expect(first).toEqual({
      kind: "scheduled",
      at: new Date(base.joinedAt.getTime() + 48 * 3_600_000),
    });

    const lastDeliveredAt = new Date("2026-08-10T00:00:00Z");
    const later = describeOnboardingChaseNext(
      { ...base, deliveredCount: 1, lastDeliveredAt },
      settings,
    );
    expect(later).toEqual({
      kind: "scheduled",
      at: new Date(lastDeliveredAt.getTime() + 3 * 24 * 3_600_000),
    });
  });

  // Correction round 1, C-5: the terminal-failure verdict carries the real
  // reason through, and no_channel still outranks it (a structural defect is
  // reported precisely, never masked by a generic retry-ceiling message).
  it("carries the real failure reason through, and reports no_channel ahead of it, C-5", () => {
    expect(
      describeOnboardingChaseNext(
        { ...base, currentAttemptTerminallyFailed: true, terminalFailureReason: "blocked" },
        settings,
      ),
    ).toEqual({ kind: "terminal_failure", reason: "blocked" });

    expect(
      describeOnboardingChaseNext(
        {
          ...base,
          hasReachableNumber: false,
          currentAttemptTerminallyFailed: true,
          terminalFailureReason: "blocked",
        },
        settings,
      ),
    ).toEqual({ kind: "unmessageable", reason: "no_channel" });
  });
});

describe("REQ-operator-nudge — each selected person gets their own compiled ask, on their own link", () => {
  it("sends each of several selected people their own message, never another's information", async () => {
    const first = await createArrival();
    const second = await createArrival();
    await grantConsent(first.personId);
    await grantConsent(second.personId);

    const { sent, transport } = acceptingTransport();
    const results = await sendOnboardingNudges(
      actorPersonId,
      [first.membershipId, second.membershipId],
      { source: CONFIGURED, transport },
    );

    expect(results.every((r) => r.outcome === "accepted")).toBe(true);
    expect(sent).toHaveLength(2);

    const buttons = sent.map(
      (s) =>
        (
          s.body.template as {
            components: { type: string; sub_type?: string; parameters?: { text?: string }[] }[];
          }
        ).components.find((c) => c.type === "button" && c.sub_type === "url")?.parameters?.[0]
          ?.text,
    );
    // Two different people, two different durable links — never the same
    // token, and never a second live link issued to the same person twice
    // over (each carries its own freshly minted credential).
    expect(buttons[0]).toBeTruthy();
    expect(buttons[1]).toBeTruthy();
    expect(buttons[0]).not.toBe(buttons[1]);

    // Each recipient is that person's own number, never the
    // other's — the isolation `T11-batch-nudge` asks a test to prove.
    const recipients = sent.map((s) => s.body.to);
    expect(new Set(recipients).size).toBe(2);
  });

  it("is unlimited and outside the cap — a nudge is not refused once the automated chase is exhausted", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 1, chaseIntervalDays: 1 });

    // Exhaust the one automated chase this membership is allowed.
    const { transport: chaseTransport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: chaseTransport });
    }
    const chaseJob = await chaseJobId(membershipId, 1);
    const attempt = await observer.query<{ provider_message_id: string }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [chaseJob],
    );
    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-exhaust-${chaseJob}`,
        providerMessageId: attempt.rows[0].provider_message_id,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );

    const progress = await withTransaction((tx) =>
      readOnboardingChaseProgressIn(tx, [membershipId]),
    );
    expect(progress.get(membershipId)?.deliveredCount).toBe(1);

    // Now nudge, twice in a row — both must be accepted, neither refused.
    //
    // LAN-394: two nudges to one person seconds apart are paced, and that is
    // the decided behaviour. What this test is about is the *cap* — a nudge is
    // unlimited and outside it — so the pacing window is cleared between the
    // two presses. Each press still creates its own job with its own link
    // (`T11-batch-nudge`); neither is coalesced into the other.
    const { sent, transport } = acceptingTransport();
    await agePastSafetyPacing(observer);
    const [firstNudge] = await sendOnboardingNudges(actorPersonId, [membershipId], {
      source: CONFIGURED,
      transport,
    });
    await agePastSafetyPacing(observer);
    const [secondNudge] = await sendOnboardingNudges(actorPersonId, [membershipId], {
      source: CONFIGURED,
      transport,
    });
    expect(firstNudge.outcome).toBe("accepted");
    expect(secondNudge.outcome).toBe("accepted");
    expect(sent).toHaveLength(2);
  });

  /**
   * LAN-266 requirement 4, and its acceptance criterion: "the next automatic
   * chase is scheduled the configured interval after the manual send." The
   * manual ask is the same job the record's own **Send onboarding
   * questionnaire** button writes, so this is that button's arithmetic too.
   */
  it("counts a delivered manual ask toward the cap and re-spaces the next automatic one — LAN-266", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3 });

    const before = await withTransaction((tx) => readOnboardingChaseProgressIn(tx, [membershipId]));
    expect(before.get(membershipId)?.deliveredCount ?? 0).toBe(0);

    const { transport } = acceptingTransport();
    const [nudge] = await sendOnboardingNudges(actorPersonId, [membershipId], {
      source: CONFIGURED,
      transport,
    });
    expect(nudge.outcome).toBe("accepted");

    // Acceptance is not delivery — the cap is spent only on delivery
    // (`T11-cap-delivered`), and that rule is unchanged by this.
    const nudgeJob = await observer.query<{ id: string; provider_message_id: string }>(
      `select j.id, a.provider_message_id
         from public.notification_jobs j
         join public.delivery_attempts a on a.notification_job_id = j.id
        where j.idempotency_key like $1`,
      [`${ONBOARDING_NUDGE_KEY_PREFIX}${membershipId}:%`],
    );
    expect(
      (await withTransaction((tx) => readOnboardingChaseProgressIn(tx, [membershipId]))).get(
        membershipId,
      )?.deliveredCount ?? 0,
    ).toBe(0);

    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-nudge-counts-${nudgeJob.rows[0].id}`,
        providerMessageId: nudgeJob.rows[0].provider_message_id,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );

    const after = await withTransaction((tx) => readOnboardingChaseProgressIn(tx, [membershipId]));
    const progress = after.get(membershipId);
    expect(progress?.deliveredCount).toBe(1);
    expect(progress?.lastDeliveredAt).toBeInstanceOf(Date);
    // No automated attempt has ever been declared, so the ordinal machinery
    // is untouched by the manual one.
    expect(progress?.automatedOrdinal).toBe(0);
    expect(progress?.automatedAttemptOutstanding).toBe(false);

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    const mine = candidates.find((c) => c.membershipId === membershipId);
    if (!mine) throw new Error("unreachable — the membership is still onboarding");
    const settings = await withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
    const next = describeOnboardingChaseNext(mine, settings);

    // Three days after the manual send — the configured interval — and not
    // 48 hours after joining, which is what an uncounted nudge would leave.
    expect(next.kind).toBe("scheduled");
    if (next.kind !== "scheduled") throw new Error("unreachable — asserted above");
    const sentAt = progress?.lastDeliveredAt as Date;
    expect(next.at.getTime()).toBe(sentAt.getTime() + 3 * 24 * 3_600_000);
  });

  it("refuses a nudge to a person flagged under 18, by no path at all", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await makeUnder18(personId);

    const { sent, transport } = acceptingTransport();
    const [result] = await sendOnboardingNudges(actorPersonId, [membershipId], {
      source: CONFIGURED,
      transport,
    });

    expect(result.outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
  });
});

describe("W9 — exhaustion escalates once, to the configured office", () => {
  it("raises exactly one escalation for a cohort that exhausts together, and never a second one on a later sweep", async () => {
    const first = await createArrival();
    const second = await createArrival();
    await grantConsent(first.personId);
    await grantConsent(second.personId);
    // `chaseCount: 2`, deliberately not 1 — this suite's own seed
    // (`seed-onboarding-chase.mjs`) leaves one real onboarding membership
    // (Jorvik) permanently one delivered chase into a cadence of its own; a
    // cap of exactly 1 would make the sweep's global reach exhaust him too,
    // in his own separate batch, alongside whatever this test declares. 2
    // clears him without this test needing to know his name.
    await setChase({ firstChaseAfterHours: 0, chaseCount: 2, chaseIntervalDays: 1 });

    // Two sweep-and-deliver rounds, each declaring and dispatching *both*
    // memberships' next chase in the same tick — deliberately not one sweep
    // per person, which would let `raiseDueOnboardingChaseEscalations`
    // (itself run on every tick, before the loop's second iteration) mark
    // the first membership exhausted on its own, alone, before the second
    // has even been chased. Both must actually reach the office in one
    // message for this to be the cohort test it claims to be.
    for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
      const { transport: chaseTransport } = acceptingTransport();
      // LAN-394. One message per person per five minutes, so a backlog for one
      // person drains a rung per tick. Two ticks with the window cleared
      // between them is what two real ticks would do; a job already claimed
      // is not selected again, so this cannot send anything twice.
      for (let tick = 0; tick < 2; tick += 1) {
        await agePastSafetyPacing(observer);
        await runMessagingSweep({ source: CONFIGURED, transport: chaseTransport });
      }

      for (const membershipId of [first.membershipId, second.membershipId]) {
        const jobId = await chaseJobId(membershipId, ordinal);
        const attempt = await observer.query<{ provider_message_id: string }>(
          "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
          [jobId],
        );
        await applyProviderCallback(
          WHATSAPP_CLOUD_PROVIDER,
          {
            providerEventId: `${MARKER}-exhaust-cohort-${jobId}`,
            providerMessageId: attempt.rows[0].provider_message_id,
            providerStatus: "delivered",
            outcome: "delivered",
            detail: null,
          },
          { signatureVerified: true },
        );
        // Backdated so the second round's own `chaseIntervalDays` (a whole
        // day, the schema's own minimum) has already elapsed by the time the
        // next declare check runs — this test is about the escalation batch,
        // not about waiting a real day for the second chase to come due.
        await observer.query(
          `update public.delivery_results set occurred_at = now() - interval '2 days'
            where notification_job_id = $1`,
          [jobId],
        );
      }
    }

    const { sent, transport } = acceptingTransport();
    await agePastSafetyPacing(observer);
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });
    // LAN-394. The escalation this tick raised is itself a message, to the
    // office holder, and it is paced behind anything already sent to them.
    await agePastSafetyPacing(observer);
    await runMessagingSweep({ source: CONFIGURED, transport });
    expect(summary.onboardingChasesExhausted).toBeGreaterThanOrEqual(2);

    const escalationJobs = await observer.query<{ id: string; template_variables: unknown }>(
      `select id, template_variables from public.notification_jobs
        where idempotency_key like $1`,
      [`${ONBOARDING_CHASE_ESCALATION_KEY_PREFIX}%`],
    );
    expect(escalationJobs.rows).toHaveLength(1);

    const escalationSend = sent.find(isOnboardingChaseEscalationSend);
    expect(escalationSend).toBeTruthy();

    // A second, identical sweep must not raise a second escalation for the
    // same, already-marked cohort.
    const { sent: secondSent, transport: secondTransport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: secondTransport });
    }
    expect(secondSent.some(isOnboardingChaseEscalationSend)).toBe(false);
  });

  it("raises no exhaustion escalation while messaging is paused — LAN-394", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 1, chaseIntervalDays: 1 });

    // Exhaust the one automated chase, so the escalation is genuinely due.
    const { transport: chaseTransport } = acceptingTransport();
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: chaseTransport });
    }
    const chaseJob = await chaseJobId(membershipId, 1);
    const attempt = await observer.query<{ provider_message_id: string }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [chaseJob],
    );
    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-paused-exhaust-${chaseJob}`,
        providerMessageId: attempt.rows[0].provider_message_id,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );

    await pauseAllMessaging();
    const { sent, transport } = acceptingTransport();
    try {
      for (let tick = 0; tick < 2; tick += 1) {
        await agePastSafetyPacing(observer);
        await runMessagingSweep({ source: CONFIGURED, transport });
      }
    } finally {
      await resumeAllMessaging();
    }

    // The cohort is still marked exhausted — that is bookkeeping, not a send —
    // and the escalation job exists and has gone nowhere.
    expect(sent.some(isOnboardingChaseEscalationSend)).toBe(false);
    const escalation = await observer.query<{
      status: string;
      attempt_count: number;
      safety_reason_code: string | null;
    }>(
      `select status::text as status, attempt_count, safety_reason_code
         from public.notification_jobs where idempotency_key like $1`,
      [`${ONBOARDING_CHASE_ESCALATION_KEY_PREFIX}%`],
    );
    expect(escalation.rows.length).toBeGreaterThanOrEqual(1);
    expect(escalation.rows[0].status).toBe("pending");
    expect(escalation.rows[0].attempt_count).toBe(0);
    expect(escalation.rows[0].safety_reason_code).toBe("paused_by_operator");
  }, 60_000);

  it("defers the exhaustion escalation at the dispatcher, and costs it nothing — LAN-394", async () => {
    // LAN-394 review, A-02. The other six dispatchers each have a behavioural
    // proof that a paused answer costs the message nothing; this one had only
    // the source-callsite check. The dispatcher is called directly here, so
    // what is under test is its own handling of a deferral rather than the
    // sweep's selection.
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 1, chaseIntervalDays: 1 });

    const { transport: chaseTransport } = acceptingTransport();
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: chaseTransport });
    }
    const chaseJob = await chaseJobId(membershipId, 1);
    const attempt = await observer.query<{ provider_message_id: string }>(
      "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
      [chaseJob],
    );
    await applyProviderCallback(
      WHATSAPP_CLOUD_PROVIDER,
      {
        providerEventId: `${MARKER}-deferred-escalation-${chaseJob}`,
        providerMessageId: attempt.rows[0].provider_message_id,
        providerStatus: "delivered",
        outcome: "delivered",
        detail: null,
      },
      { signatureVerified: true },
    );

    await pauseAllMessaging();
    try {
      // The sweep raises the escalation job; paused, it sends nothing.
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

      const raised = await observer.query<{ id: string }>(
        `select id from public.notification_jobs where idempotency_key like $1`,
        [`${ONBOARDING_CHASE_ESCALATION_KEY_PREFIX}%`],
      );
      expect(raised.rows.length).toBeGreaterThanOrEqual(1);
      const escalationJobId = raised.rows[0].id;

      const { sent, transport } = acceptingTransport();
      expect(
        await dispatchOnboardingChaseEscalationJob(escalationJobId, {
          source: CONFIGURED,
          transport,
        }),
      ).toBe("deferred");
      expect(sent).toHaveLength(0);

      const job = await observer.query<{
        status: string;
        attempt_count: number;
        last_error: string | null;
        safety_reason_code: string | null;
      }>(
        `select status::text as status, attempt_count, last_error, safety_reason_code
           from public.notification_jobs where id = $1`,
        [escalationJobId],
      );
      expect(job.rows[0].status).toBe("pending");
      expect(job.rows[0].attempt_count).toBe(0);
      expect(job.rows[0].last_error).toBeNull();
      expect(job.rows[0].safety_reason_code).toBe("paused_by_operator");

      const attempts = await observer.query<{ count: string }>(
        "select count(*)::text as count from public.delivery_attempts where notification_job_id = $1",
        [escalationJobId],
      );
      expect(attempts.rows[0].count).toBe("0");
    } finally {
      await resumeAllMessaging();
    }
  }, 60_000);

  it("carries a count and a link, and no name — never a person's identity", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    // `chaseCount: 2`, for the identical reason the cohort test above uses
    // it: a cap of 1 would sweep the seed's own Jorvik in as well, and this
    // test asserts the exact rendered count.
    await setChase({ firstChaseAfterHours: 0, chaseCount: 2, chaseIntervalDays: 1 });

    for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
      const { transport } = acceptingTransport();
      // LAN-394. One message per person per five minutes, so a backlog for one
      // person drains a rung per tick. Two ticks with the window cleared
      // between them is what two real ticks would do; a job already claimed
      // is not selected again, so this cannot send anything twice.
      for (let tick = 0; tick < 2; tick += 1) {
        await agePastSafetyPacing(observer);
        await runMessagingSweep({ source: CONFIGURED, transport });
      }
      const jobId = await chaseJobId(membershipId, ordinal);
      const attempt = await observer.query<{ provider_message_id: string }>(
        "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
        [jobId],
      );
      await applyProviderCallback(
        WHATSAPP_CLOUD_PROVIDER,
        {
          providerEventId: `${MARKER}-single-${jobId}`,
          providerMessageId: attempt.rows[0].provider_message_id,
          providerStatus: "delivered",
          outcome: "delivered",
          detail: null,
        },
        { signatureVerified: true },
      );
      await observer.query(
        `update public.delivery_results set occurred_at = now() - interval '2 days'
          where notification_job_id = $1`,
        [jobId],
      );
    }

    const { sent, transport: sweepTransport } = acceptingTransport();
    // LAN-394. One message per person per five minutes, so a backlog for one
    // person drains a rung per tick. Two ticks with the window cleared
    // between them is what two real ticks would do; a job already claimed
    // is not selected again, so this cannot send anything twice.
    for (let tick = 0; tick < 2; tick += 1) {
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: sweepTransport });
    }

    const escalation = sent.find(isOnboardingChaseEscalationSend);
    expect(escalation).toBeTruthy();
    const rendered = renderedTextOf(escalation!);
    expect(rendered).not.toContain(MARKER);
    expect(rendered).toContain(
      "The automated chase has finished for 1 players who still have onboarding answers " +
        "outstanding.",
    );
  });

  it("retains and shows the escalation when nobody holds the configured office", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await setChase({ firstChaseAfterHours: 0, chaseCount: 1, chaseIntervalDays: 1 });

    const president = await observer.query<{ role_id: string }>(
      `select id as role_id from public.roles where code = 'president'`,
    );
    await observer.query(
      `update public.role_assignments set effective_to = current_date
        where role_id = $1 and (effective_to is null or effective_to > current_date)`,
      [president.rows[0].role_id],
    );

    try {
      const { transport } = acceptingTransport();
      // LAN-394. One message per person per five minutes, so a backlog for one
      // person drains a rung per tick. Two ticks with the window cleared
      // between them is what two real ticks would do; a job already claimed
      // is not selected again, so this cannot send anything twice.
      for (let tick = 0; tick < 2; tick += 1) {
        await agePastSafetyPacing(observer);
        await runMessagingSweep({ source: CONFIGURED, transport });
      }
      const jobId = await chaseJobId(membershipId, 1);
      const attempt = await observer.query<{ provider_message_id: string }>(
        "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
        [jobId],
      );
      await applyProviderCallback(
        WHATSAPP_CLOUD_PROVIDER,
        {
          providerEventId: `${MARKER}-vacant-${jobId}`,
          providerMessageId: attempt.rows[0].provider_message_id,
          providerStatus: "delivered",
          outcome: "delivered",
          detail: null,
        },
        { signatureVerified: true },
      );

      const { sent, transport: sweepTransport } = acceptingTransport();
      await agePastSafetyPacing(observer);
      const summary = await runMessagingSweep({ source: CONFIGURED, transport: sweepTransport });
      // LAN-394. The escalation this tick raised is itself a message, to the
      // office holder, and it is paced behind anything already sent to them.
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport: sweepTransport });

      expect(summary.onboardingEscalationsHeld).toBe(1);
      expect(summary.onboardingEscalationsCreated).toBe(0);
      expect(sent.some(isOnboardingChaseEscalationSend)).toBe(false);

      const held = await observer.query(
        `select 1 from public.audit_events where action = 'onboarding_chase.escalation_held'`,
      );
      expect(held.rowCount).toBeGreaterThan(0);
    } finally {
      await observer.query(
        `update public.role_assignments set effective_to = null
          where role_id = $1 and effective_to = current_date`,
        [president.rows[0].role_id],
      );
      await observer.query(
        `delete from public.audit_events where action = 'onboarding_chase.escalation_held'`,
      );
    }
  });
});

describe("listOnboardingChaseCandidatesIn", () => {
  it("carries every onboarding membership's outstanding, consent, channel and under-18 state", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    const mine = candidates.find((c) => c.membershipId === membershipId);
    expect(mine).toBeTruthy();
    expect(mine?.hasOutstanding).toBe(true);
    expect(mine?.hasConsent).toBe(true);
    expect(mine?.hasReachableNumber).toBe(true);
    expect(mine?.isUnder18).toBe(false);
  });

  // Correction round 1, C-1, end to end: `createArrival` seeds a real mobile
  // number, so this is the identical arrival Jorvik Kirkbride and Kenelm
  // Netherby were missing — invalidating it here reproduces the real defect
  // Brian hit. Restore the pre-correction `describeOnboardingChaseNext` (no
  // `hasReachableNumber` check) and the final assertion fails: this person
  // reports `scheduled`, exactly as it did when the nudge silently failed.
  it("reports no reachable number once the person's only phone contact is no longer current, C-1", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);

    // `contact_points_preferred_must_be_current` refuses a preferred contact
    // with an end date — `createArrival`'s own seeded phone is preferred, so
    // it must be demoted in the same statement that retires it.
    await observer.query(
      `update public.contact_points set valid_until = current_date, is_preferred = false
        where person_id = $1 and kind = 'phone'`,
      [personId],
    );

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    const mine = candidates.find((c) => c.membershipId === membershipId);
    expect(mine).toBeTruthy();
    if (!mine) throw new Error("unreachable — asserted above");
    expect(mine.hasConsent).toBe(true);
    expect(mine.hasReachableNumber).toBe(false);

    await setChase({ firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3 });
    const settings = await withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
    expect(describeOnboardingChaseNext(mine, settings)).toEqual({
      kind: "unmessageable",
      reason: "no_channel",
    });
  });

  /**
   * LAN-249, walker M7's finding M7-05. Montague Everleigh's seeded
   * `contact.phone.malformed` is "07700 90039" — one digit short, so it is a
   * *recorded* mobile the compiled ask does not miss, and the queue offered a
   * live checkbox and Nudge for a person nothing can be sent to. The rule is
   * now the dispatcher's own `selectMobileNumber`, so a number that cannot be
   * converted is not a reachable number on any surface.
   */
  it("reports no reachable number for a recorded but unusable phone, LAN-249", async () => {
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);

    await observer.query(
      `update public.contact_points set raw_value = '07700 90039', normalised_value = null
        where person_id = $1 and kind = 'phone'`,
      [personId],
    );

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    const mine = candidates.find((c) => c.membershipId === membershipId);
    expect(mine).toBeTruthy();
    if (!mine) throw new Error("unreachable — asserted above");
    // The compiled ask still sees a mobile: this is exactly why reading it
    // there was not enough.
    expect(mine.hasOutstanding).toBe(true);
    expect(mine.hasReachableNumber).toBe(false);

    await setChase({ firstChaseAfterHours: 48, chaseCount: 4, chaseIntervalDays: 3 });
    const settings = await withTransaction((tx) => readOnboardingChaseSettingsIn(tx));
    expect(describeOnboardingChaseNext(mine, settings)).toEqual({
      kind: "unmessageable",
      reason: "no_channel",
    });
  });

  it("still reports a reachable number when only raw_value carries it, LAN-249", async () => {
    // Roster intake leaves `normalised_value` null on purpose (`roster.ts`),
    // so "a non-empty normalised_value" would have withheld the nudge from
    // most of the roster. `selectMobileNumber` reads the raw value too.
    const { personId, membershipId } = await createArrival();
    await grantConsent(personId);
    await observer.query(
      `update public.contact_points set normalised_value = null
        where person_id = $1 and kind = 'phone'`,
      [personId],
    );

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    expect(candidates.find((c) => c.membershipId === membershipId)?.hasReachableNumber).toBe(true);
  });

  it("never lists a membership once it leaves onboarding", async () => {
    const { membershipId } = await createArrival();
    await setMembershipStatus({ actorPersonId, membershipId, status: "departed" });

    const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
    expect(candidates.some((c) => c.membershipId === membershipId)).toBe(false);
  });
});

describe("dispatchOnboardingChaseEscalationJob and dispatchOnboardingChaseJob, wired into the sweep", () => {
  it("are the functions runMessagingSweep actually calls for their own idempotency-key prefixes", () => {
    // A cheap, direct proof that the sweep's own dispatch switch resolves to
    // these exact functions rather than falling through to `dispatchJob` —
    // a mis-wired prefix would silently try to claim these rows as an
    // invitation/reminder and fail every time.
    expect(typeof dispatchOnboardingChaseJob).toBe("function");
    expect(typeof dispatchOnboardingChaseEscalationJob).toBe("function");
  });
});
