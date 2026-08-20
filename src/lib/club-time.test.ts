/**
 * The club's clock — LAN-114.
 *
 * Added after independent review pointed out that `todayInClubZone` was
 * protected by nothing: its only import site is mocked in the calendar screen
 * tests, so the body could have become `new Date().toISOString().slice(0, 10)`
 * and the whole repository would have stayed green. That implementation answers
 * in UTC, which is yesterday between midnight and 01:00 during British Summer
 * Time — the calendar would highlight the wrong day, and could open on the
 * wrong month, for an hour every summer night.
 *
 * These take the instant as an argument, which is why the module accepts one.
 */
import { describe, expect, it } from "vitest";

import {
  addClubDays,
  CLUB_TIME_ZONE,
  formatClubDay,
  todayInClubZone,
  UNREADABLE_DATE,
} from "./club-time";

describe("CLUB_TIME_ZONE", () => {
  it("is the zone the club actually plays in", () => {
    expect(CLUB_TIME_ZONE).toBe("Europe/London");
  });
});

describe("todayInClubZone", () => {
  it("answers as YYYY-MM-DD", () => {
    expect(todayInClubZone(new Date("2026-10-14T12:00:00Z"))).toBe("2026-10-14");
  });

  it("is still today at midday, in either half of the year", () => {
    // GMT in January, BST in July. Neither should move a midday date.
    expect(todayInClubZone(new Date("2027-01-20T12:00:00Z"))).toBe("2027-01-20");
    expect(todayInClubZone(new Date("2027-07-20T12:00:00Z"))).toBe("2027-07-20");
  });

  it("is already tomorrow in Oxford when British Summer Time is an hour ahead", () => {
    // 23:30 UTC on 13 October is 00:30 on the 14th in Oxford. A UTC answer
    // would say the 13th, and the calendar would highlight yesterday.
    expect(todayInClubZone(new Date("2026-10-13T23:30:00Z"))).toBe("2026-10-14");
  });

  it("agrees with UTC once the clocks have gone back", () => {
    // 26 October 2026 is after the BST→GMT change, so 23:30 UTC is 23:30 in
    // Oxford and the date is the same in both.
    expect(todayInClubZone(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-13");
  });

  it("does not simply hand back the UTC date", () => {
    // The regression guard, stated as the difference rather than as a value:
    // an implementation that answered in UTC would fail exactly here.
    const instant = new Date("2026-07-31T23:15:00Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(todayInClubZone(instant)).toBe("2026-08-01");
  });
});

/**
 * LAN-141: refusals quote dates too, and were quoting them in the stored form
 * while the page behind them read `20 Aug 2026`. Two spellings of one date read
 * as two dates, so the written form is declared once, here, and both the
 * service and the screens read it.
 */
describe("formatClubDay", () => {
  it("writes a stored calendar date the way every screen writes it", () => {
    expect(formatClubDay("2026-08-20")).toBe("20 Aug 2026");
    expect(formatClubDay("2027-06-01")).toBe("1 Jun 2027");
  });

  /**
   * A `date` column carries no time and no zone. Reading it on club time would
   * make "2026-08-18" the 17th for an hour every night of British Summer Time.
   */
  it("reads a zoneless day at UTC, so it is the same day everywhere", () => {
    expect(formatClubDay("2026-07-31")).toBe("31 Jul 2026");
    expect(formatClubDay("2026-01-01")).toBe("1 Jan 2026");
  });

  it("says a day could not be read rather than showing the raw value", () => {
    expect(formatClubDay("2026-13-45")).toBe(UNREADABLE_DATE);
    expect(formatClubDay("not a date")).toBe(UNREADABLE_DATE);
    expect(formatClubDay("")).toBe(UNREADABLE_DATE);
    // Never the JavaScript artefact, which looks like a value rather than a
    // fault, and never the stored string on a screen that writes 20 Aug 2026.
    expect(formatClubDay("2026-13-45")).not.toBe("Invalid Date");
    expect(formatClubDay("2026-13-45")).not.toBe("2026-13-45");
  });
});

/**
 * The arithmetic behind "the earliest this assignment can end". Half-open
 * periods plus `effective_to > effective_from` make that the day after the
 * start, and a form that does not say so offers a date the service refuses.
 */
describe("addClubDays", () => {
  it("adds a day", () => {
    expect(addClubDays("2026-08-20", 1)).toBe("2026-08-21");
  });

  it("crosses a month, a year and a leap day without a calendar of its own", () => {
    expect(addClubDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addClubDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addClubDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  /**
   * The clocks go forward on 29 March 2026. Local-time arithmetic on a zoneless
   * day would land on the 28th again, or skip to the 30th, depending on the
   * host's zone; UTC arithmetic simply adds a day.
   */
  it("adds a day across the spring clock change too", () => {
    expect(addClubDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addClubDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("answers null for a day it cannot read", () => {
    expect(addClubDays("2026-13-45", 1)).toBeNull();
    expect(addClubDays("not a date", 1)).toBeNull();
  });
});
