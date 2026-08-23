// @vitest-environment node
/**
 * Turning the club's workbooks into records — LAN-124.
 *
 * Everything here was written against the two real files and then pinned with
 * workbooks built in memory, because the real ones carry forty-two students'
 * names and cannot be committed. Against the club's actual spreadsheets this
 * code reads 42 players (11 of them with single-token names), 43 Michaelmas
 * events dated 30 September to 2 December 2026, normalises 7 drifted times, and
 * flags 12 entries tentative.
 *
 * The cases below are the ones where the club's file is awkward, because those
 * are the ones a rewrite would get wrong.
 */
import { describe, expect, it } from "vitest";

import { workbook } from "./helpers/xlsx-builder.mjs";
import { readWorkbook } from "../scripts/production/showcase/workbook.mjs";
import {
  classifyEvent,
  extractTimes,
  isTentative,
  normaliseDriftedTime,
  parseWeekLabel,
  readRoster,
  readTermCard,
  splitName,
} from "../scripts/production/showcase/sources.mjs";

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";

let directory: string;
let serial = 0;

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), "lancers-sources-"));
});
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

function open(buffer: Buffer) {
  serial += 1;
  const file = path.join(directory, `book-${serial}.xlsx`);
  writeFileSync(file, buffer);
  return readWorkbook(file);
}

/** An inline-string cell body, which keeps these fixtures readable. */
const text = (value: string) =>
  `t="inlineStr"><is><t>${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`;

describe("splitName", () => {
  it("takes the last token as the family name", () => {
    expect(splitName("Alex Smith")).toEqual({ givenName: "Alex", familyName: "Smith" });
    expect(splitName("Mary Jane Watson")).toEqual({
      givenName: "Mary Jane",
      familyName: "Watson",
    });
  });

  it("leaves a single-token name without a family name", () => {
    // Eleven of the club's forty-two entries are one word. The schema permits
    // it and the synthetic seed already models it; inventing a family name
    // would be worse than having none.
    expect(splitName("Zephyr")).toEqual({ givenName: "Zephyr", familyName: null });
  });

  it("collapses the whitespace a spreadsheet leaves behind", () => {
    expect(splitName("  Alex   Smith  ")).toEqual({ givenName: "Alex", familyName: "Smith" });
  });
});

describe("parseWeekLabel", () => {
  it("reads an ordinary label", () => {
    const { week, starts } = parseWeekLabel("1st (11th-17th Oct)", 2026);
    expect(week).toBe(1);
    expect(starts.toISOString().slice(0, 10)).toBe("2026-10-11");
  });

  it("reads week -1, which the club's file wraps in literal quotes", () => {
    const { week, starts } = parseWeekLabel('"-1 (27th Sep-3rd Oct)"', 2026);
    expect(week).toBe(-1);
    expect(starts.toISOString().slice(0, 10)).toBe("2026-09-27");
  });

  it("tolerates the ordinal typo in the club's own file", () => {
    // "2nd (18th-24st Oct)" — 24st. A parser demanding the right suffix would
    // refuse a week that is perfectly readable.
    expect(parseWeekLabel("2nd (18th-24st Oct)", 2026).starts.toISOString().slice(0, 10)).toBe(
      "2026-10-18",
    );
  });

  it("infers a missing start month from the end, across a boundary", () => {
    // "8th (29th-5th Dec)" is 29 November to 5 December. 29 cannot precede 5
    // within one month, which is the whole of the inference.
    const { starts } = parseWeekLabel("8th (29th-5th Dec)", 2026);
    expect(starts.toISOString().slice(0, 10)).toBe("2026-11-29");
  });

  it("keeps the end's month when the start does not cross one", () => {
    const { starts } = parseWeekLabel("4th (1st-7th Nov)", 2026);
    expect(starts.toISOString().slice(0, 10)).toBe("2026-11-01");
  });

  it("refuses a week that does not start on a Sunday", () => {
    // The strongest check in this file. A wrong year silently shifts every
    // event by a day or two, and every date would still look plausible.
    expect(() => parseWeekLabel("1st (11th-17th Oct)", 2025)).toThrow(/not a Sunday/i);
  });

  it("refuses a label it cannot read rather than guessing", () => {
    expect(() => parseWeekLabel("sometime in October", 2026)).toThrow();
    expect(() => parseWeekLabel("1st (11th-17th Smarch)", 2026)).toThrow(/month/i);
  });
});

