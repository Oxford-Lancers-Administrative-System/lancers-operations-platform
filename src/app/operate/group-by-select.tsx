"use client";

import MenuItem from "@mui/material/MenuItem";
import type { SxProps, Theme } from "@mui/material/styles";
import { Field } from "@/components/field";
import {
  ATTENDANCE_GROUP_FAMILY_LABELS,
  type AttendanceGroupFamily,
} from "@/lib/services/attendance-group-by";
import { GROUP_BY_LABEL, GROUP_BY_NONE } from "./events/[id]/attendance/presentation";

/**
 * LAN-497: the one Group by select — the attendance register's and the event
 * page's Everyone asked table's. Options are None and the families the viewer
 * may see; with no family there is no select at all.
 */
export function GroupBySelect({
  families,
  value,
  onChange,
  sx,
}: {
  families: readonly AttendanceGroupFamily[];
  value: AttendanceGroupFamily | null;
  onChange: (value: string) => void;
  sx?: SxProps<Theme>;
}) {
  if (families.length === 0) return null;
  return (
    <Field
      select
      label={GROUP_BY_LABEL}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      sx={sx}
      data-testid="attendance-group-by"
    >
      <MenuItem value="">{GROUP_BY_NONE}</MenuItem>
      {families.map((family) => (
        <MenuItem key={family} value={family}>
          {ATTENDANCE_GROUP_FAMILY_LABELS[family]}
        </MenuItem>
      ))}
    </Field>
  );
}
