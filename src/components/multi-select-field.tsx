"use client";

import { useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import { Field } from "./field";

/**
 * The outlined `TextField select` multi-choice `interest-questionnaire.tsx`
 * uses. F-206-02's bare checkbox list (round 1) was a regression V-5 named —
 * Brian: "The dropdown should have a multi-tick." A dedicated client
 * component so `interest-questionnaire.tsx` stays a Server Component. MUI's
 * `Select` posts a bare-comma-joined hidden input; `splitMultiAnswer` already
 * reads that.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */
export function MultiSelectField({
  name,
  label,
  options,
  selected,
}: {
  name: string;
  label: string;
  options: readonly string[];
  selected: ReadonlySet<string>;
}) {
  const [value, setValue] = useState<string[]>(() =>
    options.filter((option) => selected.has(option)),
  );
  return (
    <Field
      select
      name={name}
      label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(typeof next === "string" ? next.split(",") : next);
      }}
      slotProps={{
        select: {
          multiple: true,
          renderValue: (selectedValues) => (selectedValues as string[]).join(", "),
        },
      }}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={value.includes(option)} />
          <ListItemText primary={option} />
        </MenuItem>
      ))}
    </Field>
  );
}

/** The grouped form — Offence / Defence / Special teams, `ListSubheader` per group, the mockup's own shape. */
export function GroupedMultiSelectField({
  name,
  label,
  groups,
  selected,
}: {
  name: string;
  label: string;
  groups: readonly { readonly label: string; readonly options: readonly string[] }[];
  selected: ReadonlySet<string>;
}) {
  const allOptions = groups.flatMap((group) => group.options);
  const [value, setValue] = useState<string[]>(() =>
    allOptions.filter((option) => selected.has(option)),
  );
  return (
    <Field
      select
      name={name}
      label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(typeof next === "string" ? next.split(",") : next);
      }}
      slotProps={{
        select: {
          multiple: true,
          renderValue: (selectedValues) => (selectedValues as string[]).join(", "),
          MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } },
        },
      }}
    >
      {groups.flatMap((group) => [
        <ListSubheader key={group.label} sx={{ fontWeight: 700 }}>
          {group.label}
        </ListSubheader>,
        ...group.options.map((option) => (
          <MenuItem key={option} value={option}>
            <Checkbox size="small" sx={{ p: 0, mr: 1 }} checked={value.includes(option)} />
            <ListItemText primary={option} />
          </MenuItem>
        )),
      ])}
    </Field>
  );
}
