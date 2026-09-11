import { readEventYear } from "@/app/calendar/year";
import type { EventPeriod } from "@/lib/services/event-periods";
import { sortColumnHref, sortColumnState, stableSortRows } from "@/lib/services/participation-view";
import { readCurrentSeason } from "@/lib/services/seasons";
import type { FollowUpEvent, FollowUpRow } from "@/lib/services/follow-ups";

/** Query params, sorting and date-range filtering for the Follow-ups queue — W5, LAN-281. Decision history: docs/ux/tickets/LAN-173-operator-chase.md. */

const FOLLOW_UPS_PATH = "/operate/admin/follow-ups";

/** Every column the table sorts by — OWNER-LAN173-05. */
const FOLLOWUPS_SORT_COLUMNS = Object.freeze([
  "person",
  "event",
  "when",
  "deadline",
  "chase",
  "status",
] as const);
export type FollowUpsSortColumn = (typeof FOLLOWUPS_SORT_COLUMNS)[number];

export function isFollowUpsSort(value: string): value is FollowUpsSortColumn {
  return (FOLLOWUPS_SORT_COLUMNS as readonly string[]).includes(value);
}

/** Every other query key this page's URL carries, for a sort or filter link. */
export interface FollowUpsFilters {
  readonly search: string;
  readonly status: string;
  readonly period: EventPeriod;
  /** LAN-281's range, as `YYYY-MM-DD` or empty on either side. */
  readonly from: string;
  readonly to: string;
  readonly sort: string;
  readonly direction: string;
}

/** A calendar day as the query string carries one. A shape, not a validity check. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function dayParam(value: unknown): string {
  return typeof value === "string" && CALENDAR_DAY.test(value) ? value : "";
}

/** Every filter key this page's URL carries (LAN-281 adds `from`/`to`). */
function filterParams(filters: FollowUpsFilters): Record<string, string> {
  return {
    q: filters.search,
    status: filters.status,
    period: filters.period,
    from: filters.from,
    to: filters.to,
  };
}

export function followUpsSortHref(filters: FollowUpsFilters, column: string): string {
  return sortColumnHref(
    FOLLOW_UPS_PATH,
    filterParams(filters),
    "sort",
    "dir",
    filters.sort,
    filters.direction,
    "when",
    column,
  );
}

export function followUpsSortState(
  filters: FollowUpsFilters,
  column: string,
): { active: boolean; direction: "asc" | "desc" } {
  return sortColumnState(filters.sort, filters.direction, column, "when");
}

/** One flat row — the table's own shape, an event repeated across its people. */
export interface QueueRow extends FollowUpRow {
  readonly eventName: string;
  readonly scheduledOn: string | null;
}

export function flatten(events: readonly FollowUpEvent[]): readonly QueueRow[] {
  return events.flatMap((event) =>
    event.people.map((person) => ({
      ...person,
      eventName: event.eventName,
      scheduledOn: event.scheduledOn,
    })),
  );
}

/** A row's sortable value for one column, as a comparable string or number. */
function followUpsSortValue(row: QueueRow, column: FollowUpsSortColumn): string | number {
  switch (column) {
    case "person":
      return row.personName.toLocaleLowerCase();
    case "event":
      return row.eventName.toLocaleLowerCase();
    case "when":
      // Undated sorts last ascending — "￿" convention from participation-view.ts.
      return row.scheduledOn ?? "￿";
    case "deadline":
      return row.deadline ? row.deadline.getTime() : Number.MAX_SAFE_INTEGER;
    case "chase":
      return (row.chasePosition ?? "￿").toLocaleLowerCase();
    case "status":
      return row.status;
  }
}

/** Whether a row's event falls inside a pair of day boundaries, either absent (OWNER-LAN173-05, LAN-281) — undated events are never excluded. */
function withinBounds(
  row: Pick<QueueRow, "scheduledOn">,
  bounds: { startsOn: string | null; endsOn: string | null },
): boolean {
  const day = row.scheduledOn;
  if (day === null) return true;
  if (bounds.startsOn !== null && day < bounds.startsOn) return false;
  if (bounds.endsOn !== null && day > bounds.endsOn) return false;
  return true;
}

/** "This term"'s boundary, read like Events/Calendar do (`@/app/calendar/year`, docs/ux/standards.md rule 7); degrades to no boundary rather than failing the page. */
export async function currentTermBounds(
  today: string,
): Promise<{ startsOn: string | null; endsOn: string | null }> {
  try {
    const season = await readCurrentSeason();
    const year = await readEventYear([], {
      today,
      seasonStartsOn: season.startsOn,
      seasonEndsOn: season.endsOn,
    });
    return {
      startsOn: year?.currentSegmentStartsOn ?? null,
      endsOn: year?.currentSegmentEndsOn ?? null,
    };
  } catch {
    return { startsOn: null, endsOn: null };
  }
}

/** Filtered, sorted rows for the queue, from the already-flattened rows. */
export function sortFilteredRows(
  rows: readonly QueueRow[],
  filters: FollowUpsFilters,
  bounds: { startsOn: string | null; endsOn: string | null },
): readonly QueueRow[] {
  const needle = filters.search.trim().toLowerCase();
  const filtered = rows.filter(
    (row) =>
      (filters.status === "" || row.status === filters.status) &&
      (needle === "" || row.personName.toLowerCase().includes(needle)) &&
      withinBounds(row, bounds) &&
      // Each control narrows: the range is read alongside "When", never instead of it — LAN-281.
      withinBounds(row, { startsOn: filters.from || null, endsOn: filters.to || null }),
  );

  const sortColumn: FollowUpsSortColumn = isFollowUpsSort(filters.sort) ? filters.sort : "when";
  const descending = filters.direction === "desc";
  return stableSortRows(
    filtered,
    (row) => followUpsSortValue(row, sortColumn),
    descending,
    (left, right) => {
      const order = left.personName.localeCompare(right.personName);
      return order === 0 ? left.invitationId.localeCompare(right.invitationId) : order;
    },
  );
}
