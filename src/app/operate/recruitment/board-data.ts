import type { RecruitmentBoardRow } from "@/lib/services/recruitment-board";
import { rawValue } from "./board-columns";

/**
 * Pure search, filter and sort over the recruit board's rows — no database, no
 * `server-only`. Mirrors `../roster/board-data.ts`'s own shape: the season
 * holds dozens of recruits, not thousands, so this operates over the whole
 * in-memory set rather than pushing every possible predicate into SQL.
 */

export const NOT_RECORDED = "Not recorded";

export type BoardFilters = Record<string, string>;

export interface BoardSort {
  key: string;
  direction: "asc" | "desc";
}

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

function comparable(row: RecruitmentBoardRow, key: string): string | number | null {
  const value = rawValue(row, key);
  if (value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
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

/** Default sort — `W1`: ladder order, then most recent first contact. */
function defaultCompare(a: RecruitmentBoardRow, b: RecruitmentBoardRow): number {
  const rankDiff = (STATUS_LADDER_RANK[a.status] ?? 99) - (STATUS_LADDER_RANK[b.status] ?? 99);
  if (rankDiff !== 0) return rankDiff;
  const aDate = a.firstContactOn ?? "";
  const bDate = b.firstContactOn ?? "";
  return bDate.localeCompare(aDate);
}

export function applyBoard(
  rows: readonly RecruitmentBoardRow[],
  options: { search: string; filters: BoardFilters; sort: BoardSort | null },
): readonly RecruitmentBoardRow[] {
  const filtered = rows.filter(
    (row) => matchesSearch(row, options.search) && matchesFilters(row, options.filters),
  );

  if (!options.sort) return [...filtered].sort(defaultCompare);

  const { key, direction } = options.sort;
  const factor = direction === "desc" ? -1 : 1;
  // Null always sorts last, in either direction — reversing the whole
  // comparison (rather than the finished array) is what keeps that true
  // instead of a bare `.reverse()` putting every "not recorded" row first.
  return [...filtered].sort((a, b) => {
    const av = comparable(a, key);
    const bv = comparable(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

export function displayOf(value: string | number | boolean | null): string {
  if (value === null || value === "") return NOT_RECORDED;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
