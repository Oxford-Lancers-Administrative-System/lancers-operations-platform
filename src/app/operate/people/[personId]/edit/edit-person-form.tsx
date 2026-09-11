"use client";

import { useState } from "react";
import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section, FieldGroup } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field, DateField } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import Typography from "@mui/material/Typography";

import type { PersonRecord } from "@/lib/services/person-record";
import { validatePhoneNumber } from "@/lib/services/person-validation";
import { describeWhatsappSeamConsequence } from "@/lib/services/person-whatsapp-seam";
import {
  submitAddAlias,
  submitPersonEdit,
  submitRemoveAlias,
  submitSetDisplayAlias,
} from "./actions";
import { INITIAL_EDIT_STATE } from "./edit-state";

const MIN_TOUCH_TARGET = 44;

function currentContact(
  record: PersonRecord,
  kind: "email" | "phone",
  scope: "college" | "personal" | null,
) {
  return (
    record.contacts.find(
      (c) => c.kind === kind && c.scope === scope && c.validUntil === null && c.isPreferred,
    ) ?? null
  );
}

/**
 * `/operate/people/[personId]/edit` — W2-01 … W2-10. One page, sectioned
 * exactly as the record reads, one Save. See `actions.ts`'s module note for
 * why every field lives on one submission.
 */
