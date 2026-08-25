/**
 * How the list breaks the season up — LAN-153, `REQ-list-shape` — and, since
 * C7, how each period's own calendar boundary works — mission question Q-18.
 *
 * Today is an argument here, which is the whole reason this module is pure: the
 * screens read the club's clock themselves and cannot be asked "what would you
 * show on 21 December?", so the bucketing is proved where the question can be
 * put.
 */
import { describe, expect, it } from "vitest";

import {
  bucketedCount,
  bucketEventsByPeriod,
  DEFAULT_EVENT_PERIOD,
  EVENT_PERIODS,
  parseEventPeriod,
  periodBounds,
  PERIOD_LABELS,
  SOON_DAYS,
  type EventPeriod,
} from "./event-periods";

/**
 * Wednesday, 21 October 2026 — deliberately mid-week, mid-month and mid-term,
 * so every period's fixture below has genuine "before", "inside" and "after"
 * days either side of it. A boundary test anchored on a Monday or the 1st
 * would never catch the regression C7 exists to fix: the bug this file is
 * named for survives any test where today happens to sit at the edge of its
 * own period.
 */
const TODAY = "2026-10-21";

/** Michaelmas 2026-27, from the club's own MT26 card: −1st week to 8th week. */
const TERM_STARTS = "2026-09-27";
const TERM_ENDS = "2026-12-05";

interface Fixture {
  id: string;
  scheduledOn: string | null;
}

function on(id: string, scheduledOn: string | null): Fixture {
  return { id, scheduledOn };
}

/**
 * One date either side of every boundary this file cares about, plus today
 * itself. Not every test uses every fixture — `idsIn` and `keys` below read
 * from this one list so a period's assertions are about which of these
 * *specific, dated* events it includes, not about counts that could pass by
 * accident.
 */
const EVENTS: Fixture[] = [
  on("before-term", "2026-09-20"), // before Michaelmas starts
  on("term-start", TERM_STARTS), // Michaelmas's own first day (boundary, inclusive)
  on("before-month", "2026-09-30"), // in-term, before October
  on("month-start", "2026-10-01"), // October's own first day (boundary, inclusive)
  on("before-week", "2026-10-18"), // Sunday of the *previous* calendar week
  on("week-start", "2026-10-19"), // Monday of this week (boundary, inclusive) — past
  on("yesterday", "2026-10-20"),
  on("today", TODAY),
  on("tomorrow", "2026-10-22"),
  on("week-end", "2026-10-25"), // Sunday of this week (boundary, inclusive) — future
  on("after-week", "2026-10-26"), // Monday of next week — still in October
  on("month-end", "2026-10-31"), // October's own last day (boundary, inclusive)
  on("after-month", "2026-11-15"), // past October, still in Michaelmas
  on("term-end", TERM_ENDS), // Michaelmas's own last day (boundary, inclusive)
  on("after-term", "2026-12-06"), // past Michaelmas — still upcoming
  on("far-future", "2027-03-01"),
  on("undated", null),
];

function bucket(period: EventPeriod, events: readonly Fixture[] = EVENTS) {
  return bucketEventsByPeriod(events, {
    today: TODAY,
    period,
    segmentStartsOn: TERM_STARTS,
    segmentEndsOn: TERM_ENDS,
  });
}

function keys(period: EventPeriod, events: readonly Fixture[] = EVENTS) {
  return bucket(period, events).map((entry) => entry.key);
}

/** Every id in view for a period, across every table, in render order. */
function idsIn(period: EventPeriod, events: readonly Fixture[] = EVENTS): string[] {
  return bucket(period, events).flatMap((entry) => entry.events.map((event) => event.id));
}

function idsInTable(period: EventPeriod, key: string, events: readonly Fixture[] = EVENTS) {
  return (bucket(period, events).find((entry) => entry.key === key)?.events ?? []).map(
    (event) => event.id,
  );
}

describe("parseEventPeriod", () => {
  it("opens on This month, which is what the approved mockup draws", () => {
    expect(DEFAULT_EVENT_PERIOD).toBe("month");
    expect(parseEventPeriod(undefined)).toBe("month");
    expect(parseEventPeriod(null)).toBe("month");
    expect(parseEventPeriod("")).toBe("month");
  });

  it("takes any period the control offers", () => {
    for (const period of EVENT_PERIODS) {
      expect(parseEventPeriod(period)).toBe(period);
    }
  });

  it("falls back rather than erroring on a hand-typed value", () => {
    // The parameter arrives from a URL anybody can edit.
    expect(parseEventPeriod("banana")).toBe(DEFAULT_EVENT_PERIOD);
    expect(parseEventPeriod("ALL")).toBe(DEFAULT_EVENT_PERIOD);
  });

  it("names every period the club would recognise", () => {
    expect(EVENT_PERIODS.map((period) => PERIOD_LABELS[period])).toEqual([
      "This week",
      "This month",
      "This term",
      "All upcoming",
      "All events",
    ]);
  });
});

// ---------------------------------------------------------------------------
// C7 / Q-18 — periodBounds, the pure boundary each period names
// ---------------------------------------------------------------------------

