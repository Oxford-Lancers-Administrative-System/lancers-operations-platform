"use client";

import { useId, useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import {
  CALLING_COUNTRIES,
  DEFAULT_CALLING_CODE,
  joinPhoneParts,
  splitPhoneNumber,
} from "@/lib/services/phone-parts";

/**
 * The one phone control — LAN-211, Brian 2026-09-01.
 *
 * > "It needs to be the country code as a dropdown list. I pick the country
 * > code, and then I do the mobile phone number. It ends up being two separate
 * > things… On the same line."
 *
 * One component, used by every phone input in the application. LAN-211 is
 * explicit that this is a standard rather than a one-off — "any ticket that
 * has to deal with validation of a number needs to have the country code as
 * one box and then separate it as a phone number" — so it lives in the kit
 * beside `Field`, not next to any one form.
 *
 * ## Why it posts a hidden input
 *
 * `DateField` in `./field.tsx` already established this shape and for the same
 * reason: two visible controls, one hidden input carrying the canonical value
 * under the field's own `name`. It matters more here than it does for a date.
 * Eleven server actions already read `formData.get("mobile")` — or `"phone"`,
 * or `"emergencyPhone"` — and hand the string to `validatePhoneNumber`. The
 * hidden input means every one of them keeps working unchanged, still
 * receiving one string, still normalising it with the one normaliser, and none
 * of them has to learn that a control was split in two. What is stored is
 * still E.164 from `toE164`, exactly as LAN-211 requires.
 *
 * The joined value carries an explicit `+` and calling code (see
 * `joinPhoneParts`), which is the one form `toE164` never has to make a
 * judgement about. That is what makes the country explicit rather than
 * inferred, which is the whole point of the change: a fresher at a stand no
 * longer carries the burden of writing the country code correctly, and a
 * malformed number is caught at the source instead of failing silently at the
 * Meta send.
 *
 * ## Round-tripping what is already on file
 *
 * `defaultValue` is whatever the club has recorded — E.164 digits from
 * `normalised_value`, or the messy `raw_value` a human typed. `splitPhoneNumber`
 * puts it back into the two boxes without repairing it, and a value it cannot
 * split shows whole in the number box rather than being silently reinterpreted.
 * `phone-parts.test.ts` proves the round trip.
 *
 * ## At 375
 *
 * The two controls stay on one line at every width. The dropdown is sized to
 * its widest calling code rather than its widest country name — closed it
 * shows `+44`, and only the open menu spells out "United Kingdom". That is
 * what keeps a two-control row from wrapping on a phone, which LAN-211 asks
 * for at a measured 375.
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
  /**
   * A `data-testid` on the **number** box — the direct replacement for one on
   * the single text field this control supersedes. It goes there rather than
   * on the row so that a caller's `.querySelector("input")` still reaches the
   * box a person types into, and not the country select's own hidden input,
   * which comes first in the DOM.
   */
  testId?: string;
  /**
   * The joined value, on every keystroke — for the forms that validate as you
   * type and enable their own button. They get exactly the string the hidden
   * input will post, so their check and the server's check agree.
   */
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
  // A stable id for the number box, so MUI can wire its own label and helper
  // text to it even when two of these controls sit on one page.
  const numberFieldId = useId();

  const joined = joinPhoneParts(callingCode, nationalNumber);

  const update = (nextCode: string, nextNumber: string) => {
    setCallingCode(nextCode);
    setNationalNumber(nextNumber);
    onValueChange?.(joinPhoneParts(nextCode, nextNumber));
  };

  // Absent an explicit part, an error marks both controls, because the caller
  // has told us something is wrong and has not said which half.
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
          // Wide enough for `+971` and the select's own arrow, and no wider:
          // every pixel here is a pixel the number box does not get at 375.
          sx={{ flex: "0 0 auto", width: 116 }}
          slotProps={{
            inputLabel: { shrink: true },
            select: {
              // Closed, the control says `+44`; the menu spells the country
              // out. That is what keeps the row on one line at 375.
              renderValue: (value) => `+${String(value)}`,
              // Deliberately *not* prefixed with the field's own label. A
              // screen reader needs the two halves told apart, and so does
              // every existing test that looks a phone field up by a label
              // beginning "Mobile phone" or "Phone" — an accessible name
              // starting with the same words would make each of those
              // ambiguous rather than merely different.
              "aria-label": `Country code for ${label.toLowerCase()}`,
            },
          }}
        >
          {CALLING_COUNTRIES.map((country) => (
            <MenuItem key={country.iso} value={country.callingCode}>
              {country.name} +{country.callingCode}
            </MenuItem>
          ))}
        </TextField>
        {/*
          The helper text — and therefore every inline refusal — hangs off this
          control rather than off the row, because MUI wires `helperText` to
          the input's own `aria-describedby`. A sentence rendered beside the
          pair instead would be read by nobody using a screen reader, and the
          message always names which half is wrong anyway (`validatePhoneParts`).
        */}
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
      {/*
        The only thing the form actually posts. Everything above is how a
        person types it; this is what `validatePhoneNumber` receives, under the
        name the server action has always read.
      */}
      <input type="hidden" name={name} value={joined} />
    </div>
  );
}

/** What the number box means, for the forms that want to say it. */
export const PHONE_FIELD_HINT = "Pick the country, then the number without its country code.";

export { DEFAULT_CALLING_CODE };
