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
import { generateOnboardingItems, resolveOnboardingItem } from "./membership";
import { PRINTED_NAME_REQUIRED_MESSAGE, readOnboardingAgreements } from "./onboarding-agreements";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import { resolveOpenSeason } from "./roster";
import { readPersonRecord } from "./person-record";
import { updatePersonField } from "./person-write";
import {
  ADDRESS_REQUIRED_MESSAGE,
  agreeOnboardingDocument,
  claimTrustItem,
  emergencyContactIsComplete,
  photoReleasePrefill,
  POSTCODE_REQUIRED_MESSAGE,
  readLastPhotoReleaseForm,
  readQuestionnaireView,
  saveDetailsStep,
  savePhotoRelease,
  type DetailsStepInput,
  type PhotoReleaseInput,
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

/**
 * F2 (LAN-230): a fresh player whose membership carries **no** generated
 * `onboarding_items` at all — deliberately never calling
 * `generateOnboardingItems`, the exact "a season with no configured item
 * types yields no items" state that function's own module note names as
 * real, not a failure.
 */
async function givenPlayerWithNoItems(): Promise<{ personId: string; membershipId: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Testcase') returning id`,
    [unique("PersonNoItems")],
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

  return { personId, membershipId };
}

/** One onboarding item's own id, for the tests that drive an operator's resolution of it. */
async function onboardingItemId(membershipId: string, code: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `select i.id
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
      where i.season_membership_id = $1::uuid and t.code = $2`,
    [membershipId, code],
  );
  return result.rows[0].id;
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
      student_number: "1234567",
      bafa_registration_number: "BAFA-1234",
      date_of_birth: "2005-03-14",
    },
    mobile: "07700 900123",
    collegeEmail: `${unique("player")}@balliol.ox.ac.uk`,
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

  // F1 (LAN-230, critical): this used to abort the *entire* submission the
  // moment any single field failed its own shape check — nine valid fields
  // plus one malformed one wrote zero rows. Brian's own confirmed
  // requirement (2026-09-02): "Whatever a step saved stays saved… never
  // discards." Restoring the old `if (Object.keys(errors).length > 0) return
  // { errors, outcomes: {} }` early-return reproduces the exact regression
  // this test guards: every field below still writes except the one shape
  // error names.
  it("keeps every valid field's write when one field is malformed — F1", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, { mobile: "not a phone number" }),
    );
    expect(result.errors.mobile).toBe(PHONE_SHAPE);

    const view = await readQuestionnaireView(personId, openSeasonId);
    // The nine other valid fields committed even though mobile did not.
    expect(view?.person.givenName).toBe("Jordan");
    expect(view?.person.familyName).toBe("Ashworth");
    expect(view?.person.college).toBe("Brasenose");
    expect(view?.emergencyContact?.email).not.toBeNull();
    expect(view?.needsConsentStep).toBe(false); // grantConsent is unaffected
  });

  it("writes nothing for a malformed field itself, leaving the prior value in place", async () => {
    const { personId, membershipId } = await givenPlayer();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        grantConsent: false,
        mobile: "not a phone number",
        fields: { college: "Farrowgate" },
      }),
    );

    const view = await readQuestionnaireView(personId, openSeasonId);
    // College (valid) changed; mobile (invalid) kept its prior, well-formed value.
    expect(view?.person.college).toBe("Farrowgate");
    const mobile = view?.person.contacts.find((c) => c.kind === "phone" && c.validUntil === null);
    expect(mobile?.rawValue).toBe("07700 900123");
  });

  it("keeps a matriculation-year shape error from blocking the rest of the same submission — F1", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        fields: {
          given_name: "Jordan",
          family_name: "Ashworth",
          college: "Brasenose",
          matriculation_year: "not-a-year",
          expected_graduation_year: "2027",
          degree_field: "Engineering Science",
          date_of_birth: "2005-03-14",
        },
      }),
    );
    expect(result.errors.matriculation_year).toBeTruthy();

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.person.college).toBe("Brasenose");
    expect(view?.person.expectedGraduationYear).toBe(2027);
    expect(view?.person.matriculationYear).toBeNull(); // the malformed one alone stayed unwritten
  });

  /**
   * LAN-245, walker M7's finding M7-03: 31/12/2030 in the segmented picker
   * reached `people_date_of_birth_in_the_past` and the refusal escaped the
   * server action as a 500 and the generic error boundary. It has to behave
   * exactly as the malformed matriculation year above already does — an
   * inline field message, everything else in the same submission kept.
   */
  it("refuses a future date of birth inline, keeping the rest of the same submission — LAN-245", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await saveDetailsStep(
      baseDetailsInput(personId, openSeasonId, membershipId, {
        fields: {
          given_name: "Jordan",
          family_name: "Ashworth",
          college: "Brasenose",
          matriculation_year: "2024",
          expected_graduation_year: "2027",
          degree_field: "Engineering Science",
          date_of_birth: "2030-12-31",
        },
      }),
    );

    expect(result.errors.date_of_birth).toBe("A date of birth has to be in the past.");

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.person.dateOfBirth).toBeNull(); // the future one alone stayed unwritten
    expect(view?.person.college).toBe("Brasenose");
    expect(view?.person.matriculationYear).toBe(2024);
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

  it("overwrites an operator-recorded value with the player's own submission — B-002, last write wins", async () => {
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
    expect(result.outcomes.college).toBe("overwritten");

    const view = await readQuestionnaireView(personId, openSeasonId);
    // The disputed-fact mechanism is gone (B-002): the player's answer simply
    // takes effect, and no open dispute is ever raised.
    expect(view?.person.college).toBe("Brasenose");
    expect(view?.openDisputedFields.has("college")).toBe(false);
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
      printedName: "Jordan Ashworth",
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

describe("savePhotoRelease — the University's consent form, LAN-347", () => {
  /** Everything the form posts, all of it valid, overridable per test. */
  function submission(
    personId: string,
    membershipId: string,
    overrides: Partial<PhotoReleaseInput> = {},
  ): PhotoReleaseInput {
    return {
      personId,
      seasonId: openSeasonId,
      membershipId,
      name: "Jordan Ashworth",
      address: "12 Turl Street\nOxford",
      postcode: "OX1 3DH",
      tel: "07700 900000",
      email: "jordan@example.com",
      printedName: "Jordan Ashworth",
      agreed: true,
      ...overrides,
    };
  }

  /**
   * Everything this person *is*, as the database holds it — decision 4's
   * subject. The whole `people` row and every contact point, read through the
   * observer and compared as one string, so the comparison is byte-for-byte
   * rather than field-by-field: a column this test never heard of is caught
   * too.
   */
  async function personState(personId: string): Promise<string> {
    const person = await observer.query<{ row: unknown }>(
      "select to_jsonb(p.*) as row from public.people p where p.id = $1::uuid",
      [personId],
    );
    const contacts = await observer.query<{ row: unknown }>(
      `select to_jsonb(c.*) as row from public.contact_points c
        where c.person_id = $1::uuid order by c.id`,
      [personId],
    );
    return JSON.stringify([person.rows[0]?.row, contacts.rows.map((r) => r.row)]);
  }

  /** The submitted form as the agreement row actually holds it. */
  async function storedForm(personId: string): Promise<Record<string, unknown>> {
    const result = await observer.query<Record<string, unknown>>(
      `select printed_name, form_name, form_address, form_postcode, form_tel, form_email
         from public.onboarding_agreements
        where person_id = $1::uuid and agreement_type = 'photo_release'
        order by agreed_at desc limit 1`,
      [personId],
    );
    return result.rows[0];
  }

  it("records the agreement and stores the whole form beside it", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await savePhotoRelease(submission(personId, membershipId));

    expect(result.errors).toEqual({});
    expect(result.agreement?.printedName).toBe("Jordan Ashworth");
    expect(result.agreement?.agreedAt).toBeInstanceOf(Date);
    expect(await itemStatus(membershipId, "photo_release")).toBe("complete");

    expect(await storedForm(personId)).toEqual({
      printed_name: "Jordan Ashworth",
      form_name: "Jordan Ashworth",
      form_address: "12 Turl Street\nOxford",
      form_postcode: "OX1 3DH",
      form_tel: "07700 900000",
      form_email: "jordan@example.com",
    });
  });

  /**
   * Decision 4, and the whole point of the rework: "nothing in this form should
   * change anything else… it's just a record". The submission below carries a
   * different name, a different phone and a different email from the record,
   * and the record is identical afterwards, byte for byte.
   */
  it("leaves the person record byte-for-byte unchanged, whatever is typed", async () => {
    const { personId, membershipId } = await givenPlayer();
    const before = await personState(personId);

    const result = await savePhotoRelease(
      submission(personId, membershipId, {
        name: "Someone Else Entirely",
        tel: "07700 900999",
        email: "someone.else@example.com",
      }),
    );

    expect(result.agreement).not.toBeNull();
    expect(await personState(personId)).toBe(before);

    // Nor by the side door: no person fact was audited as changed.
    const audits = await observer.query(
      `select action from public.audit_events
        where entity_table in ('people', 'contact_points') and entity_id = $1::uuid`,
      [personId],
    );
    expect(audits.rows).toEqual([]);

    // What they typed is on the form, which is the only place it goes.
    const form = await storedForm(personId);
    expect(form.form_name).toBe("Someone Else Entirely");
    expect(form.form_tel).toBe("07700 900999");
    expect(form.form_email).toBe("someone.else@example.com");
  });

  it("stores a phone and an email of any shape, because nothing will ever send to them", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await savePhotoRelease(
      submission(personId, membershipId, { tel: "398393", email: "not-an-email" }),
    );

    expect(result.errors).toEqual({});
    const form = await storedForm(personId);
    expect(form.form_tel).toBe("398393");
    expect(form.form_email).toBe("not-an-email");
  });

  it("stores a box left blank as not given, rather than as a blank", async () => {
    const { personId, membershipId } = await givenPlayer();

    await savePhotoRelease(submission(personId, membershipId, { tel: "", email: "   " }));

    const form = await storedForm(personId);
    expect(form.form_tel).toBeNull();
    expect(form.form_email).toBeNull();
  });

  it("stores the address on the lines it was written on, without a browser's carriage returns", async () => {
    const { personId, membershipId } = await givenPlayer();

    // What a textarea actually posts.
    await savePhotoRelease(
      submission(personId, membershipId, { address: "12 Turl Street\r\nOxford" }),
    );

    expect((await storedForm(personId)).form_address).toBe("12 Turl Street\nOxford");
  });

  it("refuses a blank address, and says which box is missing", async () => {
    const { personId, membershipId } = await givenPlayer();
    const before = await personState(personId);

    const result = await savePhotoRelease(submission(personId, membershipId, { address: "  " }));

    expect(result.errors.address).toBe(ADDRESS_REQUIRED_MESSAGE);
    expect(result.agreement).toBeNull();
    // A refusal records nothing at all: the step is still outstanding, no
    // agreement exists, and the person record never moved.
    expect(await itemStatus(membershipId, "photo_release")).toBe("pending");
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
    expect(await personState(personId)).toBe(before);
  });

  it("refuses a blank post code, and says which box is missing", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await savePhotoRelease(submission(personId, membershipId, { postcode: "" }));

    expect(result.errors.postcode).toBe(POSTCODE_REQUIRED_MESSAGE);
    expect(result.agreement).toBeNull();
    expect(await itemStatus(membershipId, "photo_release")).toBe("pending");
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
  });

  it("refuses a blank printed name", async () => {
    const { personId, membershipId } = await givenPlayer();

    const result = await savePhotoRelease(submission(personId, membershipId, { printedName: "" }));

    expect(result.errors.printedName).toBe(PRINTED_NAME_REQUIRED_MESSAGE);
    expect(result.agreement).toBeNull();
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
  });

  it("refuses an unticked form and records nothing", async () => {
    const { personId, membershipId } = await givenPlayer();
    const before = await personState(personId);

    const result = await savePhotoRelease(submission(personId, membershipId, { agreed: false }));

    expect(result.agreeError).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.agreement).toBeNull();
    expect(await itemStatus(membershipId, "photo_release")).toBe("pending");
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
    expect(await personState(personId)).toBe(before);
  });

  it("starts empty, except for what the record already holds", async () => {
    const { personId } = await givenPlayer();

    const prefill = photoReleasePrefill(await readPersonRecord(personId), null);

    expect(prefill.address).toBe("");
    expect(prefill.postcode).toBe("");
    expect(prefill.printedName).toBe("");
  });

  it("prefills a reopened form with the address and post code it was given (LAN-240)", async () => {
    const { personId, membershipId } = await givenPlayer();
    await savePhotoRelease(submission(personId, membershipId));

    // The operator sets the item back off complete, which is LAN-240's reopen.
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: await onboardingItemId(membershipId, "photo_release"),
      status: "pending",
      reason: "Reopened so the player can agree again.",
    });

    // The document is outstanding again …
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
    // … and the form comes back as it was written, except the printed name.
    const record = await readPersonRecord(personId);
    const previous = await readLastPhotoReleaseForm(personId, openSeasonId);
    const prefill = photoReleasePrefill(record, previous);
    expect(prefill.address).toBe("12 Turl Street\nOxford");
    expect(prefill.postcode).toBe("OX1 3DH");
    expect(prefill.printedName).toBe("");
    // Name, tel and email are the record's, not the reopened form's.
    expect(prefill.name).toBe(record.displayName);

    // And it can genuinely be agreed again.
    const again = await savePhotoRelease(submission(personId, membershipId));
    expect(again.agreement).not.toBeNull();
  });

  it("puts the printed name and the date on the view the operator's record reads", async () => {
    const { personId, membershipId } = await givenPlayer();
    await savePhotoRelease(submission(personId, membershipId));

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.agreements.photo_release?.printedName).toBe("Jordan Ashworth");
    expect(view?.documentAgreed.photo_release).toBe(true);
    // The step renders the version it was agreed against, not a literal.
    expect(view?.agreementVersions.photo_release.versionLabel).toBe("oxford-consent-form-v1");
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

  // F2 (LAN-230): a membership with no configured item of this code used to
  // make this whole call a silent no-op — the player's own claim recorded
  // nowhere at all. Restoring the old `if (!item || ...) return;` guard
  // reproduces exactly this: the activity log stays empty.
  it("still records the player's answer when there is no item to move — F2", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();

    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });

    const activity = await observer.query(
      `select section, channel, actor_person_id from public.onboarding_activity_log
        where season_membership_id = $1::uuid`,
      [membershipId],
    );
    expect(activity.rows).toEqual([
      expect.objectContaining({ section: "BUCS Play", actor_person_id: personId }),
    ]);
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
      printedName: "Jordan Ashworth",
    });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.nothingOutstanding).toBe(true);
    expect(view?.nextStep).toBe("done");
    expect(view?.outstandingSections).toEqual([]);
  });

  /**
   * LAN-240, walker M7's blocker (finding M7-01), end to end: the operator
   * reopens, and the player's own link has to see it. Before the fix, step 4
   * of the reproduction read "There is nothing left to fill in" and step 5
   * showed "Already agreed" beneath a navigator saying "Outstanding".
   */
  it("resumes at a reopened agreement, and reports it outstanding, not already agreed", async () => {
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
      printedName: "Jordan Ashworth",
    });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });
    expect((await readQuestionnaireView(personId, openSeasonId))?.nothingOutstanding).toBe(true);

    // The shipped reopen mechanism (D-002): the operator names the item's own
    // state, back to "No". There is no separate reopen verb.
    const itemId = await observer.query<{ id: string }>(
      `select i.id from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'photo_release'`,
      [membershipId],
    );
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: itemId.rows[0].id,
      status: "pending",
    });

    const agreements = await readOnboardingAgreements(personId, openSeasonId);
    expect(agreements.map((a) => a.agreementType)).toEqual(["code_of_conduct"]);

    const view = await readQuestionnaireView(personId, openSeasonId);
    // Step 4 of the reproduction: a bare load resumes at the reopened step.
    expect(view?.nothingOutstanding).toBe(false);
    expect(view?.nextStep).toBe("photo_release");
    expect(view?.outstandingSections.map((s) => s.section)).toEqual(["Photo release"]);
    // Step 5: the step itself reads outstanding, and the panel that used to
    // print "Already agreed" is driven by this same answer.
    expect(view?.documentAgreed).toEqual({ code_of_conduct: true, photo_release: false });

    // And the player can genuinely act on it — the write that
    // `onboarding_agreements_one_per_person_season_type` used to refuse.
    await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "photo_release",
      printedName: "Jordan Ashworth",
    });
    const after = await readQuestionnaireView(personId, openSeasonId);
    expect(after?.nothingOutstanding).toBe(true);
    expect(after?.documentAgreed.photo_release).toBe(true);
  });

  it("keeps the agreement's own record when an item is set to a state that is still complete", async () => {
    const { personId, membershipId } = await givenPlayer();
    await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "code_of_conduct",
    });

    // Not a reopen: `complete` → `complete` is refused as a no-op, so the
    // only transitions this item has are to and from `pending`. Reopening and
    // re-completing by hand must leave the player able to agree, and must not
    // remove a row the second time round.
    const itemId = await observer.query<{ id: string }>(
      `select i.id from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid and t.code = 'code_of_conduct'`,
      [membershipId],
    );
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: itemId.rows[0].id,
      status: "pending",
    });
    await resolveOnboardingItem({
      actorPersonId,
      membershipId,
      itemId: itemId.rows[0].id,
      status: "complete",
    });

    // The operator marked it done themselves. The agreement row stays gone —
    // nobody re-agreed — but the item is what the player's link obeys, so the
    // step is settled and the player is not asked again.
    expect(await readOnboardingAgreements(personId, openSeasonId)).toEqual([]);
    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.documentAgreed.code_of_conduct).toBe(true);
  });

  it("never lists an operator-only item (subs, kit, comms) as the player's own outstanding", async () => {
    const { personId } = await givenPlayer();
    const view = await readQuestionnaireView(personId, openSeasonId);
    const labels = view?.outstandingSections.flatMap((s) => s.items.map((i) => i.label)) ?? [];
    expect(labels.join(" ")).not.toMatch(/subscription|kit distributed|squad photo|comms group/i);
  });

  // F2 (LAN-230, critical): a membership with no generated `onboarding_items`
  // used to default every one of the four codes' status to `"complete"`,
  // reporting `nothingOutstanding: true` and `nextStep: "done"` for a player
  // who has done nothing — the natural walk skipped straight from step 1 to
  // the done page, and BUCS/Hudl claims silently no-opped. Restoring the old
  // `itemByCode.get(code) ?? "complete"` fallback reproduces exactly this:
  // every assertion below flips.
  it("never treats a membership with no configured onboarding items as complete — F2", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.itemStatus.code_of_conduct).toBeNull();
    expect(view?.itemStatus.photo_release).toBeNull();
    expect(view?.itemStatus.bucs_play).toBeNull();
    expect(view?.itemStatus.hudl_access).toBeNull();
    expect(view?.nothingOutstanding).toBe(false);
    expect(view?.nextStep).toBe("code_of_conduct");
    expect(view?.outstandingSections.map((s) => s.section)).toEqual(
      expect.arrayContaining(["Code of Conduct", "Photo release", "BUCS Play", "Hudl"]),
    );
  });

  // F2's own necessary companion, found walking the fix live: with no
  // `code_of_conduct` item to mark complete, `agreeDocument`'s own advance
  // (`nextStepUrl`, a *resume* to the next outstanding step, unlike BUCS/Hudl's
  // unconditional `literalNextStepUrl`) would otherwise loop the player back
  // to the same step forever after they had already agreed. `agreements` is
  // the item-independent record of that fact.
  it("still advances past Code of Conduct once agreed, even with no configured item", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    await agreeOnboardingDocument({
      personId,
      seasonId: openSeasonId,
      membershipId,
      agreementType: "code_of_conduct",
    });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.itemStatus.code_of_conduct).toBeNull(); // still honestly unconfigured
    expect(view?.nextStep).toBe("photo_release"); // but no longer stuck resuming here
  });

  // B1 (LAN-230 correction round 1) — the identical deadlock as the test
  // above, for the two trust items, which the first correction round missed:
  // `bucsDone`/`hudlDone` had no item-independent signal, so a player who
  // genuinely claimed both on a membership with no configured items was left
  // `nothingOutstanding: false`, `nextStep: "bucs_play"`, on every reopen of
  // the link, forever. Restoring `bucsDone`/`hudlDone` to check only
  // `itemStatus` (dropping the `|| trustClaimed…` half) reproduces exactly
  // this.
  it("lets the player finish after claiming BUCS Play and Hudl, even with no configured items — B1", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();
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
      printedName: "Jordan Ashworth",
    });

    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "hudl_access" });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.itemStatus.bucs_play).toBeNull(); // still honestly unconfigured
    expect(view?.itemStatus.hudl_access).toBeNull();
    expect(view?.nothingOutstanding).toBe(true); // but no longer stuck forever
    expect(view?.nextStep).toBe("done");
  });

  // The mirror case: claiming only one of the two must not silently resolve
  // the other — `trustClaimed` is per-code, not a single blanket flag.
  it("still resumes at Hudl when only BUCS Play was claimed, with no configured items", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();
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
      printedName: "Jordan Ashworth",
    });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.nothingOutstanding).toBe(false);
    expect(view?.nextStep).toBe("hudl");
  });

  // Hudl's "no invitation has reached me" answer must never masquerade as a
  // claim — it does not complete the item when one exists, and must not
  // complete it item-independently either.
  it("never treats 'no invitation has reached me' as a Hudl claim, with no configured items", async () => {
    const { personId, membershipId } = await givenPlayerWithNoItems();
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
      printedName: "Jordan Ashworth",
    });
    await claimTrustItem({ personId, seasonId: openSeasonId, membershipId, code: "bucs_play" });

    // LAN-333: Hudl is answered by claiming it, and by nothing else. Leaving it
    // unanswered is what keeps the sequence pointing at it.
    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.nothingOutstanding).toBe(false);
    expect(view?.nextStep).toBe("hudl");
  });
});

describe("readQuestionnaireView — F4: who actually supplied each field (LAN-230)", () => {
  it("reads null for a value nobody attributable has touched", async () => {
    const { personId } = await givenPlayer();
    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.fieldSuppliedBy.college).toBeNull();
  });

  it("reads 'you' for a field the player themselves supplied, whatever the field", async () => {
    const { personId, membershipId } = await givenPlayer();
    // `college` — hard-coded "the club" by the old, broken display.
    await saveDetailsStep(baseDetailsInput(personId, openSeasonId, membershipId));

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.fieldSuppliedBy.college).toBe("you");
    expect(view?.fieldSuppliedBy.given_name).toBe("you");
  });

  it("reads 'club' for a field an operator supplied, whatever the field", async () => {
    const { personId } = await givenPlayer();
    // `given_name` — hard-coded "you" by the old, broken display.
    await updatePersonField({
      actorPersonId,
      personId,
      field: "given_name",
      value: "Operator-Set",
      reason: "Test fixture correction.",
    });

    const view = await readQuestionnaireView(personId, openSeasonId);
    expect(view?.fieldSuppliedBy.given_name).toBe("club");
  });
});
