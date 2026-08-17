/**
 * A minimal `.xlsx` reader — LAN-124.
 *
 * ## Why this exists rather than a dependency
 *
 * This repository is public and takes its supply chain seriously, and the
 * loader that uses this file is the one procedure permitted to write to the
 * club's production database. The two established npm readers each cost
 * something real here: the registry build of SheetJS is pinned several years
 * behind its own current release, and `exceljs` pulls in a `uuid` carrying a
 * published advisory. Neither is a catastrophe for a development-time tool, and
 * both are more code than this problem needs.
 *
 * What the loader actually reads from the club's two workbooks is narrow:
 *
 *   * cell text, whether stored in the shared-string table or inline;
 *   * cell numbers, unformatted;
 *   * the cell's own address, because the manifest records provenance by cell.
 *
 * It reads **no** dates, no formulas, no styles and no formatting. That is not
 * a limitation being worked around — it is a property of the source. Every time
 * in the Michaelmas term card is part of a text string ("18:00-19:00"), and
 * every roster field the loader imports is text. The numeric columns in the
 * roster are precisely the ones LAN-124 forbids importing: attendance
 * percentages and a broken formula. So the serial-date arithmetic and the
 * number-format table that make a general reader large are not needed, and
 * writing them untested would be worse than not having them.
 *
 * If a later issue needs a typed date out of a spreadsheet, that is the moment
 * to reach for a library, and this file should be deleted rather than grown.
 *
 * ## The format, as far as this file cares
 *
 * An `.xlsx` is a ZIP holding XML. Three parts matter:
 *
 *   * `xl/workbook.xml` — sheet names, in order, each with a relationship id;
 *   * `xl/_rels/workbook.xml.rels` — that id to a worksheet path;
 *   * `xl/sharedStrings.xml` — the string table most text cells point into;
 *   * `xl/worksheets/sheetN.xml` — the cells.
 *
 * Excel writes these deflated, which `zlib.inflateRawSync` reads directly.
 */

import { inflateRawSync } from "node:zlib";
import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// ZIP
// ---------------------------------------------------------------------------

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_FILE_HEADER = 0x02014b50;

/**
 * Reads every entry out of a ZIP archive, by name.
 *
 * Walks the central directory rather than scanning for local file headers: the
 * local header may carry a zero compressed size with the real value in a data
 * descriptor after the payload, which is unparseable without the directory. The
 * directory is authoritative and Excel always writes one.
 */
function readZipEntries(buffer) {
  const end = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);

  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_FILE_HEADER) {
      throw new Error(`Corrupt workbook: central directory entry ${index} is not where it says.`);
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);

    entries.set(name, { compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return { buffer, entries };
}

function findEndOfCentralDirectory(buffer) {
  // Scanned backwards because the record is last and carries a variable-length
  // comment after it. Bounded at 64KiB + 22, the largest it can be.
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= earliest; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw new Error("Not a readable .xlsx file: no ZIP end-of-central-directory record.");
}

/** Inflates one entry to a string, or returns null when the archive lacks it. */
function readZipText(archive, name) {
  const entry = archive.entries.get(name);
  if (!entry) return null;

  const { buffer } = archive;
  const base = entry.localHeaderOffset;
  // The local header repeats the name and extra fields, at its own lengths —
  // which are *not* always the central directory's, so they are read again here.
  const nameLength = buffer.readUInt16LE(base + 26);
  const extraLength = buffer.readUInt16LE(base + 28);
  const start = base + 30 + nameLength + extraLength;
  const payload = buffer.subarray(start, start + entry.compressedSize);

  if (entry.compressionMethod === 0) return payload.toString("utf8");
  if (entry.compressionMethod === 8) return inflateRawSync(payload).toString("utf8");
  throw new Error(`Unsupported compression (method ${entry.compressionMethod}) in ${name}.`);
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/**
 * Decodes the five XML entities plus numeric references.
 *
 * `&amp;` is replaced last. Replacing it first would turn `&amp;lt;` — a
 * literal "&lt;" in the source text — into "<", which is the classic
 * double-unescape bug and would corrupt an event name containing an ampersand.
 */
function decodeXmlText(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/g, "&");
}

/**
 * The text of one `<si>` or `<is>` element.
 *
 * A string may be split across several `<t>` runs when part of it is formatted
 * differently — bold, coloured, a different size. Excel does that freely, and a
 * reader taking only the first run silently truncates. Every run is
 * concatenated, and `<rPh>` (phonetic guides, which Excel emits for some
 * locales and which are not part of the value) is removed first.
 */
function textOfStringElement(xml) {
  const withoutPhonetics = xml.replace(/<rPh[\s\S]*?<\/rPh>/g, "");
  const runs = [...withoutPhonetics.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)];
  return runs.map((run) => decodeXmlText(run[1])).join("");
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

/** Converts a cell address such as `AP12` to a one-based column number. */
export function columnNumber(address) {
  const letters = /^([A-Z]+)/.exec(address.toUpperCase());
  if (!letters) throw new Error(`Not a cell address: ${address}`);
  let column = 0;
  for (const character of letters[1]) {
    column = column * 26 + (character.charCodeAt(0) - 64);
  }
  return column;
}

/** Converts a one-based column number to its letters. `1` → `A`. */
export function columnLetters(column) {
  let letters = "";
  let remaining = column;
  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return letters;
}

/** Extracts the one-based row number from a cell address. */
export function rowNumber(address) {
  const digits = /(\d+)$/.exec(address);
  if (!digits) throw new Error(`Not a cell address: ${address}`);
  return Number(digits[1]);
}

/**
 * Opens a workbook and returns its sheets, keyed by the name Excel shows.
 *
 * Each sheet is a `Map` from cell address to `{ address, row, column, text }`.
 * Empty cells are absent rather than present-and-blank: the loader asks "what
 * is in C7", and a sheet with a million allocated-but-empty cells — which the
 * roster workbook genuinely has, at 1,048,576 rows — must not become a million
 * map entries.
 */
export function readWorkbook(filePath) {
  const archive = readZipEntries(readFileSync(filePath));

  const workbookXml = readZipText(archive, "xl/workbook.xml");
  if (workbookXml === null) throw new Error(`Not a readable .xlsx file: ${filePath}`);

  const relationships = new Map();
  const relsXml = readZipText(archive, "xl/_rels/workbook.xml.rels") ?? "";
  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[1])?.[1];
    if (id && target) relationships.set(id, target.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const sharedStrings = [];
  const sharedXml = readZipText(archive, "xl/sharedStrings.xml");
  if (sharedXml !== null) {
    for (const match of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      sharedStrings.push(textOfStringElement(match[1]));
    }
  }

  const sheets = new Map();
  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attributes = match[1];
    const name = /\bname="([^"]*)"/.exec(attributes)?.[1];
    const relationshipId = /\br:id="([^"]+)"/.exec(attributes)?.[1];
    if (!name || !relationshipId) continue;

    const target = relationships.get(relationshipId);
    if (!target) continue;

    const sheetXml = readZipText(archive, `xl/${target}`);
    if (sheetXml === null) continue;

    sheets.set(decodeXmlText(name), readSheet(sheetXml, sharedStrings));
  }

  return { filePath, sheets };
}

