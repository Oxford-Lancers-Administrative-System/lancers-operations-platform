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

import type { PersonDuplicateCandidate } from "@/lib/services/person-duplicate";
import { submitCreatePerson } from "./actions";
import { INITIAL_CREATE_STATE } from "./create-state";

const MIN_TOUCH_TARGET = 44;

/**
 * W3-01 … W3-07 — one page, three stages driven by one state, the same shape
 * `ReturnerIntakeForm` uses: nothing is written until the operator answers
 * the duplicate check, and the form stays on screen below whatever the check
 * found rather than becoming a second surface.
 */
export default function CreatePersonForm() {
  const [state, formAction, pending] = useActionState(submitCreatePerson, INITIAL_CREATE_STATE);
  const { values, errors, candidates, exactMatch } = state;

  const requiredCount = Object.keys(errors).length;
  const primaryLabel = exactMatch
    ? "Create anyway"
    : candidates !== null
      ? `Create ${values.givenName || "person"}${values.familyName ? ` ${values.familyName}` : ""}`
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
              <Button href="/operate/people" sx={{ p: 0, minHeight: 0, textTransform: "none" }}>
                ← People
              </Button>
            </Typography>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mt: 0.5 }}>
              Add a person
            </Typography>
            {requiredCount > 0 ? (
              <Typography variant="body2" color="error" sx={{ mt: 0.5 }}>
                {requiredCount} required field{requiredCount === 1 ? "" : "s"}
              </Typography>
            ) : null}
          </Box>
          <Stack direction="row" spacing={2}>
            <Button
              href="/operate/people"
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
            >
              {primaryLabel}
            </Button>
          </Stack>
        </Stack>

        {state.formError ? <Alert severity="warning">{state.formError}</Alert> : null}

        {candidates && candidates.length > 0 ? (
          <Section title="Already in the club">
            <Stack spacing={0}>
              {candidates.map((candidate) => (
                <CandidateRow key={candidate.personId} candidate={candidate} pending={pending} />
              ))}
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

function CandidateRow({
  candidate,
  pending,
}: {
  candidate: PersonDuplicateCandidate;
  pending: boolean;
}) {
  const detail = [candidate.currentPhones[0] ?? null, candidate.currentEmails[0] ?? null]
    .filter(Boolean)
    .join(" · ");
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
        {detail ? (
          <Typography variant="body2" color="text.secondary">
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
