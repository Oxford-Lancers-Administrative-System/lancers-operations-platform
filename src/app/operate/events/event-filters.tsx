"use client";

import ListFilters from "../list-filters";
import { DERIVED_STATE_LABELS, labelFor, STATUS_LABELS } from "./presentation";

/** The word for one Status filter value — Q-6. Reads `STATUS_LABELS` or `DERIVED_STATE_LABELS`, whichever owns the key. */
function statusFilterLabel(value: string): string {
  return value in STATUS_LABELS
    ? labelFor(STATUS_LABELS, value)
    : labelFor(DERIVED_STATE_LABELS, value);
}

/** UX-30's search and filters, shared with the roster (`../list-filters`, LAN-127). Every filter lives in the query string — a filtered list is a shareable link. Own vocabulary: Status/Type, dates newest-first. */
export default function EventFilters({
  statuses,
  templates,
  sortColumns,
  search,
  status,
  templateId,
  sort,
  direction,
  period,
}: {
  statuses: readonly string[];
  /** LAN-265. The club's own templates, offered by name and selected by id. */
  templates: readonly { id: string; name: string }[];
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  templateId: string;
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
          // Parameter stays `type`, label stays Type — LAN-265 changed the values (template ids now), not what's narrowed.
          name: "type",
          label: "Type",
          value: templateId,
          allLabel: "All types",
          minWidth: 170,
          options: templates.map((template) => ({ value: template.id, label: template.name })),
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
