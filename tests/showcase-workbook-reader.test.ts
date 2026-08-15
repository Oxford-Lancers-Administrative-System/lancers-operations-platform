// @vitest-environment node
/**
 * The showcase workbook reader — LAN-124.
 *
 * The loader that reads the club's two spreadsheets is the one procedure
 * permitted to write to the production database, and everything it writes comes
 * through this file. A reader that silently truncates a name, drops a cell or
 * double-unescapes an ampersand produces a database that looks plausible and is
 * wrong, which is the failure mode worth the most care.
 *
 * The real workbooks cannot be committed — forty-two real students' names, in a
 * public repository — so every workbook here is built in memory by
 * `tests/helpers/xlsx-builder.mjs`. That helper writes the format these tests
 * read, which means a bug shared by both would hide. The cases below are
 * therefore written against the *format as Excel emits it*, and the reader was
 * separately run against the club's actual files during implementation: 42 name
 * rows out of `Players Databank`, 62 cells out of the Michaelmas term card,
 * with `S&C` and `Vincent's` decoded and a multi-run string joined.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// @ts-expect-error — plain ESM helper, deliberately untyped.
import { workbook, zip } from "./helpers/xlsx-builder.mjs";
// @ts-expect-error — the reader under test is a plain ESM script.
import {
  cellsInReadingOrder,
  cellText_,
  columnLetters,
  columnNumber,
  readWorkbook,
  rowNumber,
} from "../scripts/production/showcase/workbook.mjs";

let directory: string;
let serial = 0;

beforeAll(() => {
  directory = mkdtempSync(path.join(tmpdir(), "lancers-xlsx-"));
});

afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});

/** Writes a built workbook to disk and reads it back through the reader. */
function roundTrip(buffer: Buffer) {
  serial += 1;
  const file = path.join(directory, `book-${serial}.xlsx`);
  writeFileSync(file, buffer);
  return readWorkbook(file);
}

describe("cell addresses", () => {
  it("converts columns in both directions, past the single letters", () => {
    for (const [address, column] of [
      ["A1", 1],
      ["Z9", 26],
      ["AA1", 27],
      ["AP164", 42],
      ["BA2", 53],
    ] as const) {
      expect(columnNumber(address), address).toBe(column);
      expect(columnLetters(column), String(column)).toBe(/^[A-Z]+/.exec(address)![0]);
    }
  });

  it("reads the row, including a five-digit one", () => {
    // The roster workbook allocates 1,048,576 rows. A regex anchored wrongly
    // would read "1" out of "AP1048576".
    expect(rowNumber("A1")).toBe(1);
    expect(rowNumber("AP1048576")).toBe(1048576);
  });

  it("refuses something that is not an address rather than guessing", () => {
    expect(() => columnNumber("1A")).toThrow();
    expect(() => rowNumber("AA")).toThrow();
  });
});

