"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { ActionBar } from "@/components/action-bar";
import { CheckField, Field, NO_AUTOFILL } from "@/components/field";
import { Notice } from "@/components/notice";

import type { AgreementBodySection } from "@/lib/services/onboarding-agreement-body";
import { agreementLine, agreementSection } from "@/lib/services/onboarding-agreement-body";

import { agreePhotoRelease } from "./actions";
import { AgreementBlocks } from "./agreement-text";
import {
  AGREE_AND_CONTINUE,
  PHOTO_RELEASE_MUST_AGREE_ERROR,
  SAVE_REFUSED_MESSAGE,
} from "./presentation";
import {
  firstInvalidPhotoReleaseField,
  type PhotoReleaseFormState,
  type PhotoReleaseFormValues,
} from "./validation";

/**
 * The photo release step — the University of Oxford's "Photograph / filming /
 * interview consent form", LAN-347.
 *
 * Every printed word comes from the version row this page is agreeing to; the
 * only strings here are the two the record supplies (the Event line and the
 * date) and the button. Where the paper form has a box, this has a field;
 * where it has printed text, this prints it. Nothing is paraphrased, and the
 * form's order is the form's own.
 *
 * A client component for two reasons: `useActionState` is the only way to put
 * a refusal against the box it belongs to without a navigation (step 1's own
 * reason), and the form prints the name a second time — "…record the voice of
 * (your name and/or children's names)" — which has to follow the Name box as
 * it is edited rather than showing a stale value from the record.
 */
export function PhotoReleaseForm({
  token,
  sections,
  initialValues,
  eventLine,
  dateLine,
}: {
  token: string;
  sections: readonly AgreementBodySection[];
  initialValues: PhotoReleaseFormValues;
  /** Derived from the season on record — see `photoReleaseEventLine`. */
  eventLine: string;
  /** Today, in the club's own time zone. Read-only: the form is being agreed now. */
  dateLine: string;
}) {
  const [state, formAction, pending] = useActionState<PhotoReleaseFormState, FormData>(
    agreePhotoRelease,
    { values: initialValues, errors: {}, agreeError: false },
  );
  const { values, errors } = state;
  const [name, setName] = useState(values.name);
  const firstInvalid = firstInvalidPhotoReleaseField(errors);
  const focusTarget = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    focusTarget.current?.focus();
  }, [firstInvalid]);

  const line = (id: string) => agreementLine(sections, id);
  const blocks = (id: string) => agreementSection(sections, id)?.blocks ?? [];

  const box = (
    field: keyof PhotoReleaseFormValues,
    options: { required?: boolean; multiline?: boolean; defaultValue?: string } = {},
  ) => (
    <Field
      name={field}
      field={field}
      label={line(labelSection[field])}
      required={options.required}
      multiline={options.multiline}
      minRows={options.multiline ? 3 : undefined}
      autoComplete={NO_AUTOFILL}
      defaultValue={options.defaultValue ?? values[field]}
      error={Boolean(errors[field])}
      helperText={errors[field]}
      inputRef={firstInvalid === field ? focusTarget : undefined}
    />
  );

  return (
    <Box component="form" action={formAction} noValidate>
      <input type="hidden" name="token" value={token} />
      <Stack spacing={2}>
        {/* LAN-413 — a rule refused the save. Above the form, because it
            belongs to no box on it; every box that can refuse says so itself. */}
        {state.refused ? (
          <Notice severity="error" testId="save-refused">
            {SAVE_REFUSED_MESSAGE}
          </Notice>
        ) : null}
        <Typography component="h2" sx={{ fontWeight: 700, fontSize: 16 }}>
          {line("heading")}
        </Typography>
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.65 }}>{line("lead")}</Typography>

        <Printed label={line("event")} value={eventLine} note={line("event-note")} />
        <Printed label={line("date")} value={dateLine} testId="photo-release-date" />

        <Field
          name="name"
          field="name"
          label={line("name")}
          autoComplete={NO_AUTOFILL}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={Boolean(errors.name)}
          helperText={errors.name}
          inputRef={firstInvalid === "name" ? focusTarget : undefined}
        />
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.65 }}>{line("consent-line")}</Typography>
        <Typography sx={{ fontWeight: 700, fontSize: 13.5 }} data-testid="consent-name-echo">
          {name}
        </Typography>
        <Typography sx={{ fontSize: 13.5, lineHeight: 1.65 }}>
          {line("consent-line-tail")}
        </Typography>

        {box("address", { required: true, multiline: true })}
        {box("postcode", { required: true })}
        {box("tel")}
        {box("email")}

        <Typography sx={{ fontSize: 13.5, lineHeight: 1.65 }}>
          {line("activities-intro")}
        </Typography>
        <TermRow blocksFor={blocks("activities")} />
        <TermRow blocksFor={blocks("purpose")} />

        <AgreementBlocks blocks={blocks("permissions")} testId="photo-release-permissions" />
        <AgreementBlocks blocks={blocks("clauses")} testId="photo-release-clauses" />

        {state.agreeError ? (
          <Notice severity="error">{PHOTO_RELEASE_MUST_AGREE_ERROR}</Notice>
        ) : null}
        <CheckField name="agree" label={line("agree")} />
        {/* Never prefilled, whatever the record holds — decision 5. It stands
            where a signature would, so the player types it themselves; only a
            refused submission brings back what they had already typed. */}
        {box("printedName", { required: true })}
        <Typography variant="body2" color="text.secondary">
          {line("print-name-tail")}
        </Typography>

        <Box
          sx={{
            border: "1px solid rgba(0,0,0,0.23)",
            borderRadius: 1,
            p: 2,
            maxHeight: 340,
            overflow: "auto",
            bgcolor: "background.paper",
          }}
        >
          <AgreementBlocks blocks={blocks("privacy")} testId="photo-release-privacy" />
          <Box sx={{ mt: 2 }}>
            <AgreementBlocks
              blocks={blocks("privacy-contact")}
              testId="photo-release-privacy-contact"
            />
          </Box>
        </Box>

        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              {AGREE_AND_CONTINUE}
            </Button>
          }
        />
      </Stack>
    </Box>
  );
}

/** Which section of the version body carries each box's printed label. */
const labelSection: Readonly<Record<keyof PhotoReleaseFormValues, string>> = {
  name: "name",
  address: "address",
  postcode: "postcode",
  tel: "tel",
  email: "email",
  printedName: "print-name",
};

/** A box on the paper form the record fills in for you — printed, never typed. */
function Printed({
  label,
  value,
  note,
  testId,
}: {
  label: string;
  value: string;
  note?: string;
  testId?: string;
}) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: 13.5 }} data-testid={testId}>
        {value}
      </Typography>
      {note ? (
        <Typography variant="caption" color="text.secondary">
          {note}
        </Typography>
      ) : null}
    </Box>
  );
}

/** One row of the form's Activities/Purpose table: its printed name, then its printed text. */
function TermRow({ blocksFor }: { blocksFor: readonly { text: string }[] }) {
  const [term, ...rest] = blocksFor;
  if (!term) return null;
  return (
    <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "baseline" }}>
      <Typography sx={{ fontWeight: 700, fontSize: 13.5, flexShrink: 0 }}>{term.text}</Typography>
      <Typography sx={{ fontSize: 13.5, lineHeight: 1.65, flex: "1 1 240px" }}>
        {rest.map((block) => block.text).join(" ")}
      </Typography>
    </Box>
  );
}
