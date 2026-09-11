"use client";

import { useId, useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { CALLING_COUNTRIES, joinPhoneParts, splitPhoneNumber } from "@/lib/services/phone-parts";

/**
 * The one phone control (LAN-211): country code and number as two visible
 * controls, one hidden input posting the canonical E.164 value. See
 * `docs/architecture/components.md` and `docs/ux/design-system.md` § 5.
 *
 * Decision history: docs/ux/tickets/LAN-231-design-rollout.md
 */

export interface PhoneFieldProps {
  /** The form field name. The hidden input carries it; neither visible control does. */
  name: string;
  label: string;
  /** Whatever is on file — E.164 digits, or the raw value a human typed. */
  defaultValue?: string | null;
  required?: boolean;
  error?: boolean;
  helperText?: React.ReactNode;
  disabled?: boolean;
  /** Which `data-field` a form's focus-first-issue logic looks for. */
  field?: string;
  /** A `data-testid` on the number box, so `.querySelector("input")` still reaches the box a person types into. */
  testId?: string;
  /** The joined value on every keystroke, for forms that validate as you type. */
  onValueChange?: (joined: string) => void;
  /** Names the offending control when the caller knows which half is wrong. */
  errorPart?: "country" | "number" | null;
}

export function PhoneField({
  name,
  label,
  defaultValue,
  required,
  error,
  helperText,
  disabled,
  field,
  onValueChange,
  testId,
  errorPart,
}: PhoneFieldProps) {
  const initial = splitPhoneNumber(defaultValue);
  const [callingCode, setCallingCode] = useState(initial.callingCode);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);
  const numberFieldId = useId(); // stable id so MUI wires label/helper text correctly with two controls on a page

  const joined = joinPhoneParts(callingCode, nationalNumber);

  const update = (nextCode: string, nextNumber: string) => {
    setCallingCode(nextCode);
    setNationalNumber(nextNumber);
    onValueChange?.(joinPhoneParts(nextCode, nextNumber));
  };

  // Absent an explicit part, an error marks both controls.
  const countryInError = Boolean(error) && errorPart !== "number";
  const numberInError = Boolean(error) && errorPart !== "country";

  return (
    <div data-field={field ?? name}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <TextField
          select
          variant="outlined"
          label="Country"
          value={callingCode}
          onChange={(event) => update(event.target.value, nationalNumber)}
          disabled={disabled}
          error={countryInError}
          sx={{ flex: "0 0 auto", width: 116 }} // wide enough for `+971`; every pixel here is one the number box doesn't get at 375
          slotProps={{
            inputLabel: { shrink: true },
            select: {
              renderValue: (value) => `+${String(value)}`, // closed shows `+44`; keeps the row on one line at 375
              "aria-label": `Country code for ${label.toLowerCase()}`, // not prefixed with the field's label, so a screen reader tells the two halves apart
            },
          }}
        >
          {CALLING_COUNTRIES.map((country) => (
            <MenuItem key={country.iso} value={country.callingCode}>
              {country.name} +{country.callingCode}
            </MenuItem>
          ))}
        </TextField>
        {/* helperText hangs off this control, not the row: MUI wires it to this input's aria-describedby */}
        <TextField
          variant="outlined"
          fullWidth
          label={label}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={(event) => update(callingCode, event.target.value)}
          required={required}
          disabled={disabled}
          error={numberInError}
          helperText={helperText}
          id={numberFieldId}
          data-testid={testId}
          sx={{ flex: "1 1 auto", minWidth: 0 }}
        />
      </Stack>
      {/* The only thing the form actually posts. */}
      <input type="hidden" name={name} value={joined} />
    </div>
  );
}
