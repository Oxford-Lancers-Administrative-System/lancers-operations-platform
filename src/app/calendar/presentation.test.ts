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
import { formatShortDate, shortMonthOf, SHORT_MONTHS } from "@/lib/services/event-vocabulary";
import { TEMPLATE_COLOUR_PALETTE } from "@/lib/services/event-template-input";
import {
  formatCellDate,
  formatMonthLabel,
  formatTermName,
  formatWeekRange,
  templateColour,
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

/*
 * `formatOxfordWeek` and `formatWeekLabel` moved to
 * `@/lib/services/oxford-year`, which owns the whole year's week vocabulary now
 * — a vacation row's label is not an Oxford week and could not be formatted
 * here. `src/lib/services/oxford-year.test.ts` asserts the same ordinals.
 */

describe("colour by template — LAN-276 correction round 1", () => {
  it("offers more than the seven seeded templates a colour of their own", () => {
    // Eight to twelve, so an operator's templates have real choices beyond the
    // seven the migration seeds — not one colour reused for everything new.
    expect(TEMPLATE_COLOUR_PALETTE.length).toBeGreaterThanOrEqual(8);
    expect(TEMPLATE_COLOUR_PALETTE.length).toBeLessThanOrEqual(12);
  });

  it("keeps the colours distinguishable from one another", () => {
    const accents = TEMPLATE_COLOUR_PALETTE.map((colour) => colour.accent);
    expect(new Set(accents).size).toBe(accents.length);

    const tints = TEMPLATE_COLOUR_PALETTE.map((colour) => colour.tint);
    expect(new Set(tints).size).toBe(tints.length);

    const keys = TEMPLATE_COLOUR_PALETTE.map((colour) => colour.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("resolves a stored key to its own swatch, and falls back rather than throwing", () => {
    expect(templateColour("blue")).toBe(TEMPLATE_COLOUR_PALETTE[0]);
    // Not reachable through the editor or the check constraint, but a defence
    // against a row this module's palette no longer names — re-tuning the
    // palette must never make a calendar throw.
    const fallback = templateColour("a_key_nobody_has_defined");
    expect(fallback).toBe(TEMPLATE_COLOUR_PALETTE[0]);
  });

  it("keeps every tint light enough for dark text to sit on it", () => {
    // Relative luminance, sRGB. A tile prints `text.primary` on the tint, so a
    // tint that drifted dark would fail contrast without anybody noticing.
    for (const colour of TEMPLATE_COLOUR_PALETTE) {
      expect(luminance(colour.tint), `${colour.key} tint is too dark`).toBeGreaterThan(0.75);
      expect(luminance(colour.accent), `${colour.key} accent is too light`).toBeLessThan(0.4);
    }
  });
});

function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

describe("naming a term and a month", () => {
  it("names a term as the club does, from its configuration", () => {
    expect(formatTermName(MICHAELMAS)).toBe("Michaelmas 2026-27");
  });

  it("names a month in full", () => {
    expect(formatMonthLabel("2026-10")).toBe("October 2026");
    expect(formatMonthLabel("2027-01")).toBe("January 2027");
  });
});
