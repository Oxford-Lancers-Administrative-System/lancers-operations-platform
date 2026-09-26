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

import { todayInClubZone } from "@/lib/club-time";
import { closePool, withTransaction } from "@/lib/db";
import {
  completePartialQrSignupIn,
  hasCoreFour,
  PARTIAL_NOT_OPEN_RULE,
  PARTIAL_SOURCE,
  PARTIAL_TOKEN_PURPOSE,
  PARTIAL_WELCOME_DELAY_MS,
  patchPartialQrSignupIn,
  probeExistingRecruitForQrSignup,
  readSignupPrefillIn,
  reconcileYears,
  startPartialQrSignupIn,
  SIGNUP_INVALID_EMAIL_RULE,
  SIGNUP_INVALID_EXPECTED_GRADUATION_YEAR_RULE,
  SIGNUP_INVALID_MATRICULATION_YEAR_RULE,
  SIGNUP_INVALID_MOBILE_RULE,
  SIGNUP_REQUIRES_CONSENT_RULE,
  SIGNUP_REQUIRES_FIRST_NAME_RULE,
  SIGNUP_REQUIRES_LAST_NAME_RULE,
  SIGNUP_REQUIRES_MOBILE_RULE,
  SIGNUP_YEARS_OUT_OF_ORDER_RULE,
  signUpAnonymouslyIn,
  voidPartialQrSignupIn,
  signUpWithTokenIn,
  type SignupSubmission,
} from "./recruitment-signup";
import { mintRecruitmentSignupCodeIn } from "./recruitment-signup-codes";
import { resolvePersonTokenIn } from "./player-answer-tokens";
import { recordRecruitConsentIn } from "./recruitment-prospect";
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
    // College email is required too (Brian, 2026-09-09, LAN-268) and is held
    // to the Oxford rule. Every fixture carries a valid one by default; a test
    // about the college email itself overrides it.
    collegeEmail: `${MARKER.toLowerCase()}.${phoneCounter || 1}@balliol.ox.ac.uk`,
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
  await observer.query(`delete from public.notification_jobs where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.recruitment_prospect_status_events where prospect_id in
       (select id from public.recruitment_prospects where person_id in ${people})`,
    [MARKER],
  );
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.person_aliases where person_id in ${people}`, [MARKER]);
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
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

  it("LAN-247 — records today as the recruit's first contact", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code,
        submission: baseSubmission({ mobile: "07700900456" }),
      }),
    );

    const prospect = await observer.query<{ first_contact_on: string | null }>(
      `select to_char(first_contact_on, 'YYYY-MM-DD') as first_contact_on
         from public.recruitment_prospects where id = $1::uuid`,
      [result.prospectId],
    );
    expect(prospect.rows[0].first_contact_on).toBe(todayInClubZone());
  });

  // LAN-305: every capture door reaches the same declarer. This one's grant
  // completes the welcome track, so what it must produce is the interest ask
  // and its reminder — nothing at all before this fix, because no door called
  // the declarer after a self sign-up.
  it("LAN-305 — declares the interest track, and nothing of the welcome track", async () => {
    const code = await mintCode();
    const result = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, { seasonId, code, submission: baseSubmission() }),
    );

    const jobs = await observer.query<{ idempotency_key: string }>(
      `select idempotency_key from public.notification_jobs
        where person_id = $1::uuid order by idempotency_key`,
      [result.personId],
    );
    expect(jobs.rows.map((r) => r.idempotency_key)).toEqual([
      `recruit-cycle:interest_ask:${result.personId}:${seasonId}`,
      `recruit-cycle:interest_reminder:${result.personId}:${seasonId}`,
    ]);
  });

  it("LAN-305 — a resubmitted form declares no second ask", async () => {
    const firstCode = await mintCode();
    const first = await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, { seasonId, code: firstCode, submission: baseSubmission() }),
    );
    const secondCode = await mintCode();
    await withTransaction((tx) =>
      signUpAnonymouslyIn(tx, {
        seasonId,
        code: secondCode,
        submission: baseSubmission(),
        linkExistingPersonId: first.personId,
      }),
    );

    const jobs = await observer.query<{ idempotency_key: string }>(
      `select idempotency_key from public.notification_jobs where person_id = $1::uuid`,
      [first.personId],
    );
    expect(jobs.rows).toHaveLength(2);
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
  it("finds an existing person by a given name and phone together", async () => {
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
    expect(probe).toEqual({ found: true });
  });

  // LAN-208: findPersonDuplicates ORs given-name/family-name/alias/email/phone across
  // the whole row, so a candidate's matched_phone flag was never conditioned on that
  // same row's name also matching — any fabricated name plus a real phone number
  // confirmed a match. This is the regression test: it fails (found: true) against
  // the defect and passes (found: false) after requiring both on the same row.
  it("finds nobody for a fabricated name against somebody else's real phone — the typed name must match too", async () => {
    const mobile = uniquePhone();
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ('RealPersonNotMarker', 'Findme') returning id`,
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );

    const probe = await probeExistingRecruitForQrSignup(MARKER, mobile);
    expect(probe).toEqual({ found: false });

    await observer.query(`delete from public.contact_points where person_id = $1::uuid`, [
      existing.rows[0].id,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [existing.rows[0].id]);
  });

  it("finds an existing person by a matching alias and phone together, not just the given name", async () => {
    const mobile = uniquePhone();
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ('SomeoneElse', 'Findme') returning id`,
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );
    await observer.query(
      `insert into public.person_aliases (person_id, alias, is_display_name)
       values ($1::uuid, $2, false)`,
      [existing.rows[0].id, MARKER],
    );

    const probe = await probeExistingRecruitForQrSignup(MARKER, mobile);
    expect(probe).toEqual({ found: true });

    await observer.query(`delete from public.person_aliases where person_id = $1::uuid`, [
      existing.rows[0].id,
    ]);
    await observer.query(`delete from public.contact_points where person_id = $1::uuid`, [
      existing.rows[0].id,
    ]);
    await observer.query(`delete from public.people where id = $1::uuid`, [existing.rows[0].id]);
  });

  it("finds nobody when no mobile is supplied — never probes on name alone", async () => {
    const probe = await probeExistingRecruitForQrSignup(MARKER, null);
    expect(probe).toEqual({ found: false });
  });

  it("finds nobody for a mobile nobody holds", async () => {
    const probe = await probeExistingRecruitForQrSignup(MARKER, uniquePhone());
    expect(probe).toEqual({ found: false });
  });

  it("never surfaces a database identifier in its result shape, even on a real match", async () => {
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
    expect(probe.found).toBe(true);
    expect(Object.keys(probe)).toEqual(["found"]);
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

  it("LAN-305 — declares the interest track for the person the token names", async () => {
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'TokenCycle') returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;

    await withTransaction((tx) =>
      signUpWithTokenIn(tx, { personId, seasonId, submission: baseSubmission() }),
    );

    const jobs = await observer.query<{ idempotency_key: string }>(
      `select idempotency_key from public.notification_jobs
        where person_id = $1::uuid order by idempotency_key`,
      [personId],
    );
    expect(jobs.rows.map((r) => r.idempotency_key)).toEqual([
      `recruit-cycle:interest_ask:${personId}:${seasonId}`,
      `recruit-cycle:interest_reminder:${personId}:${seasonId}`,
    ]);
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
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', null, '07700900461', true, 'test fixture'),
              ($1::uuid, 'email', null, 'm.ashdown@example.ac.uk', true, 'test fixture'),
              ($1::uuid, 'email', 'college', 'm.ashdown@kestrelhall.ox.ac.uk', true, 'test fixture')`,
      [personId],
    );

    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill).toEqual({
      givenName: MARKER,
      familyName: "Prefill",
      mobile: "07700900461",
      // LAN-268: the two scopes are two different boxes on the door now, so
      // the prefill has to tell them apart. The unclassified email — `scope`
      // is null on every email recorded before LAN-182 — still fills the
      // personal box, which is where it went when there was only one.
      collegeEmail: "m.ashdown@kestrelhall.ox.ac.uk",
      email: "m.ashdown@example.ac.uk",
      college: "Kestrelhall",
      matriculationYear: 2026,
      expectedGraduationYear: 2029,
      degreeField: "Law",
    });
  });

  it("never offers a college address as the personal one", async () => {
    // The failure that would leave the required college-email box blank while
    // showing its value in the optional box beside it.
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'CollegeOnly') returning id`,
      [MARKER],
    );
    const personId = existing.rows[0].id;
    await observer.query(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, 'email', 'college', 'only@kestrelhall.ox.ac.uk', true, 'test fixture')`,
      [personId],
    );

    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill.collegeEmail).toBe("only@kestrelhall.ox.ac.uk");
    expect(prefill.email).toBeNull();
  });
});

