"use client";

import { useActionState, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import { MEMBERSHIP_STATUS_LABELS } from "@/app/operate/roster/presentation";
import {
  validateAcademicYear,
  validateEmailAddress,
  validatePhoneNumber,
} from "@/lib/services/person-validation";
import {
  PROSPECT_STATUS_LABELS,
  RECRUITMENT_ADD_EXPLANATION,
  RECRUITMENT_ADD_OPT_IN_LABEL,
  RECRUITMENT_ADD_OPT_IN_NOTE_HELPER,
  RECRUITMENT_ADD_OPT_IN_NOTE_LABEL,
  RECRUITMENT_ADD_OPT_IN_OPTIONS,
  type ProspectStatus,
} from "@/lib/services/recruitment-vocabulary";
import type { MembershipStatus } from "@/lib/services/membership";
import { submitAddRecruit } from "./actions";
import { INITIAL_ADD_RECRUIT_STATE, type AddRecruitCandidate } from "./create-state";

const MIN_TOUCH_TARGET = 44;

/**
 * `W6` — add a recruit by hand, with `W8`'s duplicate check inside it.
 * LAN-206. `/operate/people/new/create-person-form.tsx`, for its four fields
 * and its duplicate check (`findPersonDuplicates`, called and never
 * duplicated), plus the Academic section `W6-01` adds. The check's own
 * answer renders above the form, never below it — "the duplicate check if
 * it finds something needs to go at the top, not the bottom" (Brian,
 * 2026-09-01).
 *
 * Correction round 1, F-206-02 (Brian: "Mock up wins" on structure and copy
 * where the runnable fidelity mockup and the approved screens disagree):
 * this door's own structure now follows
 * `src/app/recruitment-preview/add-recruit.tsx` — the header carries only
 * `Cancel`/`Check for duplicates`, never a button whose own label morphs;
 * the fields below stay visible throughout; and a match, once found, offers
 * its own two controls — "This is somebody new" (create) and "Go back and
 * change the details" (dismiss the panel, touching nothing) — inside the
 * candidates panel itself, exactly as the mockup shows.
 *
 * Correction round 2 widens this considerably — see each finding's own
 * comment below (V-1, V-2, V-3/V-4, V-10) for what changed and why.
 */
export default function AddRecruitForm({ seasonLabel }: { seasonLabel: string }) {
  const [state, formAction, pending] = useActionState(submitAddRecruit, INITIAL_ADD_RECRUIT_STATE);
  const { values, errors, candidates, exactMatch, alreadyMember } = state;

  // V-1, correction round 2 (blocking, Brian's own words: "a hard
  // requirement") — inline, on-field validation for phone and email, using
  // the shared validators the application already has
  // (`person-validation.ts`) rather than a third copy, in the same idiom
  // `signup-form.tsx` already established for the identical two fields:
  // local state so a format error renders the moment it is typeable, not
  // only after CHECK FOR DUPLICATES / a submit round-trip. `errors.mobile`
  // (the server's own "Required" refusal for a blank field) and this
  // client-only format check compose — a required-but-blank field shows the
  // server's message; a filled-but-malformed one shows this one.
  const [mobile, setMobile] = useState(values.mobile);
  const [personalEmail, setPersonalEmail] = useState(values.personalEmail);
  const [matriculationYear, setMatriculationYear] = useState(values.matriculationYear);
  const [expectedGraduationYear, setExpectedGraduationYear] = useState(
    values.expectedGraduationYear,
  );
  const [emergencyPhone, setEmergencyPhone] = useState(values.emergencyPhone);
  const [emergencyEmail, setEmergencyEmail] = useState(values.emergencyEmail);

  const mobileValidation = mobile.trim() === "" ? null : validatePhoneNumber(mobile);
  const mobileFormatError =
    mobileValidation && !mobileValidation.valid ? mobileValidation.message : null;

  const emailValidation = personalEmail.trim() === "" ? null : validateEmailAddress(personalEmail);
  const emailFormatError =
    emailValidation && !emailValidation.valid ? emailValidation.message : null;

  const matricValidation =
    matriculationYear.trim() === ""
      ? null
      : validateAcademicYear(matriculationYear, "Matriculation year");
  const matricFormatError =
    matricValidation && !matricValidation.valid ? matricValidation.message : null;

  const gradValidation =
    expectedGraduationYear.trim() === ""
      ? null
      : validateAcademicYear(expectedGraduationYear, "Expected graduation");
  const gradFormatError = gradValidation && !gradValidation.valid ? gradValidation.message : null;

  const emergencyPhoneValidation =
    emergencyPhone.trim() === "" ? null : validatePhoneNumber(emergencyPhone);
  const emergencyPhoneFormatError =
    emergencyPhoneValidation && !emergencyPhoneValidation.valid
      ? emergencyPhoneValidation.message
      : null;

  const emergencyEmailValidation =
    emergencyEmail.trim() === "" ? null : validateEmailAddress(emergencyEmail);
  const emergencyEmailFormatError =
    emergencyEmailValidation && !emergencyEmailValidation.valid
      ? emergencyEmailValidation.message
      : null;

  const formatInvalid = Boolean(
    mobileFormatError ||
    emailFormatError ||
    matricFormatError ||
    gradFormatError ||
    emergencyPhoneFormatError ||
    emergencyEmailFormatError,
  );

  const requiredCount = Object.keys(errors).length;
  const createLabel = exactMatch
    ? "Create anyway"
    : `Create ${values.givenName || "recruit"}${values.familyName ? ` ${values.familyName}` : ""}`;

  // V-3 / V-4, correction round 2 — "This is them" on a current player
  // resolves to this one clean confirmation screen, replacing the whole
  // form rather than stacking a refusal onto it. Brian: "If I say 'This is
  // them,' it should basically close… That's not an error state. That's
  // just a normal thing… say, 'Okay, they're fine, no changes will be
  // made,' and then go back to the recruits."
  if (alreadyMember) {
    return <AlreadyMemberScreen alreadyMember={alreadyMember} />;
  }

  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 880 }}>
      <Stack spacing={3}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          sx={{ justifyContent: "space-between", alignItems: "flex-start" }}
        >
          <Box>
            <Typography variant="body2" color="text.secondary">
              <Button
                href="/operate/recruitment"
                sx={{ p: 0, minHeight: 0, textTransform: "none" }}
              >
                ← Recruitment
              </Button>
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
              Add a recruit
            </Typography>
            {requiredCount > 0 ? (
              <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                {requiredCount} required field{requiredCount === 1 ? "" : "s"}
              </Typography>
            ) : null}
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              href="/operate/recruitment"
              sx={{ minHeight: MIN_TOUCH_TARGET, textTransform: "none" }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              name="intent"
              value="check"
              variant="contained"
              disabled={pending || formatInvalid}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
              data-testid="add-recruit-check"
            >
              Check for duplicates
            </Button>
          </Stack>
        </Stack>
        {formatInvalid ? (
          <Typography
            variant="caption"
            color="text.secondary"
            data-testid="add-recruit-format-invalid"
          >
            Correct the field marked in red to enable Check for duplicates / Create.
          </Typography>
        ) : null}

        {state.formError ? <Alert severity="warning">{state.formError}</Alert> : null}

        {candidates !== null ? (
          <Section title={candidates.length > 0 ? "Already in the club" : "Duplicate check"}>
            <Typography color="text.secondary" sx={{ mb: 1.5 }} data-testid="candidate-count">
              {candidates.length === 0
                ? "No record looks like this person. Nothing has been written yet."
                : `${candidates.length} record${candidates.length === 1 ? "" : "s"} look${candidates.length === 1 ? "s" : ""} like this person. Nothing has been written yet.`}
            </Typography>
            {candidates.length > 0 ? (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {candidates.map((candidate) => (
                  <Box key={candidate.personId}>
                    <CandidateRow candidate={candidate} pending={pending} />
                    {candidate.identity.kind === "player" ? (
                      <Alert severity="warning" sx={{ mt: 0.5 }}>
                        They already hold a membership this season — a player is not a recruit, so
                        linking here is refused.
                      </Alert>
                    ) : null}
                  </Box>
                ))}
              </Stack>
            ) : null}
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <Button
                type="submit"
                name="intent"
                value="create"
                variant="contained"
                disabled={pending || formatInvalid}
                sx={{ minHeight: MIN_TOUCH_TARGET }}
                data-testid="add-recruit-create"
              >
                {createLabel}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="dismiss"
                variant="outlined"
                disabled={pending}
                sx={{ minHeight: MIN_TOUCH_TARGET }}
                data-testid="add-recruit-dismiss"
              >
                Go back and change the details
              </Button>
            </Stack>
          </Section>
        ) : null}

        {exactMatch ? (
          <Section title="Why this is a different person">
            <TextField
              name="overrideReason"
              label="Reason"
              fullWidth
              autoFocus
              error={Boolean(state.reasonError)}
              helperText={state.reasonError}
            />
          </Section>
        ) : null}

        <Section title="Who they are">
          <Stack spacing={2}>
            <TextField
              name="givenName"
              label="First name"
              required
              defaultValue={values.givenName}
              error={Boolean(errors.givenName)}
              helperText={errors.givenName}
              autoFocus={!errors.givenName}
              fullWidth
            />
            <TextField
              name="familyName"
              label="Last name"
              required
              defaultValue={values.familyName}
              error={Boolean(errors.familyName)}
              helperText={errors.familyName}
              fullWidth
            />
            <TextField
              name="mobile"
              label="Mobile phone"
              required
              value={mobile}
              onChange={(event) => setMobile(event.target.value)}
              error={Boolean(errors.mobile) || Boolean(mobileFormatError)}
              helperText={errors.mobile ?? mobileFormatError ?? undefined}
              fullWidth
              data-testid="mobile-field"
            />
            <TextField
              name="personalEmail"
              label="Personal email"
              value={personalEmail}
              onChange={(event) => setPersonalEmail(event.target.value)}
              error={Boolean(errors.personalEmail) || Boolean(emailFormatError)}
              helperText={errors.personalEmail ?? emailFormatError ?? undefined}
              fullWidth
              data-testid="personal-email-field"
            />
            {/* V-2, correction round 2 — the shipped intake forms' own
                "Known as" (`signup-form.tsx`). */}
            <TextField
              name="knownAs"
              label="Known as"
              defaultValue={values.knownAs}
              helperText="Only if it differs from their first name."
              fullWidth
            />
          </Stack>
        </Section>

        {/* V-2, correction round 2 — Brian: "The add-to form seems narrow…
            We can use the forms from before to see which fields we're
            asking for there." The shipped intake forms' own field set
            (`signup-form.tsx`, `edit-person-form.tsx`), not one invented
            here. Every field below is optional — `REQ-missing-never-blocks`
            still names only first name, last name and mobile. */}
        <Section title="Academic">
          <Stack spacing={2}>
            <TextField name="college" label="College" defaultValue={values.college} fullWidth />
            <TextField
              name="matriculationYear"
              label="Matriculation year"
              value={matriculationYear}
              onChange={(event) => setMatriculationYear(event.target.value)}
              error={Boolean(matricFormatError)}
              helperText={matricFormatError ?? undefined}
              fullWidth
            />
            <TextField
              name="expectedGraduationYear"
              label="Expected graduation"
              value={expectedGraduationYear}
              onChange={(event) => setExpectedGraduationYear(event.target.value)}
              error={Boolean(gradFormatError)}
              helperText={gradFormatError ?? undefined}
              fullWidth
            />
            <TextField
              name="degreeField"
              label="Degree field"
              defaultValue={values.degreeField}
              fullWidth
            />
          </Stack>
        </Section>

        {/* `edit-person-form.tsx`'s own "Restricted" grouping —
            `REQ-restricted-fields`: date of birth and the emergency contact
            are third-party / sensitive personal data, kept visually apart
            from the ordinary academic facts above. */}
        <Section title="Restricted">
          <Stack spacing={2}>
            <TextField
              name="dateOfBirth"
              label="Date of birth"
              type="date"
              defaultValue={values.dateOfBirth}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <Subsection title="Emergency contact">
              <Stack spacing={2}>
                <TextField
                  name="emergencyGivenName"
                  label="First name"
                  defaultValue={values.emergencyGivenName}
                  fullWidth
                />
                <TextField
                  name="emergencyFamilyName"
                  label="Last name"
                  defaultValue={values.emergencyFamilyName}
                  fullWidth
                />
                <TextField
                  name="emergencyRelationship"
                  label="Relationship"
                  defaultValue={values.emergencyRelationship}
                  fullWidth
                />
                <TextField
                  name="emergencyPhone"
                  label="Phone"
                  value={emergencyPhone}
                  onChange={(event) => setEmergencyPhone(event.target.value)}
                  error={Boolean(emergencyPhoneFormatError)}
                  helperText={emergencyPhoneFormatError ?? undefined}
                  fullWidth
                />
                <TextField
                  name="emergencyEmail"
                  label="Email"
                  value={emergencyEmail}
                  onChange={(event) => setEmergencyEmail(event.target.value)}
                  error={Boolean(emergencyEmailFormatError)}
                  helperText={emergencyEmailFormatError ?? undefined}
                  fullWidth
                />
              </Stack>
            </Subsection>
          </Stack>
        </Section>

        <Section title="How we may contact them">
          {/* V-10, correction round 2 — Brian's own authorised, scoped
              exception to the no-narrative-text rule: this surface, and
              only this surface, explains itself. */}
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2 }}
            data-testid="opt-in-explanation"
          >
            {RECRUITMENT_ADD_EXPLANATION}
          </Typography>
          <Stack spacing={2}>
            <TextField
              select
              name="optInEvidence"
              label={RECRUITMENT_ADD_OPT_IN_LABEL}
              defaultValue={values.optInEvidence}
              fullWidth
              data-testid="opt-in-evidence"
            >
              <MenuItem value="">
                <em>Not recorded</em>
              </MenuItem>
              {RECRUITMENT_ADD_OPT_IN_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              name="optInNote"
              label={RECRUITMENT_ADD_OPT_IN_NOTE_LABEL}
              defaultValue={values.optInNote}
              fullWidth
              multiline
              minRows={2}
              helperText={RECRUITMENT_ADD_OPT_IN_NOTE_HELPER}
              data-testid="opt-in-note"
            />
          </Stack>
        </Section>

        <Typography variant="body2" color="text.secondary">
          {seasonLabel}
        </Typography>
      </Stack>
    </Box>
  );
}