export default function EditPersonForm({
  personId,
  record,
  expectedVersion,
  seasonLabel,
}: {
  personId: string;
  record: PersonRecord;
  expectedVersion: string | null;
  seasonLabel: string;
}) {
  const [state, formAction, pending] = useActionState(submitPersonEdit, INITIAL_EDIT_STATE);
  const mobile = currentContact(record, "phone", null);
  const personalEmail = currentContact(record, "email", "personal");
  const collegeEmail = currentContact(record, "email", "college");
  const ec = record.emergencyContact;

  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 880 }}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion ?? ""} />

      <Stack spacing={3}>
        <PageHeader
          title="Correct this record"
          back={{ href: `/operate/people/${personId}`, label: `Back to ${record.displayName}` }}
        />

        {state.formError ? <Notice severity="warning">{state.formError}</Notice> : null}
        {state.concurrentEditMessage ? (
          <Notice severity="warning" testId="concurrent-edit-banner">
            {state.concurrentEditMessage}
          </Notice>
        ) : null}
        {state.emailConflict ? (
          <Notice severity="warning" testId="email-conflict-banner">
            <Stack spacing={1}>
              <Typography variant="body2">
                <strong>{state.emailConflict.displayName}</strong> already holds this email. Two
                records sharing a contact point is usually one person twice.
              </Typography>
              {state.emailConflict.personId ? (
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                  <Button
                    variant="contained"
                    size="small"
                    href={`/operate/people/${personId}/merge?with=${state.emailConflict.personId}`}
                  >
                    Compare with {state.emailConflict.displayName}
                  </Button>
                  <Button
                    variant="outlined"
                    size="small"
                    href={`/operate/people/${state.emailConflict.personId}`}
                  >
                    Open {state.emailConflict.displayName}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </Notice>
        ) : null}

        <Section title="Who they are">
          <Stack spacing={2}>
            <CorrectableField
              name="givenName"
              reasonName="givenNameReason"
              label="First name"
              required
              original={record.givenName}
              error={state.errors.givenName}
            />
            <CorrectableField
              name="familyName"
              reasonName="familyNameReason"
              label="Last name"
              original={record.familyName ?? ""}
              error={state.errors.familyName}
            />
            <AliasesEditor personId={personId} record={record} />
          </Stack>
        </Section>

        <Section title="How to reach them">
          <Stack spacing={2}>
            <CorrectableField
              name="mobile"
              reasonName="mobileReason"
              label="Mobile phone"
              phone
              original={mobile?.rawValue ?? ""}
              error={state.errors.mobile}
              renderExtra={(value, changed) =>
                changed ? (
                  <MobilePreview
                    value={value}
                    original={mobile?.rawValue ?? ""}
                    seasonLabel={seasonLabel}
                  />
                ) : null
              }
            />
            <CorrectableField
              name="personalEmail"
              reasonName="personalEmailReason"
              label="Personal email"
              original={personalEmail?.rawValue ?? ""}
              error={state.errors.personalEmail}
            />
            {/* LAN-268: same rule as the recruitment doors and player questionnaire — refused before write, no override. */}
            <CorrectableField
              name="collegeEmail"
              reasonName="collegeEmailReason"
              label="College email"
              original={collegeEmail?.rawValue ?? ""}
              error={state.errors.collegeEmail}
              unchangedHelperText="Their university address — it ends in ox.ac.uk."
            />
          </Stack>
        </Section>

        <Section title="Academic">
          <Stack spacing={2}>
            <CorrectableField
              name="college"
              reasonName="collegeReason"
              label="College"
              original={record.college ?? ""}
            />
            <CorrectableField
              name="matriculationYear"
              reasonName="matriculationYearReason"
              label="Matriculation year"
              original={record.matriculationYear !== null ? String(record.matriculationYear) : ""}
            />
            <CorrectableField
              name="expectedGraduationYear"
              reasonName="expectedGraduationYearReason"
              label="Expected graduation"
              original={
                record.expectedGraduationYear !== null ? String(record.expectedGraduationYear) : ""
              }
            />
            <CorrectableField
              name="degreeField"
              reasonName="degreeFieldReason"
              label="Degree field"
              original={record.degreeField ?? ""}
            />
            {/* LAN-267: BAFA number is operator-editable — a coach never sees the player questionnaire. */}
            <CorrectableField
              name="studentNumber"
              reasonName="studentNumberReason"
              label="Student number"
              original={record.studentNumber ?? ""}
              unchangedHelperText="Printed beside their name on the officials' roster form."
            />
            <CorrectableField
              name="bafaRegistrationNumber"
              reasonName="bafaRegistrationNumberReason"
              label="BAFA registration number"
              original={record.bafaRegistrationNumber ?? ""}
              unchangedHelperText="Printed beside every coach and sideline person on the officials' roster form."
            />
          </Stack>
        </Section>

        <Section title="Restricted">
          <Stack spacing={2}>
            <CorrectableField
              name="dateOfBirth"
              reasonName="dateOfBirthReason"
              label="Date of birth"
              type="date"
              original={record.dateOfBirth ?? ""}
            />

            {/* B2, LAN-185 round 2: emergency contact is one subject, grouped rather than loose among restricted fields. */}
            <FieldGroup title="Emergency contact">
              <Stack spacing={2}>
                <CorrectableField
                  name="emergencyGivenName"
                  reasonName="emergencyGivenNameReason"
                  label="First name"
                  original={ec?.givenName ?? ""}
                />
                <CorrectableField
                  name="emergencyFamilyName"
                  reasonName="emergencyFamilyNameReason"
                  label="Last name"
                  original={ec?.familyName ?? ""}
                />
                <CorrectableField
                  name="emergencyRelationship"
                  reasonName="emergencyRelationshipReason"
                  label="Relationship"
                  original={ec?.relationship ?? ""}
                />
                <CorrectableField
                  name="emergencyPhone"
                  reasonName="emergencyPhoneReason"
                  label="Phone"
                  phone
                  original={ec?.phone ?? ""}
                />
                <CorrectableField
                  name="emergencyEmail"
                  reasonName="emergencyEmailReason"
                  label="Email"
                  original={ec?.email ?? ""}
                />
              </Stack>
            </FieldGroup>
          </Stack>
        </Section>
        <ActionBar
          primary={
            <Button type="submit" variant="contained" disabled={pending}>
              Save
            </Button>
          }
          cancel={<Button href={`/operate/people/${personId}`}>Cancel</Button>}
        />
      </Stack>
    </Box>
  );
}

/**
 * One reason-governed field — B1/B3's shared shape for all fifteen reason-rule
 * fields. `original` = value on record (`""` = empty, REQ-not-recorded). The
 * reason box appears only when live value differs from a non-empty original.
 */
