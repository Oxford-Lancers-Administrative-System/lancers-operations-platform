"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { CHANGE_DATE_LABEL, CHANGE_DATE_SUBMIT } from "./presentation";

/**
 * Choosing the reporting date.
 *
 * A plain `GET` form. Choosing a date changes which report is read, so it
 * belongs in the address bar: the result is shareable, a refresh re-runs it
 * harmlessly, and the back button does what the operator expects.
 *
 * Two things the first version got wrong, both of which Brian met on the first
 * screen he opened. The field carried a visible "Choose another date" label
 * *and* a button reading the same words, which is one instruction printed
 * twice; and the button sat in a fixed-height row that its own text overflowed.
 * The label is now the field's own floating label, the button says what
 * pressing it does rather than restating the heading, and the row wraps instead
 * of clipping.
 */
export function ReportDateForm({ date }: { date: string }) {
  // Held in state so the operator sees what they picked while the navigation is
  // in flight, rather than the value snapping back.
  const [value, setValue] = useState(date);

  return (
    <Box
      component="form"
      method="get"
      action="/operate/report"
      data-testid="report-date-form"
      sx={{ maxWidth: 420 }}
    >
      {/*
        What tells the page this was a press rather than a visit. Sorting and
        refreshing navigate to the same route without it, and show what is
        already on file; this files a new snapshot. The page strips it again
        immediately, so a refresh afterwards does not file a second one.
      */}
      <input type="hidden" name="show" value="1" />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "flex-start" }, flexWrap: "wrap" }}
      >
        <TextField
          type="date"
          name="date"
          label={CHANGE_DATE_LABEL}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          size="small"
          sx={{ flex: 1, minWidth: 180 }}
        />
        <Button
          type="submit"
          variant="outlined"
          sx={{
            minHeight: 44,
            // The overflow Brian hit: a fixed-height outlined button whose
            // label was longer than the box the row gave it. It gets its own
            // width now, and never shrinks below its text.
            flexShrink: 0,
            whiteSpace: "nowrap",
            px: 2.5,
          }}
        >
          {CHANGE_DATE_SUBMIT}
        </Button>
      </Stack>
    </Box>
  );
}
