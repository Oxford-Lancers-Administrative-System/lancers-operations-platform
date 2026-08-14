// @vitest-environment node
/**
 * How the coach's list is ordered — Brian, 14 August 2026: today first and
 * highlighted, then this past week, then everything older.
 *
 * Pure, so every boundary is exercised directly rather than through a render.
 * The boundaries are where this fails if it fails: "today" and "seven days ago"
 * are both inclusive-at-one-end, and an off-by-one puts the session a coach was
 * at an hour ago into the wrong section — which on a list of sixty events is
 * indistinguishable from it being missing.
 */
import { describe, expect, it } from "vitest";
import type { EventListEntry } from "@/lib/services/events";
import { bucketCoachEvents, londonToday, shiftDays } from "./coach-event-buckets";

const TODAY = "2026-10-14";

function event(id: string, scheduledOn: string | null): EventListEntry {
  return {
    id,
    name: `Event ${id}`,
    eventType: "practice",
    status: "occurred",
    scheduledOn,
    startsAt: "20:00",
    endsAt: "22:00",
    venue: "Iffley Road Astro",
    isMandatory: true,
    solicitsResponse: true,
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
  it("moves a date backwards without touching the calendar", () => {
    expect(shiftDays("2026-10-14", -7)).toBe("2026-10-07");
  });

  it("crosses a month boundary", () => {
    expect(shiftDays("2026-10-03", -7)).toBe("2026-09-26");
  });

  it("crosses a year boundary", () => {
    expect(shiftDays("2027-01-03", -7)).toBe("2026-12-27");
  });

  it("crosses a leap day", () => {
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
    // 23:30 on 14 October in London is 22:30 UTC — same day. But 00:30 on
    // 15 October BST is 23:30 UTC on the 14th, and a container running on UTC
    // would put a late social on the wrong day.
    expect(londonToday(new Date("2026-06-14T23:30:00Z"))).toBe("2026-06-15");
    expect(londonToday(new Date("2026-12-14T23:30:00Z"))).toBe("2026-12-14");
  });
});

describe("bucketCoachEvents", () => {
  it("puts an event scheduled today at the top, on its own", () => {
    const result = bucketed([event("a", TODAY), event("b", "2026-10-10")]);

    expect(result.today).toEqual(["a"]);
    expect(result.past_week).toEqual(["b"]);
    expect(result.earlier).toEqual([]);
  });

  it("returns the three sections in reading order, always", () => {
    // The order is the contract; an empty section is dropped by the component,
    // not here, so the caller never has to sort them.
    expect(bucketCoachEvents([], TODAY).map((bucket) => bucket.key)).toEqual([
      "today",
      "past_week",
      "earlier",
    ]);
  });

  it("counts yesterday and seven days ago as this past week", () => {
    const result = bucketed([event("yesterday", "2026-10-13"), event("weekAgo", "2026-10-07")]);

    expect(result.past_week).toEqual(["yesterday", "weekAgo"]);
    expect(result.earlier).toEqual([]);
  });

  it("counts eight days ago as earlier", () => {
    // The boundary in the other direction. Seven days ago is in; the day before
    // it is out.
    expect(bucketed([event("eightDays", "2026-10-06")]).earlier).toEqual(["eightDays"]);
  });

  it("keeps the order it was given inside each section", () => {
    // The service returns date-descending, which is what somebody looking for
    // "the one I was just at" wants — and for two events today it puts the
    // 20:00 practice above the 18:00 chalk talk.
    const result = bucketed([
      event("laterToday", TODAY),
      event("earlierToday", TODAY),
      event("tuesday", "2026-10-13"),
      event("monday", "2026-10-12"),
    ]);

    expect(result.today).toEqual(["laterToday", "earlierToday"]);
    expect(result.past_week).toEqual(["tuesday", "monday"]);
  });

  it("puts an undated event at the bottom rather than claiming it is today", () => {
    expect(bucketed([event("undated", null)]).earlier).toEqual(["undated"]);
  });

  it("puts an event dated after today in earlier, not in today", () => {
    // Not producible by the club — an operator does not mark next Tuesday
    // occurred — but the local synthetic dataset dates the whole season ahead
    // of its own "today", so this is the case a development machine actually
    // shows. It must not be mistaken for today's session.
    const result = bucketed([event("future", "2026-12-25"), event("today", TODAY)]);

    expect(result.today).toEqual(["today"]);
    expect(result.earlier).toEqual(["future"]);
  });

  it("loses nothing", () => {
    const events = [
      event("a", TODAY),
      event("b", "2026-10-13"),
      event("c", "2026-01-01"),
      event("d", null),
      event("e", "2027-01-01"),
    ];

    const placed = bucketCoachEvents(events, TODAY).flatMap((bucket) => bucket.events);

    expect(placed).toHaveLength(events.length);
    expect(new Set(placed.map((entry) => entry.id))).toEqual(
      new Set(events.map((entry) => entry.id)),
    );
  });
});
