"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
import { useFilterSearch } from "../../../filter-search";
import { SEARCH_LABEL, STATUS_FILTERS } from "./presentation";

// UX-51's search and status filter, in the query string. The status select
// navigates from the change event's value, not a form submit — MUI's
// TextField select writes its hidden input on the NEXT render.
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
      {/* Mirrored so Enter in the search box never drops the other filters. */}
      <input type="hidden" name="view" value="diagnostics" />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ width: "100%", alignItems: { sm: "flex-end" } }}
      >
        <Field
          label={SEARCH_LABEL}
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Field
          select
          label="Status"
          name="status"
          value={status}
          onChange={(event) => router.push(hrefFor({ status: event.target.value }))}
          sx={{ minWidth: { sm: 220 }, width: { xs: "100%", sm: "auto" } }}
        >
          {STATUS_FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Field>
      </Stack>
    </Box>
  );
}
