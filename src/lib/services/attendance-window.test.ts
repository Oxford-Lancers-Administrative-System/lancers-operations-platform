/**
 * When the register opens — D71 and D72, LAN-152.
 *
 * Pure, and deliberately without a database: every rule here is arithmetic over
 * a date, a time and a clock, and the thing worth pinning is the arithmetic. The
 * board's use of it is proved against the real database in `./attendance.test.ts`.
 *
 * `now` is passed in everywhere rather than faked globally. A rule about a
 * buffer is a rule about the distance between two moments, and a test that has
 * to freeze the world to say so is a test that hides which two.
 */
import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_REGISTER_BUFFER_HOURS,
  ATTENDANCE_REGISTER_BUFFER_MS,
  eventStartInstant,
  isRegisterOpen,
  registerOpensAt,
} from "./attendance-window";

/** A winter Wednesday practice: 20:00 in Oxford is 20:00 UTC. */
const WINTER = { scheduledOn: "2026-11-25", startsAt: "20:00" };

/** A summer fixture: 14:00 in Oxford is 13:00 UTC, because BST is +01:00. */
const SUMMER = { scheduledOn: "2026-06-13", startsAt: "14:00" };

describe("the buffer", () => {
  it("is one named tuning value, and the milliseconds agree with the hours", () => {
    // The packet delegated the exact length and called six hours approximate.
    // What this pins is not the number but that there is exactly one of it: a
    // second expression of the same value somewhere else is how a screen and a
    // service come to disagree about when a register opened.
    expect(ATTENDANCE_REGISTER_BUFFER_HOURS).toBe(6);
    expect(ATTENDANCE_REGISTER_BUFFER_MS).toBe(ATTENDANCE_REGISTER_BUFFER_HOURS * 60 * 60 * 1000);
  });

  it("opens the register exactly that far before the start", () => {
    const start = eventStartInstant(WINTER)!;
    const opens = registerOpensAt(WINTER)!;
    expect(start.getTime() - opens.getTime()).toBe(ATTENDANCE_REGISTER_BUFFER_MS);
  });
});

describe("the event's start, as an instant", () => {
  it("reads a winter evening as the same clock in UTC", () => {
    expect(eventStartInstant(WINTER)?.toISOString()).toBe("2026-11-25T20:00:00.000Z");
  });

  it("reads a summer afternoon an hour earlier, because the club is on BST", () => {
    // The point of the whole zone computation. Without it a June fixture's
    // register would open an hour late, every summer, and only in summer —
    // which is the shape of bug nobody finds until July.
    expect(eventStartInstant(SUMMER)?.toISOString()).toBe("2026-06-13T13:00:00.000Z");
  });

  it("treats an event with a date and no time as starting at midnight", () => {
    // Eight of eleven scheduled fixtures carry a confirmed date and nothing
    // else, so this is the normal case rather than a degenerate one. The
    // buffer then opens the register at 18:00 the evening before, which is one
    // rule applied uniformly rather than a second rule for untimed events.
    expect(eventStartInstant({ scheduledOn: "2026-11-25", startsAt: null })?.toISOString()).toBe(
      "2026-11-25T00:00:00.000Z",
    );
    expect(registerOpensAt({ scheduledOn: "2026-11-25", startsAt: null })?.toISOString()).toBe(
      "2026-11-24T18:00:00.000Z",
    );
  });

  it("accepts the seconds PostgreSQL puts on a `time`", () => {
    expect(
      eventStartInstant({ scheduledOn: "2026-11-25", startsAt: "20:00:00" })?.toISOString(),
    ).toBe("2026-11-25T20:00:00.000Z");
  });

  it("has no answer for an event with no date, and does not invent one", () => {
    // `null` rather than the epoch. An undated draft whose start defaulted to
    // 1970 would have a buffer that lifted fifty years ago, and its register
    // would stand open — the opposite of what an undated event should offer.
    expect(eventStartInstant({ scheduledOn: null, startsAt: "20:00" })).toBeNull();
    expect(registerOpensAt({ scheduledOn: null, startsAt: "20:00" })).toBeNull();
  });

  it("refuses a date or a time it cannot read, rather than guessing", () => {
    expect(eventStartInstant({ scheduledOn: "2026-13-45", startsAt: "20:00" })).toBeNull();
    expect(eventStartInstant({ scheduledOn: "25 Nov 2026", startsAt: "20:00" })).toBeNull();
    expect(eventStartInstant({ scheduledOn: "2026-11-25", startsAt: "eight" })).toBeNull();
  });
});

describe("whether the register may be opened", () => {
  const opens = registerOpensAt(WINTER)!.getTime();

  it("is closed a minute before the buffer lifts", () => {
    expect(isRegisterOpen(WINTER, new Date(opens - 60_000))).toBe(false);
  });

  it("is open at the exact moment it lifts", () => {
    // Inclusive, deliberately: somebody pressing the link at the advertised
    // moment must not be told to come back.
    expect(isRegisterOpen(WINTER, new Date(opens))).toBe(true);
  });

  it("is closed for a whole term when the event is a whole term away", () => {
    expect(isRegisterOpen(WINTER, new Date("2026-08-22T09:00:00.000Z"))).toBe(false);
  });

  it("never closes, however long afterwards somebody gets round to it", () => {
    // D72, and the reason it is a test rather than a comment: a forgotten
    // session is filled in days later and a mistake is corrected at any time.
    // A register that shut would silently lose both.
    for (const days of [1, 7, 90, 365, 3650]) {
      const later = new Date(opens + days * 24 * 60 * 60 * 1000);
      expect(isRegisterOpen(WINTER, later), `closed ${days} days later`).toBe(true);
    }
  });

  it("is closed for an event with no date, at any moment", () => {
    const undated = { scheduledOn: null, startsAt: null };
    expect(isRegisterOpen(undated, new Date("2026-11-25T20:00:00.000Z"))).toBe(false);
    expect(isRegisterOpen(undated, new Date("2099-01-01T00:00:00.000Z"))).toBe(false);
  });
});
