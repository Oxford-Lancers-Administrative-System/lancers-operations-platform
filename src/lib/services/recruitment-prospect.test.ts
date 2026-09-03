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
import { todayInClubZone } from "@/lib/club-time";
import {
  grantSeasonMessagingConsentIn,
  withdrawSeasonMessagingConsentIn,
} from "./messaging-consent";
import { runMessagingSweep } from "./messaging-scheduler";
import {
  addRecruitmentProspectNoteIn,
  flipRecruitmentProspectToJoinedIn,
  RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON,
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
  // LAN-215: the flip now also queues the welcome, which
  // `emitOnboardingOpenedWelcomeIn` logs as the membership's first
  // `onboarding_activity_log` entry — `onboarding_activity_log_membership_season`
  // refuses to let the membership go while it exists, on the identical reason
  // `onboarding_items` is deleted first above.
  await observer.query(
    `delete from public.onboarding_activity_log
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
 * `family_name` is deliberately null. `readRecruitmentCycleCompletionIn`'s
 * welcome-track completion is keyed on the consent *source* alone (LAN-205:
 * `granted` via `qr_self_entry` — never name or mobile, corrected from the
 * original name-and-mobile read this file's tests were first written
 * against). A bare `newProspect` grants no consent at all, so the welcome
 * track stays incomplete regardless of what name fields carry; a test that
 * needs it complete calls {@link grantConsent} (the sign-up form's own
 * grant), and one that needs *some* consent granted without completing the
 * welcome track calls {@link grantConsentViaWalkUp} instead.
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

/** Grants consent the way the sign-up form does — completes the welcome track (LAN-205). */
async function grantConsent(personId: string): Promise<void> {
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
}

/**
 * Grants consent the way an operator door does (LAN-205's walk-up read-back,
 * or LAN-206's operator-add) — authorises the welcome track
 * (`mayReceiveWelcomeContactIn`) without completing it, and, per
 * `Q-read-back-authorises-how-much` (Brian, 2026-09-02, answered narrow),
 * never reaches the interest/questionnaire track
 * (`hasGrantedViaSignupFormIn`), which waits for the recruit's own grant
 * through the sign-up form specifically. `messaging-consent.ts` never writes
 * this source itself (see its own module note) — this raw insert stands in
 * for the write those packages own, the same way
 * `recruitment-cycle-dispatch.test.ts`'s own `grantConsentViaWalkUp` does.
 */
async function grantConsentViaWalkUp(personId: string): Promise<void> {
  await withTransaction((tx) =>
    tx.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source, changed_at)
       values ($1::uuid, $2::uuid, 'granted', 'walk_up_read_back', now())
       on conflict (person_id, season_id) do update
         set state = 'granted', source = excluded.source, changed_at = now()`,
      [personId, seasonId],
    ),
  );
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
    // An operator read-back grant, not the sign-up form — a `grantConsent`
    // (qr_self_entry) grant here would complete the welcome track outright
    // (LAN-205), leaving nothing for `sendRecruitmentQuestionnaireIn` below
    // to declare and nothing for this test's own cancellation to observe.
    await grantConsentViaWalkUp(personId);
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

/**
 * `Q-every-status-reachable` and `Q-committed-on-is-derived` (Brian,
 * 2026-09-02): the free-select status control offers every value and never
 * refuses a transition, because the service supplies what the two schema
 * constraints need rather than gating the control on them.
 */
