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
  readCurrentOnboardingAgreementVersionIn,
  readOnboardingAgreementsIn,
  recordOnboardingAgreementIn,
} from "./onboarding-agreements";

const MARKER = "LAN214Agreements";

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
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    );

    const failure = await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
    ).catch((error: unknown) => error);

    expect(isServiceError(failure) && failure.rule).toBe(
      "onboarding_agreements_one_per_person_season_type",
    );
  });

  it("keeps the two documents independently agreeable", async () => {
    const personId = await insertPerson("both");
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "code_of_conduct" }),
    );
    await withTransaction((tx) =>
      recordOnboardingAgreementIn(tx, { personId, seasonId, agreementType: "photo_release" }),
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
