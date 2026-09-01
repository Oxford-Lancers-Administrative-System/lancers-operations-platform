// @vitest-environment node
/**
 * The sign-up gate's one write — LAN-202. Against the real local database:
 * the guarantees under test are `recruitment_prospects_one_per_person_per_season`,
 * `season_messaging_consents_one_per_person_per_season`,
 * `person_aliases_unique_per_person` and `contact_points_one_preferred_per_kind`
 * — none of which a mocked transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import {
  probeExistingRecruitForQrSignup,
  readSignupPrefillIn,
  SIGNUP_INVALID_EMAIL_RULE,
  SIGNUP_INVALID_EXPECTED_GRADUATION_YEAR_RULE,
  SIGNUP_INVALID_MATRICULATION_YEAR_RULE,
  SIGNUP_INVALID_MOBILE_RULE,
  SIGNUP_REQUIRES_CONSENT_RULE,
  SIGNUP_REQUIRES_FIRST_NAME_RULE,
  SIGNUP_REQUIRES_LAST_NAME_RULE,
  SIGNUP_REQUIRES_MOBILE_RULE,
  signUpAnonymouslyIn,
  signUpWithTokenIn,
  type SignupSubmission,
} from "./recruitment-signup";
import { mintRecruitmentSignupCodeIn } from "./recruitment-signup-codes";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN202SignupSuite";

let observer: Client;
let seasonId: string;

function baseSubmission(overrides: Partial<SignupSubmission> = {}): SignupSubmission {
  return {
    givenName: MARKER,
    familyName: "Recruit",
    // Mobile is required (Brian, 2026-09-01, finding 1) — every fixture
    // carries a fresh, valid one by default; a test about mobile itself
    // overrides it.
    mobile: uniquePhone(),
    consent: true,
    ...overrides,
  };
}

/**
 * A phone number unlikely to collide with the ~87 real-shaped contact points
 * in the seeded synthetic dataset — every fixture below that needs a mobile
 * derives it from this rather than a fixed literal, so a test asserting an
 * exact duplicate-check result cannot be made to pass or fail by an
 * incidental seed collision.
 */
let phoneCounter = 0;
// Fixed at 11 digits total (a UK number's own length: a leading 0 plus ten
// more) regardless of how large the counter grows within one run — a two-
// digit counter previously overflowed this into a 12-digit number the
// now-mandatory phone validation correctly refused (finding 2).
function uniquePhone(): string {
  phoneCounter += 1;
  return `07${String(Date.now()).slice(-7)}${String(phoneCounter % 100).padStart(2, "0")}`;
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
  await observer.query(`delete from public.person_aliases where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.contact_points where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.recruitment_signup_codes where season_id = $1::uuid`, [
    seasonId,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
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

describe("validateSignupSubmission (via signUpAnonymouslyIn)", () => {
  it("refuses a blank first name", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ givenName: "  " }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_FIRST_NAME_RULE });
    });
  });

  it("refuses a blank last name", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ familyName: "" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_LAST_NAME_RULE });
    });
  });

  it("refuses an unticked consent box — proved by test (LAN-202 Done when)", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ consent: false }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_CONSENT_RULE });
    });
  });

  it("saves and blocks nothing when every optional field is blank", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission(),
      }),
    );
    expect(result.personCreated).toBe(true);
    expect(result.prospectCreated).toBe(true);
  });

  // Finding 1, Brian 2026-09-01: "Mobile is required no matter what…
  // Missing never blocks except for phone."
  it("refuses a blank mobile number", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ mobile: "  " }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_MOBILE_RULE });
    });
  });

  // Finding 2: the shared person-validation.ts standard, not a locally
  // re-derived rule — "07" with no more digits is not a real UK number.
  it("refuses a mobile number that does not validate", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ mobile: "07" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_INVALID_MOBILE_RULE });
    });
  });

  // Finding 3: optional, but validated when supplied rather than silently
  // discarded — the sign-up form had no validation at all before this.
  it("refuses a malformed email address when one is supplied", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ email: "not-an-email" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_INVALID_EMAIL_RULE });
    });
  });

  it("refuses a malformed matriculation year instead of silently discarding it — finding 3", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ matriculationYear: "twenty-twenty-four" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_INVALID_MATRICULATION_YEAR_RULE });
    });
  });

  it("refuses an out-of-range expected graduation year instead of silently discarding it — finding 3", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ expectedGraduationYear: "3050" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_INVALID_EXPECTED_GRADUATION_YEAR_RULE });
    });
  });
});

