/**
 * The recruit import's own CSV — LAN-487, the recruit counterpart of the
 * roster's (`./roster-csv.ts`, LAN-215). The pure half: read the file,
 * shape-check each row, refuse what the database could never fix.
 * `./recruit-import.ts` is the other half, asking `findPersonCandidates` who
 * each row might already be and writing through the hand-add's own path.
 *
 * The columns are the hand-add's fields (`/operate/recruitment/new`). Required:
 * `first_name`, `last_name`, `mobile`. The rest are optional, and a blank cell
 * behaves as a blank field does on the hand-add. `opt_in` takes one of the
 * hand-add's four answers, as its key or its full label, ignoring case; any
 * other value refuses the row.
 */

import type { CandidateIdentity } from "./recruitment-candidate-identity";
import {
  validateAcademicYear,
  validateCollegeEmail,
  validateDateOfBirth,
  validateEmailAddress,
  validatePhoneNumber,
} from "./person-validation";
import { RECRUITMENT_ADD_OPT_IN_OPTIONS } from "./recruitment-vocabulary";

import { formatCsvCell, isEmptyCsvRow, parseCsv, type CsvTable } from "./csv";
import { MAX_IMPORT_BYTES } from "./roster-csv";

export const RECRUIT_IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "mobile",
  "college_email",
  "personal_email",
  "known_as",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
  "emergency_first_name",
  "emergency_last_name",
  "emergency_relationship",
  "emergency_phone",
  "emergency_email",
  "opt_in",
  "opt_in_note",
] as const;

export type RecruitImportColumn = (typeof RECRUIT_IMPORT_COLUMNS)[number];

/** The roster's three, for the roster's reason: a person needs a name, and a welcome needs a mobile. */
const REQUIRED_HEADER_COLUMNS: readonly RecruitImportColumn[] = Object.freeze([
  "first_name",
  "last_name",
  "mobile",
]);

/** The roster's own limits (LAN-215). */
export { MAX_IMPORT_BYTES };
const MAX_IMPORT_ROWS = 500;

const EMERGENCY_DETAIL_COLUMNS: readonly RecruitImportColumn[] = Object.freeze([
  "emergency_last_name",
  "emergency_relationship",
  "emergency_phone",
  "emergency_email",
]);

/** The `opt_in` header documents what the cell takes: each key, then its label. */
export const OPT_IN_HEADER =
  "opt_in (" +
  RECRUITMENT_ADD_OPT_IN_OPTIONS.map((option) => `${option.value} = ${option.label}`).join(" | ") +
  ")";

export function recruitImportTemplateCsv(): string {
  return (
    RECRUIT_IMPORT_COLUMNS.map((column) =>
      formatCsvCell(column === "opt_in" ? OPT_IN_HEADER : column),
    ).join(",") + "\r\n"
  );
}

function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** The opt-in cell: a key or a label, any case. `null` for a blank cell; `undefined` for a value that is neither. */
export function readOptIn(cell: string): string | null | undefined {
  const value = trimmedOrNull(cell);
  if (value === null) return null;
  const wanted = value.toLowerCase();
  const option = RECRUITMENT_ADD_OPT_IN_OPTIONS.find(
    (candidate) =>
      candidate.value.toLowerCase() === wanted || candidate.label.toLowerCase() === wanted,
  );
  return option ? option.value : undefined;
}

export interface ParsedRecruitRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  /** Every cell trimmed, the opt-in normalised to its key once it is read. */
  cells: Readonly<Record<RecruitImportColumn, string>>;
  /** Why this row can never apply, whatever a duplicate check finds. Empty means the row is shape-valid. */
  reasons: readonly string[];
}

function checkOptional(
  cells: Record<RecruitImportColumn, string>,
  column: RecruitImportColumn,
  validate: (value: string) => { valid: boolean; message: string },
  reasons: string[],
): void {
  const value = cells[column];
  if (value === "") return;
  const result = validate(value);
  if (!result.valid) reasons.push(`"${column}" reads "${value}". ${result.message}`);
}

