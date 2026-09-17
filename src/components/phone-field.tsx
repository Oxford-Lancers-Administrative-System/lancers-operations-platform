"use client";

import { useEffect, useId, useRef, useState } from "react";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";

import { NO_AUTOFILL } from "@/components/field";
import { CALLING_COUNTRIES, joinPhoneParts, splitPhoneNumber } from "@/lib/services/phone-parts";

/**
 * The one phone control (LAN-211): country code and number as two visible
 * controls, one hidden input posting the canonical E.164 value. See
 * `docs/architecture/components.md` and `docs/ux/design-system.md` § 5.
 *
 * LAN-389 (Brian, 2026-09-17) adds a third: a confirm box under the number.
 * Ian's mobile was mistyped at sign-up and nobody found out until the messages
 * he never received were missed. The second value is not a fact about anybody
 * — it is never named in the form data, never reaches an action and is never
 * stored. It exists to stop a submission whose two entries disagree.
 */

/** The state on the confirm box when the two entries disagree. */
export const PHONE_CONFIRM_MISMATCH_MESSAGE = "Does not match the number above.";

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
  /**
   * LAN-389 — for the one caller that is not an HTML form. `/join/[code]`
   * saves from a button's `onClick`, so there is no submit event to refuse;
   * it gates its own Save on this instead.
   */
  onMismatchChange?: (mismatched: boolean) => void;
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
  onMismatchChange,
}: PhoneFieldProps) {
  const initial = splitPhoneNumber(defaultValue);
  const [callingCode, setCallingCode] = useState(initial.callingCode);
  const [nationalNumber, setNationalNumber] = useState(initial.nationalNumber);
  const [confirmNumber, setConfirmNumber] = useState("");
  // The mismatch is a state, not a running commentary — see `confirmInError`.
  const [confirmChallenged, setConfirmChallenged] = useState(false);
  const numberFieldId = useId(); // stable id so MUI wires label/helper text correctly with two controls on a page
  const rootRef = useRef<HTMLDivElement>(null);
  const confirmInputRef = useRef<HTMLInputElement>(null);

  const joined = joinPhoneParts(callingCode, nationalNumber);

  // What is already on file, in the same canonical shape the hidden input
  // posts. An edit form that leaves the number alone matches it, and asks
  // nobody to retype a number they did not touch.
  const onFile = joinPhoneParts(initial.callingCode, initial.nationalNumber);

  // Both entries go through `joinPhoneParts` against the same country code,
  // so this asks the only question worth asking — would the two of them store
  // the same number? — rather than whether the same spaces were typed.
  const confirmedValue = joinPhoneParts(callingCode, confirmNumber);

  // Nothing typed and nothing changed need no confirmation: an empty optional
  // number (the operator invite), a cleared number, and an untouched number on
  // file all submit as they always did.
  const needsConfirmation = !disabled && joined !== "" && joined !== onFile;
  const mismatched = needsConfirmation && confirmedValue !== joined;

  const update = (nextCode: string, nextNumber: string) => {
    setCallingCode(nextCode);
    setNationalNumber(nextNumber);
    onValueChange?.(joinPhoneParts(nextCode, nextNumber));
  };

  // The refusal. It lives on the control rather than in ten forms and ten
  // actions because the second value must never become data: an action that
  // could read it would be one release away from storing it.
  //
  // Registered on the form itself, so it runs while the event is still at its
  // target — before React's root-level listener reaches the form action, and
  // before the browser's own navigation.
  useEffect(() => {
    const form = rootRef.current?.closest("form");
    if (!form) return;

    const refuse = (event: Event) => {
      if (!mismatched) return;
      event.preventDefault();
      event.stopPropagation();
      setConfirmChallenged(true);
      confirmInputRef.current?.focus();
    };

    form.addEventListener("submit", refuse);
    return () => form.removeEventListener("submit", refuse);
  }, [mismatched]);

  // Belt and braces for a real browser, where an invalid control blocks the
  // submission before any listener runs at all.
  useEffect(() => {
    confirmInputRef.current?.setCustomValidity(mismatched ? PHONE_CONFIRM_MISMATCH_MESSAGE : "");
  }, [mismatched]);

  useEffect(() => {
    onMismatchChange?.(mismatched);
  }, [mismatched, onMismatchChange]);

  // Absent an explicit part, an error marks both controls.
  const countryInError = Boolean(error) && errorPart !== "number";
  const numberInError = Boolean(error) && errorPart !== "country";
  // Red once there is something to judge: the confirm box has been left, a
  // submission has been turned back, or it now holds at least as many digits
  // as the number above and they still differ. Never on the second keystroke
  // of a number half typed — and never silent on `/join/[code]`, where a
  // disabled Save button never takes the focus that a blur would need.
  const enoughToJudge =
    confirmNumber.replace(/\D/g, "") !== "" &&
    confirmNumber.replace(/\D/g, "").length >= nationalNumber.replace(/\D/g, "").length;
  const confirmInError = mismatched && (confirmChallenged || enoughToJudge);

  const confirmLabel = `Confirm ${label.toLowerCase()}`;

  return (
    <div data-field={field ?? name} ref={rootRef}>
      <Stack spacing={1}>
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
            // LAN-390 (Clint relaying Ian, 2026-09-17: "it pulls up a regular
            // keyboard"). `inputMode="tel"` was written here as a bare prop,
            // where MUI hands it to the root FormControl and it never reaches
            // the `input` element at all — the box a person types into declared
            // nothing, and the handset was left to guess from `type` alone.
            // `htmlInput` is the slot that lands on the element.
            slotProps={{ htmlInput: { inputMode: "tel" } }}
            // LAN-332. Was `tel-national`, and Chrome duly offered the operator
            // their own mobile on the invite form — the same autofill that put
            // the operator's name into "Event name" (LAN-324). Most numbers this
            // control takes are about somebody else: a recruit being added, a
            // walk-up, an emergency contact, an invited operator. The two
            // self-entry doors (`/join/[code]`, `/onboarding/[token]`) lose a
            // convenience; every other caller stops recording the wrong person's
            // number, which is the trade the kit takes.
            autoComplete={NO_AUTOFILL}
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

        {/* LAN-389: directly beneath, same two-column shape so the boxes line
            up. The country is shown, not chosen again — it follows the row
            above, and only the national number is retyped. */}
        {disabled ? null : (
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <TextField
              select
              variant="outlined"
              label="Country"
              value={callingCode}
              disabled
              sx={{ flex: "0 0 auto", width: 116 }}
              slotProps={{
                inputLabel: { shrink: true },
                select: {
                  renderValue: (value) => `+${String(value)}`,
                  "aria-label": `Country code for ${confirmLabel.toLowerCase()}`,
                },
              }}
            >
              {CALLING_COUNTRIES.map((country) => (
                <MenuItem key={country.iso} value={country.callingCode}>
                  {country.name} +{country.callingCode}
                </MenuItem>
              ))}
            </TextField>
            {/* Deliberately nameless: an unnamed control is not in the form
                data at all, so there is nothing for an action to read. */}
            <TextField
              variant="outlined"
              fullWidth
              label={confirmLabel}
              type="tel"
              slotProps={{ htmlInput: { inputMode: "tel" } }}
              autoComplete={NO_AUTOFILL}
              value={confirmNumber}
              onChange={(event) => setConfirmNumber(event.target.value)}
              onBlur={() => setConfirmChallenged(true)}
              inputRef={confirmInputRef}
              required={needsConfirmation}
              error={confirmInError}
              helperText={confirmInError ? PHONE_CONFIRM_MISMATCH_MESSAGE : undefined}
              data-testid={testId ? `${testId}-confirm` : undefined}
              sx={{ flex: "1 1 auto", minWidth: 0 }}
            />
          </Stack>
        )}
      </Stack>
      {/* The only thing the form actually posts. */}
      <input type="hidden" name={name} value={joined} />
    </div>
  );
}
