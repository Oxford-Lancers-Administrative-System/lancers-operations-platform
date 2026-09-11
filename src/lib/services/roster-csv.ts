/**
 * The roster's own CSV: what a column means, and the shape checks a row must
 * pass before anybody is asked a duplicate question about it. LAN-215, `W1`.
 * Follows `./event-csv.ts`'s shape (three-state screen, propose-before-write,
 * partial-apply, never-store-the-file) but asks "who might this already be"
 * (Mission 5's duplicate question) rather than upserting on an id — a person
 * carries no spreadsheet identifier. This module is the pure half — read,
 * shape-check, refuse what the database could never fix; `./roster-import.ts`
 * is the other half, calling `findPersonCandidates` inside a transaction.
 * Required: `first_name`, `last_name`, `mobile`. Optional: `personal_email`,
 * `college`, `matriculation_year`. No date of birth, no emergency contact —
 * both belong to onboarding, not a file on a laptop.
 */

import { looksLikeEmail, looksLikePhone } from "@/lib/validation/contact";

import { isEmptyCsvRow, parseCsv, type CsvTable } from "./csv";

const IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "mobile",
  "personal_email",
  "college",
  "matriculation_year",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/** Without these three a row has no meaning: a welcome needs a mobile, a person needs a name. */
const REQUIRED_HEADER_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "first_name",
  "last_name",
  "mobile",
]);

/** A season's squad is dozens of people, not thousands — generous headroom. */
export const MAX_IMPORT_BYTES = 1_048_576;
const MAX_IMPORT_ROWS = 500;

export function importTemplateCsv(): string {
  return IMPORT_COLUMNS.join(",") + "\r\n";
}

/** Whether a cell says anything at all — `./event-csv.ts`'s identical `said()`. */
function said(cell: string): boolean {
  return cell.trim() !== "";
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface ParsedRosterRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  rawCells: Readonly<Record<ImportColumn, string>>;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
  personalEmail: string | null;
  college: string | null;
  matriculationYear: number | null;
  /** Why this row can never apply, whatever a duplicate check finds. Empty means the row is shape-valid. */
  reasons: readonly string[];
}

function parseMatriculationYear(cell: string, reasons: string[]): number | null {
  if (!said(cell)) return null;
  const trimmed = cell.trim();
  const value = Number(trimmed);
  if (!/^\d{4}$/.test(trimmed) || !Number.isInteger(value)) {
    reasons.push(`"matriculation_year" reads "${trimmed}". It must be a four-digit year.`);
    return null;
  }
  return value;
}

function cellsOf(row: readonly string[], index: HeaderIndex): Record<ImportColumn, string> {
  const cells = {} as Record<ImportColumn, string>;
  for (const column of IMPORT_COLUMNS) {
    const at = index[column];
    cells[column] = at === undefined ? "" : (row[at] ?? "");
  }
  return cells;
}

function parseRow(line: number, cells: Record<ImportColumn, string>): ParsedRosterRow {
  const reasons: string[] = [];

  const firstName = trimmedOrNull(cells.first_name);
  if (!firstName) reasons.push('"first_name" is empty.');

  const lastName = trimmedOrNull(cells.last_name);
  if (!lastName) reasons.push('"last_name" is empty.');

  const rawMobile = trimmedOrNull(cells.mobile);
  let mobile: string | null = null;
  if (!rawMobile) {
    reasons.push(
      '"mobile" is empty. A welcome that cannot be delivered is a person who never hears from the club.',
    );
  } else if (!looksLikePhone(rawMobile)) {
    reasons.push(`"mobile" reads "${rawMobile}". It does not look like a phone number.`);
  } else {
    mobile = rawMobile;
  }

  const rawEmail = trimmedOrNull(cells.personal_email);
  let personalEmail: string | null = null;
  if (rawEmail) {
    if (looksLikeEmail(rawEmail)) {
      personalEmail = rawEmail;
    } else {
      reasons.push(`"personal_email" reads "${rawEmail}". It does not look like an email address.`);
    }
  }

  const college = trimmedOrNull(cells.college);
  const matriculationYear = parseMatriculationYear(cells.matriculation_year, reasons);

  return {
    line,
    rawCells: Object.freeze({ ...cells }),
    firstName,
    lastName,
    mobile,
    personalEmail,
    college,
    matriculationYear,
    reasons,
  };
}

type HeaderIndex = Partial<Record<ImportColumn, number>>;
type HeaderRead = { ok: true; index: HeaderIndex } | { ok: false; reason: string };

const NO_HEADER_REASON =
  "The file has no header row this importer recognises. Download the template and compare the first line.";

function normaliseHeaderCell(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isImportColumn(value: string): value is ImportColumn {
  return (IMPORT_COLUMNS as readonly string[]).includes(value);
}

function readHeader(rows: CsvTable): HeaderRead {
  const first = rows[0] ?? [];
  const index: HeaderIndex = {};
  const seen = new Set<string>();

  for (let column = 0; column < first.length; column += 1) {
    const name = normaliseHeaderCell(first[column]);
    if (!isImportColumn(name)) continue;
    if (seen.has(name)) {
      return {
        ok: false,
        reason: `The header names "${name}" twice, so which column the importer should read cannot be worked out.`,
      };
    }
    seen.add(name);
    index[name] = column;
  }

  const missing = REQUIRED_HEADER_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length === REQUIRED_HEADER_COLUMNS.length) {
    return { ok: false, reason: NO_HEADER_REASON };
  }
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `The header is missing ${missing.join(", ")}. Download the template and compare the first line.`,
    };
  }

  return { ok: true, index };
}

