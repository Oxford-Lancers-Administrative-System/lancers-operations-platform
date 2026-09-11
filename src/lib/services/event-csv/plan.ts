import { isFiveMinuteIncrement, trimmed } from "../event-input";
import { isEmptyCsvRow, parseCsv, type CsvTable } from "../csv";
import { STATUS_LABELS, labelFor } from "../event-vocabulary";
import {
  currentCells,
  newCells,
  rawCells,
  updatedCells,
  changesBetween,
  type PlannedInput,
} from "./compare";
import { digestOf } from "./export";
import {
  IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  REQUIRED_HEADER_COLUMNS,
  TYPE_CELL_EXPECTATION,
  YES,
  NO,
  resolveTemplate,
  type ImportableEvent,
  type ImportableTemplate,
  type ImportColumn,
  type ImportPlan,
  type ImportPlanResult,
  type PlanImportOptions,
  type PlannedRow,
  type PlannedWrite,
} from "./shared";

/**
 * The whole file, read row by row, into a plan — LAN-155's core algorithm.
 * Decision history: docs/ux/tickets/LAN-155-csv-import.md.
 */

// Nothing here writes. A file that is not a CSV or has no recognised header is refused whole,
// before any row is read; everything else is a per-row refusal — never a silent partial success.
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

  let line = 1; // counts the header as line 1, blank lines included, to match the operator's spreadsheet
  const rows: PlannedRow[] = [];
  for (const raw of parsed.rows.slice(1)) {
    line += 1;
    if (isEmptyCsvRow(raw)) continue;
    rows.push(planRow(line, cellsOf(raw, header.index), byId, duplicated, options.templates));
  }

  const totals = { new: 0, updated: 0, unchanged: 0, refused: 0 };
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

type HeaderIndex = Partial<Record<ImportColumn, number>>;

type HeaderRead = { ok: true; index: HeaderIndex } | { ok: false; reason: string };

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

/** `" Required Equipment "` and `"required_equipment"` are the same column. */
function normaliseHeaderCell(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
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

// Both rows are refused rather than one applied — "the operator's file is ambiguous and the system will not pick".
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

// Brian, 2026-08-21: "A blank field on a CSV means no change." "Blank" is exactly "trims to nothing".
function said(cell: string): boolean {
  return cell.trim() !== "";
}

function planRow(
  line: number,
  cells: Record<ImportColumn, string>,
  byId: ReadonlyMap<string, ImportableEvent>,
  duplicated: ReadonlySet<string>,
  templates: readonly ImportableTemplate[],
): PlannedRow {
  const reasons: string[] = [];
  const rawId = trimmed(cells.id);
  const match = rawId === "" ? null : (byId.get(rawId) ?? byId.get(rawId.toLowerCase()) ?? null);

  const parsedName = said(cells.name) ? trimmed(cells.name) : null;

  let parsedTemplate: ImportableTemplate | null = null;
  if (said(cells.type)) {
    parsedTemplate = resolveTemplate(cells.type, templates);
    if (parsedTemplate === null) {
      reasons.push(`“type” reads “${trimmed(cells.type)}”. ${TYPE_CELL_EXPECTATION}`);
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
  const parsedEquipment = said(cells.required_equipment) ? trimmed(cells.required_equipment) : null;

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

  if (match === null) {
    if (parsedName === null) {
      reasons.push(
        "A new row needs a name. Add one, or put back the id of the event you meant to change.",
      );
    }
    if (parsedTemplate === null) {
      reasons.push(`A new row needs a type. ${TYPE_CELL_EXPECTATION}`);
    }
    if (parsedStart !== null && parsedEnd !== null && parsedEnd <= parsedStart) {
      reasons.push(`“end” (${parsedEnd}) is not after “start” (${parsedStart}).`);
    }
    if (reasons.length > 0) return refused(line, displayName, null, cells, reasons);

    const input: PlannedInput = {
      name: parsedName as string,
      templateId: (parsedTemplate as ImportableTemplate).id,
      templateName: (parsedTemplate as ImportableTemplate).name,
      scheduledOn: parsedDate,
      startsAt: parsedStart,
      endsAt: parsedEnd,
      deliveryMode: parsedOnline === true ? "online" : "in_person", // absent is in person (D20)
      venue: parsedVenue,
      description: parsedDescription,
      requiredEquipment: parsedEquipment,
      joiningUrl: null, // an import never carries an online event's link (REQ-no-joining-url)
      isMandatory: parsedMandatory === true, // blank means unset, never a quiet claim of required attendance
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

  const merged: PlannedInput = {
    name: parsedName ?? match.name,
    templateId: parsedTemplate?.id ?? match.templateId,
    templateName: parsedTemplate?.name ?? match.templateName,
    scheduledOn: parsedDate ?? match.scheduledOn,
    startsAt: parsedStart ?? match.startsAt,
    endsAt: parsedEnd ?? match.endsAt,
    deliveryMode:
      parsedOnline === null ? match.deliveryMode : parsedOnline ? "online" : "in_person",
    venue: parsedVenue ?? match.venue,
    description: parsedDescription ?? match.description,
    requiredEquipment: parsedEquipment ?? match.requiredEquipment,
    joiningUrl: match.joiningUrl, // carried through untouched — no column writes or clears it
    isMandatory: parsedMandatory ?? match.isMandatory,
  };

  const changes = changesBetween(match, merged);

  if (changes.length === 0) {
    // unchanged whatever the status, so export-then-reimport is a no-op, not a screen of refusals
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

  if (merged.deliveryMode === "in_person" && merged.joiningUrl !== null) {
    // events_joining_url_is_for_online_events, said here so the import fails with a sentence, not a constraint
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
    cells: rawCells(cells), // shows what the operator typed, not what the event holds — for correcting
    changes: [],
    reasons,
    write: null,
  };
}

const TIME_CELL = /^([01]\d|2[0-3]):([0-5]\d)$/;

function parseTimeCell(column: "start" | "end", cell: string, reasons: string[]): string | null {
  if (!said(cell)) return null;
  const value = trimmed(cell);
  const candidate = /^\d{2}:\d{2}:\d{2}$/.test(value) ? value.slice(0, 5) : value; // 20:00:00 and 20:00 mean the same thing
  if (!TIME_CELL.test(candidate)) {
    reasons.push(`“${column}” reads “${value}”. Times are HH:MM on the 24-hour clock.`);
    return null;
  }
  if (!isFiveMinuteIncrement(candidate)) {
    reasons.push(`“${column}” reads “${value}”. Times go in five-minute steps.`);
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
  reasons.push(`“${column}” reads “${trimmed(cell)}”. It must be yes or no.`);
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
