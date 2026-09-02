// @vitest-environment node
/**
 * Questionnaire B's own credential — LAN-206. Against the real local
 * database, on `recruitment-cycle-dispatch.test.ts`'s own reasoning: the
 * partial unique index's concurrency behaviour is not something a mocked
 * transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";
import { closePool, withTransaction } from "@/lib/db";
import {
  issueRecruitmentInterestTokenIn,
  resolveRecruitmentInterestTokenIn,
} from "./recruitment-interest-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN206InterestTokenSuite";

let observer: Client;
let seasonId: string;

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
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query(`delete from public.recruitment_prospects where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

async function newPerson(): Promise<string> {
  const person = await withTransaction((tx) =>
    tx.query<{ id: string }>(
      "insert into public.people (given_name, family_name) values ($1, $2) returning id",
      [MARKER, "Fixture"],
    ),
  );
  return person.rows[0].id;
}

async function prospectFor(personId: string): Promise<void> {
  await withTransaction((tx) =>
    tx.query(
      `insert into public.recruitment_prospects (person_id, season_id, status, source)
       values ($1::uuid, $2::uuid, 'engaged', 'other')`,
      [personId, seasonId],
    ),
  );
}

describe("issueRecruitmentInterestTokenIn / resolveRecruitmentInterestTokenIn", () => {
  it("mints a token that resolves to the person's own prospect", async () => {
    const personId = await newPerson();
    await prospectFor(personId);

    const issued = await withTransaction((tx) =>
      issueRecruitmentInterestTokenIn(tx, personId, seasonId),
    );
    const resolution = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, issued.token),
    );

    expect(resolution.state).toBe("valid");
    expect(resolution.resolved?.personId).toBe(personId);
    expect(resolution.resolved?.displayName).toBe(`${MARKER} Fixture`);
  });

  it("reads unknown for a malformed token, a hash miss, and a revoked one — indistinguishably", async () => {
    const personId = await newPerson();
    await prospectFor(personId);

    const malformed = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, "not-a-real-token"),
    );
    expect(malformed).toEqual({ state: "unknown", resolved: null });

    const neverIssued = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, "a".repeat(43)),
    );
    expect(neverIssued).toEqual({ state: "unknown", resolved: null });

    const issued = await withTransaction((tx) =>
      issueRecruitmentInterestTokenIn(tx, personId, seasonId),
    );
    // Superseding with a fresh mint is what W4-03's "expired or replaced by a
    // newer one" means in practice — see the module's own note.
    await withTransaction((tx) => issueRecruitmentInterestTokenIn(tx, personId, seasonId));
    const supersededResolution = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, issued.token),
    );
    expect(supersededResolution).toEqual({ state: "unknown", resolved: null });
  });

  it("one open request per person, ever — a second mint supersedes rather than standing open beside the first", async () => {
    const personId = await newPerson();
    await prospectFor(personId);

    const first = await withTransaction((tx) =>
      issueRecruitmentInterestTokenIn(tx, personId, seasonId),
    );
    const second = await withTransaction((tx) =>
      issueRecruitmentInterestTokenIn(tx, personId, seasonId),
    );

    const openRows = await observer.query<{ token: string }>(
      `select token_hash as token from public.person_access_tokens
        where person_id = $1::uuid and purpose = 'recruit_interest_request' and revoked_at is null`,
      [personId],
    );
    expect(openRows.rows).toHaveLength(1);

    const firstResolution = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, first.token),
    );
    const secondResolution = await withTransaction((tx) =>
      resolveRecruitmentInterestTokenIn(tx, second.token),
    );
    expect(firstResolution.state).toBe("unknown");
    expect(secondResolution.state).toBe("valid");
  });

  it("the substrate itself refuses two open rows for one (person, purpose) — proves the partial unique index, not just the service function", async () => {
    const personId = await newPerson();
    await withTransaction((tx) =>
      tx.query(
        `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use, purpose)
         values ($1::uuid, $2::uuid, $3, false, 'recruit_interest_request')`,
        [personId, seasonId, "a".repeat(64)],
      ),
    );

    await expect(
      withTransaction((tx) =>
        tx.query(
          `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use, purpose)
           values ($1::uuid, $2::uuid, $3, false, 'recruit_interest_request')`,
          [personId, seasonId, "b".repeat(64)],
        ),
      ),
    ).rejects.toThrow(/collides with something already recorded/i);
  });

  it("a durable player-page credential and an RSVP one-time answer token are untouched by the new index — no `purpose`, no constraint", async () => {
    const personId = await newPerson();
    // Two ordinary durable-shaped rows with `purpose is null`: the existing
    // `person_access_tokens_one_live_per_person_season` index (scoped to
    // `not single_use`) already refuses two of *those* for one season, so
    // this proves the *new* index does not additionally refuse them for an
    // unrelated reason — two different seasons, both `purpose is null`.
    const otherSeason = await observer.query<{ id: string }>(
      `insert into public.seasons
         (label, status, position_vocabulary_id, starts_on, ends_on, opened_at, opened_by_person_id)
       values ($1, 'open', (select id from public.position_vocabularies order by adopted_on desc limit 1),
               '2020-09-01', '2021-06-01', now(),
               (select id from public.people where created_at = $2::timestamptz order by id limit 1))
       returning id`,
      [`${MARKER} second season`, await seededIdentityCreatedAt(observer)],
    );
    try {
      await withTransaction((tx) =>
        tx.query(
          `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
           values ($1::uuid, $2::uuid, $3, false)`,
          [personId, seasonId, "c".repeat(64)],
        ),
      );
      await withTransaction((tx) =>
        tx.query(
          `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
           values ($1::uuid, $2::uuid, $3, false)`,
          [personId, otherSeason.rows[0].id, "d".repeat(64)],
        ),
      );
      const rows = await observer.query(
        `select id from public.person_access_tokens where person_id = $1::uuid and purpose is null`,
        [personId],
      );
      expect(rows.rows).toHaveLength(2);
    } finally {
      await observer.query("delete from public.person_access_tokens where person_id = $1::uuid", [
        personId,
      ]);
      await observer.query("delete from public.seasons where id = $1::uuid", [
        otherSeason.rows[0].id,
      ]);
    }
  });
});
