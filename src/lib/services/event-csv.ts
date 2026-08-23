/**
 * The club's CSV: what a column means, what a row does, and what the file is
 * refused for. LAN-155, work package `WP-csv-import`, workflow `W3`.
 *
 * ## The shape Brian settled on, 2026-08-21
 *
 * There is **no term-card parser and no AI inside the system**. The club's term
 * card is a different shape every season, so the application does not read it:
 * the conversion happens outside, in whatever tool the club already uses, guided
 * by `IMPORT_PROMPT` below, and the application accepts one finished CSV.
 *
 * Four rules govern every row, and none of them is an implementation choice:
 *
 *   * **`REQ-upsert-only`.** An `id` updates, a blank `id` creates, an unmatched
 *     `id` refuses that row and lets every other row proceed. **Nothing is ever
 *     deleted by an import** — an event in the season and absent from the file
 *     is left exactly as it was, which is what makes it safe to export one term,
 *     edit it, and import it back without taking the rest of the season with it.
 *   * **`REQ-import-drafts-only`.** An import may not *change* an approved or
 *     cancelled event. The refusal is narrow on purpose: an unchanged row is a
 *     no-op whatever the status, so a clean export and re-import does nothing at
 *     all rather than producing a screen of refusals.
 *   * **A blank or whitespace-only cell changes nothing.** Brian: "If it's blank
 *     or has white space, it means no change. Only if it has non-white space
 *     does it then change." There is therefore deliberately no way to *clear* a
 *     field by import — a spreadsheet round trip drops trailing values far more
 *     often than anybody deliberately empties one, and clearing a field on the
 *     event itself takes one edit.
 *   * **`REQ-import-confirmation`.** Nothing here writes anything. This module
 *     produces a *proposal*; `./event-import.ts` applies one, in one
 *     transaction, only after the operator has confirmed it.
 *
 * ## Why it is pure, and has no database
 *
 * Two reasons, and the second is the one that matters. The confirmation table is
 * a client component, so anything it renders has to be reachable without `pg` —
 * the same split `./event-input.ts` documents. And the copyable prompt's worked
 * example is **asserted by test to import cleanly**: a prompt that produces a
 * file the importer rejects is worse than no prompt, because it fails in
 * somebody else's tool where nobody can see it. That assertion is a unit test
 * against this module precisely because this module needs no server.
 *
 * ## The columns, and the ones deliberately absent
 *
 * The column set is the event record and nothing else. **Audience** is not a
 * column (D48) — it is confirmed one event at a time at approval. **Status** is
 * not, because an import makes drafts and may not change an approved event, so
 * there is nothing to set. **Term and week** are not, because they are derived
 * from the date (D9, D85). **Questions and RSVP timing** are not, because they
 * arrive from the type's template (D42). The **joining URL** is not, which is
 * `REQ-no-joining-url` holding: a bulk file never carries an online event's
 * link, and no row here can write one.
 */

import {
  DRAFTABLE_EVENT_TYPES,
  isFiveMinuteIncrement,
  trimmed,
  type EventDeliveryMode,
  type EventDraftInput,
  type EventStatus,
} from "./event-input";
import { isEmptyCsvRow, formatCsv, parseCsv, type CsvTable } from "./csv";
import { STATUS_LABELS, labelFor } from "./event-vocabulary";

// ---------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------

/** The columns an import reads, in the order the template writes them. */
export const IMPORT_COLUMNS = [
  "id",
  "name",
  "type",
  "date",
  "start",
  "end",
  "online",
  "venue",
  "description",
  "required_equipment",
  "mandatory",
] as const;

export type ImportColumn = (typeof IMPORT_COLUMNS)[number];

/**
 * The two the export adds and the import ignores.
 *
 * `status` so the operator can see what they are editing, and `term_week` so
 * they can orient themselves against the term card they are working from. Both
 * are read-only: an import makes drafts and derives the term from the date, so
 * neither is the operator's to set, and a row that changes one changes nothing.
 */
