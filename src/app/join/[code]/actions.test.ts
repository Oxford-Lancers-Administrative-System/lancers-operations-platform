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
      confirmedExistingMatch: false,
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
      confirmedExistingMatch: false,
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/tick/i);
  });

  it("refuses an unknown code, gracefully", async () => {
    const outcome = await submitQrSignup("this-code-was-never-minted", {
      ...values(),
      consent: true,
      confirmedExistingMatch: false,
    });
    expect(outcome.ok).toBe(false);
  });
});

describe("checkForExistingQrRecruit", () => {
  it("finds nobody when no match exists", async () => {
    const code = await mintCode();
    const result = await checkForExistingQrRecruit(code, MARKER, "");
    expect(result).toEqual({ found: false });
  });

  // LAN-208: this action took no `code` at all before the fix, so it was callable
  // forever once any /join/[code] page had loaded — codes go on posters, and are
  // meant to stop working once deactivated. This is the regression test: it fails
  // (probes anyway) against the defect and passes (refuses) after gating by a live
  // code resolution, identical to submitQrSignup's own check.
  // Both tests below insert a real matching person before probing — a probe
  // that ignored the code gate would still find that real match (found: true)
  // regardless, which is exactly why an assertion against unmatched data alone
  // would not catch a missing gate.
  it("refuses to probe against an unknown code — gated the same way submitQrSignup is, even with a real match on file", async () => {
    const mobile = "07700900444";
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Findme') returning id`,
      [MARKER],
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );

    const result = await checkForExistingQrRecruit("this-code-was-never-minted", MARKER, mobile);
    expect(result).toEqual({ found: false });
  });

  it("refuses to probe against a deactivated code, even with a real match on file", async () => {
    const mobile = "07700900555";
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Findme') returning id`,
      [MARKER],
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );

    const code = await mintCode();
    // Minting a second code for the same season deactivates the first —
    // recruitment-signup-codes.ts's own "one live per season" rule.
    await mintCode();
    const result = await checkForExistingQrRecruit(code, MARKER, mobile);
    expect(result).toEqual({ found: false });
  });

  it("still finds a real match through a live code", async () => {
    const mobile = "07700900111";
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Findme') returning id`,
      [MARKER],
    );
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existing.rows[0].id, mobile],
    );
    const code = await mintCode();
    const result = await checkForExistingQrRecruit(code, MARKER, mobile);
    expect(result).toEqual({ found: true });
  });
});

describe("submitQrSignup — confirming an existing match", () => {
  it("links to the existing person when confirmed, re-deriving who from the resubmitted name and mobile", async () => {
    const mobile = "07700900222";
    const existing = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'Findme') returning id`,
      [MARKER],
    );
    const existingPersonId = existing.rows[0].id;
    await observer.query(
      `insert into public.contact_points (person_id, kind, raw_value, is_preferred, source)
       values ($1::uuid, 'phone', $2, true, 'test fixture')`,
      [existingPersonId, mobile],
    );

    const code = await mintCode();
    const outcome = await submitQrSignup(code, {
      ...values({ mobile }),
      consent: true,
      confirmedExistingMatch: true,
    });
    expect(outcome).toEqual({ ok: true });

    const people = await observer.query(
      `select count(*)::int as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe(1);

    const prospect = await observer.query(
      `select count(*)::int as count from public.recruitment_prospects where person_id = $1::uuid`,
      [existingPersonId],
    );
    expect(prospect.rows[0].count).toBe(1);
  });

  it("creates a new person when confirmed but the resubmitted name and mobile no longer match anyone — refuses nobody", async () => {
    const code = await mintCode();
    const outcome = await submitQrSignup(code, {
      ...values({ mobile: "07700900333" }),
      consent: true,
      confirmedExistingMatch: true,
    });
    expect(outcome).toEqual({ ok: true });

    const people = await observer.query(
      `select count(*)::int as count from public.people where given_name = $1`,
      [MARKER],
    );
    expect(people.rows[0].count).toBe(1);
  });
});