describe("signUpAnonymouslyIn — the QR door", () => {
  it("creates a person with consent granted for this season", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({ mobile: "07700900123" }),
      }),
    );

    const consent = await observer.query(
      `select state::text as state, source::text as source
         from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [result.personId, seasonId],
    );
    expect(consent.rows[0]).toEqual({ state: "granted", source: "qr_self_entry" });

    const prospect = await observer.query(
      `select status::text as status from public.recruitment_prospects where id = $1::uuid`,
      [result.prospectId],
    );
    expect(prospect.rows[0].status).toBe("identified");
  });

  it("bumps the signup code's own sign-in counter", async () => {
    const code = await mintCode();
    await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, { seasonId, code, submission: baseSubmission() }),
    );
    const row = await observer.query<{ sign_in_count: number }>(
      `select sign_in_count from public.recruitment_signup_codes where code = $1`,
      [code],
    );
    expect(row.rows[0].sign_in_count).toBe(1);
  });

  it('"Known as" writes a person_aliases row, and the person is findable by it', async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({ knownAs: `${MARKER}Alias` }),
      }),
    );

    const alias = await observer.query(
      `select alias, is_display_name from public.person_aliases where person_id = $1::uuid`,
      [result.personId],
    );
    expect(alias.rows[0]).toMatchObject({ alias: `${MARKER}Alias`, is_display_name: true });

    const findable = await observer.query(
      `select 1 from public.people p
        where exists (select 1 from public.person_aliases a where a.person_id = p.id and a.alias = $1)`,
      [`${MARKER}Alias`],
    );
    expect(findable.rows.length).toBe(1);
  });

  it('does not write an alias when "Known as" repeats the given name', async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({ knownAs: MARKER }),
      }),
    );
    const alias = await observer.query(
      `select 1 from public.person_aliases where person_id = $1::uuid`,
      [result.personId],
    );
    expect(alias.rows.length).toBe(0);
  });

  it("fills college, matriculation year and contact values onto the new person", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({
          mobile: "07700900456",
          email: "recruit@example.ac.uk",
          college: "Kestrelhall",
          matriculationYear: "2026",
        }),
      }),
    );

    const person = await observer.query(
      `select college, matriculation_year from public.people where id = $1::uuid`,
      [result.personId],
    );
    expect(person.rows[0]).toEqual({ college: "Kestrelhall", matriculation_year: 2026 });

    const contacts = await observer.query(
      `select kind::text as kind, raw_value from public.contact_points where person_id = $1::uuid order by kind`,
      [result.personId],
    );
    expect(contacts.rows).toEqual(
      expect.arrayContaining([
        { kind: "email", raw_value: "recruit@example.ac.uk" },
        { kind: "phone", raw_value: "07700900456" },
      ]),
    );
  });

  // Finding 2: reuses person-validation.ts's own validatePhoneNumber, and
  // stores its E.164 digits as normalised_value alongside the raw typed
  // text — raw_value stays exactly what the recruit typed, on
  // contact_points' own "deliberately unvalidated" rule; normalised_value is
  // the separate, reversible step that rule already names.
  it("stores the mobile's own E.164 digits as normalised_value, raw_value unchanged", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({ mobile: "07700 900457" }),
      }),
    );

    const contact = await observer.query<{ raw_value: string; normalised_value: string | null }>(
      `select raw_value, normalised_value from public.contact_points
        where person_id = $1::uuid and kind = 'phone'`,
      [result.personId],
    );
    expect(contact.rows[0]).toEqual({
      raw_value: "07700 900457",
      normalised_value: "447700900457",
    });
  });

  it("links to an existing person rather than creating a second, when confirmed", async () => {
    const code = await mintCode();
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Existing') returning id`,
      [MARKER],
    );
    const existingPersonId = existing.rows[0].id;

    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission(),
        linkExistingPersonId: existingPersonId,
      }),
    );

    expect(result.personCreated).toBe(false);
    expect(result.personId).toBe(existingPersonId);

    const people = await observer.query(
      `select count(*)::int as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe(1);
  });

  it("falls back to creating a new person when the linked id no longer resolves — refuses nobody", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission(),
        linkExistingPersonId: "00000000-0000-0000-0000-000000000000",
      }),
    );
    expect(result.personCreated).toBe(true);
  });

  it("creates no second recruit row on a repeat submission for the same person and season", async () => {
    const code = await mintCode();
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Existing') returning id`,
      [MARKER],
    );
    const existingPersonId = existing.rows[0].id;

    const first = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission(),
        linkExistingPersonId: existingPersonId,
      }),
    );
    const second = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission(),
        linkExistingPersonId: existingPersonId,
      }),
    );

    expect(second.prospectCreated).toBe(false);
    expect(second.prospectId).toBe(first.prospectId);

    const rows = await observer.query(
      `select count(*)::int as count from public.recruitment_prospects
        where person_id = $1::uuid and season_id = $2::uuid`,
      [existingPersonId, seasonId],
    );
    expect(rows.rows[0].count).toBe(1);
  });
});