export const READ_ONLY_EXPORT_COLUMNS = ["status", "term_week"] as const;

/** The export is the import template, populated. There is no second format. */
export const EXPORT_COLUMNS: readonly string[] = Object.freeze([
  ...IMPORT_COLUMNS,
  ...READ_ONLY_EXPORT_COLUMNS,
]);

/**
 * What the header must name for the file to be one this importer reads.
 *
 * Not all eleven, deliberately. A spreadsheet that has never had an equipment
 * value in it drops the column on save, and refusing the whole file for that
 * would be refusing a file whose every row is fine — an absent column is read
 * as blank, and blank already means "leave it alone". These four are the ones
 * without which a row has no meaning: `id` decides create-or-update, and a new
 * row is nothing without a name, a type and a date to place it on.
 */
export const REQUIRED_HEADER_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "id",
  "name",
  "type",
  "date",
]);

/**
 * The delegated dialect limits (Mission Lead delegation: "exact CSV dialect,
 * encoding, delimiter and size limits").
 *
 * A term is sixty-odd events and a season under two hundred, so a megabyte is
 * roughly two orders of magnitude of headroom and a file above it is not a term
 * card. Both limits refuse the file **whole and before any row is read**, which
 * is the point: the confirmation screen holds the file's text in the form while
 * the operator reads it, and an unbounded file would be echoed back through the
 * browser.
 */
export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_IMPORT_ROWS = 2_000;

/**
 * The seven types, in the words the file uses.
 *
 * `S&C` rather than `Strength and conditioning`: the CSV vocabulary is Brian's
 * own list from `W3` — "Practice · S&C · Chalk · Game · Social · Recruitment ·
 * Meeting" — and it is what the prompt tells an outside tool to produce. It is
 * deliberately not `TYPE_LABELS`, which is the club's word for a *screen*; the
 * two agree on six of seven and the seventh is a column heading in a
 * spreadsheet, where "Strength and conditioning" is a paragraph.
 */
export const CSV_TYPE_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  practice: "Practice",
  strength_and_conditioning: "S&C",
  chalk: "Chalk",
  game: "Game",
  social: "Social",
  recruitment: "Recruitment",
  meeting: "Meeting",
});

/** Every spelling of a type this importer accepts, normalised. */
const TYPE_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  practice: "practice",
  "s&c": "strength_and_conditioning",
  sc: "strength_and_conditioning",
  "s and c": "strength_and_conditioning",
  "s+c": "strength_and_conditioning",
  "strength and conditioning": "strength_and_conditioning",
  strength_and_conditioning: "strength_and_conditioning",
  chalk: "chalk",
  game: "game",
  social: "social",
  recruitment: "recruitment",
  meeting: "meeting",
});

/** The seven, as the refusal sentence lists them. */
export const TYPE_TOKEN_LIST = DRAFTABLE_EVENT_TYPES.map((type) => CSV_TYPE_TOKENS[type]).join(", ");

/** `yes` and `no`, and the spellings a spreadsheet substitutes for them. */
const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0"]);

// ---------------------------------------------------------------------------
// The copyable prompt
// ---------------------------------------------------------------------------

/**
 * Bumped whenever `IMPORT_PROMPT` changes. Shown beside the block so an operator
 * who kept a copy can tell whether theirs is the current one.
 */
export const IMPORT_PROMPT_VERSION = 1;

/**
 * The static, versioned block an operator copies into a general-purpose AI tool
 * alongside the club's own calendar.
 *
 * Its whole purpose is that the messy conversion happens **outside** this
 * application. It states the columns, the seven permitted types, the date and
 * time formats, the rule that `id` is left blank for a new event, a short worked
 * example, and an instruction to return only CSV.
 *
 * The worked example below is asserted by `./event-csv.test.ts` to parse into
 * two clean New rows. That assertion is not decoration: this text is the one
 * part of the workflow that runs where nobody can see it fail.
 */
