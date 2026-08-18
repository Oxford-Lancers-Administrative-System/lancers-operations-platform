"use client";

import ListFilters from "../list-filters";
import { ENTRY_LABELS, labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { SEARCH_DEBOUNCE_MS } from "../filter-search";

/**
 * Re-exported so this screen's tests can advance timers by exactly the debounce
 * rather than guessing. The value, and the behaviour, live in
 * `../filter-search` — the events list needed the identical thing.
 */
export { SEARCH_DEBOUNCE_MS };

/**
 * UX-20's search and filters — the roster's vocabulary over the shared bar.
 *
 * Everything is in the query string, so a filtered roster is a link an operator
 * can send to somebody, the back button does what it looks like it does, and a
 * refresh keeps the view.
 *
 * The bar itself is `../list-filters`, shared with the events list since
 * LAN-127: the two screens had it twice at exactly 202 lines each, and the
 * copies had already drifted apart on the phone touch target. What stays here
 * is what belongs to the roster — which two things it narrows by, what it calls
 * them, and that "A to Z" is the right name for ordering people.
 */
export default function RosterFilters({
  statuses,
  entries,
  sortColumns,
  search,
  status,
  entry,
  sort,
  direction,
}: {
  statuses: readonly string[];
  entries: readonly string[];
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  entry: string;
  sort: string;
  direction: string;
}) {
  return (
    <ListFilters
      basePath="/operate/roster"
      testId="roster-filters"
      fieldsId="roster-filter-fields"
      search={search}
      searchLabel="Search name or contact"
      searchPlaceholder="Name, email or phone"
      searchMinWidth={240}
      fields={[
        {
          name: "status",
          label: "Status",
          value: status,
          allLabel: "All statuses",
          minWidth: 170,
          options: statuses.map((value) => ({
            value,
            label: labelFor(MEMBERSHIP_STATUS_LABELS, value),
          })),
        },
        {
          name: "entry",
          label: "Entry",
          value: entry,
          allLabel: "All entries",
          minWidth: 150,
          options: entries.map((value) => ({ value, label: labelFor(ENTRY_LABELS, value) })),
        },
      ]}
      sortColumns={sortColumns}
      sort={sort}
      direction={direction}
      directionOptions={[
        { value: "asc", label: "A to Z" },
        { value: "desc", label: "Z to A" },
      ]}
    />
  );
}
