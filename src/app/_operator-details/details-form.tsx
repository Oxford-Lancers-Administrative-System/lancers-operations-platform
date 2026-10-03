"use client";

import { useActionState, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import { ActionBar } from "@/components/action-bar";
import { Fact } from "@/components/fact";
import { DateField, Field } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import { Section } from "@/components/section";
import {
  OPERATOR_DETAILS_LABELS,
  REQUIRED_OPERATOR_DETAILS,
  type OperatorDetailsField,
  type OperatorDetailsFormState,
  type OperatorDetailsValues,
} from "@/lib/services/operator-details/fields";

/**
 * The operator details form — LAN-459. One component, used signed in
 * (`/me/details`) and from the WhatsApp link (`/onboarding/<t>`); only the
 * action it posts to differs. Personal information only, the fields the
 * service decided this person is asked, and no "Not now": Save is the only
 * way on. `noValidate`, so every submission reaches the service and the
 * service's refusal is what the field shows.
 */

const SAVE_LABEL = "Save";
const REQUIRED_NOTE = "* is required.";
const SECTION_TITLE = "Personal information";
const SAVED_TITLE = "Details saved";
const INVITATION_LABEL = "Sign-in invitation sent to";

export function OperatorDetailsForm({
  action,
  values: initialValues,
  fields,
}: {
  action: (
    state: OperatorDetailsFormState,
    formData: FormData,
  ) => Promise<OperatorDetailsFormState>;
  values: OperatorDetailsValues;
  fields: readonly OperatorDetailsField[];
}) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    errors: {},
  });
  const { values, errors } = state;
  const [birthDay, setBirthDay] = useState(initialValues.dateOfBirth);
  const shown = new Set(fields);

  // The link's save: the form is done and the link is dead. States only.
  if (state.saved) {
    return (
      <Section title={SAVED_TITLE} testId="operator-details-saved">
        {state.invitationEmail ? (
          <Fact label={INVITATION_LABEL} value={state.invitationEmail} />
        ) : null}
      </Section>
    );
  }

  const text = (name: OperatorDetailsField, type = "text") =>
    shown.has(name) ? (
      <Field
        key={name}
        name={name}
        label={OPERATOR_DETAILS_LABELS[name]}
        defaultValue={values[name]}
        required={REQUIRED_OPERATOR_DETAILS.has(name)}
        error={Boolean(errors[name])}
        helperText={errors[name]}
        type={type}
      />
    ) : null;

  return (
    <Box component="form" action={formAction} noValidate data-testid="operator-details-form">
      <Stack spacing={2.5}>
        <FormHelperText sx={{ fontSize: 13 }}>{REQUIRED_NOTE}</FormHelperText>
        <Section title={SECTION_TITLE}>
          <Stack spacing={2}>
            {text("givenName")}
            {text("middleName")}
            {text("familyName")}
            {text("knownAs")}
            {shown.has("mobile") ? (
              <PhoneField
                name="mobile"
                label={OPERATOR_DETAILS_LABELS.mobile}
                defaultValue={values.mobile}
                required
                error={Boolean(errors.mobile)}
                helperText={errors.mobile}
              />
            ) : null}
            {text("personalEmail", "email")}
            {shown.has("dateOfBirth") ? (
              <DateField
                name="dateOfBirth"
                label={OPERATOR_DETAILS_LABELS.dateOfBirth}
                value={birthDay}
                onChange={setBirthDay}
                error={Boolean(errors.dateOfBirth)}
                helperText={errors.dateOfBirth || undefined}
              />
            ) : null}
          </Stack>
        </Section>
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending} sx={{ minHeight: 44 }}>
              {SAVE_LABEL}
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}
