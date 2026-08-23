"use client";

import ListFilters from "@/app/operate/list-filters";
import { labelFor, TYPE_LABELS } from "@/lib/services/event-vocabulary";

/**
 * Search and type, on the public list. LAN-153, `REQ-list-shape`.
 *
 * ## Two controls, not three
 *
 * The operator's bar carries Status as well. The public tier has no status to
 * filter by — `W1`'s tier table keeps the status column on the operator's side —
 * so offering the control would offer a narrowing that has nothing to narrow.
 * The service refuses an unknown sort or filter the same way it always has,
 * quietly and by falling back, so a hand-typed `?status=draft` neither works nor
 * announces that it might have.
 *
 * ## Applied as you type, and combining
 *
 * §4.4, and Brian's own words at the mockup review: there is **no Apply button**.
 * The shared bar this is built on already behaves that way — the search box
 * debounces and pushes, the selects navigate from the change event, and each
 * control patches one query key and carries the rest — so this is the events
 * list's vocabulary over the roster's control rather than a second
 * implementation of the same interaction.
 */
export default function PublicFilters({
  types,
  search,
  eventType,
  sort,
  direction,
  sortColumns,
  period,
}: {
  types: readonly string[];
  search: string;
  eventType: string;
  sort: string;
  direction: string;
  sortColumns: readonly { value: string; label: string }[];
  /** Kept as the reader searches, so typing does not reset the period. */
  period: string;
}) {
  return (
    <ListFilters
      basePath="/calendar"
      testId="public-event-filters"
      fieldsId="public-event-filter-fields"
      search={search}
      searchLabel="Search events"
      searchPlaceholder="Name or venue"
      searchMinWidth={220}
      fields={[
        {
          name: "type",
          label: "Type",
          value: eventType,
          allLabel: "All types",
          minWidth: 170,
          options: types.map((value) => ({ value, label: labelFor(TYPE_LABELS, value) })),
        },
      ]}
      sortColumns={sortColumns}
      sort={sort}
      direction={direction}
      directionOptions={[
        { value: "asc", label: "Soonest first" },
        { value: "desc", label: "Latest first" },
      ]}
      carry={{ period }}
    />
  );
}
