"use client";

import { useEffect, useRef, useState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Surface } from "@/components/surface";
import Stack from "@mui/material/Stack";
import { Field, CheckField } from "@/components/field";
import { PhoneField } from "@/components/phone-field";
import { Section } from "@/components/section";
import Typography from "@mui/material/Typography";
import {
  validateAcademicYear,
  validateCollegeEmail,
  validateEmailAddress,
  validatePhoneNumber,
} from "@/lib/services/person-validation";

/**
 * The sign-up gate's one form — LAN-202. Two doors render this exact
 * component: `mode="anonymous"` (`/join/[code]`, the QR door — asks "have you
 * signed up before?" on a mobile match) and `mode="prefilled"`
 * (`/signup/[token]`, no duplicate question). Required: first name, last
 * name, mobile, college email, consent — enforced here (disabled `Save`,
 * standards rule 4) and authoritatively by `recruitment-signup.ts`'s
 * `validateSignupSubmission`. Format checks reuse `person-validation.ts`'s
 * server functions (findings 2, 3).
 */

export interface SignupFieldValues {
  readonly givenName: string;
  readonly familyName: string;
  readonly mobile: string;
  /** LAN-268, LAN-425. Required; an `ox.ac.uk` or `.edu`-style address. */
  readonly collegeEmail: string;
  readonly email: string;
  readonly knownAs: string;
  readonly college: string;
  readonly matriculationYear: string;
  readonly expectedGraduationYear: string;
  readonly degreeField: string;
}

export interface SignupOutcome {
  readonly ok: boolean;
  readonly message?: string;
}

export interface DuplicateCheckResult {
  /** Never a name, an email, a phone number, or a database identifier (LAN-208) — only whether one matched. */
  readonly found: boolean;
}

/** LAN-425. What the partial save's first write returned. `retry` says whether the page should try again on the next pause: not after a name-and-mobile match, which the real Save handles. */
export interface PartialSaveStart {
  /** Opaque, held in memory for this page load only; never a person id (LAN-208). */
  readonly token: string | null;
  readonly retry: boolean;
}

/** LAN-425 (Brian, 2026-09-25): one patch per five-second pause, never per keystroke. */
export const PARTIAL_SAVE_DELAY_MS = 5_000;

export interface SignupFormProps {
  readonly mode: "anonymous" | "prefilled";
  readonly initial: SignupFieldValues;
  /** Shown as a small banner above the heading on the prefilled door only. */
  readonly personLabel?: string | null;
  /** `null` until Brian configures the real WhatsApp group — see recruitment-config.ts. */
  readonly groupLink: string | null;
  /** Anonymous door only — never called for `mode="prefilled"`, which has nothing to ask. */
  readonly checkDuplicate?: (givenName: string, mobile: string) => Promise<DuplicateCheckResult>;
  /** Anonymous door only (LAN-425). First write once both names are present; the page never hears about a failure. */
  readonly startPartial?: (values: SignupFieldValues) => Promise<PartialSaveStart>;
  /** Anonymous door only (LAN-425). Everything typed so far, on the record `token` names. */
  readonly patchPartial?: (token: string, values: SignupFieldValues) => Promise<void>;
  /** A bare boolean, never a person id (LAN-208) — the server re-derives who from the typed name and mobile. `partialToken` is the partial save's own credential when this page load made one. */
  readonly submit: (
    values: SignupFieldValues & {
      consent: boolean;
      confirmedExistingMatch: boolean;
      partialToken: string | null;
    },
  ) => Promise<SignupOutcome>;
}

type Step = "form" | "already" | "saved";

const EMPTY_ALIAS: SignupFieldValues = {
  givenName: "",
  familyName: "",
  mobile: "",
  collegeEmail: "",
  email: "",
  knownAs: "",
  college: "",
  matriculationYear: "",
  expectedGraduationYear: "",
  degreeField: "",
};

