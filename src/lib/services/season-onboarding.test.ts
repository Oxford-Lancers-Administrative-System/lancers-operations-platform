// @vitest-environment node
/**
 * LAN-396 — a season's onboarding item types, and the items its memberships
 * should already have, against the real local database.
 *
 * The case is production's own, 2026-09-17: the 2026-27 season was opened by
 * baseline SQL that created the season, its terms, its positions and its
 * committee year and no item types at all. Every membership generated for it
 * therefore had none, and the roster board's onboarding cells were blank and
 * would not open. Brian repaired it by hand the same day.
 *
 * The suite mints its own season and memberships, tagged with a marker unique
 * to this file, and deletes every child row it wrote in dependency order.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import { openObserver } from "../../../tests/helpers/service-layer";
import { ONBOARDING_ITEM_TYPES } from "./onboarding-item-shapes";
import {
  backGenerateSeasonOnboardingItems,
  countSeasonOnboardingItemTypes,
  installSeasonOnboardingItemTypes,
} from "./season-onboarding";

const MARKER = "LAN396Baseline";

let observer: Client;
let seasonId: string;
const personIds: string[] = [];
const membershipIds: string[] = [];

async function cleanUp(): Promise<void> {
  for (const id of membershipIds) {
    await observer.query(
      `delete from public.onboarding_item_history
        where onboarding_item_id in (
          select id from public.onboarding_items where season_membership_id = $1::uuid)`,
      [id],
    );
    await observer.query(
      `delete from public.onboarding_items where season_membership_id = $1::uuid`,
      [id],
    );
  }
  await observer.query(`delete from public.season_memberships where season_id = $1::uuid`, [
    seasonId,
  ]);
  await observer.query(`delete from public.onboarding_item_types where season_id = $1::uuid`, [
    seasonId,
  ]);
  await observer.query(`delete from public.audit_events where entity_id = $1::uuid`, [seasonId]);
  await observer.query(`delete from public.seasons where id = $1::uuid`, [seasonId]);
  await observer.query(`delete from public.people where given_name = $1`, [MARKER]);
}

beforeAll(async () => {
  observer = await openObserver();

  // A season in `planning`, so it never competes with the seeded open season
  // for `readCurrentSeason`, opened the way production's baseline opened
  // 2026-27: with no item types at all.
  const vocabulary = await observer.query<{ id: string }>(
    `select position_vocabulary_id as id from public.seasons
      where position_vocabulary_id is not null limit 1`,
  );
  const season = await observer.query<{ id: string }>(
    `insert into public.seasons (label, status, position_vocabulary_id, starts_on)
     values ($1, 'planning', $2::uuid, '2031-09-01')
     returning id`,
    [`${MARKER} 2031-32`, vocabulary.rows[0].id],
  );
  seasonId = season.rows[0].id;

  for (const tag of ["one", "two"]) {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
      [MARKER, tag],
    );
    personIds.push(person.rows[0].id);
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1::uuid, $2::uuid, 'onboarding', 'new') returning id`,
      [person.rows[0].id, seasonId],
    );
    membershipIds.push(membership.rows[0].id);
  }
});

afterAll(async () => {
  await cleanUp();
  await observer.end();
  await closePool();
});

describe("a season opened without its onboarding item types", () => {
  it("carries none, and its memberships have none", async () => {
    const types = await withTransaction((tx) => countSeasonOnboardingItemTypes(tx, seasonId));
    expect(types).toBe(0);

    const items = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.onboarding_items where season_id = $1::uuid`,
      [seasonId],
    );
    expect(items.rows[0].count).toBe("0");
  });

  it("installs the canonical eleven and back-generates every membership's items", async () => {
    const result = await installSeasonOnboardingItemTypes(seasonId);
    expect(result.typesAdded).toBe(ONBOARDING_ITEM_TYPES.length);
    expect(result.itemsGenerated).toBe(ONBOARDING_ITEM_TYPES.length * membershipIds.length);

    const stored = await observer.query<{
      code: string;
      label: string;
      is_required: boolean;
      is_subscription: boolean;
      verification_class: string;
    }>(
      `select code, label, is_required, is_subscription, verification_class::text
         from public.onboarding_item_types where season_id = $1::uuid order by sort_order`,
      [seasonId],
    );
    expect(
      stored.rows.map((row) => ({
        code: row.code,
        label: row.label,
        isRequired: row.is_required,
        isSubscription: row.is_subscription,
        verificationClass: row.verification_class,
      })),
    ).toEqual(ONBOARDING_ITEM_TYPES.map((type) => ({ ...type })));

    for (const membershipId of membershipIds) {
      const items = await observer.query<{ count: string }>(
        `select count(*)::text as count from public.onboarding_items
          where season_membership_id = $1::uuid`,
        [membershipId],
      );
      expect(items.rows[0].count).toBe(String(ONBOARDING_ITEM_TYPES.length));
    }
  });

  it("records the repair as a system act, naming the mechanism rather than a person", async () => {
    const audit = await observer.query<{ actor_person_id: string | null; actor_label: string }>(
      `select actor_person_id, actor_label from public.audit_events
        where entity_table = 'seasons' and entity_id = $1::uuid
          and action = 'season_onboarding_item_types_installed'`,
      [seasonId],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_person_id).toBeNull();
    expect(audit.rows[0].actor_label).toContain("system");
  });

  it("writes nothing the second time, and audits nothing", async () => {
    const before = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events where entity_id = $1::uuid`,
      [seasonId],
    );

    const again = await installSeasonOnboardingItemTypes(seasonId);
    expect(again).toEqual({ typesAdded: 0, itemsGenerated: 0 });

    const after = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.audit_events where entity_id = $1::uuid`,
      [seasonId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it("back-generates on its own for a membership added before the types were", async () => {
    const person = await observer.query<{ id: string }>(
      `insert into public.people (given_name, family_name) values ($1, 'three') returning id`,
      [MARKER],
    );
    personIds.push(person.rows[0].id);
    const membership = await observer.query<{ id: string }>(
      `insert into public.season_memberships (person_id, season_id, status, entry)
       values ($1::uuid, $2::uuid, 'onboarding', 'new') returning id`,
      [person.rows[0].id, seasonId],
    );
    membershipIds.push(membership.rows[0].id);

    // A membership inserted straight into the table, the way a bulk load does,
    // has no items until something generates them.
    const generated = await backGenerateSeasonOnboardingItems(seasonId);
    expect(generated).toBe(ONBOARDING_ITEM_TYPES.length);

    const items = await observer.query<{ count: string }>(
      `select count(*)::text as count from public.onboarding_items
        where season_membership_id = $1::uuid`,
      [membership.rows[0].id],
    );
    expect(items.rows[0].count).toBe(String(ONBOARDING_ITEM_TYPES.length));
  });
});