describe("updateRecruitmentProspectStatusIn — every status reachable (Q-every-status-reachable)", () => {
  it("sets committed_on to today on the same write that sets status to committed — never a second field to flip", async () => {
    const { prospectId } = await newProspect("identified");
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "committed"),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("committed");
    expect(record?.committedOn).toBe(todayInClubZone());
  });

  it("re-dates committed_on to today on a later re-commit, rather than keeping the earlier date", async () => {
    const { prospectId } = await newProspect("identified");
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "committed"),
    );
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "engaged"),
    );
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "committed"),
    );
    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.committedOn).toBe(todayInClubZone());
  });

  it("clears converted_membership_id when a joined recruit is moved to any other status, without touching the membership the flip created", async () => {
    const { prospectId } = await newProspect("committed");
    const flip = await withTransaction((tx) =>
      flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
    );

    // The free-select control offers every value, including away from
    // `joined` — this must never fall through to
    // `recruitment_prospects_conversion_matches_status`'s raw constraint
    // error the way it would if `converted_membership_id` were left set.
    await withTransaction((tx) =>
      updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, "engaged"),
    );

    const record = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
    expect(record?.status).toBe("engaged");
    expect(record?.convertedMembershipId).toBeNull();

    // The season membership the flip created is untouched — un-joining
    // through the status control edits only the prospect's own
    // back-reference, never the membership itself.
    const membership = await observer.query(
      "select status::text as status from public.season_memberships where id = $1::uuid",
      [flip.membershipId],
    );
    expect(membership.rows[0]?.status).toBe("onboarding");
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

  // LAN-215, `WP-arrival-doors`. The far side of the flip: the welcome fires,
  // the recruit's open link is superseded and audited, and consent is
  // touched by nothing — all four inside this one transaction test.
  describe("LAN-215 — the welcome, the superseded ask, and consent left alone", () => {
    it("fires onboarding-opened: the same welcome emitter W1 and W2 queue, keyed to this membership", async () => {
      const { personId, prospectId } = await newProspect("committed");
      await grantConsentViaWalkUp(personId);

      const result = await withTransaction((tx) =>
        flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
      );

      const job = await observer.query<{ status: string; person_id: string }>(
        `select status::text as status, person_id from public.notification_jobs
          where idempotency_key = $1`,
        [`onboarding-welcome:${result.membershipId}`],
      );
      expect(job.rows).toHaveLength(1);
      expect(job.rows[0].status).toBe("pending");
      expect(job.rows[0].person_id).toBe(personId);
    });

    it("supersedes the recruit's open link, and audits it, inside the flip's own transaction", async () => {
      const { personId, prospectId } = await newProspect("committed");
      await grantConsentViaWalkUp(personId);

      const openLink = await observer.query<{ id: string }>(
        `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
         values ($1::uuid, $2::uuid, $3, false)
         returning id`,
        [personId, seasonId, crypto.randomUUID().replaceAll("-", "").padEnd(64, "0")],
      );

      await withTransaction((tx) =>
        flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
      );

      const token = await observer.query<{
        revoked_at: Date | null;
        revoked_reason: string | null;
      }>("select revoked_at, revoked_reason from public.person_access_tokens where id = $1::uuid", [
        openLink.rows[0].id,
      ]);
      expect(token.rows[0].revoked_at).not.toBeNull();
      expect(token.rows[0].revoked_reason).toBe(RECRUIT_LINK_SUPERSEDED_BY_FLIP_REASON);

      const audit = await observer.query<{ n: string }>(
        `select count(*)::text as n from public.audit_events
          where entity_id = $1::uuid and action = 'recruitment_prospect.ask_superseded'
            and context ->> 'supersededCount' = '1'`,
        [prospectId],
      );
      expect(audit.rows[0].n).toBe("1");
    });

    it("audits the supersession as zero when the recruit held no open link at all", async () => {
      // "Nothing to supersede" is a legitimate outcome, recorded as one
      // rather than skipped — see `recruitment-prospect.ts`'s own doc comment.
      const { prospectId } = await newProspect("committed");
      await withTransaction((tx) =>
        flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
      );
      const audit = await observer.query<{ n: string }>(
        `select count(*)::text as n from public.audit_events
          where entity_id = $1::uuid and action = 'recruitment_prospect.ask_superseded'
            and context ->> 'supersededCount' = '0'`,
        [prospectId],
      );
      expect(audit.rows[0].n).toBe("1");
    });

    it("copies and re-asks no consent — the door's own grant is the same row, untouched by the flip", async () => {
      const { personId, prospectId } = await newProspect("committed");
      await grantConsentViaWalkUp(personId);

      const before = await observer.query<{ id: string; source: string; changed_at: Date }>(
        "select id, source::text as source, changed_at from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid",
        [personId, seasonId],
      );

      await withTransaction((tx) =>
        flipRecruitmentProspectToJoinedIn(tx, actorPersonId, prospectId),
      );

      const after = await observer.query<{ id: string; source: string; changed_at: Date }>(
        "select id, source::text as source, changed_at from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid",
        [personId, seasonId],
      );
      expect(after.rows).toHaveLength(1);
      expect(after.rows[0]).toEqual(before.rows[0]);
    });
  });
});

