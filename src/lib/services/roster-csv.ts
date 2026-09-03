/**
 * The roster's own CSV: what a column means, and the shape checks a row must
 * pass before anybody is asked a duplicate question about it. LAN-215,
 * work package `WP-arrival-doors`, workflow `W1`.
 *
 * ## Follows `./event-csv.ts`'s shape, not its identity model
 *
 * `OD7-import-like-events`, Brian 2026-09-01: the roster import follows the
 * event import's shape rather than inventing one — the same three-state
 * screen, the same proposal-before-write contract, the same partial-apply
 * behaviour, the same never-store-the-file posture. What differs is the one
 * thing `W1`'s own specification names as the reason this workflow exists: an
 * event has an `id` column and upserts on it; a person does not carry a
 * spreadsheet identifier, so this module never asks "does this id match" and
 * always asks "who might this already be" — Mission 5's duplicate question
 * (`findPersonCandidates`, `person-duplicate.ts`), not a fourth
 * implementation of it. Because that question needs the database, this module
 * stops short of producing a full plan: it does the **pure** half — reading
 * the file, checking each row's shape, and refusing what a live season could
 * never fix — and `./roster-import.ts` is the other half, which reads the
 * roster and calls `findPersonCandidates` per row inside a transaction.
 *
 * ## The six columns, and the three required ones
 *
 * `first_name`, `last_name` and `mobile` are the required set at every tier
 * (`person-required.ts`'s recruit tier) and are what a welcome needs to
 * arrive. `personal_email`, `college` and `matriculation_year` are optional —
 * things a club spreadsheet genuinely holds and that save the player
 * retyping. Nothing else: no date of birth, no emergency contact — both are
 * asked of every player at onboarding, and neither belongs in a file on a
 * laptop (`acceptance/W1.md`'s locked decision).
 *
 * ## Why it is pure, and has no database
 *
 * The confirmation table is a client component and the uploaded file is never
 * stored — it lives in the request that produced the proposal and in the
 * confirmation form the operator is looking at, exactly as `./event-csv.ts`'s
 * own doc comment states for events. Anything the confirmation renders has to
 * be reachable without `pg`.
 *
 * ## The mobile shape check, since LAN-215's B-007
 *
 * `mobile` used to be checked by a private, deliberately loose rule — any
 * value with seven or more digits — because the club's real files contain
 * numbers one digit short, and rejecting the whole row lost the contact
 * entirely. Brian's correction is that the club's spreadsheet defects and a
 * form a person is typing into are different problems: this file still
 * refuses only the *one row* a bad number appears on, by its own reason,
 * naming the phone — every other row still lands — so tightening the rule
 * costs nothing an operator cannot see and fix. The check itself is now
 * `src/lib/validation/contact.ts`'s `looksLikePhone`, the same predicate
 * `/operate/roster/new` uses, so a number this importer accepts is a number
 * that could actually receive the welcome.
 */

import { looksLikeEmail, looksLikePhone } from "@/lib/validation/contact";

import { isEmptyCsvRow, parseCsv, type CsvTable } from "./csv";

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** The columns this importer reads, in the order the template writes them. */
export const IMPORT_COLUMNS = [
  "first_name",
  "last_name",
  "mobile",
  "personal_email",
  "college",
  "matriculation_year",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/**
 * Without these three a row has no meaning at all: a welcome needs a mobile
 * to arrive at, and a person needs a name. `personal_email`, `college` and
 * `matriculation_year` are read as blank when the header omits them, on the
 * same "an absent column means nobody has that fact" reasoning
 * `./event-csv.ts` uses for its own optional columns.
 */
export const REQUIRED_HEADER_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "first_name",
  "last_name",
  "mobile",
]);

/**
 * A season's squad is dozens of people, not thousands — the size limits here
 * are generous headroom over that, on the identical "refuse the whole file,
 * before any row is read" contract `./event-csv.ts` states for its own
 * limits.
 */
export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_IMPORT_ROWS = 500;

/** The empty club's download: the header row and nothing else. */
export function importTemplateCsv(): string {
  return IMPORT_COLUMNS.join(",") + "\r\n";
}

