import type { ImportColumn, PlanCell, PlannedRow, RowOutcome } from "@/lib/services/event-csv";

/** How the confirmation reads. LAN-155, screen `W3-03`. Pure, separate from the component. */

/** The four outcomes, in the club's words. */
export const OUTCOME_LABELS: Readonly<Record<RowOutcome, string>> = Object.freeze({
  new: "New",
  updated: "Updated",
  unchanged: "Unchanged",
  refused: "Refused",
});

/** The confirmation's column headings, in the order the table shows them. */
export const COLUMN_HEADINGS: Readonly<Record<ImportColumn, string>> = Object.freeze({
  id: "Id",
  name: "Event",
  type: "Type",
  date: "Date",
  start: "Start",
  end: "End",
  online: "Online",
  venue: "Venue",
  description: "Description",
  required_equipment: "Equipment",
  mandatory: "Mandatory",
});

/** Every column the table shows, left to right. `id` is not one of them. */
export const SHOWN_COLUMNS: readonly ImportColumn[] = Object.freeze([
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

/** An em dash for an empty cell (`docs/ux/standards.md` rule 3): a blank cell reads as a rendering fault. */
export function cellText(cell: PlanCell): string {
  return cell.value === "" ? "—" : cell.value;
}

export function previousText(cell: PlanCell): string | null {
  if (cell.previous === null) return null;
  return cell.previous === "" ? "(empty)" : cell.previous;
}

/** What this row does, derived from the comparison, same list the highlighted cells use. */
export function changeSummary(row: PlannedRow): string {
  if (row.outcome === "refused") return row.reasons.join(" ");
  if (row.outcome === "new") return "Will be created as a draft";
  if (row.changes.length === 0) return "Nothing differs";
  const fields = row.changes.map((change) => change.column).join(", ");
  return `${row.changes.length} field${row.changes.length > 1 ? "s" : ""} changed: ${fields}`;
}

export function applyLabel(applicableCount: number): string {
  if (applicableCount === 0) return "Nothing to apply";
  return `Apply ${applicableCount} change${applicableCount > 1 ? "s" : ""}`;
}

export function describeProposal(seasonLabel: string, rowCount: number): string {
  return `Season ${seasonLabel} · ${rowCount} row${rowCount === 1 ? "" : "s"} read · nothing has been changed yet`;
}

export function describeApplied(applied: {
  created: number;
  updated: number;
  unchanged: number;
  refused: number;
}): string {
  const parts: string[] = [];
  if (applied.created > 0)
    parts.push(`${applied.created} draft${applied.created > 1 ? "s" : ""} created`);
  if (applied.updated > 0)
    parts.push(`${applied.updated} draft${applied.updated > 1 ? "s" : ""} updated`);
  const done = parts.length === 0 ? "Nothing was changed" : parts.join(" and ");
  const left =
    applied.refused > 0
      ? ` ${applied.refused} row${applied.refused > 1 ? "s were" : " was"} refused and nothing was written for ${applied.refused > 1 ? "them" : "it"}.`
      : "";
  return `${done}.${left}`;
}
