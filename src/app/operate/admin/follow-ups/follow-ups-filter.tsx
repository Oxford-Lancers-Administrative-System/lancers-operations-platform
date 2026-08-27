"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useFilterSearch } from "@/app/operate/filter-search";
import { EVENT_PERIODS, PERIOD_LABELS, type EventPeriod } from "@/lib/services/event-periods";
import { SEARCH_LABEL, STATUS_FILTER_OPTIONS } from "./presentation";

/**
 * W5-01's search and Status filter — OWNER-LAN173-01 — plus the "When" date
 * filter OWNER-LAN173-05 adds.
 *
 * The search half reuses `useFilterSearch` for the same reason every other
 * filtered table in the operator shell does: filtering as you type, and never
 * dropping what was typed inside the debounce window. The Status and When
 * selects navigate from the change event's own value rather than on form
 * submit, because MUI's `TextField select` is a combobox over a hidden input
 * whose value React writes on the *next* render — submitting inside the
 * handler would post the previous selection, exactly the defect
 * `delivery-filters.tsx` documents for the same control.
 *
 * `sort`/`direction` travel through `filters` too, unread by either select
 * here, so choosing Status, search or When never drops whichever column the
 * table is currently sorted by (`participation-view.ts`'s own
 * `sortColumnHref`, which the table's headings use, does the same the other
 * way — a sort never drops a filter).
 *
 * When's options are `@/lib/services/event-periods`'s own five, verbatim —
 * the same vocabulary the Events list and Calendar already offer as **This
 * week**, **This month**, **This term**, **All upcoming** and **All events**.
 * Brian named three of the five ("this week, this month, this term"); the
 * other two are the existing control's own remaining options, offered here
 * rather than invented or dropped.
 */
export default function FollowUpsFilter({
  basePath,
  search,
  status,
  period,
  sort,
  direction,
}: {
  basePath: string;
  search: string;
  status: string;
  period: EventPeriod;
  sort: string;
  direction: string;
}) {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);

  const { typed, setTyped, hrefFor } = useFilterSearch({
    search,
    basePath,
    filters: { status, period, sort, dir: direction },
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
        <TextField
          select
          label="When"
          name="period"
          value={period}
          onChange={(event) => router.push(hrefFor({ period: event.target.value }))}
          size="small"
          sx={{ minWidth: { sm: 220 }, width: { xs: "100%", sm: "auto" } }}
          data-testid="follow-ups-period"
        >
          {EVENT_PERIODS.map((value) => (
            <MenuItem key={value} value={value}>
              {PERIOD_LABELS[value]}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Box>
  );
}
