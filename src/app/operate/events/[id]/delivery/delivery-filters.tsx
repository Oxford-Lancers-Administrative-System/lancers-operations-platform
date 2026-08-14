"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFilterSearch } from "../../../filter-search";
import { SEARCH_LABEL, STATUS_FILTERS } from "./presentation";

/**
 * UX-51's search and status filter.
 *
 * Both live in the query string, so a filtered diagnostics view is a link an
 * operator can send to somebody and the back button does what it looks like it
 * does.
 *
 * The search behaviour comes from the shared `useFilterSearch`, which carries
 * two corrections paid for on real screens: filtering as you type rather than
 * on an unadvertised Enter, and not losing text typed inside the debounce
 * window. The status select navigates from the change event's value rather than
 * submitting the form, because MUI's `TextField select` is a combobox over a
 * hidden input whose value React writes on the *next* render — submitting
 * inside the handler posts the previous selection.
 */
export default function DeliveryFilters({
  basePath,
  search,
  status,
}: {
  basePath: string;
  search: string;
  status: string;
}) {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);

  const { typed, setTyped, hrefFor } = useFilterSearch({
    search,
    basePath,
    filters: { status, view: "diagnostics" },
    push,
  });

  return (
    <Box
      component="form"
      method="get"
      action={basePath}
      data-testid="delivery-filters"
      sx={{ width: "100%" }}
    >
      {/* Mirrored so a native submit — Enter in the search box — never drops
          the other filters silently. */}
      <input type="hidden" name="view" value="diagnostics" />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ width: "100%", alignItems: { sm: "flex-end" } }}
      >
        <TextField
          label={SEARCH_LABEL}
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          fullWidth
          size="small"
        />
        <TextField
          select
          label="Status"
          name="status"
          value={status}
          onChange={(event) => router.push(hrefFor({ status: event.target.value }))}
          size="small"
          sx={{ minWidth: { sm: 220 }, width: { xs: "100%", sm: "auto" } }}
        >
          {STATUS_FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Box>
  );
}
