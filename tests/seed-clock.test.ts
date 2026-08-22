/**
 * The synthetic dataset's calendar must contain today.
 *
 * This suite exists because it did not. `scripts/seed-local.mjs` was authored
 * around one fixed notional "now" — Hilary 2027, week 6 — and read against a
 * machine clock in August 2026 that put the *entire* season in the future:
 * sixty-seven events the dataset records as having happened, all dated ahead of
 * today; two hundred and forty-eight attendance rows against events that had
 * not occurred; and, in the application, no event anywhere whose register had
 * been saved. Half of REQ-headline-numbers — the half where Showed reads a real
 * pair rather than a dash — existed only in unit tests.
 *
 * So the assertions here are not about arithmetic. They are the four states the
 * application has to be able to show, expressed as properties of the frame:
 * events behind today, events ahead of today, all of the first term behind
 * today so the twelve recorded registers and the lapse that follows them are
 * both history, and a notional now that never leaves the season.
 *
 * They are checked across four years of daily clocks rather than at one date,
 * because "correct today" is exactly the property the old fixed point had.
 */
import { describe, expect, it } from "vitest";

// The module the seed itself uses, so this suite tests the frame the database
// is actually built on rather than a restatement of it.
import {
  AUTHORED_NOW_ISO,
  AUTHORED_SEASON_ENDS_ON,
  AUTHORED_SEASON_STARTS_ON,
  MAX_RESIDUAL_DAYS,
  MIN_RESIDUAL_DAYS,
  seedFrame,
  shiftAuthoredValue,
  shiftedYearOf,
} from "../scripts/lib/seed-clock.mjs";

const DAY_MS = 86_400_000;

/**
 * The last day of Michaelmas in the authored calendar.
 *
 * Behind the notional now is what makes the attendance story exist at all: the
 * seed records the first twelve attendable sessions and then stops, so a frame
 * that left Michaelmas ahead would leave nothing recorded and nothing lapsed.
 */
const AUTHORED_MICHAELMAS_ENDS_ON = "2026-12-05";

/** The day Brian walked the review path and found every event in the future. */
const THE_DAY_IT_WAS_CAUGHT = new Date("2026-08-22T09:14:00Z");

const dayValue = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** Every date in the dataset moves by the frame's offset, and only by that. */
const slid = (authored: string, shiftDays: number) =>
  dayValue(shiftAuthoredValue(authored, shiftDays) as string);

/** Noon UTC on a day, which is how the frame reads the machine clock. */
const noon = (instant: Date) =>
  Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth(), instant.getUTCDate(), 12);

/** Four years of daily clocks, starting the day the defect was found. */
function everyDayForFourYears(): Date[] {
  const days: Date[] = [];
  for (let offset = 0; offset < 4 * 365; offset += 1) {
    days.push(new Date(THE_DAY_IT_WAS_CAUGHT.getTime() + offset * DAY_MS));
  }
  return days;
}

