"use client";

import { useId } from "react";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";

/**
 * A labelled filter select, pinned in a board's own filter row — the roster
 * and recruitment boards' shared shape (LAN-300, WP2-A). `labelId` (LAN-259)
 * is load-bearing for `aria-labelledby`; `testId` and each call site's own
 * `minWidth` are the two props recruitment's copy carried that roster's
 * didn't. Decision history: docs/ux/tickets/LAN-186-roster-board.md.
 */
export function PinnedSelect({
  label,
  value,
  options,
  optionLabel,
  onChange,
  minWidth,
  testId,
}: {
  label: string;
  value: string;
  options: readonly string[];
  optionLabel?: (value: string) => string;
  onChange: (value: string) => void;
  minWidth?: number;
  testId?: string;
}) {
  const labelId = useId();
  return (
    <FormControl size="small" sx={{ minWidth: minWidth ?? 190 }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        labelId={labelId}
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={testId}
      >
        <MenuItem value="">
          <em>All</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option} value={option}>
            {optionLabel ? optionLabel(option) : option}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
