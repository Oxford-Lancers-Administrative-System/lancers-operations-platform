/**
 * The continuous academic year — LAN-153, `REQ-oxford-continuous`.
 *
 * ## The fixtures are the club's real term cards, again
 *
 * The same three terms `src/lib/services/calendar.test.ts` used for LAN-114,
 * because the boundaries this file asserts are the ones the acceptance evidence
 * names — MT26, HT27 and TT27 — and they were read off the supplied
 * spreadsheets rather than computed from the code under test:
 *
 *   * `260720 OULAFC MT26 Term Card v0.xlsx` — −1st week 27 Sep–3 Oct 2026,
 *     0th week 4–10 Oct, weeks 1–8 from 11 Oct to 5 Dec.
 *   * `260720 OULAFC HT27 Term Card v0.xlsx` — 0th week 10–16 Jan 2027, weeks
 *     1–8 from 17 Jan to 13 Mar.
 *   * `260720 OULAFC TT27 Term Card v0.xlsx` — 0th week 18–24 Apr 2027, weeks
 *     1–8 from 25 Apr to 19 Jun.
 *
 * ## The one place the approved mockup is not followed, and why
 *
 * `mockups/W1-find-and-read-events.html` draws Christmas Vacation 1–4 and then
 * a **−1st week** of Hilary beginning 3 January. Hilary has no −1st week: the
 * HT27 card starts it at 0th week on 10 January, and `terms.first_week` is `0`
 * for both Hilary and Trinity. Stewart's rule — a vacation runs "until it'll
 * match perfectly up until minus one week" of the next term — is implemented as
 * *the next term's own first configured week*, which is −1st for Michaelmas and
 * 0th for the other two. LAN-114's contract already required exactly that
 * ("Nothing assumes weeks 1 to 8"), so the mockup's extra row is a drawing
 * detail and the term data is the authority. Asserted below rather than left as
 * a comment.
 */
import { describe, expect, it } from "vitest";

import type { TermWindow } from "./event-input";
import type { CalendarEvent } from "./calendar";
import {
  academicYearFor,
  academicYearEvents,
  buildAcademicYear,
  formatOxfordWeek,
  formatVacationWeek,
  yearCoordinateOf,
  type AcademicYearColumn,
} from "./oxford-year";

// ---------------------------------------------------------------------------
// The 2026–27 club year, exactly as configured, and the year before it
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

/** The previous year, so the leading Long Vacation has something to count from. */
const TRINITY_2026: TermWindow = Object.freeze({
  id: "term-tt-2026",
  name: "trinity",
  academicYear: "2025-26",
  startsOn: "2026-04-19",
  endsOn: "2026-06-20",
  firstWeek: 0,
  lastWeek: 8,
});

const TERMS: readonly TermWindow[] = Object.freeze([
  TRINITY_2027,
  HILARY_2027,
  MICHAELMAS_2026,
  TRINITY_2026,
]);

let nextId = 0;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    name: `Event ${nextId}`,
    eventType: "practice",
    scheduledOn: null,
    startsAt: null,
    endsAt: null,
    venue: null,
    ...overrides,
  };
}

function year(
  events: readonly CalendarEvent[] = [],
  options: Parameters<typeof buildAcademicYear>[3] = {},
): AcademicYearColumn {
  return buildAcademicYear("2026-27", TERMS, events, options);
}

/** Every week row in the column, in order, flattened out of its segment. */
function rows(column: AcademicYearColumn) {
  return column.segments.flatMap((segment) =>
    segment.weeks.map((week) => ({
      segment: segment.name,
      kind: segment.kind,
      label: week.label,
      startsOn: week.startsOn,
      endsOn: week.endsOn,
    })),
  );
}

// ---------------------------------------------------------------------------

describe("academicYearFor", () => {
  it("takes the year whose terms span today, never a heading", () => {
    expect(academicYearFor(TERMS, { today: "2027-01-20" })).toBe("2026-27");
    expect(academicYearFor(TERMS, { today: "2026-05-01" })).toBe("2025-26");
  });

  it("falls back to the year spanning the open season's start", () => {
    // Deep in the Christmas vacation: inside no term at all.
    expect(academicYearFor(TERMS, { today: "2026-12-25", seasonStartsOn: "2026-10-01" })).toBe(
      "2026-27",
    );
  });

  it("falls back to the latest configured year when neither anchor lands", () => {
    expect(academicYearFor(TERMS, { today: "2030-01-01" })).toBe("2026-27");
  });

  it("has no answer when no term is configured", () => {
    expect(academicYearFor([], { today: "2027-01-20" })).toBeNull();
  });
});