describe("the seeded calendar contains today", () => {
  it("puts the season around the day Brian found every event in the future", () => {
    const { shiftDays, now } = seedFrame(THE_DAY_IT_WAS_CAUGHT);
    const today = noon(THE_DAY_IT_WAS_CAUGHT);

    // The season has opened, and has not finished.
    expect(slid(AUTHORED_SEASON_STARTS_ON, shiftDays)).toBeLessThan(today);
    expect(slid(AUTHORED_SEASON_ENDS_ON, shiftDays)).toBeGreaterThan(today);

    // And the notional now sits inside it rather than beyond either end, which
    // is what stops the dataset being all history or all future.
    expect(now.getTime()).toBeGreaterThanOrEqual(dayValue(AUTHORED_SEASON_STARTS_ON));
    expect(now.getTime()).toBeLessThanOrEqual(dayValue(AUTHORED_SEASON_ENDS_ON));
  });

  it("leaves the first term behind today, so registers and the lapse are history", () => {
    for (const today of everyDayForFourYears()) {
      const { shiftDays } = seedFrame(today);
      expect(slid(AUTHORED_MICHAELMAS_ENDS_ON, shiftDays)).toBeLessThan(noon(today));
    }
  });

  it("leaves part of the season ahead of today, so upcoming events stay reviewable", () => {
    for (const today of everyDayForFourYears()) {
      const { shiftDays } = seedFrame(today);
      expect(slid(AUTHORED_SEASON_ENDS_ON, shiftDays)).toBeGreaterThan(noon(today));
    }
  });

  it("never lets the notional now leave the season, on any day", () => {
    for (const today of everyDayForFourYears()) {
      const { now } = seedFrame(today);
      expect(now.getTime()).toBeGreaterThanOrEqual(dayValue(AUTHORED_SEASON_STARTS_ON));
      expect(now.getTime()).toBeLessThanOrEqual(dayValue(AUTHORED_SEASON_ENDS_ON));
    }
  });

  it("does not depend on the hour the seed happens to run", () => {
    const morning = seedFrame(new Date("2026-08-22T00:30:00Z"));
    const night = seedFrame(new Date("2026-08-22T23:30:00Z"));

    expect(night.shiftDays).toBe(morning.shiftDays);
    expect(night.now.toISOString()).toBe(morning.now.toISOString());
  });
});

describe("the slide keeps the club's shape", () => {
  it("moves by whole weeks, so every weekday and term week survives", () => {
    for (const today of everyDayForFourYears()) {
      expect(Math.abs(seedFrame(today).shiftDays % 7)).toBe(0);
    }
  });

  it("keeps the residual inside the bounds the year-bearing labels need", () => {
    for (const today of everyDayForFourYears()) {
      const { residual } = seedFrame(today);
      expect(residual).toBeGreaterThanOrEqual(MIN_RESIDUAL_DAYS);
      expect(residual).toBeLessThanOrEqual(MAX_RESIDUAL_DAYS);
    }
  });

  it("holds every authored year-label's own date inside its year, within one wrap", () => {
    // Each of these is a date whose year is written into a label somewhere in
    // the dataset: the previous committee year's AGM, both seasons' openings,
    // the term-card import, the position vocabularies. If one crossed a New
    // Year while its label stayed put, the label would be a lie.
    const yearBearing = [
      "2025-06-04",
      "2025-09-28",
      "2026-06-10",
      "2026-08-01",
      "2026-09-01",
      "2026-09-27",
      "2027-06-19",
    ];

    for (const residual of [MIN_RESIDUAL_DAYS, 0, MAX_RESIDUAL_DAYS]) {
      for (const authored of yearBearing) {
        expect(shiftedYearOf(authored, residual)).toBe(Number(authored.slice(0, 4)));
      }
    }
  });

  it("moves dates and timestamps, and leaves everything that is not one alone", () => {
    expect(shiftAuthoredValue("2026-09-27", 7)).toBe("2026-10-04");
    expect(shiftAuthoredValue("2026-12-30T20:00:00Z", 7)).toBe("2027-01-06T20:00:00.000Z");

    // Values full of digits that are not dates, and must never be treated as
    // any: a season label, a vocabulary code, a reminder-offset array, a time
    // of day, and a workbook name.
    for (const untouched of ["2026-27", "oulafc-2026", "{72,24}", "20:00", "MT26"]) {
      expect(shiftAuthoredValue(untouched, 91)).toBe(untouched);
    }

    // A notification payload carries the event date it was rendered from, and
    // it has to move with the event.
    expect(shiftAuthoredValue('{"scheduled_on":"2026-10-14"}', -7)).toBe(
      '{"scheduled_on":"2026-10-07"}',
    );
  });

  it("does nothing at all when the frame already sits on the authored now", () => {
    const { shiftDays, now } = seedFrame(new Date(AUTHORED_NOW_ISO));

    expect(shiftDays).toBe(0);
    expect(now.toISOString()).toBe(AUTHORED_NOW_ISO.replace("Z", ".000Z"));
  });
});
