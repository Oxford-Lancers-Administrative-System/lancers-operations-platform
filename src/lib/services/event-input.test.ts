// @vitest-environment node
/**
 * The Oxford term coordinate, derived from a date — LAN-76, Brian's
 * clarification of 12 August 2026.
 *
 * No database. `deriveTermCoordinate` is pure and takes the calendar as an
 * argument precisely so the rule can be checked against terms built by hand,
 * including ones the seeded dataset does not contain: a leap day, a gap between
 * terms, a date in the wrong year, the first and last day of a term.
 *
 * The rule under test, which is not obvious from the column names:
 * `terms.starts_on` is the first day of `first_week` — **not** of week 1 —
 * Michaelmas beginning in week −1 and the other two in 0th week, with seven-day
 * weeks from there. Every expectation below is worked out from that and checked
 * against the real Oxford calendar in the seed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { derivedEventState, deriveTermCoordinate, type TermWindow } from "./event-input";

/** The 2026-27 Oxford year, exactly as `scripts/seed-local.mjs` creates it. */
const MICHAELMAS: TermWindow = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "michaelmas",
  academicYear: "2026-27",
  startsOn: "2026-09-27",
  endsOn: "2026-12-05",
  firstWeek: -1,
  lastWeek: 8,
};

const HILARY: TermWindow = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "hilary",
  academicYear: "2026-27",
  startsOn: "2027-01-10",
  endsOn: "2027-03-13",
  firstWeek: 0,
  lastWeek: 8,
};

const TRINITY: TermWindow = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "trinity",
  academicYear: "2026-27",
  startsOn: "2027-04-18",
  endsOn: "2027-06-19",
  firstWeek: 0,
  lastWeek: 8,
};

const YEAR = [TRINITY, HILARY, MICHAELMAS];

describe("a date inside a term resolves to that term and its Oxford week", () => {
  it.each([
    // The first day of Michaelmas is the first day of week −1, not of week 1.
    ["2026-09-27", -1],
    ["2026-10-03", -1],
    // …then 0th week, then week 1.
    ["2026-10-04", 0],
    ["2026-10-10", 0],
    ["2026-10-11", 1],
    // The Wednesday practice this issue is written around.
    ["2026-10-14", 1],
    ["2026-10-18", 2],
    // The last day of term is in week 8, which is what `last_week` says.
    ["2026-12-05", 8],
  ])("puts %s in Michaelmas week %i", (date, week) => {
    expect(deriveTermCoordinate(date, YEAR)).toEqual({
      termId: MICHAELMAS.id,
      weekNumber: week,
    });
  });

  it.each([
    ["2027-01-10", 0],
    ["2027-01-17", 1],
    ["2027-03-13", 8],
  ])("puts %s in Hilary week %i, which starts at 0th", (date, week) => {
    expect(deriveTermCoordinate(date, YEAR)).toEqual({ termId: HILARY.id, weekNumber: week });
  });

  it("puts a Trinity date in Trinity", () => {
    expect(deriveTermCoordinate("2027-04-18", YEAR)).toEqual({
      termId: TRINITY.id,
      weekNumber: 0,
    });
  });

  it("never returns a week outside the −1..8 the schema permits", () => {
    // Every day of every term in the year, which is the whole domain that can
    // produce a week at all.
    for (const term of YEAR) {
      for (let day = new Date(`${term.startsOn}T00:00:00Z`); ;) {
        const iso = day.toISOString().slice(0, 10);
        if (iso > term.endsOn) break;
        const { weekNumber } = deriveTermCoordinate(iso, YEAR);
        expect(weekNumber, `${iso} produced week ${weekNumber}`).not.toBeNull();
        expect(weekNumber!).toBeGreaterThanOrEqual(-1);
        expect(weekNumber!).toBeLessThanOrEqual(8);
        day = new Date(day.getTime() + 86_400_000);
      }
    }
  });
});

describe("a date outside every term has no coordinate, and that is legitimate", () => {
  it.each([
    ["2026-09-26", "the day before Michaelmas"],
    ["2026-12-06", "the day after Michaelmas"],
    ["2026-12-25", "the vacation"],
    ["2027-07-15", "the summer, when a camp might happen"],
    ["2025-10-14", "the same date a year earlier"],
  ])("returns nothing for %s (%s)", (date) => {
    expect(deriveTermCoordinate(date, YEAR)).toEqual({ termId: null, weekNumber: null });
  });

  it("returns nothing when there is no date yet — a draft may be incomplete", () => {
    expect(deriveTermCoordinate(null, YEAR)).toEqual({ termId: null, weekNumber: null });
  });

  it("returns nothing when the club has no terms recorded at all", () => {
    expect(deriveTermCoordinate("2026-10-14", [])).toEqual({ termId: null, weekNumber: null });
  });
});