export const IMPORT_PROMPT = `Convert our club calendar into the Oxford Lancers import format.

Return ONLY a CSV file with this exact header row and no other text:

id,name,type,date,start,end,online,venue,description,required_equipment,mandatory

Rules
- id: leave EMPTY for every event. The system assigns identifiers.
- type: exactly one of ${TYPE_TOKEN_LIST}.
- date: YYYY-MM-DD.
- start / end: HH:MM, 24-hour, in five-minute steps. All times are UK local time.
- online: yes or no. Use yes for anything on Teams, Zoom or similar.
- venue: the street address when in person; the meeting destination when online.
- description: anything that does not fit another column.
- required_equipment: kit players must bring. Leave empty if none.
- mandatory: yes if attendance is expected, otherwise no.
- The opponent goes in the name, e.g. "vs Brackenridge Bulls". There is no opponent column.

Example
id,name,type,date,start,end,online,venue,description,required_equipment,mandatory
,Practice — michaelmas week 1,Practice,2026-10-14,20:00,22:00,no,Iffley Road Astro,Full contact.,Gumshield,yes
,Chalk — michaelmas week 1,Chalk,2026-10-13,18:00,19:00,yes,Microsoft Teams,Install review.,,no

Now here is our calendar:`;

/**
 * The worked example on its own, so the test that proves it imports cleanly
 * reads it from the prompt rather than from a copy that can drift.
 */
export function workedExampleCsv(): string {
  const lines = IMPORT_PROMPT.split("\n");
  const start = lines.indexOf("Example");
  const header = lines[start + 1];
  const rows = lines.slice(start + 2, start + 4);
  return [header, ...rows].join("\r\n") + "\r\n";
}

/** The empty season's download: the header row and nothing else. */
export function importTemplateCsv(): string {
  return formatCsv([EXPORT_COLUMNS]);
}

// ---------------------------------------------------------------------------
// What an import compares itself against
// ---------------------------------------------------------------------------

/**
 * One event in the season, in exactly the fields an import can read or write.
 *
 * `joiningUrl` is here and is never a column: it is read so that a row turning
 * an online event in person can be refused rather than left to
 * `events_joining_url_is_for_online_events` to reject at the last moment, and it
 * is carried through an update untouched.
 */
export interface ImportableEvent {
  id: string;
  name: string;
  eventType: string;
  status: EventStatus;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  joiningUrl: string | null;
  isMandatory: boolean;
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

export type RowOutcome = "new" | "updated" | "unchanged" | "refused";

/** One field an update row changes, named as the file names it. */
export interface FieldChange {
  column: ImportColumn;
  from: string;
  to: string;
}

/** One cell as the confirmation renders it: the value, and what it replaces. */
export interface PlanCell {
  value: string;
  /** The value being replaced, on a changed cell only. */
  previous: string | null;
}

export interface PlannedRow {
  /** The line in the file, counting the header as line 1. */
  line: number;
  outcome: RowOutcome;
  /** What to call the row: the event's name, or the file's. */
  name: string;
  /** The event this row matched, when it matched one. */
  eventId: string | null;
  /** "Draft", "Approved", "Cancelled", or "—" for a row that matched nothing. */
  status: string;
  cells: Readonly<Record<ImportColumn, PlanCell>>;
  changes: readonly FieldChange[];
  /** Why the row was refused. Empty for every other outcome. */
  reasons: readonly string[];
  /** What applying this row does. `null` for unchanged and refused rows. */
  write: PlannedWrite | null;
}

export type PlannedWrite =
  | { kind: "create"; input: EventDraftInput }
  | { kind: "update"; eventId: string; input: EventDraftInput };

export interface ImportTotals {
  new: number;
  updated: number;
  unchanged: number;
  refused: number;
}

export interface ImportPlan {
  fileName: string | null;
  rowCount: number;
  totals: ImportTotals;
  rows: readonly PlannedRow[];
  /** New plus updated — what the Apply button counts. */
  applicableCount: number;
  /**
   * A fingerprint of exactly what applying would write.
   *
   * The confirmation is a proposal computed at one moment and applied at
   * another, and the season can move in between — another operator approves an
   * event, or edits a draft this file also changes. `./event-import.ts` recomputes
   * the plan inside the apply transaction and refuses when this no longer
   * matches, so what is written is always what the operator read.
   */
  digest: string;
}


/** The totals an applied import produced, as the screen reports them. */
export interface ImportApplied {
  created: number;
  updated: number;
  unchanged: number;
  refused: number;
}

export type ImportPlanResult =
  | { ok: true; plan: ImportPlan }
  /** The file is refused whole, before any row is read. */
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

export interface PlanImportOptions {
  csvText: string;
  fileName?: string | null;
  /** Every event in the open season, cancelled ones included. */
  events: readonly ImportableEvent[];
}

/**
 * The whole file, read against the season, as a proposal.
 *
 * Nothing here writes. The two shapes of failure are kept apart exactly as the
 * workflow's exception table asks: a file that is not a CSV or has no header
 * this importer recognises is refused **whole, before any row is read**, and
 * everything else is a per-row refusal that leaves every other row proceeding —
 * "never a silent partial success".
 */
export function planImport(options: PlanImportOptions): ImportPlanResult {
  const parsed = parseCsv(options.csvText);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };

