/**
 * The roster CSV's pure shape checks. LAN-215, `WP-arrival-doors`, `W1`;
 * B-007 tightened the mobile check.
 *
 * Mirrors `./event-csv.test.ts`'s own posture: this module decides what a
 * row's shape means before anybody asks the database anything. `mobile` since
 * B-007 is stricter than the rest: a number that cannot become E.164 is
 * refused, on its own row, naming the phone, while the rest of the file still
 * lands — proved below alongside every format that does convert.
 */
import { describe, expect, it } from "vitest";

import {
  IMPORT_TOO_LARGE_MESSAGE,
  MAX_IMPORT_BYTES,
  importTemplateCsv,
  readRosterImport,
  refuseOversizedRosterFile,
  SEASON_FACT_IMPORT_COLUMNS,
} from "./roster-csv";

/**
 * The header these row tests write. Deliberately without `middle_name`: that
 * column is optional (LAN-366) and a file omitting it entirely is both the
 * ordinary case and every club spreadsheet that already exists.
 */
const HEADER = "first_name,last_name,mobile,personal_email,college,matriculation_year";

/** What the downloadable template offers, which does name every column — the person columns, then the optional season-fact ones (LAN-374, LAN-375). */
const TEMPLATE_HEADER = [
  "first_name,middle_name,last_name,mobile,personal_email,college,matriculation_year",
  ...SEASON_FACT_IMPORT_COLUMNS.map((column) => column.name),
].join(",");

function csv(...rows: string[]): string {
  return [HEADER, ...rows].join("\r\n") + "\r\n";
}

describe("importTemplateCsv", () => {
  it("is the header row and nothing else", () => {
    expect(importTemplateCsv()).toBe(TEMPLATE_HEADER + "\r\n");
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

  it("accepts every phone format that converts to a real UK mobile", () => {
    for (const mobile of ["07700 900312", "+44 7700 900312", "(07700) 900312"]) {
      const result = readRosterImport({ csvText: csv(`Rosalind,Penhaligon,${mobile},,,`) });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.read.rows[0].reasons).toEqual([]);
    }
  });

  it("refuses a mobile one digit short, naming the phone, and lands every other row — LAN-215, B-007", () => {
    // The club's real files contain this shape (Source Data Analysis §11.1).
    // Before B-007 this row was accepted; a number that cannot become E.164
    // can never receive the welcome, so it is now refused — but only this
    // row, by its own reason, so the rest of the file still lands.
    const result = readRosterImport({
      csvText: csv("Rosalind,Penhaligon,0770 900312,,,", "Tobias,Wrenfield,07700 900313,,,"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].reasons.join(" ")).toContain("mobile");
    expect(result.read.rows[0].reasons.join(" ")).toContain("0770 900312");
    expect(result.read.rows[0].mobile).toBeNull();
    // The second row is untouched by the first row's refusal.
    expect(result.read.rows[1].reasons).toEqual([]);
    expect(result.read.rows[1].mobile).toBe("07700 900313");
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

describe("the optional season-fact columns — LAN-374, LAN-375, LAN-401", () => {
  it("is absent from a file that names none of them, and never a reason to refuse a row", () => {
    const result = readRosterImport({
      csvText: csv("Rosalind,Penhaligon,07700900001,,Balliol,2024"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.rows[0].seasonFacts).toEqual({});
    expect(result.read.rows[0].reasons).toEqual([]);
  });

  it("reads a cell the file does name, and refuses a value that cell does not allow", () => {
    const header = `${HEADER},st_punt_starting`;
    const good = readRosterImport({
      csvText: [header, "Rosalind,Penhaligon,07700900001,,Balliol,2024,Longsnapper"].join("\r\n"),
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.read.rows[0].seasonFacts).toEqual({ st_punt_starting: "Longsnapper" });
      expect(good.read.rows[0].reasons).toEqual([]);
    }

    const bad = readRosterImport({
      csvText: [header, "Rosalind,Penhaligon,07700900001,,Balliol,2024,Kicker"].join("\r\n"),
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.read.rows[0].seasonFacts).toEqual({});
      expect(bad.read.rows[0].reasons[0]).toContain("st_punt_starting");
    }
  });

  it("reads the warmup small group, and refuses a name that is not one of the eight", () => {
    const header = `${HEADER},warmup_small_group`;
    const good = readRosterImport({
      csvText: [header, "Rosalind,Penhaligon,07700900001,,Balliol,2024,Cavalier"].join("\r\n"),
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.read.rows[0].seasonFacts).toEqual({ warmup_small_group: "Cavalier" });
      expect(good.read.rows[0].reasons).toEqual([]);
    }

    // Blank is blank, not a refusal: the column is optional in every cell.
    const blank = readRosterImport({
      csvText: [header, "Rosalind,Penhaligon,07700900001,,Balliol,2024,"].join("\r\n"),
    });
    expect(blank.ok).toBe(true);
    if (blank.ok) {
      expect(blank.read.rows[0].seasonFacts).toEqual({});
      expect(blank.read.rows[0].reasons).toEqual([]);
    }

    const bad = readRosterImport({
      csvText: [header, "Rosalind,Penhaligon,07700900001,,Balliol,2024,Dragons"].join("\r\n"),
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.read.rows[0].seasonFacts).toEqual({});
      expect(bad.read.rows[0].reasons[0]).toContain("warmup_small_group");
    }
  });

  /**
   * LAN-409 — Braces L and Braces R are the file's first multi-value cells.
   * The separator is a semicolon, because the file's own delimiter is the
   * comma and every brace value carries a hyphen inside it.
   */
  it("reads several braces from one side's cell, and refuses one unknown part of it", () => {
    const header = `${HEADER},kit_braces_left,kit_braces_right`;
    const good = readRosterImport({
      csvText: [
        header,
        'Rosalind,Penhaligon,07700900001,,Balliol,2024,"Ankle - M;Knee - L",Shoulder',
      ].join("\r\n"),
    });
    expect(good.ok).toBe(true);
    if (good.ok) {
      expect(good.read.rows[0].seasonFacts).toEqual({
        kit_braces_left: "Ankle - M;Knee - L",
        kit_braces_right: "Shoulder",
      });
      expect(good.read.rows[0].reasons).toEqual([]);
    }

    // The old single-pick columns are gone: a file naming them names a column
    // this import does not have, which is not a season-fact cell at all.
    const bad = readRosterImport({
      csvText: [
        header,
        'Rosalind,Penhaligon,07700900001,,Balliol,2024,"Ankle - M;Elbow - M",Shoulder',
      ].join("\r\n"),
    });
    expect(bad.ok).toBe(true);
    if (bad.ok) {
      expect(bad.read.rows[0].seasonFacts).toEqual({ kit_braces_right: "Shoulder" });
      expect(bad.read.rows[0].reasons[0]).toContain("Elbow - M");
    }
  });
});
