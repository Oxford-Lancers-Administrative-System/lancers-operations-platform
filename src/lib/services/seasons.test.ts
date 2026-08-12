// @vitest-environment node
/**
 * The season and term reads — LAN-76, matrix row 10.
 *
 * The interesting case is the one the seeded dataset does not contain: a club
 * with no season it is operating. It is produced here by archiving every season
 * inside a transaction that is then rolled back, which works because
 * `withTransaction` **joins** an transaction already in flight on the same
 * async context rather than opening a second one. So `readCurrentSeason()`
 * reads the uncommitted state, and nothing survives the test.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { closePool, isServiceError, withTransaction } from "@/lib/db";
import {
  listTerms,
  NO_CURRENT_SEASON_MESSAGE,
  OPERATING_SEASON_STATUSES,
  readCurrentSeason,
} from "./seasons";

afterAll(async () => {
  await closePool();
});

/** Marks the deliberate abort that unwinds a fixture transaction. */
const ROLLBACK = new Error("fixture transaction deliberately rolled back");

async function inRolledBackTransaction(
  body: (tx: {
    query: (sql: string, params?: readonly unknown[]) => Promise<unknown>;
  }) => Promise<void>,
): Promise<void> {
  try {
    await withTransaction(async (tx) => {
      await body(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

describe("the season the club is operating", () => {
  it("is the seeded active season", async () => {
    const season = await readCurrentSeason();

    expect(OPERATING_SEASON_STATUSES).toContain(season.status);
    expect(season.label).not.toBe("");
  });

  it("never returns an archived season", async () => {
    const season = await readCurrentSeason();

    expect(season.status).not.toBe("archived");
    expect(season.status).not.toBe("planning");
  });

  it("refuses rather than falling back when no season is open", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.query(
        `update public.seasons set status = 'archived',
            closed_at = coalesce(closed_at, now()),
            closed_by_person_id = coalesce(closed_by_person_id, (select id from public.people limit 1))
          where status = any($1::public.season_status[])`,
        [OPERATING_SEASON_STATUSES],
      );

      let refusal: unknown;
      try {
        await readCurrentSeason();
      } catch (error) {
        refusal = error;
      }

      expect(isServiceError(refusal)).toBe(true);
      if (!isServiceError(refusal)) return;
      expect(refusal.kind).toBe("not_found");
      expect(refusal.message).toBe(NO_CURRENT_SEASON_MESSAGE);
    });
  });

  it("operates the newer season when two are open at once", async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx.query(
        `update public.seasons set status = 'open',
            opened_at = coalesce(opened_at, now()),
            opened_by_person_id = coalesce(opened_by_person_id, (select id from public.people limit 1))`,
      );

      const season = await readCurrentSeason();
      const newest = await tx.query(
        "select label from public.seasons order by starts_on desc nulls last limit 1",
      );

      expect(season.label).toBe((newest as { rows: { label: string }[] }).rows[0].label);
    });
  });
});

describe("the term coordinates an event can be recorded against", () => {
  it("lists every term, newest first", async () => {
    const terms = await listTerms();

    expect(terms.length).toBeGreaterThan(0);
    const dates = terms.map((term) => term.startsOn);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("reports dates as plain calendar dates, with no time and no zone", async () => {
    const terms = await listTerms();

    for (const term of terms) {
      expect(term.startsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(term.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("keeps Michaelmas's week −1 and the other terms' 0th week", async () => {
    const terms = await listTerms();

    for (const term of terms) {
      expect(term.firstWeek).toBe(term.name === "michaelmas" ? -1 : 0);
      expect(term.lastWeek).toBeGreaterThanOrEqual(1);
    }
  });
});
