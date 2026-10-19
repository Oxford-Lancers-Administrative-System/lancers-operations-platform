import { itemStateLabel } from "@/lib/services/onboarding-item-shapes";
import { attendanceRatio, formatAttendanceTally } from "@/lib/services/attendance-score";
import type { OnboardingItemStatus } from "@/lib/services/membership";
import type { RosterBoardRow } from "@/lib/services/roster-board";
import { isMultiValueKitItem, parseKitCellKey } from "@/lib/services/roster-board/vocabulary";
import {
  ATTENDANCE_COLUMN_TALLIES,
  AVAILABILITY_LABELS,
  bandOf,
  ELIGIBILITY_LABELS,
  FORMALWEAR_LABELS,
  isAttendanceColumnKey,
  type ColumnDef,
} from "./board-columns";
import {
  firstInOptionOrder,
  sortRows,
  type SortField,
  type SortKey,
  type SortKind,
  type SortValue,
} from "../board-sort";
import { ENTRY_LABELS, labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";

// Pure search, filter and sort over the board's rows — no database. Operates in memory (`DEC-w1-12`), not SQL predicates.

export const NOT_RECORDED = "Not recorded";

export type BoardFilters = Record<string, string>;

/** The board's own order with no key chosen — Player A–Z (LAN-186). */
export const ROSTER_DEFAULT_SORT: readonly SortKey[] = Object.freeze([
  Object.freeze({ key: "displayName", direction: "asc" as const }),
]);

/** The text an empty derived cell shows — the Attendance group's "nothing counted". */
export const NOTHING_COUNTED = "—";

export function rawValue(row: RosterBoardRow, key: string): string | string[] | number | null {
  // LAN-457: an Attendance column sorts on its fraction attended; nothing
  // counted is `null`, which sorts last in either direction.
  if (isAttendanceColumnKey(key)) {
    return attendanceRatio(row.attendance[ATTENDANCE_COLUMN_TALLIES[key]]);
  }
  // LAN-374: the twenty-four special-teams cells are one family, keyed
  // `st:<squad>:<slot>`, not twenty-four cases.
  if (key.startsWith("st:")) return row.specialTeams[key] ?? null;
  // LAN-375: the eleven issued-kit items, keyed `kit:<item>`. Nine hold one
  // value and read as that value; Braces L and Braces R hold a set and read as
  // the list their multi-select edits (LAN-409).
  if (key.startsWith("kit:")) {
    const item = parseKitCellKey(key);
    const held = row.kit[key] ?? [];
    if (item && isMultiValueKitItem(item)) return [...held];
    return held[0] ?? null;
  }
  switch (key) {
    // LAN-426: the phone board's name sorts. A person with no family name sorts by their given name.
    case "firstName":
      return row.givenName;
    case "lastName":
      return row.familyName ?? row.givenName;
    case "college":
      return row.college;
    case "matriculation":
      return row.matriculationYear;
    case "graduation":
      return row.expectedGraduationYear;
    case "degree":
      return row.degreeField;
    case "dietary":
      return row.dietaryPreference;
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
    case "offenceBackupPosition":
      return row.offenceBackupPosition;
    case "defencePosition":
      return row.defencePosition;
    case "defenceBackupPosition":
      return row.defenceBackupPosition;
    case "blueNumbers":
      return row.blueNumbers;
    case "whiteNumbers":
      return row.whiteNumbers;
    case "coachingGroups":
      return row.coachingGroups;
    case "offensivePositionGroups":
      return row.offensivePositionGroups;
    case "defensivePositionGroups":
      return row.defensivePositionGroups;
    case "formalwear":
      return (Object.keys(row.formalwear) as (keyof typeof row.formalwear)[]).filter(
        (item) => row.formalwear[item],
      );
    // LAN-401: the warmup group's one cell.
    case "warmupSmallGroup":
      return row.warmupSmallGroup;
    case "blues":
      return row.blues;
    case "eligibility":
      return row.eligibility;
    case "availability":
      return row.availability;
    case "bps":
      return row.bps;
    // Correction round 2, item 5. subsPaid is null until subsInvoiced is
    // complete (D-002, round 3, Q-14) — decision history: relocations.md.
    case "subsInvoiced":
      return row.onboardingItems["subs_invoiced"]?.status ?? null;
    case "subsPaid":
      return row.onboardingItems["subs_invoiced"]?.status === "complete"
        ? (row.onboardingItems["subs_paid"]?.status ?? null)
        : null;
    case "kitDistributed":
      return row.onboardingItems["kit_sorted"]?.status ?? null;
    case "bucsPlay":
      return row.onboardingItems["bucs_play"]?.status ?? null;
    case "hudlAccess":
      return row.onboardingItems["hudl_access"]?.status ?? null;
    case "squadPhoto":
      return row.onboardingItems["photo"]?.status ?? null;
    case "commsGroup":
      return row.onboardingItems["comms_groups"]?.status ?? null;
    default:
      return null;
  }
}

/** UX-20's Onboarding column — same vocabulary as `presentation.ts`'s `describeOnboarding`, for a `RosterBoardRow` instead of a `RosterEntry`. */
export function onboardingLabel(row: RosterBoardRow): string {
  if (row.itemsTotal === 0) return "No items configured";
  if (row.requiredOutstanding > 0) return `${row.requiredOutstanding} outstanding`;
  if (row.itemsResolved === row.itemsTotal) return "Complete";
  const remaining = row.itemsTotal - row.itemsResolved;
  return `${remaining} outstanding, none blocking`;
}

/** Columns whose values are counts or years, so their orders read Low–High. */
const NUMBER_SORT_KEYS: ReadonlySet<string> = new Set([
  "matriculation",
  "graduation",
  "missing",
  ...Object.keys(ATTENDANCE_COLUMN_TALLIES),
]);

/**
 * What the Sort sheet offers this viewer — LAN-495: First name, Last name, the
 * pinned Player column, then every column they can see in board order, those in
 * a folded group included. `columns` is already this viewer's own, so a hidden
 * column is never offered. A label shared by two columns names its group.
 */
export function rosterSortFields(columns: readonly ColumnDef[]): readonly SortField[] {
  const labelCount = new Map<string, number>();
  for (const column of columns)
    labelCount.set(column.label, (labelCount.get(column.label) ?? 0) + 1);
  const kindOf = (key: string): SortKind => (NUMBER_SORT_KEYS.has(key) ? "number" : "text");
  return [
    { key: "firstName", label: "First name", kind: "text" },
    { key: "lastName", label: "Last name", kind: "text" },
    { key: "displayName", label: "Player", kind: "text" },
    ...columns
      .filter((column) => column.sortable && !column.placeholder)
      .map((column) => ({
        key: column.key,
        label: column.groupHeading
          ? `${column.groupHeading} · ${column.label}`
          : (labelCount.get(column.label) ?? 0) > 1
            ? `${bandOf(column.band).label} · ${column.label}`
            : column.label,
        kind: kindOf(column.key),
      })),
  ];
}

/**
 * One row's value for one sort key. A multi-valued cell sorts by its first
 * value in the column's option order; an empty one is `null`, last either way.
 */
function sortValue(
  row: RosterBoardRow,
  key: string,
  optionsOf: ReadonlyMap<string, readonly string[] | undefined>,
): SortValue {
  if (key === "displayName") return row.displayName;
  const value = rawValue(row, key);
  if (value === null) return null;
  if (Array.isArray(value)) return firstInOptionOrder(value, optionsOf.get(key));
  if (typeof value === "number") return value;
  return value === "" ? null : value;
}

const CODE_ONLY_COLUMNS = new Set([
  "offencePosition",
  "offenceBackupPosition",
  "defencePosition",
  "defenceBackupPosition",
]);

// Display text for a column's option code — label alone, never the code
// beside it (LAN-186 item 9). Positions are the exception: the club's
// vocabulary IS the code, so item 7's cell half returns it unchanged.
function optionLabel(column: ColumnDef, code: string): string {
  if (CODE_ONLY_COLUMNS.has(column.key)) return code;
  if (column.key === "status") return labelFor(MEMBERSHIP_STATUS_LABELS, code);
  if (column.key === "entry") return labelFor(ENTRY_LABELS, code);
  if (column.key === "eligibility") return labelFor(ELIGIBILITY_LABELS, code);
  if (column.key === "availability") return labelFor(AVAILABILITY_LABELS, code);
  if (column.key === "formalwear") return labelFor(FORMALWEAR_LABELS, code);
  // D-002 (round 6, LAN-217): code is always a real OnboardingItemStatus now.
  // Keyed on `itemCode`, not on `edit`: LAN-375 made Kit Distributed derived,
  // so it is an onboarding item that opens no control and still has to say
  // "Yes" rather than "complete".
  if (column.itemCode) {
    return itemStateLabel(column.itemCode, code as OnboardingItemStatus);
  }
  return column.optionLabels?.[code] ?? code;
}

export function filterOptions(
  column: ColumnDef,
  rows: readonly RosterBoardRow[],
): readonly string[] {
  if (column.key === "missing") return ["Yes", "No"];
  if (column.key === "contactable") return ["Has mobile", "Has email", "Neither"];
  // LAN-502: a fixed vocabulary answered on the record (Dietary preference) is
  // blank for everyone who has not answered, and that is filterable too.
  if (column.options && !column.itemCode) {
    return column.edit === "record" ? [...column.options, NOT_RECORDED] : [...column.options];
  }

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

export function filterOptionLabel(column: ColumnDef, value: string): string {
  if (value === NOT_RECORDED) return value;
  return optionLabel(column, value);
}

// Display text for one entry in an open list of choices (in-cell edit
// dropdown, filter popover) — distinct from a chosen value. Positions show
// code + full name in the open dropdown only, per item 7's cell half.
export function optionListLabel(column: ColumnDef, value: string): string {
  if (value === NOT_RECORDED) return value;
  if (CODE_ONLY_COLUMNS.has(column.key)) {
    const label = column.optionLabels?.[value];
    return label ? `${value} — ${label}` : value;
  }
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

function searchMatches(row: RosterBoardRow, term: string): boolean {
  const wanted = term.trim().toLowerCase();
  if (wanted === "") return true;
  if (row.displayName.toLowerCase().includes(wanted)) return true;
  return row.aliases.some((alias) => alias.toLowerCase().includes(wanted));
}

export interface AppliedBoard {
  visible: RosterBoardRow[];
  activeFilters: readonly [string, string][];
  isFiltered: boolean;
}

/** Search, filter and sort, applied together — `filters` is the same object the pinned controls and each column's funnel both write to. */
export function applyBoard(
  rows: readonly RosterBoardRow[],
  params: {
    search: string;
    filters: BoardFilters;
    /** Up to three keys (LAN-495); none is the board's default, Player A–Z. */
    sort: readonly SortKey[];
    /** The board's columns, for the option order a multi-valued cell sorts by. */
    columns?: readonly ColumnDef[];
  },
): AppliedBoard {
  const kept = rows.filter(
    (row) =>
      searchMatches(row, params.search) &&
      Object.entries(params.filters).every(([key, wanted]) => matches(row, key, wanted)),
  );

  const optionsOf = new Map((params.columns ?? []).map((column) => [column.key, column.options]));
  const keys = params.sort.length > 0 ? params.sort : ROSTER_DEFAULT_SORT;
  const visible = sortRows(kept, keys, (row, key) => sortValue(row, key, optionsOf), {
    name: (row) => row.displayName,
    id: (row) => row.membershipId,
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
  if (isAttendanceColumnKey(column.key)) {
    return (
      formatAttendanceTally(row.attendance[ATTENDANCE_COLUMN_TALLIES[column.key]]) ??
      NOTHING_COUNTED
    );
  }
  const value = rawValue(row, column.key);
  if (value === null) return NOT_RECORDED;
  if (Array.isArray(value)) {
    if (value.length === 0) return column.edit === "none" ? "—" : NOT_RECORDED;
    return value.map((entry) => optionLabel(column, entry)).join(", ");
  }
  // LAN-502: a record-edited column with a fixed vocabulary shows its label too.
  if (
    column.edit === "select" ||
    column.edit === "onboarding" ||
    column.itemCode ||
    column.optionLabels
  )
    return optionLabel(column, String(value));
  return String(value);
}
