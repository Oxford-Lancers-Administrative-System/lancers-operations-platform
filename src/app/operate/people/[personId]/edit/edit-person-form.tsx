"use client";

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
}: {
  personId: string;
  record: PersonRecord;
  expectedVersion: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitPersonEdit, INITIAL_EDIT_STATE);
  const mobile = currentContact(record, "phone", null);
  const personalEmail = currentContact(record, "email", "personal");
  const collegeEmail = currentContact(record, "email", "college");
  const ec = record.emergencyContact;

  if (state.pendingMobileConfirmation) {
    return (
      <MobileConfirmStep
        personId={personId}
        record={record}
        expectedVersion={expectedVersion}
        confirmation={state.pendingMobileConfirmation}
      />
    );
  }

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
            <TextField
              name="givenName"
              label="First name"
              required
              defaultValue={record.givenName}
              error={Boolean(state.errors.givenName)}
              helperText={state.errors.givenName}
              fullWidth
            />
            <TextField
              name="familyName"
              label="Last name"
              defaultValue={record.familyName ?? ""}
              error={Boolean(state.errors.familyName)}
              helperText={state.errors.familyName}
              fullWidth
            />
            <AliasesEditor personId={personId} record={record} />
          </Stack>
        </Section>

        <Section title="How to reach them">
          <Stack spacing={2}>
            <TextField
              name="mobile"
              label="Mobile phone"
              defaultValue={mobile?.rawValue ?? ""}
              error={Boolean(state.errors.mobile)}
              helperText={state.errors.mobile ?? "Validated and read back before saving."}
              fullWidth
            />
            {mobile ? (
              <TextField
                name="mobileReason"
                label="Reason for the change"
                helperText="Required only if you change this value."
                fullWidth
              />
            ) : null}
            <TextField
              name="personalEmail"
              label="Personal email"
              defaultValue={personalEmail?.rawValue ?? ""}
              error={Boolean(state.errors.personalEmail)}
              helperText={state.errors.personalEmail}
              fullWidth
            />
            {personalEmail ? (
              <TextField
                name="personalEmailReason"
                label="Reason for the change"
                helperText="Required only if you change this value."
                fullWidth
              />
            ) : null}
            <TextField
              name="collegeEmail"
              label="College email"
              defaultValue={collegeEmail?.rawValue ?? ""}
              error={Boolean(state.errors.collegeEmail)}
              helperText={state.errors.collegeEmail}
              fullWidth
            />
            {collegeEmail ? (
              <TextField
                name="collegeEmailReason"
                label="Reason for the change"
                helperText="Required only if you change this value."
                fullWidth
              />
            ) : null}
          </Stack>
        </Section>

        <Section title="Academic">
          <Stack spacing={2}>
            <TextField
              name="college"
              label="College"
              defaultValue={record.college ?? ""}
              fullWidth
            />
            <TextField
              name="matriculationYear"
              label="Matriculation year"
              defaultValue={record.matriculationYear ?? ""}
              fullWidth
            />
            <TextField
              name="expectedGraduationYear"
              label="Expected graduation"
              defaultValue={record.expectedGraduationYear ?? ""}
              fullWidth
            />
            <TextField
              name="degreeField"
              label="Degree field"
              defaultValue={record.degreeField ?? ""}
              fullWidth
            />
          </Stack>
        </Section>

        <Section title="Restricted">
          <Stack spacing={2}>
            <TextField
              name="dateOfBirth"
              label="Date of birth"
              type="date"
              defaultValue={record.dateOfBirth ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              name="emergencyGivenName"
              label="Emergency contact — first name"
              defaultValue={ec?.givenName ?? ""}
              fullWidth
            />
            <TextField
              name="emergencyFamilyName"
              label="Emergency contact — last name"
              defaultValue={ec?.familyName ?? ""}
              fullWidth
            />
            <TextField
              name="emergencyRelationship"
              label="Relationship"
              defaultValue={ec?.relationship ?? ""}
              fullWidth
            />
            <TextField
              name="emergencyPhone"
              label="Phone"
              defaultValue={ec?.phone ?? ""}
              fullWidth
            />
            <TextField
              name="emergencyEmail"
              label="Email"
              defaultValue={ec?.email ?? ""}
              fullWidth
            />
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

function MobileConfirmStep({
  personId,
  record,
  expectedVersion,
  confirmation,
}: {
  personId: string;
  record: PersonRecord;
  expectedVersion: string | null;
  confirmation: {
    raw: string;
    normalisedPreview: string;
    reason: string;
    whatsappWarning: string | null;
  };
}) {
  const [, formAction, pending] = useActionState(submitPersonEdit, INITIAL_EDIT_STATE);
  const mobile = currentContact(record, "phone", null);
  const personalEmail = currentContact(record, "email", "personal");
  const collegeEmail = currentContact(record, "email", "college");
  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 880 }}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion ?? ""} />
      <input type="hidden" name="confirmMobile" value="1" />
      <input type="hidden" name="mobile" value={confirmation.raw} />
      <input type="hidden" name="givenName" value={record.givenName} />
      <input type="hidden" name="familyName" value={record.familyName ?? ""} />
      <input type="hidden" name="personalEmail" value={personalEmail?.rawValue ?? ""} />
      <input type="hidden" name="collegeEmail" value={collegeEmail?.rawValue ?? ""} />
      <input type="hidden" name="college" value={record.college ?? ""} />
      <input type="hidden" name="matriculationYear" value={record.matriculationYear ?? ""} />
      <input
        type="hidden"
        name="expectedGraduationYear"
        value={record.expectedGraduationYear ?? ""}
      />
      <input type="hidden" name="degreeField" value={record.degreeField ?? ""} />
      <input type="hidden" name="dateOfBirth" value={record.dateOfBirth ?? ""} />
      <input
        type="hidden"
        name="emergencyGivenName"
        value={record.emergencyContact?.givenName ?? ""}
      />
      <input
        type="hidden"
        name="emergencyFamilyName"
        value={record.emergencyContact?.familyName ?? ""}
      />
      <input
        type="hidden"
        name="emergencyRelationship"
        value={record.emergencyContact?.relationship ?? ""}
      />
      <input type="hidden" name="emergencyPhone" value={record.emergencyContact?.phone ?? ""} />
      <input type="hidden" name="emergencyEmail" value={record.emergencyContact?.email ?? ""} />

      <Stack spacing={3}>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Correct this record
        </Typography>

        {confirmation.whatsappWarning ? (
          <Alert severity="warning" data-testid="whatsapp-seam-banner">
            {confirmation.whatsappWarning}
          </Alert>
        ) : null}

        <Section title="How to reach them">
          <Stack spacing={2}>
            <Typography>
              Will be saved as <strong>{confirmation.normalisedPreview}</strong>
            </Typography>
            {mobile ? (
              <Typography variant="body2" color="text.secondary">
                was {mobile.rawValue}
              </Typography>
            ) : null}
            <TextField
              name="mobileReason"
              label="Reason for the change"
              defaultValue={confirmation.reason}
              fullWidth
              required={Boolean(mobile)}
            />
          </Stack>
        </Section>

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
    </Box>
  );
}
