"use client";

import Autocomplete from "@mui/material/Autocomplete";
import { Field, NO_AUTOFILL } from "@/components/field";

export interface ListOption {
  readonly value: string;
  readonly label: string;
  readonly group?: string;
}

/** What a value on file that is not in the list is called, beside the field. */
function notInListNote(value: string): string {
  return `On file: ${value}. Not in the list.`;
}

/**
 * One choice from a fixed list, with type-to-search — LAN-512's college and
 * degree. MUI Autocomplete without free text: typing filters, and only a
 * listed option can be chosen. The choice posts under `name` through a hidden
 * input, as the app's other controls do.
 *
 * A value on file that is not in the list (a legacy free-text entry) is
 * shown beside the empty field and posted unchanged, so nothing is lost by
 * opening the form, and the save asks for a choice from the list.
 */
export function ListField({
  name,
  label,
  options,
  value,
  onChange,
  required,
  disabled,
  error,
  helperText,
  testId,
}: {
  name: string;
  label: string;
  options: readonly ListOption[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  testId?: string;
}) {
  const chosen = options.find((option) => option.value === value) ?? null;
  const legacy = value.trim() !== "" && chosen === null;
  const grouped = options.some((option) => option.group);
  const note = error ?? (legacy ? notInListNote(value) : helperText);

  return (
    <div data-field={name} data-testid={testId}>
      <Autocomplete<ListOption, false, false, false>
        options={options as ListOption[]}
        value={chosen}
        onChange={(_event, next) => onChange(next?.value ?? "")}
        groupBy={grouped ? (option) => option.group ?? "" : undefined}
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, other) => option.value === other.value}
        disabled={disabled}
        autoHighlight
        renderInput={(params) => (
          <Field
            {...params}
            label={label}
            required={required}
            autoComplete={NO_AUTOFILL}
            error={Boolean(error) || legacy}
            helperText={note}
          />
        )}
      />
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
