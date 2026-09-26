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
  COMPLETED_SIGNUPS_TEST_OFFSET,
  mintRecruitmentSignupCodeIn,
  PARTIAL_DOOR,
  readRecruitmentSignupFiguresIn,
  recordRecruitmentSignupCodeUseIn,
  recordRecruitmentSignupVisitIn,
  resolveRecruitmentSignupCode,
  resolveRecruitmentSignupCodeIn,
} from "./recruitment-signup-codes";
import { PARTIAL_SOURCE } from "./recruitment-signup";
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

describe("LAN-428 — Visits, Partial and Completed", () => {
  afterEach(async () => {
    await observer.query(
      `delete from public.audit_events
        where action = 'person_created' and context ->> 'season_id' = any($1::text[])`,
      [[seasonId, otherSeasonId]],
    );
  });

  async function partialAudit(season: string, door: string = PARTIAL_DOOR) {
    await observer.query(
      `insert into public.audit_events (actor_label, action, entity_table, entity_id, context)
       values ('recruit: QR sign-up form (partial, before Save)', 'person_created', 'people',
               gen_random_uuid(), jsonb_build_object('door', $2::text, 'season_id', $1::text))`,
      [season, door],
    );
  }

  it("names the partial door exactly as the sign-up service writes it", () => {
    expect(PARTIAL_DOOR).toBe(PARTIAL_SOURCE);
  });

  it("counts a visit on a live code, in the statement that resolves it", async () => {
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    const resolved = await withTransaction(async (tx) => {
      await recordRecruitmentSignupVisitIn(tx, minted.code);
      return recordRecruitmentSignupVisitIn(tx, minted.code);
    });

    expect(resolved).toEqual({ state: "valid", seasonId });
    const row = await observer.query<{ visit_count: number; sign_in_count: number }>(
      `select visit_count, sign_in_count from public.recruitment_signup_codes where code = $1`,
      [minted.code],
    );
    expect(row.rows[0]).toEqual({ visit_count: 2, sign_in_count: 0 });
  });

  it("counts nothing for an unknown or deactivated code, and resolves it as unknown", async () => {
    const first = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));

    expect(await withTransaction((tx) => recordRecruitmentSignupVisitIn(tx, first.code))).toEqual({
      state: "unknown",
      seasonId: null,
    });
    expect(
      await withTransaction((tx) => recordRecruitmentSignupVisitIn(tx, "never-minted")),
    ).toEqual({ state: "unknown", seasonId: null });
    const row = await observer.query<{ visit_count: number }>(
      `select visit_count from public.recruitment_signup_codes where code = $1`,
      [first.code],
    );
    expect(row.rows[0].visit_count).toBe(0);
  });

  it("reads the three numbers, Completed less the test sign-ups, stored count unchanged", async () => {
    expect(COMPLETED_SIGNUPS_TEST_OFFSET).toBe(12);
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await withTransaction(async (tx) => {
      for (let i = 0; i < 3; i += 1) await recordRecruitmentSignupVisitIn(tx, minted.code);
      for (let i = 0; i < 15; i += 1) await recordRecruitmentSignupCodeUseIn(tx, minted.code);
    });
    await partialAudit(seasonId);
    await partialAudit(seasonId);
    // Neither of these is a partial on this season's code.
    await partialAudit(otherSeasonId);
    await partialAudit(seasonId, "qr_self_entry");

    const figures = await withTransaction((tx) => readRecruitmentSignupFiguresIn(tx, seasonId));

    expect(figures).toEqual({ visits: 3, partial: 2, completed: 3 });
    const stored = await observer.query<{ sign_in_count: number }>(
      `select sign_in_count from public.recruitment_signup_codes where code = $1`,
      [minted.code],
    );
    expect(stored.rows[0].sign_in_count).toBe(15);
  });

  it("never shows Completed below zero", async () => {
    const minted = await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await withTransaction((tx) => recordRecruitmentSignupCodeUseIn(tx, minted.code));

    const figures = await withTransaction((tx) => readRecruitmentSignupFiguresIn(tx, seasonId));

    expect(figures?.completed).toBe(0);
  });

  it("counts only partials since the live code was minted", async () => {
    await partialAudit(seasonId);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await withTransaction((tx) => mintRecruitmentSignupCodeIn(tx, seasonId));
    await partialAudit(seasonId);

    const figures = await withTransaction((tx) => readRecruitmentSignupFiguresIn(tx, seasonId));

    expect(figures?.partial).toBe(1);
  });

  it("has no numbers when the season has no live code", async () => {
    expect(await withTransaction((tx) => readRecruitmentSignupFiguresIn(tx, seasonId))).toBeNull();
  });
});
