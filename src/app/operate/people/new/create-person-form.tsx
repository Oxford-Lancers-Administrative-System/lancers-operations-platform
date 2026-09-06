"use client";

import { useActionState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { Section } from "@/components/section";
import { ActionBar } from "@/components/action-bar";
import { RowCard, RowCardList } from "@/components/row-card";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { Field } from "@/components/field";
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
        <PageHeader
          title="Add a person"
          back={{ href: "/operate/people", label: "Back to people" }}
        />
        {requiredCount > 0 ? (
          <Typography variant="body2" color="error">
            {requiredCount} required field{requiredCount === 1 ? "" : "s"}
          </Typography>
        ) : null}

        {state.formError ? <Notice severity="warning">{state.formError}</Notice> : null}

        {/* B4, LAN-185 correction round 2 (Brian's walk): the duplicate check
            must answer even when it finds nothing — a silent no-match reads
            as though the check never ran. Matches the count sentence
            `returner-intake-form.tsx`'s `CandidatesStep` already uses for the
            same check elsewhere in the application, rather than inventing a
            second shape. */}
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
              <RowCardList at="all">
                {candidates.map((candidate) => (
                  <CandidateRow key={candidate.personId} candidate={candidate} pending={pending} />
                ))}
              </RowCardList>
            ) : null}
          </Section>
        ) : null}

        {exactMatch ? (
          <Section title="Why this is a different person">
            <Field
              name="overrideReason"
              label="Reason"
              autoFocus
              error={Boolean(state.reasonError)}
              helperText={state.reasonError}
            />
          </Section>
        ) : null}

        <Section title="Who they are">
          <Stack spacing={2}>
            <Field
              name="givenName"
              label="First name"
              required
              defaultValue={values.givenName}
              error={Boolean(errors.givenName)}
              helperText={errors.givenName}
              autoFocus={!errors.givenName}
            />
            <Field
              name="familyName"
              label="Last name"
              required
              defaultValue={values.familyName}
              error={Boolean(errors.familyName)}
              helperText={errors.familyName}
            />
            <Field
              name="mobile"
              label="Mobile phone"
              defaultValue={values.mobile}
              error={Boolean(errors.mobile)}
              helperText={errors.mobile}
            />
            <Field
              name="personalEmail"
              label="Personal email"
              defaultValue={values.personalEmail}
              error={Boolean(errors.personalEmail)}
              helperText={errors.personalEmail}
            />
          </Stack>
        </Section>
        <ActionBar
          primary={
            <Button
              type="submit"
              name="intent"
              value={exactMatch ? "create" : candidates !== null ? "create" : "check"}
              variant="contained"
              disabled={pending}
            >
              {primaryLabel}
            </Button>
          }
          cancel={<Button href="/operate/people">Cancel</Button>}
        />
      </Stack>
    </Box>
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
    <RowCard
      title={candidate.displayName}
      sublines={[
        ...(detail ? [detail] : []),
        candidate.matchedOn.map((field) => `matched ${field}`).join(" · "),
      ]}
      actions={
        <Button
          type="submit"
          name="linkPersonId"
          value={candidate.personId}
          variant="outlined"
          disabled={pending}
          sx={{ minHeight: MIN_TOUCH_TARGET }}
        >
          This is them
        </Button>
      }
    />
  );
}
