import type { ImportColumn, PlanCell, PlannedRow, RowOutcome } from "@/lib/services/event-csv";

/**
 * How the confirmation reads. LAN-155, screen `W3-03`.
 *
 * Pure, and separate from the component, so the wording and the outcome colours
 * can be asserted without rendering a table — the precedent is
 * `../presentation.ts`, which does the same for the event screens.
 */

/** The four outcomes, in the club's words. */
export const OUTCOME_LABELS: Readonly<Record<RowOutcome, string>> = Object.freeze({
  new: "New",
  updated: "Updated",
  unchanged: "Unchanged",
  refused: "Refused",
});

/**
 * Colour is never the only carrier — every chip states its outcome in words,
 * and the summary beside it says what the outcome means for that row.
 */
export function outcomeColour(outcome: RowOutcome): "default" | "info" | "success" | "error" {
  switch (outcome) {
    case "new":
      return "success";
    case "updated":
      return "info";
    case "refused":
      return "error";
    default:
      return "default";
  }
}

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

/**
 * An em dash for an empty cell.
 *
 * `docs/ux/standards.md` rule 3: a value that is not there is stated as not
 * there. A blank table cell reads as a rendering fault; a dash reads as "there
 * is nothing here", which is what an unset venue actually means.
 */
export function cellText(cell: PlanCell): string {
  return cell.value === "" ? "—" : cell.value;
}

/** What the old value reads as underneath a changed cell. */
export function previousText(cell: PlanCell): string | null {
  if (cell.previous === null) return null;
  return cell.previous === "" ? "(empty)" : cell.previous;
}

/**
 * The right-hand column: what this row does, derived from the comparison rather
 * than written down beside it.
 *
 * Brian, 2026-08-21, rejecting an earlier draft of the mockup: "you should
 * highlight the cell itself to show what changed … Row doesn't make sense … get
 * rid of it." The highlighted cells are the change; this sentence is the summary
 * of them, and it is computed from the same list so the two cannot disagree.
 */
export function changeSummary(row: PlannedRow): string {
  if (row.outcome === "refused") return row.reasons.join(" ");
  if (row.outcome === "new") return "Will be created as a draft";
  if (row.changes.length === 0) return "Nothing differs";
  const fields = row.changes.map((change) => change.column).join(", ");
  return `${row.changes.length} field${row.changes.length > 1 ? "s" : ""} changed: ${fields}`;
}

/** "6 new · 3 updated · 36 unchanged · 2 refused", for the screen reader line. */
export function describeTotals(totals: {
  new: number;
  updated: number;
  unchanged: number;
  refused: number;
}): string {
  return `${totals.new} new · ${totals.updated} updated · ${totals.unchanged} unchanged · ${totals.refused} refused`;
}

/** The Apply button's label, which counts what it will actually write. */
export function applyLabel(applicableCount: number): string {
  if (applicableCount === 0) return "Nothing to apply";
  return `Apply ${applicableCount} change${applicableCount > 1 ? "s" : ""}`;
}

/** "47 rows read · nothing has been changed yet" — the line under the heading. */
export function describeProposal(seasonLabel: string, rowCount: number): string {
  return `Season ${seasonLabel} · ${rowCount} row${rowCount === 1 ? "" : "s"} read · nothing has been changed yet`;
}

/** What the operator is told after an apply that committed. */
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