describe("buildAcademicYear — the shape of the column", () => {
  it("runs Long Vacation, Michaelmas, Christmas, Hilary, Easter, Trinity, Long Vacation", () => {
    expect(year().segments.map((segment) => segment.name)).toEqual([
      "Long Vacation",
      "michaelmas",
      "Christmas Vacation",
      "hilary",
      "Easter Vacation",
      "trinity",
      "Long Vacation",
    ]);
  });

  it("is continuous — every segment begins the day after the last one ends", () => {
    const segments = year().segments;
    for (let index = 1; index < segments.length; index += 1) {
      const previousEnd = new Date(`${segments[index - 1].endsOn}T00:00:00Z`).getTime();
      const thisStart = new Date(`${segments[index].startsOn}T00:00:00Z`).getTime();
      expect(thisStart - previousEnd).toBe(86_400_000);
    }
  });

  it("names the two Long Vacations apart in the jump control, by their year", () => {
    const longVacations = year()
      .segments.filter((segment) => segment.name === "Long Vacation")
      .map((segment) => segment.jumpLabel);
    expect(longVacations).toEqual(["Long Vacation 2026", "Long Vacation 2027"]);
  });

  it("gives a vacation no term at all — it belongs to neither side", () => {
    for (const segment of year().segments) {
      if (segment.kind === "vacation") expect(segment.termId).toBeNull();
      else expect(segment.termId).not.toBeNull();
    }
  });
});

