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
 * ## What these pin, and what they deliberately do not
 *
 * They pin the **rule**: a vacation runs up to the next term's *own first
 * configured week*, whatever that is, and the column never invents a run-up week
 * a term row does not declare. LAN-114's contract already required this
 * ("Nothing assumes weeks 1 to 8"), and a manufactured week would be an Oxford
 * week the schema would refuse to store.
 *
 * They do **not** settle which weeks the club's terms ought to declare, and the
 * fixtures below should not be read as doing so. In the seeded 2026–27 season
 * `first_week` is `-1` for Michaelmas and `0` for **both** Hilary and Trinity,
 * so the column emits Michaelmas `−1st … 8th` and the other two from `0th`. The
 * approved mockup draws a `−1st week` at 3–9 Jan 2027 and summarises Trinity as
 * `−1st – 8th`, and Stewart Humble expects the vacation to run "until it'll match
 * perfectly up until minus one week" of the next term.
 *
 * That is a disagreement about **data, not behaviour**: the moment a term row
 * declares `first_week = -1`, this module emits the −1st week the mockup draws,
 * and the test immediately below proves exactly that by declaring one. The seed
 * currently disagrees with itself across three terms of one season; LAN-153 did
 * not change it and does not close the question.
 */
import { describe, expect, it } from "vitest";

