import type {
  ImportColumn,
  RosterImportApplied,
  RosterImportTotals,
  RosterPlannedRow,
  RosterRowOutcome,
} from "@/lib/services/roster-csv";

/**
 * How the roster import's confirmation reads. LAN-215, `W1`.
 *
 * Pure, and separate from the component — the precedent is
 * `../../events/import/presentation.ts`, which does the same for the event
 * screens, so wording and outcome colours can be asserted without rendering
 * a table.
 */

/** The four outcomes, in the club's words. */
export const OUTCOME_LABELS: Readonly<Record<RosterRowOutcome, string>> = Object.freeze({
  new: "New",
  carried_forward: "Carried forward",
  unchanged: "Unchanged",
  refused: "Refused",
});

/** Colour is never the only carrier — every chip states its outcome in words. */
export function outcomeColour(outcome: RosterRowOutcome): "default" | "info" | "success" | "error" {
  switch (outcome) {
    case "new":
      return "success";
    case "carried_forward":
      return "info";
    case "refused":
      return "error";
    default:
      return "default";
  }
}

/** The confirmation's column headings, in the order the table shows them. */
export const COLUMN_HEADINGS: Readonly<Record<ImportColumn, string>> = Object.freeze({
  first_name: "First name",
  last_name: "Last name",
  mobile: "Mobile",
  personal_email: "Personal email",
  college: "College",
  matriculation_year: "Year",
});

/** Every column the table shows, left to right, after the player's name. */
export const SHOWN_COLUMNS: readonly ImportColumn[] = Object.freeze([
  "mobile",
  "personal_email",
  "college",
  "matriculation_year",
]);

/** An em dash for an empty cell — `docs/ux/standards.md` rule 3. */
export function cellText(value: string): string {
  return value === "" ? "—" : value;
}

/** The right-hand column: what this row does, or why it did not. */
export function changeSummary(row: RosterPlannedRow): string {
  if (row.outcome === "refused") return row.reasons.join(" ");
  if (row.outcome === "new")
    return "Added to the roster in onboarding · checklist generated · welcome queued";
  if (row.outcome === "carried_forward")
    return "Known to the club · new membership in onboarding · their own facts are not touched · welcome queued";
  return "Already on this season's roster · no second checklist, no second welcome";
}

/** The Confirm button's label, which counts what it will actually write. */
export function applyLabel(applicableCount: number): string {
  if (applicableCount === 0) return "Nothing to apply";
  return `Confirm — add ${applicableCount} player${applicableCount > 1 ? "s" : ""}`;
}

/** "42 rows read · nothing has been changed yet" — the line under the heading. */
export function describeProposal(seasonLabel: string, rowCount: number): string {
  return `Season ${seasonLabel} · ${rowCount} row${rowCount === 1 ? "" : "s"} read · nothing is written until you confirm`;
}

/** "1 to answer" — the duplicates section's own count, or nothing when there is none. */
export function describeUnanswered(unansweredLines: readonly number[]): string {
  const count = unansweredLines.length;
  return count === 1 ? "1 to answer" : `${count} to answer`;
}

export function describeTotals(totals: RosterImportTotals): readonly [number, string][] {
  return [
    [totals.new, "New"],
    [totals.carried_forward, "Carried forward"],
    [totals.unchanged, "Unchanged"],
    [totals.refused, "Refused"],
  ];
}

/** What the operator is told after an apply that committed. */
export function describeApplied(applied: RosterImportApplied): string {
  const arrived = applied.created + applied.carriedForward;
  const parts: string[] = [];
  if (arrived > 0) {
    parts.push(`${arrived} player${arrived > 1 ? "s are" : " is"} on the roster in onboarding`);
  }
  const done = parts.length === 0 ? "Nothing was changed" : parts.join(" and ");
  const welcomes =
    applied.welcomesQueued > 0
      ? ` ${applied.welcomesQueued} welcome${applied.welcomesQueued > 1 ? "s are" : " is"} queued.`
      : "";
  const left =
    applied.refused > 0
      ? ` ${applied.refused} row${applied.refused > 1 ? "s were" : " was"} refused and nothing was written for ${applied.refused > 1 ? "them" : "it"}.`
      : "";
  return `${done}.${welcomes}${left}`;
}
