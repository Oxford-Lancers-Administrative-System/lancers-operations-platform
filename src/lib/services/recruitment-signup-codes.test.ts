// @vitest-environment node
/**
 * The season sign-up QR code — LAN-201's `recruitment_signup_codes`, resolved
 * by `WP-signup-gate` (LAN-202). Against the real local database: the
 * guarantee under test is `recruitment_signup_codes_one_live_per_season`, the
 * partial unique index re-minting depends on.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import {
  mintRecruitmentSignupCodeIn,
  recordRecruitmentSignupCodeUseIn,
  resolveRecruitmentSignupCode,
  resolveRecruitmentSignupCodeIn,
} from "./recruitment-signup-codes";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN202SignupCodeSuite";

let observer: Client;
let seasonId: string;
let otherSeasonId: string;

beforeAll(async () => {
  observer = await openObserver();
  const anchor = await observer.query<{ id: string }>(
    "select id from public.people where created_at = $1::timestamptz order by id limit 1",
    [await seededIdentityCreatedAt(observer)],
  );
  const vocabulary = await observer.query<{ id: string }>(
    "select id from public.position_vocabularies order by adopted_on desc limit 1",
  );
  const seasons = await observer.query<{ id: string }>(
    `insert into public.seasons
       (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
     values ($1, 'open', $2, '2019-09-01', '2020-06-01', now(), $3),
            ($4, 'open', $2, '2020-09-01', '2021-06-01', now(), $3)
     returning id`,
    [`${MARKER} season`, vocabulary.rows[0].id, anchor.rows[0].id, `${MARKER} season 2`],
  );
  seasonId = seasons.rows[0].id;
  otherSeasonId = seasons.rows[1].id;
});

afterEach(async () => {
  await observer.query(
    `delete from public.recruitment_signup_codes where season_id = any($1::uuid[])`,
    [[seasonId, otherSeasonId]],
  );
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = any($1::uuid[])", [
    [seasonId, otherSeasonId],
  ]);
  await observer.end();
  await closePool();
});

describe("mintRecruitmentSignupCodeIn / resolveRecruitmentSignupCodeIn", () => {
  it("mints a code that resolves to its season", async () => {
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    const resolved = await resolveRecruitmentSignupCode(minted.code);
    expect(resolved).toEqual({ state: "valid", seasonId });
  });

  it("resolves an unknown code as unknown, not an error", async () => {
    const resolved = await resolveRecruitmentSignupCode("this-code-was-never-minted");
    expect(resolved).toEqual({ state: "unknown", seasonId: null });
  });

  it("resolves a blank code as unknown", async () => {
    const resolved = await resolveRecruitmentSignupCode("");
    expect(resolved).toEqual({ state: "unknown", seasonId: null });
  });

  it("re-minting deactivates the old code — the old code stops resolving", async () => {
    const first = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    const second = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));

    expect(await resolveRecruitmentSignupCode(first.code)).toEqual({
      state: "unknown",
      seasonId: null,
    });
    expect(await resolveRecruitmentSignupCode(second.code)).toEqual({
      state: "valid",
      seasonId,
    });
  });

  it("resolveRecruitmentSignupCodeIn answers the same way inside a caller's own transaction", async () => {
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await withTransaction(async (tx) => {
      const resolved = await resolveRecruitmentSignupCodeIn(tx, minted.code);
      expect(resolved).toEqual({ state: "valid", seasonId });
    });
  });

  it("two different seasons may each hold their own live code at once", async () => {
    const a = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    const b = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, otherSeasonId));

    expect(await resolveRecruitmentSignupCode(a.code)).toEqual({ state: "valid", seasonId });
    expect(await resolveRecruitmentSignupCode(b.code)).toEqual({
      state: "valid",
      seasonId: otherSeasonId,
    });
  });
});

describe("recordRecruitmentSignupCodeUseIn", () => {
  it("increments the sign-in counter", async () => {
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await withTransaction(async (tx) => {
      await recordRecruitmentSignupCodeUseIn(tx, minted.code);
      await recordRecruitmentSignupCodeUseIn(tx, minted.code);
    });
    const row = await observer.query<{ sign_in_count: number }>(
      `select sign_in_count from public.recruitment_signup_codes where code = $1`,
      [minted.code],
    );
    expect(row.rows[0].sign_in_count).toBe(2);
  });

  it("does nothing for an unknown or deactivated code — never throws", async () => {
    await withTransaction(async (tx) => {
      await expect(recordRecruitmentSignupCodeUseIn(tx, "never-minted")).resolves.toBeUndefined();
    });
  });
});
