// @vitest-environment node
/**
 * The player questionnaire's own domain logic — LAN-216 — against the real
 * local database. `tests/helpers/service-layer.ts` explains the `observer`
 * pattern: every assertion that matters reads back through a **second**
 * connection, because a row is visible to the transaction that wrote it
 * whether or not it actually committed.
 *
 * This suite builds its own people and memberships in the seeded open
 * season, marked and removed afterwards, following `membership.test.ts`'s
 * own reasoning: transitioning a seeded fixture would move a row another
 * suite reads.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { EMAIL_SHAPE, PHONE_SHAPE } from "@/app/operate/roster/new/validation";
import { closePool, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { generateOnboardingItems } from "./membership";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { resolveOpenSeason } from "./roster";
import { updatePersonField } from "./person-write";
import { readOpenPersonFactDisputesIn } from "./person-fact-dispute";
import {
  agreeOnboardingDocument,
  claimTrustItem,
  emergencyContactIsComplete,
  readQuestionnaireView,
  recordHudlNoInvitation,
  saveDetailsStep,
  type DetailsStepInput,
} from "./player-questionnaire";

const MARKER = "LAN216PlayerQuestionnaire";

function unique(tag: string): string {
  return `${MARKER}-${tag}-${process.pid}-${counter++}`;
}
let counter = 0;

let observer: Client;
let actorPersonId: string;
let openSeasonId: string;
const createdPersonIds: string[] = [];
const createdMembershipIds: string[] = [];

/** A fresh person with a membership `onboarding` in the shared open season, items generated. */
async function givenPlayer(): Promise<{ personId: string; membershipId: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Testcase') returning id`,
    [unique("Person")],
  );
  const personId = person.rows[0].id;
  createdPersonIds.push(personId);

  const membership = await observer.query<{ id: string }>(
    `insert into public.season_memberships
       (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date)
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

async function itemStatus(membershipId: string, code: string): Promise<string> {
  const result = await observer.query<{ status: string }>(
    `select i.status::text as status
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
      where i.season_membership_id = $1::uuid and t.code = $2`,
    [membershipId, code],
  );
  return result.rows[0].status;
}

/** The minimal, fully-valid step-1 input for a fresh player, overridable per test. */
function baseDetailsInput(
  personId: string,
  seasonId: string,
  membershipId: string,
  overrides: Partial<DetailsStepInput> = {},
): DetailsStepInput {
  return {
    personId,
    seasonId,
    membershipId,
    grantConsent: true,
    fields: {
      given_name: "Jordan",
      family_name: "Ashworth",
      college: "Brasenose",
      matriculation_year: "2024",
      expected_graduation_year: "2027",
      degree_field: "Engineering Science",
      date_of_birth: "2005-03-14",
    },
    mobile: "07700 900123",
    personalEmail: `${unique("player")}@example.ox.ac.uk`,
    emergencyContact: {
      givenName: "Casey",
      familyName: "Ashworth",
      relationship: "Parent",
      phone: "07700 900456",
      email: `${unique("ec")}@example.com`,
    },
    ...overrides,
  };
}

beforeAll(async () => {
  observer = await openObserver();
  const season = await withTransaction((tx) => resolveOpenSeason(tx));
  openSeasonId = season.id;
  actorPersonId = await seededActorPersonId(observer);
});

afterEach(async () => {
  if (createdMembershipIds.length === 0 && createdPersonIds.length === 0) return;

  await observer.query(
    `delete from public.onboarding_activity_log where season_membership_id = any($1::uuid[])`,
    [createdMembershipIds],
  );
  await observer.query(
    `delete from public.onboarding_item_history
      where season_membership_id = any($1::uuid[])`,
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
  // Before deleting the items themselves — `audit_events.actor_person_id`
  // (`on delete restrict`) still points at this suite's people from
  // `claimOnboardingItem`'s own audit row, so the item lookup this filter
  // needs must run while the rows it joins against still exist.
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
    `delete from public.audit_events where entity_table = 'season_memberships'
       and entity_id = any($1::uuid[])`,
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
    `delete from public.audit_events where entity_table = 'people' and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'person_emergency_contacts'
       and entity_id = any($1::uuid[])`,
    [createdPersonIds],
  );
  await observer.query(
    `delete from public.audit_events where entity_table = 'contact_points'
       and entity_id in (select id from public.contact_points where person_id = any($1::uuid[]))`,
    [createdPersonIds],
  );
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

describe("emergencyContactIsComplete", () => {
  it("requires the four fields but not relationship", () => {
    expect(
      emergencyContactIsComplete({
        givenName: "Casey",
        familyName: "Ashworth",
        relationship: null,
        phone: "07700 900456",
        email: "casey@example.com",
        recordedByPersonId: null,
        recordedAt: null,
      }),
    ).toBe(true);
    expect(
      emergencyContactIsComplete({
        givenName: "Casey",
        familyName: null,
        relationship: null,
        phone: "07700 900456",
        email: "casey@example.com",
        recordedByPersonId: null,
        recordedAt: null,
      }),
    ).toBe(false);
    expect(emergencyContactIsComplete(null)).toBe(false);
  });
});

describe("readQuestionnaireView", () => {
  it("returns null for a person with no membership this season", async () => {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name) values ($1) returning id`,
      [unique("Homeless")],
    );
    createdPersonIds.push(person.rows[0].id);

    const view = await readQuestionnaireView(person.rows[0].id, openSeasonId);
    expect(view).toBeNull();
  });

  it("resumes at details when the required set and consent are still outstanding", async () => {
    const { personId } = await givenPlayer();
    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.nextStep).toBe("details");
    expect(view?.nothingOutstanding).toBe(false);
    expect(view?.needsConsentStep).toBe(true);
  });
});