describe("reading values", () => {
  it("reads a shared string, an inline string and a number", () => {
    const book = roundTrip(
      workbook(
        {
          Sheet1: [
            ["A1", 't="s"><v>0</v></c>'],
            ["B1", 't="inlineStr"><is><t>Inline</t></is></c>'],
            ["C1", "><v>42</v></c>"],
          ],
        },
        { sharedStrings: ["<t>Shared</t>"] },
      ),
    );

    const sheet = book.sheets.get("Sheet1");
    expect(cellText_(sheet, "A1")).toBe("Shared");
    expect(cellText_(sheet, "B1")).toBe("Inline");
    expect(cellText_(sheet, "C1")).toBe("42");
  });

  it("joins a string split across formatting runs", () => {
    // Excel splits a string at every formatting change. A reader taking the
    // first `<t>` truncates a name at its first bold character, silently.
    const book = roundTrip(
      workbook(
        { Sheet1: [["A1", 't="s"><v>0</v></c>']] },
        { sharedStrings: ["<r><t>Team </t></r><r><t>Practice</t></r>"] },
      ),
    );

    expect(cellText_(book.sheets.get("Sheet1"), "A1")).toBe("Team Practice");
  });

  it("ignores phonetic guides, which are not part of the value", () => {
    const book = roundTrip(
      workbook(
        { Sheet1: [["A1", 't="s"><v>0</v></c>']] },
        { sharedStrings: ['<t>Name</t><rPh sb="0" eb="1"><t>NOISE</t></rPh>'] },
      ),
    );

    expect(cellText_(book.sheets.get("Sheet1"), "A1")).toBe("Name");
  });

  it("decodes entities without double-unescaping", () => {
    // `S&C Session` is real term-card text. And `&amp;lt;` is a literal "&lt;"
    // in the source — a reader replacing &amp; first turns it into "<".
    const book = roundTrip(
      workbook(
        {
          Sheet1: [
            ["A1", 't="s"><v>0</v></c>'],
            ["A2", 't="s"><v>1</v></c>'],
            ["A3", 't="s"><v>2</v></c>'],
          ],
        },
        {
          sharedStrings: [
            "<t>Team S&amp;C Session</t>",
            "<t>Vincent&apos;s Club</t>",
            "<t>&amp;lt;not a tag&amp;gt;</t>",
          ],
        },
      ),
    );

    const sheet = book.sheets.get("Sheet1");
    expect(cellText_(sheet, "A1")).toBe("Team S&C Session");
    expect(cellText_(sheet, "A2")).toBe("Vincent's Club");
    expect(cellText_(sheet, "A3")).toBe("&lt;not a tag&gt;");
  });

  it("shows an error cell as its error text rather than as empty", () => {
    // LAN-124 forbids importing broken spreadsheet formulas, which is only
    // possible if the loader can see that a cell is broken.
    const book = roundTrip(workbook({ Sheet1: [["A1", 't="e"><v>#REF!</v></c>']] }));
    expect(cellText_(book.sheets.get("Sheet1"), "A1")).toBe("#REF!");
  });

  it("treats an empty and a whitespace-only cell as nothing there", () => {
    const book = roundTrip(
      workbook({
        Sheet1: [
          ["A1", "></c>"],
          ["A2", 't="inlineStr"><is><t>   </t></is></c>'],
          ["A3", 't="inlineStr"><is><t>real</t></is></c>'],
        ],
      }),
    );

    const sheet = book.sheets.get("Sheet1");
    expect(cellText_(sheet, "A1")).toBeNull();
    expect(cellText_(sheet, "A2")).toBeNull();
    expect(cellText_(sheet, "A4")).toBeNull();
    expect(cellText_(sheet, "A3")).toBe("real");
  });

  it("keeps a self-closing cell out of the sheet entirely", () => {
    // A sheet with a million allocated-but-empty cells must not become a
    // million map entries — the roster workbook genuinely has that shape.
    const book = roundTrip(
      workbook({
        Sheet1: [
          ["A1", "/>"],
          ["B1", 't="inlineStr"><is><t>x</t></is></c>'],
        ],
      }),
    );

    expect(book.sheets.get("Sheet1").size).toBe(1);
  });
});

describe("sheets", () => {
  it("keys sheets by the name Excel shows, including a trailing space", () => {
    // "Defence summary " really does have one in the club's workbook.
    const book = roundTrip(
      workbook({
        "Players Databank": [["A1", 't="inlineStr"><is><t>Name</t></is></c>']],
        "Defence summary ": [["A1", 't="inlineStr"><is><t>x</t></is></c>']],
      }),
    );

    expect([...book.sheets.keys()]).toEqual(["Players Databank", "Defence summary "]);
  });

  it("maps each sheet to its own cells rather than to the first", () => {
    const book = roundTrip(
      workbook({
        First: [["A1", 't="inlineStr"><is><t>one</t></is></c>']],
        Second: [["A1", 't="inlineStr"><is><t>two</t></is></c>']],
      }),
    );

    expect(cellText_(book.sheets.get("First"), "A1")).toBe("one");
    expect(cellText_(book.sheets.get("Second"), "A1")).toBe("two");
  });

  it("returns cells in reading order, so provenance follows the spreadsheet", () => {
    const book = roundTrip(
      workbook({
        Sheet1: [
          ["C7", 't="inlineStr"><is><t>c7</t></is></c>'],
          ["A1", 't="inlineStr"><is><t>a1</t></is></c>'],
          ["AA1", 't="inlineStr"><is><t>aa1</t></is></c>'],
          ["B1", 't="inlineStr"><is><t>b1</t></is></c>'],
        ],
      }),
    );

    expect(
      cellsInReadingOrder(book.sheets.get("Sheet1")).map((c: { text: string }) => c.text),
    ).toEqual(["a1", "b1", "aa1", "c7"]);
  });
});

describe("the archive", () => {
  it("inflates a deflated entry, which is what Excel actually writes", () => {
    const book = roundTrip(
      workbook(
        { Sheet1: [["A1", 't="s"><v>0</v></c>']] },
        { sharedStrings: ["<t>Compressed</t>"], deflate: true },
      ),
    );

    expect(cellText_(book.sheets.get("Sheet1"), "A1")).toBe("Compressed");
  });

  it("refuses a file that is not a workbook, rather than reading nothing", () => {
    serial += 1;
    const file = path.join(directory, `not-a-book-${serial}.xlsx`);
    writeFileSync(file, Buffer.from("this is not a zip archive"));

    expect(() => readWorkbook(file)).toThrow(/not a readable \.xlsx|end-of-central-directory/i);
  });

  it("refuses a zip that is not a workbook", () => {
    serial += 1;
    const file = path.join(directory, `empty-zip-${serial}.xlsx`);
    writeFileSync(file, zip({ "readme.txt": "no workbook here" }));

    expect(() => readWorkbook(file)).toThrow(/not a readable \.xlsx/i);
  });
});
