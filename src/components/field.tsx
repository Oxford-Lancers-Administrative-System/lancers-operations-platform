"use client";

import type { ReactNode } from "react";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormHelperText from "@mui/material/FormHelperText";
import FormLabel from "@mui/material/FormLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField, { type TextFieldProps } from "@mui/material/TextField";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { TimePicker } from "@mui/x-date-pickers/TimePicker";
import { enGB } from "date-fns/locale/en-GB";

/**
 * One field — LAN-225, brief §2. Replaces 136 `TextField` uses with mixed
 * size and width (audit A11, E9): one size, `fullWidth`, a helper slot that
 * names the format and nothing else (H7), and MUI's own date and time pickers
 * in place of every native `<input type="date">`, so a UK club never sees
 * `mm/dd/yyyy` again.
 *
 * `Field` is `TextField` with the kit's defaults; `SelectField` is the same with
 * `options`; `ChoiceField` is a labelled radio group; `DateField` and
 * `TimeField` are the pickers, each carrying a hidden input so a plain form
 * post still reads `YYYY-MM-DD` and `HH:mm`.
 */
export type FieldProps = Omit<TextFieldProps, "variant" | "size" | "fullWidth"> & {
  /** Which `data-field` the form's focus-first-issue logic looks for. */
  field?: string;
};

export function Field({ field, ...props }: FieldProps) {
  return <TextField variant="outlined" fullWidth data-field={field} {...props} />;
}

export function SelectField({
  options,
  field,
  ...props
}: FieldProps & { options: ReadonlyArray<{ value: string; label: string }> }) {
  return (
    <TextField
      select
      variant="outlined"
      fullWidth
      data-field={field}
      slotProps={{ inputLabel: { shrink: true } }}
      {...props}
    >
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

export function ChoiceField({
  label,
  name,
  value,
  onChange,
  options,
  helperText,
  error,
  field,
  row = false,
}: {
  label: string;
  name: string;
  value: string;
  onChange?: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  helperText?: ReactNode;
  error?: boolean;
  field?: string;
  row?: boolean;
}) {
  const id = `${name}-label`;
  return (
    <FormControl error={error} data-field={field ?? name}>
      <FormLabel id={id}>{label}</FormLabel>
      <RadioGroup
        aria-labelledby={id}
        name={name}
        value={value}
        row={row}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.value}
            value={option.value}
            control={<Radio />}
            label={option.label}
          />
        ))}
      </RadioGroup>
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}

/** `YYYY-MM-DD` → `Date` at local midnight, or `null`. */
function dateFromDay(day: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const value = new Date(y, m - 1, d);
  return Number.isNaN(value.getTime()) ? null : value;
}

function dayFromDate(value: Date | null): string {
  if (value === null || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function dateFromTime(time: string): Date | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return new Date(2000, 0, 1, h, m);
}

function timeFromDate(value: Date | null): string {
  if (value === null || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/**
 * The one tick box — LAN-225's player-surfaces addendum.
 *
 * The kit named every form control except this one, so the two surfaces that
 * need one built their own: `src/app/me/[token]/details/checkbox-field.tsx`
 * and `src/app/a/[token]/multi-select-checkboxes.tsx` (player-surfaces
 * finding P7). This is that control, once, in the kit.
 *
 * It has to live in this `"use client"` module rather than be composed in a
 * page: a bare MUI `Checkbox`/`FormControlLabel` pair rendered straight from
 * an `async` Server Component throws `TypeError: Cannot read properties of
 * undefined (reading 'disabled')` on this stack (Next 16, Turbopack, React 19,
 * MUI 9), because `FormControlLabel` clones the control element and the clone
 * does not survive the boundary. `checkbox-field.tsx` recorded the same
 * finding first; this is the shared home for it.
 *
 * Uncontrolled, and posts `"1"` through the page's own server action exactly
 * as a bare `<input type="checkbox">` would.
 */
export function CheckField({
  name,
  label,
  helperText,
  defaultChecked,
  field,
}: {
  name: string;
  label: ReactNode;
  helperText?: ReactNode;
  defaultChecked?: boolean;
  field?: string;
}) {
  return (
    <FormControl data-field={field ?? name}>
      <FormControlLabel
        control={<Checkbox name={name} value="1" defaultChecked={defaultChecked} />}
        label={label}
      />
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}

export const DATE_FORMAT_HINT = "Day, month, year — e.g. 24/08/2026.";
export const TIME_FORMAT_HINT = "12-hour clock, e.g. 08:00 PM.";

export function DateField({
  label,
  name,
  value,
  onChange,
  helperText = DATE_FORMAT_HINT,
  error,
  field,
}: {
  label: string;
  name: string;
  /** `YYYY-MM-DD` or empty. */
  value: string;
  onChange?: (day: string) => void;
  helperText?: ReactNode;
  error?: boolean;
  field?: string;
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
      <div data-field={field ?? name}>
        <DatePicker
          label={label}
          value={dateFromDay(value)}
          onChange={(next) => onChange?.(dayFromDate(next))}
          format="dd/MM/yyyy"
          slotProps={{ textField: { fullWidth: true, error, helperText } }}
        />
        <input type="hidden" name={name} value={value} />
      </div>
    </LocalizationProvider>
  );
}

export function TimeField({
  label,
  name,
  value,
  onChange,
  helperText = TIME_FORMAT_HINT,
  error,
  field,
}: {
  label: string;
  name: string;
  /** `HH:mm` or empty. */
  value: string;
  onChange?: (time: string) => void;
  helperText?: ReactNode;
  error?: boolean;
  field?: string;
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
      <div data-field={field ?? name}>
        <TimePicker
          label={label}
          value={dateFromTime(value)}
          onChange={(next) => onChange?.(timeFromDate(next))}
          ampm
          format="hh:mm a"
          minutesStep={5}
          timeSteps={{ minutes: 5 }}
          slotProps={{ textField: { fullWidth: true, error, helperText } }}
        />
        <input type="hidden" name={name} value={value} />
      </div>
    </LocalizationProvider>
  );
}