  const header = readHeader(parsed.rows);
  if (!header.ok) return { ok: false, reason: header.reason };

  const bodyRows = parsed.rows.slice(1).filter((row) => !isEmptyCsvRow(row));
  if (bodyRows.length === 0) {
    return {
      ok: false,
      reason: "That file has a header row and no events under it. There is nothing to import.",
    };
  }
  if (bodyRows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      reason: `That file has ${bodyRows.length} rows. An import takes at most ${MAX_IMPORT_ROWS}, which is far more than a season.`,
    };
  }

  const byId = new Map(options.events.map((event) => [event.id, event]));
  const duplicated = duplicateIds(parsed.rows, header.index);

  // Line numbers count the header as line 1 and every row after it in file
  // order, blank lines included — the operator is reading the same file in a
  // spreadsheet, and a number that skipped blanks would not match their screen.
  let line = 1;
  const rows: PlannedRow[] = [];
  for (const raw of parsed.rows.slice(1)) {
    line += 1;
    if (isEmptyCsvRow(raw)) continue;
    rows.push(planRow(line, cellsOf(raw, header.index), byId, duplicated));
  }

  const totals: ImportTotals = { new: 0, updated: 0, unchanged: 0, refused: 0 };
  for (const row of rows) {
    if (row.outcome === "new") totals.new += 1;
    else if (row.outcome === "updated") totals.updated += 1;
    else if (row.outcome === "unchanged") totals.unchanged += 1;
    else totals.refused += 1;
  }

  return {
    ok: true,
    plan: {
      fileName: options.fileName ?? null,
      rowCount: rows.length,
      totals,
      rows,
      applicableCount: totals.new + totals.updated,
      digest: digestOf(rows),
    },
  };
}

/** Every write the plan proposes, in file order. */
export function plannedWrites(plan: ImportPlan): readonly PlannedWrite[] {
  return plan.rows.flatMap((row) => (row.write === null ? [] : [row.write]));
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

type HeaderIndex = Partial<Record<ImportColumn, number>>;

type HeaderRead =
  | { ok: true; index: HeaderIndex }
  | { ok: false; reason: string };

const NO_HEADER_REASON =
  "The file has no header row this importer recognises. Download the template and compare the first line.";

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
        reason: `The header names “${name}” twice, so which column the importer should read cannot be worked out.`,
      };
    }
    seen.add(name);
    index[name] = column;
  }

  const missing = REQUIRED_HEADER_COLUMNS.filter((column) => index[column] === undefined);
  if (missing.length === REQUIRED_HEADER_COLUMNS.length) return { ok: false, reason: NO_HEADER_REASON };
  if (missing.length > 0) {
    return {
      ok: false,
      reason: `The header is missing ${missing.join(", ")}. Download the template and compare the first line.`,
    };
  }

  return { ok: true, index };
}

