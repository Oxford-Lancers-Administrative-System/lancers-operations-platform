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
 *
 * ## Two shapes, because Brian asked for the second one
 *
 * At desktop width the five periods are a row of buttons, which is the approved
 * mockup and the fastest thing to scan. At 375px they collapse to **one**
 * control — Brian, 21 August 2026, on seeing the buttons wrap into three rows on
 * a phone: they were "just too much at the very top. I should see the events
 * pretty quickly after that."
 *
 * That is a reflow and not a filter: the same five choices are in the select,
 * and `slice-ux.md` § 7 forbids reordering that removes a material alternate
 * state rather than one that changes how it is offered.
 *
 * ## The period is in the query string
 *
 * So a period is a link somebody can send, the back button does what it looks
 * like it does, and a refresh lands where it was. The buttons are plain links
 * and need no JavaScript; the select navigates from the change event directly,
 * for the reason the events filters record — MUI writes a select's hidden input
 * after the handler returns, so a handler that submitted a form would post the
 * previous value.
 *
 * Every other filter travels with it, so choosing a period narrows what is
 * already on screen rather than clearing it.
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
