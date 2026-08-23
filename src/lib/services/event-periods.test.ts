/**
 * How the list breaks the season up — LAN-153, `REQ-list-shape`.
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
  PERIOD_LABELS,
  SOON_DAYS,
  type EventPeriod,
} from "./event-periods";

/** Monday, 19 October 2026 — the clock the approved mockup is drawn at. */
const TODAY = "2026-10-19";

/** The end of Michaelmas 2026-27's 8th week, from the club's own MT26 card. */
const TERM_ENDS = "2026-12-05";

interface Fixture {
  id: string;
  scheduledOn: string | null;
}

function on(id: string, scheduledOn: string | null): Fixture {
  return { id, scheduledOn };
}

const EVENTS: Fixture[] = [
  on("last-week", "2026-10-14"),
  on("yesterday", "2026-10-18"),
  on("today", TODAY),
  on("in-three-days", "2026-10-22"),
  on("next-week", "2026-10-27"),
  // Day fourteen is the last day of "this week and next"; day fifteen is not.
  on("day-fourteen", "2026-11-01"),
  on("day-fifteen", "2026-11-02"),
  on("late-november", "2026-11-28"),
  on("in-hilary", "2027-01-20"),
  on("undated", null),
];

function bucket(period: EventPeriod, events: readonly Fixture[] = EVENTS) {
  return bucketEventsByPeriod(events, { today: TODAY, period, segmentEndsOn: TERM_ENDS });
}

function keys(period: EventPeriod, events: readonly Fixture[] = EVENTS) {
  return bucket(period, events).map((entry) => entry.key);
}

function idsIn(period: EventPeriod, key: string, events: readonly Fixture[] = EVENTS) {
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

describe("bucketEventsByPeriod — it opens on upcoming", () => {
  it("leaves the past out of every period but All events", () => {
    // D84 and Brian, 20 August 2026. Past events stay reachable, and are never
    // the default view.
    for (const period of ["week", "month", "term", "upcoming"] as const) {
      const ids = bucket(period).flatMap((entry) => entry.events.map((event) => event.id));
      expect(ids, period).not.toContain("last-week");
      expect(ids, period).not.toContain("yesterday");
    }
    expect(idsIn("all", "already_happened")).toEqual(["last-week", "yesterday"]);
  });

  it("counts today as upcoming, not as history", () => {
    expect(idsIn("week", "soon")).toContain("today");
  });
});

describe("bucketEventsByPeriod — the buckets partition", () => {
  it("never puts one event in two tables", () => {
    for (const period of EVENT_PERIODS) {
      const ids = bucket(period).flatMap((entry) => entry.events.map((event) => event.id));
      expect(new Set(ids).size, period).toBe(ids.length);
    }
  });

  it("keeps every event in view in exactly one bucket on All events", () => {
    const ids = bucket("all").flatMap((entry) => entry.events.map((event) => event.id));
    expect(new Set(ids)).toEqual(new Set(EVENTS.map((event) => event.id)));
  });

  it("puts the next fourteen days in the first table and the fifteenth in the next", () => {
    expect(SOON_DAYS).toBe(14);
    expect(idsIn("month", "soon")).toEqual(["today", "in-three-days", "next-week", "day-fourteen"]);
    expect(idsIn("month", "later_this_month")).toEqual([]);
    // 2 November is past the end of October, so it is the term's, not the month's.
    expect(idsIn("term", "later_this_term")).toEqual(["day-fifteen", "late-november"]);
  });

  it("uses the term as the longest bucket, not a calendar quarter", () => {
    // Brian, 20 August 2026: "Use term." Hilary is past the end of Michaelmas,
    // so This term does not reach it and All upcoming does.
    expect(idsIn("term", "later_this_season")).toEqual([]);
    expect(idsIn("upcoming", "later_this_season")).toEqual(["in-hilary"]);
  });

  it("opens exactly the tables the period names, in order", () => {
    expect(keys("week")).toEqual(["soon", "undated"]);
    expect(keys("month")).toEqual(["soon", "undated"]);
    expect(keys("term")).toEqual(["soon", "later_this_term", "undated"]);
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

  it("lists an undated event on every period, because it is in none of them", () => {
    const undated = [on("undated", null)];
    for (const period of EVENT_PERIODS) {
      expect(keys(period, undated), period).toEqual(["undated"]);
    }
  });

  it("falls back to the season bucket when today is in no configured segment", () => {
    // Deep in a vacation with no term configured for it: This term has nothing
    // to mean, and the events do not vanish.
    const buckets = bucketEventsByPeriod(EVENTS, {
      today: TODAY,
      period: "upcoming",
      segmentEndsOn: null,
    });
    const later = buckets.find((entry) => entry.key === "later_this_season");
    expect(later?.events.map((event) => event.id)).toEqual([
      "day-fifteen",
      "late-november",
      "in-hilary",
    ]);
  });

  it("preserves the order it was handed, so one sort control governs the page", () => {
    // `docs/ux/standards.md` rule 7. "Already happened" reads in the same
    // direction as everything above it rather than quietly reversing itself.
    const descending = [...EVENTS].reverse();
    expect(idsIn("all", "already_happened", descending)).toEqual(["yesterday", "last-week"]);
  });

  it("counts what is actually in view", () => {
    expect(bucketedCount(bucket("all"))).toBe(EVENTS.length);
    expect(bucketedCount(bucket("week"))).toBe(idsIn("week", "soon").length + 1);
    expect(bucketedCount([])).toBe(0);
  });
});
