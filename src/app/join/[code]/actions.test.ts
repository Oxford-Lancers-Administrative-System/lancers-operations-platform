// @vitest-environment node
/**
 * The QR door's two server actions, end to end — LAN-202. Against the real
 * local database: this is what actually proves "a recruit arriving by QR is
 * created with consent granted" (LAN-202 "Done when") — the service-layer
 * suite proves the write; this proves the code-in-the-URL resolves to it.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { mintRecruitmentSignupCodeIn } from "@/lib/services/recruitment-signup-codes";
import { openObserver, seededIdentityCreatedAt } from "../../../../tests/helpers/service-layer";
import { checkForExistingQrRecruit, submitQrSignup } from "./actions";
import type { SignupFieldValues } from "./signup-form";

const MARKER = "LAN202QrActionSuite";

let observer: Client;
let seasonId: string;

function values(overrides: Partial<SignupFieldValues> = {}): SignupFieldValues {
  return {
    givenName: MARKER,
    familyName: "Recruit",
    mobile: "",
    email: "",
    knownAs: "",
    college: "",
    matriculationYear: "",
    expectedGraduationYear: "",
    degreeField: "",
    ...overrides,
  };
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
});

afterEach(async () => {
  const people = "(select id from public.people where given_name = $1)";
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
  await observer.query(`delete from public.recruitment_signup_codes where season_id = $1::uuid`, [
    seasonId,
  ]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

async function mintCode(): Promise<string> {
  const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
  return minted.code;
}

describe("submitQrSignup", () => {
  it("resolves the code, creates the recruit, and grants consent", async () => {
    const code = await mintCode();
    const outcome = await submitQrSignup(code, {
      ...values(),
      consent: true,
      linkExistingPersonId: null,
    });
    expect(outcome).toEqual({ ok: true });

    const consent = await observer.query(
      `select state::text as state from public.season_messaging_consents
        where season_id = $1::uuid and person_id = (select id from public.people where given_name = $2)`,
      [seasonId, MARKER],
    );
    expect(consent.rows[0]?.state).toBe("granted");
  });

  it("refuses with a club-language message when the tick is missing — never a stack trace", async () => {
    const code = await mintCode();
    const outcome = await submitQrSignup(code, {
      ...values(),
      consent: false,
      linkExistingPersonId: null,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/tick/i);
  });

  it("refuses an unknown code, gracefully", async () => {
    const outcome = await submitQrSignup("this-code-was-never-minted", {
      ...values(),
      consent: true,
      linkExistingPersonId: null,
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("checkForExistingQrRecruit", () => {
  it("finds nobody when no match exists", async () => {
    const result = await checkForExistingQrRecruit(MARKER, "");
    expect(result).toEqual({ found: false, matchedPersonId: null });
  });
});
