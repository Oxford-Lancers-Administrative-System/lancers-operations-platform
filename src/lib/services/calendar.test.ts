/**
 * The two calendar projections — LAN-114, matrix rows 1 to 12.
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
  buildTermCard,
  defaultMonth,
  defaultTerm,
  findTerm,
  groupTermsByAcademicYear,
  MAX_CONTEXT_WEEKS,
  monthOf,
  nearestTerm,
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

const MICHAELMAS_2025: TermWindow = Object.freeze({
  id: "term-mt-2025",
  name: "michaelmas",
  academicYear: "2025-26",
  startsOn: "2025-09-28",
  endsOn: "2025-12-06",
  firstWeek: -1,
  lastWeek: 8,
});

const TERMS: readonly TermWindow[] = Object.freeze([
  TRINITY_2027,
  HILARY_2027,
  MICHAELMAS_2026,
  MICHAELMAS_2025,
]);

let nextId = 0;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    name: `Event ${nextId}`,
    eventType: "practice",
    status: "draft",
    scheduledOn: null,
    startsAt: null,
    endsAt: null,
    venue: null,
    ...overrides,
  };
}

/** Every event on the card, in reading order, so a cell cannot hide one. */
function placedIds(card: ReturnType<typeof buildTermCard>): string[] {
  return card.weeks.flatMap((week) => week.days.flatMap((day) => day.events.map((e) => e.id)));
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

describe("nearestTerm", () => {
  it("answers with the term a date is inside", () => {
    expect(nearestTerm("2026-10-14", TERMS)?.id).toBe(MICHAELMAS_2026.id);
    expect(nearestTerm("2027-01-24", TERMS)?.id).toBe(HILARY_2027.id);
  });

  it("splits the Christmas vacation between the terms either side of it", () => {
    // Michaelmas ends 5 Dec 2026, Hilary starts 10 Jan 2027 — 36 days apart.
    expect(nearestTerm("2026-12-12", TERMS)?.id).toBe(MICHAELMAS_2026.id);
    expect(nearestTerm("2027-01-05", TERMS)?.id).toBe(HILARY_2027.id);
  });

  it("gives an exact tie to the earlier term", () => {
    // 23 December 2026 is eighteen days after Michaelmas and eighteen before
    // Hilary. "After Michaelmas" reads better than "long before Hilary".
    expect(nearestTerm("2026-12-23", TERMS)?.id).toBe(MICHAELMAS_2026.id);
  });

  it("has no answer beyond six weeks from every term", () => {
    expect(nearestTerm("2027-08-20", TERMS)).toBeNull();
    expect(nearestTerm("2027-07-31", TERMS)?.id).toBe(TRINITY_2027.id);
  });
});

describe("buildTermCard", () => {
  it("lays out the configured week rows and seven Sunday-to-Saturday columns", () => {
    const card = buildTermCard(MICHAELMAS_2026, TERMS, []);

    expect(card.weeks.map((week) => week.week)).toEqual([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(card.weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(card.weeks[0].days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(card.weeks[0].days.map((day) => day.day)).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
  });

  it("gives a term configured from 0th week no −1st row", () => {
    const card = buildTermCard(HILARY_2027, TERMS, []);
    expect(card.weeks.map((week) => week.week)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(card.weeks[0].startsOn).toBe("2027-01-10");
  });

  it("places an event in the cell for its actual day", () => {
    // Wednesday of 1st week, Michaelmas — the club's regular Iffley practice.
    const practice = event({ scheduledOn: "2026-10-14", startsAt: "20:00", name: "Team Practice" });
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [practice]);

    const week1 = card.weeks.find((week) => week.week === 1);
    expect(week1?.startsOn).toBe("2026-10-11");
    expect(week1?.days[3].day).toBe("2026-10-14");
    expect(week1?.days[3].events.map((e) => e.name)).toEqual(["Team Practice"]);
    expect(card.placedCount).toBe(1);
    expect(card.elsewhere.total).toBe(0);
  });

  it("places the first and last days of the term at the corners of the card", () => {
    const opening = event({ scheduledOn: "2026-09-27", name: "Opening" });
    const closing = event({ scheduledOn: "2026-12-05", name: "Closing" });
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [opening, closing]);

    expect(card.weeks[0].days[0].events.map((e) => e.name)).toEqual(["Opening"]);
    const last = card.weeks[card.weeks.length - 1];
    expect(last.week).toBe(8);
    expect(last.days[6].day).toBe("2026-12-05");
    expect(last.days[6].events.map((e) => e.name)).toEqual(["Closing"]);
    expect(card.elsewhere.total).toBe(0);
  });

  it("reaches past the term for an event just outside it, in a dated context row", () => {
    // Brian's 14 August 2026 review: an event a few days either side of term
    // belongs on the card, not in a list underneath it.
    const after = event({ scheduledOn: "2026-12-06", name: "Day after Michaelmas" });
    const before = event({ scheduledOn: "2026-09-26", name: "Day before Michaelmas" });
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [after, before]);

    expect(card.weeks).toHaveLength(12);
    expect(card.placedCount).toBe(2);
    expect(card.elsewhere.total).toBe(0);

    const first = card.weeks[0];
    expect(first.week).toBeNull();
    expect(first.outside).toBe("before");
    expect(first.startsOn).toBe("2026-09-20");
    expect(first.endsOn).toBe("2026-09-26");
    expect(first.days[6].events.map((e) => e.name)).toEqual(["Day before Michaelmas"]);

    const last = card.weeks[card.weeks.length - 1];
    expect(last.week).toBeNull();
    expect(last.outside).toBe("after");
    expect(last.startsOn).toBe("2026-12-06");
    expect(last.days[0].events.map((e) => e.name)).toEqual(["Day after Michaelmas"]);
  });

  it("adds no context row when there is nothing outside the term to show", () => {
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [event({ scheduledOn: "2026-10-14" })]);
    expect(card.weeks).toHaveLength(10);
    expect(card.weeks.every((week) => week.week !== null)).toBe(true);
  });

  it("leaves another term's events to that term's own card", () => {
    const hilaryFixture = event({ scheduledOn: "2027-01-24", name: "Lancers vs Elmswell" });
    const undecided = event({ scheduledOn: null, name: "Awards night, date TBC" });

    const michaelmas = buildTermCard(MICHAELMAS_2026, TERMS, [hilaryFixture, undecided]);
    expect(placedIds(michaelmas)).toEqual([]);
    expect(michaelmas.elsewhere.undated.map((e) => e.name)).toEqual(["Awards night, date TBC"]);
    expect(michaelmas.elsewhere.farFromAnyTerm).toEqual([]);

    const hilary = buildTermCard(HILARY_2027, TERMS, [hilaryFixture, undecided]);
    expect(placedIds(hilary)).toEqual([hilaryFixture.id]);
  });

  it("gives a vacation event to the nearer of the two terms around it", () => {
    // Michaelmas ends 5 Dec 2026; Hilary starts 10 Jan 2027. A mid-December
    // social is Michaelmas's; a January one just before term is Hilary's.
    const december = event({ scheduledOn: "2026-12-12", name: "Christmas dinner" });
    const january = event({ scheduledOn: "2027-01-05", name: "New year session" });

    const michaelmas = buildTermCard(MICHAELMAS_2026, TERMS, [december, january]);
    expect(placedIds(michaelmas)).toEqual([december.id]);

    const hilary = buildTermCard(HILARY_2027, TERMS, [december, january]);
    expect(placedIds(hilary)).toEqual([january.id]);
  });

  it("refuses to stretch a card to an event more than six weeks from any term", () => {
    const summerCamp = event({ scheduledOn: "2027-08-20", name: "Summer camp" });
    const card = buildTermCard(TRINITY_2027, TERMS, [summerCamp]);

    expect(placedIds(card)).toEqual([]);
    expect(card.weeks).toHaveLength(9);
    expect(card.elsewhere.farFromAnyTerm.map((e) => e.name)).toEqual(["Summer camp"]);
    expect(card.elsewhere.total).toBe(1);
  });

  it("caps how far a card will stretch", () => {
    // Six weeks past Trinity's last Saturday, 19 June 2027, is 31 July.
    const reachable = event({ scheduledOn: "2027-07-28", name: "Reachable" });
    const card = buildTermCard(TRINITY_2027, TERMS, [reachable]);

    expect(placedIds(card)).toEqual([reachable.id]);
    expect(card.weeks).toHaveLength(9 + MAX_CONTEXT_WEEKS);
  });

  it("accounts for every event exactly once across the season's cards", () => {
    // The real invariant, now that a card reaches past its own term: every
    // event appears on exactly one term card, or is reported as having no
    // date, or as too far from any term. Never twice, and never nowhere.
    const events = [
      event({ scheduledOn: "2026-10-14", name: "Michaelmas week 1" }),
      event({ scheduledOn: "2026-09-27", name: "Michaelmas week −1" }),
      event({ scheduledOn: "2026-12-12", name: "Christmas dinner" }),
      event({ scheduledOn: "2027-01-24", name: "Hilary week 1" }),
      event({ scheduledOn: "2027-04-25", name: "Trinity week 1" }),
      event({ scheduledOn: "2027-08-20", name: "Far from any term" }),
      event({ scheduledOn: null, name: "No date yet" }),
    ];

    const cards = [MICHAELMAS_2026, HILARY_2027, TRINITY_2027].map((term) =>
      buildTermCard(term, TERMS, events),
    );

    const seen = cards.flatMap(placedIds);
    expect(new Set(seen).size).toBe(seen.length);

    // Each card reports the same leftovers, so counting one card's is enough.
    const leftOver = [
      ...cards[0].elsewhere.undated.map((e) => e.id),
      ...cards[0].elsewhere.farFromAnyTerm.map((e) => e.id),
    ];

    expect(new Set([...seen, ...leftOver]).size).toBe(events.length);
    expect(cards[0].elsewhere.farFromAnyTerm.map((e) => e.name)).toEqual(["Far from any term"]);
    expect(cards[0].elsewhere.undated.map((e) => e.name)).toEqual(["No date yet"]);
  });

  it("shows two events on one date separately, in start-time order", () => {
    // Invariant E4: two events on a date is legal, and the card may not
    // collapse them.
    const evening = event({ scheduledOn: "2026-10-14", startsAt: "20:00", name: "Practice" });
    const afternoon = event({ scheduledOn: "2026-10-14", startsAt: "18:00", name: "Chalk" });
    const untimed = event({ scheduledOn: "2026-10-14", startsAt: null, name: "Kit collection" });

    const card = buildTermCard(MICHAELMAS_2026, TERMS, [evening, untimed, afternoon]);
    const cell = card.weeks.find((week) => week.week === 1)?.days[3];

    expect(cell?.events.map((e) => e.name)).toEqual(["Chalk", "Practice", "Kit collection"]);
    expect(card.placedCount).toBe(3);
  });

  it("marks today, and only today", () => {
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [], "2026-10-14");
    const today = card.weeks.flatMap((week) => week.days).filter((day) => day.isToday);
    expect(today.map((day) => day.day)).toEqual(["2026-10-14"]);
  });

  it("marks nothing when today falls outside the term", () => {
    const card = buildTermCard(MICHAELMAS_2026, TERMS, [], "2026-08-14");
    expect(card.weeks.flatMap((week) => week.days).some((day) => day.isToday)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Matrix rows 9, 10 — the Gregorian month
// ---------------------------------------------------------------------------

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

describe("defaultTerm", () => {
  it("opens on the term containing today", () => {
    expect(defaultTerm(TERMS, "2026-10-14")?.id).toBe(MICHAELMAS_2026.id);
    expect(defaultTerm(TERMS, "2027-01-24")?.id).toBe(HILARY_2027.id);
  });

  it("opens on the next term when today is between terms", () => {
    // Mid-August: Trinity is finished, Michaelmas has not begun.
    expect(defaultTerm(TERMS, "2026-08-14")?.id).toBe(MICHAELMAS_2026.id);
    expect(defaultTerm(TERMS, "2026-12-20")?.id).toBe(HILARY_2027.id);
  });

  it("falls back to the most recent term when every term has finished", () => {
    expect(defaultTerm(TERMS, "2030-01-01")?.id).toBe(TRINITY_2027.id);
  });

  it("has no answer when no term is configured", () => {
    expect(defaultTerm([], "2026-10-14")).toBeNull();
  });
});

describe("groupTermsByAcademicYear", () => {
  it("groups by the configured academic year, newest first", () => {
    const years = groupTermsByAcademicYear(TERMS);
    expect(years.map((year) => year.academicYear)).toEqual(["2026-27", "2025-26"]);
  });

  it("orders each year Michaelmas, Hilary, Trinity — by date, not by name", () => {
    const years = groupTermsByAcademicYear(TERMS);
    expect(years[0].terms.map((term) => term.name)).toEqual(["michaelmas", "hilary", "trinity"]);
  });

  it("carries the configured year even where the source spreadsheet was mislabelled", () => {
    const years = groupTermsByAcademicYear([HILARY_2027, TRINITY_2027]);
    expect(years).toHaveLength(1);
    expect(years[0].academicYear).toBe("2026-27");
  });
});

describe("findTerm", () => {
  it("resolves a configured term and refuses anything else", () => {
    expect(findTerm(TERMS, HILARY_2027.id)?.name).toBe("hilary");
    expect(findTerm(TERMS, "not-a-term")).toBeNull();
    expect(findTerm(TERMS, null)).toBeNull();
  });
});