describe("extractTimes", () => {
  it("reads a range", () => {
    expect(extractTimes("Team Practice, Iffley Road, 20:00-22:30")).toMatchObject({
      startsAt: "20:00",
      endsAt: "22:30",
    });
  });

  it("reads a single start time", () => {
    expect(extractTimes("Rookie Curry, Vincent's Club, 19:00")).toMatchObject({
      startsAt: "19:00",
      endsAt: null,
    });
  });

  it("finds a time with no comma in front of it", () => {
    // "Team S&C Session, Blues Gym, Iffley Road 20:30-21:30" — the club's file
    // omits the separator here, so splitting on commas first would put the time
    // inside the venue.
    const { startsAt, endsAt, remainder } = extractTimes(
      "Team S&C Session, Blues Gym, Iffley Road 20:30-21:30",
    );
    expect({ startsAt, endsAt }).toEqual({ startsAt: "20:30", endsAt: "21:30" });
    expect(remainder).not.toMatch(/\d{2}:\d{2}/);
  });

  it("reports no time when there is none", () => {
    expect(extractTimes("Lancers vs TBD, TBD, TBD")).toMatchObject({
      startsAt: null,
      endsAt: null,
    });
  });

  it("pads a single-digit hour", () => {
    expect(extractTimes("Camp, Parks, 9:00-12:00").startsAt).toBe("09:00");
  });
});

describe("normaliseDriftedTime", () => {
  it("pulls the fill-series drift back to the half hour", () => {
    // The real values, straight down the Wednesday column of the club's sheet.
    for (const drifted of ["22:31", "22:32", "22:33", "22:34", "22:35", "22:36", "22:37"]) {
      const { time, note } = normaliseDriftedTime(drifted);
      expect(time, drifted).toBe("22:30");
      expect(note, drifted).toMatch(/fill series/i);
    }
  });

  it("leaves a time that is already round alone, and says nothing about it", () => {
    for (const exact of ["22:30", "20:00", "18:00", "09:00"]) {
      expect(normaliseDriftedTime(exact)).toEqual({ time: exact, note: null });
    }
  });

  it("leaves a genuinely different time alone", () => {
    // 22:20 is exactly ten minutes out and 22:45 fifteen. The boundary is
    // exclusive, so both are read as somebody's decision rather than Excel's
    // arithmetic — which is what keeps the rule defensible. An inclusive
    // comparison moved 22:20 to 22:30, and this case is why that was caught.
    expect(normaliseDriftedTime("22:45").time).toBe("22:45");
    expect(normaliseDriftedTime("22:20").time).toBe("22:20");
    expect(normaliseDriftedTime("22:45").note).toBeNull();
  });

  it("carries into the next hour rather than producing :60", () => {
    expect(normaliseDriftedTime("21:56").time).toBe("22:00");
    expect(normaliseDriftedTime("23:57").time).toBe("00:00");
  });

  it("passes a missing time through", () => {
    expect(normaliseDriftedTime(null)).toEqual({ time: null, note: null });
  });
});

