"use client";

import { useActionState, useEffect, useRef } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import { Refusal } from "@/components/refusal";
import { Fact } from "@/components/fact";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { StatusChip } from "@/components/status-chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import { Surface } from "@/components/surface";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import { Field as InputField, NO_AUTOFILL } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import Typography from "@mui/material/Typography";

import type { PersonCandidate } from "@/lib/services/roster";
import { submitReturnerIntake } from "./actions";
import { INITIAL_INTAKE_STATE, type IntakeState } from "./intake-state";
import { firstInvalidField, type IntakeFormValues } from "./validation";

/**
 * UX-10, UX-11 and UX-12 — one form, three steps, one server action.
 * All three share the form (not a route each) so the operator's typed
 * values persist between the duplicate check and the write — UX-10's
 * promise that nothing is created until a candidate is picked or the
 * operator confirms a new person. 44px touch targets: phone-first surface.
 */

const MIN_TOUCH_TARGET = 44;

export default function ReturnerIntakeForm() {
  const [state, formAction, pending] = useActionState(submitReturnerIntake, INITIAL_INTAKE_STATE);

  return (
    <Box component="form" action={formAction} sx={{ maxWidth: 880 }}>
      {state.step === "details" ? (
        <DetailsStep state={state} pending={pending} />
      ) : state.step === "candidates" ? (
        <CandidatesStep state={state} pending={pending} />
      ) : (
        <MembershipRefusedStep state={state} pending={pending} />
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// UX-10 — Add player.
// ---------------------------------------------------------------------------

function DetailsStep({
  state,
  pending,
}: {
  state: Extract<IntakeState, { step: "details" }>;
  pending: boolean;
}) {
  const { values, errors } = state;
  const firstInvalid = firstInvalidField(errors);
  const focusTarget = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    focusTarget.current?.focus();
  }, [firstInvalid]);

  const field = (
    name: keyof IntakeFormValues,
    label: string,
    extra: { type?: string; autoComplete?: string } = {},
  ) => (
    <InputField
      name={name}
      label={label}
      defaultValue={values[name]}
      error={Boolean(errors[name])}
      helperText={errors[name]}
      inputRef={firstInvalid === name ? focusTarget : undefined}
      {...extra}
    />
  );

  /** LAN-211. The same slot, the shared two-part control. */
  const phoneField = (name: keyof IntakeFormValues, label: string) => (
    <PhoneField
      name={name}
      label={label}
      defaultValue={values[name]}
      error={Boolean(errors[name])}
      helperText={errors[name]}
    />
  );

  return (
    <Stack spacing={3}>
      <PageHeader title="Add player" back={{ href: "/operate/roster", label: "Back to roster" }} />

      {state.formError ? <Notice severity="error">{state.formError}</Notice> : null}

      {/* Four fields, in this order, no others — Brian's departures from the wireframe, 12 August 2026. */}
      <Stack spacing={2.5}>
        {/* LAN-324: the player's details, not the operator's own — and `"off"` is the value Chrome ignores. */}
        {field("givenName", "First name", { autoComplete: NO_AUTOFILL })}
        {field("familyName", "Last name", { autoComplete: NO_AUTOFILL })}
        {field("email", "Email", { type: "email", autoComplete: NO_AUTOFILL })}
        {phoneField("phone", "Phone")}
      </Stack>

      <ActionBar
        primary={
          <Button
            type="submit"
            name="intent"
            value="check"
            variant="contained"
            disabled={pending}
            sx={{ minHeight: MIN_TOUCH_TARGET }}
          >
            {pending ? "Checking…" : "Check for matches"}
          </Button>
        }
        cancel={
          <Button href="/operate/roster" variant="outlined" sx={{ minHeight: MIN_TOUCH_TARGET }}>
            Cancel
          </Button>
        }
      />
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// UX-11 — Review possible matches
// ---------------------------------------------------------------------------

/** Carries the operator's typed values through the steps that do not show them. */
function HiddenValues({ values }: { values: IntakeFormValues }) {
  return (
    <>
      {(Object.keys(values) as (keyof IntakeFormValues)[]).map((name) => (
        <input key={name} type="hidden" name={name} value={values[name]} />
      ))}
    </>
  );
}

function CandidatesStep({
  state,
  pending,
}: {
  state: Extract<IntakeState, { step: "candidates" }>;
  pending: boolean;
}) {
  const { candidates, values } = state;
  const none = candidates.length === 0;

  return (
    <Stack spacing={3}>
      <HiddenValues values={values} />

      <PageHeader
        title="Review possible matches"
        back={{ href: "/operate/roster", label: "Back to roster" }}
        subtitle={
          <Typography component="span" variant="body2" data-testid="candidate-count">
            {none
              ? "No existing person matches the supplied names or contact details."
              : `${candidates.length} ${candidates.length === 1 ? "person matches" : "people match"} the supplied names or contact details.`}
          </Typography>
        }
      />

      {state.formError ? <Notice severity="error">{state.formError}</Notice> : null}

      {none ? null : (
        <FormControl component="fieldset" sx={{ width: "100%" }}>
          <FormLabel component="legend" sx={{ mb: 1 }}>
            Select the person this is, if one of these is them
          </FormLabel>
          <RadioGroup name="personId">
            <Stack spacing={1.5}>
              {candidates.map((candidate) => (
                <CandidateRow key={candidate.personId} candidate={candidate} />
              ))}
            </Stack>
          </RadioGroup>
        </FormControl>
      )}

      <ActionBar
        primary={
          none ? (
            <Button
              type="submit"
              name="intent"
              value="confirm_new"
              variant={none ? "contained" : "outlined"}
              disabled={pending}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
            >
              Confirm this is a new person
            </Button>
          ) : (
            <>
              {none ? null : (
                <Button
                  type="submit"
                  name="intent"
                  value="use_existing"
                  variant="contained"
                  disabled={pending}
                  sx={{ minHeight: MIN_TOUCH_TARGET }}
                >
                  Use selected person
                </Button>
              )}
            </>
          )
        }
        secondary={
          none ? undefined : (
            <Button
              type="submit"
              name="intent"
              value="confirm_new"
              variant={none ? "contained" : "outlined"}
              disabled={pending}
              sx={{ minHeight: MIN_TOUCH_TARGET }}
            >
              Confirm this is a new person
            </Button>
          )
        }
        cancel={
          <Button
            type="submit"
            name="intent"
            value="back_to_details"
            variant="text"
            disabled={pending}
            sx={{ minHeight: MIN_TOUCH_TARGET }}
          >
            Back to details
          </Button>
        }
      />
    </Stack>
  );
}

/**
 * One candidate. Desktop table / phone card in one component (`md` reflow,
 * not two renderings) — the shared contract forbids reflow that removes
 * information, and current-season membership decides whether selecting
 * this person is refused, so it is never the field dropped for phone.
 */
function CandidateRow({ candidate }: { candidate: PersonCandidate }) {
  const name = candidate.familyName
    ? `${candidate.givenName} ${candidate.familyName}`
    : candidate.givenName;

  return (
    <Surface testId="candidate">
      <FormControlLabel
        value={candidate.personId}
        control={
          <Radio
            sx={{
              alignSelf: "flex-start",
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
            }}
          />
        }
        sx={{ alignItems: "flex-start", m: 0, width: "100%" }}
        label={
          <Box
            sx={{
              display: "grid",
              gap: { xs: 0.5, md: 2 },
              gridTemplateColumns: { xs: "1fr", md: "1.4fr 0.8fr 1.6fr 1.2fr 1fr" },
              alignItems: { md: "baseline" },
              width: "100%",
              py: 0.5,
            }}
          >
            <Typography sx={{ fontWeight: 600 }}>
              {name}
              {candidate.familyName ? null : (
                <Typography component="span" variant="body2" color="text.secondary">
                  {" "}
                  (no family name on record)
                </Typography>
              )}
            </Typography>
            <Fact label="Known as" value={candidate.displayAlias} />
            <Fact label="Email" value={candidate.email} />
            <Fact label="Phone" value={candidate.phone} />
            <Box>
              <Typography variant="overline" component="p">
                Current season
              </Typography>
              {candidate.currentMembership ? (
                <StatusChip
                  domain="membership"
                  status={candidate.currentMembership.status}
                  label={`Already a member (${candidate.currentMembership.status})`}
                  testId="candidate-has-membership"
                />
              ) : (
                <Typography variant="body2">No membership</Typography>
              )}
            </Box>
            <Box sx={{ gridColumn: { md: "1 / -1" } }}>
              <Typography variant="caption" color="text.secondary">
                Matched on {candidate.matchedOn.join(", ")}
              </Typography>
            </Box>
          </Box>
        }
      />
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// UX-12 — This person already has a current-season membership
// ---------------------------------------------------------------------------

function MembershipRefusedStep({
  state,
  pending,
}: {
  state: Extract<IntakeState, { step: "membership_refused" }>;
  pending: boolean;
}) {
  const { refusal, values } = state;

  return (
    <Stack spacing={3}>
      <HiddenValues values={values} />

      <Refusal
        title="This person already has a current-season membership"
        testId="refusal-message"
        message={
          refusal.seasonLabel
            ? `${refusal.personName} is already a member for the ${refusal.seasonLabel} season. No duplicate membership was created.`
            : refusal.message
        }
        action={
          refusal.membershipId ? (
            <Button
              href={`/operate/roster/${refusal.membershipId}`}
              variant="contained"
              sx={{ minHeight: MIN_TOUCH_TARGET }}
            >
              View {refusal.personGivenName}&rsquo;s roster entry
            </Button>
          ) : undefined
        }
        secondary={
          <Button
            type="submit"
            name="intent"
            value="back_to_candidates"
            variant="outlined"
            disabled={pending}
            sx={{ minHeight: MIN_TOUCH_TARGET }}
          >
            Go back
          </Button>
        }
      />
    </Stack>
  );
}
