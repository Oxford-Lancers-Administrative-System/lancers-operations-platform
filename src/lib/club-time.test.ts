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

import { CLUB_TIME_ZONE, todayInClubZone } from "./club-time";

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
