"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFilterSearch } from "@/app/operate/filter-search";
import { SEARCH_LABEL, STATUS_FILTER_OPTIONS } from "./presentation";

/**
 * W5-01's search and Status filter — OWNER-LAN173-01.
 *
 * The search half reuses `useFilterSearch` for the same reason every other
 * filtered table in the operator shell does: filtering as you type, and never
 * dropping what was typed inside the debounce window. The Status select
 * navigates from the change event's own value rather than on form submit,
 * because MUI's `TextField select` is a combobox over a hidden input whose
 * value React writes on the *next* render — submitting inside the handler
 * would post the previous selection, exactly the defect `delivery-filters.tsx`
 * documents for the same control.
 */
export default function FollowUpsFilter({
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
    filters: { status },
    push,
  });

  return (
    <Box
      component="form"
      method="get"
      action={basePath}
      data-testid="follow-ups-filters"
      sx={{ width: "100%" }}
    >
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
          size="small"
          sx={{ width: { xs: "100%", sm: 320 } }}
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
          {STATUS_FILTER_OPTIONS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Box>
  );
}