export default function SignupForm({
  mode,
  initial,
  personLabel,
  groupLink,
  checkDuplicate,
  startPartial,
  patchPartial,
  submit,
}: SignupFormProps) {
  const [step, setStep] = useState<Step>("form");
  const [values, setValues] = useState<SignupFieldValues>(initial);
  const [consent, setConsent] = useState(false);

  // LAN-425 — the partial save. Refs, not state: nothing here renders. One
  // write in flight at a time, and every write carries all fields, so a
  // slow patch can never overwrite a faster later one and a dropped patch is
  // healed by the next. `latest` is what the next write sends; `dirty` says a
  // change arrived while one was in flight.
  const partialToken = useRef<string | null>(null);
  const partialStopped = useRef(false);
  const partialInFlight = useRef<Promise<void> | null>(null);
  const partialDirty = useRef(false);
  const latest = useRef(values);
  latest.current = values;

  function flushPartial(): Promise<void> {
    if (!startPartial || !patchPartial || partialStopped.current) return Promise.resolve();
    if (partialInFlight.current) {
      partialDirty.current = true;
      return partialInFlight.current;
    }
    const run = (async () => {
      const snapshot = latest.current;
      try {
        if (partialToken.current) {
          await patchPartial(partialToken.current, snapshot);
        } else {
          const started = await startPartial(snapshot);
          if (started.token) partialToken.current = started.token;
          else if (!started.retry) partialStopped.current = true;
        }
      } catch {
        // Best effort by design: the visitor's own Save is what matters.
      }
    })().finally(() => {
      partialInFlight.current = null;
      if (partialDirty.current) {
        partialDirty.current = false;
        void flushPartial();
      }
    });
    partialInFlight.current = run;
    return run;
  }

  // The timer calls through a ref so the effect re-arms on a change to
  // `values` and nothing else; `flushPartial` closes over props that are
  // stable in practice but new on every render.
  const flushRef = useRef(flushPartial);
  flushRef.current = flushPartial;
  const partialEnabled = mode === "anonymous" && Boolean(startPartial) && Boolean(patchPartial);
  const bothNamesPresent = values.givenName.trim() !== "" && values.familyName.trim() !== "";
  useEffect(() => {
    if (!partialEnabled || step !== "form" || !bothNamesPresent) return;
    const handle = setTimeout(() => void flushRef.current(), PARTIAL_SAVE_DELAY_MS);
    return () => clearTimeout(handle);
    // `values` is the trigger: any change restarts the pause.
  }, [values, step, partialEnabled, bothNamesPresent]);
  // LAN-389. Every other phone entry point is an HTML form, and the control
  // refuses the submit event itself; this one saves from a button's onClick,
  // so the same refusal arrives here as a reason Save stays disabled.
  const [mobileUnconfirmed, setMobileUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function field(name: keyof SignupFieldValues) {
    return {
      value: values[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        setValues((current) => ({ ...current, [name]: event.target.value }));
      },
    };
  }

  const nameMissing = values.givenName.trim() === "" || values.familyName.trim() === "";
  const mobileMissing = values.mobile.trim() === "";
  const collegeEmailMissing = values.collegeEmail.trim() === "";

  // Same person-validation.ts functions the server repeats (finding 2, finding 3).
  const mobileValidation = values.mobile.trim() === "" ? null : validatePhoneNumber(values.mobile);
  const mobileError = mobileMissing
    ? null // "required" is covered by disabledReason below, not a red field error on an empty required field nobody has failed to fill in yet.
    : mobileValidation && !mobileValidation.valid
      ? mobileValidation.message
      : null;

  const emailValidation = values.email.trim() === "" ? null : validateEmailAddress(values.email);
  const emailError = emailValidation && !emailValidation.valid ? emailValidation.message : null;

  // LAN-268: same `validateCollegeEmail` the server repeats.
  const collegeEmailValidation = collegeEmailMissing
    ? null
    : validateCollegeEmail(values.collegeEmail);
  const collegeEmailError =
    collegeEmailValidation && !collegeEmailValidation.valid ? collegeEmailValidation.message : null;

  const matriculationValidation =
    values.matriculationYear.trim() === ""
      ? null
      : validateAcademicYear(values.matriculationYear, "Matriculation year");
  const matriculationError =
    matriculationValidation && !matriculationValidation.valid
      ? matriculationValidation.message
      : null;

  const graduationValidation =
    values.expectedGraduationYear.trim() === ""
      ? null
      : validateAcademicYear(values.expectedGraduationYear, "Expected graduation");
  const graduationError =
    graduationValidation && !graduationValidation.valid ? graduationValidation.message : null;

  const requiredMissing = nameMissing || mobileMissing || collegeEmailMissing;
  const formatInvalid = Boolean(
    mobileError || emailError || collegeEmailError || matriculationError || graduationError,
  );
  const ready = !requiredMissing && !formatInvalid && !mobileUnconfirmed && consent;
  const REQUIRED_FOUR = "a first name, a last name, a mobile number and your university email";
  const disabledReason =
    formatInvalid || mobileUnconfirmed
      ? "Correct the field marked in red to enable this."
      : requiredMissing && !consent
        ? `Enter ${REQUIRED_FOUR}, and tick the box below, to enable this.`
        : requiredMissing
          ? `Enter ${REQUIRED_FOUR} to enable this.`
          : "Tick the box below to enable this.";

  async function doSubmit(confirmedExistingMatch: boolean) {
    setBusy(true);
    setError(null);
    try {
      // A patch still in flight lands first, so Save never races its own partial.
      if (partialInFlight.current) await partialInFlight.current;
      const outcome = await submit({
        ...values,
        consent,
        confirmedExistingMatch,
        partialToken: partialToken.current,
      });
      if (outcome.ok) {
        setStep("saved");
      } else {
        setError(outcome.message ?? "That could not be saved. Try again.");
        setStep("form");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handlePrimarySave() {
    if (!ready || busy) return;
    // With a partial on file the probe would find the visitor's own record (LAN-425).
    if (partialInFlight.current) await partialInFlight.current;
    if (
      mode === "anonymous" &&
      checkDuplicate &&
      !partialToken.current &&
      values.mobile.trim() !== ""
    ) {
      setBusy(true);
      setError(null);
      try {
        const probe = await checkDuplicate(values.givenName, values.mobile);
        if (probe.found) {
          setStep("already");
          return;
        }
      } finally {
        setBusy(false);
      }
    }
    await doSubmit(false);
  }

  if (step === "already") {
    const digits = values.mobile.replace(/\D/g, "");
    return (
      <Surface>
        <Stack spacing={3}>
          <Box>
            <PageHeader title="Have you signed up with us before?" />
            <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
              We may already have you. If that is you, we will not add you twice — you will go
              straight to the group.
            </Typography>
          </Box>

          <Section title="We found">
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {`${values.givenName.trim() || "Somebody"}, mobile ending ${digits.slice(-3) || "—"}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Only what you have already typed is shown back to you.
            </Typography>
          </Section>

          {error ? <Notice severity="error">{error}</Notice> : null}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Button
              variant="contained"
              disabled={busy}
              onClick={() => doSubmit(true)}
              sx={{ minHeight: 48, flex: 1 }}
            >
              Yes, that&rsquo;s me
            </Button>
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => doSubmit(false)}
              sx={{ minHeight: 48, flex: 1 }}
            >
              No, I&rsquo;m new
            </Button>
          </Stack>
        </Stack>
      </Surface>
    );
  }

  if (step === "saved") {
    return (
      <Surface>
        <Stack spacing={3}>
          <Box>
            <PageHeader
              title={`You're in${values.givenName.trim() ? `, ${values.givenName.trim()}` : ""}`}
            />
            <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
              Last thing — join the WhatsApp group. That is where the club says when and where the
              next session is.
            </Typography>
          </Box>

          {groupLink ? (
            <Button variant="contained" sx={{ minHeight: 48 }} href={groupLink}>
              Join the WhatsApp group
            </Button>
          ) : (
            <Notice severity="info">
              The group link is not live yet. Ask anybody at the club.
            </Notice>
          )}

          <Notice severity="success" title="Consent recorded.">
            You can stop it at any time from the link at the foot of any message we send. We will
            ask you again next season.
          </Notice>
        </Stack>
      </Surface>
    );
  }

  return (
    <Surface>
      <Stack spacing={3}>
        {mode === "prefilled" && personLabel ? (
          <Typography
            sx={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "primary.main" }}
          >
            {personLabel}
          </Typography>
        ) : null}

        <Box>
          <PageHeader title="Join the Oxford Lancers" />
          <Typography sx={{ fontSize: 15, color: "text.secondary", mt: 1 }}>
            {mode === "anonymous"
              ? "Leave your name and a way to reach you. We will send you a WhatsApp message about the next session."
              : "We already have most of this. Check it, change anything that is wrong, and tell us how we may contact you."}
          </Typography>
          <Typography sx={{ fontSize: 15, fontWeight: 600, mt: 1.5 }}>
            Your name, your mobile number, your university email and the tick below are needed. The
            rest can wait.
          </Typography>
        </Box>

        {error ? <Notice severity="error">{error}</Notice> : null}

        <Field label="First name" required {...field("givenName")} />
        <Field label="Last name" required {...field("familyName")} />
        <PhoneField
          name="mobile"
          label="Mobile number"
          required
          defaultValue={initial.mobile}
          error={Boolean(mobileError)}
          helperText={mobileError ?? "How the club will message you about sessions."}
          onValueChange={(joined) => {
            setError(null);
            setValues((current) => ({ ...current, mobile: joined }));
          }}
          onMismatchChange={setMobileUnconfirmed}
        />
        <Field
          label="College email"
          required
          error={Boolean(collegeEmailError)}
          helperText={collegeEmailError ?? "Your university address — it ends in ox.ac.uk or .edu."}
          {...field("collegeEmail")}
        />
        <Field
          label="Email address"

          error={Boolean(emailError)}
          helperText={emailError ?? "A personal address, if you would rather the club used one."}
          {...field("email")}
        />
        <Field
          label="Known as"

          helperText="Only if it differs from your first name. It becomes an alias, so the club can find you by it."
          {...field("knownAs")}
        />
        <Field label="College" {...field("college")} />
        <Field
          label="Matriculation year"

          error={Boolean(matriculationError)}
          helperText={matriculationError ?? "The year you started at Oxford."}
          {...field("matriculationYear")}
        />
        <Field
          label="Expected graduation"

          error={Boolean(graduationError)}
          helperText={graduationError ?? undefined}
          {...field("expectedGraduationYear")}
        />
        <Field label="Degree" {...field("degreeField")} />

        <CheckField
          name="consent"
          checked={consent}
          onChange={(next) => {
            setError(null);
            setConsent(next);
          }}
          label={
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                The Oxford Lancers may message me on WhatsApp about this season.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Session invitations and the odd polite reminder. Never more than one reminder, never
                a chase, and you can stop it at any time from a link in any message. We will ask you
                again next season.
              </Typography>
            </Box>
          }
        />

        <ActionBar
          primary={
            <Button variant="contained" disabled={!ready || busy} onClick={handlePrimarySave}>
              {mode === "anonymous" ? "Sign me up" : "Save my details"}
            </Button>
          }
          note={!ready ? disabledReason : undefined}
        />
      </Stack>
    </Surface>
  );
}

export { EMPTY_ALIAS };
