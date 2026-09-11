"use client";

import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { EVENT_PERIODS, PERIOD_LABELS, type EventPeriod } from "@/lib/services/event-periods";

/**
 * Which stretch of the season the list is showing. LAN-153, `REQ-list-shape`.
 * Buttons at desktop, one select at 375 (Brian, 21 August 2026: buttons
 * wrapped into three rows, "just too much at the very top") — a reflow, not
 * a filter (`slice-ux.md` § 7). The period is in the query string; the
 * select navigates from the change event, not a submit, since MUI writes its
 * hidden input after the handler returns.
 */
export default function PeriodSwitch({
  basePath,
  period,
  carry,
}: {
  basePath: string;
  period: EventPeriod;
  /** The other query keys to keep, already resolved to their current values. */
  carry: Readonly<Record<string, string>>;
}) {
  const router = useRouter();

  const hrefFor = (value: EventPeriod) => {
    const params = new URLSearchParams();
    for (const [key, carried] of Object.entries(carry)) {
      if (carried !== "") params.set(key, carried);
    }
    params.set("period", value);
    return `${basePath}?${params.toString()}`;
  };

  return (
    <Box data-testid="period-switch">
      <Stack
        direction="row"
        spacing={1}
        sx={{ display: { xs: "none", sm: "flex" }, flexWrap: "wrap", gap: 1 }}
        component="nav"
        aria-label="Period"
      >
        {EVENT_PERIODS.map((value) => (
          <Button
            key={value}
            size="small"
            variant={value === period ? "contained" : "outlined"}
            href={hrefFor(value)}
            aria-current={value === period ? "page" : undefined}
            data-testid={`period-${value}`}
            sx={{ minHeight: 44 }}
          >
            {PERIOD_LABELS[value]}
          </Button>
        ))}
      </Stack>

      <TextField
        select
        size="small"
        label="Period"
        value={period}
        onChange={(event) => router.push(hrefFor(event.target.value as EventPeriod))}
        sx={{ display: { xs: "flex", sm: "none" }, minWidth: 200 }}
        data-testid="period-select"
      >
        {EVENT_PERIODS.map((value) => (
          <MenuItem key={value} value={value}>
            {PERIOD_LABELS[value]}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );
}
