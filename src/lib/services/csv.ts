/**
 * The CSV dialect — reading a file a club secretary produced, and writing one
 * they will open in a spreadsheet. LAN-155.
 *
 * ## Why this is its own module, and why it is pure
 *
 * Nothing here knows what an event is. It is the mechanical half of
 * `./event-csv.ts` — separators, quoting, line endings, byte order marks — and
 * keeping it separate is what lets the event contract be read as a list of club
 * rules rather than as a parser. It is also pure, with no `server-only` and no
 * database, because the confirmation screen is a client component and the
 * worked example carried by the copyable prompt is asserted by a unit test.
 *
 * ## The file is hostile by default
 *
 * The operator's file is not one this application produced. It is one a
 * spreadsheet produced, from something an AI tool produced, from a term card.
 * Every one of the following is assumed rather than hoped for:
 *
 *   * **A UTF-8 byte order mark.** Excel writes one. Left in place it becomes
 *     part of the first header name, so `id` is not `id` and the whole file is
 *     refused for a reason nobody can see.
 *   * **CRLF, and lone CR.** Windows writes the first; a very old Mac export
 *     writes the second. Both are record separators here.
 *   * **Quoted fields containing commas, quotes and newlines.** A venue called
 *     `The Lamb and Flag, St Giles` is one field, and a description may carry a
 *     paragraph break.
 *   * **Formula injection.** A cell a spreadsheet reads as a formula — one
 *     beginning `=`, `+`, `-`, `@`, a tab or a carriage return — is a live
 *     instruction in Excel, Numbers and Google Sheets. Everything this module
 *     *writes* is prefixed with an apostrophe when it begins with one of those,
 *     which is the escape those applications understand, and everything it
 *     *reads* strips exactly that apostrophe again. The two are inverses on
 *     purpose: without the second, exporting a venue called `-- the Astro` and
 *     importing it straight back would report a change nobody made, and the
 *     round trip would stop being the no-op `REQ-import-drafts-only` requires.
 *
 * ## What it deliberately does not do
 *
 * It does not sniff the delimiter. The delimiter is a comma, the template says
 * so and the prompt says so, and a file that uses semicolons is refused with one
 * sentence rather than parsed into a single column per row and then refused
 * seven different ways further down.
 */

/** The one delimiter. Not sniffed and not configurable — see the header. */
const DELIMITER = ",";

/** What a spreadsheet would read as the start of a formula. */
const FORMULA_LEADERS: readonly string[] = Object.freeze(["=", "+", "-", "@", "\t", "\r"]);

/** The escape a spreadsheet understands: an apostrophe makes the cell text. */
const FORMULA_GUARD = "'";

/** Excel is happiest with CRLF, and every other reader accepts it. */
const RECORD_SEPARATOR = "\r\n";

const BYTE_ORDER_MARK = "\uFEFF";

/** What arrives when somebody uploads a spreadsheet, a PDF or an image. */
const NUL = "\u0000";

export type CsvTable = readonly (readonly string[])[];

export type CsvParse =
  { readonly ok: true; readonly rows: CsvTable } | { readonly ok: false; readonly reason: string };

/**
 * The whole file, as a table of raw cells.
 *
 * Cells come back **verbatim** apart from the two transformations that belong to
 * the encoding rather than to the value: the byte order mark is removed from the
 * very start of the file, and a formula guard is stripped from any cell carrying
 * one. Trimming is the caller's decision, because "blank or whitespace-only
 * means no change" is a club rule and belongs where the club rules are.
 *
 * A ragged table is not a parse failure. A row with fewer cells than the header
 * is a spreadsheet that dropped its trailing empty columns, which happens
 * constantly and means nothing; `./event-csv.ts` reads a missing cell as blank,
 * which is what that club rule already says an empty one means.
 */
export function parseCsv(text: string): CsvParse {
  // A NUL byte is not something any spreadsheet writes. It is what arrives when
  // somebody uploads an `.xlsx`, a PDF or an image, and refusing it here means
  // the operator is told "this is not a CSV" rather than shown a confirmation
  // screen full of unreadable rows.
  if (text.includes(NUL)) {
    return {
      ok: false,
      reason: "That file is not a CSV. Export it as CSV from your spreadsheet and try again.",
    };
  }

  const source = text.startsWith(BYTE_ORDER_MARK) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;

  const endCell = () => {
    row.push(unguard(cell));
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const character = source[index];

    if (quoted) {
      if (character === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (source[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      cell += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      // Only a quote at the start of a field opens one. A quote in the middle of
      // an unquoted field is a literal quote, which is what a spreadsheet that
      // wrote `5" nails` without quoting the field meant.
      if (cell === "") {
        quoted = true;
        index += 1;
        continue;
      }
      cell += character;
      index += 1;
      continue;
    }

    if (character === DELIMITER) {
      endCell();
      index += 1;
      continue;
    }

    if (character === "\r") {
      endRow();
      index += source[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    if (character === "\n") {
      endRow();
      index += 1;
      continue;
    }

    cell += character;
    index += 1;
  }

  if (quoted) {
    return {
      ok: false,
      reason:
        "That file has a quotation mark that is never closed, so where one row ends cannot be worked out. Open it in a spreadsheet and save it again.",
    };
  }

  // The final record, unless the file ended with a line break and nothing else.
  if (cell !== "" || row.length > 0) endRow();

  // Trailing blank lines are normal and are not rows. A blank line in the middle
  // is left where it is: it is the operator's file, and `./event-csv.ts` decides
  // what an entirely empty row means.
  while (rows.length > 0 && isEmptyCsvRow(rows[rows.length - 1])) rows.pop();

  if (rows.length === 0) return { ok: false, reason: "That file is empty." };

  return { ok: true, rows };
}

/** The whole table, as a file a spreadsheet will open. */
export function formatCsv(rows: CsvTable): string {
  return (
    rows.map((row) => row.map(formatCsvCell).join(DELIMITER)).join(RECORD_SEPARATOR) +
    RECORD_SEPARATOR
  );
}

/**
 * One cell, guarded against formula injection and quoted where it has to be.
 *
 * Leading and trailing spaces force quoting too. They are almost always an
 * accident, but a reader that silently dropped them would make an exported value
 * differ from the stored one, and this module's whole claim is that what comes
 * out can go back in unchanged.
 */
export function formatCsvCell(value: string): string {
  const guarded = FORMULA_LEADERS.includes(value.slice(0, 1)) ? FORMULA_GUARD + value : value;
  const mustQuote =
    guarded.includes(DELIMITER) ||
    guarded.includes('"') ||
    guarded.includes("\n") ||
    guarded.includes("\r") ||
    guarded !== guarded.trim();
  return mustQuote ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/**
 * The inverse of the formula guard, and nothing more.
 *
 * An apostrophe is stripped only when the character after it is one a
 * spreadsheet would have read as a formula — which is exactly when this module
 * would have added one. A venue genuinely called `'The Kings Arms'` keeps both
 * of its apostrophes, because the character after the first is a letter.
 */
function unguard(cell: string): string {
  return cell.startsWith(FORMULA_GUARD) && FORMULA_LEADERS.includes(cell.slice(1, 2))
    ? cell.slice(1)
    : cell;
}

/** True when every cell in the row is blank or whitespace — an empty line. */
export function isEmptyCsvRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}