describe("buildAcademicYear — the boundaries the club supplied", () => {
  const column = year();

  const coordinate = (day: string) => {
    const found = yearCoordinateOf(column, day);
    return found === null ? null : `${found.segmentName} ${found.week}`;
  };

  it("places MT26 at both ends", () => {
    expect(coordinate("2026-09-27")).toBe("michaelmas -1");
    expect(coordinate("2026-10-04")).toBe("michaelmas 0");
    expect(coordinate("2026-10-11")).toBe("michaelmas 1");
    expect(coordinate("2026-12-05")).toBe("michaelmas 8");
  });

  it("places HT27 and TT27 at both ends", () => {
    expect(coordinate("2027-01-10")).toBe("hilary 0");
    expect(coordinate("2027-03-13")).toBe("hilary 8");
    expect(coordinate("2027-04-18")).toBe("trinity 0");
    expect(coordinate("2027-06-19")).toBe("trinity 8");
  });

  it("hands the day after Michaelmas to Christmas Vacation 1", () => {
    expect(coordinate("2026-12-06")).toBe("Christmas Vacation 1");
    expect(coordinate("2026-12-13")).toBe("Christmas Vacation 2");
    expect(coordinate("2026-12-25")).toBe("Christmas Vacation 3");
  });

  it("runs the Christmas vacation up to Hilary's own first week and stops", () => {
    const christmas = column.segments.find((segment) => segment.name === "Christmas Vacation");
    expect(christmas?.startsOn).toBe("2026-12-06");
    expect(christmas?.endsOn).toBe("2027-01-09");
    expect(christmas?.weeks.map((week) => week.label)).toEqual([
      "Christmas Vacation 1",
      "Christmas Vacation 2",
      "Christmas Vacation 3",
      "Christmas Vacation 4",
      "Christmas Vacation 5",
    ]);
    // Hilary begins at 0th week, not −1st: `terms.first_week` decides, so the
    // vacation meets the term wherever the term actually starts.
    expect(coordinate("2027-01-09")).toBe("Christmas Vacation 5");
    expect(coordinate("2027-01-10")).toBe("hilary 0");
  });

  it("meets Michaelmas at its −1st week, which is where Michaelmas does start", () => {
    expect(coordinate("2026-09-26")).toBe("Long Vacation 14");
    expect(coordinate("2026-09-27")).toBe("michaelmas -1");
  });

  it("numbers the Easter vacation forward from 1", () => {
    expect(coordinate("2027-03-14")).toBe("Easter Vacation 1");
    expect(coordinate("2027-04-17")).toBe("Easter Vacation 5");
  });

  it("numbers the Long Vacation forward past any Oxford week", () => {
    // Stewart's own example reached the twenties. The leading Long Vacation runs
    // from the previous Trinity's last week to Michaelmas, which is fourteen.
    const leading = column.segments.find((segment) => segment.jumpLabel === "Long Vacation 2026");
    expect(leading?.weeks.map((week) => week.week)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
    expect(leading?.weeks[13].label).toBe("Long Vacation 14");
    expect(coordinate("2026-06-21")).toBe("Long Vacation 1");
  });

  it("opens a trailing Long Vacation after Trinity even with nothing in it", () => {
    expect(coordinate("2027-06-20")).toBe("Long Vacation 1");
  });
});

describe("buildAcademicYear — where events land", () => {
  it("places every dated event in exactly one cell", () => {
    const events = [
      event({ scheduledOn: "2026-09-27", name: "Freshers" }),
      event({ scheduledOn: "2026-12-17", name: "Christmas social" }),
      event({ scheduledOn: "2027-01-10", name: "Hilary week 0" }),
      event({ scheduledOn: "2027-03-30", name: "Easter camp" }),
      event({ scheduledOn: "2027-06-25", name: "Summer tour" }),
    ];
    const column = year(events);

    const placements = new Map<string, number>();
    for (const segment of column.segments) {
      for (const week of segment.weeks) {
        for (const day of week.days) {
          for (const placed of day.events) {
            placements.set(placed.id, (placements.get(placed.id) ?? 0) + 1);
          }
        }
      }
    }

    expect(column.placedCount).toBe(events.length);
    expect([...placements.values()]).toEqual([1, 1, 1, 1, 1]);
    expect(column.outsideTheYear).toEqual([]);
    expect(column.undated).toEqual([]);
  });

  it("keeps an undated event out of every cell and lists it instead", () => {
    const undated = event({ scheduledOn: null, name: "Awards night, date TBC" });
    const column = year([undated]);
    expect(column.placedCount).toBe(0);
    expect(column.undated.map((entry) => entry.name)).toEqual(["Awards night, date TBC"]);
    expect(academicYearEvents(column)).toContain(undated);
  });

  it("lists a date the year does not reach rather than dropping it", () => {
    const ancient = event({ scheduledOn: "2020-01-01", name: "Before the records" });
    const column = year([ancient]);
    expect(column.placedCount).toBe(0);
    expect(column.outsideTheYear.map((entry) => entry.name)).toEqual(["Before the records"]);
  });

  it("orders two events on one day by start time, and keeps both", () => {
    const late = event({ scheduledOn: "2026-10-14", startsAt: "20:00", name: "Practice" });
    const early = event({ scheduledOn: "2026-10-14", startsAt: "18:00", name: "Chalk" });
    const column = year([late, early]);
    const cell = column.segments
      .flatMap((segment) => segment.weeks)
      .flatMap((week) => week.days)
      .find((day) => day.day === "2026-10-14");
    expect(cell?.events.map((entry) => entry.name)).toEqual(["Chalk", "Practice"]);
  });

  it("marks exactly one day as today", () => {
    const column = year([], { today: "2026-12-25" });
    const todays = column.segments
      .flatMap((segment) => segment.weeks)
      .flatMap((week) => week.days)
      .filter((day) => day.isToday);
    expect(todays.map((day) => day.day)).toEqual(["2026-12-25"]);
  });

  it("stretches the trailing Long Vacation to hold a summer event", () => {
    const tour = event({ scheduledOn: "2027-08-14", name: "Summer tour" });
    const column = year([tour]);
    const trailing = column.segments[column.segments.length - 1];
    expect(trailing.jumpLabel).toBe("Long Vacation 2027");
    expect(trailing.endsOn >= "2027-08-14").toBe(true);
    expect(column.outsideTheYear).toEqual([]);
  });
});

describe("buildAcademicYear — every week is seven days, in order", () => {
  it("runs Sunday to Saturday on every full row", () => {
    for (const row of year().segments.flatMap((segment) => segment.weeks)) {
      expect(new Date(`${row.startsOn}T00:00:00Z`).getUTCDay()).toBe(0);
      expect(row.days.map((day) => day.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  });

  it("emits the rows in date order across the whole column", () => {
    const ordered = rows(year());
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index].startsOn > ordered[index - 1].startsOn).toBe(true);
    }
  });
});

describe("buildAcademicYear — a year with no terms", () => {
  it("returns nothing to draw, and loses no event", () => {
    const dated = event({ scheduledOn: "2026-10-14" });
    const column = buildAcademicYear("2026-27", [], [dated]);
    expect(column.segments).toEqual([]);
    expect(column.outsideTheYear).toEqual([dated]);
  });
});

describe("week labels", () => {
  it("uses the club's ordinals, with a real minus sign", () => {
    expect(formatOxfordWeek(-1)).toBe("−1st week");
    expect(formatOxfordWeek(0)).toBe("0th week");
    expect(formatOxfordWeek(8)).toBe("8th week");
  });

  it("falls back to the bare number for a week the club has no word for", () => {
    expect(formatOxfordWeek(9)).toBe("9 week");
  });

  it("numbers a vacation week with its own segment's name", () => {
    expect(formatVacationWeek("Long Vacation", 22)).toBe("Long Vacation 22");
  });
});

describe("yearCoordinateOf", () => {
  it("agrees with the cell the event was actually placed in", () => {
    const practice = event({ scheduledOn: "2027-02-03" });
    const column = year([practice]);

    const cell = column.segments
      .flatMap((segment) => segment.weeks.map((week) => ({ segment, week })))
      .find(({ week }) => week.days.some((day) => day.events.includes(practice)));

    const coordinate = yearCoordinateOf(column, "2027-02-03");
    expect(coordinate).not.toBeNull();
    expect(coordinate?.segmentKey).toBe(cell?.segment.key);
    expect(coordinate?.week).toBe(cell?.week.week);
  });

  it("has no answer for a date with no home, and none for no date at all", () => {
    const column = year();
    expect(yearCoordinateOf(column, null)).toBeNull();
    expect(yearCoordinateOf(column, "2020-01-01")).toBeNull();
  });
});