/**
 * V-3 / V-4, correction round 2 — the one screen "This is them" resolves to
 * for a current player: plain confirmation, no warning styling, a single
 * way back. Nothing here is a form; nothing here can write anything.
 */
function AlreadyMemberScreen({
  alreadyMember,
}: {
  alreadyMember: { displayName: string; membershipStatus: string; seasonLabel: string };
}) {
  const statusLabel =
    MEMBERSHIP_STATUS_LABELS[alreadyMember.membershipStatus as MembershipStatus] ??
    alreadyMember.membershipStatus;
  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }} data-testid="add-recruit-already-member">
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
        {`${alreadyMember.displayName} is already a member`}
      </Typography>
      <Paper variant="outlined" sx={{ p: 3 }}>
        <Typography color="text.secondary">
          {`They already hold a ${alreadyMember.seasonLabel} membership (${statusLabel}). A player is not a recruit, so no changes have been made.`}
        </Typography>
      </Paper>
      <Box>
        <Button
          href="/operate/recruitment"
          variant="contained"
          sx={{ minHeight: MIN_TOUCH_TARGET }}
          data-testid="add-recruit-already-member-back"
        >
          Back to recruitment
        </Button>
      </Box>
    </Stack>
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

/** `edit-person-form.tsx`'s own grouping shape, for the emergency contact's five fields inside "Restricted". */
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

