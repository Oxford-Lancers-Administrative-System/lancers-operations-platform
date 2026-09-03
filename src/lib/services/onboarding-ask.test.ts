// @vitest-environment node
/**
 * The compiled-outstanding-ask reader — LAN-214, `REQ-one-link`'s share.
 * Against the real local database: what is under test is the join across
 * `onboarding_items`, `person-required.ts`'s missing-field computation and
 * `person_access_tokens`' own one-live-credential index, none of which a
 * mocked transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { openObserver, seededActorPersonId } from "../../../tests/helpers/service-layer";
import { hasLiveOnboardingLinkIn, readCompiledOutstandingAskIn } from "./onboarding-ask";

const MARKER = "LAN214Ask";

let observer: Client;
let seasonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    "insert into public.people (given_name, family_name) values ($1, $2) returning id",
    [MARKER, tag],
  );
  return result.rows[0].id;
}

async function insertMembership(personId: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.season_memberships (person_id, season_id, status, entry, confirmed_on)
     values ($1::uuid, $2::uuid, 'onboarding', 'new', current_date) returning id`,
    [personId, seasonId],
  );
  return result.rows[0].id;
}

async function insertOutstandingItem(membershipId: string, code: string): Promise<void> {
  const type = await observer.query<{ id: string }>(
    `insert into public.onboarding_item_types (season_id, code, label)
     values ($1::uuid, $2, $2) returning id`,
    [seasonId, code],
  );
  await observer.query(
    `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
     values ($1::uuid, $2::uuid, $3::uuid, 'pending')`,
    [membershipId, seasonId, type.rows[0].id],
  );
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
    `delete from public.person_access_tokens where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query(
    `delete from public.onboarding_items where season_membership_id in
       (select id from public.season_memberships where person_id in
         (select id from public.people where given_name = $1))`,
    [MARKER],
  );
  await observer.query(`delete from public.onboarding_item_types where season_id = $1`, [seasonId]);
  await observer.query(
    `delete from public.season_memberships where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("readCompiledOutstandingAskIn", () => {
  it("returns null for a person with no membership this season", async () => {
    const personId = await insertPerson("no-membership");
    const ask = await withTransaction((tx) => readCompiledOutstandingAskIn(tx, personId, seasonId));
    expect(ask).toBeNull();
  });

  it("compiles missing required fields and outstanding items together", async () => {
    const personId = await insertPerson("outstanding");
    const membershipId = await insertMembership(personId);
    await insertOutstandingItem(membershipId, `${MARKER}-item`);

    const ask = await withTransaction((tx) => readCompiledOutstandingAskIn(tx, personId, seasonId));
    expect(ask?.membershipId).toBe(membershipId);
    expect(ask?.outstandingItems.map((i) => i.code)).toContain(`${MARKER}-item`);
    // A freshly created person, no mobile, no email on file — the recruit
    // tier's own required set is outstanding.
    expect(ask?.missingRequiredFields.length).toBeGreaterThan(0);
  });

  it("excludes an item once it is resolved", async () => {
    const personId = await insertPerson("resolved");
    const membershipId = await insertMembership(personId);
    await insertOutstandingItem(membershipId, `${MARKER}-resolved`);
    await observer.query(
      `update public.onboarding_items set status = 'complete', completed_on = current_date
        where season_membership_id = $1::uuid`,
      [membershipId],
    );

    const ask = await withTransaction((tx) => readCompiledOutstandingAskIn(tx, personId, seasonId));
    expect(ask?.outstandingItems).toEqual([]);
  });
});

describe("hasLiveOnboardingLinkIn", () => {
  it("is false with no token, true once a durable credential is issued, false once revoked", async () => {
    const personId = await insertPerson("token");
    expect(await withTransaction((tx) => hasLiveOnboardingLinkIn(tx, personId, seasonId))).toBe(
      false,
    );

    const token = await observer.query<{ id: string }>(
      `insert into public.person_access_tokens (person_id, season_id, token_hash, single_use)
       values ($1::uuid, $2::uuid, repeat('a', 64), false) returning id`,
      [personId, seasonId],
    );
    expect(await withTransaction((tx) => hasLiveOnboardingLinkIn(tx, personId, seasonId))).toBe(
      true,
    );

    await observer.query(
      "update public.person_access_tokens set revoked_at = now(), revoked_reason = 'test' where id = $1::uuid",
      [token.rows[0].id],
    );
    expect(await withTransaction((tx) => hasLiveOnboardingLinkIn(tx, personId, seasonId))).toBe(
      false,
    );
  });
});
