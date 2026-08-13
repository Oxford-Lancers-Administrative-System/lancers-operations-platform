"use client";

import { useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "./presentation";

/**
 * UX-30's search, filters and sort.
 *
 * A `GET` form, so the filter is in the query string: a filtered list is a link
 * an operator can send to somebody, and the back button does what it looks like
 * it does.
 *
 * ## No Apply button
 *
 * Brian's LAN-76 clarification: "Apply filters immediately when a selection
 * changes. Remove the separate Apply action." So every select submits the form
 * on change, and the search box submits on Enter and on leaving the field. The
 * only reason an Apply button existed was to make the no-JavaScript path work,
 * and it did not even do that — MUI's `TextField select` is a non-native
 * combobox that needs JavaScript at every width, so the button was buying
 * nothing while costing a click on every filter change.
 *
 * The selects fold behind a `Filters` toggle at phone width, which
 * `slice-ux.md` § 7 asks for: "a single search/filter entry point". Folded, not
 * duplicated — one set of controls laid out two ways by CSS. A phone copy and a
 * desktop copy would put every control in the accessibility tree twice, which
 * is the mistake `ShellNav` avoids for the same reason.
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
  const [showFilters, setShowFilters] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // `requestSubmit` rather than `submit`: it runs the form's own submit
  // handling, which is what a `GET` form needs to build the query string.
  const applyNow = () => formRef.current?.requestSubmit();

  return (
    <Box
      component="form"
      method="get"
      action="/operate/events"
      ref={formRef}
      data-testid="event-filters"
    >
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
          onBlur={applyNow}
          helperText="Name or venue. Press Enter to search."
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
          sx={{ display: { xs: showFilters ? "flex" : "none", md: "flex" } }}
        >
          <TextField
            select
            label="Status"
            name="status"
            defaultValue={status}
            size="small"
            onChange={applyNow}
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
            name="type"
            defaultValue={eventType}
            size="small"
            onChange={applyNow}
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
            The same sort the desktop column headers set, reachable on a phone
            where there are no column headers to click.
          */}
          <TextField
            select
            label="Sort by"
            name="sort"
            defaultValue={sort}
            size="small"
            onChange={applyNow}
            sx={{ minWidth: 150 }}
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
            name="dir"
            defaultValue={direction}
            size="small"
            onChange={applyNow}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="desc">Newest / Z–A first</MenuItem>
            <MenuItem value="asc">Oldest / A–Z first</MenuItem>
          </TextField>
        </Stack>
      </Stack>
    </Box>
  );
}