/** `" Required Equipment "` and `"required_equipment"` are the same column. */
function normaliseHeaderCell(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isImportColumn(value: string): value is ImportColumn {
  return (IMPORT_COLUMNS as readonly string[]).includes(value);
}

function cellsOf(row: readonly string[], index: HeaderIndex): Record<ImportColumn, string> {
  const cells = {} as Record<ImportColumn, string>;
  for (const column of IMPORT_COLUMNS) {
    const at = index[column];
    cells[column] = at === undefined ? "" : (row[at] ?? "");
  }
  return cells;
}

/**
 * Every `id` the file uses more than once.
 *
 * The workflow is explicit that both rows are refused rather than one applied:
 * "the operator's file is ambiguous and the system will not pick".
 */
function duplicateIds(rows: CsvTable, index: HeaderIndex): ReadonlySet<string> {
  const at = index.id;
  if (at === undefined) return new Set();
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const row of rows.slice(1)) {
    if (isEmptyCsvRow(row)) continue;
    const id = trimmed(row[at] ?? "").toLowerCase();
    if (id === "") continue;
    if (seen.has(id)) twice.add(id);
    seen.add(id);
  }
  return twice;
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------

/**
 * Whether a cell says anything at all.
 *
 * Brian, 2026-08-21: "A blank field on a CSV means no change. This includes
 * other types of white space or anything like that." A non-breaking space is
 * whitespace a spreadsheet produces and `String.prototype.trim` already removes,
 * along with tabs, ordinary spaces and line separators — so "blank" is exactly
 * "trims to nothing", and there is no second definition anywhere in this file.
 */
function said(cell: string): boolean {
  return cell.trim() !== "";
}

function planRow(
  line: number,
  cells: Record<ImportColumn, string>,
  byId: ReadonlyMap<string, ImportableEvent>,
  duplicated: ReadonlySet<string>,
): PlannedRow {
  const reasons: string[] = [];
  const rawId = trimmed(cells.id);
  const match = rawId === "" ? null : (byId.get(rawId) ?? byId.get(rawId.toLowerCase()) ?? null);

  // --- what each cell says, before anything is decided about the row --------
  const parsedName = said(cells.name) ? trimmed(cells.name) : null;

  let parsedType: string | null = null;
  if (said(cells.type)) {
    const alias = TYPE_ALIASES[trimmed(cells.type).toLowerCase().replace(/\s+/g, " ")];
    if (alias === undefined) {
      reasons.push(
        `“type” reads “${trimmed(cells.type)}”. It must be one of ${TYPE_TOKEN_LIST}.`,
      );
    } else {
      parsedType = alias;
    }
  }

  let parsedDate: string | null = null;
  if (said(cells.date)) {
    const date = trimmed(cells.date);
    if (!isCalendarDate(date)) {
      reasons.push(`“date” reads “${date}”. Dates are YYYY-MM-DD.`);
    } else {
      parsedDate = date;
    }
  }

  const parsedStart = parseTimeCell("start", cells.start, reasons);
  const parsedEnd = parseTimeCell("end", cells.end, reasons);
  const parsedOnline = parseBooleanCell("online", cells.online, reasons);
  const parsedMandatory = parseBooleanCell("mandatory", cells.mandatory, reasons);

  const parsedVenue = said(cells.venue) ? trimmed(cells.venue) : null;
  const parsedDescription = said(cells.description) ? trimmed(cells.description) : null;
  const parsedEquipment = said(cells.required_equipment)
    ? trimmed(cells.required_equipment)
    : null;

  // --- identity ------------------------------------------------------------
  if (rawId !== "" && duplicated.has(rawId.toLowerCase())) {
    reasons.push(
      "Another row in this file carries the same id. The file asks for two different changes to one event, and the system will not choose between them.",
    );
  } else if (rawId !== "" && match === null) {
    reasons.push(
      `No event in this season has id ${shortId(rawId)}. Clear the id to add it as a new event.`,
    );
  }

  const displayName = parsedName ?? match?.name ?? "";

  if (reasons.length > 0) {
    return refused(line, displayName, match, cells, reasons);
  }

  // --- a new event ---------------------------------------------------------
  if (match === null) {
    if (parsedName === null) {
      reasons.push(
        "A new row needs a name. Add one, or put back the id of the event you meant to change.",
      );
    }
    if (parsedType === null) {
      reasons.push(`A new row needs a type. It must be one of ${TYPE_TOKEN_LIST}.`);
    }
    if (parsedStart !== null && parsedEnd !== null && parsedEnd <= parsedStart) {
      reasons.push(
        `“end” (${parsedEnd}) is not after “start” (${parsedStart}).`,
      );
    }
    if (reasons.length > 0) return refused(line, displayName, null, cells, reasons);

    const input: EventDraftInput = {
      name: parsedName as string,
      eventType: parsedType as string,
      scheduledOn: parsedDate,
      startsAt: parsedStart,
      endsAt: parsedEnd,
      // Absent is in person (D20) — what the club runs, and the only default
      // here that is a fact rather than an assumption about what somebody meant.
      deliveryMode: parsedOnline === true ? "online" : "in_person",
      venue: parsedVenue,
      description: parsedDescription,
      requiredEquipment: parsedEquipment,
      // An import never carries an online event's link (REQ-no-joining-url).
      joiningUrl: null,
      // Blank means unset, and an unset expectation is not an expectation. An
      // event never quietly claims attendance is required because nobody said.
      isMandatory: parsedMandatory === true,
    };

    return {
      line,
      outcome: "new",
      name: input.name,
      eventId: null,
      status: "—",
      cells: newCells(input),
      changes: [],
      reasons: [],
      write: { kind: "create", input },
    };
  }

  // --- an existing event: blank leaves every field alone --------------------
  const merged: EventDraftInput = {
    name: parsedName ?? match.name,
    eventType: parsedType ?? match.eventType,
    scheduledOn: parsedDate ?? match.scheduledOn,
    startsAt: parsedStart ?? match.startsAt,
    endsAt: parsedEnd ?? match.endsAt,
    deliveryMode:
      parsedOnline === null ? match.deliveryMode : parsedOnline ? "online" : "in_person",
    venue: parsedVenue ?? match.venue,
    description: parsedDescription ?? match.description,
    requiredEquipment: parsedEquipment ?? match.requiredEquipment,
    // Carried through untouched. No column writes it and no row clears it.
    joiningUrl: match.joiningUrl,
    isMandatory: parsedMandatory ?? match.isMandatory,
  };

  const changes = changesBetween(match, merged);

  if (changes.length === 0) {
    // The narrow refusal: an unchanged row is a no-op **whatever the status**,
    // so a straight export-and-reimport does nothing rather than producing a
    // screen of refusals for an edit nobody made.
    return {
      line,
      outcome: "unchanged",
      name: match.name,
      eventId: match.id,
      status: labelFor(STATUS_LABELS, match.status),
      cells: currentCells(match),
      changes: [],
      reasons: [],
      write: null,
    };
  }

  if (match.status !== "draft") {
    return refused(line, merged.name, match, cells, [
      `This event is ${match.status === "approved" ? "approved" : "cancelled"}. An import only changes drafts — amend it on its own page.`,
    ]);
  }

  if (merged.startsAt !== null && merged.endsAt !== null && merged.endsAt <= merged.startsAt) {
    return refused(line, merged.name, match, cells, [
      `“end” (${merged.endsAt}) is not after “start” (${merged.startsAt}).`,
    ]);
  }

  // `events_joining_url_is_for_online_events`, said here so the operator reads a
  // sentence rather than watching the whole import fail on a constraint.
  if (merged.deliveryMode === "in_person" && merged.joiningUrl !== null) {
    return refused(line, merged.name, match, cells, [
      "This event has a joining link, which belongs to an online event. Clear the link on the event itself before making it in person.",
    ]);
  }

  return {
    line,
    outcome: "updated",
    name: merged.name,
    eventId: match.id,
    status: labelFor(STATUS_LABELS, match.status),
    cells: updatedCells(match, merged, changes),
    changes,
    reasons: [],
    write: { kind: "update", eventId: match.id, input: merged },
  };
}

function refused(
  line: number,
  name: string,
  match: ImportableEvent | null,
  cells: Record<ImportColumn, string>,
  reasons: readonly string[],
): PlannedRow {
  return {
    line,
    outcome: "refused",
    name: name === "" ? "(no name)" : name,
    eventId: match?.id ?? null,
    status: match === null ? "—" : labelFor(STATUS_LABELS, match.status),
    // A refused row shows what the operator typed, not what the event holds:
    // the point of the screen is that they can see the cell to correct.
    cells: rawCells(cells),
    changes: [],
    reasons,
    write: null,
  };
}

// ---------------------------------------------------------------------------
// Cell parsing
// ---------------------------------------------------------------------------

const TIME_CELL = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeCell(
  column: "start" | "end",
  cell: string,
  reasons: string[],
): string | null {
  if (!said(cell)) return null;
  const value = trimmed(cell);
  // A spreadsheet writes 20:00:00 as readily as 20:00. Both mean eight o'clock.
  const candidate = /^\d{2}:\d{2}:\d{2}$/.test(value) ? value.slice(0, 5) : value;
  if (!TIME_CELL.test(candidate)) {
    reasons.push(
      `“${column}” reads “${value}”. Times are HH:MM on the 24-hour clock.`,
    );
    return null;
  }
  if (!isFiveMinuteIncrement(candidate)) {
    reasons.push(
      `“${column}” reads “${value}”. Times go in five-minute steps.`,
    );
    return null;
  }
  return candidate;
}

function parseBooleanCell(
  column: "online" | "mandatory",
  cell: string,
  reasons: string[],
): boolean | null {
  if (!said(cell)) return null;
  const value = trimmed(cell).toLowerCase();
  if (YES.has(value)) return true;
  if (NO.has(value)) return false;
  reasons.push(
    `“${column}” reads “${trimmed(cell)}”. It must be yes or no.`,
  );
  return null;
}

/** A real calendar date, so 2026-02-30 is refused rather than rolled forward. */
function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** `9c14e0…`, which is how the refusal names an id nobody can read anyway. */
function shortId(id: string): string {
  return id.length <= 6 ? id : `${id.slice(0, 6)}…`;
}

// ---------------------------------------------------------------------------
// Comparison and display
// ---------------------------------------------------------------------------

/** The columns compared, in the order the confirmation shows them. */
const COMPARED_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "name",
  "type",
  "date",
  "start",
  "end",
  "online",
  "venue",
  "description",
  "required_equipment",
  "mandatory",
]);