function parseRow(line: number, raw: Record<RecruitImportColumn, string>): ParsedRecruitRow {
  const cells = {} as Record<RecruitImportColumn, string>;
  for (const column of RECRUIT_IMPORT_COLUMNS) cells[column] = raw[column].trim();
  const reasons: string[] = [];

  if (cells.first_name === "") reasons.push('"first_name" is empty.');
  if (cells.last_name === "") reasons.push('"last_name" is empty.');

  if (cells.mobile === "") {
    reasons.push('"mobile" is empty. A mobile number is required.');
  } else {
    checkOptional(cells, "mobile", validatePhoneNumber, reasons);
  }

  checkOptional(cells, "college_email", validateCollegeEmail, reasons);
  checkOptional(cells, "personal_email", validateEmailAddress, reasons);
  checkOptional(
    cells,
    "matriculation_year",
    (value) => validateAcademicYear(value, "Matriculation year"),
    reasons,
  );
  checkOptional(
    cells,
    "expected_graduation_year",
    (value) => validateAcademicYear(value, "Expected graduation"),
    reasons,
  );
  checkOptional(cells, "date_of_birth", (value) => validateDateOfBirth(value), reasons);
  checkOptional(cells, "emergency_phone", validatePhoneNumber, reasons);
  checkOptional(cells, "emergency_email", validateEmailAddress, reasons);

  // The hand-add writes an emergency contact only under a first name; a file
  // that fills the rest without one would lose them without a word.
  if (
    cells.emergency_first_name === "" &&
    EMERGENCY_DETAIL_COLUMNS.some((column) => cells[column] !== "")
  ) {
    reasons.push('"emergency_first_name" is empty, so the emergency contact cannot be recorded.');
  }

  const optIn = readOptIn(cells.opt_in);
  if (optIn === undefined) {
    reasons.push(
      `"opt_in" reads "${cells.opt_in}". It must be ${RECRUITMENT_ADD_OPT_IN_OPTIONS.map((option) => option.value).join(", ")}, one of their labels, or blank.`,
    );
  } else {
    cells.opt_in = optIn ?? "";
  }

  return { line, cells: Object.freeze(cells), reasons };
}

type HeaderIndex = Partial<Record<RecruitImportColumn, number>>;
type HeaderRead = { ok: true; index: HeaderIndex } | { ok: false; reason: string };

const NO_HEADER_REASON =
  "The file has no header row this importer recognises. Download the template and compare the first line.";

/** As the roster's, and a trailing `(…)` is documentation, not the column's name — the `opt_in` header carries one. */
function normaliseHeaderCell(value: string): string {
  return value
    .replace(/\([^]*\)\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function isRecruitImportColumn(value: string): value is RecruitImportColumn {
  return (RECRUIT_IMPORT_COLUMNS as readonly string[]).includes(value);
}

function readHeader(rows: CsvTable): HeaderRead {
  const first = rows[0] ?? [];
  const index: HeaderIndex = {};

  for (let column = 0; column < first.length; column += 1) {
    const name = normaliseHeaderCell(first[column]);
    if (!isRecruitImportColumn(name)) continue;
    if (index[name] !== undefined) {
      return {
        ok: false,
        reason: `The header names "${name}" twice, so which column the importer should read cannot be worked out.`,
      };
    }
    index[name] = column;
  }

  const missing = REQUIRED_HEADER_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length === REQUIRED_HEADER_COLUMNS.length)
    return { ok: false, reason: NO_HEADER_REASON };
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `The header is missing ${missing.join(", ")}. Download the template and compare the first line.`,
    };
  }
  return { ok: true, index };
}

function cellsOf(row: readonly string[], index: HeaderIndex): Record<RecruitImportColumn, string> {
  const cells = {} as Record<RecruitImportColumn, string>;
  for (const column of RECRUIT_IMPORT_COLUMNS) {
    const at = index[column];
    cells[column] = at === undefined ? "" : (row[at] ?? "");
  }
  return cells;
}

function phoneTail(value: string): string {
  return value.replace(/\D/g, "").slice(-9);
}

/**
 * The roster's within-file rule — the same first name, last name and mobile
 * is the same person, and the later line is refused naming the earlier — and
 * one more: a later line carrying an earlier line's mobile or email under
 * another name is refused too. Both would be written as new people in one
 * transaction, and the second would then collide with the first's contact.
 */
function withinFileReason(row: ParsedRecruitRow, seen: Map<string, number>): string | null {
  const keys: [string, string][] = [];
  if (row.cells.first_name && row.cells.last_name && row.cells.mobile) {
    keys.push([
      `person|${row.cells.first_name.toLowerCase()}|${row.cells.last_name.toLowerCase()}|${phoneTail(row.cells.mobile)}`,
      "same person — same first name, last name and mobile",
    ]);
  }
  if (row.cells.mobile && phoneTail(row.cells.mobile) !== "") {
    keys.push([`mobile|${phoneTail(row.cells.mobile)}`, "same mobile"]);
  }
  for (const column of ["college_email", "personal_email"] as const) {
    if (row.cells[column]) keys.push([`email|${row.cells[column].toLowerCase()}`, "same email"]);
  }

  let reason: string | null = null;
  for (const [key, what] of keys) {
    const earlier = seen.get(key);
    if (earlier !== undefined && reason === null) {
      reason = what.startsWith("same person")
        ? `Line ${earlier} in this file is the ${what}.`
        : `Line ${earlier} in this file has the ${what}.`;
    }
  }
  for (const [key] of keys) if (!seen.has(key)) seen.set(key, row.line);
  return reason;
}