// ---------------------------------------------------------------------------
// One row, shape-checked
// ---------------------------------------------------------------------------

/** Whether a cell says anything at all — `./event-csv.ts`'s identical `said()`. */
function said(cell: string): boolean {
  return cell.trim() !== "";
}

export function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** One row, read and shape-checked, before anybody has asked the database anything. */
export interface ParsedRosterRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  /** Every cell as the file wrote it, trimmed. Shown on a refused row so the operator can see what they typed. */
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

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Within-file duplicates
// ---------------------------------------------------------------------------

/** first name + last name + mobile, compared case-insensitively — the same three fields the required set fixes. */
function withinFileKey(row: ParsedRosterRow): string | null {
  if (!row.firstName || !row.lastName || !row.mobile) return null;
  const phoneTail = row.mobile.replace(/\D/g, "").slice(-9);
  return `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${phoneTail}`;
}

/**
 * Every row whose key another, earlier row already carries.
 *
 * `W1`'s exceptions table: "Two rows in the file are the same person → The
 * second is Refused, naming the first line." — the file's own internal
 * question, entirely independent of what the database holds.
 */
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

// ---------------------------------------------------------------------------
// Reading the whole file
// ---------------------------------------------------------------------------

export interface RosterImportRead {
  fileName: string | null;
  rows: readonly ParsedRosterRow[];
}

export type RosterImportReadResult =
  | { ok: true; read: RosterImportRead }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

/**
 * The file, shape-checked row by row. Writes nothing and touches no
 * database — every reason a row appears here is one the database could never
 * fix. A row with no shape reason still needs `./roster-import.ts`'s own
 * duplicate question before it is known to be `new`, `carried_forward` or
 * `unchanged`.
 */
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

/** The size limit, applied to the text before anything else looks at it. */
export function refuseOversizedRosterFile(csvText: string): string | null {
  const bytes = Buffer.byteLength(csvText, "utf8");
  return bytes > MAX_IMPORT_BYTES ? IMPORT_TOO_LARGE_MESSAGE : null;
}

// ---------------------------------------------------------------------------
// The plan's shape — pure, so the client confirmation screen can read it
// ---------------------------------------------------------------------------
//
// `./roster-import.ts` is `server-only` and produces values of these types;
// this module only declares their *shape*, on the identical split
// `./event-csv.ts` (pure) / `./event-import.ts` (server-only) already makes.
// A type import from a `server-only` module is exactly the leak the events
// screen's own `import-state.ts` warns against, so every shape the
// confirmation screen needs to read is declared here instead — including a
// local copy of `roster.ts`'s `CandidateMatch` union, which is `server-only`
// too even though the four-string type itself carries no behaviour.

export type RosterCandidateMatch = "given name" | "family name" | "known as" | "email" | "phone";

export type RosterRowOutcome = "new" | "carried_forward" | "unchanged" | "refused";

/** One candidate shown beside an incoming row, for the operator's answer. */
export interface RosterDuplicateCandidate {
  personId: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchedOn: readonly RosterCandidateMatch[];
  /** The season label they already hold a membership for, when they do. */
  currentMembershipSeasonLabel: string | null;
}

export interface RosterPlannedRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  outcome: RosterRowOutcome;
  /** What to call the row: the person's name, or "(no name)" when neither part could be read. */
  name: string;
  cells: Readonly<Record<ImportColumn, string>>;
  /** Why the row was refused. Empty for every other outcome. */
  reasons: readonly string[];
  /** Present exactly when this row has one or more possible duplicates — answered or not. */
  duplicate: { candidates: readonly RosterDuplicateCandidate[] } | null;
  /** The person this row resolved to, for `carried_forward` and `unchanged`. */
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
  /** `new` plus `carried_forward` — what confirming actually writes. */
  applicableCount: number;
  /** Lines still waiting on an operator answer. Confirming while this is non-empty still refuses only those rows. */
  unansweredLines: readonly number[];
  /**
   * A fingerprint of exactly what applying would write, given the operator's
   * duplicate answers so far. `./roster-import.ts` recomputes the plan inside
   * the apply transaction and refuses when this no longer matches.
   */
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
