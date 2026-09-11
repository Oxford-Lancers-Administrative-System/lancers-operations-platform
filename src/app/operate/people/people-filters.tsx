"use client";

import ListFilters from "../list-filters";
import { FILTERABLE_STATUSES, labelFor, STATUS_LABELS } from "./presentation";

// W1-01's search and two thin filters — Brian, 2026-08-26.
export default function PeopleFilters({
  basePath,
  scope,
  sortColumns,
  search,
  status,
  missingOnly,
  sort,
  direction,
}: {
  basePath: string;
  scope: "in_season" | "outside_season";
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  missingOnly: boolean;
  sort: string;
  direction: string;
}) {
  return (
    <ListFilters
      basePath={basePath}
      testId="people-filters"
      fieldsId="people-filter-fields"
      search={search}
      searchLabel="Search name or alias"
      searchPlaceholder="First name, last name or alias"
      searchMinWidth={240}
      carry={scope === "outside_season" ? { scope: "outside" } : {}}
      fields={[
        {
          name: "status",
          label: "Status",
          value: status,
          allLabel: "All statuses",
          minWidth: 170,
          options: FILTERABLE_STATUSES.map((value) => ({
            value: value as string,
            label: labelFor(STATUS_LABELS, value as string),
          })),
        },
        {
          name: "missing",
          label: "Missing data",
          value: missingOnly ? "yes" : "",
          allLabel: "All",
          minWidth: 170,
          options: [{ value: "yes", label: "Missing something" }],
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