export type RecruitImportReadResult =
  | { ok: true; read: { fileName: string | null; rows: readonly ParsedRecruitRow[] } }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

/** The file, shape-checked row by row. Writes nothing; a shape-valid row still needs `./recruit-import.ts`'s duplicate question. */
export function readRecruitImport(options: {
  csvText: string;
  fileName?: string | null;
}): RecruitImportReadResult {
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
      reason: `That file has ${bodyRows.length} rows. An import takes at most ${MAX_IMPORT_ROWS}.`,
    };
  }

  let line = 1;
  const rows: ParsedRecruitRow[] = [];
  const seen = new Map<string, number>();
  for (const raw of parsed.rows.slice(1)) {
    line += 1;
    if (isEmptyCsvRow(raw)) continue;
    const row = parseRow(line, cellsOf(raw, header.index));
    const repeated = withinFileReason(row, seen);
    rows.push(repeated === null ? row : { ...row, reasons: [...row.reasons, repeated] });
  }

  return { ok: true, read: { fileName: options.fileName ?? null, rows } };
}

export const IMPORT_TOO_LARGE_MESSAGE = `That file is larger than ${Math.round(MAX_IMPORT_BYTES / 1024)} KB.`;

export function refuseOversizedRecruitFile(csvText: string): string | null {
  return new TextEncoder().encode(csvText).length > MAX_IMPORT_BYTES
    ? IMPORT_TOO_LARGE_MESSAGE
    : null;
}

// The plan's shape — pure, so the client screen can read it (`./recruit-import.ts` is `server-only`).

/** What matched, in the recruit import's words: first name, last name, known as, college email, personal email, mobile. */
export type RecruitCandidateMatch =
  "first name" | "last name" | "known as" | "college email" | "personal email" | "mobile";

/**
 * - `new`: a person the club does not hold, created.
 * - `existing`: a person the club already holds, made a recruit.
 * - `already_recruit`: already a recruit this season — reported, nothing written.
 * - `refused`: nothing written.
 */
export type RecruitRowOutcome = "new" | "existing" | "already_recruit" | "refused";

export interface RecruitDuplicateCandidate {
  personId: string;
  displayName: string;
  /** `null` when withheld from this seat, or none on record. */
  email: string | null;
  phone: string | null;
  matchedOn: readonly RecruitCandidateMatch[];
  /** Who they are this season, narrowed to the seat's grants as the hand-add's matches are. */
  identity: CandidateIdentity;
}

export interface RecruitPlannedRow {
  line: number;
  outcome: RecruitRowOutcome;
  name: string;
  cells: Readonly<Record<RecruitImportColumn, string>>;
  reasons: readonly string[];
  duplicate: { candidates: readonly RecruitDuplicateCandidate[] } | null;
  matchedPersonId: string | null;
  /** A row resolved by its mobile alone (one person holds it): what matched that person. */
  resolvedOn: readonly RecruitCandidateMatch[] | null;
  /** "Different person" over a candidate holding one of this row's contacts — `createPerson` is given the line as its reason. */
  overridesExactMatch: boolean;
}

export interface RecruitImportTotals {
  new: number;
  existing: number;
  already_recruit: number;
  refused: number;
}

export interface RecruitImportPlan {
  fileName: string | null;
  seasonId: string;
  seasonLabel: string;
  rowCount: number;
  totals: RecruitImportTotals;
  rows: readonly RecruitPlannedRow[];
  applicableCount: number;
  unansweredLines: readonly number[];
  /** How many of the applicable recruits the audience group rule would add to an approved event's audience. */
  audienceAdds: number;
  /** A fingerprint of what applying would write; `./recruit-import.ts` recomputes and refuses on mismatch. */
  digest: string;
}

/** The totals an applied import produced. */
export interface RecruitImportApplied {
  created: number;
  existing: number;
  alreadyRecruits: number;
  refused: number;
  /** Recruits whose welcome cycle was declared (a recorded refusal declares none). */
  welcomesQueued: number;
  /** Recruits the audience group rule added to at least one approved event. */
  addedToAudiences: number;
}

export type RecruitImportPlanResult =
  { ok: true; plan: RecruitImportPlan } | { ok: false; reason: string };

/** `{ "7": "different" }` or `{ "7": "<personId>" }` — never stored, carried through the form. */
export type RecruitDuplicateAnswers = Readonly<Record<string, string>>;