describe("probeExistingRecruitForQrSignup", () => {
  it("finds an existing person by an exact phone match", async () => {
    const mobile = uniquePhone();
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Findme') returning id`,
      [MARKER],
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );

    const probe = await probeExistingRecruitForQrSignup(MARKER, mobile);
    expect(probe).toEqual({ found: true, matchedPersonId: existing.rows[0].id });
  });

  it("finds nobody when no mobile is supplied — never probes on name alone", async () => {
    const probe = await probeExistingRecruitForQrSignup(MARKER, null);
    expect(probe).toEqual({ found: false, matchedPersonId: null });
  });

  it("finds nobody for a mobile nobody holds", async () => {
    const probe = await probeExistingRecruitForQrSignup(MARKER, uniquePhone());
    expect(probe).toEqual({ found: false, matchedPersonId: null });
  });
});

describe("signUpWithTokenIn — the tokenised, prefilled door", () => {
  it("never creates a person, and updates the named person's own record", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ('OldGiven', 'OldFamily') returning id`,
    );
    await observer.query(`update public.people set given_name = $1 where id = $2::uuid`, [
      MARKER,
      existing.rows[0].id,
    ]);
    const personId = existing.rows[0].id;

    const result = await withTransaction((tx) =>
      signUpWithTokenIn(tx, {
        personId,
        seasonId,
        submission: baseSubmission({ familyName: "CorrectedFamily", college: "Kestrelhall" }),
      }),
    );

    expect(result.personCreated).toBe(false);
    expect(result.personId).toBe(personId);

    const person = await observer.query(
      `select given_name, family_name, college from public.people where id = $1::uuid`,
      [personId],
    );
    expect(person.rows[0]).toEqual({
      given_name: MARKER,
      family_name: "CorrectedFamily",
      college: "Kestrelhall",
    });

    const people = await observer.query(
      `select count(*)::int as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe(1);
  });

  it("does not overwrite a contact value the person already holds", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'HasMobile') returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', '07700900111', true, 'test fixture')`,
      [personId],
    );

    await withTransaction((tx) =>
      signUpWithTokenIn(tx, {
        personId,
        seasonId,
        submission: baseSubmission({ mobile: "07700900222" }),
      }),
    );

    const contacts = await observer.query(
      `select raw_value from public.contact_points
        where person_id = $1::uuid and kind = 'phone' and is_preferred`,
      [personId],
    );
    expect(contacts.rows).toHaveLength(1);
    expect(contacts.rows[0].raw_value).toBe("07700900111");
  });

  it("creates no duplicate person and no second recruit row (LAN-202 Done when)", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Repeat') returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;

    const first = await withTransaction((tx) =>
      signUpWithTokenIn(tx, { personId, seasonId, submission: baseSubmission() }),
    );
    const second = await withTransaction((tx) =>
      signUpWithTokenIn(tx, { personId, seasonId, submission: baseSubmission() }),
    );

    expect(second.prospectId).toBe(first.prospectId);
    expect(second.prospectCreated).toBe(false);

    const people = await observer.query(
      `select count(*)::int as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe(1);

    const prospects = await observer.query(
      `select count(*)::int as count from public.recruitment_prospects
        where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(prospects.rows[0].count).toBe(1);
  });

  it("grants season consent the same way the QR door does", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Consenting') returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;

    await withTransaction((tx) =>
      signUpWithTokenIn(tx, { personId, seasonId, submission: baseSubmission() }),
    );

    const consent = await observer.query(
      `select state::text as state, source::text as source
         from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(consent.rows[0]).toEqual({ state: "granted", source: "qr_self_entry" });
  });
});

describe("readSignupPrefillIn", () => {
  it("reads back exactly the fields the tokenised door's form needs", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people
         (given_name, family_name, college, matriculation_year, expected_graduation_year, degree_field)
       values ($1, 'Prefill', 'Kestrelhall', 2026, 2029, 'Law')
       returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', '07700900461', true, 'test fixture'),
              ($1::uuid, 'email', 'm.ashdown@example.ac.uk', true, 'test fixture')`,
      [personId],
    );

    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill).toEqual({
      givenName: MARKER,
      familyName: "Prefill",
      mobile: "07700900461",
      email: "m.ashdown@example.ac.uk",
      college: "Kestrelhall",
      matriculationYear: 2026,
      expectedGraduationYear: 2029,
      degreeField: "Law",
    });
  });
});
