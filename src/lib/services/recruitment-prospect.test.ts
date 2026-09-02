// @vitest-environment node
/**
 * The recruit record's own writes — LAN-204: the exits (`W13`), the flip
 * (`W14`), notes, and the send machinery the 2026-09-01 amendment requires
 * this package to build end to end.
 *
 * Against the real local database, on the same reasoning
 * `recruitment-cycle-dispatch.test.ts` gives: consent, the flip's invariant,
 * and the sweep's real claim/dispatch/sink path cannot be proved against a
 * mocked transaction.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import type { EnvironmentSource } from "@/lib/delivery/config";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { grantSeasonMessagingConsentIn } from "./messaging-consent";
import { runMessagingSweep } from "./messaging-scheduler";
import {
  addRecruitmentProspectNoteIn,
  flipRecruitmentProspectToJoinedIn,
  readRecruitmentProspectIn,
  sendRecruitmentQuestionnaireIn,
  updateRecruitmentProspectStatusIn,
} from "./recruitment-prospect";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN204ProspectSuite";
const ACTOR_MARKER = "LAN204ProspectActor";

let observer: Client;
let seasonId: string;
let actorPersonId: string;

const ALLOWLISTED_PHONES = [
  "07700 900342",
  "07700 900343",
  "07700 900344",
  "07700 900345",
  "07700 900346",
  "07700 900347",
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

  // `generateOnboardingItems` (called by the flip) creates one row per
  // `onboarding_item_types` row configured for the season — a season with
  // none yields no items, which `membership.ts` documents as a real
  // configuration state and not a failure. This suite mints its own
  // isolated season (deliberately never the shared seeded one — see the
  // module comment on `seasonId`), so it has to configure at least one type
  // itself, or F-LAN204-003's own new assertion below would fail on a
  // fixture gap rather than a real regression.
  await observer.query(
    `insert into public.onboarding_item_types (season_id, code, label, is_required, is_subscription, sort_order)
     values ($1::uuid, 'kit', 'Kit collected', true, false, 1)`,
    [seasonId],
  );

  const actor = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, 'Actor') returning id",
    [ACTOR_MARKER],
  );
  actorPersonId = actor.rows[0].id;
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  // `recruitment_prospects.converted_membership_id` points at
  // `season_memberships`, so the prospect row (and everything that hangs off
  // it) has to go before the membership it may have converted into.
  await observer.query(
    `delete from public.recruitment_prospect_notes
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.recruitment_prospect_status_events
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.recruitment_questionnaire_responses
      where prospect_id in (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_membership_status_events
      where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(
    `delete from public.onboarding_items
      where season_membership_id in (select id from public.season_memberships where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.season_memberships where person_id in ${people}`, [
    MARKER,
  ]);
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
  await observer.query("delete from public.audit_events where actor_person_id = $1::uuid", [
    actorPersonId,
  ]);
  await observer.query("delete from public.people where id = $1::uuid", [actorPersonId]);
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

/**
 * `family_name` is deliberately null — `readRecruitmentCycleCompletionIn`'s
 * welcome-track completion (unchanged on this branch; LAN-205's own fix to it
 * lands on its own branch and is not this file's to assume) reads given name
 * + family name + a current mobile, and a prospect that already carries all
 * three would declare `already_complete` and never queue the very jobs these
 * tests exist to observe.
 */
async function newProspect(
  status: string = "identified",
): Promise<{ personId: string; prospectId: string }> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, null) returning id",
      [MARKER],
    ),
  );
  const personId = person.rows[0].id;
  // `recruitment_prospects_commitment_is_dated`: `committed` and `joined` both
  // require `committed_on`.
  const needsCommittedOn = status === "committed" || status === "joined";
  const prospect = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      `insert into public.recruitment_prospects (person_id, season_id, status, source, committed_on)
       values ($1::uuid, $2::uuid, $3::public.prospect_status, 'other', $4::date)
       returning id`,
      [personId, seasonId, status, needsCommittedOn ? "2019-10-01" : null],
    ),
  );
  return { personId, prospectId: prospect.rows[0].id };
}

async function grantConsent(personId: string): Promise<void> {
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
}