describe("periodBounds", () => {
  const segment = { startsOn: TERM_STARTS, endsOn: TERM_ENDS };

  it("This week — Monday to Sunday of the week containing today", () => {
    expect(periodBounds("week", TODAY, segment)).toEqual({
      startsOn: "2026-10-19",
      endsOn: "2026-10-25",
    });
  });

  it("finds the same Monday whichever day of the week today is", () => {
    // Monday itself, and Sunday itself — both ends of the week are `today`
    // for this purpose too, not just the mid-week case the rest of the file
    // uses.
    expect(periodBounds("week", "2026-10-19", segment)).toEqual({
      startsOn: "2026-10-19",
      endsOn: "2026-10-25",
    });
    expect(periodBounds("week", "2026-10-25", segment)).toEqual({
      startsOn: "2026-10-19",
      endsOn: "2026-10-25",
    });
  });

  it("This month — the 1st to the last day of the current calendar month", () => {
    expect(periodBounds("month", TODAY, segment)).toEqual({
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    });
    // A 28-day February is the sharpest test of "the last day", not a fixed 30/31.
    expect(periodBounds("month", "2026-02-10", segment)).toEqual({
      startsOn: "2026-02-01",
      endsOn: "2026-02-28",
    });
  });

  it("This term — the segment's own first to last day, not today", () => {
    expect(periodBounds("term", TODAY, segment)).toEqual({
      startsOn: TERM_STARTS,
      endsOn: TERM_ENDS,
    });
  });

  it("This term matches nothing when today is in no configured segment", () => {
    // Deep in an unconfigured vacation: "This term" has nothing to mean, and
    // must exclude every date rather than falling back to unbounded.
    const bounds = periodBounds("term", TODAY, { startsOn: null, endsOn: null });
    expect(bounds.startsOn).not.toBeNull();
    expect(bounds.endsOn).not.toBeNull();
    // A date on either side of today satisfies neither `>= startsOn` nor
    // `<= endsOn` at once, which is what "matches nothing" means here.
    expect(bounds.startsOn! > "2026-01-01" || bounds.endsOn! < "2026-12-31").toBe(true);
  });

  it("All upcoming — today forward, no end", () => {
    expect(periodBounds("upcoming", TODAY, segment)).toEqual({ startsOn: TODAY, endsOn: null });
  });

  it("All events — no boundary at all", () => {
    expect(periodBounds("all", TODAY, segment)).toEqual({ startsOn: null, endsOn: null });
  });
});

// ---------------------------------------------------------------------------
// C7 / Q-18 — each period shows its own calendar boundary, past included
// ---------------------------------------------------------------------------

describe("bucketEventsByPeriod — each period is its own fixed calendar stretch (C7)", () => {
  it("This week: Monday to Sunday of the current week, including the days already past", () => {
    expect(idsIn("week")).toEqual([
      "today",
      "tomorrow",
      "week-end",
      "week-start",
      "yesterday",
      "undated",
    ]);
    // Named the regression directly: on the 24th Brian saw events "through
    // September 6th" under a fourteen-day rolling window. Neither neighbouring
    // week's Monday belongs here.
    expect(idsIn("week")).not.toContain("before-week");
    expect(idsIn("week")).not.toContain("after-week");
  });

  it("This month: the 1st to the 31st of October, including the days already past", () => {
    const ids = idsIn("month");
    expect(ids).toEqual(
      expect.arrayContaining([
        "month-start",
        "before-week",
        "week-start",
        "yesterday",
        "today",
        "tomorrow",
        "week-end",
        "after-week",
        "month-end",
      ]),
    );
    // The exact complaint: on the 24th, Brian expected "everything that
    // happens in August" — here, everything in October, the 1st included.
    expect(ids).toContain("month-start");
    expect(ids).not.toContain("before-month");
    expect(ids).not.toContain("after-month");
  });

  it("This term: Michaelmas's own first to last day, including the days already past", () => {
    const ids = idsIn("term");
    expect(ids).toEqual(
      expect.arrayContaining([
        "term-start",
        "before-month",
        "month-start",
        "after-month",
        "term-end",
      ]),
    );
    expect(ids).not.toContain("before-term");
    expect(ids).not.toContain("after-term");
  });

  it("All upcoming: today forward, and the past stays excluded", () => {
    const ids = idsIn("upcoming");
    expect(ids).toContain("today");
    expect(ids).toContain("far-future");
    for (const past of ["before-term", "term-start", "before-month", "month-start", "yesterday"]) {
      expect(ids, past).not.toContain(past);
    }
  });

  it("All events: every dated event, before, inside and after every other period's boundary", () => {
    const ids = idsIn("all");
    for (const event of EVENTS) expect(ids).toContain(event.id);
  });

  it("lists an undated event on every period, because it is in none of them", () => {
    for (const period of EVENT_PERIODS) {
      expect(idsIn(period), period).toContain("undated");
    }
  });
});

