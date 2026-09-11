"use client";

import ListFilters from "../list-filters";
import { ENTRY_LABELS, labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { SEARCH_DEBOUNCE_MS } from "../filter-search";

export { SEARCH_DEBOUNCE_MS };

// UX-20's search and filters over the shared `../list-filters` bar
// (LAN-127).
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