describe("updateRecruitmentProspectStatusIn — the exits, W13", () => {
  it("moves identified -> declined with no reason required, and writes status history", async () => {
    const { prospectId } = await newProspect("identified");
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "declined"),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("declined");
    expect(record?.statusHistory).toHaveLength(1);
    expect(record?.statusHistory[0]).toMatchObject({
      fromStatus: "identified",
      toStatus: "declined",
    });
  });

  it("refuses void with no reason, and accepts it once one is given", async () => {
    const { prospectId } = await newProspect("engaged");
    await expect(
      withTransaction((tx) =>
        updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "void"),
      ),
    ).rejects.toThrow(/reason/i);

    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "void", {
        reason: "Duplicate of another record.",
      }),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("void");
    expect(record?.statusHistory[0]?.reason).toBe("Duplicate of another record.");
  });

  it("refuses a same-to-same status change", async () => {
    const { prospectId } = await newProspect("engaged");
    await expect(
      withTransaction((tx) =>
        updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "engaged"),
      ),
    ).rejects.toThrow(/already/i);
  });

  it("refuses 'joined' even called directly, bypassing TypeScript's own exclusion", async () => {
    const { prospectId } = await newProspect("committed");
    await expect(
      withTransaction((tx) =>
        updateRecruitmentProspectStatusIn(
          tx,
          actorPersonId,
          prospectId,
          // @ts-expect-error — exactly the raw payload a server action call
          // bypassing TypeScript would carry; the runtime guard is the test.
          "joined",
        ),
      ),
    ).rejects.toThrow(/flip/i);
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("committed");
  });

  it("recovers disengaged -> engaged, with history intact", async () => {
    const { prospectId } = await newProspect("engaged");
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "disengaged"),
    );
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "engaged"),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("engaged");
    expect(record?.statusHistory).toHaveLength(2);
  });

  it("changes only the status: notes and events are untouched by an exit", async () => {
    const { prospectId } = await newProspect("engaged");
    await withTransaction((tx) =>
      addRecruitmentProspectNoteIn(tx, actorPersonId, prospectId, "Keen."),
    );
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "declined"),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.notes).toHaveLength(1);
    expect(record?.notes[0].note).toBe("Keen.");
  });

  it("stops the cycle: an exit cancels every queued job, not merely refuses new ones", async () => {
    const { personId, prospectId } = await newProspect("identified");
    await grantConsent(personId);
    const declared = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "personal"),
    );
    expect(declared.created.length).toBeGreaterThan(0);

    const before = await observer.query(
      "select status::text as status from public.notification_jobs where person_id = $1::uuid",
      [personId],
    );
    expect(before.rows.every((row) => row.status === "pending")).toBe(true);

    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "declined"),
    );

    const after = await observer.query(
      "select status::text as status from public.notification_jobs where person_id = $1::uuid",
      [personId],
    );
    expect(after.rows.length).toBeGreaterThan(0);
    expect(after.rows.every((row) => row.status === "cancelled")).toBe(true);

    // And the sweep, run afterwards, sends nothing for this person.
    const { sent, transport } = acceptingTransport();
    await runMessagingSweep({ source: CONFIGURED, transport });
    expect(sent).toHaveLength(0);
  });
});

describe("flipRecruitmentProspectToJoinedIn — W14", () => {
  it("creates exactly one season membership in onboarding, generates its onboarding items, and writes one audit row", async () => {
    const { personId, prospectId } = await newProspect("committed");

    const result = await withTransaction((tx) =>
      flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
    );
    expect(result.membershipId).toBeTruthy();

    const membership = await observer.query(
      "select status::text as status, entry::text as entry from public.season_memberships where id = $1::uuid",
      [result.membershipId],
    );
    expect(membership.rows[0]).toMatchObject({ status: "onboarding", entry: "new" });

    // F-LAN204-003 (correction round 1): this test's own title claimed
    // "generates its onboarding items" while the body never once queried
    // `onboarding_items` — a regression that silently stopped
    // `generateOnboardingItems` from running stayed green. `W14` (locked)
    // names "onboarding opens, and they are in the next steps" as one of
    // the flip's three load-bearing consequences.
    const onboardingItems = await observer.query(
      "select count(*)::int as n from public.onboarding_items where season_membership_id = $1::uuid",
      [result.membershipId],
    );
    expect(onboardingItems.rows[0].n).toBeGreaterThan(0);

    const memberships = await observer.query(
      "select count(*)::int as n from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid",
      [personId, seasonId],
    );
    expect(memberships.rows[0].n).toBe(1);

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("joined");
    expect(record?.convertedMembershipId).toBe(result.membershipId);
    expect(record?.committedOn).toBeTruthy();

    const audits = await observer.query(
      "select count(*)::int as n from public.audit_events where entity_id = $1::uuid and action = 'recruitment_prospect.joined'",
      [prospectId],
    );
    expect(audits.rows[0].n).toBe(1);
  });

  it("refuses a second flip attempt — the one-membership-per-season invariant", async () => {
    const { prospectId } = await newProspect("committed");
    await withTransaction((tx) => flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId));

    await expect(
      withTransaction((tx) => flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId)),
    ).rejects.toThrow(/already joined/i);
  });

  it("carries out no duplicate check of its own — a fresh flip with no prior status history succeeds", async () => {
    // Task 09 D7 / W14: "no duplicate check at the flip". Nothing here queries
    // for a same-name person; the only guard is the database's own invariant,
    // proved above.
    const { prospectId } = await newProspect("identified");
    const result = await withTransaction((tx) =>
      flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
    );
    expect(result.membershipId).toBeTruthy();
  });
});