/** "Player · Active · this season" / "Recruit · identified · this season" / "Past member · last played 2024-25" — `W8`. */
function identityLabel(candidate: AddRecruitCandidate): string | null {
  const identity = candidate.identity;
  if (identity.kind === "player") {
    return `Player · ${MEMBERSHIP_STATUS_LABELS[identity.membershipStatus as MembershipStatus] ?? identity.membershipStatus} · ${identity.seasonLabel}`;
  }
  if (identity.kind === "recruit") {
    return `Recruit · ${PROSPECT_STATUS_LABELS[identity.prospectStatus as ProspectStatus] ?? identity.prospectStatus} · ${identity.seasonLabel}`;
  }
  if (identity.kind === "past_member") {
    return `Past member · last played ${identity.lastSeasonLabel}`;
  }
  return null;
}

function CandidateRow({
  candidate,
  pending,
}: {
  candidate: AddRecruitCandidate;
  pending: boolean;
}) {
  const detail = [candidate.currentPhones[0] ?? null, candidate.currentEmails[0] ?? null]
    .filter(Boolean)
    .join(" · ");
  const identity = identityLabel(candidate);
  const isCurrentPlayer = candidate.identity.kind === "player";
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        justifyContent: "space-between",
        alignItems: { sm: "center" },
        py: 1.25,
        borderBottom: 1,
        borderColor: "divider",
        "&:last-child": { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontWeight: 700 }}>{candidate.displayName}</Typography>
        {identity ? (
          <Chip
            size="small"
            label={identity}
            color={isCurrentPlayer ? "success" : "default"}
            variant={isCurrentPlayer ? "filled" : "outlined"}
            sx={{ mt: 0.5, mr: 0.5 }}
            data-testid="candidate-identity"
          />
        ) : null}
        {detail ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {detail}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
          {candidate.matchedOn.map((field) => (
            <Chip
              key={field}
              size="small"
              color="warning"
              variant="outlined"
              label={`matched ${field}`}
            />
          ))}
        </Stack>
      </Box>
      <Button
        type="submit"
        name="linkPersonId"
        value={candidate.personId}
        variant="outlined"
        disabled={pending}
        sx={{ minHeight: MIN_TOUCH_TARGET, alignSelf: { xs: "flex-start", sm: "center" } }}
      >
        This is them
      </Button>
    </Stack>
  );
}