describe("classifyEvent", () => {
  it.each([
    ["Team Practice", "practice"],
    ["Team Chalk", "chalk"],
    ["Team S&C Session", "strength_and_conditioning"],
    // D12's seven types: a camp is a practice that runs for longer, and a
    // fixture is a game.
    ["OULAFC Camp", "practice"],
    ["Lancers vs TBD", "game"],
    ["Varsity Match", "game"],
    ["Freshers' Fair", "recruitment"],
    ["Rookie Curry", "social"],
    ["Jersey Night", "social"],
    ["Thanksgiving Dinner", "social"],
  ])("classifies %s as %s", (name, expected) => {
    expect(classifyEvent(name).eventType).toBe(expected);
  });

  it("resolves an entry matching two rules by the documented order", () => {
    // "Rookie Taster + Team Practice" is both. The taster is why it exists, so
    // recruitment wins — and the rule that decided is recorded either way.
    expect(classifyEvent("Rookie Taster + Team Practice").eventType).toBe("recruitment");
    expect(classifyEvent("Flag Football + Taster session").eventType).toBe("recruitment");
    expect(classifyEvent("First Practice + Taster session").eventType).toBe("recruitment");
  });

  it("records which rule matched, so a classification can be argued with", () => {
    expect(classifyEvent("Team Chalk").matchedRule).toContain("chalk");
  });

  it("falls back to meeting rather than inventing a type", () => {
    // `other` left the enum with LAN-151, and an unclassified entry lands where
    // the migration sent every existing `other`-typed row: on `meeting`. The
    // manifest still records that no rule matched, so a human can move it.
    expect(classifyEvent("Something nobody anticipated")).toEqual({
      eventType: "meeting",
      matchedRule: "no rule matched",
    });
  });
});

describe("isTentative", () => {
  it("flags anything the source calls TBD", () => {
    expect(isTentative("Lancers vs TBD, TBD, TBD", null)).toBe(true);
    expect(isTentative("Team S&C Session, Blues Gym, TBD", "19:00")).toBe(true);
  });

  it("flags an entry with no time at all", () => {
    expect(isTentative("Team Practice, Iffley Road", null)).toBe(true);
  });

  it("leaves a concrete entry alone", () => {
    expect(isTentative("Team Practice, Iffley Road Astro", "20:00")).toBe(false);
  });
});

describe("readRoster", () => {
  const sheet = (rows: [string, string][][]) => open(workbook({ "Players Databank": rows.flat() }));

  it("reads names, kit and positions, and records where each came from", () => {
    const book = sheet([
      [
        ["A1", text("Name")],
        ["E1", text("Kitted")],
      ],
      [
        ["A3", text("Alex Smith")],
        ["E3", text("Yes")],
        ["I3", text("WR")],
        ["J3", text("CB")],
      ],
    ]);

    const [player] = readRoster(book);
    expect(player).toMatchObject({
      givenName: "Alex",
      familyName: "Smith",
      kitIssued: true,
      offencePosition: "WR",
      defencePosition: "CB",
    });
    expect(player.source).toMatchObject({ nameCell: "A3", offenceCell: "I3" });
  });

  it("distinguishes 'not kitted' from 'not recorded'", () => {
    // Three of the club's forty-two have a blank here, and blank is not "No".
    const book = sheet([
      [["A1", text("Name")]],
      [
        ["A3", text("No Kit")],
        ["E3", text("No")],
      ],
      [["A4", text("Unknown Kit")]],
    ]);

    const players = readRoster(book);
    expect(players[0].kitIssued).toBe(false);
    expect(players[1].kitIssued).toBeNull();
  });

  it("treats the literal 'None' position as no position", () => {
    const book = sheet([
      [["A1", text("Name")]],
      [
        ["A3", text("Alex Smith")],
        ["I3", text("None")],
      ],
    ]);
    expect(readRoster(book)[0].offencePosition).toBeNull();
  });

  it("refuses when column A is not the name column", () => {
    // The one check that stops a moved column importing phone numbers as names.
    const book = sheet([[["A1", text("Phone Number")]], [["A3", text("07700900123")]]]);
    expect(() => readRoster(book)).toThrow(/not "Name"/);
  });

  it("refuses a duplicated name rather than silently merging two people", () => {
    // The identifier is derived from the name, so two rows would become one row
    // and nobody would know. Refusing is the only safe answer.
    const book = sheet([
      [["A1", text("Name")]],
      [["A3", text("Alex Smith")]],
      [["A9", text("alex  smith")]],
    ]);
    expect(() => readRoster(book)).toThrow(/twice, at A3 and A9/);
  });

  it("gives every player a distinct deterministic identifier", () => {
    const book = sheet([
      [["A1", text("Name")]],
      [["A3", text("Alex Smith")]],
      [["A4", text("Sam Jones")]],
      [["A5", text("Zephyr")]],
    ]);
    const players = readRoster(book);
    expect(new Set(players.map((p: { personId: string }) => p.personId)).size).toBe(3);
    expect(readRoster(book)[0].personId).toBe(players[0].personId);
  });

  it("says which sheets it did find when the expected one is absent", () => {
    expect(() => readRoster(open(workbook({ Wrong: [["A1", text("x")]] })))).toThrow(/Wrong/);
  });
});

