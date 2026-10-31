/**
 * The Roster and Recruits boards' sort — LAN-495, Alternative A (Brian,
 * 16 October 2026). Pure: no React, no storage, no database.
 *
 * A sort is up to three ordered keys, each with its own direction. The first
 * key decides; the second breaks its ties; the third breaks what is left; and
 * a final tie-break on display name, then record id, makes the order the same
 * on every device whatever order the rows arrived in.
 *
 * Every comparison follows one rule set: numbers numerically, text with en-GB
 * numeric collation, dates by instant, and an absent value last in either
 * direction. Status stays alphabetical by its stored code (LAN-426).
 */

export type SortDirection = "asc" | "desc";

export interface SortKey {
  readonly key: string;
  readonly direction: SortDirection;
}

/** What a field holds, which decides how its two orders are worded. */
export type SortKind = "text" | "number" | "date";

/** One field the sort sheet offers. */
export interface SortField {
  readonly key: string;
  readonly label: string;
  readonly kind: SortKind;
}

/** A row's value for one key: `null` is "nothing recorded", which sorts last. */
export type SortValue = string | number | null;

export const MAX_SORT_KEYS = 3;

/** The words for one order, by the field's type. */
export function orderLabel(kind: SortKind, direction: SortDirection): string {
  if (kind === "date") return direction === "asc" ? "Oldest first" : "Newest first";
  if (kind === "number") return direction === "asc" ? "Low–High" : "High–Low";
  return direction === "asc" ? "A–Z" : "Z–A";
}

const COLLATOR = new Intl.Collator("en-GB", { numeric: true });

/**
 * One key's comparison. An absent value is last in either direction: the
 * direction reverses the comparison of two present values, never the array.
 */
export function compareValues(left: SortValue, right: SortValue, direction: SortDirection): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const factor = direction === "asc" ? 1 : -1;
  if (typeof left === "number" && typeof right === "number") {
    return left === right ? 0 : (left < right ? -1 : 1) * factor;
  }
  return COLLATOR.compare(String(left), String(right)) * factor;
}

/** How to tell two rows apart once every key ties. */
export interface TieBreak<Row> {
  readonly name: (row: Row) => string;
  readonly id: (row: Row) => string;
}

/** Display name, then record id — the same answer on every device. */
function compareTieBreak<Row>(a: Row, b: Row, tieBreak: TieBreak<Row>): number {
  const byName = COLLATOR.compare(tieBreak.name(a), tieBreak.name(b));
  if (byName !== 0) return byName;
  const left = tieBreak.id(a);
  const right = tieBreak.id(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

/**
 * The rows in sort order: each key in turn, then `fallback` (a board's own
 * default, used when no key is chosen), then the tie-break. Returns a new
 * array; the input is not touched.
 */
export function sortRows<Row>(
  rows: readonly Row[],
  keys: readonly SortKey[],
  valueOf: (row: Row, key: string) => SortValue,
  tieBreak: TieBreak<Row>,
  fallback?: (a: Row, b: Row) => number,
): Row[] {
  return [...rows].sort((a, b) => {
    for (const { key, direction } of keys) {
      const result = compareValues(valueOf(a, key), valueOf(b, key), direction);
      if (result !== 0) return result;
    }
    if (keys.length === 0 && fallback) {
      const result = fallback(a, b);
      if (result !== 0) return result;
    }
    return compareTieBreak(a, b, tieBreak);
  });
}

/**
 * The value a multi-valued cell sorts by: its first value in the column's own
 * option order, or its first value where the column has no fixed options.
 */
export function firstInOptionOrder(
  values: readonly string[],
  options: readonly string[] | undefined,
): string | null {
  if (values.length === 0) return null;
  if (!options || options.length === 0) return values[0];
  let best: string | null = null;
  let bestIndex = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const index = options.indexOf(value);
    const rank = index === -1 ? options.length : index;
    if (rank < bestIndex) {
      best = value;
      bestIndex = rank;
    }
  }
  return best;
}

/** An instant as milliseconds, or `null` where there is none or it does not parse. */
export function instantOf(value: string | null | undefined): number | null {
  if (!value) return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
}

/**
 * Keeps keys the viewer may sort by, in order, each once, at most three. A
 * stored or linked key the viewer can no longer see is dropped quietly.
 */
export function keepAllowed(
  keys: readonly SortKey[],
  allowed: ReadonlySet<string>,
): readonly SortKey[] {
  const seen = new Set<string>();
  const kept: SortKey[] = [];
  for (const key of keys) {
    if (!allowed.has(key.key) || seen.has(key.key)) continue;
    seen.add(key.key);
    kept.push(key);
    if (kept.length === MAX_SORT_KEYS) break;
  }
  return kept;
}

/**
 * Reads `?sort=`. The current form is `status:asc,college:asc,lastName:desc`;
 * the single-key form `?sort=status&dir=desc` that older links carry still
 * reads, as one key. Anything else is ignored rather than refused.
 */
export function parseSortParam(sort: string | null | undefined, dir?: string | null): SortKey[] {
  if (!sort) return [];
  if (!sort.includes(":") && !sort.includes(",")) {
    return [{ key: sort, direction: dir === "desc" ? "desc" : "asc" }];
  }
  const keys: SortKey[] = [];
  for (const part of sort.split(",")) {
    const [key, direction] = part.split(":");
    if (!key || (direction !== "asc" && direction !== "desc")) continue;
    keys.push({ key, direction });
  }
  return keys;
}

/** The `?sort=` value for these keys — empty for none. */
export function formatSortParam(keys: readonly SortKey[]): string {
  return keys.map((key) => `${key.key}:${key.direction}`).join(",");
}

/**
 * A column heading's tap. It changes key 1 only and keeps keys 2 and 3: the
 * heading already first flips its direction, any other becomes first, A–Z,
 * and leaves the later position it held so it is never listed twice.
 */
export function headerSort(current: readonly SortKey[], key: string): readonly SortKey[] {
  const first = current[0];
  if (first?.key === key) {
    return [{ key, direction: first.direction === "asc" ? "desc" : "asc" }, ...current.slice(1)];
  }
  const rest = current.slice(1).filter((entry) => entry.key !== key);
  return [{ key, direction: "asc" as const }, ...rest].slice(0, MAX_SORT_KEYS);
}

/**
 * One row of the sort sheet changed. `key` null is None: the row is removed
 * and later rows move up. A row past the end appends. A field already chosen
 * elsewhere is not offered, so a duplicate here is dropped defensively.
 */
export function setSortRow(
  current: readonly SortKey[],
  index: number,
  next: SortKey | null,
): readonly SortKey[] {
  if (next === null) return current.filter((_, at) => at !== index);
  const updated = [...current];
  const position = Math.min(index, updated.length);
  updated[position] = next;
  return updated
    .filter((entry, at) => at === position || entry.key !== next.key)
    .slice(0, MAX_SORT_KEYS);
}

/**
 * A board's address: `base` plus its query, with `:` and `,` left readable so a
 * shared link reads `?sort=status:asc,college:asc`. Both are legal in a query
 * and decode to themselves, so nothing a reader parses changes.
 */
export function boardUrl(base: string, params: URLSearchParams): string {
  const query = params.toString().replace(/%3A/gi, ":").replace(/%2C/gi, ",");
  return query === "" ? base : `${base}?${query}`;
}
