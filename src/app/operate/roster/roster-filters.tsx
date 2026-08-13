"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { ENTRY_LABELS, labelFor, MEMBERSHIP_STATUS_LABELS } from "./presentation";
import { SEARCH_DEBOUNCE_MS, useFilterSearch } from "../filter-search";

/**
 * Re-exported so this screen's tests can advance timers by exactly the debounce
 * rather than guessing. The value, and the behaviour, now live in
 * `../filter-search` — the events list needed the identical thing.
 */
export { SEARCH_DEBOUNCE_MS };

/**
 * UX-20's search and filters.
 *
 * Everything is in the query string, so a filtered roster is a link an operator
 * can send to somebody, the back button does what it looks like it does, and a
 * refresh keeps the view.
 *
 * ## Why the selects navigate rather than submitting the form
 *
 * The same trap `event-filters.tsx` documents, and it is worth restating
 * because the fix is not obvious from the failure: MUI's `TextField select` is
 * not a native `<select>`, it is a combobox backed by a hidden input, and React
 * writes the new value into that input on the *next* render — after the change
 * handler returns. Calling `requestSubmit()` inside the handler therefore posts
 * the previous value, so choosing a status appears to clear the selection. The
 * value is taken straight off the change event and pushed to the router
 * instead, so there is no window in which the DOM and the intent disagree.
 *
 * ## Filters combine
 *
 * Each control patches one key and carries the rest through, so Status and
 * Entry narrow together rather than replacing one another. The search box keeps
 * a real `GET` form so Enter submits it natively, with the other filters
 * mirrored as hidden inputs so a search never silently drops them.
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
  const router = useRouter();
  const [showFilters, setShowFilters] = useState(false);

  /**
   * The search box filters as you type. Shared with the events list, because
   * that screen shipped the same broken Enter-only version and Brian found the
   * defect twice — see `../filter-search` for the two corrections it carries.
   */
  const push = useCallback((href: string) => router.push(href), [router]);
  const {
    typed,
    setTyped,
    hrefFor: withFilter,
  } = useFilterSearch({
    search,
    basePath: "/operate/roster",
    filters: { status, entry, sort, dir: direction },
    push,
  });

  const apply = (patch: Record<string, string>) => router.push(withFilter(patch));

  return (
    <Box
      component="form"
      method="get"
      action="/operate/roster"
      data-testid="roster-filters"
      sx={{ width: "100%" }}
    >
      {/* So a native search submit carries the filters rather than clearing them. */}
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="entry" value={entry} />
      <input type="hidden" name="sort" value={sort} />
      <input type="hidden" name="dir" value={direction} />

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ alignItems: { md: "center" } }}
      >
        <TextField
          label="Search name or contact"
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          size="small"
          placeholder="Name, email or phone"
          sx={{ flexGrow: 1, minWidth: { md: 240 } }}
        />

        <Button
          variant="outlined"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          aria-controls="roster-filter-fields"
          sx={{
            display: { xs: "inline-flex", md: "none" },
            alignSelf: "flex-start",
            minHeight: 44,
          }}
        >
          Filters
        </Button>

        <Stack
          id="roster-filter-fields"
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
                {labelFor(MEMBERSHIP_STATUS_LABELS, value)}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            label="Entry"
            size="small"
            value={entry}
            onChange={(event) => apply({ entry: event.target.value })}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">All entries</MenuItem>
            {entries.map((value) => (
              <MenuItem key={value} value={value}>
                {labelFor(ENTRY_LABELS, value)}
              </MenuItem>
            ))}
          </TextField>

          {/*
            Sorting lives in the column headers, which is where an operator
            looks for it — so these are phone-only, where there is no table and
            therefore no header to click.
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
            <MenuItem value="asc">A to Z</MenuItem>
            <MenuItem value="desc">Z to A</MenuItem>
          </TextField>
        </Stack>
      </Stack>
    </Box>
  );
}
