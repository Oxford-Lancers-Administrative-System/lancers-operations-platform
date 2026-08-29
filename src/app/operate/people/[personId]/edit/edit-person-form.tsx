"use client";

import { useState } from "react";
import { useActionState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
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
 *
 * B1/B3, LAN-185 correction round 2 (Brian's walk): every reason-bearing
 * field is a `CorrectableField` below — one inline interaction, the same
 * shape for all fifteen fields including mobile. Its *Reason for the change*
 * box appears only once the operator's live value actually differs from what
 * is stored, and disappears again if they put the original value back;
 * mobile's normalised preview and WhatsApp-seam warning render inline the
 * same way, with no second screen.
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
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" color="text.secondary">
              <Button
                href={`/operate/people/${personId}`}
                sx={{ p: 0, minHeight: 0, textTransform: "none" }}
              >
                ← {record.displayName}
              </Button>
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
              Correct this record
            </Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              href={`/operate/people/${personId}`}
              sx={{ minHeight: MIN_TOUCH_TARGET, textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pending}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
            >
              Save
            </Button>
          </Stack>
        </Stack>

        {state.formError ? <Alert severity="warning">{state.formError}</Alert> : null}
        {state.concurrentEditMessage ? (
          <Alert severity="warning" data-testid="concurrent-edit-banner">
            {state.concurrentEditMessage}
          </Alert>
        ) : null}
        {state.emailConflict ? (
          <Alert severity="warning" data-testid="email-conflict-banner">
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
          </Alert>
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
              original={mobile?.rawValue ?? ""}
              error={state.errors.mobile}
              unchangedHelperText="Validated and read back before saving."
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
            <CorrectableField
              name="collegeEmail"
              reasonName="collegeEmailReason"
              label="College email"
              original={collegeEmail?.rawValue ?? ""}
              error={state.errors.collegeEmail}
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

            {/* B2, LAN-185 correction round 2: the emergency contact is one
                subject — the way the record itself reads it as a single
                `Fact` — so its five fields render as their own labelled
                group, not loose among the restricted fields. */}
            <Subsection title="Emergency contact">
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
                  original={ec?.phone ?? ""}
                />
                <CorrectableField
                  name="emergencyEmail"
                  reasonName="emergencyEmailReason"
                  label="Email"
                  original={ec?.email ?? ""}
                />
              </Stack>
            </Subsection>
          </Stack>
        </Section>
      </Stack>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Paper>
  );
}

/**
 * A titled group nested inside a `Section` — B2's "one subject" grouping for
 * the emergency contact, visually distinct without being a second `Section`
 * (the record's own four top-level sections stay four).
 */
function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * One reason-governed field — B1/B3's single shared shape for every one of
 * the fifteen fields `person-write.ts`'s reason rule covers, mobile
 * included. `original` is the value currently on record (`""` means
 * genuinely empty, `REQ-not-recorded`). The *Reason for the change* box
 * appears only once the live value differs from `original` **and**
 * `original` is not empty — required to correct a value, never to fill an
 * empty one — and disappears again the moment the operator puts the
 * original value back, per field, live, the way B1 asked for it.
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
}) {
  const [value, setValue] = useState(original);
  const changed = value.trim() !== original.trim();
  const needsReason = changed && original.trim() !== "";

  return (
    <>
      <TextField
        name={name}
        label={label}
        type={type}
        required={required}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        error={Boolean(error)}
        helperText={error ?? (changed ? undefined : unchangedHelperText)}
        slotProps={type === "date" ? { inputLabel: { shrink: true } } : undefined}
        fullWidth
      />
      {renderExtra ? renderExtra(value, changed) : null}
      {needsReason ? (
        <TextField
          name={reasonName}
          label="Reason for the change"
          helperText="Required only if you change this value."
          fullWidth
        />
      ) : null}
    </>
  );
}

/**
 * B3's inline normalise-and-confirm, in place of the old second screen.
 * `validatePhoneNumber` is pure and explicitly documented safe to call from
 * a client component — the same posture `describeWhatsappSeamConsequence`
 * states for the same reason. Neither call writes anything; the server
 * action re-validates and re-normalises before it ever commits.
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
        <Alert severity="warning" data-testid="whatsapp-seam-banner">
          {seam.message}
        </Alert>
      ) : null}
    </Stack>
  );
}

/**
 * Three actions, one shared `<form>` — the outer edit form itself.
 *
 * HTML forbids a nested `<form>`, so each alias action is a submit button
 * carrying its own `formAction`, bound with `personId` and (for remove and
 * set-display) the alias id — React overrides a submit button's own
 * `name`/`value` the moment `formAction` is a function, so the id has to
 * travel bound into the action rather than as the button's own value. Every
 * one of these redirects back to this same page, so a click here never also
 * submits the record's other fields.
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
              <Chip size="small" variant="outlined" label="display name" />
            ) : null}
            {!alias.isDisplayName ? (
              <Button
                type="submit"
                formAction={submitSetDisplayAlias.bind(null, personId, alias.id)}
                formNoValidate
                size="small"
                sx={{ textTransform: "none", minHeight: 0, p: 0 }}
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
              sx={{ textTransform: "none", minHeight: 0, p: 0 }}
            >
              Remove
            </Button>
          </Stack>
        ))}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
        <TextField name="newAlias" label="Add an alias" size="small" sx={{ flexGrow: 1 }} />
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
