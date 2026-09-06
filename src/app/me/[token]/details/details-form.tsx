"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/notice";
import { Field, CheckField, DateField } from "@/components/field";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";

import { saveDetails } from "./actions";
import {
  firstInvalidDetailsField,
  type DetailsFormState,
  type DetailsFormValues,
} from "./validation";
import {
  CONSENT_ALREADY_GRANTED,
  CONSENT_HEADING,
  CONSENT_LABEL,
  DISPUTED_NOTICE,
  FIELD_COLLEGE,
  FIELD_DATE_OF_BIRTH,
  FIELD_DEGREE_FIELD,
  FIELD_EC_EMAIL,
  FIELD_EC_FAMILY_NAME,
  FIELD_EC_GIVEN_NAME,
  FIELD_EC_PHONE,
  FIELD_EC_RELATIONSHIP,
  FIELD_EXPECTED_GRADUATION,
  FIELD_FAMILY_NAME,
  FIELD_GIVEN_NAME,
  FIELD_MATRICULATION_YEAR,
  FIELD_MOBILE,
  FIELD_PERSONAL_EMAIL,
  REQUIRED_NOTE,
  SAVE_AND_CONTINUE,
  SAVE_CHANGES,
  SECTION_EMERGENCY_CONTACT,
  SECTION_KEPT_PRIVATE,
  SECTION_WHERE_YOU_STUDY,
  SECTION_WHO_YOU_ARE,
} from "./presentation";

/**
 * The step 1 form, client-side — LAN-216 correction round 2, B-009.
 *
 * ## Why this is a client component and the rest of the route is not
 *
 * `useActionState` is the only way to get `saveDetails`'s returned
 * values-and-errors state back onto the screen without a navigation — the
 * same reason `src/app/operate/roster/new/returner-intake-form.tsx` is a
 * client component wrapping a "use server" action while its own `page.tsx`
 * stays a plain Server Component. Everything that does not need that state —
 * the checklist strip, the heading, the privacy note — stays server-rendered
 * in `page.tsx`; only the form itself, which has to redraw with per-field
 * errors and the player's own typed values after a failed submit, needs to be
 * a client boundary.
 *
 * ## `noValidate`
 *
 * The form used to rely on the DOM `required` attribute (still present, on
 * every `TextField` below, purely for the label asterisk and `aria-required`)
 * to stop a blank submission — which meant Chrome's own bubble intercepted
 * the submit before this app ever saw it, in the browser's own wording,
 * pointed at whatever the browser's tab order reached first. `noValidate` on
 * the `<form>` disables that constraint-validation pass entirely: every
 * submission now reaches `saveDetails`, whatever was or was not typed, and
 * this app decides what "you missed one" looks like.
 */

interface FieldMeta {
  source: string | null;
  disputed: boolean;
}

export interface DetailsFormProps {
  token: string;
  needsConsentStep: boolean;
  isReturning: boolean;
  initialValues: DetailsFormValues;
  meta: Record<
    | "given_name"
    | "family_name"
    | "college"
    | "matriculation_year"
    | "expected_graduation_year"
    | "degree_field"
    | "date_of_birth",
    FieldMeta
  >;
}

const INITIAL_STATE_ERRORS: DetailsFormState["errors"] = {};

