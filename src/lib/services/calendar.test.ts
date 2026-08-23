/**
 * The Gregorian month projection, and the Oxford week arithmetic beneath it —
 * LAN-114, narrowed by LAN-153.
 *
 * ## The fixtures are the club's real term cards
 *
 * `MICHAELMAS_2026`, `HILARY_2027` and `TRINITY_2027` below are the terms as
 * `public.terms` holds them — the same rows `scripts/seed-local.mjs` seeds —
 * and every date this file asserts was read off the three supplied OULAFC term
 * cards rather than computed from the code under test:
 *
 *   * `260720 OULAFC MT26 Term Card v0.xlsx` — −1st week 27 Sep–3 Oct, 0th
 *     week 4–10 Oct, weeks 1–8 from 11 Oct to 5 Dec.
 *   * `260720 OULAFC HT27 Term Card v0.xlsx` — 0th week 10–16 Jan, weeks 1–8
 *     from 17 Jan to 13 Mar.
 *   * `260720 OULAFC TT27 Term Card v0.xlsx` — 0th week 18–24 Apr, weeks 1–8
 *     from 25 Apr to 19 Jun.
 *
 * ## The stale heading
 *
 * The HT and TT sources are *headed* "OULAFC Term Card, HT2026" and "TT2026"
 * while the weeks they contain are January and April **2027**. The issue calls
 * that stale source labelling and forbids deriving a canonical year from
 * heading text. There is a test for it below, and it is not ceremonial: it is
 * the one assertion that fails if somebody ever "corrects" Hilary and Trinity
 * to 2026 to match the spreadsheets they were transcribed from.
 */
import { describe, expect, it } from "vitest";

import type { TermWindow } from "./event-input";
import {
  addDays,
  buildMonthGrid,
  defaultMonth,
  monthOf,
  oxfordWeekRange,
  parseMonth,
  shiftMonth,
  termWeeks,
  weekdayOf,
  type CalendarEvent,
} from "./calendar";

// ---------------------------------------------------------------------------
// The 2026–27 club year, exactly as configured
// ---------------------------------------------------------------------------

const MICHAELMAS_2026: TermWindow = Object.freeze({
  id: "term-mt-2026",
  name: "michaelmas",
  academicYear: "2026-27",
  startsOn: "2026-09-27",
  endsOn: "2026-12-05",
  firstWeek: -1,
  lastWeek: 8,
});

const HILARY_2027: TermWindow = Object.freeze({
  id: "term-ht-2027",
  name: "hilary",
  academicYear: "2026-27",
  startsOn: "2027-01-10",
  endsOn: "2027-03-13",
  firstWeek: 0,
  lastWeek: 8,
});

const TRINITY_2027: TermWindow = Object.freeze({
  id: "term-tt-2027",
  name: "trinity",
  academicYear: "2026-27",
  startsOn: "2027-04-18",
  endsOn: "2027-06-19",
  firstWeek: 0,
  lastWeek: 8,
});

/*
 * The previous academic year, and the term *list* that held it, were fixtures for
 * `buildTermCard`, `nearestTerm` and the two selectors, and went with them.
 * `oxfordWeekRange` and `termWeeks` take one term at a time.
 * `./oxford-year.test.ts` holds the multi-year list the continuous column needs,
 * and asserts the same reference boundaries against it.
 */

let nextId = 0;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    name: `Event ${nextId}`,
    eventType: "practice",
    scheduledOn: null,
    startsAt: null,
    endsAt: null,
    venue: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Bare-date arithmetic
// ---------------------------------------------------------------------------

