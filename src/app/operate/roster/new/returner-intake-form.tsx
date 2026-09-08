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
import { Field as InputField } from "@/components/field";
import Typography from "@mui/material/Typography";

import type { PersonCandidate } from "@/lib/services/roster";
import { submitReturnerIntake } from "./actions";
import { INITIAL_INTAKE_STATE, type IntakeState } from "./intake-state";
import { firstInvalidField, type IntakeFormValues } from "./validation";

/**
 * UX-10, UX-11 and UX-12 — one form, three steps, one server action.
 *
 * ## Why the steps share a form rather than a route each
 *
 * All three are `/operate/roster/new` in the approved screen registry, and the
 * reason is the promise UX-10 makes in its own body text: *no person or
 * membership is created until a candidate is selected or the operator
 * explicitly confirms this is a new person*. Keeping the operator's five typed
 * values in the form — as fields on step one, as hidden inputs afterwards —
 * is what lets the duplicate check happen between typing and writing without
 * anything being persisted in between, and without a draft record existing
 * anywhere to be cleaned up later.
 *
 * It also means the browser's Back button, a refresh, and a failed submission
 * all behave: there is no half-finished row on the server to reconcile with.
 *
 * ## Touch targets and focus
 *
 * Actions carry a 44px minimum height because this is explicitly a
 * phone-first surface, and the validation path moves focus to the first invalid
 * control, which the shared state contract requires. Neither is decoration:
 * an operator entering a returner is standing on a touchline.
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
// UX-10 — Add player
//
// Brian, on the running screen: the intake heading reads "Add player" too.
// That supersedes the earlier instruction to leave UX-10 alone. The workflow
// underneath is unchanged — this still enters a returning player, still fixes
// Returning, and still dedupes before writing; only the words changed.
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

  return (
    <Stack spacing={3}>
      <PageHeader title="Add player" back={{ href: "/operate/roster", label: "Back to roster" }} />

      {state.formError ? <Notice severity="error">{state.formError}</Notice> : null}

      {/* Four fields, in this order, and no others. All four departures from
          the approved wireframe are Brian's, taken while reviewing this screen
          on 12 August 2026:
            * "First name" / "Last name" rather than "Given name" / "Family
              name" — the club's words. The columns keep the model's names;
              this is presentation only and the two must not be conflated.
            * first name before last name, because that is the order a person
              says them in.
            * no "Known as" — "not a good way to talk about it". The service
              still accepts one for imports; this form never sends it.
            * no "Entry marker: Returning (fixed)" chip — it named an internal
              value the operator cannot change and could not interpret. The
              entry is still recorded as `returning`, and the confirmation
              screen states it in words. */}
      <Stack spacing={2.5}>
        {field("givenName", "First name", { autoComplete: "off" })}
        {field("familyName", "Last name", { autoComplete: "off" })}
        {field("email", "Email", { type: "email", autoComplete: "off" })}
        {field("phone", "Phone", { type: "tel", autoComplete: "off" })}
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
 * One candidate.
 *
 * The desktop wireframe is a table with Person, Known as, Email, Phone and
 * Current season columns; the phone wireframe shows a card. This is one
 * component that lays out as columns from `md` and stacks below it, rather than
 * two renderings of the same data, because the shared contract forbids
 * responsive reflow that *removes* information — and the current-season
 * membership is the single most important thing here. It is what decides
 * whether selecting this person will be refused, so it is never the field that
 * gets dropped to make a phone layout fit.
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
