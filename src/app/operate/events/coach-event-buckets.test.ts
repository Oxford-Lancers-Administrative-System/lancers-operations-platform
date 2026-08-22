// @vitest-environment node
/**
 * How the coach's list is ordered — Brian, 14 August 2026: looking forward.
 * Upcoming, with today drawn out at the top of it, then Earlier.
 *
 * Pure, so every boundary is exercised directly rather than through a render.
 * The boundaries are where this fails if it fails: "today" is in Upcoming and
 * "yesterday" is not, and an off-by-one puts tonight's session at the bottom of
 * a list of sixty, which is indistinguishable from it being missing.
 */
import { describe, expect, it } from "vitest";
import type { EventListEntry } from "@/lib/services/events";
import {
  bucketCoachEvents,
  COACH_VISIBLE_STATUSES,
  isOpenForAttendance,
  isToday,
  londonToday,
  shiftDays,
} from "./coach-event-buckets";

const TODAY = "2026-10-14";

function event(
  id: string,
  scheduledOn: string | null,
  status: EventListEntry["status"] = "approved",
): EventListEntry {
  return {
    id,
    name: `Event ${id}`,
    eventType: "practice",
    status,
    scheduledOn,
    startsAt: "20:00",
    endsAt: "22:00",
    deliveryMode: "in_person",
    venue: "Iffley Road Astro",
    isMandatory: true,
    audienceCount: 0,
    invitationCount: 0,
    responseCount: 0,
  };
}

/** The ids in each bucket, keyed by bucket, for readable assertions. */
function bucketed(events: EventListEntry[], today = TODAY): Record<string, string[]> {
  return Object.fromEntries(
    bucketCoachEvents(events, today).map((bucket) => [
      bucket.key,
      bucket.events.map((entry) => entry.id),
    ]),
  );
}

describe("shiftDays", () => {
  it("moves a date without touching the calendar", () => {
    expect(shiftDays("2026-10-14", -7)).toBe("2026-10-07");
    expect(shiftDays("2026-10-14", 7)).toBe("2026-10-21");
  });

  it("crosses a month, a year and a leap day", () => {
    expect(shiftDays("2026-10-03", -7)).toBe("2026-09-26");
    expect(shiftDays("2027-01-03", -7)).toBe("2026-12-27");
    expect(shiftDays("2028-03-02", -7)).toBe("2028-02-24");
  });

  it("is unaffected by British Summer Time ending", () => {
    // The clocks go back on 25 October 2026. A naive local-time subtraction of
    // seven times 86,400 seconds lands an hour early and, for a midnight date,
    // on the previous day.
    expect(shiftDays("2026-10-27", -7)).toBe("2026-10-20");
    expect(shiftDays("2026-11-01", -7)).toBe("2026-10-25");
  });
});

describe("londonToday", () => {
  it("formats as the same YYYY-MM-DD the date column uses", () => {
    expect(londonToday(new Date("2026-10-14T09:00:00Z"))).toBe("2026-10-14");
  });

  it("uses Oxford's day, not the server's", () => {
    // 00:30 on 15 June BST is 23:30 UTC on the 14th, and a container running on
    // UTC would put a late social on the wrong day.
    expect(londonToday(new Date("2026-06-14T23:30:00Z"))).toBe("2026-06-15");
    expect(londonToday(new Date("2026-12-14T23:30:00Z"))).toBe("2026-12-14");
  });
});

