// @vitest-environment node
/**
 * The tokenised, prefilled door's one server action, end to end — LAN-202.
 * Against the real local database: proves "a tokenised link for an existing
 * recruit prefills, and completing it creates no duplicate person and no
 * second recruit row" (LAN-202 "Done when") from the URL's own token, not
 * only from the service call directly.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../../../tests/helpers/service-layer";
import { submitTokenSignup } from "./actions";
import type { SignupFieldValues } from "@/app/join/[code]/signup-form";

const MARKER = "LAN202TokenActionSuite";

let observer: Client;
let seasonId: string;

// Mobile is required (Brian, 2026-09-01, finding 1) — every fixture below
// carries a valid one by default; a test about mobile itself overrides it.
function values(overrides: Partial<SignupFieldValues> = {}): SignupFieldValues {
  return {
    givenName: MARKER,
    familyName: "Recruit",
    mobile: "07700 900556",
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
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.audit_events where entity_id in ${people}`, [MARKER]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

async function mintPersonAndToken(): Promise<{ personId: string; token: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Existing') returning id`,
    [MARKER],
  );
  const issued = await withTransaction((tx) => issuePersonTokenIn(tx, person.rows[0].id, seasonId));
  return { personId: person.rows[0].id, token: issued.token };
}

describe("submitTokenSignup", () => {
  it("resolves the token, writes onto the named person, and grants consent", async () => {
    const { personId, token } = await mintPersonAndToken();

    const outcome = await submitTokenSignup(token, {
      ...values({ college: "Kestrelhall" }),
      consent: true,
      linkExistingPersonId: null,
    });
    expect(outcome).toEqual({ ok: true });

    const person = await observer.query(`select college from public.people where id = $1::uuid`, [
      personId,
    ]);
    expect(person.rows[0].college).toBe("Kestrelhall");

    const consent = await observer.query(
      `select state::text as state from public.season_messaging_consents
        where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(consent.rows[0]?.state).toBe("granted");
  });

  it("creates no duplicate person and no second recruit row on a repeat submission", async () => {
    const { personId, token } = await mintPersonAndToken();

    await submitTokenSignup(token, { ...values(), consent: true, linkExistingPersonId: null });
    await submitTokenSignup(token, { ...values(), consent: true, linkExistingPersonId: null });

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

  it("refuses a revoked or unknown token, gracefully", async () => {
    const outcome = await submitTokenSignup("not-a-real-token", {
      ...values(),
      consent: true,
      linkExistingPersonId: null,
    });
    expect(outcome.ok).toBe(false);
  });
});
