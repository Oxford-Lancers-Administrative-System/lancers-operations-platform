// @vitest-environment node
/**
 * LAN-437: the onboarding chase counts only what the player can act on — the
 * same predicate the questionnaire page renders ("There is nothing left to
 * fill in"), never the five operator-owned items. Against the real local
 * database: the chase's declare gate, its dispatch-time re-check and its
 * exhaustion count all read the membership's live items.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";

import { closePool, withTransaction } from "@/lib/db";
import {
  agePastSafetyPacing,
  clearRecipientSafetyState,
  openObserver,
  seededActorPersonId,
} from "../../../tests/helpers/service-layer";
import { applyProviderCallback } from "./delivery";
import { generateOnboardingItems } from "./membership";
import { dispatchOnboardingChaseJob, runMessagingSweep } from "./messaging-scheduler";
import {
  ONBOARDING_CHASE_KEY_PREFIX,
  listOnboardingChaseCandidatesIn,
  setOnboardingChaseSettingsIn,
} from "./onboarding-chase";
import {
  agreeOnboardingDocument,
  claimTrustItem,
  readQuestionnaireView,
  saveDetailsStep,
} from "./player-questionnaire";
import { computePlayerOutstanding, readPlayerHasOutstandingIn } from "./player-questionnaire/read";
import { resolveOpenSeason } from "./roster";

const MARKER = "LAN437ChaseOutstanding";
const OPERATOR_ITEM_CODES = ["kit_sorted", "subs_invoiced", "subs_paid", "comms_groups", "photo"];

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;
const createdPersonIds: string[] = [];
const createdMembershipIds: string[] = [];
let counter = 0;

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_APP_SECRET: "not-a-real-app-secret",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
};

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(typeof init.body === "string" ? init.body : "{}") });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    return new Response(
      JSON.stringify(
        url.endsWith("/emails") ? { id } : { messaging_product: "whatsapp", messages: [{ id }] },
      ),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { sent, transport };
}

function unique(tag: string): string {
  counter += 1;
  return `${MARKER}-${tag}-${process.pid}-${counter}`;
}

/** A fresh onboarding membership in the open season with every item type generated. */
async function givenPlayer(): Promise<{ personId: string; membershipId: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Testcase') returning id`,
    [unique("Person")],
  );
  const personId = person.rows[0].id;
  createdPersonIds.push(personId);
  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on, created_at)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date, now() - interval '10 days')
     returning id`,
    [personId, openSeasonId],
  );
  const membershipId = membership.rows[0].id;
  createdMembershipIds.push(membershipId);
  await observer.query(
    `insert into public.season_membership_status_events
       (season_membership_id, from_status, to_status, actor_person_id)
     values ($1::uuid, null, 'onboarding', $2::uuid)`,
    [membershipId, actorPersonId],
  );
  await withTransaction((tx) => generateOnboardingItems(tx, membershipId, openSeasonId));
  return { personId, membershipId };
}

/** Everything the player's own questionnaire asks, answered — except what `leave` names. */
async function answerPlayerSide(
  personId: string,
  membershipId: string,
  leave: { codeOfConduct?: boolean } = {},
): Promise<void> {
  const result = await saveDetailsStep({
    personId,
    seasonId: openSeasonId,
    membershipId,
    grantConsent: true,
    fields: {
      given_name: "Daryan",
      family_name: "Testcase",
      college: "Brasenose",
      matriculation_year: "2024",
      expected_graduation_year: "2027",
      degree_field: "Engineering Science",
      student_number: "1234567",
      bafa_registration_number: "BAFA-1234",
      date_of_birth: "2005-03-14",
    },
    mobile: "07700 900381",
    collegeEmail: `${unique("player")}@balliol.ox.ac.uk`.toLowerCase(),
    personalEmail: `${unique("player")}@example.ox.ac.uk`.toLowerCase(),
    emergencyContact: {
      givenName: "Casey",
      familyName: "Testcase",
      relationship: "Parent",
      phone: "07700 900382",
      email: `${unique("ec")}@example.com`.toLowerCase(),
    },
  });
  expect(result.errors).toEqual({});
  if (!leave.codeOfConduct) await agreeCodeOfConduct(personId, membershipId);
  await agreeOnboardingDocument({
    personId,
    seasonId: openSeasonId,
    membershipId,
    agreementType: "photo_release",
    printedName: "Daryan Testcase",
  });
  await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });
  await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });
}

async function agreeCodeOfConduct(personId: string, membershipId: string): Promise<void> {
  await agreeOnboardingDocument({
    personId,
    seasonId: openSeasonId,
    membershipId,
    agreementType: "code_of_conduct",
  });
}

async function itemStatuses(membershipId: string): Promise<Record<string, string>> {
  const result = await observer.query<{ code: string; status: string }>(
    `select t.code, i.status::text as status
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
      where i.season_membership_id = $1::uuid`,
    [membershipId],
  );
  return Object.fromEntries(result.rows.map((row) => [row.code, row.status]));
}

async function chaseJob(
  membershipId: string,
  ordinal: number,
): Promise<{ id: string; status: string; last_error: string | null } | null> {
  const job = await observer.query<{ id: string; status: string; last_error: string | null }>(
    `select id, status::text as status, last_error from public.notification_jobs
      where idempotency_key = $1`,
    [`${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:${ordinal}`],
  );
  return job.rows[0] ?? null;
}

async function setChase(settings: {
  firstChaseAfterHours: number;
  chaseCount: number;
  chaseIntervalDays: number;
}): Promise<void> {
  await withTransaction((tx) => setOnboardingChaseSettingsIn(tx, { actorPersonId, ...settings }));
}

async function sweepTwice(transport: ReturnType<typeof acceptingTransport>["transport"]) {
  for (let tick = 0; tick < 2; tick += 1) {
    await agePastSafetyPacing(observer);
    await runMessagingSweep({ source: CONFIGURED, transport });
  }
}

async function candidateOutstanding(membershipId: string): Promise<boolean | undefined> {
  const candidates = await withTransaction((tx) => listOnboardingChaseCandidatesIn(tx));
  return candidates.find((c) => c.membershipId === membershipId)?.hasOutstanding;
}

beforeAll(async () => {
  observer = await openObserver();
  actorPersonId = await seededActorPersonId(observer);
  openSeasonId = (await withTransaction((tx) => resolveOpenSeason(tx))).id;
});

afterEach(async () => {
  await clearRecipientSafetyState(observer);
  await observer.query(
    `update public.onboarding_chase_settings
        set first_chase_after_hours = 48, chase_count = 4, chase_interval_days = 3
      where id`,
  );
  if (createdPersonIds.length === 0) return;
  const jobIds =
    "(select id from public.notification_jobs where person_id = any($1::uuid[]) or idempotency_key like 'onboarding-chase-escalation:%')";
  await observer.query(
    `delete from public.delivery_callbacks where delivery_attempt_id in
      (select id from public.delivery_attempts where notification_job_id in ${jobIds})`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.delivery_results where notification_job_id in ${jobIds}`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.delivery_attempts where notification_job_id in ${jobIds}`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.notification_jobs
      where person_id = any($1::uuid[]) or idempotency_key like 'onboarding-chase-escalation:%'`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.person_access_tokens where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.onboarding_item_history where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.onboarding_agreements where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.person_fact_disputes where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'onboarding_items'
       and entity_id in (select id from public.onboarding_items where season_membership_id = any($1::uuid[]))`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_id = any($1::uuid[]) or entity_id = any($2::uuid[])`,
    [createdMembershipIds, createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'contact_points'
       and entity_id in (select id from public.contact_points where person_id = any($1::uuid[]))`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.availability_statuses where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.season_membership_status_events where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(`delete from public.season_memberships where id = any($1::uuid[])`, [
    createdMembershipIds,
  ]);
  await observer.query(
    `delete from public.person_emergency_contacts where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.contact_points where person_id = any($1::uuid[])`, [
    createdPersonIds,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(`delete from public.people where id = any($1::uuid[])`, [createdPersonIds]);
  createdPersonIds.length = 0;
  createdMembershipIds.length = 0;
});

afterAll(async () => {
  await observer.end();
  await closePool();
});

describe("computePlayerOutstanding — the one predicate", () => {
  const complete = {
    missingRequiredFields: [],
    emergencyContact: {
      givenName: "Casey",
      familyName: "Testcase",
      relationship: null,
      phone: "07700 900382",
      email: "casey@example.com",
      recordedByPersonId: null,
      recordedAt: new Date(),
    },
    needsConsentStep: false,
    itemStatus: {
      code_of_conduct: "complete",
      photo_release: "complete",
      bucs_play: "claimed",
      hudl_access: "claimed",
    },
    agreements: { code_of_conduct: null, photo_release: null },
    trustClaimed: { bucs_play: false, hudl_access: false },
  } as const;

  it("has nothing outstanding once the four player items are complete or claimed", () => {
    const result = computePlayerOutstanding({ ...complete, missingRequiredFields: [] });
    expect(result.sections).toEqual([]);
    expect(result.nextStep).toBe("done");
  });

  it("still has the Code of Conduct outstanding while it is pending", () => {
    const result = computePlayerOutstanding({
      ...complete,
      missingRequiredFields: [],
      itemStatus: { ...complete.itemStatus, code_of_conduct: "pending" },
    });
    expect(result.sections.map((s) => s.section)).toEqual(["Code of Conduct"]);
    expect(result.nextStep).toBe("code_of_conduct");
  });

  it("still has a trust item outstanding until it is claimed", () => {
    const result = computePlayerOutstanding({
      ...complete,
      missingRequiredFields: [],
      itemStatus: { ...complete.itemStatus, hudl_access: "invited" },
    });
    expect(result.sections.map((s) => s.section)).toEqual(["Hudl"]);
  });
});

describe("the onboarding chase counts only what the player can act on — LAN-437", () => {
  it("does not chase a player whose only open items are the club's own", async () => {
    const { personId, membershipId } = await givenPlayer();
    await answerPlayerSide(personId, membershipId);

    const statuses = await itemStatuses(membershipId);
    for (const code of OPERATOR_ITEM_CODES) {
      if (code in statuses) expect(statuses[code]).toBe("pending");
    }
    expect(statuses.code_of_conduct).toBe("complete");
    expect(statuses.photo_release).toBe("complete");
    expect(statuses.bucs_play).toBe("claimed");
    expect(statuses.hudl_access).toBe("claimed");

    expect((await readQuestionnaireView(personId, openSeasonId))?.nothingOutstanding).toBe(true);
    expect(
      await withTransaction((tx) => readPlayerHasOutstandingIn(tx, personId, openSeasonId)),
    ).toBe(false);
    expect(await candidateOutstanding(membershipId)).toBe(false);

    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });
    await sweepTwice(acceptingTransport().transport);
    expect(await chaseJob(membershipId, 1)).toBeNull();
  });

  it("still chases a player whose Code of Conduct is pending", async () => {
    const { personId, membershipId } = await givenPlayer();
    await answerPlayerSide(personId, membershipId, { codeOfConduct: true });

    expect((await readQuestionnaireView(personId, openSeasonId))?.nothingOutstanding).toBe(false);
    expect(await candidateOutstanding(membershipId)).toBe(true);

    await setChase({ firstChaseAfterHours: 0, chaseCount: 4, chaseIntervalDays: 3 });
    await sweepTwice(acceptingTransport().transport);
    expect(await chaseJob(membershipId, 1)).not.toBeNull();
  });

  it("drops a chase declared before the player finished, at dispatch", async () => {
    const { personId, membershipId } = await givenPlayer();
    await answerPlayerSide(personId, membershipId, { codeOfConduct: true });
    // Declared exactly as the sweep declares it, then the player finishes before it goes.
    const inserted = await observer.query<{ id: string }>(
      `insert into public.notification_jobs
         (idempotency_key, job_type, status, person_id, channel, scheduled_for, template_variables)
       values ($1, 'other', 'pending', $2::uuid, 'whatsapp', now(), '{}'::jsonb)
       returning id`,
      [`${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:1`, personId],
    );
    await agreeCodeOfConduct(personId, membershipId);

    const { sent, transport } = acceptingTransport();
    await agePastSafetyPacing(observer);
    expect(
      await dispatchOnboardingChaseJob(inserted.rows[0].id, { source: CONFIGURED, transport }),
    ).toBe("skipped");
    expect(sent).toHaveLength(0);
    const job = await chaseJob(membershipId, 1);
    expect(job?.status).toBe("failed");
    expect(job?.last_error).toMatch(/nothing left to fill in/);
  });

  it("does not count a player who finished after the chase ran out as exhausted", async () => {
    const finished = await givenPlayer();
    const unfinished = await givenPlayer();
    await answerPlayerSide(finished.personId, finished.membershipId, { codeOfConduct: true });
    await answerPlayerSide(unfinished.personId, unfinished.membershipId, { codeOfConduct: true });
    await setChase({ firstChaseAfterHours: 0, chaseCount: 2, chaseIntervalDays: 1 });

    for (let ordinal = 1; ordinal <= 2; ordinal += 1) {
      const { transport } = acceptingTransport();
      await agePastSafetyPacing(observer);
      await runMessagingSweep({ source: CONFIGURED, transport, limit: 0 });
      for (const membershipId of [finished.membershipId, unfinished.membershipId]) {
        const job = await chaseJob(membershipId, ordinal);
        expect(job).not.toBeNull();
        // Dispatched directly: the seeded backlog would otherwise hold this tick's pacing.
        await agePastSafetyPacing(observer);
        await dispatchOnboardingChaseJob(job?.id ?? "", { source: CONFIGURED, transport });
        const attempt = await observer.query<{ provider_message_id: string }>(
          "select provider_message_id from public.delivery_attempts where notification_job_id = $1",
          [job?.id],
        );
        await applyProviderCallback(
          WHATSAPP_CLOUD_PROVIDER,
          {
            providerEventId: `${MARKER}-exhaust-${job?.id}`,
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
          [job?.id],
        );
      }
    }

    await agreeCodeOfConduct(finished.personId, finished.membershipId);
    await agePastSafetyPacing(observer);
    await runMessagingSweep({ source: CONFIGURED, transport: acceptingTransport().transport });

    const markers = await observer.query<{ idempotency_key: string }>(
      `select idempotency_key from public.notification_jobs
        where idempotency_key = any($1::text[])`,
      [
        [
          `onboarding-chase-exhausted:${finished.membershipId}`,
          `onboarding-chase-exhausted:${unfinished.membershipId}`,
        ],
      ],
    );
    expect(markers.rows.map((row) => row.idempotency_key)).toEqual([
      `onboarding-chase-exhausted:${unfinished.membershipId}`,
    ]);
  });
});
