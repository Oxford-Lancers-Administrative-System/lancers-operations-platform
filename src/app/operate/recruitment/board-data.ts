import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import {
  CONSENT_LABELS,
  PROSPECT_STATUS_LABELS,
  type ProspectStatus,
} from "@/lib/services/recruitment-vocabulary";
import type { SeasonMessagingConsentState } from "@/lib/services/messaging-consent";
import {
  CONSENT_FILTER_OPTIONS,
  STATUS_FILTER_OPTIONS,
  rawValue,
  type ColumnDef,
} from "./board-columns";
import {
  instantOf,
  sortRows,
  type SortField,
  type SortKey,
  type SortKind,
  type SortValue,
} from "../board-sort";

/**
 * Pure search, filter and sort over the recruit board's rows — no database.
 * Operates over the whole in-memory set (dozens of recruits, not thousands).
 */

export const NOT_RECORDED = "Not recorded";

export type BoardFilters = Record<string, string>;

function matchesSearch(row: RecruitmentBoardRow, search: string): boolean {
  if (search.trim() === "") return true;
  const needle = search.trim().toLowerCase();
  if (row.displayName.toLowerCase().includes(needle)) return true;
  return row.aliases.some((alias) => alias.toLowerCase().includes(needle));
}

function matchesFilters(row: RecruitmentBoardRow, filters: BoardFilters): boolean {
  for (const [key, value] of Object.entries(filters)) {
    if (value === "") continue;
    if (key === "attendedAnyEvent") {
      if (value === "yes" && !row.attendedAnyEvent) return false;
      if (value === "no" && row.attendedAnyEvent) return false;
      continue;
    }
    const cell = rawValue(row, key);
    if (key === "personalSent" || key === "recruitmentSent") {
      const wants = value === "yes";
      if (Boolean(cell) !== wants) return false;
      continue;
    }
    if (String(cell ?? "") !== value) return false;
  }
  return true;
}

const NUMBER_SORT_KEYS: ReadonlySet<string> = new Set(["matriculation", "graduation"]);
const DATE_SORT_KEYS: ReadonlySet<string> = new Set(["firstContact"]);

function kindOf(key: string): SortKind {
  if (DATE_SORT_KEYS.has(key)) return "date";
  return NUMBER_SORT_KEYS.has(key) ? "number" : "text";
}

/**
 * What the Sort sheet offers this viewer — LAN-495: First name, Last name, the
 * pinned Recruit column, then every column they can see in board order, those
 * in a folded group included. `columns` is already this viewer's own, so a
 * hidden column is never offered. An event's two columns carry its name.
 */
export function recruitmentSortFields(
  columns: readonly ColumnDef[],
  bandLabel: (band: ColumnDef["band"]) => string,
): readonly SortField[] {
  return [
    { key: "firstName", label: "First name", kind: "text" },
    { key: "lastName", label: "Last name", kind: "text" },
    { key: "displayName", label: "Recruit", kind: "text" },
    ...columns
      .filter((column) => column.sortable && !column.placeholder)
      .map((column) => ({
        key: column.key,
        label: column.band.startsWith("events:")
          ? `${bandLabel(column.band)} · ${column.label}`
          : column.label,
        kind: kindOf(column.key),
      })),
  ];
}

/** One row's value for one sort key: First contact as its instant, a yes/no as its word. */
function sortValue(row: RecruitmentBoardRow, key: string): SortValue {
  if (key === "displayName") return row.displayName;
  if (key === "firstContact") return instantOf(row.firstContactOn);
  const value = rawValue(row, key);
  if (value === null || value === "") return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

const STATUS_LADDER_RANK: Readonly<Record<string, number>> = Object.freeze({
  identified: 0,
  engaged: 1,
  committed: 2,
  joined: 3,
  declined: 4,
  disengaged: 5,
  void: 6,
});

/** Default sort — `W1`: ladder order, then most recent first contact (LAN-486: by instant). */
function defaultCompare(a: RecruitmentBoardRow, b: RecruitmentBoardRow): number {
  const rankDiff = (STATUS_LADDER_RANK[a.status] ?? 99) - (STATUS_LADDER_RANK[b.status] ?? 99);
  if (rankDiff !== 0) return rankDiff;
  const aAt = instantOf(a.firstContactOn) ?? Number.NEGATIVE_INFINITY;
  const bAt = instantOf(b.firstContactOn) ?? Number.NEGATIVE_INFINITY;
  return aAt === bAt ? 0 : aAt > bAt ? -1 : 1;
}

export function applyBoard(
  rows: readonly RecruitmentBoardRow[],
  options: {
    search: string;
    filters: BoardFilters;
    /** Up to three keys (LAN-495); none is the board's default, ladder then newest first contact. */
    sort: readonly SortKey[];
  },
): readonly RecruitmentBoardRow[] {
  const filtered = rows.filter(
    (row) => matchesSearch(row, options.search) && matchesFilters(row, options.filters),
  );
  return sortRows(
    filtered,
    options.sort,
    sortValue,
    { name: (row) => row.displayName, id: (row) => row.prospectId },
    defaultCompare,
  );
}

export function displayOf(value: string | number | boolean | null): string {
  if (value === null || value === "") return NOT_RECORDED;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * The values a column's header filter offers. Every filterable recruitment
 * column has a fixed, known vocabulary — a lookup, not a scan of rows in view.
 */
export function filterOptions(column: { key: string }): readonly string[] {
  switch (column.key) {
    case "status":
      return STATUS_FILTER_OPTIONS;
    case "consent":
      return CONSENT_FILTER_OPTIONS;
    case "personalSent":
    case "recruitmentSent":
      return ["yes", "no"];
    default:
      return [];
  }
}

/** Display text for one entry in a column's open filter list, or its selected value's chip/caption. */
export function optionListLabel(column: { key: string }, value: string): string {
  switch (column.key) {
    case "status":
      return PROSPECT_STATUS_LABELS[value as ProspectStatus] ?? value;
    case "consent":
      return CONSENT_LABELS[value as SeasonMessagingConsentState] ?? value;
    case "personalSent":
      return value === "yes" ? "Sent" : "Not sent";
    case "recruitmentSent":
      return value === "yes" ? "Sent" : "Not sent";
    default:
      return value;
  }
}
