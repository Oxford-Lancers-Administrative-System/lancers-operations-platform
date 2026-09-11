// The CSV dialect (LAN-155). Pure — the confirmation screen is a client component. Hostile by
// default (BOM, CRLF/lone-CR, quoted commas/newlines, formula injection — see relocations.md).
// Delimiter is a fixed comma, never sniffed.

const DELIMITER = ",";

const FORMULA_LEADERS: readonly string[] = Object.freeze(["=", "+", "-", "@", "\t", "\r"]);

const FORMULA_GUARD = "'"; // the escape a spreadsheet understands — makes the cell text

const RECORD_SEPARATOR = "\r\n"; // Excel is happiest with CRLF, every other reader accepts it

const BYTE_ORDER_MARK = "\uFEFF";

const NUL = "\u0000"; // what arrives when somebody uploads a spreadsheet, a PDF or an image

export type CsvTable = readonly (readonly string[])[];

export type CsvParse =
  { readonly ok: true; readonly rows: CsvTable } | { readonly ok: false; readonly reason: string };

// Cells come back verbatim apart from the BOM and the formula guard. A short row is not a parse
// failure — event-csv.ts reads a missing cell as blank.
export function parseCsv(text: string): CsvParse {
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
        if (source[index + 1] === '"') {
          cell += '"'; // a doubled quote inside a quoted field is one literal quote
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
      if (cell === "") {
        quoted = true; // only a quote at the start of a field opens one — mid-field is literal (e.g. 5" nails)
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

  if (cell !== "" || row.length > 0) endRow(); // the final record, unless the file ended with just a line break

  while (rows.length > 0 && isEmptyCsvRow(rows[rows.length - 1])) rows.pop(); // trailing blanks aren't rows; a mid-file blank is left for event-csv.ts to interpret

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

// Leading/trailing spaces force quoting too, or a reader would silently break the round-trip.
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

// The inverse of the formula guard: strips the apostrophe only when the next character is one a
// spreadsheet would read as a formula lead — a genuine `'The Kings Arms'` keeps both apostrophes.
function unguard(cell: string): string {
  return cell.startsWith(FORMULA_GUARD) && FORMULA_LEADERS.includes(cell.slice(1, 2))
    ? cell.slice(1)
    : cell;
}

/** True when every cell in the row is blank or whitespace — an empty line. */
export function isEmptyCsvRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === "");
}