describe("it refuses to guess from input it cannot read", () => {
  it.each(["", "14/10/2026", "2026-10", "not a date", "2026-13-01", "2026-02-30"])(
    "returns nothing for %s",
    (date) => {
      expect(deriveTermCoordinate(date, YEAR)).toEqual({ termId: null, weekNumber: null });
    },
  );

  it("skips a term whose own dates and week bounds disagree", () => {
    // A term recorded as ten weeks long but ending at week 8. The arithmetic
    // would produce week 9, which `events_week_number_valid` refuses — and an
    // event that cannot be saved is a worse answer than one outside term.
    const broken: TermWindow = { ...MICHAELMAS, endsOn: "2026-12-26" };

    expect(deriveTermCoordinate("2026-12-20", [broken])).toEqual({
      termId: null,
      weekNumber: null,
    });
  });

  it("skips a term with an unreadable boundary rather than trusting it", () => {
    const broken: TermWindow = { ...MICHAELMAS, startsOn: "not-a-date" };

    expect(deriveTermCoordinate("2026-10-14", [broken])).toEqual({
      termId: null,
      weekNumber: null,
    });
  });
});

describe("the derivation does not depend on the machine's time zone", () => {
  it("puts a date in the same week whatever the local offset", () => {
    // The dates are calendar dates with no zone. Computing them through a local
    // `Date` would shift a Sunday into Saturday west of Greenwich and move the
    // event a whole Oxford week.
    const original = process.env.TZ;
    try {
      for (const zone of ["UTC", "Pacific/Kiritimati", "Pacific/Midway", "Europe/London"]) {
        process.env.TZ = zone;
        expect(deriveTermCoordinate("2026-10-11", YEAR), `week boundary in ${zone}`).toEqual({
          termId: MICHAELMAS.id,
          weekNumber: 1,
        });
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

/**
 * `derivedEventState`, including the branch nothing reached — finding A-3.
 *
 * Independent review deleted its cancellation branch and watched 3967 unit
 * tests and all 50 events database tests stay green. It is unreachable today
 * because both callers ask about an `approved` event first, but it is an
 * exported derivation of a club rule, and the public-calendar and subscription
 * feed packages will call it from surfaces that have no reason to repeat that
 * guard. A branch nothing covers is a branch the next caller inherits untested.
 */
describe("what an event looks like now, as distinct from what is stored", () => {
  const TODAY = "2026-10-14";

  it("calls a cancellation cancelled, whatever its date says", () => {
    // The branch review deleted. Both sides of today, because "cancelled" is
    // about the decision and not about the clock: an evening called off last
    // month did not occur, and one called off for next month is not upcoming.
    for (const scheduledOn of ["2026-09-30", TODAY, "2026-12-25", null]) {
      expect(
        derivedEventState({ status: "cancelled", scheduledOn }, TODAY),
        `cancelled on ${scheduledOn}`,
      ).toBe("cancelled");
    }
  });

  it("calls a past approved event occurred, and a future one upcoming", () => {
    expect(derivedEventState({ status: "approved", scheduledOn: "2026-10-13" }, TODAY)).toBe(
      "occurred",
    );
    // Not on the day itself: the rule is `<`, and an evening is not over at
    // breakfast.
    expect(derivedEventState({ status: "approved", scheduledOn: TODAY }, TODAY)).toBe("upcoming");
    expect(derivedEventState({ status: "approved", scheduledOn: "2026-10-15" }, TODAY)).toBe(
      "upcoming",
    );
  });

  it("never calls an undated event occurred", () => {
    expect(derivedEventState({ status: "draft", scheduledOn: null }, TODAY)).toBe("upcoming");
    expect(derivedEventState({ status: "approved", scheduledOn: null }, TODAY)).toBe("upcoming");
  });

  it("answers about the date alone once the status is not cancelled", () => {
    // Deliberately pinned rather than left to be discovered: a past *draft*
    // reads `occurred` from this function, because the function answers "what
    // does the clock say" for everything that was not called off. It is the
    // callers that add "and it was approved" — `page.tsx` shows the derived
    // word only for an approved event, and the Occurred filter's SQL carries
    // `e.status = 'approved'` in the same predicate. Anything reading this
    // function for a screen has to do the same.
    expect(derivedEventState({ status: "draft", scheduledOn: "2020-01-01" }, TODAY)).toBe(
      "occurred",
    );
  });
});
