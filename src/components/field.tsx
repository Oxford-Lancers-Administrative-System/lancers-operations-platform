"use client";

import type { KeyboardEvent, ReactNode, Ref } from "react";
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
 * One field — LAN-225, brief §2. One size, `fullWidth`, MUI's date/time
 * pickers in place of native `<input type="date">` so a UK club never sees
 * `mm/dd/yyyy`. `DateField`/`TimeField` carry a hidden input so a plain form
 * post still reads `YYYY-MM-DD`/`HH:mm`.
 */
export type FieldProps = Omit<TextFieldProps, "variant" | "size" | "fullWidth"> & {
  /** Which `data-field` the form's focus-first-issue logic looks for. */
  field?: string;
};

/**
 * What `autoComplete` says on a field an operator fills in about something —
 * or somebody — that is not themselves: an event's name, a player's surname,
 * a venue. LAN-324: Chrome put the operator's own name into "Event name".
 *
 * `"off"` is not the answer. Chrome deliberately ignores `autocomplete="off"`
 * on a field its heuristics read as a person's name or an address, which is
 * exactly the field this is for. An *unrecognised* token is honoured instead:
 * Chrome finds an attribute it cannot map and leaves the field alone rather
 * than guessing from the saved profile. The value is never shown or posted,
 * so what it reads as matters only to whoever next opens the file.
 */
export const NO_AUTOFILL = "off-not-about-me";

/**
 * Enter in a field must not submit the form around it — LAN-313. An authoring
 * form is long and its submit both saves and navigates away, so the browser's
 * implicit submission turns "I have finished typing this line" into "save and
 * leave", mid-task. Hung on the `<form>` rather than on each field, so a field
 * added later is covered without being remembered.
 *
 * Three keystrokes are left alone, because Enter genuinely means something
 * there: a newline in a multi-line field, the click of a focused button, and
 * a modified Enter. A control that handles Enter itself (a select opening, an
 * autocomplete taking the highlighted option) has already acted by the time
 * this runs on the bubble.
 */
export function preventImplicitSubmit(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== "Enter") return;
  if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target instanceof HTMLTextAreaElement) return;
  if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
  if (target.getAttribute("role") === "button") return;

  event.preventDefault();
}

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
 * The one tick box — LAN-225's player-surfaces addendum (player-surfaces
 * finding P7). Lives in this `"use client"` module, not composed in a page:
 * a bare `Checkbox`/`FormControlLabel` pair rendered from an `async` Server
 * Component throws on this stack (Next 16, Turbopack, React 19, MUI 9) —
 * `FormControlLabel`'s clone doesn't survive the boundary. Uncontrolled,
 * posts `"1"` like a bare `<input type="checkbox">`.
 */
export function CheckField({
  name,
  label,
  helperText,
  defaultChecked,
  field,
  checked,
  onChange,
  disabled,
  inputLabel,
}: {
  name: string;
  label: ReactNode;
  helperText?: ReactNode;
  defaultChecked?: boolean;
  field?: string;
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  inputLabel?: string;
}) {
  return (
    <FormControl data-field={field ?? name}>
      <FormControlLabel
        control={
          <Checkbox
            name={name}
            value="1"
            defaultChecked={defaultChecked}
            checked={checked}
            onChange={(_, next) => onChange?.(next)}
            disabled={disabled}
            slotProps={{ input: inputLabel ? { "aria-label": inputLabel } : undefined }}
          />
        }
        label={label}
      />
      {helperText ? <FormHelperText>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}

const DATE_FORMAT_HINT = "Day, month, year — e.g. 24/08/2026.";
const TIME_FORMAT_HINT = "24-hour clock, e.g. 20:00.";

export function DateField({
  label,
  name,
  value,
  onChange,
  helperText = DATE_FORMAT_HINT,
  error,
  field,
  dateValue,
  onDateChange,
  inputRef,
  required,
  minDate,
  maxDate,
  disabled,
}: {
  label: string;
  name: string;
  /** `YYYY-MM-DD` or empty. */
  value: string;
  onChange?: (day: string) => void;
  helperText?: ReactNode;
  error?: boolean;
  field?: string;
  /** Keep a partially typed picker date intact when the owning form controls it. */
  dateValue?: Date | null;
  onDateChange?: (date: Date | null) => void;
  inputRef?: Ref<HTMLInputElement>;
  required?: boolean;
  minDate?: Date;
  maxDate?: Date;
  disabled?: boolean;
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
      <div data-field={field ?? name}>
        <DatePicker
          label={label}
          minDate={minDate}
          maxDate={maxDate}
          disabled={disabled}
          inputRef={inputRef}
          value={dateValue === undefined ? dateFromDay(value) : dateValue}
          onChange={(next) => {
            onDateChange?.(next);
            onChange?.(dayFromDate(next));
          }}
          format="dd/MM/yyyy"
          slotProps={{ textField: { fullWidth: true, error, helperText, required } }}
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
  dateValue,
  onDateChange,
  disabled,
}: {
  label: string;
  name: string;
  /** `HH:mm` or empty. */
  value: string;
  onChange?: (time: string) => void;
  helperText?: ReactNode;
  error?: boolean;
  field?: string;
  dateValue?: Date | null;
  onDateChange?: (date: Date | null) => void;
  disabled?: boolean;
}) {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={enGB}>
      <div data-field={field ?? name}>
        <TimePicker
          label={label}
          value={dateValue === undefined ? dateFromTime(value) : dateValue}
          disabled={disabled}
          onChange={(next) => {
            onDateChange?.(next);
            onChange?.(timeFromDate(next));
          }}
          // LAN-326, Brian 2026-09-11, reversing Q-27: the one clock face the
          // app draws is the 24-hour one it already displays times in. Still
          // written out rather than left to the machine's own locale, which is
          // what C1/C2 won and neither reversal gives back.
          ampm={false}
          format="HH:mm"
          minutesStep={5}
          timeSteps={{ minutes: 5 }}
          slotProps={{ textField: { fullWidth: true, error, helperText } }}
        />
        <input type="hidden" name={name} value={value} />
      </div>
    </LocalizationProvider>
  );
}