describe("sendRecruitmentQuestionnaireIn and the sweep — the 2026-09-01 amendment", () => {
  // LAN-204, item 9 — the consent deadlock, fixed: the personal track is the
  // one exception, so a never-asked recruit's own SEND button now works.
  it("creates the welcome track for a recruit with no consent at all — the personal send is how they get asked", async () => {
    const { prospectId } = await newProspect("identified");
    const result = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "personal"),
    );
    expect([...result.created].sort()).toEqual(["details_reminder", "welcome"]);
    expect(result.reason).toBeNull();
  });

  it("creates no job for a recruit with no granted consent when the recruitment track is asked, and names why", async () => {
    // The welcome track is complete — granted via the sign-up form, then
    // withdrawn — so the welcome track's own new permissiveness cannot
    // create anything here as a side effect (withdrawing leaves the
    // completing *source* at `qr_self_entry`, per
    // `withdrawSeasonMessagingConsentIn`'s own module note, while taking the
    // *state* off `granted`). This isolates the recruitment/interest
    // track's own still-strict gate, the thing this test is actually about
    // — a bare `newProspect` with no consent action at all would instead
    // leave the welcome track's own permissive gate open, and this door's
    // shared declare call would wrongly report `reason: null` for a
    // welcome-track job the "recruitment" track never asked for.
    const { personId, prospectId } = await newProspect("identified");
    await grantConsent(personId);
    await withTransaction((tx) => withdrawSeasonMessagingConsentIn(tx, personId, seasonId));
    const result = await withTransaction((tx) =>
      sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "recruitment"),
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
      // An operator read-back grant, not the sign-up form — this proves the
      // "personal" (welcome) track's own end-to-end path, which a
      // `grantConsent` (qr_self_entry) grant would complete outright before
      // the send below ever ran (LAN-205), leaving nothing to declare.
      await grantConsentViaWalkUp(personId);

      const before = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
      expect(before?.personal.lastSentAt).toBeNull();

      const declared = await withTransaction((tx) =>
        sendRecruitmentQuestionnaireIn(tx, actorPersonId, prospectId, "personal"),
      );
      expect([...declared.created].sort()).toEqual(["details_reminder", "welcome"]);

      // The mobile arrives after declaration — `dispatchRecruitmentCycleJob`
      // needs a real recipient at claim time; declaration itself never did.
      const recruitPhone = uniquePhone();
      await withTransaction((tx) =>
        tx.query(
          `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source, valid_from)
           values ($1::uuid, 'phone', null, $2, true, 'other', current_date)`,
          [personId, recruitPhone],
        ),
      );

      const { sent, transport } = acceptingTransport();
      // F-LAN204-007 (correction round 1). `runMessagingSweep`'s default
      // batch (`SWEEP_BATCH_LIMIT`, 50) is a real production concern —
      // `messaging-scheduler.ts`, out of this package's hands (LAN-205) —
      // but it makes this test order-dependent on a database it does not
      // control: a freshly `db:reset`-and-seeded local stack carries several
      // hundred already-due `reminder`/`invitation` jobs from the synthetic
      // season's own history (confirmed directly: 481 on this run, none of
      // them this test's own), all sorted ahead of this job in
      // `readDueJobs`'s oldest-first order because they were backdated by
      // the seed and this job's own `scheduled_for` (offset zero from
      // `created_at`) is the newest timestamp in the table. A bare call
      // starves this job out of every batch before the sweep ever reaches
      // it — reproduced deterministically, in isolation, against two
      // independently provisioned local databases (this one and the
      // package-gate review's own broker), which is what F-LAN204-007
      // originally flagged as an unresolved discrepancy against a green
      // exact-head CI. A generous explicit `limit` makes the sweep walk the
      // whole due backlog in one call, exactly as a real ticker eventually
      // would across enough ticks: every one of those other jobs is
      // `refused` before any transport call (their recipients are real
      // synthetic numbers, never on `CONFIGURED`'s allowlist), so `sent`
      // still holds only this job's own message, in ordinary FIFO order.
      const summary = await runMessagingSweep({ source: CONFIGURED, transport, limit: 5_000 });
      expect(summary.accepted).toBeGreaterThan(0);
      expect(sent.length).toBeGreaterThan(0);
      // The welcome template, the one due at offset zero — found by name
      // rather than assumed to be `sent[0]`: the backlog above is refused
      // before any transport call (none of its real synthetic numbers are
      // on `CONFIGURED`'s allowlist), so nothing else in this run reaches
      // `sent` at all, but asserting on the one template this test can ever
      // cause is a direct claim rather than one resting on queue order.
      const own = sent.find(
        (message) =>
          (message.body as { template?: { name?: string } }).template?.name ===
          "recruit_welcome_v1",
      );
      expect(own).toBeDefined();
      const payload = own!.body as { to: string; template: { name: string } };
      expect(payload.template.name).toBe("recruit_welcome_v1");
      // The allowlisted number this test itself inserted, WhatsApp's own
      // E.164-without-plus shape (`recipientPermitted`'s normalisation) —
      // proof this message really is the one this test's own job caused,
      // not merely a same-named template from an unrelated row.
      expect(payload.to.endsWith(recruitPhone.replace(/\D/g, "").replace(/^0/, ""))).toBe(true);

      const sinkAttempts = await observer.query(
        "select accepted_at from public.delivery_attempts da join public.notification_jobs nj on nj.id = da.notification_job_id where nj.person_id = $1::uuid",
        [personId],
      );
      expect(sinkAttempts.rows.some((row) => row.accepted_at !== null)).toBe(true);

      const after = await withTransaction((tx) => readRecruitmentProspectIn(tx, prospectId));
      expect(after?.personal.lastSentAt).not.toBeNull();
      expect(after?.recruitment.lastSentAt).toBeNull();
    },
    // The generous `limit` above (F-LAN204-007) means this sweep walks the
    // whole local synthetic season's own due backlog, not just this test's
    // one job — hundreds of `refused` claims, each its own transaction, on
    // a freshly `db:reset`-and-seeded stack. The default 5s test timeout is
    // sized for one job, not that.
    30_000,
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
