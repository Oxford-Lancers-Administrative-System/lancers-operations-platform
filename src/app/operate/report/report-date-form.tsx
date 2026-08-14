"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { PREVIEW_REPORT } from "./presentation";

/**
 * Choosing the reporting date — the one control both UX-80 and UX-83 open with.
 *
 * A plain `GET` form. Choosing a date changes what is *read* and nothing else,
 * so it belongs in the address bar: the resulting preview is shareable, a
 * refresh re-runs it harmlessly, and the browser's back button does what the
 * operator expects. Making it a server action would have made a read look like
 * a write on a screen whose entire subject is the difference between the two.
 *
 * `type="date"` rather than a picker component because the field's value is a
 * `YYYY-MM-DD` string either way, the platform control is the accessible one on
 * a phone, and the service refuses anything that is not that shape regardless
 * of what produced it.
 */
export function ReportDateForm({
  date,
  submitLabel = PREVIEW_REPORT,
  preview = true,
}: {
  date: string;
  /** The wireframes label this button differently on UX-80 and UX-83. */
  submitLabel?: string;
  /** Whether submitting lands on the preview or on the stored report. */
  preview?: boolean;
}) {
  // Held in state so that the operator sees what they picked while the
  // navigation is in flight, rather than the value snapping back.
  const [value, setValue] = useState(date);

  return (
    <Box
      component="form"
      method="get"
      action="/operate/report"
      data-testid="report-date-form"
      sx={{ maxWidth: 480 }}
    >
      {preview ? <input type="hidden" name="preview" value="1" /> : null}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "stretch" }}>
        <TextField
          type="date"
          name="date"
          label="Reporting date"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
          fullWidth
          size="small"
        />
        <Button type="submit" variant="outlined" sx={{ minHeight: 44, whiteSpace: "nowrap" }}>
          {submitLabel}
        </Button>
      </Stack>
    </Box>
  );
}