function valueOf(event: CompareShape, column: ImportColumn): string {
  switch (column) {
    case "id":
      return "";
    case "name":
      return event.name;
    case "type":
      return CSV_TYPE_TOKENS[event.eventType] ?? event.eventType;
    case "date":
      return event.scheduledOn ?? "";
    case "start":
      return event.startsAt ?? "";
    case "end":
      return event.endsAt ?? "";
    case "online":
      return event.deliveryMode === "online" ? "yes" : "no";
    case "venue":
      return event.venue ?? "";
    case "description":
      return event.description ?? "";
    case "required_equipment":
      return event.requiredEquipment ?? "";
    case "mandatory":
      return event.isMandatory ? "yes" : "no";
  }
}

interface CompareShape {
  name: string;
  eventType: string;
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  isMandatory: boolean;
}

function changesBetween(before: CompareShape, after: CompareShape): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const column of COMPARED_COLUMNS) {
    const from = valueOf(before, column);
    const to = valueOf(after, column);
    if (from !== to) changes.push({ column, from, to });
  }
  return changes;
}

function blankCells(): Record<ImportColumn, PlanCell> {
  const cells = {} as Record<ImportColumn, PlanCell>;
  for (const column of IMPORT_COLUMNS) cells[column] = { value: "", previous: null };
  return cells;
}