function withinFileKey(row: ParsedRosterRow): string | null {
  if (!row.firstName || !row.lastName || !row.mobile) return null;
  const phoneTail = row.mobile.replace(/\D/g, "").slice(-9);
  return `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${phoneTail}`;
}

/** Every row whose key another, earlier row already carries — W1: the second is refused, naming the first line. */
function withinFileDuplicates(rows: readonly ParsedRosterRow[]): ReadonlyMap<number, number> {
  const firstSeenAt = new Map<string, number>();
  const duplicateOfLine = new Map<number, number>();
  for (const row of rows) {
    const key = withinFileKey(row);
    if (key === null) continue;
    const earlier = firstSeenAt.get(key);
    if (earlier === undefined) {
      firstSeenAt.set(key, row.line);
    } else {
      duplicateOfLine.set(row.line, earlier);
    }
  }
  return duplicateOfLine;
}

interface RosterImportRead {
  fileName: string | null;
  rows: readonly ParsedRosterRow[];
}

export type RosterImportReadResult =
  | { ok: true; read: RosterImportRead }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

/** The file, shape-checked row by row. Writes nothing; a shape-valid row still needs `./roster-import.ts`'s duplicate question. */
export function readRosterImport(options: {
  csvText: string;
  fileName?: string | null;
}): RosterImportReadResult {
  const parsed = parseCsv(options.csvText);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const header = readHeader(parsed.rows);
  if (!header.ok) return { ok: false, reason: header.reason };

  const bodyRows = parsed.rows.slice(1).filter((row) => !isEmptyCsvRow(row));
  if (bodyRows.length === 0) {
    return {
      ok: false,
      reason: "That file has a header row and nobody under it. There is nothing to import.",
    };
  }
  if (bodyRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      reason: `That file has ${bodyRows.length} rows. An import takes at most ${MAX_IMPORT_ROWS}, which is far more than a squad.`,
    };
  }

  let line = 1;
  const rows: ParsedRosterRow[] = [];
  for (const raw of parsed.rows.slice(1)) {
    line += 1;
    if (isEmptyCsvRow(raw)) continue;
    rows.push(parseRow(line, cellsOf(raw, header.index)));
  }

  const duplicateOfLine = withinFileDuplicates(rows);
  const withDuplicateReasons = rows.map((row) => {
    const earlier = duplicateOfLine.get(row.line);
    if (earlier === undefined) return row;
    return {
      ...row,
      reasons: [
        ...row.reasons,
        `Line ${earlier} in this file is the same person — same first name, last name and mobile.`,
      ],
    };
  });

  return { ok: true, read: { fileName: options.fileName ?? null, rows: withDuplicateReasons } };
}

export const IMPORT_TOO_LARGE_MESSAGE =
  `That file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024)} KB. A season's squad is a ` +
  "few tens of kilobytes, so this is not a term's spreadsheet.";

export function refuseOversizedRosterFile(csvText: string): string | null {
  const bytes = Buffer.byteLength(csvText, "utf8");
  return bytes > MAX_IMPORT_BYTES ? IMPORT_TOO_LARGE_MESSAGE : null;
}

// The plan's shape — pure, so the client confirmation screen can read it (`./roster-import.ts` is `server-only`).

type RosterCandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

export type RosterRowOutcome = "new" | "carried_forward" | "unchanged" | "refused";

export interface RosterDuplicateCandidate {
  personId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchedOn: readonly RosterCandidateMatch[];
  currentMembershipSeasonLabel: string | null;
}

export interface RosterPlannedRow {
  line: number;
  outcome: RosterRowOutcome;
  name: string;
  cells: Readonly<Record<ImportColumn, string>>;
  reasons: readonly string[];
  duplicate: { candidates: readonly RosterDuplicateCandidate[] } | null;
  matchedPersonId: string | null;
}

export interface RosterImportTotals {
  new: number;
  carried_forward: number;
  unchanged: number;
  refused: number;
}

export interface RosterImportPlan {
  fileName: string | null;
  seasonId: string;
  seasonLabel: string;
  rowCount: number;
  totals: RosterImportTotals;
  rows: readonly RosterPlannedRow[];
  applicableCount: number;
  unansweredLines: readonly number[];
  /** A fingerprint of what applying would write; `./roster-import.ts` recomputes and refuses on mismatch. */
  digest: string;
}

/** The totals an applied import produced, as the screen reports them. */
export interface RosterImportApplied {
  created: number;
  carriedForward: number;
  unchanged: number;
  refused: number;
  welcomesQueued: number;
}

export type RosterImportPlanResult =
  | { ok: true; plan: RosterImportPlan }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

/** `{ "7": "different" }` or `{ "7": "<personId>" }` — never stored, carried through the form. */
export type DuplicateAnswers = Readonly<Record<string, string>>;
