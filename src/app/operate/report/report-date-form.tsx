"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { DateField } from "@/components/field";
import { CHANGE_DATE_LABEL, CHANGE_DATE_SUBMIT } from "./presentation";

// Choosing the reporting date — a plain GET form (shareable, refreshable).
export function ReportDateForm({ date }: { date: string }) {
  const [value, setValue] = useState(date);
  const [picked, setPicked] = useState<Date | null>(() => new Date(`${date}T00:00:00`));

  return (
    <Box
      component="form"
      method="get"
      action="/operate/report"
      data-testid="report-date-form"
      sx={{ maxWidth: 420 }}
    >
      {/* Tells the page this was a press, not a visit; stripped again immediately. */}
      <input type="hidden" name="show" value="1" />
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        sx={{ alignItems: { sm: "flex-start" }, flexWrap: "wrap" }}
      >
        <DateField
          name="date"
          label={CHANGE_DATE_LABEL}
          value={value}
          onChange={setValue}
          dateValue={picked}
          onDateChange={setPicked}
        />
        <Button
          type="submit"
          variant="outlined"
          sx={{
            minHeight: 44,
            // Never shrinks below its text — the overflow Brian hit.
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