function newCells(input: EventDraftInput): Record<ImportColumn, PlanCell> {
  const cells = blankCells();
  for (const column of COMPARED_COLUMNS) cells[column] = { value: valueOf(input, column), previous: null };
  return cells;
}

function currentCells(event: ImportableEvent): Record<ImportColumn, PlanCell> {
  const cells = blankCells();
  cells.id = { value: event.id, previous: null };
  for (const column of COMPARED_COLUMNS) cells[column] = { value: valueOf(event, column), previous: null };
  return cells;
}

function updatedCells(
  before: ImportableEvent,
  after: CompareShape,
  changes: readonly FieldChange[],
): Record<ImportColumn, PlanCell> {
  const changed = new Map(changes.map((change) => [change.column, change]));
  const cells = blankCells();
  cells.id = { value: before.id, previous: null };
  for (const column of COMPARED_COLUMNS) {
    const change = changed.get(column);
    cells[column] = change
      ? { value: change.to, previous: change.from }
      : { value: valueOf(after, column), previous: null };
  }
  return cells;
}

function rawCells(cells: Record<ImportColumn, string>): Record<ImportColumn, PlanCell> {
  const shown = blankCells();
  for (const column of IMPORT_COLUMNS) shown[column] = { value: trimmed(cells[column]), previous: null };
  return shown;
}

