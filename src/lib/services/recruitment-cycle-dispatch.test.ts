// @vitest-environment node
/**
 * The recruitment cycle's declaration and dispatch — LAN-203, Brian
 * 2026-09-01 (W9a/W9b). Against the real local database, on the same
 * reasoning `recruitment-signup.test.ts` and `messaging-scheduler.test.ts`
 * already give: consent totality, the completion read, and the claim's
 * concurrency control all have to prove themselves against real rows and a
 * real `notification_jobs` constraint set, not a mocked transaction.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import type { EnvironmentSource } from "@/lib/delivery/config";
import { TEMPLATE_NAMES } from "@/lib/delivery/templates";

import { closePool, withTransaction } from "@/lib/db";
import { createDeliverySink, type SinkRecord } from "@/lib/delivery/local-sink";
import {
  grantSeasonMessagingConsentIn,
  withdrawSeasonMessagingConsentIn,
} from "./messaging-consent";
import {
  declareRecruitmentCycleJobsIn,
  QUESTIONNAIRE_B_COMPLETING_CODES,
  readRecruitmentCycleCompletionIn,
} from "./recruitment-cycle";
import { sendRecruitmentQuestionnaireIn } from "./recruitment-prospect";
import { dispatchRecruitmentCycleJob, runMessagingSweep } from "./messaging-scheduler";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN203CycleSuite";

let observer: Client;
let seasonId: string;
/** A real, seeded person — the actor for calls that need one, e.g. `sendRecruitmentQuestionnaireIn`. */
let operatorPersonId: string;

// Every test recruit's mobile is drawn from this fixed pool rather than a
// generated one, so it is always inside CONFIGURED's own allowlist below —
// a recipient a dispatch test needs to actually be permitted to send to.
const ALLOWLISTED_PHONES = [
  "07700 900322",
  "07700 900323",
  "07700 900324",
  "07700 900325",
  "07700 900326",
  "07700 900327",
  "07700 900328",
  "07700 900329",
];
let phoneCounter = 0;
function uniquePhone(): string {
  const phone = ALLOWLISTED_PHONES[phoneCounter % ALLOWLISTED_PHONES.length];
  phoneCounter += 1;
  return phone;
}

const CONFIGURED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "5550001",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
  DELIVERY_RECIPIENT_ALLOWLIST: ALLOWLISTED_PHONES.join(","),
  EMAIL_API_KEY: "not-a-real-key",
  EMAIL_FROM_ADDRESS: "Oxford Lancers <events@lancers.example.org>",
  DELIVERY_EMAIL_ALLOWLIST: "nobody@example.test",
};

