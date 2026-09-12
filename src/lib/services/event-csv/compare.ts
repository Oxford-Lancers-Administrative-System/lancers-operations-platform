import { trimmed, type EventDeliveryMode, type EventDraftInput } from "../event-input";
import { formatCalendarDate, parseCalendarDate } from "./dates";
import type { FieldChange, ImportableEvent, ImportColumn, PlanCell } from "./shared";
import { IMPORT_COLUMNS } from "./shared";

/** Comparing a planned row against the event it matched, and the cells shown. */

/** The columns compared, in the order the confirmation shows them. */
export const COMPARED_COLUMNS: readonly ImportColumn[] = Object.freeze([
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

export interface CompareShape {
  name: string;
  templateName: string; // LAN-265: the `type` column prints the template's name, so it compares it
  scheduledOn: string | null;
  startsAt: string | null;
  endsAt: string | null;
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  isMandatory: boolean;
}

export function valueOf(event: CompareShape, column: ImportColumn): string {
  switch (column) {
    case "id":
      return "";
    case "name":
      return event.name;
    case "type": // LAN-265: the template's own name, not a class token — see relocations.md
      return event.templateName;
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

// What one planned row will write, plus the one thing the table prints that the write doesn't
// carry — LAN-265. EventDraftInput holds templateId; the type column shows the name.
export type PlannedInput = EventDraftInput & { templateName: string };

export function changesBetween(before: CompareShape, after: CompareShape): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const column of COMPARED_COLUMNS) {
    const from = valueOf(before, column);
    const to = valueOf(after, column);
    if (from !== to) changes.push({ column, from, to });
  }
  return changes;
}

/**
 * LAN-317: a date cell carries its own value in words. The confirmation is the
 * only place a day-first file can be caught before it is written, and
 * `2026-12-03` beside `3 December 2026` is a check an operator can actually
 * make. Reads the cell's own text, so it holds for the ISO a plan computes and
 * for the raw `03/12/2026` a refused row shows.
 */
function echoed(column: ImportColumn, cell: PlanCell): PlanCell {
  if (column !== "date") return cell;
  const day = parseCalendarDate(cell.value);
  return day === null ? cell : { ...cell, echo: formatCalendarDate(day) };
}

function blankCells(): Record<ImportColumn, PlanCell> {
  const cells = {} as Record<ImportColumn, PlanCell>;
  for (const column of IMPORT_COLUMNS) cells[column] = { value: "", previous: null };
  return cells;
}

export function newCells(input: PlannedInput): Record<ImportColumn, PlanCell> {
  const cells = blankCells();
  for (const column of COMPARED_COLUMNS)
    cells[column] = echoed(column, { value: valueOf(input, column), previous: null });
  return cells;
}

export function currentCells(event: ImportableEvent): Record<ImportColumn, PlanCell> {
  const cells = blankCells();
  cells.id = { value: event.id, previous: null };
  for (const column of COMPARED_COLUMNS)
    cells[column] = echoed(column, { value: valueOf(event, column), previous: null });
  return cells;
}

export function updatedCells(
  before: ImportableEvent,
  after: CompareShape,
  changes: readonly FieldChange[],
): Record<ImportColumn, PlanCell> {
  const changed = new Map(changes.map((change) => [change.column, change]));
  const cells = blankCells();
  cells.id = { value: before.id, previous: null };
  for (const column of COMPARED_COLUMNS) {
    const change = changed.get(column);
    cells[column] = echoed(
      column,
      change
        ? { value: change.to, previous: change.from }
        : { value: valueOf(after, column), previous: null },
    );
  }
  return cells;
}

export function rawCells(cells: Record<ImportColumn, string>): Record<ImportColumn, PlanCell> {
  const shown = blankCells();
  for (const column of IMPORT_COLUMNS)
    shown[column] = echoed(column, { value: trimmed(cells[column]), previous: null });
  return shown;
}
