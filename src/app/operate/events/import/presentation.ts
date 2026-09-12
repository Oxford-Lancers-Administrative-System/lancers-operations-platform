import type {
  ImportColumn,
  PlanCell,
  PlanMovement,
  PlannedRow,
  RowOutcome,
} from "@/lib/services/event-csv";

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

/**
 * LAN-317: a date cell in words — "3 December 2026" — shown beneath the value
 * so `03/12/2026` cannot be read as the American order and applied unseen.
 * `null` on every cell that is not a date the importer understood.
 */
export function echoText(cell: PlanCell): string | null {
  return cell.echo ?? null;
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

function rows(count: number): string {
  return `${count} row${count === 1 ? "" : "s"}`;
}

/**
 * LAN-316: why there is nothing to apply, in counts. "Nothing to apply" on a
 * disabled button beside a screen full of rows reads as a fault; the rows are
 * there, they were refused, and the reason is on each one. `null` whenever the
 * file has something to write, which is when the button says so itself.
 */
export function describeNothingToApply(totals: {
  new: number;
  updated: number;
  unchanged: number;
  refused: number;
}): string | null {
  if (totals.new + totals.updated > 0) return null;
  const parts: string[] = [];
  if (totals.refused > 0) parts.push(`${rows(totals.refused)} refused, with the reason on each`);
  if (totals.unchanged > 0) parts.push(`${rows(totals.unchanged)} already matching the season`);
  return parts.length === 0 ? "Nothing to apply." : `Nothing to apply — ${parts.join(" · ")}.`;
}

/** The refused rows' own heading — LAN-316, so no refused row reads as one about to be written. */
export function refusedSectionTitle(refused: number): string {
  return `Refused · ${rows(refused)} · nothing will be written for ${refused === 1 ? "it" : "them"}`;
}

/** What the rest of the file does, above the refusals. */
export function writableSectionTitle(totals: {
  new: number;
  updated: number;
  unchanged: number;
}): string {
  const count = totals.new + totals.updated + totals.unchanged;
  const applicable = totals.new + totals.updated;
  return applicable === 0
    ? `Unchanged · ${rows(count)}`
    : `Will be written · ${rows(applicable)}${totals.unchanged > 0 ? ` · ${rows(totals.unchanged)} unchanged` : ""}`;
}

const PLAN_MOVED_LEAD = "The season moved while this was on screen.";
const PLAN_MOVED_TAIL = "The proposal below is the current one.";
const MOVEMENTS_NAMED = 6;

/**
 * LAN-310: the stale-plan refusal, naming the rows that moved by line and
 * outcome. The operator reads what changed under them without uploading the
 * file a second time to find out.
 */
export function describePlanMoved(movements: readonly PlanMovement[]): string {
  const named = movements.slice(0, MOVEMENTS_NAMED).map(describeMovement);
  const rest = movements.length - named.length;
  if (rest > 0) named.push(`${rows(rest)} more moved.`);
  return [PLAN_MOVED_LEAD, ...named, PLAN_MOVED_TAIL].join(" ");
}

function describeMovement(movement: PlanMovement): string {
  const at = `Line ${movement.line}`;
  if (movement.before === null)
    return `${at} — now ${OUTCOME_LABELS[movement.after ?? "refused"]}.`;
  if (movement.after === null) return `${at} — no longer read.`;
  if (movement.before === movement.after)
    return `${at} — still ${OUTCOME_LABELS[movement.after]}, with different values.`;
  return `${at} — was ${OUTCOME_LABELS[movement.before]}, now ${OUTCOME_LABELS[movement.after]}.`;
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
