import { describe, expect, it } from "vitest";
import {
  dateFromScheduledOn,
  dateFromTimeString,
  scheduledOnFromDate,
  timeStringFromDate,
} from "./date-time-controls";

describe("dateFromScheduledOn", () => {
  it("reads a well-formed ISO date as the day it names", () => {
    const date = dateFromScheduledOn("2026-08-24");
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(7); // 0-indexed: August
    expect(date?.getDate()).toBe(24);
  });

  it("returns null for the empty string", () => {
    expect(dateFromScheduledOn("")).toBeNull();
  });

  // W154C-F1: the exact five-digit-year shape a native `<input type="date">`
  // could leave mid-edit. `DatePicker`'s own field can no longer produce
  // this, but a stored or echoed value still could, and this function is the
  // last guard before `formatLongDate` gets it.
  it("returns null for a malformed five-digit-year shape, not a thrown error", () => {
    expect(dateFromScheduledOn("20261-12-11")).toBeNull();
  });

  it("returns null for a day that overflows its month, rather than rolling over", () => {
    // `new Date(2026, 1, 30)` silently becomes 2 March; a scheduled-on value
    // must not.
    expect(dateFromScheduledOn("2026-02-30")).toBeNull();
  });
});

describe("scheduledOnFromDate", () => {
  it("round-trips a date back to the ISO string it came from", () => {
    const date = dateFromScheduledOn("2026-08-24");
    expect(scheduledOnFromDate(date)).toBe("2026-08-24");
  });

  it("returns the empty string for null", () => {
    expect(scheduledOnFromDate(null)).toBe("");
  });

  it("pads a single-digit day and month", () => {
    expect(scheduledOnFromDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("dateFromTimeString", () => {
  it("reads a 24-hour HH:mm pair", () => {
    const date = dateFromTimeString("20:05");
    expect(date?.getHours()).toBe(20);
    expect(date?.getMinutes()).toBe(5);
  });

  it("returns null for the empty string", () => {
    expect(dateFromTimeString("")).toBeNull();
  });

  it("returns null for an hour or minute out of range", () => {
    expect(dateFromTimeString("24:00")).toBeNull();
    expect(dateFromTimeString("20:60")).toBeNull();
  });
});

describe("timeStringFromDate", () => {
  it("round-trips a time back to the HH:mm string it came from", () => {
    const date = dateFromTimeString("20:05");
    expect(timeStringFromDate(date)).toBe("20:05");
  });

  it("returns the empty string for null", () => {
    expect(timeStringFromDate(null)).toBe("");
  });

  it("pads a single-digit hour and minute", () => {
    expect(timeStringFromDate(new Date(2000, 0, 1, 6, 5))).toBe("06:05");
  });
});
