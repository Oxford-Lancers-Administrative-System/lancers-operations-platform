// @vitest-environment node
/**
 * The season-scoped messaging consent gate — LAN-202, packet amendment 1.
 *
 * Against the real local database: the guarantee under test is the
 * `(person_id, season_id)` uniqueness `season_messaging_consents` enforces and
 * the upsert behaviour built on top of it, neither of which a mocked
 * transaction can prove.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { Client } from "pg";

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import {
  grantSeasonMessagingConsentIn,
  hasGrantedSeasonMessagingConsentIn,
  mayReceiveWelcomeContactIn,
  readSeasonMessagingConsentIn,
  requireGrantedSeasonMessagingConsent,
  requireGrantedSeasonMessagingConsentIn,
  SEASON_MESSAGING_CONSENT_REQUIRED_RULE,
  withdrawSeasonMessagingConsentIn,
} from "./messaging-consent";
import { openObserver, seededIdentityCreatedAt } from "../../../tests/helpers/service-layer";

const MARKER = "LAN202ConsentSuite";

let observer: Client;
let seasonId: string;

async function insertPerson(tag: string): Promise<string> {
  const result = await observer.query<{ id: string }>(
    `insert into public.people (given_name, family_name) values ($1, $2) returning id`,
    [MARKER, tag],
  );
  return result.rows[0].id;
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
  await observer.query(
    `delete from public.season_messaging_consents
      where person_id in (select id from public.people where given_name = $1)`,
    [MARKER],
  );
  await observer.query("delete from public.people where given_name = $1", [MARKER]);
});

afterAll(async () => {
  await observer.query("delete from public.seasons where id = $1::uuid", [seasonId]);
  await observer.end();
  await closePool();
});

describe("readSeasonMessagingConsentIn / hasGrantedSeasonMessagingConsentIn", () => {
  it("reads null and false for a person never asked", async () => {
    const personId = await insertPerson("never-asked");
    await withTransaction(async (tx) => {
      expect(await readSeasonMessagingConsentIn(tx, personId, seasonId)).toBeNull();
      expect(await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId)).toBe(false);
    });
  });
});

describe("grantSeasonMessagingConsentIn", () => {
  it("writes a granted, dated, qr_self_entry row", async () => {
    const personId = await insertPerson("grant");
    await withTransaction(async (tx) => {
      const consent = await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(consent.state).toBe("granted");
      expect(consent.source).toBe("qr_self_entry");
    });
    const row = await observer.query(
      `select state::text as state, source::text as source
         from public.season_messaging_consents where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    expect(row.rows[0]).toEqual({ state: "granted", source: "qr_self_entry" });
  });

  it("re-grants a withdrawn row for the same person and season, in place", async () => {
    const personId = await insertPerson("re-grant");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      const regranted = await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(regranted.state).toBe("granted");
    });
    const rows = await observer.query(
      `select count(*)::int as count from public.season_messaging_consents
        where person_id = $1::uuid and season_id = $2::uuid`,
      [personId, seasonId],
    );
    // One row per (person, season), no matter how many times its state moves.
    expect(rows.rows[0].count).toBe(1);
  });
});

describe("withdrawSeasonMessagingConsentIn", () => {
  it("moves a granted row to withdrawn", async () => {
    const personId = await insertPerson("withdraw");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      const withdrawn = await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(withdrawn.state).toBe("withdrawn");
      expect(await hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("withdraws even a person with no prior row, rather than throwing", async () => {
    const personId = await insertPerson("withdraw-cold");
    await withTransaction(async (tx) => {
      const withdrawn = await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(withdrawn.state).toBe("withdrawn");
    });
  });
});

describe("requireGrantedSeasonMessagingConsentIn — the seam LAN-203 calls", () => {
  it("passes silently when the current state is granted", async () => {
    const personId = await insertPerson("gate-pass");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).resolves.toBeUndefined();
    });
  });

  it("refuses a person never asked", async () => {
    const personId = await insertPerson("gate-never-asked");
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });

  it("refuses a withdrawn consent — the send is refused after opt-out, proved here", async () => {
    const personId = await insertPerson("gate-withdrawn");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      let caught: unknown;
      try {
        await requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId);
      } catch (error) {
        caught = error;
      }
      expect(isServiceError(caught) && caught.kind).toBe("invalid_transition");
      expect((caught as { rule?: string }).rule).toBe(SEASON_MESSAGING_CONSENT_REQUIRED_RULE);
    });
  });

  it("refuses a refused consent", async () => {
    const personId = await insertPerson("gate-refused");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'refused', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });

  it("the non-transactional convenience wrapper refuses the same way", async () => {
    const personId = await insertPerson("gate-wrapper");
    await expect(requireGrantedSeasonMessagingConsent(personId, seasonId)).rejects.toMatchObject({
      rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE,
    });
  });

  it("refuses an 'asked' consent — the strict gate stays granted-only", async () => {
    const personId = await insertPerson("gate-asked");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'asked', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      await expect(
        requireGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
      ).rejects.toMatchObject({ rule: SEASON_MESSAGING_CONSENT_REQUIRED_RULE });
    });
  });
});

/**
 * LAN-204's own consent exception — pins the exact allowed set so a later
 * edit that widens it (or narrows the strict gate above to match) fails a
 * test rather than passing quietly. See the function's own doc comment.
 */
describe("mayReceiveWelcomeContactIn — LAN-204's one consent exception", () => {
  it("allows a person never asked — no row at all", async () => {
    const personId = await insertPerson("welcome-never-asked");
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person explicitly recorded as 'never_asked'", async () => {
    const personId = await insertPerson("welcome-never-asked-row");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'never_asked', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person in 'asked'", async () => {
    const personId = await insertPerson("welcome-asked");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'asked', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("allows a person already 'granted'", async () => {
    const personId = await insertPerson("welcome-granted");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(true);
    });
  });

  it("refuses a person who explicitly 'refused'", async () => {
    const personId = await insertPerson("welcome-refused");
    await observer.query(
      `insert into public.season_messaging_consents (person_id, season_id, state, source)
       values ($1::uuid, $2::uuid, 'refused', 'operator_recorded')`,
      [personId, seasonId],
    );
    await withTransaction(async (tx) => {
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(false);
    });
  });

  it("refuses a person who 'withdrawn'", async () => {
    const personId = await insertPerson("welcome-withdrawn");
    await withTransaction(async (tx) => {
      await grantSeasonMessagingConsentIn(tx, personId, seasonId);
      await withdrawSeasonMessagingConsentIn(tx, personId, seasonId);
      expect(await mayReceiveWelcomeContactIn(tx, personId, seasonId)).toBe(false);
    });
  });
});
