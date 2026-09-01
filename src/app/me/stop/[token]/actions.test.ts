// @vitest-environment node
/**
 * The opt-out surface's one server action, end to end — LAN-202 "Done when":
 * "Withdrawing consent stops every send for that season, proved by test."
 * This suite proves it from the token in the URL through to the exact gate
 * `requireGrantedSeasonMessagingConsentIn` (`messaging-consent.ts`) refuses
 * on afterwards — the same function LAN-203's own dispatch calls.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, withTransaction } from "@/lib/db";
import {
  grantSeasonMessagingConsentIn,
  requireGrantedSeasonMessagingConsentIn,
} from "@/lib/services/messaging-consent";
import { issuePersonTokenIn } from "@/lib/services/player-answer-tokens";
import { openObserver, seededIdentityCreatedAt } from "../../../../../tests/helpers/service-layer";
import { withdrawMessagingConsent } from "./actions";

const MARKER = "LAN202StopActionSuite";

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
  await observer.query(
    `delete from public.season_messaging_consents where person_id in ${people}`,
    [MARKER],
  );
  await observer.query(`delete from public.person_access_tokens where person_id in ${people}`, [
    MARKER,
  ]);
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

async function mintGrantedPersonAndToken(): Promise<{ personId: string; token: string }> {
  const person = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, 'Withdrawing') returning id`,
    [MARKER],
  );
  const personId = person.rows[0].id;
  await withTransaction((tx) => grantSeasonMessagingConsentIn(tx, personId, seasonId));
  const issued = await withTransaction((tx) => issuePersonTokenIn(tx, personId, seasonId));
  return { personId, token: issued.token };
}

describe("withdrawMessagingConsent", () => {
  it("moves a granted consent to withdrawn", async () => {
    const { personId, token } = await mintGrantedPersonAndToken();

    const outcome = await withdrawMessagingConsent(token);
    expect(outcome).toEqual({ ok: true });

    const consent = await observer.query(
      `select state::text as state from public.season_messaging_consents
        where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(consent.rows[0]?.state).toBe("withdrawn");
  });

  it("stops every future send — the consent gate refuses immediately afterwards", async () => {
    const { personId, token } = await mintGrantedPersonAndToken();

    await withTransaction((tx) => requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId));

    await withdrawMessagingConsent(token);

    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toThrow();
    });
  });

  it("refuses a revoked or unknown token, gracefully", async () => {
    const outcome = await withdrawMessagingConsent("not-a-real-token");
    expect(outcome.ok).toBe(false);
  });
});
