"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import { DateField, Field } from "@/components/field";
import { useFilterSearch } from "@/app/operate/filter-search";
import { SIDEWAYS_PHONE } from "@/theme-tokens";
import { EVENT_PERIODS, PERIOD_LABELS, type EventPeriod } from "@/lib/services/event-periods";
import {
  RANGE_FROM_LABEL,
  RANGE_TO_LABEL,
  SEARCH_LABEL,
  STATUS_FILTER_OPTIONS,
} from "./presentation";

/**
 * W5-01's search and Status filter — OWNER-LAN173-01 — plus the "When" date
 * filter (OWNER-LAN173-05) and LAN-281's date range. Fields navigate on
 * their own change event, not submit — MUI writes the hidden input on the
 * *next* render. `sort`/`direction` travel through `filters` unread.
 *
 * The five controls need about 1,200px in one row. Below `lg`, and on a
 * phone held sideways (Brian, 2026-09-28: the search was crushed to "S…" at
 * 956×440), the search takes its own full-width row and the four filters
 * share the row beneath it, wrapping when they do not fit. From `lg` up the
 * filter row is `display: contents`, so the five sit in one row exactly as
 * they always have.
 */
/** One filter's sizing: its desktop minimum in the one row, a share of the row below it. */
function filterSx(desktopMinWidth: number) {
  return {
    width: { xs: "100%", sm: "auto" },
    minWidth: { sm: 160, lg: desktopMinWidth },
    flex: { sm: "1 1 0", lg: "0 1 auto" },
    [SIDEWAYS_PHONE]: { minWidth: 160, flex: "1 1 0" },
  };
}

export default function FollowUpsFilter({
  basePath,
  search,
  status,
  period,
  from,
  to,
  sort,
  direction,
}: {
  basePath: string;
  search: string;
  status: string;
  period: EventPeriod;
  /** `YYYY-MM-DD`, or empty for no boundary on that side. */
  from: string;
  to: string;
  sort: string;
  direction: string;
}) {
  const router = useRouter();
  const push = useCallback((href: string) => router.push(href), [router]);

  const { typed, setTyped, hrefFor } = useFilterSearch({
    search,
    basePath,
    filters: { status, period, from, to, sort, dir: direction },
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
        direction={{ xs: "column", lg: "row" }}
        spacing={2}
        useFlexGap
        sx={{
          width: "100%",
          alignItems: { lg: "flex-end" },
          [SIDEWAYS_PHONE]: { flexDirection: "column", alignItems: "stretch" },
        }}
        data-testid="follow-ups-toolbar"
      >
        <Field
          label={SEARCH_LABEL}
          name="q"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          sx={{ width: { xs: "100%", lg: 320 }, [SIDEWAYS_PHONE]: { width: "100%" } }}
        />
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          useFlexGap
          sx={{
            alignItems: { sm: "flex-end" },
            flexWrap: { sm: "wrap" },
            display: { lg: "contents" },
            [SIDEWAYS_PHONE]: { display: "flex" },
          }}
          data-testid="follow-ups-filter-row"
        >
          <Field
            select
            label="Status"
            name="status"
            value={status}
            onChange={(event) => router.push(hrefFor({ status: event.target.value }))}
            sx={filterSx(220)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Field>
          <Field
            select
            label="When"
            name="period"
            value={period}
            onChange={(event) => router.push(hrefFor({ period: event.target.value }))}
            sx={filterSx(220)}
            data-testid="follow-ups-period"
          >
            {EVENT_PERIODS.map((value) => (
              <MenuItem key={value} value={value}>
                {PERIOD_LABELS[value]}
              </MenuItem>
            ))}
          </Field>
          <Box sx={filterSx(190)}>
            <DateField
              label={RANGE_FROM_LABEL}
              name="from"
              value={from}
              helperText={null}
              onChange={(day) => router.push(hrefFor({ from: day }))}
              field="follow-ups-from"
            />
          </Box>
          <Box sx={filterSx(190)}>
            <DateField
              label={RANGE_TO_LABEL}
              name="to"
              value={to}
              helperText={null}
              onChange={(day) => router.push(hrefFor({ to: day }))}
              field="follow-ups-to"
            />
          </Box>
        </Stack>
      </Stack>
    </Box>
  );
}
