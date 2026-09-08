"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { DateField } from "@/components/field";
import { CHANGE_DATE_LABEL, CHANGE_DATE_SUBMIT } from "@/app/operate/report/presentation";

/**
 * The report's date control on the kit's `DateField` — LAN-225 S6, delta E9:
 * the native `<input type="date">` that rendered `mm/dd/yyyy` is the MUI
 * picker Create event already uses. Same words, same `GET` form.
 */
export default function ReportDatePreview({ date }: { date: string }) {
  const [value, setValue] = useState(date);
  return (
    <Stack
      component="form"
      method="get"
      action="/design-preview/report"
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      sx={{ alignItems: { sm: "flex-start" }, maxWidth: 480 }}
      data-testid="report-date-preview"
    >
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <DateField
          label={CHANGE_DATE_LABEL}
          name="date"
          value={value}
          onChange={setValue}
          helperText="Day, month, year."
        />
      </Stack>
      <Button type="submit" variant="outlined" sx={{ flexShrink: 0, whiteSpace: "nowrap" }}>
        {CHANGE_DATE_SUBMIT}
      </Button>
    </Stack>
  );
}
