/**
 * How the calendars read — LAN-114, matrix rows 1 to 3 and 17.
 *
 * The interesting assertions here are the ones about text this repository
 * decided rather than delegated. `en-GB` with `month: "short"` renders
 * September as "Sept" on some ICU builds and "Sep" on others, which was found
 * on this branch when the term card's −1st week row read "27 Sept – 3 Oct" on
 * one machine and would have read "27 Sep – 3 Oct" on another. A term card
 * exists to state exact dates, so the abbreviation is now a constant in
 * `../presentation.ts` and these tests are what stop it drifting back.
 */
import { describe, expect, it } from "vitest";

import type { TermWindow } from "@/lib/services/event-input";
import { formatShortDate, shortMonthOf, SHORT_MONTHS } from "../presentation";
import {
  formatCellDate,
  formatMonthLabel,
  formatOxfordWeek,
  formatTermName,
  formatWeekRange,
} from "./presentation";

const MICHAELMAS: TermWindow = {
  id: "term-mt-2026",
  name: "michaelmas",
  academicYear: "2026-27",
  startsOn: "2026-09-27",
  endsOn: "2026-12-05",
  firstWeek: -1,
  lastWeek: 8,
};

describe("month abbreviations", () => {
  it("names all twelve months, with September as Sep", () => {
    expect(SHORT_MONTHS).toHaveLength(12);
    expect(shortMonthOf("2026-09-27")).toBe("Sep");
    expect(shortMonthOf("2026-01-01")).toBe("Jan");
    expect(shortMonthOf("2026-12-05")).toBe("Dec");
  });

  it("does not depend on the runtime's ICU data", () => {
    // The regression guard. If this ever becomes `Intl` again, one CI runner
    // renders "Sept" and the deployed container renders "Sep".
    const viaIntl = new Intl.DateTimeFormat("en-GB", {
      month: "short",
      timeZone: "UTC",
    }).format(new Date("2026-09-27T00:00:00Z"));
    expect(shortMonthOf("2026-09-27")).toBe("Sep");
    expect(["Sep", "Sept"]).toContain(viaIntl);
  });

  it("reaches the list's date column too, so the two agree", () => {
    expect(formatShortDate("2026-09-27")).toBe("Sun 27 Sep 2026");
    expect(formatCellDate("2026-09-27")).toBe("Sun 27 Sep 2026");
  });
});

describe("formatWeekRange", () => {
  it("states a week inside one month once", () => {
    expect(formatWeekRange("2026-10-11", "2026-10-17")).toBe("11 – 17 Oct 2026");
  });

  it("repeats the month when the week crosses one", () => {
    // Michaelmas −1st week, and Trinity 1st week, both from the sources.
    expect(formatWeekRange("2026-09-27", "2026-10-03")).toBe("27 Sep – 3 Oct 2026");
    expect(formatWeekRange("2027-04-25", "2027-05-01")).toBe("25 Apr – 1 May 2027");
  });

  it("repeats the year when the week crosses one", () => {
    expect(formatWeekRange("2026-12-27", "2027-01-02")).toBe("27 Dec 2026 – 2 Jan 2027");
  });
});

describe("formatOxfordWeek", () => {
  it("uses the row labels the club's term cards use", () => {
    expect(formatOxfordWeek(-1)).toBe("−1st week");
    expect(formatOxfordWeek(0)).toBe("0th week");
    expect(formatOxfordWeek(1)).toBe("1st week");
    expect(formatOxfordWeek(2)).toBe("2nd week");
    expect(formatOxfordWeek(3)).toBe("3rd week");
    expect(formatOxfordWeek(8)).toBe("8th week");
  });
});

describe("naming a term and a month", () => {
  it("names a term as the club does, from its configuration", () => {
    expect(formatTermName(MICHAELMAS)).toBe("Michaelmas 2026-27");
  });

  it("names a month in full", () => {
    expect(formatMonthLabel("2026-10")).toBe("October 2026");
    expect(formatMonthLabel("2027-01")).toBe("January 2027");
  });
});