describe("sendRecruitmentQuestionnaireIn and the sweep — the 2026-09-01 amendment", () => {
  it("creates no job for a recruit with no granted consent, and names why", async () => {
    const { prospectId } = await newProspect("identified");
    const result = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "personal"),
    );
    expect(result).toEqual({ created: [], reason: "not_consented" });
  });

  it("creates nothing for a declined recruit even with consent granted", async () => {
    const { personId, prospectId } = await newProspect("declined");
    await grantConsent(personId);
    const result = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "recruitment"),
    );
    expect(result.created).toHaveLength(0);
  });

  it(
    "proves the whole path: job created, sweep claims it, dispatcher renders the template, " +
      "the sink accepts the payload, and the record's own last-sent date reflects it",
    async () => {
      const { personId, prospectId } = await newProspect("identified");
      await grantConsent(personId);

      const before = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
      expect(before?.personal.lastSentAt).toBeNull();

      const declared = await withTransaction((tx) =>
        sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "personal"),
      );
      expect([...declared.created].sort()).toEqual(["details_reminder", "welcome"]);

      // The mobile arrives after declaration — `dispatchRecruitmentCycleJob`
      // needs a real recipient at claim time; declaration itself never did.
      await withTransaction((tx) =>
        tx.query(
          `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source, valid_from)
           values ($1::uuid, 'phone', null, $2, true, 'other', current_date)`,
          [personId, uniquePhone()],
        ),
      );

      const { sent, transport } = acceptingTransport();
      const summary = await runMessagingSweep({ source: CONFIGURED, transport });
      expect(summary.accepted).toBeGreaterThan(0);
      expect(sent.length).toBeGreaterThan(0);
      // The welcome template, the one due at offset zero.
      const payload = sent[0].body as { template: { name: string } };
      expect(payload.template.name).toBe("recruit_welcome_v1");

      const sinkAttempts = await observer.query(
        "select accepted_at from public.delivery_attempts da join public.notification_jobs nj on nj.id = da.notification_job_id where nj.person_id = $1::uuid",
        [personId],
      );
      expect(sinkAttempts.rows.some((row) => row.accepted_at !== null)).toBe(true);

      const after = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
      expect(after?.personal.lastSentAt).not.toBeNull();
      expect(after?.recruitment.lastSentAt).toBeNull();
    },
  );

  it("never creates a third message for one track — pressing send again after both slots exist is a no-op", async () => {
    const { personId, prospectId } = await newProspect("identified");
    await grantConsent(personId);
    await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "recruitment"),
    );
    const firstJobs = await observer.query(
      "select id from public.notification_jobs where person_id = $1::uuid",
      [personId],
    );
    const second = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "recruitment"),
    );
    expect(second.created).toHaveLength(0);
    const secondJobs = await observer.query(
      "select id from public.notification_jobs where person_id = $1::uuid",
      [personId],
    );
    expect(secondJobs.rows).toHaveLength(firstJobs.rows.length);
  });
});

describe("addRecruitmentProspectNoteIn", () => {
  it("refuses a blank note", async () => {
    const { prospectId } = await newProspect("identified");
    await expect(
      withTransaction((tx) => addRecruitmentProspectNoteIn(tx, actorPersonId, prospectId, "   ")),
    ).rejects.toSatisfy((error: unknown) => isServiceError(error));
  });

  it("attributes a note to its author", async () => {
    const { prospectId } = await newProspect("identified");
    await withTransaction((tx) =>
      addRecruitmentProspectNoteIn(tx, actorPersonId, prospectId, "Good conversation at the door."),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.notes[0]).toMatchObject({ note: "Good conversation at the door." });
    expect(record?.notes[0].authorLabel).toContain(ACTOR_MARKER);
  });
});
