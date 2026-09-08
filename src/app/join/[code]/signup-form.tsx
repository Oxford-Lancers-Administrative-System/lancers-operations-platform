"use client";

import { useState } from "react";
import { Notice } from "@/components/notice";
import { PageHeader } from "@/components/page-header";
import { ActionBar } from "@/components/action-bar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { Surface } from "@/components/surface";
import Stack from "@mui/material/Stack";
import { Field, CheckField } from "@/components/field";
import { Section } from "@/components/section";
import Typography from "@mui/material/Typography";
import {
  validateAcademicYear,
  validateEmailAddress,
  validatePhoneNumber,
} from "@/lib/services/person-validation";

/**
 * The sign-up gate's one form — LAN-202. **The single consent gate**, and the
 * same surface as Questionnaire A, reached by two doors that render this exact
 * component:
 *
 *   - `mode="anonymous"` — `/join/[code]`, the QR door. Nothing is prefilled,
 *     and a mobile-matched submission is asked "have you signed up before?"
 *     ahead of writing anything (`W7`).
 *   - `mode="prefilled"` — `/me/join/[token]`, the tokenised door. Every field
 *     starts filled in, and there is no duplicate question at all, "because
 *     there is nothing to ask" (`W7`).
 *
 * First name, last name, mobile and the consent tick are the required fields
 * — superseded, Brian, 2026-09-01: "Mobile is required no matter what…
 * Missing never blocks except for phone… Nothing else works if we don't have
 * a phone number." Enforced here for the disabled `Save` button (standards
 * rule 4, "a disabled control says what would enable it") and, independently
 * and authoritatively, by `recruitment-signup.ts`'s `validateSignupSubmission`
 * — this component never talks to the service layer directly; every write
 * goes through the `submit` prop, a server action the page supplies.
 *
 * Mobile, email, matriculation year and expected graduation are all
 * validated inline with the same `person-validation.ts` functions the
 * server repeats (finding 2, finding 3) — one shared standard, checked
 * twice, never two different rules for the same field.
 */

export interface SignupFieldValues {
  readonly givenName: string;
  readonly familyName: string;
  readonly mobile: string;
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

export interface SignupFormProps {
  readonly mode: "anonymous" | "prefilled";
  readonly initial: SignupFieldValues;
  /** Shown as a small banner above the heading on the prefilled door only. */
  readonly personLabel?: string | null;
  /** `null` until Brian configures the real WhatsApp group — see recruitment-config.ts. */
  readonly groupLink: string | null;
  /** Anonymous door only — never called for `mode="prefilled"`, which has nothing to ask. */
  readonly checkDuplicate?: (givenName: string, mobile: string) => Promise<DuplicateCheckResult>;
  /**
   * `confirmedExistingMatch` is a bare boolean — "the recruit pressed 'Yes,
   * that's me'" — never a person id: `checkDuplicate`'s own result carries
   * none to echo back (LAN-208). The server re-derives who that is, from the
   * same name and mobile the recruit has typed at submit time.
   */
  readonly submit: (
    values: SignupFieldValues & { consent: boolean; confirmedExistingMatch: boolean },
  ) => Promise<SignupOutcome>;
}

type Step = "form" | "already" | "saved";

const EMPTY_ALIAS: SignupFieldValues = {
  givenName: "",
  familyName: "",
  mobile: "",
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
  submit,
}: SignupFormProps) {
  const [step, setStep] = useState<Step>("form");
  const [values, setValues] = useState<SignupFieldValues>(initial);
  const [consent, setConsent] = useState(false);
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

  // Every one of the four format checks below is the same
  // person-validation.ts function the server repeats — one shared standard,
  // never a second, looser copy for the browser (finding 2, finding 3).
  const mobileValidation = values.mobile.trim() === "" ? null : validatePhoneNumber(values.mobile);
  const mobileError = mobileMissing
    ? null // "required" is covered by disabledReason below, not a red field error on an empty required field nobody has failed to fill in yet.
    : mobileValidation && !mobileValidation.valid
      ? mobileValidation.message
      : null;

  const emailValidation = values.email.trim() === "" ? null : validateEmailAddress(values.email);
  const emailError = emailValidation && !emailValidation.valid ? emailValidation.message : null;

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

  const requiredMissing = nameMissing || mobileMissing;
  const formatInvalid = Boolean(mobileError || emailError || matriculationError || graduationError);
  const ready = !requiredMissing && !formatInvalid && consent;
  const disabledReason = formatInvalid
    ? "Correct the field marked in red to enable this."
    : requiredMissing && !consent
      ? "Enter a first name, a last name and a mobile number, and tick the box below, to enable this."
      : requiredMissing
        ? "Enter a first name, a last name and a mobile number to enable this."
        : "Tick the box below to enable this.";

  async function doSubmit(confirmedExistingMatch: boolean) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await submit({ ...values, consent, confirmedExistingMatch });
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
    if (mode === "anonymous" && checkDuplicate && values.mobile.trim() !== "") {
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
            Your name, your mobile number and the tick below are needed. The rest can wait.
          </Typography>
        </Box>

        {error ? <Notice severity="error">{error}</Notice> : null}

        <Field label="First name" required {...field("givenName")} />
        <Field label="Last name" required {...field("familyName")} />
        <Field
          label="Mobile number"
          required

          error={Boolean(mobileError)}
          helperText={mobileError ?? "How the club will message you about sessions."}
          {...field("mobile")}
        />
        <Field
          label="Email address"

          error={Boolean(emailError)}
          helperText={emailError ?? undefined}
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