describe("saveDetailsStep", () => {
  it("fills every required field, grants consent, and completes the derived items", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));
    expect(result.errors).toEqual({});

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.missingRequiredFields).toEqual([]);
    expect(view?.needsConsentStep).toBe(false);
    expect(view?.detailsComplete).toBe(true);
    expect(view?.nextStep).toBe("code_of_conduct");

    expect(await itemStatus(membershipId, "contact_academic_details")).toBe("complete");
    expect(await itemStatus(membershipId, "season_welcome_consent")).toBe("complete");

    const activity = await observer.query(
      `select section, kind, channel, actor_person_id from public.onboarding_activity_log
        where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(activity.rows).toEqual([
      expect.objectContaining({
        section: "Your details",
        kind: "answer",
        actor_person_id: personId,
      }),
    ]);
  });

  it("blocks nothing but leaves the step outstanding when a required field is missing", async () => {
    const { personId, membershipId } = await givenPlayer();

    await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        fields: {
          given_name: "Jordan",
          family_name: "Ashworth",
          college: "",
          matriculation_year: "",
          expected_graduation_year: "",
          degree_field: "",
          date_of_birth: "",
        },
      }),
    );

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.detailsComplete).toBe(false);
    expect(view?.nextStep).toBe("details");
    // What was saved stayed saved.
    expect(view?.person.givenName).toBe("Jordan");
    expect(view?.person.familyName).toBe("Ashworth");
  });

  it("refuses the whole submission and writes nothing when a field is malformed", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { mobile: "not a phone number" }),
    );
    expect(Object.keys(result.errors)).toContain("mobile");

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.person.givenName).not.toBe("Jordan"); // nothing committed
  });

  it("self-corrects a field the player themselves supplied earlier, with no dispute", async () => {
    const { personId, membershipId } = await givenPlayer();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        grantConsent: false,
        fields: { college: "Farrowgate" },
      }),
    );
    expect(result.outcomes.college).toBe("self-corrected");

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.person.college).toBe("Farrowgate");
    expect(view?.openDisputedFields.has("college")).toBe(false);
  });

  it("leaves consent granted after a grantConsent:false resubmission by an already-granted person — F-002, REQ-consent-one-way", async () => {
    // This is the review's own defect: an `else` branch calling the withdraw
    // function whenever `grantConsent` arrives false. Nothing in this module
    // ever imports that function — `season_messaging_consents` can only move
    // forward through this surface — but until now nothing asserted the
    // read-back that would catch it if that stopped being true.
    const { personId, membershipId } = await givenPlayer();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { grantConsent: false }),
    );

    const stillGranted = await withTransaction((tx) =>
      hasGrantedSeasonMessagingConsentIn(tx, personId, openSeasonId),
    );
    expect(stillGranted).toBe(true);
  });

  it("raises a dispute rather than silently overwriting an operator-recorded value", async () => {
    const { personId, membershipId } = await givenPlayer();
    // An operator recorded this college — a different actor from the subject.
    await updatePersonField({
      actorPersonId,
      personId,
      field: "college",
      value: "Farrowgate",
    });

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        grantConsent: false,
        fields: { college: "Brasenose" },
      }),
    );
    expect(result.outcomes.college).toBe("disputed");

    const view = await readQuestionnaireView(personId, openSeasonId);
    // The club's value stands — nothing was silently overwritten.
    expect(view?.person.college).toBe("Farrowgate");
    expect(view?.openDisputedFields.has("college")).toBe(true);

    const disputes = await withTransaction((tx) => readOpenPersonFactDisputesIn(tx, personId));
    const dispute = disputes.find((d) => d.field === "college");
    expect(dispute?.clubValue).toBe("Farrowgate");
    expect(dispute?.playerValue).toBe("Brasenose");
  });

  it("writes directly over an unattributed (seeded/imported) value", async () => {
    const { personId, membershipId } = await givenPlayer();
    // Simulate an imported value: written directly, never through the audited
    // write path, so `collegeSource` reads `null`.
    await observer.query(
      `update public.people set college = 'Imported College' where id = $1::uuid`,
      [personId],
    );

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        grantConsent: false,
        fields: { college: "Brasenose" },
      }),
    );
    expect(result.outcomes.college).toBe("filled");

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.person.college).toBe("Brasenose");
    expect(view?.openDisputedFields.has("college")).toBe(false);
  });

  it("requires all four emergency-contact facts, relationship excepted", async () => {
    const { personId, membershipId } = await givenPlayer();

    await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        emergencyContact: {
          givenName: "Casey",
          familyName: "Ashworth",
          relationship: "",
          phone: "",
          email: "",
        },
      }),
    );

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.detailsComplete).toBe(false);
    expect(view?.emergencyContact?.givenName).toBe("Casey");
    expect(view?.emergencyContact?.phone).toBeNull();
  });

  // B-001 (LAN-216 round 1): "There is no form validation on the mobile phone
  // or the email... Should be the same as all other form validations we
  // have." All four fields below share exactly one idiom —
  // `src/app/operate/roster/new/validation.ts`'s own `looksLikePhone`/
  // `looksLikeEmail` — imported, not duplicated. A blank value is never
  // rejected here; only a value that was actually typed and does not look
  // like its kind is.
  it("rejects an unshaped mobile number and accepts a well-shaped one", async () => {
    const { personId, membershipId } = await givenPlayer();

    const bad = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { mobile: "not a phone number" }),
    );
    expect(bad.errors.mobile).toBe(PHONE_SHAPE);

    const good = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { mobile: "07700 900999" }),
    );
    expect(good.errors.mobile).toBeUndefined();
  });

  it("rejects an unshaped personal email and accepts a well-shaped one", async () => {
    const { personId, membershipId } = await givenPlayer();

    const bad = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { personalEmail: "not an email" }),
    );
    expect(bad.errors.personalEmail).toBe(EMAIL_SHAPE);

    const good = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        personalEmail: `${unique("player-ok")}@example.ox.ac.uk`,
      }),
    );
    expect(good.errors.personalEmail).toBeUndefined();
  });

  it("rejects an unshaped emergency-contact phone and accepts a well-shaped one", async () => {
    const { personId, membershipId } = await givenPlayer();

    const bad = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        emergencyContact: {
          givenName: "Casey",
          familyName: "Ashworth",
          relationship: "Parent",
          phone: "not a phone number",
          email: `${unique("ec")}@example.com`,
        },
      }),
    );
    expect(bad.errors.ec_phone).toBe(PHONE_SHAPE);

    const good = await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));
    expect(good.errors.ec_phone).toBeUndefined();
  });

  it("rejects an unshaped emergency-contact email and accepts a well-shaped one", async () => {
    const { personId, membershipId } = await givenPlayer();

    const bad = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        emergencyContact: {
          givenName: "Casey",
          familyName: "Ashworth",
          relationship: "Parent",
          phone: "07700 900456",
          email: "not an email",
        },
      }),
    );
    expect(bad.errors.ec_email).toBe(EMAIL_SHAPE);

    const good = await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));
    expect(good.errors.ec_email).toBeUndefined();
  });
});

describe("agreeOnboardingDocument", () => {
  it("records the agreement and completes its item with player provenance", async () => {
    const { personId, membershipId } = await givenPlayer();

    const agreement = await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "code_of_conduct",
    });
    expect(agreement.agreementType).toBe("code_of_conduct");

    expect(await itemStatus(membershipId, "code_of_conduct")).toBe("complete");

    const history = await observer.query<{ actor_kind: string; actor_person_id: string | null }>(
      `select h.actor_kind::text as actor_kind, h.actor_person_id
         from public.onboarding_item_history h
         join public.onboarding_items i on i.id = h.onboarding_item_id
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'code_of_conduct'`,
      [membershipId],
    );
    expect(history.rows[0]).toEqual({ actor_kind: "player", actor_person_id: personId });
  });

  it("keeps the two documents independently agreed, each against its own version", async () => {
    const { personId, membershipId } = await givenPlayer();

    const coc = await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "code_of_conduct",
    });
    const release = await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "photo_release",
    });
    expect(coc.agreementVersionId).not.toBe(release.agreementVersionId);

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.agreements.code_of_conduct?.agreementVersionId).toBe(coc.agreementVersionId);
    expect(view?.agreements.photo_release?.agreementVersionId).toBe(release.agreementVersionId);
  });

  it("agreeing to version A never becomes satisfying version B — acceptance 7", async () => {
    const { personId: personA, membershipId: membershipA } = await givenPlayer();

    // Version A: whatever is current when this test starts.
    const agreementA = await agreeOnboardingDocument({
      personId: personA,
      seasonId: openSeasonId,
      membershipId: membershipA,
      agreementType: "code_of_conduct",
    });

    // A new version, later than every existing one, becomes "current" for
    // anybody who agrees from this point on.
    const versionB = await observer.query<{ id: string }>(
      `insert into public.onboarding_agreement_versions (agreement_type, version_label, body, effective_from)
       values ('code_of_conduct', $1, 'Version B — test fixture only', now() + interval '1 hour')
       returning id`,
      [unique("version-b")],
    );
    const versionBId = versionB.rows[0].id;

    try {
      const { personId: personB, membershipId: membershipB } = await givenPlayer();
      const agreementB = await agreeOnboardingDocument({
        personId: personB,
        seasonId: openSeasonId,
        membershipId: membershipB,
        agreementType: "code_of_conduct",
      });

      expect(agreementB.agreementVersionId).toBe(versionBId);
      expect(agreementA.agreementVersionId).not.toBe(versionBId);

      // Person A's own agreement is untouched by the new version existing —
      // agreeing to A never silently becomes "agreeing to B".
      const viewA = await readQuestionnaireView(personA, openSeasonId);
      expect(viewA?.agreements.code_of_conduct?.agreementVersionId).toBe(
        agreementA.agreementVersionId,
      );
    } finally {
      // This test's own extra version, never left behind for another suite
      // to read as "current".
      await observer.query(
        `delete from public.onboarding_agreements where agreement_version_id = $1`,
        [versionBId],
      );
      await observer.query(`delete from public.onboarding_agreement_versions where id = $1`, [
        versionBId,
      ]);
    }
  });
});

describe("claimTrustItem", () => {
  it("records claimed, not complete, with player provenance", async () => {
    const { personId, membershipId } = await givenPlayer();

    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });

    expect(await itemStatus(membershipId, "bucs_play")).toBe("claimed");

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.itemStatus.bucs_play).toBe("claimed");
  });

  it("is a no-op once already claimed — a returning visit never errors", async () => {
    const { personId, membershipId } = await givenPlayer();
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });

    await expect(
      claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" }),
    ).resolves.toBeUndefined();
    expect(await itemStatus(membershipId, "hudl_access")).toBe("claimed");
  });
});

describe("recordHudlNoInvitation", () => {
  it("logs the answer without moving the item's status", async () => {
    const { personId, membershipId } = await givenPlayer();

    await recordHudlNoInvitation({ personId, seasonId: openSeasonId, membershipId });

    expect(await itemStatus(membershipId, "hudl_access")).toBe("pending");
    const activity = await observer.query(
      `select section, channel from public.onboarding_activity_log where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(activity.rows).toEqual([expect.objectContaining({ section: "Hudl" })]);
  });
});

describe("readQuestionnaireView — the finishing sequence", () => {
  it("reports nothing outstanding once every player-owned item is resolved", async () => {
    const { personId, membershipId } = await givenPlayer();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));
    await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "code_of_conduct",
    });
    await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "photo_release",
    });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.nothingOutstanding).toBe(true);
    expect(view?.nextStep).toBe("done");
    expect(view?.outstandingSections).toEqual([]);
  });

  it("never lists an operator-only item (subs, kit, comms) as the player's own outstanding", async () => {
    const { personId } = await givenPlayer();
    const view = await readQuestionnaireView(personId, openSeasonId);
    const labels = view?.outstandingSections.flatMap((s) => s.items.map((i) => i.label)) ?? [];
    expect(labels.join(" ")).not.toMatch(/subscription|kit sorted|squad photo|comms group/i);
  });
});