/**
 * LAN-425 (Brian, 2026-09-25, the Freshers' Fair): the QR door saves what it
 * has. A partial is a person, their raw contact rows, a prospect marked
 * `qr_partial`, a delayed welcome, and a credential the page keeps — and it
 * is not a sign-up: no consent row, no interest ask, no code-use count.
 */
describe("the partial save (LAN-425)", () => {
  function partial(overrides: Partial<SignupSubmission> = {}) {
    // LAN-428: a mobile is part of the minimum, so every fixture carries one.
    const { consent: _consent, ...rest } = baseSubmission({
      mobile: uniquePhone(),
      collegeEmail: null,
      ...overrides,
    });
    return rest;
  }

  it("needs first name, last name and a mobile, and nothing else — LAN-428", async () => {
    const people = async () =>
      (
        await observer.query<{ count: string }>(
          `select count(*)::text as count from public.people where given_name = $1`,
          [MARKER],
        )
      ).rows[0].count;
    const before = await people();

    await withTransaction(async (tx) => {
      await expect(
        startPartialQrSignupIn(tx, { seasonId, submission: partial({ familyName: " " }) }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_LAST_NAME_RULE });
    });
    await withTransaction(async (tx) => {
      await expect(
        startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile: null }) }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_MOBILE_RULE });
    });
    await withTransaction(async (tx) => {
      await expect(
        startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile: "  " }) }),
      ).rejects.toMatchObject({ rule: SIGNUP_REQUIRES_MOBILE_RULE });
    });
    await withTransaction(async (tx) => {
      await expect(
        startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile: "0770" }) }),
      ).rejects.toMatchObject({ rule: SIGNUP_INVALID_MOBILE_RULE });
    });
    expect(await people()).toBe(before);

    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial() }),
    );
    expect(started).not.toBeNull();
    expect(started!.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  it("writes the record, marks it qr_partial, floors the welcome ten minutes out, and grants no consent", async () => {
    const before = Date.now();
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, {
        seasonId,
        submission: partial({ mobile: "07700 90", collegeEmail: "not-an-address" }),
      }),
    );
    const personId = started!.personId;

    const prospect = await observer.query<{ source: string; status: string }>(
      `select source, status::text as status from public.recruitment_prospects where person_id = $1::uuid`,
      [personId],
    );
    expect(prospect.rows[0]).toEqual({ source: PARTIAL_SOURCE, status: "identified" });

    // Raw as typed: a malformed mobile has no normalised number, a malformed
    // college email is on file for the missing-data queue to show.
    const contacts = await observer.query<{
      kind: string;
      scope: string | null;
      raw_value: string;
      normalised_value: string | null;
    }>(
      `select kind::text as kind, scope::text as scope, raw_value, normalised_value
         from public.contact_points where person_id = $1::uuid order by kind`,
      [personId],
    );
    expect(contacts.rows).toEqual([
      { kind: "email", scope: "college", raw_value: "not-an-address", normalised_value: null },
      { kind: "phone", scope: null, raw_value: "07700 90", normalised_value: null },
    ]);

    const consent = await observer.query(
      `select 1 from public.season_messaging_consents where person_id = $1::uuid`,
      [personId],
    );
    expect(consent.rows).toHaveLength(0);

    const jobs = await observer.query<{ idempotency_key: string; scheduled_for: Date }>(
      `select idempotency_key, scheduled_for from public.notification_jobs
        where person_id = $1::uuid order by idempotency_key`,
      [personId],
    );
    const keys = jobs.rows.map((row) => row.idempotency_key.split(":")[1]);
    expect(keys).toEqual(["details_reminder", "welcome"]);
    const welcome = jobs.rows.find((row) => row.idempotency_key.includes(":welcome:"))!;
    expect(welcome.scheduled_for.getTime()).toBeGreaterThanOrEqual(
      before + PARTIAL_WELCOME_DELAY_MS,
    );

    // The credential is the prefilled form's own purpose and resolves to this person.
    const resolved = await withTransaction((tx) =>
      resolvePersonTokenIn(tx, started!.token, PARTIAL_TOKEN_PURPOSE),
    );
    expect(resolved.resolved).toEqual({ personId, seasonId });
  });

  it("writes nothing when the name-and-mobile probe already matches somebody", async () => {
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
    const count = async () =>
      (
        await observer.query<{ count: string }>(
          `select count(*)::text as count from public.people where given_name = $1`,
          [MARKER],
        )
      ).rows[0].count;
    const before = await count();

    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile }) }),
    );
    expect(started).toBeNull();
    expect(await count()).toBe(before);
  });

  it("patches with latest-wins, and flips the source once the core four are in", async () => {
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile: "07700 900" }) }),
    );
    const personId = started!.personId;
    const mobile = uniquePhone();

    const complete = partial({
      mobile,
      collegeEmail: "lan425@balliol.ox.ac.uk",
      college: "Balliol",
      matriculationYear: "2025",
      expectedGraduationYear: "2020", // before matriculation: held back, not a failed patch
    });
    expect(hasCoreFour(complete)).toBe(true);
    await withTransaction((tx) =>
      patchPartialQrSignupIn(tx, { personId, seasonId, submission: complete }),
    );

    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill.mobile).toBe(mobile);
    expect(prefill.collegeEmail).toBe("lan425@balliol.ox.ac.uk");
    expect(prefill.college).toBe("Balliol");
    expect(prefill.matriculationYear).toBe(2025);
    expect(prefill.expectedGraduationYear).toBeNull();

    const phone = await observer.query<{ normalised_value: string | null }>(
      `select normalised_value from public.contact_points where person_id = $1::uuid and kind = 'phone'`,
      [personId],
    );
    expect(phone.rows).toHaveLength(1);
    expect(phone.rows[0].normalised_value).toMatch(/^44\d{10}$/);

    const prospect = await observer.query<{ source: string }>(
      `select source from public.recruitment_prospects where person_id = $1::uuid`,
      [personId],
    );
    expect(prospect.rows[0].source).toBe("qr_self_entry");

    // Still not a sign-up: consent is the tick's alone.
    const consent = await observer.query(
      `select 1 from public.season_messaging_consents where person_id = $1::uuid`,
      [personId],
    );
    expect(consent.rows).toHaveLength(0);
  });

  it("review F1 — a matriculation typed after a graduation on file is held back, and the rest of the patch lands", async () => {
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, {
        seasonId,
        submission: partial({ expectedGraduationYear: "2023" }),
      }),
    );
    const personId = started!.personId;
    expect(
      (await withTransaction((tx) => readSignupPrefillIn(tx, personId))).expectedGraduationYear,
    ).toBe(2023);

    // The same 2023 is resent with a newly typed matriculation after it, and a college.
    await withTransaction((tx) =>
      patchPartialQrSignupIn(tx, {
        personId,
        seasonId,
        submission: partial({
          expectedGraduationYear: "2023",
          matriculationYear: "2025",
          college: "Oriel",
        }),
      }),
    );
    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill.college).toBe("Oriel");
    expect(prefill.expectedGraduationYear).toBe(2023);
    expect(prefill.matriculationYear).toBeNull();

    // Corrected to a graduation after it: both land.
    await withTransaction((tx) =>
      patchPartialQrSignupIn(tx, {
        personId,
        seasonId,
        submission: partial({ expectedGraduationYear: "2028", matriculationYear: "2025" }),
      }),
    );
    const fixed = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect([fixed.matriculationYear, fixed.expectedGraduationYear]).toEqual([2025, 2028]);
  });

  it("reconcileYears never returns a pair the check constraint would refuse", () => {
    const none = { matriculation: null, graduation: null };
    expect(reconcileYears({ matriculation: 2025, graduation: 2028 }, none)).toEqual({
      matriculation: 2025,
      graduation: 2028,
    });
    expect(reconcileYears({ matriculation: 2025, graduation: 2020 }, none)).toEqual({
      matriculation: 2025,
      graduation: null,
    });
    expect(
      reconcileYears(
        { matriculation: 2025, graduation: null },
        { matriculation: null, graduation: 2023 },
      ),
    ).toEqual({ matriculation: null, graduation: 2023 });
    expect(
      reconcileYears(
        { matriculation: null, graduation: 2020 },
        { matriculation: 2025, graduation: null },
      ),
    ).toEqual({ matriculation: 2025, graduation: null });
    expect(
      reconcileYears(
        { matriculation: 2030, graduation: 2029 },
        { matriculation: 2025, graduation: 2028 },
      ),
    ).toEqual({ matriculation: 2025, graduation: 2028 });
    expect(reconcileYears(none, { matriculation: 2025, graduation: 2028 })).toEqual({
      matriculation: 2025,
      graduation: 2028,
    });
  });

  it("walk finding 2 — once the sign-up is complete, the token can no longer patch or complete it", async () => {
    const code = await mintCode();
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial() }),
    );
    const personId = started!.personId;
    const submission = baseSubmission({ collegeEmail: "lan425.closed@balliol.ox.ac.uk" });
    await withTransaction((tx) =>
      completePartialQrSignupIn(tx, { personId, seasonId, code, submission }),
    );
    const before = await withTransaction((tx) => readSignupPrefillIn(tx, personId));

    await withTransaction(async (tx) => {
      await expect(
        patchPartialQrSignupIn(tx, {
          personId,
          seasonId,
          submission: partial({ mobile: "07700 90", collegeEmail: "junk" }),
        }),
      ).rejects.toMatchObject({ rule: PARTIAL_NOT_OPEN_RULE });
      await expect(
        completePartialQrSignupIn(tx, { personId, seasonId, code, submission }),
      ).rejects.toMatchObject({ rule: PARTIAL_NOT_OPEN_RULE });
    });
    expect(await withTransaction((tx) => readSignupPrefillIn(tx, personId))).toEqual(before);
    const source = await observer.query<{ source: string }>(
      `select source from public.recruitment_prospects where person_id = $1::uuid`,
      [personId],
    );
    expect(source.rows[0].source).toBe("qr_self_entry");
  });

  it("walk finding 1 — a mobile that belongs to somebody else with this name is not stored on the partial", async () => {
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
    // Started on a different mobile (LAN-428: a partial needs one), then
    // corrected to the one somebody else with this name already has.
    const ownMobile = uniquePhone();
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial({ mobile: ownMobile }) }),
    );
    const personId = started!.personId;

    const result = await withTransaction((tx) =>
      patchPartialQrSignupIn(tx, {
        personId,
        seasonId,
        submission: partial({ mobile, college: "Oriel" }),
      }),
    );
    expect(result.matchedExisting).toBe(true);
    const prefill = await withTransaction((tx) => readSignupPrefillIn(tx, personId));
    expect(prefill.mobile).not.toBe(mobile);
    expect(prefill.mobile).toBe(ownMobile);
    expect(prefill.college).toBe("Oriel");

    // The visitor confirms the existing record: the partial is voided, its cycle stood down, its token revoked.
    await withTransaction((tx) => voidPartialQrSignupIn(tx, { personId, seasonId }));
    const prospect = await observer.query<{ status: string }>(
      `select status::text as status from public.recruitment_prospects where person_id = $1::uuid`,
      [personId],
    );
    expect(prospect.rows[0].status).toBe("void");
    const event = await observer.query<{ actor_label: string; reason: string }>(
      `select e.actor_label, e.reason from public.recruitment_prospect_status_events e
         join public.recruitment_prospects rp on rp.id = e.prospect_id
        where rp.person_id = $1::uuid and e.to_status = 'void'`,
      [personId],
    );
    expect(event.rows).toHaveLength(1);
    expect(event.rows[0].actor_label).toMatch(/QR sign-up form/);
    const jobs = await observer.query<{ status: string }>(
      `select status::text as status from public.notification_jobs where person_id = $1::uuid`,
      [personId],
    );
    expect(jobs.rows.length).toBeGreaterThan(0);
    expect(jobs.rows.every((row) => row.status === "cancelled")).toBe(true);
    const token = await withTransaction((tx) =>
      resolvePersonTokenIn(tx, started!.token, PARTIAL_TOKEN_PURPOSE),
    );
    expect(token.state).toBe("unknown");
  });

  it("walk finding 4 — a graduation before its matriculation is refused in words on Save", async () => {
    const code = await mintCode();
    await withTransaction(async (tx) => {
      await expect(
        signUpAnonymouslyIn(tx, {
          seasonId,
          code,
          submission: baseSubmission({ matriculationYear: "2030", expectedGraduationYear: "2027" }),
        }),
      ).rejects.toMatchObject({ rule: SIGNUP_YEARS_OUT_OF_ORDER_RULE });
    });
  });

  it("completing it is the QR door's Save on the same record: consent, one prospect, the code counted", async () => {
    const code = await mintCode();
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission: partial() }),
    );
    const personId = started!.personId;
    const submission = baseSubmission({ collegeEmail: "lan425.done@balliol.ox.ac.uk" });

    const result = await withTransaction((tx) =>
      completePartialQrSignupIn(tx, { personId, seasonId, code, submission }),
    );
    expect(result.personId).toBe(personId);
    expect(result.prospectCreated).toBe(false);

    const people = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe("1");

    const consent = await observer.query<{ state: string; source: string }>(
      `select state::text as state, source::text as source
         from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(consent.rows[0]).toEqual({ state: "granted", source: "qr_self_entry" });

    const prospect = await observer.query<{ source: string }>(
      `select source from public.recruitment_prospects where person_id = $1::uuid`,
      [personId],
    );
    expect(prospect.rows).toHaveLength(1);
    expect(prospect.rows[0].source).toBe("qr_self_entry");

    const used = await observer.query<{ sign_in_count: number }>(
      `select sign_in_count from public.recruitment_signup_codes where code = $1`,
      [code],
    );
    expect(used.rows[0].sign_in_count).toBe(1);

    // The interest ask joins the welcome track now that consent is granted.
    const jobs = await observer.query<{ idempotency_key: string }>(
      `select idempotency_key from public.notification_jobs where person_id = $1::uuid`,
      [personId],
    );
    expect(jobs.rows.map((row) => row.idempotency_key.split(":")[1]).sort()).toEqual([
      "details_reminder",
      "interest_ask",
      "interest_reminder",
      "welcome",
    ]);
  });
});

describe("verbal consent on a partial recruit — LAN-428, item 2", () => {
  /**
   * The journey Brian asked to be traced: a partial from the fair has no
   * consent row (an unticked box is not consent). An operator on the recruit's
   * record uses LAN-371's **Record consent**, whose required note is "How
   * consent was given", and writes that it was verbal. The row then carries
   * who (the operator), when, and how; the audit row names the operator and
   * the reason and never the recruit's contact details.
   */
  it("records the grant with who, when and how, and audits it to the operator", async () => {
    const operator = await observer.query<{ id: string }>(
      "select id from public.people where created_at = $1::timestamptz order by id limit 1",
      [await seededIdentityCreatedAt(observer)],
    );
    const operatorPersonId = operator.rows[0].id;
    const { consent: _consent, ...submission } = baseSubmission({
      mobile: uniquePhone(),
      collegeEmail: null,
    });
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission }),
    );
    const personId = started!.personId;
    const before = await observer.query(
      "select 1 from public.season_messaging_consents where person_id = $1::uuid",
      [personId],
    );
    expect(before.rows).toHaveLength(0);

    const note = "Given verbally at the Said Business School fair stand.";
    const granted = await withTransaction((tx) =>
      recordRecruitConsentIn(tx, operatorPersonId, started!.prospectId, note),
    );

    expect(granted).toMatchObject({
      personId,
      seasonId,
      state: "granted",
      source: "operator_recorded",
      recordedByPersonId: operatorPersonId,
      reason: note,
    });
    expect(Date.parse(granted.changedAt)).toBeGreaterThan(Date.now() - 60_000);

    const audit = await observer.query<{
      actor_person_id: string;
      action: string;
      reason: string;
      to_state: string;
      context: Record<string, unknown>;
    }>(
      `select actor_person_id, action, reason, to_state, context from public.audit_events
        where entity_table = 'season_messaging_consents' and entity_id = $1::uuid`,
      [personId],
    );
    expect(audit.rows).toEqual([
      {
        actor_person_id: operatorPersonId,
        action: "messaging_consent.recorded_by_operator",
        reason: note,
        to_state: "granted",
        context: { seasonId },
      },
    ]);
  });

  it("refuses a grant with no note of how it was given", async () => {
    const operator = await observer.query<{ id: string }>(
      "select id from public.people where created_at = $1::timestamptz order by id limit 1",
      [await seededIdentityCreatedAt(observer)],
    );
    const { consent: _consent, ...submission } = baseSubmission({
      mobile: uniquePhone(),
      collegeEmail: null,
    });
    const started = await withTransaction((tx) =>
      startPartialQrSignupIn(tx, { seasonId, submission }),
    );

    await expect(
      withTransaction((tx) =>
        recordRecruitConsentIn(tx, operator.rows[0].id, started!.prospectId, "  "),
      ),
    ).rejects.toMatchObject({ rule: "season_messaging_consent_change_requires_a_reason" });
    const after = await observer.query(
      "select 1 from public.season_messaging_consents where person_id = $1::uuid",
      [started!.personId],
    );
    expect(after.rows).toHaveLength(0);
  });
});