export function DetailsForm({
  token,
  needsConsentStep,
  isReturning,
  initialValues,
  meta,
}: DetailsFormProps) {
  const [state, formAction, pending] = useActionState<DetailsFormState, FormData>(saveDetails, {
    values: initialValues,
    errors: INITIAL_STATE_ERRORS,
  });
  const { values, errors } = state;
  const [birthDay, setBirthDay] = useState(initialValues.date_of_birth);
  const [birthDate, setBirthDate] = useState<Date | null>(() =>
    initialValues.date_of_birth ? new Date(`${initialValues.date_of_birth}T00:00:00`) : null,
  );
  const firstInvalid = firstInvalidDetailsField(errors);
  const focusTarget = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    focusTarget.current?.focus();
  }, [firstInvalid]);

  const field = (
    name: keyof DetailsFormValues,
    label: string,
    extra: { type?: string; fieldMeta?: FieldMeta } = {},
  ) => (
    <Box>
      {extra.type === "date" ? (
        <DateField
          name={name}
          label={label}
          value={birthDay}
          dateValue={birthDate}
          onChange={setBirthDay}
          onDateChange={setBirthDate}
          required
          error={Boolean(errors[name])}
          helperText={errors[name] || undefined}
          inputRef={firstInvalid === name ? focusTarget : undefined}
        />
      ) : (
        <Field
          name={name}
          label={label}
          defaultValue={values[name]}
          required
          error={Boolean(errors[name])}
          helperText={errors[name]}
          inputRef={firstInvalid === name ? focusTarget : undefined}
          type={extra.type ?? "text"}
        />
      )}
      {extra.fieldMeta?.source ? <FormHelperText>{extra.fieldMeta.source}</FormHelperText> : null}
      {extra.fieldMeta?.disputed ? <Notice severity="info">{DISPUTED_NOTICE}</Notice> : null}
    </Box>
  );

  return (
    <Box component="form" action={formAction} noValidate>
      <input type="hidden" name="token" value={token} />
      <Stack spacing={2.5}>
        {needsConsentStep ? (
          <Section title={CONSENT_HEADING}>
            <CheckField name="consent" label={CONSENT_LABEL} />
          </Section>
        ) : (
          <Notice severity="success">{CONSENT_ALREADY_GRANTED}</Notice>
        )}

        <FormHelperText sx={{ fontSize: 13 }}>{REQUIRED_NOTE}</FormHelperText>

        <Section title={SECTION_WHO_YOU_ARE}>
          <Stack spacing={2}>
            {field("given_name", FIELD_GIVEN_NAME, { fieldMeta: meta.given_name })}
            {field("family_name", FIELD_FAMILY_NAME, { fieldMeta: meta.family_name })}
            {field("mobile", FIELD_MOBILE)}
            {field("personal_email", FIELD_PERSONAL_EMAIL, { type: "email" })}
          </Stack>
        </Section>
        <Section title={SECTION_WHERE_YOU_STUDY}>
          <Stack spacing={2}>
            {field("college", FIELD_COLLEGE, { fieldMeta: meta.college })}
            {field("matriculation_year", FIELD_MATRICULATION_YEAR, {
              fieldMeta: meta.matriculation_year,
            })}
            {field("expected_graduation_year", FIELD_EXPECTED_GRADUATION, {
              fieldMeta: meta.expected_graduation_year,
            })}
            {field("degree_field", FIELD_DEGREE_FIELD, { fieldMeta: meta.degree_field })}
          </Stack>
        </Section>
        <Section title={SECTION_KEPT_PRIVATE}>
          <Stack spacing={2}>
            {field("date_of_birth", FIELD_DATE_OF_BIRTH, {
              type: "date",
              fieldMeta: meta.date_of_birth,
            })}
          </Stack>
        </Section>
        <Section title={SECTION_EMERGENCY_CONTACT}>
          <Stack spacing={2}>
            {field("ec_given_name", FIELD_EC_GIVEN_NAME)}
            {field("ec_family_name", FIELD_EC_FAMILY_NAME)}
            {/* Never required, never shape-checked — unchanged by this correction. */}
            <Field
              name="ec_relationship"
              label={FIELD_EC_RELATIONSHIP}
              defaultValue={values.ec_relationship}
            />
            {field("ec_phone", FIELD_EC_PHONE)}
            {field("ec_email", FIELD_EC_EMAIL, { type: "email" })}
          </Stack>
        </Section>
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {isReturning ? SAVE_CHANGES : SAVE_AND_CONTINUE}
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
