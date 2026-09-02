"use client";

import { useState } from "react";
import Checkbox from "@mui/material/Checkbox";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

/**
 * The outlined `TextField select` multi-choice `interest-questionnaire.tsx`
 * uses for "Which positions interest you?" and "What playing gear do you
 * already have?" — F-206-02 first shipped these as a bare inline checkbox
 * list (correction round 1), which V-5 (correction round 2) named a
 * regression: "The dropdown should have a multi-tick. It shouldn't just be
 * up and about." (Brian). This is what
 * `git show origin/chore/recruitment-fidelity-mockup:src/app/recruitment-preview/questionnaire-b.tsx`
 * actually builds — a `TextField select` with `slotProps.select.multiple`,
 * a `renderValue` joining the selection, and a `Checkbox` inside each
 * `MenuItem` — the same outlined idiom the two yes/no questions and "How
 * did you hear" already use on this form, not a control of its own.
 *
 * A dedicated client component for the same reason correction round 1's
 * version was one: `interest-questionnaire.tsx` stays a Server Component,
 * and MUI's `Select` needs a client boundary. Controlled (`useState`,
 * seeded from `selected`) rather than uncontrolled — a `Select` has no
 * native `defaultValue`-and-checkbox-per-option shape to collect via
 * `formData.getAll` the way correction round 1's plain checkboxes did.
 * MUI's own `Select` still posts through the plain server-action `<form>`
 * this page uses without any client-side submit handling: given a `name`,
 * it renders its own hidden `<input>` whose value is the array joined with
 * a bare comma (`SelectInput.js`'s own `value.join(',')`), so the server
 * action reads one field, not several — `splitMultiAnswer`
 * (`recruitment-vocabulary.ts`) already splits and trims on `,`, which
 * reads a bare-comma join exactly as it reads this record's own stored
 * `", "`-joined answer.
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
  const [value, setValue] = useState<string[]>(() => options.filter((option) => selected.has(option)));
  return (
    <TextField
      select
      name={name}
      label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(typeof next === "string" ? next.split(",") : next);
      }}
      fullWidth
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
    </TextField>
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
    <TextField
      select
      name={name}
      label={label}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        setValue(typeof next === "string" ? next.split(",") : next);
      }}
      fullWidth
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
    </TextField>
  );
}
