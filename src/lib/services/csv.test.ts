/**
 * The CSV dialect — LAN-155, matrix rows C1 to C9.
 *
 * Every case here is something a real secretary's spreadsheet produces, and
 * every one of them was a way the importer could have refused a file whose rows
 * are all fine. Nothing in this file needs a database, and nothing in it knows
 * what an event is.
 */
import { describe, expect, it } from "vitest";

import { formatCsv, formatCsvCell, isEmptyCsvRow, parseCsv } from "./csv";

function rowsOf(text: string): readonly (readonly string[])[] {
  const parsed = parseCsv(text);
  if (!parsed.ok) throw new Error(`expected a parse, got: ${parsed.reason}`);
  return parsed.rows;
}

describe("parseCsv", () => {
  it("reads a plain comma-separated file", () => {
    expect(rowsOf("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("strips the byte order mark Excel writes, so the first header is readable", () => {
    // C1. Left in place, the mark becomes part of the first header name, so `id` is not `id` and the whole file is refused
    // for a reason nobody can see on screen.
    expect(rowsOf("\uFEFFid,name\n,Practice\n")[0][0]).toBe("id");
  });

  it("treats CRLF as a record separator", () => {
    expect(rowsOf("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("treats a lone CR as a record separator", () => {
    expect(rowsOf("a,b\r1,2\r")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(rowsOf('venue\n"The Lamb and Flag, St Giles"\n')[1]).toEqual([
      "The Lamb and Flag, St Giles",
    ]);
  });

  it("keeps a newline inside a quoted field", () => {
    expect(rowsOf('description\n"Two lines\nof it"\n')[1]).toEqual(["Two lines\nof it"]);
  });

  it("reads a doubled quote inside a quoted field as one quote", () => {
    expect(rowsOf('name\n"He said ""go"""\n')[1]).toEqual(['He said "go"']);
  });

  it("keeps a quote that opens no field", () => {
    // A spreadsheet that wrote `5" nails` without quoting the field meant a
    // literal quotation mark, and refusing the row would refuse the truth.
    expect(rowsOf('equipment\n5" nails\n')[1]).toEqual(['5" nails']);
  });

  it("returns a ragged row rather than refusing it", () => {
    // A spreadsheet drops its trailing empty columns constantly. The event
    // contract reads a missing cell as blank, which already means "no change".
    expect(rowsOf("a,b,c\n1\n")[1]).toEqual(["1"]);
  });

  it("drops trailing blank lines and keeps an interior one", () => {
    const rows = rowsOf("a\n1\n\n2\n\n\n");
    expect(rows).toEqual([["a"], ["1"], [""], ["2"]]);
    expect(isEmptyCsvRow(rows[2])).toBe(true);
  });

  it("refuses a file with a NUL byte, which is a spreadsheet or a PDF", () => {
    const parsed = parseCsv("PK\u0000binary");
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toContain("not a CSV");
  });

  it("refuses a file whose quotation mark is never closed", () => {
    const parsed = parseCsv('a,b\n"never ends,2\n');
    expect(parsed.ok).toBe(false);
    expect(parsed.ok === false && parsed.reason).toContain("never closed");
  });

  it("refuses an empty file", () => {
    expect(parseCsv("").ok).toBe(false);
    expect(parseCsv("\n\n").ok).toBe(false);
  });
});

describe("formatCsvCell", () => {
  it.each(["=SUM(A1:A9)", "+1", "-- the Astro", "@here", "\tindented", "\rreturn"])(
    "guards %j against being read as a formula",
    (value) => {
      expect(formatCsvCell(value).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    },
  );

  it("quotes a value containing the delimiter", () => {
    expect(formatCsvCell("Lamb, Flag")).toBe('"Lamb, Flag"');
  });

  it("quotes and doubles an embedded quotation mark", () => {
    expect(formatCsvCell('He said "go"')).toBe('"He said ""go"""');
  });

  it("quotes a value with leading or trailing space, so it survives the trip", () => {
    expect(formatCsvCell(" padded ")).toBe('" padded "');
  });

  it("leaves an ordinary value alone", () => {
    expect(formatCsvCell("Iffley Road Astro")).toBe("Iffley Road Astro");
  });
});

describe("the guard and its inverse", () => {
  it("round-trips a value a spreadsheet would read as a formula", () => {
    // C7, and the reason the inverse exists at all: without it, exporting a
    // venue called `-- the Astro` and importing it straight back would report a
    // change nobody made, and `REQ-import-drafts-only`'s no-op round trip would
    // stop being true.
    const hostile = ["-- the Astro", "=Iffley", "+44 7700 900000", "@the Lamb"];
    const text = formatCsv([["venue"], ...hostile.map((value) => [value])]);
    expect(rowsOf(text).slice(1).flat()).toEqual(hostile);
  });

  it("keeps both apostrophes of a name that genuinely has them", () => {
    // The guard is stripped only when the character after it is one a
    // spreadsheet would have read as a formula. A letter is not.
    expect(rowsOf("name\n'The Kings Arms'\n")[1]).toEqual(["'The Kings Arms'"]);
  });

  it("round-trips every awkward shape at once", () => {
    const table = [
      ["a", "b", "c"],
      ["Lamb, Flag", 'He said "go"', "two\nlines"],
      [" padded ", "=formula", ""],
    ];
    expect(rowsOf(formatCsv(table))).toEqual(table);
  });
});
