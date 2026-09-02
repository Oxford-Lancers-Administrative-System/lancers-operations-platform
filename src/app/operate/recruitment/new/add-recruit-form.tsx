"use client";

import { useActionState } from "react";
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
  PROSPECT_STATUS_LABELS,
  RECRUITMENT_ADD_OPT_IN_OPTIONS,
  type ProspectStatus,
} from "@/lib/services/recruitment-vocabulary";
import type { MembershipStatus } from "@/lib/services/membership";
import { submitAddRecruit } from "./actions";
import { INITIAL_ADD_RECRUIT_STATE, type AddRecruitCandidate } from "./create-state";

const MIN_TOUCH_TARGET = 44;

/**
 * `W6` — add a recruit by hand, with `W8`'s duplicate check inside it.
 * LAN-206. `/operate/people/new/create-person-form.tsx`, cloned wholesale
 * for its four fields and its check-then-create flow, plus the Academic
 * section `W6-01` adds and the answer position `W6-02`/`W8-01` fix: the
 * check's own answer renders above the form, never below it — "the
 * duplicate check if it finds something needs to go at the top, not the
 * bottom" (Brian, 2026-09-01).
 */
export default function AddRecruitForm({ seasonLabel }: { seasonLabel: string }) {
  const [state, formAction, pending] = useActionState(submitAddRecruit, INITIAL_ADD_RECRUIT_STATE);
  const { values, errors, candidates, exactMatch } = state;

  const requiredCount = Object.keys(errors).length;
  const primaryLabel = exactMatch
    ? "Create anyway"
    : candidates !== null
      ? `Create ${values.givenName || "recruit"}${values.familyName ? ` ${values.familyName}` : ""}`
      : "Check for duplicates";

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
              value={exactMatch ? "create" : candidates !== null ? "create" : "check"}
              variant="contained"
              disabled={pending}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
              data-testid="add-recruit-primary"
            >
              {primaryLabel}
            </Button>
          </Stack>
        </Stack>

        {state.formError ? <Alert severity="warning">{state.formError}</Alert> : null}

        {candidates !== null ? (
          <Section title={candidates.length > 0 ? "Already in the club" : "Duplicate check"}>
            <Typography
              color="text.secondary"
              sx={{ mb: candidates.length > 0 ? 1.5 : 0 }}
              data-testid="candidate-count"
            >
              {candidates.length === 0
                ? "No existing person matches the supplied names or contact details."
                : `${candidates.length} ${candidates.length === 1 ? "person matches" : "people match"} the supplied names or contact details.`}
            </Typography>
            {candidates.length > 0 ? (
              <Stack spacing={1}>
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
              defaultValue={values.mobile}
              error={Boolean(errors.mobile)}
              helperText={errors.mobile}
              fullWidth
            />
            <TextField
              name="personalEmail"
              label="Personal email"
              defaultValue={values.personalEmail}
              error={Boolean(errors.personalEmail)}
              helperText={errors.personalEmail}
              fullWidth
            />
          </Stack>
        </Section>

        <Section title="Academic">
          <Stack spacing={2}>
            <TextField name="college" label="College" defaultValue={values.college} fullWidth />
            <TextField
              name="matriculationYear"
              label="Matriculation year"
              defaultValue={values.matriculationYear}
              fullWidth
            />
            <TextField
              select
              name="optInEvidence"
              label="How we came by this number"
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
          </Stack>
        </Section>

        <Typography variant="body2" color="text.secondary">
          {seasonLabel}
        </Typography>
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