function CorrectableField({
  name,
  reasonName,
  label,
  original,
  error,
  type,
  required,
  unchangedHelperText,
  renderExtra,
  phone,
}: {
  name: string;
  reasonName: string;
  label: string;
  original: string;
  error?: string;
  type?: string;
  required?: boolean;
  unchangedHelperText?: string;
  renderExtra?: (value: string, changed: boolean) => React.ReactNode;
  /** LAN-211: the shared two-part control in place of one free-text box. */
  phone?: boolean;
}) {
  const [value, setValue] = useState(original);
  const [pickerDate, setPickerDate] = useState<Date | null | undefined>(undefined);
  const changed = value.trim() !== original.trim();
  const needsReason = changed && original.trim() !== "";

  return (
    <>
      {phone ? (
        // The control owns typing; this component owns whether a change needs a reason (same joined string the hidden input posts).
        <PhoneField
          name={name}
          label={label}
          defaultValue={original}
          required={required}
          error={Boolean(error)}
          helperText={error ?? (changed ? undefined : unchangedHelperText)}
          onValueChange={setValue}
        />
      ) : type === "date" ? (
        <DateField
          name={name}
          label={label}
          value={value}
          onChange={setValue}
          dateValue={pickerDate}
          onDateChange={setPickerDate}
          required={required}
          error={Boolean(error)}
          helperText={error}
        />
      ) : (
        <Field
          name={name}
          label={label}
          type={type}
          required={required}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={Boolean(error)}
          helperText={error ?? (changed ? undefined : unchangedHelperText)}
        />
      )}
      {renderExtra ? renderExtra(value, changed) : null}
      {needsReason ? <Field name={reasonName} label="Reason for the change" /> : null}
    </>
  );
}

/**
 * B3's inline normalise-and-confirm, replacing the old second screen.
 * Pure calls only — the server action re-validates before it commits.
 */
function MobilePreview({
  value,
  original,
  seasonLabel,
}: {
  value: string;
  original: string;
  seasonLabel: string;
}) {
  if (value.trim() === "") return null;
  const validation = validatePhoneNumber(value);
  if (!validation.valid) return null;
  const seam = describeWhatsappSeamConsequence(
    original,
    seasonLabel,
    // Honest today: no substrate answers this — see person-whatsapp-seam.ts.
    false,
  );
  return (
    <Stack spacing={1}>
      <Typography variant="body2" color="text.secondary" data-testid="mobile-normalised-preview">
        Will be saved as <strong>+{validation.e164}</strong>
      </Typography>
      {seam.message ? (
        <Notice severity="warning" testId="whatsapp-seam-banner">
          {seam.message}
        </Notice>
      ) : null}
    </Stack>
  );
}

/**
 * Three alias actions share the outer edit `<form>` — HTML forbids nesting,
 * so each is a submit button with its own bound `formAction` (`personId`
 * and, for remove/set-display, the alias id) — React overrides a button's
 * own name/value once `formAction` is a function.
 */
function AliasesEditor({ personId, record }: { personId: string; record: PersonRecord }) {
  const addAction = submitAddAlias.bind(null, personId);
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        Aliases
      </Typography>
      <Stack spacing={0.75}>
        {record.aliases.map((alias) => (
          <Stack
            key={alias.id}
            direction="row"
            spacing={1}
            sx={{ alignItems: "center", flexWrap: "wrap" }}
          >
            <Typography sx={{ fontWeight: alias.isDisplayName ? 700 : 400 }}>
              {alias.alias}
            </Typography>
            {alias.isDisplayName ? (
              <Typography variant="caption" color="text.secondary">
                display name
              </Typography>
            ) : null}
            {!alias.isDisplayName ? (
              <Button
                type="submit"
                formAction={submitSetDisplayAlias.bind(null, personId, alias.id)}
                formNoValidate
                size="small"
                sx={{ minHeight: 44 }}
              >
                Make display name
              </Button>
            ) : null}
            <Button
              type="submit"
              formAction={submitRemoveAlias.bind(null, personId, alias.id)}
              formNoValidate
              size="small"
              color="inherit"
              sx={{ minHeight: 44 }}
            >
              Remove
            </Button>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <Field name="newAlias" label="Add an alias" sx={{ flexGrow: 1 }} />
        <Button
          type="submit"
          formAction={addAction}
          formNoValidate
          variant="outlined"
          sx={{ minHeight: MIN_TOUCH_TARGET }}
        >
          Add
        </Button>
      </Stack>
    </Box>
  );
}