describe("bucketEventsByPeriod — the already-past part of a period is grouped, not dropped", () => {
  it("groups This week's past days as Already happened, and its future days as soon", () => {
    expect(idsInTable("week", "already_happened")).toEqual(["week-start", "yesterday"]);
    expect(idsInTable("week", "soon")).toEqual(["today", "tomorrow", "week-end"]);
  });

  it("groups This month's past days as Already happened", () => {
    const already = idsInTable("month", "already_happened");
    expect(already).toEqual(["month-start", "before-week", "week-start", "yesterday"]);
  });

  it("groups This term's past days as Already happened", () => {
    const already = idsInTable("term", "already_happened");
    expect(already).toEqual([
      "term-start",
      "before-month",
      "month-start",
      "before-week",
      "week-start",
      "yesterday",
    ]);
  });

  it("opens no Already happened table on All upcoming — its own boundary starts at today", () => {
    expect(keys("upcoming")).not.toContain("already_happened");
  });

  it("counts today as upcoming, not as history, on every period that reaches it", () => {
    for (const period of ["week", "month", "term", "upcoming"] as const) {
      expect(idsInTable(period, "soon"), period).toContain("today");
    }
  });
});

describe("bucketEventsByPeriod — the buckets partition", () => {
  it("never puts one event in two tables", () => {
    for (const period of EVENT_PERIODS) {
      const ids = idsIn(period);
      expect(new Set(ids).size, period).toBe(ids.length);
    }
  });

  it("keeps every event in view in exactly one bucket on All events", () => {
    expect(new Set(idsIn("all"))).toEqual(new Set(EVENTS.map((event) => event.id)));
  });

  it("puts the next fourteen days in the first table and the fifteenth in the next", () => {
    expect(SOON_DAYS).toBe(14);
    const fourteenDaysOut = on("day-fourteen", "2026-11-03"); // today + 13
    const fifteenDaysOut = on("day-fifteen", "2026-11-04"); // today + 14
    const withExtra = [...EVENTS, fourteenDaysOut, fifteenDaysOut];
    expect(idsInTable("term", "soon", withExtra)).toContain("day-fourteen");
    expect(idsInTable("term", "soon", withExtra)).not.toContain("day-fifteen");
    expect(idsInTable("term", "later_this_term", withExtra)).toContain("day-fifteen");
  });

  it("uses the term as the longest bucket, not a calendar quarter", () => {
    // Brian, 20 August 2026: "Use term." Hilary is past the end of Michaelmas,
    // so This term does not reach it and All upcoming does.
    expect(idsInTable("term", "later_this_season")).toEqual([]);
    expect(idsInTable("upcoming", "later_this_season")).toContain("far-future");
  });

  it("opens exactly the tables the period names, in order", () => {
    // C7 opened Already happened on This week, This month and This term too
    // — each now shows the part of itself that has already passed.
    expect(keys("week")).toEqual(["soon", "already_happened", "undated"]);
    expect(keys("month")).toEqual(["soon", "already_happened", "undated"]);
    expect(keys("term")).toEqual(["soon", "later_this_term", "already_happened", "undated"]);
    expect(keys("upcoming")).toEqual(["soon", "later_this_term", "later_this_season", "undated"]);
    expect(keys("all")).toEqual([
      "soon",
      "later_this_term",
      "later_this_season",
      "already_happened",
      "undated",
    ]);
  });
});

describe("bucketEventsByPeriod — the edges", () => {
  it("drops an empty table rather than rendering one", () => {
    // "Nothing this period" and "nothing all season" need different recovery,
    // and an empty table above a full one blurs them.
    const only = [on("today", TODAY)];
    expect(keys("all", only)).toEqual(["soon"]);
  });

  it("falls back to the season bucket when today is in no configured segment", () => {
    // Deep in a vacation with no term configured for it: This term has nothing
    // to mean, and the events do not vanish from All upcoming.
    const buckets = bucketEventsByPeriod(EVENTS, {
      today: TODAY,
      period: "upcoming",
      segmentStartsOn: null,
      segmentEndsOn: null,
    });
    const later = buckets.find((entry) => entry.key === "later_this_season");
    expect(later?.events.map((event) => event.id)).toEqual([
      "after-month",
      "term-end",
      "after-term",
      "far-future",
    ]);
  });

  it("This term also shows nothing when today is in no configured segment", () => {
    const buckets = bucketEventsByPeriod(EVENTS, {
      today: TODAY,
      period: "term",
      segmentStartsOn: null,
      segmentEndsOn: null,
    });
    expect(bucketedCount(buckets)).toBe(1); // only "undated"
    expect(buckets.map((entry) => entry.key)).toEqual(["undated"]);
  });

  it("preserves the order it was handed, so one sort control governs the page", () => {
    // `docs/ux/standards.md` rule 7. "Already happened" reads in the same
    // direction as everything above it rather than quietly reversing itself.
    const descending = [...EVENTS].reverse();
    expect(idsInTable("month", "already_happened", descending)).toEqual([
      "yesterday",
      "week-start",
      "before-week",
      "month-start",
    ]);
  });

  it("counts what is actually in view", () => {
    expect(bucketedCount(bucket("all"))).toBe(EVENTS.length);
    expect(bucketedCount(bucket("week"))).toBe(idsIn("week").length);
    expect(bucketedCount([])).toBe(0);
  });
});
