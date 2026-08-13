"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "./presentation";

/**
 * UX-30's search and filters.
 *
 * Every filter is in the query string, so a filtered list is a link an operator
 * can send to somebody and the back button does what it looks like it does.
 *
 * ## Why this navigates rather than submitting the form
 *
 * The first version called `form.requestSubmit()` from the select's `onChange`,
 * and it did not work: MUI's `TextField select` is not a native `<select>`, it
 * is a combobox backed by a **hidden input**, and React writes the new value
 * into that input on the next render — after the handler returns. Submitting
 * inside the handler therefore posted the *previous* value, so choosing a
 * status navigated to `?status=` and the selection appeared to clear itself.
 * Brian found that on the real screen; no render test could, because none of
 * them submits a form.
 *
 * So the value comes straight off the change event and the router is pushed
 * with it. There is no window in which the DOM and the intent disagree.
 *
 * ## Filters combine
 *
 * Each control patches one key and carries the rest through, so Status and Type
 * narrow together — "the practices that are in draft" is one list, not the
 * second filter replacing the first.
 *
 * The search box keeps a real `GET` form so Enter submits it natively, with the
 * other filters mirrored as hidden inputs so a search never silently drops
 * them.
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
}: {
  statuses: readonly string[];
  types: readonly string[];
  sortColumns: readonly { value: string; label: string }[];
  search: string;
  status: string;
  eventType: string;
  sort: string;
  direction: string;
}) {
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);

  /** The current filter, with one key changed, as a URL. */
  const withFilter = (patch: Record<string, string>): string => {
    const next = { q: search, status, type: eventType, sort, dir: direction, ...patch };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value !== "") params.set(key, value);
    }
    const query = params.toString();
    return query === "" ? "/operate/events" : `/operate/events?${query}`;
  };

  const apply = (patch: Record<string, string>) => router.push(withFilter(patch));

  return (
    <Box
      component="form"
      method="get"
      action="/operate/events"
      data-testid="event-filters"
      sx={{ width: "100%" }}
    >
      {/* So a native search submit carries the filters rather than clearing them. */}
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="type" value={eventType} />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={direction} />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" } }}
      >
        <TextField
          label="Search events"
          name="q"
          defaultValue={search}
          size="small"
          placeholder="Name or venue"
          sx={{ flexGrow: 1, minWidth: { md: 220 } }}
        />

        <Button
          variant="outlined"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls="event-filter-fields"
          sx={{ display: { xs: "inline-flex", md: "none" }, alignSelf: "flex-start" }}
        >
          Filters
        </Button>

        <Stack
          id="event-filter-fields"
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ display: { xs: showFilters ? "flex" : "none", md: "flex" }, alignItems: "center" }}
        >
          <TextField
            select
            label="Status"
            size="small"
            value={status}
            onChange={(event) => apply({ status: event.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All statuses</MenuItem>
            {statuses.map((value) => (
              <MenuItem key={value} value={value}>
                {labelFor(STATUS_LABELS, value)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Type"
            size="small"
            value={eventType}
            onChange={(event) => apply({ type: event.target.value })}
            sx={{ minWidth: 170 }}
          >
            <MenuItem value="">All types</MenuItem>
            {types.map((value) => (
              <MenuItem key={value} value={value}>
                {labelFor(TYPE_LABELS, value)}
              </MenuItem>
            ))}
          </TextField>

          {/*
            Sorting lives in the column headers, which is where an operator
            looks for it — so these are phone-only, where there is no table and
            therefore no header to click. Showing them on the desktop as well
            was a second way to do the same thing in the same eyeline.
          */}
          <TextField
            select
            label="Sort by"
            size="small"
            value={sort}
            onChange={(event) => apply({ sort: event.target.value })}
            sx={{ display: { xs: "flex", md: "none" }, minWidth: 150 }}
          >
            {sortColumns.map((column) => (
              <MenuItem key={column.value} value={column.value}>
                {column.label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Order"
            size="small"
            value={direction}
            onChange={(event) => apply({ dir: event.target.value })}
            sx={{ display: { xs: "flex", md: "none" }, minWidth: 150 }}
          >
            <MenuItem value="desc">Newest first</MenuItem>
            <MenuItem value="asc">Oldest first</MenuItem>
          </TextField>
        </Stack>
      </Stack>
    </Box>
  );
}