describe("bare-date arithmetic", () => {
  it("counts Sunday as column 0, matching the term cards", () => {
    // 27 September 2026 is a Sunday — it is the first cell of Michaelmas's
    // −1st week row in the supplied source.
    expect(weekdayOf("2026-09-27")).toBe(0);
    expect(weekdayOf("2026-09-30")).toBe(3);
    expect(weekdayOf("2026-10-03")).toBe(6);
  });

  it("adds days across a month, a year and a British Summer Time change", () => {
    expect(addDays("2026-10-24", 7)).toBe("2026-10-31");
    // The clocks go back on 25 October 2026. Bare dates must not notice.
    expect(addDays("2026-10-24", 8)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("refuses a day that does not exist rather than rolling it forward", () => {
    expect(addDays("2027-02-31", 1)).toBeNull();
    expect(weekdayOf("not-a-date")).toBeNull();
    expect(monthOf("2027-02-30")).toBeNull();
  });

  it("refuses to run off the end of the four-digit years", () => {
    // `toISOString` switches to an expanded six-digit year past 9999, which
    // would otherwise come back as the string "+010000-01".
    expect(addDays("9999-12-31", 1)).toBeNull();
    expect(addDays("9999-12-30", 1)).toBe("9999-12-31");
  });

  it("shifts months across a year boundary in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-10", 15)).toBe("2028-01");
    expect(shiftMonth("2026-10", -15)).toBe("2025-07");
  });

  it("accepts only a real YYYY-MM", () => {
    expect(parseMonth("2026-10")).toBe("2026-10");
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth("2026-1")).toBeNull();
    expect(parseMonth("")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 1, 2, 3 — the three supplied term cards, to the day
// ---------------------------------------------------------------------------

describe("oxfordWeekRange, against the supplied term cards", () => {
  it("matches Michaelmas 2026 at −1st, 0th, 1st and 8th week", () => {
    expect(oxfordWeekRange(MICHAELMAS_2026, -1)).toEqual({
      startsOn: "2026-09-27",
      endsOn: "2026-10-03",
    });
    expect(oxfordWeekRange(MICHAELMAS_2026, 0)).toEqual({
      startsOn: "2026-10-04",
      endsOn: "2026-10-10",
    });
    expect(oxfordWeekRange(MICHAELMAS_2026, 1)).toEqual({
      startsOn: "2026-10-11",
      endsOn: "2026-10-17",
    });
    // The source's last row is 8th (29th–5th Dec), and the term's `ends_on` is
    // 5 December. The two agree, which is what makes the arithmetic safe.
    expect(oxfordWeekRange(MICHAELMAS_2026, 8)).toEqual({
      startsOn: "2026-11-29",
      endsOn: "2026-12-05",
    });
    expect(oxfordWeekRange(MICHAELMAS_2026, 8)?.endsOn).toBe(MICHAELMAS_2026.endsOn);
  });

  it("matches Hilary 2027 at 0th, 1st and 8th week, in 2027", () => {
    expect(oxfordWeekRange(HILARY_2027, 0)).toEqual({
      startsOn: "2027-01-10",
      endsOn: "2027-01-16",
    });
    expect(oxfordWeekRange(HILARY_2027, 1)).toEqual({
      startsOn: "2027-01-17",
      endsOn: "2027-01-23",
    });
    expect(oxfordWeekRange(HILARY_2027, 8)).toEqual({
      startsOn: "2027-03-07",
      endsOn: "2027-03-13",
    });
  });

  it("matches Trinity 2027 at 0th, 1st and 8th week, in 2027", () => {
    expect(oxfordWeekRange(TRINITY_2027, 0)).toEqual({
      startsOn: "2027-04-18",
      endsOn: "2027-04-24",
    });
    // The source reads "1st (25th-1st May)" — a week that crosses the month.
    expect(oxfordWeekRange(TRINITY_2027, 1)).toEqual({
      startsOn: "2027-04-25",
      endsOn: "2027-05-01",
    });
    expect(oxfordWeekRange(TRINITY_2027, 8)).toEqual({
      startsOn: "2027-06-13",
      endsOn: "2027-06-19",
    });
  });

  it("every week row of every supplied card starts on a Sunday and ends on a Saturday", () => {
    for (const term of [MICHAELMAS_2026, HILARY_2027, TRINITY_2027]) {
      for (const week of termWeeks(term)) {
        const range = oxfordWeekRange(term, week);
        expect(range).not.toBeNull();
        expect(weekdayOf(range!.startsOn)).toBe(0);
        expect(weekdayOf(range!.endsOn)).toBe(6);
      }
    }
  });

  it("does not invent a week the term is not configured to have", () => {
    // Hilary and Trinity begin at 0th week. There is no −1st week row.
    expect(oxfordWeekRange(HILARY_2027, -1)).toBeNull();
    expect(oxfordWeekRange(TRINITY_2027, -1)).toBeNull();
    expect(oxfordWeekRange(MICHAELMAS_2026, -2)).toBeNull();
    expect(oxfordWeekRange(MICHAELMAS_2026, 9)).toBeNull();
    expect(oxfordWeekRange(MICHAELMAS_2026, 1.5)).toBeNull();
  });

  it("takes the year from the configured term, never from the source heading", () => {
    // The HT27 and TT27 spreadsheets are headed "HT2026" and "TT2026". If a
    // heading had ever been treated as canonical, these weeks would be a year
    // early — and the club would be shown an empty term card for the season it
    // is actually operating.
    expect(oxfordWeekRange(HILARY_2027, 0)?.startsOn.startsWith("2027")).toBe(true);
    expect(oxfordWeekRange(TRINITY_2027, 0)?.startsOn.startsWith("2027")).toBe(true);
    expect(HILARY_2027.academicYear).toBe("2026-27");
    expect(TRINITY_2027.academicYear).toBe("2026-27");
  });
});

describe("termWeeks", () => {
  it("gives Michaelmas ten rows, from −1, and Hilary nine, from 0", () => {
    expect(termWeeks(MICHAELMAS_2026)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(termWeeks(HILARY_2027)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(termWeeks(TRINITY_2027)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("follows the configuration rather than assuming weeks 1 to 8", () => {
    const short: TermWindow = { ...HILARY_2027, firstWeek: 0, lastWeek: 4 };
    expect(termWeeks(short)).toEqual([0, 1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 4, 5, 6, 7, 8 — the term card
// ---------------------------------------------------------------------------

/*
 * `nearestTerm`, `buildTermCard`, `defaultTerm`, `groupTermsByAcademicYear` and
 * `findTerm` had blocks here, and went with the term card LAN-153 retired (D85).
 * Everything they proved is either gone with the surface — which term should
 * borrow a vacation week, how far a card reaches, which term a selector opens on
 * — or moved to `./oxford-year.test.ts`, where the same reference boundaries are
 * asserted against the continuous year instead.
 */

describe("buildMonthGrid", () => {
  it("starts each week on Sunday and covers the whole month", () => {
    const grid = buildMonthGrid("2026-10", []);

    expect(grid.weeks[0][0].day).toBe("2026-09-27");
    expect(grid.weeks[0].map((day) => day.inMonth)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
    expect(grid.weeks.every((week) => week.length === 7)).toBe(true);
    const days = grid.weeks.flat();
    expect(days.filter((day) => day.inMonth)).toHaveLength(31);
    expect(days[days.length - 1].day).toBe("2026-10-31");
  });

  it("handles a short month and a month that starts on a Sunday", () => {
    // February 2027 has 28 days and begins on a Monday: five rows.
    const february = buildMonthGrid("2027-02", []);
    expect(february.weeks).toHaveLength(5);
    expect(february.weeks[0][0].day).toBe("2027-01-31");
    expect(february.weeks.flat().filter((day) => day.inMonth)).toHaveLength(28);

    // November 2026 begins on a Sunday: no borrowed days at the front.
    const november = buildMonthGrid("2026-11", []);
    expect(november.weeks[0][0].day).toBe("2026-11-01");
    expect(november.weeks[0][0].inMonth).toBe(true);
  });

  it("places events on their actual date, including the borrowed days", () => {
    const inMonth = event({ scheduledOn: "2026-10-14", name: "Practice" });
    // 27 September is in October's first row, and a real event on it.
    const borrowed = event({ scheduledOn: "2026-09-27", name: "Michaelmas opens" });

    const grid = buildMonthGrid("2026-10", [inMonth, borrowed]);

    expect(grid.weeks[0][0].events.map((e) => e.name)).toEqual(["Michaelmas opens"]);
    expect(grid.weeks[0][0].inMonth).toBe(false);
    const wednesday = grid.weeks.flat().find((day) => day.day === "2026-10-14");
    expect(wednesday?.events.map((e) => e.name)).toEqual(["Practice"]);
    expect(grid.placedCount).toBe(2);
  });

  it("shows two events on one date separately, in start-time order", () => {
    const late = event({ scheduledOn: "2026-10-14", startsAt: "20:00", name: "Practice" });
    const early = event({ scheduledOn: "2026-10-14", startsAt: "18:00", name: "Chalk" });

    const grid = buildMonthGrid("2026-10", [late, early]);
    const cell = grid.weeks.flat().find((day) => day.day === "2026-10-14");
    expect(cell?.events.map((e) => e.name)).toEqual(["Chalk", "Practice"]);
  });

  it("keeps an undated event out of the grid but not out of the answer", () => {
    const undated = event({ scheduledOn: null, name: "Awards night, date TBC" });
    const grid = buildMonthGrid("2026-10", [undated]);

    expect(grid.weeks.flat().every((day) => day.events.length === 0)).toBe(true);
    expect(grid.undated.map((e) => e.name)).toEqual(["Awards night, date TBC"]);
  });

  it("marks today when it is in view", () => {
    const grid = buildMonthGrid("2026-10", [], "2026-10-14");
    expect(
      grid.weeks
        .flat()
        .filter((day) => day.isToday)
        .map((day) => day.day),
    ).toEqual(["2026-10-14"]);
  });
});

// ---------------------------------------------------------------------------
// Matrix row 12 — where each view opens
// ---------------------------------------------------------------------------

describe("defaultMonth", () => {
  it("opens on today's month when the season has events in it", () => {
    const events = [event({ scheduledOn: "2026-10-14" })];
    expect(defaultMonth(events, "2026-10-01")).toBe("2026-10");
  });

  it("opens on the next event's month when today's is empty", () => {
    // 14 August 2026: the season is configured but has not started.
    const events = [event({ scheduledOn: "2026-09-27" }), event({ scheduledOn: "2027-01-24" })];
    expect(defaultMonth(events, "2026-08-14")).toBe("2026-09");
  });

  it("falls back to the most recent event once the season is over", () => {
    const events = [event({ scheduledOn: "2026-09-27" }), event({ scheduledOn: "2027-06-19" })];
    expect(defaultMonth(events, "2027-08-14")).toBe("2027-06");
  });

  it("falls back to today when there are no events at all", () => {
    expect(defaultMonth([], "2026-08-14")).toBe("2026-08");
  });
});
