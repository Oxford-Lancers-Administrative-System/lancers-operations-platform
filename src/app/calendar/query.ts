import { DEFAULT_EVENT_SORT, EVENT_SORT_COLUMNS } from "@/lib/services/events";
import { parseEventPeriod, type EventPeriod } from "@/lib/services/event-periods";
import type { SortLink } from "./sortable-header";

/**
 * Reading the query string an event list arrives with. LAN-153.
 *
 * Shared by the public list and the operator's, because they carry the same
 * parameters and a second reader of the same URL is a second set of defaults
 * waiting to disagree. Nothing here decides what a reader may *see* — that is
 * `@/lib/auth/event-tier` — only what they asked for.
 */

export type QueryParams = Record<string, string | string[] | undefined>;

/** One value from a parameter Next may hand back as an array. */
export function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export interface ListQuery {
  search: string;
  eventType: string;
  status: string;
  period: EventPeriod;
  sort: string;
  direction: string;
  /** True when the reader has narrowed the list, which the empty state needs. */
  filtered: boolean;
}

/**
 * What the list was asked for.
 *
 * `allowedSorts` is the tier's whitelist: an unrecognised column falls back to
 * the default rather than erroring, and the public tier's list simply does not
 * include the operator's count columns — so `?sort=said_yes` on the public
 * calendar sorts by date and says nothing about a column that exists elsewhere.
 */
export function readListQuery(params: QueryParams, allowedSorts: readonly string[]): ListQuery {
  const requested = first(params.sort);
  const sort = allowedSorts.includes(requested) ? requested : DEFAULT_EVENT_SORT;
  const requestedDirection = first(params.dir);
  const direction =
    requestedDirection === "asc" || requestedDirection === "desc"
      ? requestedDirection
      : (EVENT_SORT_COLUMNS[sort]?.default ?? "asc");

  const search = first(params.q);
  const eventType = first(params.type);
  const status = first(params.status);

  return {
    search,
    eventType,
    status,
    period: parseEventPeriod(first(params.period)),
    sort,
    direction,
    filtered: search !== "" || eventType !== "" || status !== "",
  };
}

/**
 * The href a column header links to, carrying every other parameter.
 *
 * Clicking the active column flips its direction; clicking another takes that
 * column's own default. The period travels too, so sorting does not quietly
 * widen or narrow what is in view.
 */
export function sortLinkFactory({
  basePath,
  query,
  carryKeys,
  params,
}: {
  basePath: string;
  query: ListQuery;
  /** The query keys to carry — `q`, `type`, `status`, `period`. */
  carryKeys: readonly string[];
  params: QueryParams;
}): (column: string) => SortLink {
  return (column: string): SortLink => {
    const active = query.sort === column;
    const next = active
      ? query.direction === "asc"
        ? "desc"
        : "asc"
      : (EVENT_SORT_COLUMNS[column]?.default ?? "asc");

    const search = new URLSearchParams();
    for (const key of carryKeys) {
      const value = key === "period" ? query.period : first(params[key]);
      if (value !== "") search.set(key, value);
    }
    search.set("sort", column);
    search.set("dir", next);

    return { column, href: `${basePath}?${search.toString()}` };
  };
}
