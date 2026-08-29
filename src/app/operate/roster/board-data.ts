import type { RosterBoardRow } from "@/lib/services/roster-board";
import {
  AVAILABILITY_LABELS,
  ELIGIBILITY_LABELS,
  FORMALWEAR_LABELS,
  type ColumnDef,
} from "./board-columns";
import { ENTRY_LABELS, labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";

/**
 * Pure search, filter and sort over the board's rows — no database, no
 * `server-only`, so it is unit-testable on its own and reusable by both the
 * server component that builds the initial view and any client-side refinement.
 *
 * The season holds dozens of memberships (`DEC-w1-12`), so this operates over
 * the whole in-memory set rather than pushing nineteen possible predicates into
 * SQL — exactly the approach the approved `chore/roster-fidelity-mockup`
 * demonstrates, adapted from its illustrative fixtures to the real
 * `RosterBoardRow` shape.
 */

export const NOT_RECORDED = "Not recorded";

export type BoardFilters = Record<string, string>;

export interface BoardSort {
  key: string;
  direction: "asc" | "desc";
}

/** One cell's underlying value, for sorting, filtering and display. */
export function rawValue(row: RosterBoardRow, key: string): string | string[] | number | null {
  switch (key) {
    case "college":
      return row.college;
    case "matriculation":
      return row.matriculationYear;
    case "graduation":
      return row.expectedGraduationYear;
    case "degree":
      return row.degreeField;
    case "contactable":
      return [row.hasMobile ? "Mobile" : "", row.hasEmail ? "Email" : ""].filter(Boolean);
    case "missing":
      return row.missingCount;
    case "onboarding":
      return onboardingLabel(row);
    case "status":
      return row.status;
    case "entry":
      return row.entry;
    case "offencePosition":
      return row.offencePosition;
    case "defencePosition":
      return row.defencePosition;
    case "specialTeamsPosition":
      return row.specialTeamsPosition;
    case "blueNumbers":
      return row.blueNumbers;
    case "whiteNumbers":
      return row.whiteNumbers;
    case "coachGroup":
      return row.coachGroup;
    case "formalwear":
      return (Object.keys(row.formalwear) as (keyof typeof row.formalwear)[]).filter(
        (item) => row.formalwear[item],
      );
    case "blues":
      return row.blues;
    case "eligibility":
      return row.eligibility;
    case "availability":
      return row.availability;
    default:
      return null;
  }
}

/**
 * UX-20's Onboarding column, in one sentence — the same rule
 * `presentation.ts`'s `describeOnboarding` states for the old six-column list,
 * restated here because this module takes a `RosterBoardRow` rather than a
 * `RosterEntry`. The words are identical on purpose: an operator reads the
 * same vocabulary whichever surface they are on.
 */
export function onboardingLabel(row: RosterBoardRow): string {
  if (row.itemsTotal === 0) return "No items configured";
  if (row.requiredOutstanding > 0) return `${row.requiredOutstanding} outstanding`;
  if (row.itemsResolved === row.itemsTotal) return "Complete";
  const remaining = row.itemsTotal - row.itemsResolved;
  return `${remaining} outstanding, none blocking`;
}

/** `null` when the value is genuinely absent — sorted last regardless of direction, below. */
function comparable(row: RosterBoardRow, key: string): string | number | null {
  const value = rawValue(row, key);
  if (value === null) return null;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(", ");
  if (typeof value === "number") return value;
  const asNumber = Number(value);
  return Number.isNaN(asNumber) ? value : asNumber;
}

/** Display text for a column's option code, where one has a fuller label. */
function optionLabel(column: ColumnDef, code: string): string {
  if (column.key === "status") return labelFor(MEMBERSHIP_STATUS_LABELS, code);
  if (column.key === "entry") return labelFor(ENTRY_LABELS, code);
  if (column.key === "eligibility") return labelFor(ELIGIBILITY_LABELS, code);
  if (column.key === "availability") return labelFor(AVAILABILITY_LABELS, code);
  if (column.key === "formalwear") return labelFor(FORMALWEAR_LABELS, code);
  return column.optionLabels?.[code] ?? code;
}

/** The values a column's filter offers, read from the fixed set or from the data. */
export function filterOptions(
  column: ColumnDef,
  rows: readonly RosterBoardRow[],
): readonly string[] {
  if (column.key === "missing") return ["Yes", "No"];
  if (column.key === "contactable") return ["Has mobile", "Has email", "Neither"];
  if (column.options) return [...column.options];

  const seen = new Set<string>();
  let blanks = false;
  for (const row of rows) {
    const value = rawValue(row, column.key);
    if (value === null || (Array.isArray(value) && value.length === 0)) {
      blanks = true;
      continue;
    }
    if (Array.isArray(value)) value.forEach((entry) => seen.add(entry));
    else seen.add(String(value));
  }
  const values = [...seen].sort((a, b) => a.localeCompare(b, "en-GB", { numeric: true }));
  return blanks ? [...values, NOT_RECORDED] : values;
}

/** The chip and menu label for a filter's option — a fuller word where one exists. */
export function filterOptionLabel(column: ColumnDef, value: string): string {
  if (value === NOT_RECORDED) return value;
  return optionLabel(column, value);
}

function matches(row: RosterBoardRow, key: string, wanted: string): boolean {
  if (wanted === "") return true;
  if (key === "missing") return wanted === "Yes" ? row.missingCount > 0 : row.missingCount === 0;
  if (key === "contactable") {
    if (wanted === "Has mobile") return row.hasMobile;
    if (wanted === "Has email") return row.hasEmail;
    return !row.hasMobile && !row.hasEmail;
  }

  const value = rawValue(row, key);
  if (wanted === NOT_RECORDED) {
    return value === null || (Array.isArray(value) && value.length === 0);
  }
  if (Array.isArray(value)) return value.includes(wanted);
  return String(value ?? "") === wanted;
}

/** Search is name or alias — the raw contact values it used to search are gone. */
function searchMatches(row: RosterBoardRow, term: string): boolean {
  if (term.trim() === "") return true;
  return row.displayName.toLowerCase().includes(term.trim().toLowerCase());
}

export interface AppliedBoard {
  visible: RosterBoardRow[];
  activeFilters: readonly [string, string][];
  isFiltered: boolean;
}

/**
 * Search, filter and sort, applied together. `filters` is one value per
 * column key — the same object the pinned controls and every column's own
 * funnel both write to, which is what makes a pinned control and its column
 * header "one filter with two controls" rather than two filters kept in step
 * by hand.
 */
export function applyBoard(
  rows: readonly RosterBoardRow[],
  params: { search: string; filters: BoardFilters; sort: BoardSort },
): AppliedBoard {
  const kept = rows.filter(
    (row) =>
      searchMatches(row, params.search) &&
      Object.entries(params.filters).every(([key, wanted]) => matches(row, key, wanted)),
  );

  const direction = params.sort.direction === "asc" ? 1 : -1;
  const visible = [...kept].sort((a, b) => {
    const left = params.sort.key === "displayName" ? a.displayName : comparable(a, params.sort.key);
    const right =
      params.sort.key === "displayName" ? b.displayName : comparable(b, params.sort.key);
    // Not recorded sorts last regardless of direction — the same "nulls last"
    // rule `membership.ts`'s `rosterOrderBy()` applies in SQL, so an operator
    // reversing the sort finds the fullest records first either way rather
    // than being confronted with a wall of blanks.
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
    return String(left).localeCompare(String(right), "en-GB", { numeric: true }) * direction;
  });

  const activeFilters = Object.entries(params.filters).filter(([, value]) => value !== "");
  return {
    visible,
    activeFilters,
    isFiltered: activeFilters.length > 0 || params.search.trim() !== "",
  };
}

/** Display text for a cell, `Not recorded` never a blank — `REQ-not-recorded`. */
export function displayOf(row: RosterBoardRow, column: ColumnDef): string {
  const value = rawValue(row, column.key);
  if (value === null) return NOT_RECORDED;
  if (Array.isArray(value)) {
    if (value.length === 0) return column.edit === "none" ? "—" : NOT_RECORDED;
    return value.map((entry) => optionLabel(column, entry)).join(", ");
  }
  if (column.edit === "select" || column.edit === "status")
    return optionLabel(column, String(value));
  return String(value);
}