/** Parses one worksheet's cells into a map keyed by address. */
function readSheet(sheetXml, sharedStrings) {
  const cells = new Map();

  for (const match of sheetXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attributes = match[1];
    const body = match[2] ?? "";

    const address = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1];
    if (!address) continue;

    const type = /\bt="([^"]+)"/.exec(attributes)?.[1] ?? "n";
    const text = cellText(type, body, sharedStrings);
    if (text === null || text === "") continue;

    cells.set(address, {
      address,
      row: rowNumber(address),
      column: columnNumber(address),
      text,
    });
  }

  return cells;
}

function cellText(type, body, sharedStrings) {
  // A shared string: `<v>` is an index into the string table.
  if (type === "s") {
    const index = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (index === undefined) return null;
    return sharedStrings[Number(index)] ?? null;
  }

  // An inline string, which Excel writes when the table is not used.
  if (type === "inlineStr") {
    const inline = /<is>([\s\S]*?)<\/is>/.exec(body)?.[1];
    return inline === undefined ? null : textOfStringElement(inline);
  }

  // A formula string result.
  if (type === "str") {
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    return value === undefined ? null : decodeXmlText(value);
  }

  // An error cell — `#REF!`, `#DIV/0!`. Returned as its text so a caller can
  // *see* it and refuse, rather than silently reading it as empty. LAN-124
  // names broken spreadsheet formulas as something not to import, which is only
  // possible if they are visible.
  if (type === "e") {
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    return value === undefined ? null : decodeXmlText(value);
  }

  // Boolean.
  if (type === "b") {
    const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    if (value === undefined) return null;
    return value === "1" ? "TRUE" : "FALSE";
  }

  // A number, returned as written. No number-format lookup and no serial-date
  // conversion — see the note at the top of this file about what the club's
  // workbooks actually contain.
  const value = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
  return value === undefined ? null : value.trim();
}

/**
 * The cells of one sheet, in reading order.
 *
 * Sorted by row and then column so that a caller walking a term card sees
 * Sunday before Saturday, and so the manifest's provenance entries come out in
 * an order a human comparing them against the spreadsheet can follow.
 */
export function cellsInReadingOrder(sheet) {
  return [...sheet.values()].sort((a, b) => a.row - b.row || a.column - b.column);
}

/** The text of one cell, trimmed, or `null` when the sheet has nothing there. */
export function cellText_(sheet, address) {
  const cell = sheet.get(address);
  if (!cell) return null;
  const trimmed = cell.text.trim();
  return trimmed === "" ? null : trimmed;
}