describe("bucketCoachEvents", () => {
  it("returns the two sections in reading order, always", () => {
    // The order is the contract; an empty section is dropped by the component,
    // not here, so the caller never has to sort them.
    expect(bucketCoachEvents([], TODAY).map((bucket) => bucket.key)).toEqual([
      "upcoming",
      "earlier",
    ]);
  });

  it("puts today and everything after it in Upcoming", () => {
    const result = bucketed([
      event("today", TODAY),
      event("tomorrow", "2026-10-15", "approved"),
      event("nextMonth", "2026-11-20", "approved"),
    ]);

    expect(result.upcoming).toEqual(["today", "tomorrow", "nextMonth"]);
    expect(result.earlier).toEqual([]);
  });

  it("puts yesterday and everything before it in Earlier", () => {
    const result = bucketed([event("yesterday", "2026-10-13"), event("lastMonth", "2026-09-01")]);

    expect(result.upcoming).toEqual([]);
    expect(result.earlier).toEqual(["yesterday", "lastMonth"]);
  });

  it("sorts Upcoming soonest first — what is coming up", () => {
    const result = bucketed([
      event("nextMonth", "2026-11-20", "approved"),
      event("today", TODAY),
      event("tomorrow", "2026-10-15", "approved"),
    ]);

    expect(result.upcoming).toEqual(["today", "tomorrow", "nextMonth"]);
  });

  it("sorts Earlier most recent first — the one you were just at", () => {
    const result = bucketed([
      event("lastMonth", "2026-09-01"),
      event("yesterday", "2026-10-13"),
      event("lastWeek", "2026-10-07"),
    ]);

    expect(result.earlier).toEqual(["yesterday", "lastWeek", "lastMonth"]);
  });

  it("keeps an undated event out of Upcoming, and last in Earlier", () => {
    // Nothing is known about when it is, so it cannot be upcoming; and the top
    // of the list a coach reads first is the loudest possible place for the one
    // row that says nothing.
    const result = bucketed([event("undated", null), event("yesterday", "2026-10-13")]);

    expect(result.upcoming).toEqual([]);
    expect(result.earlier).toEqual(["yesterday", "undated"]);
  });

  it("shows approved sessions ahead and behind, and nothing else", () => {
    // One status covers both halves since LAN-151: a session that is going to
    // happen and one that did are the same stored status, and differ only in
    // whether the date has passed (D30).
    const result = bucketed([
      event("ahead", "2026-10-15", "approved"),
      event("behind", "2026-10-13", "approved"),
      event("draft", "2026-10-15", "draft"),
      event("cancelled", "2026-10-15", "cancelled"),
    ]);

    expect(result.upcoming).toEqual(["ahead"]);
    expect(result.earlier).toEqual(["behind"]);
  });

  it("names the visible statuses as a set, so widening them is a line in a diff", () => {
    // A coach seeing the calendar's unfinished drafts would be the event
    // administration slice-ux.md § 3 withholds.
    expect([...COACH_VISIBLE_STATUSES].sort()).toEqual(["approved"]);
  });

  it("loses nothing it is allowed to show", () => {
    const events = [
      event("a", TODAY),
      event("b", "2026-10-13"),
      event("c", "2026-01-01"),
      event("d", null),
      event("e", "2027-01-01", "approved"),
    ];

    const placed = bucketCoachEvents(events, TODAY).flatMap((bucket) => bucket.events);

    expect(placed).toHaveLength(events.length);
    expect(new Set(placed.map((entry) => entry.id))).toEqual(
      new Set(events.map((entry) => entry.id)),
    );
  });
});

describe("isToday", () => {
  it("is true only on the day itself", () => {
    expect(isToday(event("a", TODAY), TODAY)).toBe(true);
    expect(isToday(event("a", "2026-10-15"), TODAY)).toBe(false);
    expect(isToday(event("a", "2026-10-13"), TODAY)).toBe(false);
    expect(isToday(event("a", null), TODAY)).toBe(false);
  });
});

describe("isOpenForAttendance", () => {
  it("is true once the session's date has passed, and not before", () => {
    // D30, and the gate LAN-110 exists around. It used to turn on an operator
    // asserting occurrence; nobody asserts it now, so what it turns on is the
    // date — which is also why a coach can no longer be waiting on somebody.
    expect(isOpenForAttendance(event("a", "2026-10-13", "approved"), TODAY)).toBe(true);
    expect(isOpenForAttendance(event("a", TODAY, "approved"), TODAY)).toBe(false);
    expect(isOpenForAttendance(event("a", "2026-10-15", "approved"), TODAY)).toBe(false);
  });

  it("is false for a cancelled session however long ago it was", () => {
    expect(isOpenForAttendance(event("a", "2026-10-13", "cancelled"), TODAY)).toBe(false);
  });

  it("is false for a session with no date at all", () => {
    expect(isOpenForAttendance(event("a", null, "approved"), TODAY)).toBe(false);
  });
});
