"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { labelFor, STATUS_LABELS, TYPE_LABELS } from "./presentation";

/**
 * UX-30's search and filters.
 *
 * A plain `GET` form. The filter is in the query string, which means a filtered
 * list is a link an operator can send to somebody, the back button does what it
 * looks like it does, and the whole thing works before any JavaScript arrives.
 * The one thing React does here is fold the two selects away on a phone, which
 * `slice-ux.md` § 7 asks for: "a single search/filter entry point".
 *
 * Folded, not duplicated — one set of controls laid out two ways by CSS. A
 * phone copy and a desktop copy would put every control in the accessibility
 * tree twice, which is the same mistake `ShellNav` avoids for the same reason.
 */
export default function EventFilters({
  statuses,
  types,
  search,
  status,
  eventType,
}: {
  statuses: readonly string[];
  types: readonly string[];
  search: string;
  status: string;
  eventType: string;
}) {
  const [showFilters, setShowFilters] = useState(false);

  return (
    <Box component="form" method="get" action="/operate/events" data-testid="event-filters">
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
          sx={{ flexGrow: 1, minWidth: { md: 240 } }}
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
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All</MenuItem>
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
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">All</MenuItem>
            {types.map((value) => (
              <MenuItem key={value} value={value}>
                {labelFor(TYPE_LABELS, value)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <Button type="submit" variant="text">
          Apply
        </Button>
      </Stack>
    </Box>
  );
}