function acceptingTransport() {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const body = JSON.parse(typeof init.body === "string" ? init.body : "{}");
    sent.push({ url, body });
    const id = `wamid.${MARKER}.${crypto.randomUUID()}`;
    return new Response(JSON.stringify({ messaging_product: "whatsapp", messages: [{ id }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { sent, transport };
}

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id],
  );
  seasonId = season.rows[0].id;
  operatorPersonId = anchor.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(
    `delete from public.recruitment_questionnaire_responses
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.delivery_results
      where notification_job_id in (select id from public.notification_jobs where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.delivery_attempts
      where notification_job_id in (select id from public.notification_jobs where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

/** A recruit with only a first name — the incomplete-welcome-track shape. */
async function incompleteRecruit(status: string = "identified"): Promise<string> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [MARKER, "Incomplete"],
    ),
  );
  const personId = person.rows[0].id;
  await withTransaction((tx) =>
    tx.query(
      `insert into public.recruitment_prospects (person_id, season_id, status, source)
       values ($1::uuid, $2::uuid, $3::public.prospect_status, 'other')`,
      [personId, seasonId, status],
    ),
  );
  return personId;
}

/** A recruit with a full welcome-track completing set: name and a mobile. */
async function completeWelcomeRecruit(status: string = "identified"): Promise<string> {
  const personId = await incompleteRecruit(status);
  await withTransaction((tx) =>
    tx.query(
      `insert into public.contact_points
         (person_id, kind, scope, raw_value, is_preferred, source, valid_from)
       values ($1::uuid, 'phone', null, $2, true, 'other', current_date)`,
      [personId, uniquePhone()],
    ),
  );
  return personId;
}

/**
 * A recruit whose family name is never supplied — the welcome track stays
 * incomplete (`readRecruitmentCycleCompletionIn` requires given name,
 * family name *and* mobile) even once `addMobile` runs on its own below.
 * `dispatchRecruitmentCycleJob`'s own completion re-check (LAN-203 fix,
 * Brian 2026-09-01) means a job declared while missing *only* a mobile
 * would, once that mobile arrives, read as complete and be skipped rather
 * than sent — the fixture `incompleteRecruit` cannot exercise an accepted
 * dispatch once a mobile is added post-declaration, so the two tests below
 * that need a real send after a later `addMobile` use this shape instead.
 */
async function firstNameOnlyRecruit(status: string = "identified"): Promise<string> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, null) returning id",
      [MARKER],
    ),
  );
  const personId = person.rows[0].id;
  await withTransaction((tx) =>
    tx.query(
      `insert into public.recruitment_prospects (person_id, season_id, status, source)
       values ($1::uuid, $2::uuid, $3::public.prospect_status, 'other')`,
      [personId, seasonId, status],
    ),
  );
  return personId;
}

async function addMobile(personId: string): Promise<void> {
  await withTransaction((tx) =>
    tx.query(
      `insert into public.contact_points
         (person_id, kind, scope, raw_value, is_preferred, source, valid_from)
       values ($1::uuid, 'phone', null, $2, true, 'other', current_date)`,
      [personId, uniquePhone()],
    ),
  );
}

async function grantConsent(personId: string): Promise<void> {
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
}

async function prospectIdFor(personId: string): Promise<string> {
  const row = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "select id from public.recruitment_prospects where person_id = $1::uuid and season_id = $2::uuid",
      [personId, seasonId],
    ),
  );
  return row.rows[0].id;
}

async function answerQuestionnaireB(prospectId: string, codes: readonly string[]): Promise<void> {
  for (const code of codes) {
    await withTransaction((tx) =>
      tx.query(
        `insert into public.recruitment_questionnaire_responses
           (prospect_id, questionnaire, question_code, answer_text)
         values ($1::uuid, 'football_background', $2, 'yes')`,
        [prospectId, code],
      ),
    );
  }
}

async function jobsFor(personId: string): Promise<{ idempotency_key: string; status: string }[]> {
  const result = await withTransaction((tx) =>
    tx.query<{ idempotency_key: string; status: string }>(
      "select idempotency_key, status::text as status from public.notification_jobs where person_id = $1::uuid order by idempotency_key",
      [personId],
    ),
  );
  return result.rows;
}

describe("readRecruitmentCycleCompletionIn", () => {
  it("reads welcomeStepComplete false with no mobile, true once one exists", async () => {
    const personId = await incompleteRecruit();
    const before = await withTransaction((tx) =>
      readRecruitmentCycleCompletionIn(tx, personId, null),
    );
    expect(before.welcomeStepComplete).toBe(false);

    await withTransaction((tx) =>
      tx.query(
        `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source, valid_from)
         values ($1::uuid, 'phone', null, $2, true, 'other', current_date)`,
        [personId, uniquePhone()],
      ),
    );
    const after = await withTransaction((tx) =>
      readRecruitmentCycleCompletionIn(tx, personId, null),
    );
    expect(after.welcomeStepComplete).toBe(true);
  });

  it("reads questionnaireBComplete only once B1-B5 are all answered directly — B6 never counts", async () => {
    const personId = await incompleteRecruit();
    const prospectId = await prospectIdFor(personId);

    const none = await withTransaction((tx) =>
      readRecruitmentCycleCompletionIn(tx, personId, prospectId),
    );
    expect(none.questionnaireBComplete).toBe(false);

    // B6 alone never completes it, however many times it is answered.
    await answerQuestionnaireB(prospectId, ["B6"]);
    const b6Only = await withTransaction((tx) =>
      readRecruitmentCycleCompletionIn(tx, personId, prospectId),
    );
    expect(b6Only.questionnaireBComplete).toBe(false);

    await answerQuestionnaireB(prospectId, QUESTIONNAIRE_B_COMPLETING_CODES);
    const complete = await withTransaction((tx) =>
      readRecruitmentCycleCompletionIn(tx, personId, prospectId),
    );
    expect(complete.questionnaireBComplete).toBe(true);
  });
});

describe("declareRecruitmentCycleJobsIn", () => {
  it("creates the welcome track (not the interest track) for a recruit with no consent record at all — LAN-204's fix for the consent deadlock", async () => {
    const personId = await incompleteRecruit();
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    // Before LAN-204 this recruit could never receive the one message that
    // lets them grant consent (Brian, 2026-09-02: "the fucking app is
    // deadlocked"). The welcome track carries that link and is now the one
    // exception — the interest track still needs consent already granted,
    // so it stays absent here.
    expect([...result.created].sort()).toEqual(["details_reminder", "welcome"]);
    const jobs = await jobsFor(personId);
    expect(jobs.map((j) => j.idempotency_key).sort()).toEqual(
      [
        `recruit-cycle:details_reminder:${personId}:${seasonId}`,
        `recruit-cycle:welcome:${personId}:${seasonId}`,
      ].sort(),
    );
  });

  // Also item 9's third negative — "a recruit whose status is declined
  // receives nothing at all" — proved here in its strongest form: nothing is
  // created even though consent is granted.
  it("creates nothing for a declined recruit, even with consent granted", async () => {
    const personId = await incompleteRecruit("declined");
    await grantConsent(personId);
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result).toEqual({ created: [], reason: "not_eligible" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });

  it("creates the welcome track only, for a recruit missing the welcome completing set with an answered questionnaire", async () => {
    const personId = await incompleteRecruit();
    await grantConsent(personId);
    const prospectId = await prospectIdFor(personId);
    await answerQuestionnaireB(prospectId, QUESTIONNAIRE_B_COMPLETING_CODES);

    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect([...result.created].sort()).toEqual(["details_reminder", "welcome"]);

    const jobs = await jobsFor(personId);
    expect(jobs.map((j) => j.idempotency_key)).toEqual([
      `recruit-cycle:details_reminder:${personId}:${seasonId}`,
      `recruit-cycle:welcome:${personId}:${seasonId}`,
    ]);
  });

  it("creates the questionnaire track only, for a recruit who already has the welcome completing set", async () => {
    const personId = await completeWelcomeRecruit();
    await grantConsent(personId);

    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect([...result.created].sort()).toEqual(["interest_ask", "interest_reminder"]);
    expect(await jobsFor(personId)).toHaveLength(2);
  });

  it("creates all four jobs when both tracks are incomplete and consent is granted", async () => {
    const personId = await incompleteRecruit();
    await grantConsent(personId);

    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result.created).toHaveLength(4);
    expect(await jobsFor(personId)).toHaveLength(4);
  });

  it("creates nothing once both tracks are already complete — completion stops the cycle (Brian, 2026-09-01)", async () => {
    const personId = await completeWelcomeRecruit();
    await grantConsent(personId);
    const prospectId = await prospectIdFor(personId);
    await answerQuestionnaireB(prospectId, QUESTIONNAIRE_B_COMPLETING_CODES);

    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result).toEqual({ created: [], reason: "already_complete" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });

  it("never creates a third questionnaire job — exactly ask and reminder, never more, on repeated calls", async () => {
    const personId = await completeWelcomeRecruit();
    await grantConsent(personId);

    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));

    const jobs = await jobsFor(personId);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.idempotency_key).sort()).toEqual(
      [
        `recruit-cycle:interest_ask:${personId}:${seasonId}`,
        `recruit-cycle:interest_reminder:${personId}:${seasonId}`,
      ].sort(),
    );
  });

  it("is idempotent — rerunning after a partial answer creates only what is still missing", async () => {
    const personId = await incompleteRecruit();
    await grantConsent(personId);
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    expect(await jobsFor(personId)).toHaveLength(4);

    // Rerunning declares nothing new — every idempotency key already exists.
    const second = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(second.created).toHaveLength(0);
    expect(await jobsFor(personId)).toHaveLength(4);
  });
});

describe("dispatchRecruitmentCycleJob", () => {
  it("sends the welcome template, records an accepted attempt, and leaves the job processing", async () => {
    const personId = await firstNameOnlyRecruit();
    await grantConsent(personId);
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    // The welcome job was declared while no mobile was on file; a number
    // arriving afterwards is what dispatch actually sends to. The family
    // name is never supplied, so the welcome track's completing set stays
    // unmet and the completion re-check (LAN-203 fix) does not stop it.
    await addMobile(personId);
    const jobId = (
      await withTransaction((tx) =>
        tx.query<{ id: string }>(
          "select id from public.notification_jobs where idempotency_key = $1",
          [`recruit-cycle:welcome:${personId}:${seasonId}`],
        ),
      )
    ).rows[0].id;

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchRecruitmentCycleJob(jobId, { source: CONFIGURED, transport });

    expect(outcome).toBe("accepted");
    expect(sent).toHaveLength(1);
    expect((sent[0].body.template as { name: string }).name).toBe(TEMPLATE_NAMES.recruit_welcome);

    const job = await withTransaction((tx) =>
      tx.query<{ status: string }>(
        "select status::text as status from public.notification_jobs where id = $1",
        [jobId],
      ),
    );
    expect(job.rows[0].status).toBe("processing");

    const attempt = await withTransaction((tx) =>
      tx.query<{ accepted_at: Date | null }>(
        "select accepted_at from public.delivery_attempts where notification_job_id = $1",
        [jobId],
      ),
    );
    expect(attempt.rows[0].accepted_at).not.toBeNull();
  });

  it("refuses at claim time when consent was withdrawn after the job was declared (Brian, 2026-09-01)", async () => {
    const personId = await incompleteRecruit();
    await grantConsent(personId);
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    await addMobile(personId);
    const jobId = (
      await withTransaction((tx) =>
        tx.query<{ id: string }>(
          "select id from public.notification_jobs where idempotency_key = $1",
          [`recruit-cycle:welcome:${personId}:${seasonId}`],
        ),
      )
    ).rows[0].id;

    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, seasonId));

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchRecruitmentCycleJob(jobId, { source: CONFIGURED, transport });

    // Matching dispatchEscalationJob's own convention exactly (its doc
    // comment: a claim that found nothing to send is "skipped", not
    // "refused" -- "refused" means a provider was actually asked and said
    // no). A withdrawn-consent refusal never reaches the provider at all.
    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
    const job = await withTransaction((tx) =>
      tx.query<{ status: string; last_error: string | null }>(
        "select status::text as status, last_error from public.notification_jobs where id = $1",
        [jobId],
      ),
    );
    expect(job.rows[0].status).toBe("failed");
    expect(job.rows[0].last_error).toMatch(/consent/i);
  });

  it("skips the interest reminder once the recruit answers B1-B5 in between declaration and dispatch (Brian, 2026-09-01: completion stops the cycle)", async () => {
    const personId = await completeWelcomeRecruit();
    await grantConsent(personId);
    // Declared while B is still unanswered — both the ask and its reminder
    // are created, on the same 72h/144h-apart offsets the finding describes.
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    const prospectId = await prospectIdFor(personId);

    // The recruit answers the whole questionnaire before the reminder's own
    // offset arrives — the exact window the completion re-check exists for.
    await answerQuestionnaireB(prospectId, QUESTIONNAIRE_B_COMPLETING_CODES);

    const jobId = (
      await withTransaction((tx) =>
        tx.query<{ id: string }>(
          "select id from public.notification_jobs where idempotency_key = $1",
          [`recruit-cycle:interest_reminder:${personId}:${seasonId}`],
        ),
      )
    ).rows[0].id;

    const { sent, transport } = acceptingTransport();
    const outcome = await dispatchRecruitmentCycleJob(jobId, { source: CONFIGURED, transport });

    expect(outcome).toBe("skipped");
    expect(sent).toHaveLength(0);
    const job = await withTransaction((tx) =>
      tx.query<{ status: string; last_error: string | null }>(
        "select status::text as status, last_error from public.notification_jobs where id = $1",
        [jobId],
      ),
    );
    expect(job.rows[0].status).toBe("failed");
    expect(job.rows[0].last_error).toMatch(/completing set/i);
  });

  it("is claimed and dispatched by runMessagingSweep alongside every other job type", async () => {
    // First-name-only, per firstNameOnlyRecruit's own comment: all four jobs
    // must still be sendable after addMobile below, and the welcome track's
    // completion re-check (LAN-203 fix) would otherwise stop the two welcome
    // -track jobs the moment a mobile completed that track.
    const personId = await firstNameOnlyRecruit();
    await grantConsent(personId);
    await withTransaction((tx) => declareRecruitmentCycleJobsIn(tx, personId, seasonId));
    await addMobile(personId);
    // Backdated far enough that this fixture's own four jobs always sort
    // ahead of the seeded database's own genuinely-due ambient jobs
    // (readDueJobs orders oldest-scheduled first, and the synthetic seed
    // carries hundreds of its own due jobs) -- otherwise SWEEP_BATCH_LIMIT
    // could fill with ambient rows before reaching this fixture's own.
    await withTransaction((tx) =>
      tx.query(
        "update public.notification_jobs set scheduled_for = now() - interval '100 years' where person_id = $1::uuid",
        [personId],
      ),
    );

    const { sent, transport } = acceptingTransport();
    const summary = await runMessagingSweep({ source: CONFIGURED, transport });

    expect(summary.accepted).toBeGreaterThanOrEqual(4);
    const names = sent.map((s) => (s.body.template as { name: string }).name);
    expect(names).toEqual(
      expect.arrayContaining([
        TEMPLATE_NAMES.recruit_welcome,
        TEMPLATE_NAMES.recruit_details_reminder,
        TEMPLATE_NAMES.recruit_interest_ask,
        TEMPLATE_NAMES.recruit_interest_reminder,
      ]),
    );
  });
});

/**
 * LAN-204's own consent deadlock, and its fix. Brian, 2026-09-02: "The
 * personal questionnaire is how we get consent. If consent is not given,
 * sending the personal questionnaire is how we get it… the fucking app is
 * deadlocked now." This suite is the end-to-end proof: the exact SEND action
 * `W2`'s button calls, against a recruit with no consent record at all,
 * dispatched through the real local delivery sink (`local-sink.ts`) rather
 * than a bare accepting stub — and the two negatives that keep the gate real.
 */
describe("LAN-204 — the consent deadlock, and its fix", () => {
  it("sends the personal questionnaire end to end for a never-asked recruit — created, claimed, rendered, and accepted by the real local sink", async () => {
    const personId = await firstNameOnlyRecruit();
    const prospectId = await prospectIdFor(personId);

    // `sendRecruitmentQuestionnaireIn` is `W2`'s own SEND action, called
    // exactly as the record's SEND button calls it — no `grantConsent` here,
    // deliberately: this recruit has never been asked, at any door.
    const sent = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, operatorPersonId, prospectId, "personal"),
    );
    expect([...sent.created].sort()).toEqual(["details_reminder", "welcome"]);

    // The welcome job was declared while no mobile was on file — see
    // `firstNameOnlyRecruit`'s own comment for why a number arriving after
    // declaration is what a real dispatch sends to without the completion
    // re-check skipping it.
    await addMobile(personId);
    const jobId = (
      await withTransaction((tx) =>
        tx.query<{ id: string }>(
          "select id from public.notification_jobs where idempotency_key = $1",
          [`recruit-cycle:welcome:${personId}:${seasonId}`],
        ),
      )
    ).rows[0].id;

    const sinkRecords: SinkRecord[] = [];
    const sink = createDeliverySink(CONFIGURED, { write: (record) => sinkRecords.push(record) });
    const outcome = await dispatchRecruitmentCycleJob(jobId, { source: CONFIGURED, transport: sink });

    expect(outcome).toBe("accepted");
    expect(sinkRecords).toHaveLength(1);
    expect(sinkRecords[0].channel).toBe("whatsapp");
    expect(
      (sinkRecords[0].payload as { template: { name: string } }).template.name,
    ).toBe(TEMPLATE_NAMES.recruit_welcome);

    const job = await withTransaction((tx) =>
      tx.query<{ status: string }>(
        "select status::text as status from public.notification_jobs where id = $1",
        [jobId],
      ),
    );
    expect(job.rows[0].status).toBe("processing");

    const attempt = await withTransaction((tx) =>
      tx.query<{ accepted_at: Date | null }>(
        "select accepted_at from public.delivery_attempts where notification_job_id = $1",
        [jobId],
      ),
    );
    expect(attempt.rows[0].accepted_at).not.toBeNull();
  });

  it("negative 1 — refuses both tracks for a recruit who has explicitly refused consent", async () => {
    const personId = await incompleteRecruit();
    await withTransaction((tx) =>
      tx.query(
        `insert into public.season_messaging_consents (person_id, season_id, state, source)
         values ($1::uuid, $2::uuid, 'refused', 'operator_recorded')`,
        [personId, seasonId],
      ),
    );
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result).toEqual({ created: [], reason: "not_consented" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });

  it("negative 2 — refuses both tracks for a recruit who has withdrawn consent", async () => {
    const personId = await incompleteRecruit();
    await grantConsent(personId);
    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, seasonId));
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result).toEqual({ created: [], reason: "not_consented" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });

  it("the strict interest-track gate is unchanged — a never-asked recruit whose welcome track is already complete still gets nothing", async () => {
    const personId = await completeWelcomeRecruit();
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    expect(result).toEqual({ created: [], reason: "not_consented" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });

  // `Q-read-back-authorises-how-much` (Brian, 2026-09-02, answered narrow):
  // a touchline read-back's grant authorises the welcome track alone — it
  // must not reach the interest/Questionnaire-B track.
  it("a walk-up read-back's grant does not reach the interest track, only the welcome track", async () => {
    const personId = await completeWelcomeRecruit();
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'granted', 'walk_up_read_back')`,
      [personId, seasonId],
    );
    const result = await withTransaction((tx) =>
      declareRecruitmentCycleJobsIn(tx, personId, seasonId),
    );
    // The welcome track is already complete (`completeWelcomeRecruit`), so
    // there is nothing left for the read-back's grant to unlock — proving
    // the negative on the one track that matters here, the interest track.
    expect(result).toEqual({ created: [], reason: "not_consented" });
    expect(await jobsFor(personId)).toHaveLength(0);
  });
});
