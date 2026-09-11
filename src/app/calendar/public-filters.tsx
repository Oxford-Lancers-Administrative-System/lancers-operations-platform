"use client";

import ListFilters from "@/app/operate/list-filters";

/**
 * Search and type, on the public list. LAN-153, `REQ-list-shape`. Two
 * controls, not three: no Status, since the public tier has none to filter
 * by (`W1`'s tier table). No Apply button (§4.4) — the shared bar already
 * debounces and navigates from the change event.
 */
export default function PublicFilters({
  templates,
  search,
  templateId,
  sort,
  direction,
  sortColumns,
  period,
}: {
  /** LAN-265. The club's own templates, offered by name and selected by id. */
  templates: readonly { id: string; name: string }[];
  search: string;
  templateId: string;
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