import type { TermWindow } from "./event-input";
import type { CalendarEvent } from "./calendar";
import {
  academicYearFor,
  LEADING_VACATION_WEEKS,
  TRAILING_VACATION_WEEKS,
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

/**
 * The previous year. Since LAN-368 it must make no difference at all to the
 * 2026–27 column: production opens a season carrying its own three terms and
 * nothing else, and the leading Long Vacation has to be drawn anyway.
 */
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

/** The shape a production baseline actually opens a season in: three terms of one year, nothing before them. */
const BASELINE_TERMS: readonly TermWindow[] = Object.freeze([
  TRINITY_2027,
  HILARY_2027,
  MICHAELMAS_2026,
]);

let nextId = 0;

function event(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  nextId += 1;
  return {
    id: `event-${nextId}`,
    name: `Event ${nextId}`,
    templateName: "Practice",
    templateColour: "blue",
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

  it("emits the mockup's −1st week the moment a term row declares one", () => {
    // The disagreement between the approved mockup and the seeded data, settled
    // by changing the data rather than the rule. Hilary here declares
    // `first_week = -1` starting 3 January — exactly the row the mockup draws —
    // and the column emits it, shortening the vacation to four weeks to meet it.
    //
    // Nothing in the module is special-cased for Michaelmas; the reason
    // Michaelmas is the only term with a −1st week today is that it is the only
    // term row that says so.
    const hilaryWithRunUp: TermWindow = {
      ...HILARY_2027,
      startsOn: "2027-01-03",
      firstWeek: -1,
    };
    const column = buildAcademicYear(
      "2026-27",
      [TRINITY_2027, hilaryWithRunUp, MICHAELMAS_2026, TRINITY_2026],
      [],
    );

    const christmas = column.segments.find((segment) => segment.name === "Christmas Vacation");
    expect(christmas?.weeks.map((week) => week.label)).toEqual([
      "Christmas Vacation 1",
      "Christmas Vacation 2",
      "Christmas Vacation 3",
      "Christmas Vacation 4",
    ]);
    expect(christmas?.endsOn).toBe("2027-01-02");

    const hilary = column.segments.find((segment) => segment.termId === hilaryWithRunUp.id);
    expect(hilary?.weeks[0].label).toBe("−1st week");
    expect(hilary?.weeks[0].startsOn).toBe("2027-01-03");
    expect(yearCoordinateOf(column, "2027-01-03")).toMatchObject({
      segmentName: "hilary",
      week: -1,
    });
  });

  it("meets Michaelmas at its −1st week, which is where Michaelmas does start", () => {
    // LAN-368, Brian 2026-09-16: the leading vacation is five whole weeks up
    // against Michaelmas, counted down so the row that meets the term is −1 —
    // it used to read "Long Vacation 5" or, earlier still, "14" because it
    // counted forward from the previous year's Trinity, a row production has
    // no way to know about.
    // `coordinate` here prints the raw numeric field, not the rendered label —
    // an ASCII hyphen, same as "michaelmas -1" below; `formatVacationWeek`'s
    // own real-minus-sign rendering is covered under "week labels".
    expect(coordinate("2026-09-26")).toBe("Long Vacation -1");
    expect(coordinate("2026-09-27")).toBe("michaelmas -1");
  });

  it("numbers the Easter vacation forward from 1", () => {
    expect(coordinate("2027-03-14")).toBe("Easter Vacation 1");
    expect(coordinate("2027-04-17")).toBe("Easter Vacation 5");
  });

  it("counts the Long Vacation down past any Oxford week", () => {
    // Stewart's own example reached the twenties: a vacation week is not clamped
    // to the 8 an Oxford term stops at. Ten weeks before Michaelmas is the
    // tenth row from the end of a leading vacation drawn to reach that event,
    // and it counts down to −1 wherever it starts (LAN-368).
    const stretched = year([event({ scheduledOn: "2026-07-19", name: "Pre-season" })]);
    const leading = stretched.segments.find(
      (segment) => segment.jumpLabel === "Long Vacation 2026",
    );

    expect(leading?.weeks.map((week) => week.week)).toEqual([
      -10, -9, -8, -7, -6, -5, -4, -3, -2, -1,
    ]);
    expect(leading?.weeks[9].label).toBe("Long Vacation −1");
    expect(leading?.weeks.some((week) => week.week < -8)).toBe(true);
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

  it("draws a week for a date far outside the terms rather than listing it apart", () => {
    // LAN-368, "nothing is ever off the calendar": the leading vacation reaches
    // back to the earliest event however far out it is, so a stray date is a
    // visible week rather than a footnote. `outsideTheYear` survives for the
    // only case that can still produce it — a year with no terms at all.
    const stray = event({ scheduledOn: "2026-03-08", name: "Long before term" });
    const column = year([stray]);

    expect(column.outsideTheYear).toEqual([]);
    expect(column.placedCount).toBe(1);
    expect(yearCoordinateOf(column, "2026-03-08")).toMatchObject({
      segmentName: "Long Vacation",
      week: -29,
    });
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

  it("uses a real minus sign for a leading Long Vacation week, like formatOxfordWeek", () => {
    expect(formatVacationWeek("Long Vacation", -1)).toBe("Long Vacation −1");
    expect(formatVacationWeek("Long Vacation", -12)).toBe("Long Vacation −12");
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

// ---------------------------------------------------------------------------
// BG-153-1 — the two Long Vacations are drawn only as far as the club reaches
// ---------------------------------------------------------------------------

/**
 * Brian, at the visual gate: a leading vacation drawn to its full length
 * _"just shows a really dead calendar, and that's not what I want to see."_
 *
 * The rule is a **default that extends, never shortens**: the last five weeks of
 * the leading vacation and the first one of the trailing, each reaching further
 * out if something is out there. These pin all four edges the rule has — nothing
 * in the vacation, something exactly at the default boundary, something beyond
 * it, and a vacation shorter than the default — because a rule with a
 * `Math.max` in it fails at exactly those places or nowhere.
 */
describe("the year's two Long Vacations are trimmed to where events are", () => {
  const leading = (column: AcademicYearColumn) =>
    column.segments.find((segment) => segment.jumpLabel === "Long Vacation 2026")!;
  const trailing = (column: AcademicYearColumn) =>
    column.segments.find((segment) => segment.jumpLabel === "Long Vacation 2027")!;

  it("draws five leading and five trailing weeks when nothing is out there", () => {
    const column = year();

    expect(LEADING_VACATION_WEEKS).toBe(5);
    expect(TRAILING_VACATION_WEEKS).toBe(5);
    expect(leading(column).weeks).toHaveLength(LEADING_VACATION_WEEKS);
    expect(trailing(column).weeks).toHaveLength(TRAILING_VACATION_WEEKS);
  });

  it("draws both ends from one season's own three terms, with no year before it", () => {
    // The production case, LAN-368: the production baseline seeds a season
    // and its three terms and nothing else. Before this the leading vacation was
    // built only when a previous year's term existed, so every pre-season date
    // fell off the calendar until Michaelmas began.
    const column = buildAcademicYear("2026-27", BASELINE_TERMS, []);

    expect(leading(column).weeks).toHaveLength(LEADING_VACATION_WEEKS);
    expect(trailing(column).weeks).toHaveLength(TRAILING_VACATION_WEEKS);
    expect(leading(column).weeks[leading(column).weeks.length - 1].endsOn).toBe("2026-09-26");
  });

  it("is unchanged by a previous year's term being present or absent", () => {
    const withPreviousYear = rows(buildAcademicYear("2026-27", TERMS, []));
    const baselineOnly = rows(buildAcademicYear("2026-27", BASELINE_TERMS, []));

    expect(baselineOnly).toEqual(withPreviousYear);
  });

  it("puts a September pre-season event in the leading vacation on the baseline shape", () => {
    const trial = event({ scheduledOn: "2026-09-16", name: "Pre-season trial" });
    const column = buildAcademicYear("2026-27", BASELINE_TERMS, [trial]);

    expect(column.placedCount).toBe(1);
    expect(column.outsideTheYear).toEqual([]);
    expect(yearCoordinateOf(column, "2026-09-16")).toMatchObject({
      segmentName: "Long Vacation",
      week: -2,
    });
  });

  it("keeps the LAST weeks of the leading vacation, up against Michaelmas", () => {
    // Trimming the wrong end would draw five dead weeks and hide the ones next
    // to term, which is the whole complaint inverted.
    const column = year();
    const weeks = leading(column).weeks;

    expect(weeks[weeks.length - 1].endsOn).toBe("2026-09-26");
    const michaelmas = column.segments.find((segment) => segment.name === "michaelmas")!;
    expect(michaelmas.startsOn).toBe("2026-09-27");
  });

  it("keeps the FIRST weeks of the trailing vacation, straight after Trinity", () => {
    const column = year();
    const weeks = trailing(column).weeks;

    expect(weeks[0].startsOn).toBe("2027-06-20");
  });

  it("counts the leading vacation down to −1 at the first term", () => {
    // Brian, 2026-09-16 (LAN-368): the leading vacation reads as counting down
    // to the first term, not as starting there, so it is numbered back from
    // −1 at the row that meets Michaelmas, however far the segment reaches —
    // never forward from its own first drawn row.
    const weeks = leading(year()).weeks;

    expect(weeks.map((week) => week.week)).toEqual([-5, -4, -3, -2, -1]);
    expect(weeks[weeks.length - 1].label).toBe("Long Vacation −1");
    expect(weeks[0].startsOn).toBe("2026-08-23");
  });

  it("still draws exactly five when an event sits on the default boundary", () => {
    // The fifth week from the end. One row further out and the answer changes;
    // this is the case that stays put.
    const boundary = leading(year()).weeks[0];
    const column = year([event({ scheduledOn: boundary.startsOn, name: "On the boundary" })]);

    expect(leading(column).weeks).toHaveLength(LEADING_VACATION_WEEKS);
    expect(leading(column).weeks[0].startsOn).toBe(boundary.startsOn);
  });

  it("extends the leading vacation to reach an event further back", () => {
    // Brian's own example: an event seven weeks before term draws seven weeks.
    // Seven weeks before Michaelmas starts, i.e. the seventh row from the end of
    // a vacation the column cuts to five when it is empty.
    const seventhFromEnd = "2026-08-09";
    const column = year([event({ scheduledOn: seventhFromEnd, name: "Pre-season camp" })]);

    expect(leading(year()).weeks).toHaveLength(LEADING_VACATION_WEEKS);
    expect(leading(column).weeks).toHaveLength(7);
    expect(leading(column).weeks[0].startsOn).toBe(seventhFromEnd);
    // Drawn continuously from the row that holds the event to the term, counted
    // down so the row against the term is still −1.
    expect(leading(column).weeks.map((week) => week.week)).toEqual([-7, -6, -5, -4, -3, -2, -1]);
    expect(column.outsideTheYear).toEqual([]);
    expect(column.placedCount).toBe(1);
  });

  it("extends the trailing vacation to reach a later event beyond the default", () => {
    // Eight weeks after Trinity: the trailing vacation runs to week 8, and the
    // five-week floor is what an event inside the default cannot shorten.
    const column = year([event({ scheduledOn: "2027-08-10", name: "Summer tour" })]);
    const weeks = trailing(column).weeks;

    expect(weeks.map((week) => week.week)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(weeks[weeks.length - 1].endsOn >= "2027-08-10").toBe(true);
    expect(column.outsideTheYear).toEqual([]);

    const inside = year([event({ scheduledOn: "2027-07-06", name: "Tour launch" })]);
    expect(trailing(inside).weeks.map((week) => week.week)).toEqual([1, 2, 3, 4, 5]);
  });

  it("reaches an event eight weeks before Michaelmas, continuously", () => {
    // The leading half of the same rule: eight whole weeks, nothing skipped.
    const eighthFromEnd = "2026-08-02";
    const column = year([event({ scheduledOn: eighthFromEnd, name: "Trials" })]);
    const weeks = leading(column).weeks;

    expect(weeks).toHaveLength(8);
    expect(weeks[0].startsOn).toBe(eighthFromEnd);
    expect(weeks[weeks.length - 1].endsOn).toBe("2026-09-26");
    for (let index = 1; index < weeks.length; index += 1) {
      expect(weeks[index].startsOn).toBe(
        new Date(new Date(`${weeks[index - 1].endsOn}T00:00:00Z`).getTime() + 86_400_000)
          .toISOString()
          .slice(0, 10),
      );
    }
  });

  it("leaves the terms alone — an empty term week is the term card", () => {
    const column = year();

    for (const segment of column.segments) {
      if (segment.kind !== "term") continue;
      const term = TERMS.find((candidate) => candidate.id === segment.termId)!;
      expect(segment.weeks, segment.name).toHaveLength(term.lastWeek - term.firstWeek + 1);
    }
  });

  it("leaves Christmas and Easter alone — they are neither end of the year", () => {
    // No rule of their own, and none needed: the trim reaches only the vacation
    // before the first term and the one after the last.
    const column = year();

    expect(
      column.segments.find((segment) => segment.name === "Christmas Vacation")!.weeks,
    ).toHaveLength(5);
    expect(
      column.segments.find((segment) => segment.name === "Easter Vacation")!.weeks,
    ).toHaveLength(5);
  });

  it("loses no event to the trim, at either end", () => {
    // The property that matters more than any single count: whatever is trimmed
    // away held nothing.
    const events = [
      event({ scheduledOn: "2026-08-09", name: "Early" }),
      event({ scheduledOn: "2026-09-22", name: "Just before term" }),
      event({ scheduledOn: "2027-07-06", name: "Late" }),
    ];
    const column = year(events);

    expect(column.placedCount).toBe(events.length);
    expect(column.outsideTheYear).toEqual([]);
    expect(column.undated).toEqual([]);
  });
});
