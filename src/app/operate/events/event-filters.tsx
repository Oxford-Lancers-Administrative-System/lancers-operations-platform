"use client";

import ListFilters from "../list-filters";
import { DERIVED_STATE_LABELS, labelFor, STATUS_LABELS, TYPE_LABELS } from "./presentation";

/**
 * The word for one Status filter value — Q-6.
 *
 * Three of the four are stored states and one is derived, and they are held in
 * two maps on purpose: `STATUS_LABELS` is what the club calls an
 * `event_status`, and `DERIVED_STATE_LABELS` is what it calls the state a
 * screen works out. This filter is the one control that offers both, so it is
 * the one place that reads from both, and neither map grows a key that does not
 * belong to it.
 */
function statusFilterLabel(value: string): string {
  return value in STATUS_LABELS
    ? labelFor(STATUS_LABELS, value)
    : labelFor(DERIVED_STATE_LABELS, value);
}

/**
 * UX-30's search and filters — the events list's vocabulary over the shared bar.
 *
 * Every filter is in the query string, so a filtered list is a link an operator
 * can send to somebody and the back button does what it looks like it does.
 *
 * The bar itself is `../list-filters`, shared with the roster since LAN-127.
 * This screen is the reason it is shared twice over: it first shipped the same
 * Enter-only search defect the roster had, which is why `../filter-search`
 * exists, and it then went without the 44px touch target the roster's Filters
 * toggle carried — the accessibility minimum `docs/ux/tickets/LAN-74` states
 * and fifteen other files honour. Both were the same failure, a screen copied
 * without one of its details. It now gets the target from the shared component.
 *
 * What stays here is the events list's own vocabulary: Status and Type rather
 * than Status and Entry, and dates ordered newest-first rather than A to Z.
 */
export default function EventFilters({
  statuses,
  types,
  sortColumns,
  search,
  status,
  eventType,
  sort,
  direction,
  period,
}: {
  statuses: readonly string[];
  types: readonly string[];
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  eventType: string;
  sort: string;
  direction: string;
  /** Kept as the operator narrows, so typing does not reset the period. */
  period: string;
}) {
  return (
    <ListFilters
      basePath="/operate/events"
      testId="event-filters"
      fieldsId="event-filter-fields"
      search={search}
      searchLabel="Search events"
      searchPlaceholder="Name or venue"
      searchMinWidth={220}
      fields={[
        {
          name: "status",
          label: "Status",
          value: status,
          allLabel: "All statuses",
          minWidth: 170,
          options: statuses.map((value) => ({ value, label: statusFilterLabel(value) })),
        },
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