// ---------------------------------------------------------------------------
// The digest
// ---------------------------------------------------------------------------

/**
 * A fingerprint of exactly the writes a plan proposes.
 *
 * FNV-1a, twice, over a canonical rendering — not a cryptographic hash, and it
 * does not need to be. Nothing here is a secret and nothing is defended against
 * a forger: the operator's own browser holds the file, and what this catches is
 * the season moving between the confirmation and the apply. An attacker who
 * could choose the digest could only make their own import refuse.
 */
export function digestOf(rows: readonly PlannedRow[]): string {
  const canonical = rows
    .map((row) => {
      if (row.write === null) return `${row.line}|${row.outcome}|${row.eventId ?? ""}`;
      const target = row.write.kind === "update" ? row.write.eventId : "";
      return `${row.line}|${row.write.kind}|${target}|${JSON.stringify(row.write.input)}`;
    })
    .join("\n");

  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b + code, 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

// ---------------------------------------------------------------------------
// The export
// ---------------------------------------------------------------------------

/** One event, as the export writes it. `termWeek` is the caller's to compute. */
export interface ExportableEvent extends ImportableEvent {
  termWeek: string;
}

/**
 * Every event in the season, in the import's columns plus the two read-only
 * ones. **Cancelled events are included** — leaving one out would make it
 * invisible in the file and look like something to re-add.
 */
export function formatSeasonExport(events: readonly ExportableEvent[]): string {
  return formatCsv([
    EXPORT_COLUMNS,
    ...events.map((event) => [
      event.id,
      ...COMPARED_COLUMNS.map((column) => valueOf(event, column)),
      labelFor(STATUS_LABELS, event.status),
      event.termWeek,
    ]),
  ]);
}

/** The download's filename, for both the empty template and a populated season. */
export function exportFileName(seasonLabel: string | null): string {
  const season = (seasonLabel ?? "").replace(/[^0-9a-zA-Z-]+/g, "-").replace(/^-+|-+$/g, "");
  return season === "" ? "lancers-events-template.csv" : `lancers-events-${season}.csv`;
}
