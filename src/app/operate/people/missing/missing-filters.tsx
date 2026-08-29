"use client";

import ListFilters from "../../list-filters";
import {
  FILTERABLE_STATUSES,
  labelFor,
  MISSING_FILTER_FIELDS,
  REQUIRED_FIELD_LABELS,
  STATUS_LABELS,
} from "../presentation";

/**
 * `W7-01`'s search and two filters — by which fact is missing, and by where
 * the person stands, "because that is how the work actually batches" (`W7`'s
 * specification). The by-fact filter is this screen's whole point: without it
 * the queue is a list to read rather than a list to work.
 */
export default function MissingFilters({
  basePath,
  scope,
  sortColumns,
  search,
  status,
  fact,
  sort,
  direction,
}: {
  basePath: string;
  scope: "in_season" | "outside_season";
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  fact: string;
  sort: string;
  direction: string;
}) {
  return (
    <ListFilters
      basePath={basePath}
      testId="missing-filters"
      fieldsId="missing-filter-fields"
      search={search}
      searchLabel="Search name or alias"
      searchPlaceholder="First name, last name or alias"
      searchMinWidth={240}
      carry={scope === "outside_season" ? { scope: "outside" } : {}}
      fields={[
        {
          name: "fact",
          label: "Missing",
          value: fact,
          allLabel: "All",
          minWidth: 190,
          options: MISSING_FILTER_FIELDS.map((value) => ({
            value,
            label: REQUIRED_FIELD_LABELS[value],
          })),
        },
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
      ]}
      sortColumns={sortColumns}
      sort={sort}
      direction={direction}
      directionOptions={[
        { value: "asc", label: "Fewest missing first" },
        { value: "desc", label: "Most missing first" },
      ]}
    />
  );
}
