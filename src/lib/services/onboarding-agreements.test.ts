// @vitest-environment node
/**
 * The versioned-agreement mechanism — LAN-214. Against the real local
 * database: what is under test is the seasonal one-per-type write and the
 * composite foreign key that ties an agreement to a version of its own type.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import {
  bodyRequiresPrintedName,
  isPlaceholderVersion,
  parseAgreementBody,
} from "./onboarding-agreement-body";
import {
  readCurrentOnboardingAgreementVersionIn,
  readLastSubmittedAgreementFormIn,
  reopenOnboardingAgreementIn,
  readOnboardingAgreementsIn,
  recordOnboardingAgreementIn,
} from "./onboarding-agreements";

const MARKER = "LAN214Agreements";

/** LAN-347: the photo release asks for a printed name, so every photo release agreement here carries one. */
const PRINTED_NAME = "Jordan Ashworth";

let observer: Client;
let seasonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return result.rows[0].id;
}

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await seededActorPersonId(observer);
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor],
  );
  seasonId = season.rows[0].id;
});

afterEach(async () => {
  await observer.query(
    `delete from public.onboarding_agreements where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("readCurrentOnboardingAgreementVersionIn", () => {
  it("reads the seeded labelled placeholder for each document", async () => {
    const codeOfConduct = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "code_of_conduct"),
    );
    expect(codeOfConduct.versionLabel).toBe("placeholder-v1");
    expect(codeOfConduct.body).toMatch(/Placeholder/);

    const photoRelease = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "photo_release"),
    );
    expect(photoRelease.agreementType).toBe("photo_release");
  });

  // LAN-347. The photo release's current version is no longer the placeholder:
  // it is the University's own consent form, and the step renders this body.
  it("reads the University's consent form as the photo release's current version", async () => {
    const version = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "photo_release"),
    );

    expect(version.versionLabel).toBe("oxford-consent-form-v1");
    expect(isPlaceholderVersion(version.versionLabel)).toBe(false);

    // A sample of the University's wording, verbatim — the heading, the party,
    // the two clauses' own sentences and the privacy notice's contact block.
    expect(version.body).toContain("Photograph / filming / interview consent form");
    expect(version.body).toContain(
      "This is a consent form for photos, film or voice recording for the activities below.",
    );
    expect(version.body).toContain(
      "agrees that the University of Oxford can photograph, film or record the voice of",
    );
    expect(version.body).toContain(
      "You confirm that Oxford University can use your photo, film or voice recording for the following activities and purpose:",
    );
    expect(version.body).toContain(
      "This consent form is governed by and construed in accordance with English law",
    );
    expect(version.body).toContain("Data Protection Privacy Notice");
    expect(version.body).toContain("Oxford University Lancers American Football Club");
    expect(version.body).toContain("american.football@sport.ox.ac.uk");
  });

  it("lays the consent form out in the sections the step renders", async () => {
    const version = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "photo_release"),
    );
    const ids = parseAgreementBody(version.body).map((section) => section.id);

    // The form's own order, top to bottom.
    expect(ids).toEqual([
      "heading",
      "lead",
      "event",
      "event-note",
      "date",
      "name",
      "consent-line",
      "consent-line-tail",
      "address",
      "postcode",
      "tel",
      "email",
      "activities-intro",
      "activities",
      "purpose",
      "permissions",
      "clauses",
      "agree",
      "print-name",
      "print-name-tail",
      "privacy",
      "privacy-contact",
    ]);
  });

  it("leaves the Code of Conduct's placeholder exactly where it was", async () => {
    const version = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "code_of_conduct"),
    );
    expect(version.versionLabel).toBe("placeholder-v1");
    expect(isPlaceholderVersion(version.versionLabel)).toBe(true);
    expect(bodyRequiresPrintedName(version.body)).toBe(false);
  });
});

describe("recordOnboardingAgreementIn", () => {
  it("records version, moment and person", async () => {
    const personId = await insertPerson("agree");
    const agreement = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    expect(agreement.personId).toBe(personId);
    expect(agreement.seasonId).toBe(seasonId);
    expect(agreement.agreedAt).toBeInstanceOf(Date);

    const version = await withTransaction((tx) =>
      readCurrentOnboardingAgreementVersionIn(tx, "code_of_conduct"),
    );
    expect(agreement.agreementVersionId).toBe(version.id);
  });

  it("refuses a second agreement for the same person, season and document", async () => {
    const personId = await insertPerson("twice");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    );

    const failure = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_agreements_one_per_person_season_type",
    );
  });

  // LAN-347. The wording decides what the record has to carry: the photo
  // release's version declares a printed name, so an agreement without one is
  // refused; the Code of Conduct's placeholder declares none and records none.
  it("refuses a photo release agreement with no printed name", async () => {
    const personId = await insertPerson("noname");

    const failure = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_agreements_printed_name_required",
    );
    expect(
      await withTransaction((tx) => readOnboardingAgreementsIn(tx, personId, seasonId)),
    ).toEqual([]);
  });

  it("refuses a printed name that is only whitespace", async () => {
    const personId = await insertPerson("blankname");

    const failure = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: "   ",
      }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_agreements_printed_name_required",
    );
  });

  it("stores the printed name as typed, and reads it back", async () => {
    const personId = await insertPerson("typed");
    const recorded = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: "  jordan ASHWORTH  ",
      }),
    );
    // Trimmed of the surrounding whitespace a form always carries, and
    // otherwise exactly as typed — never re-cased or re-ordered.
    expect(recorded.printedName).toBe("jordan ASHWORTH");

    const [readBack] = await withTransaction((tx) =>
      readOnboardingAgreementsIn(tx, personId, seasonId),
    );
    expect(readBack.printedName).toBe("jordan ASHWORTH");
  });

  it("records the Code of Conduct with no printed name, because its wording asks for none", async () => {
    const personId = await insertPerson("coc");
    const agreement = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    expect(agreement.printedName).toBeNull();
  });

  // LAN-347 decision 4. The consent form is its own record: everything the
  // player typed is stored beside the agreement, and nothing about it is a fact
  // about the person. `player-questionnaire.test.ts` proves the person record
  // does not move; this proves the columns hold what was submitted.
  it("stores the submitted consent form beside the agreement", async () => {
    const personId = await insertPerson("form");
    const recorded = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
        form: {
          name: "Jordan Ashworth",
          address: "12 Turl Street\nOxford",
          postcode: "OX1 3DH",
          tel: "07700 900000",
          email: "jordan@example.com",
        },
      }),
    );

    expect(recorded.form).toEqual({
      name: "Jordan Ashworth",
      address: "12 Turl Street\nOxford",
      postcode: "OX1 3DH",
      tel: "07700 900000",
      email: "jordan@example.com",
    });

    const [readBack] = await withTransaction((tx) =>
      readOnboardingAgreementsIn(tx, personId, seasonId),
    );
    expect(readBack.form.address).toBe("12 Turl Street\nOxford");
    expect(readBack.reopenedAt).toBeNull();
  });

  it("stores an unanswered box as not given rather than as a blank", async () => {
    const personId = await insertPerson("blankbox");
    const recorded = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
        form: {
          name: "Jordan Ashworth",
          address: "12 Turl Street",
          postcode: "OX1 3DH",
          tel: "   ",
          email: null,
        },
      }),
    );
    expect(recorded.form.tel).toBeNull();
    expect(recorded.form.email).toBeNull();
  });

  it("records the Code of Conduct's bare tick with no form at all", async () => {
    const personId = await insertPerson("baretick");
    const recorded = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    expect(recorded.form).toEqual({
      name: null,
      address: null,
      postcode: null,
      tel: null,
      email: null,
    });
  });

  it("keeps the two documents independently agreeable", async () => {
    const personId = await insertPerson("both");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    );

    const agreements = await withTransaction((tx) =>
      readOnboardingAgreementsIn(tx, personId, seasonId),
    );
    expect(agreements.map((a) => a.agreementType).sort()).toEqual([
      "code_of_conduct",
      "photo_release",
    ]);
  });
});

// LAN-347. The reopen used to delete the row. It now stamps it, because the row
// carries the consent form the player filled in and the reopened step prefills
// from it — and because a consent that was given is not something an operator's
// click should destroy.
describe("readLastSubmittedAgreementFormIn — the reopened form comes back", () => {
  it("returns the last form submitted, agreed or reopened", async () => {
    const personId = await insertPerson("prefill");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
        form: {
          name: "Jordan Ashworth",
          address: "12 Turl Street\nOxford",
          postcode: "OX1 3DH",
          tel: null,
          email: null,
        },
      }),
    );

    const reopened = await withTransaction((tx) =>
      reopenOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    );
    expect(reopened).toBe(1);

    // Outstanding again to everything that asks what has been agreed …
    expect(
      await withTransaction((tx) => readOnboardingAgreementsIn(tx, personId, seasonId)),
    ).toEqual([]);

    // … and still there to the one reader that looks past the stamp.
    const previous = await withTransaction((tx) =>
      readLastSubmittedAgreementFormIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
      }),
    );
    expect(previous?.form.address).toBe("12 Turl Street\nOxford");
    expect(previous?.form.postcode).toBe("OX1 3DH");
    expect(previous?.reopenedAt).toBeInstanceOf(Date);
  });

  it("returns nothing for a person who has never submitted one", async () => {
    const personId = await insertPerson("never");
    const previous = await withTransaction((tx) =>
      readLastSubmittedAgreementFormIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
      }),
    );
    expect(previous).toBeNull();
  });
});

describe("reopenOnboardingAgreementIn — LAN-240's reopen", () => {
  it("retires the season's row so the same document can be agreed again", async () => {
    const personId = await insertPerson("reopen");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    );

    const removed = await withTransaction((tx) =>
      reopenOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    );
    expect(removed).toBe(1);
    expect(
      await withTransaction((tx) => readOnboardingAgreementsIn(tx, personId, seasonId)),
    ).toEqual([]);

    // The point of the reopen: the player can now genuinely re-agree, where
    // before `onboarding_agreements_one_per_person_season_type` refused them.
    const again = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    );
    expect(again.agreementType).toBe("photo_release");
  });

  it("leaves the other document alone", async () => {
    const personId = await insertPerson("onlyone");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, {
        personId,
        seasonId,
        agreementType: "photo_release",
        printedName: PRINTED_NAME,
      }),
    );

    await withTransaction((tx) =>
      reopenOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    );

    const agreements = await withTransaction((tx) =>
      readOnboardingAgreementsIn(tx, personId, seasonId),
    );
    expect(agreements.map((a) => a.agreementType)).toEqual(["code_of_conduct"]);
  });

  it("reports zero, rather than failing, when there was nothing on file", async () => {
    const personId = await insertPerson("nothing");
    const removed = await withTransaction((tx) =>
      reopenOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    expect(removed).toBe(0);
  });
});