describe("readTermCard", () => {
  const card = (rows: [string, string][]) => open(workbook({ MT26: rows }));

  it("places an entry on the weekday of the column it sits in", () => {
    const book = card(
      [
        [
          ["B4", text("Week")],
          ["C4", text("Sun")],
        ],
        [
          ["B7", text("1st (11th-17th Oct)")],
          ["C7", text("Sunday thing, Parks, 10:00-13:00")],
          ["H7", text("Wednesday thing, Iffley, 20:00-22:30")],
        ],
      ].flat() as [string, string][],
    );

    const entries = readTermCard(book, { year: 2026, sheetName: "MT26" });
    const cell = (address: string) =>
      entries.find((entry: { source: { cell: string } }) => entry.source.cell === address);

    // Asserted present before being read: a `find` that missed would otherwise
    // fail on a property access rather than saying the entry is absent.
    expect(cell("C7"), "no entry read from C7").toBeDefined();
    expect(cell("H7"), "no entry read from H7").toBeDefined();

    expect(cell("C7")?.scheduledOn).toBe("2026-10-11");
    expect(cell("H7")?.scheduledOn).toBe("2026-10-14");
  });

  it("reads a day's second column as the same day", () => {
    // The club's Sunday is columns C and D, and week 3 uses both for a camp
    // running morning and afternoon.
    const book = card([
      ["B9", text("3rd (25th-31st Oct)")],
      ["C9", text("OULAFC Camp, University Parks, 10:00-12:00")],
      ["D9", text("OULAFC Camp, University Parks, 13:00-15:30")],
    ]);

    const entries = readTermCard(book, { year: 2026, sheetName: "MT26" });
    expect(entries.map((e: { scheduledOn: string }) => e.scheduledOn)).toEqual([
      "2026-10-25",
      "2026-10-25",
    ]);
    expect(entries[0].eventId).not.toBe(entries[1].eventId);
  });

  it("carries the raw text and the normalisation note into the record", () => {
    const book = card([
      ["B14", text("8th (29th-5th Dec)")],
      ["H14", text("Team Practice, Iffley Road Astro, 20:00-22:37")],
    ]);

    const [entry] = readTermCard(book, { year: 2026, sheetName: "MT26" });
    expect(entry.endsAt).toBe("22:30");
    expect(entry.source.raw).toContain("22:37");
    expect(entry.source.normalisation).toHaveLength(1);
    expect(entry.source.normalisation[0]).toMatch(/22:37.*22:30/);
  });

  it("marks a TBD game tentative and keeps its venue null", () => {
    const book = card([
      ["B11", text("5th (8th-14th Nov)")],
      ["C11", text("Lancers vs TBD, TBD, TBD")],
    ]);

    const [entry] = readTermCard(book, { year: 2026, sheetName: "MT26" });
    expect(entry).toMatchObject({
      name: "Lancers vs TBD",
      eventType: "game",
      tentative: true,
      venue: null,
      startsAt: null,
    });
  });

  it("gives each cell a stable identifier that does not move with its content", () => {
    // Keyed on the cell, so correcting an event's wording in the spreadsheet
    // updates the row rather than creating a second one.
    const first = readTermCard(
      card([
        ["B7", text("1st (11th-17th Oct)")],
        ["C7", text("Team Practice, Parks, 10:00-13:00")],
      ]),
      { year: 2026, sheetName: "MT26" },
    );
    const second = readTermCard(
      card([
        ["B7", text("1st (11th-17th Oct)")],
        ["C7", text("Team Practice, University Parks, 10:00-13:00")],
      ]),
      { year: 2026, sheetName: "MT26" },
    );

    expect(second[0].eventId).toBe(first[0].eventId);
    expect(second[0].venue).not.toBe(first[0].venue);
  });
});
