/**
 * The roster CSV's pure shape checks. LAN-215, `WP-arrival-doors`, `W1`.
 *
 * Mirrors `./event-csv.test.ts`'s own posture: this module decides what a
 * row's shape means before anybody asks the database anything, and the tests
 * that matter most are the ones proving it lets through what the club's real
 * files actually contain.
 */
import { describe, expect, it } from "vitest";

import {
  IMPORT_TOO_LARGE_MESSAGE,
  MAX_IMPORT_BYTES,
  importTemplateCsv,
  readRosterImport,
  refuseOversizedRosterFile,
} from "./roster-csv";

const HEADER = "first_name,last_name,mobile,personal_email,college,matriculation_year";

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

describe("importTemplateCsv", () => {
  it("is the header row and nothing else", () => {
    expect(importTemplateCsv()).toBe(HEADER + "\r\n");
  });
});

describe("readRosterImport — the header", () => {
  it("refuses a file with no header this importer recognises", () => {
    const result = readRosterImport({ csvText: "a,b,c\r\n1,2,3\r\n" });
    expect(result.ok).toBe(false);
  });

  it("refuses a header missing a required column", () => {
    const result = readRosterImport({
      csvText: "first_name,mobile\r\nRosalind,07700 900312\r\n",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("last_name");
  });

  it("accepts a header missing only an optional column", () => {
    const result = readRosterImport({
      csvText: "first_name,last_name,mobile\r\nRosalind,Penhaligon,07700 900312\r\n",
    });
    expect(result.ok).toBe(true);
  });

  it("is tolerant of case, spaces and hyphens in the header", () => {
    const result = readRosterImport({
      csvText:
        "First Name,Last-Name,Mobile,Personal Email,College,Matriculation Year\r\n" +
        "Rosalind,Penhaligon,07700 900312,,,\r\n",
    });
    expect(result.ok).toBe(true);
  });
});

describe("readRosterImport — one row's shape", () => {
  it("reads a fully populated row cleanly", () => {
    const result = readRosterImport({
      csvText: csv("Rosalind,Penhaligon,07700 900312,rp@example.ac.uk,Brasenose,2024"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = result.read.rows;
    expect(row.reasons).toEqual([]);
    expect(row.firstName).toBe("Rosalind");
    expect(row.lastName).toBe("Penhaligon");
    expect(row.mobile).toBe("07700 900312");
    expect(row.personalEmail).toBe("rp@example.ac.uk");
    expect(row.college).toBe("Brasenose");
    expect(row.matriculationYear).toBe(2024);
  });

  it("leaves the three optional columns null when blank", () => {
    const result = readRosterImport({ csvText: csv("Tobias,Wrenfield,07700 900184,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [row] = result.read.rows;
    expect(row.reasons).toEqual([]);
    expect(row.personalEmail).toBeNull();
    expect(row.college).toBeNull();
    expect(row.matriculationYear).toBeNull();
  });

  it("refuses a row with no first name", () => {
    const result = readRosterImport({ csvText: csv(",Wrenfield,07700 900184,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("first_name");
  });

  it("refuses a row with no last name", () => {
    const result = readRosterImport({ csvText: csv("Tobias,,07700 900184,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("last_name");
  });

  it("refuses a row with no mobile — a welcome that cannot be delivered is a person who never hears from the club", () => {
    const result = readRosterImport({ csvText: csv("Tobias,Wrenfield,,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("mobile");
  });

  it("refuses a mobile that does not look like a phone number", () => {
    const result = readRosterImport({ csvText: csv("Tobias,Wrenfield,call the clubhouse,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("mobile");
  });

  it("accepts every phone format the club actually writes", () => {
    for (const mobile of ["07700 900312", "+44 7700 900312", "(07700) 900312", "0770 900312"]) {
      const result = readRosterImport({ csvText: csv(`Rosalind,Penhaligon,${mobile},,,`) });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.read.rows[0].reasons).toEqual([]);
    }
  });

  it("refuses an email that does not look like one", () => {
    const result = readRosterImport({
      csvText: csv("Rosalind,Penhaligon,07700 900312,not-an-email,,"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("personal_email");
  });

  it("refuses a matriculation year that is not a four-digit year", () => {
    const result = readRosterImport({
      csvText: csv("Rosalind,Penhaligon,07700 900312,,,24"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("matriculation_year");
  });

  it("carries every raw cell on a refused row, so the operator can see what they typed", () => {
    const result = readRosterImport({ csvText: csv(",Wrenfield,call the clubhouse,,,") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].rawCells.last_name).toBe("Wrenfield");
    expect(result.read.rows[0].rawCells.mobile).toBe("call the clubhouse");
  });
});

describe("readRosterImport — two rows, one person", () => {
  it("refuses the second of two rows carrying the same first name, last name and mobile", () => {
    const result = readRosterImport({
      csvText: csv(
        "Beatrix,Ashgrove,07700 900450,ba@example.ac.uk,St Anne's,2025",
        "Beatrix,Ashgrove,07700 900450,different@example.ac.uk,,",
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons).toEqual([]);
    expect(result.read.rows[1].reasons.join(" ")).toContain(
      "Line 2 in this file is the same person",
    );
  });

  it("does not refuse two different people with the same first name", () => {
    const result = readRosterImport({
      csvText: csv("Beatrix,Ashgrove,07700 900450,,,", "Beatrix,Marchetti,07700 900771,,,"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons).toEqual([]);
    expect(result.read.rows[1].reasons).toEqual([]);
  });

  it("compares phones on their last nine digits, matching roster.ts's own duplicate rule", () => {
    const result = readRosterImport({
      csvText: csv("Beatrix,Ashgrove,+44 7700 900450,,,", "Beatrix,Ashgrove,07700 900450,,,"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[1].reasons.join(" ")).toContain("is the same person");
  });
});

describe("readRosterImport — never a silent partial success", () => {
  it("one malformed row is refused while every other row still reads clean", () => {
    const result = readRosterImport({
      csvText: csv(
        "Rosalind,Penhaligon,07700 900312,,,",
        ",Wrenfield,07700 900184,,,",
        "Isolde,Marchetti,07700 900771,,,",
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows.map((row) => row.reasons.length > 0)).toEqual([false, true, false]);
  });

  it("counts a blank line as no row at all, not a refusal", () => {
    const result = readRosterImport({
      csvText:
        HEADER +
        "\r\nRosalind,Penhaligon,07700 900312,,,\r\n\r\nIsolde,Marchetti,07700 900771,,,\r\n",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows).toHaveLength(2);
    // Line numbers count the header as line 1 and every line after it,
    // blanks included, so the operator's spreadsheet and this screen agree.
    expect(result.read.rows.map((row) => row.line)).toEqual([2, 4]);
  });
});

describe("size and row limits", () => {
  it("refuses a file larger than the byte limit before any row is read", () => {
    const oversized = "x".repeat(MAX_IMPORT_BYTES + 1);
    expect(refuseOversizedRosterFile(oversized)).toBe(IMPORT_TOO_LARGE_MESSAGE);
  });

  it("accepts a file at or under the limit", () => {
    expect(refuseOversizedRosterFile(csv("Rosalind,Penhaligon,07700 900312,,,"))).toBeNull();
  });

  it("refuses a header row with nobody under it", () => {
    const result = readRosterImport({ csvText: HEADER + "\r\n" });
    expect(result.ok).toBe(false);
  });
});
