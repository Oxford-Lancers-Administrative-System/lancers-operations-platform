import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { DisputedPersonField } from "@/lib/services/person-fact-dispute";
import type { QuestionnaireView } from "@/lib/services/player-questionnaire";
import { ActionBar } from "@/components/action-bar";
import { DateField, Field } from "@/components/field";
import { Notice } from "@/components/notice";
import { PublicShell } from "@/components/public-shell";
import { Refusal } from "@/components/refusal";
import { Section } from "@/components/section";
import {
  DETAILS_HEADING,
  DETAILS_LEAD_RETURNING,
  DETAILS_LEAD_STEP,
  DETAILS_SECONDARY,
  DISPUTED_NOTICE,
  FIELD_COLLEGE,
  FIELD_DATE_OF_BIRTH,
  FIELD_DEGREE_FIELD,
  FIELD_EC_EMAIL,
  FIELD_EC_FAMILY_NAME,
  FIELD_EC_GIVEN_NAME,
  FIELD_EC_PHONE,
  FIELD_EC_RELATIONSHIP,
  FIELD_EXPECTED_GRADUATION,
  FIELD_FAMILY_NAME,
  FIELD_GIVEN_NAME,
  FIELD_MATRICULATION_YEAR,
  FIELD_MOBILE,
  FIELD_PERSONAL_EMAIL,
  REQUIRED_NOTE,
  SAVE_AND_CONTINUE,
  SAVE_CHANGES,
  SECTION_EMERGENCY_CONTACT,
  SECTION_KEPT_PRIVATE,
  SECTION_WHERE_YOU_STUDY,
  SECTION_WHO_YOU_ARE,
  sourceLine,
} from "@/app/me/[token]/details/presentation";
import { gateShellPage } from "@/app/operate/gate";
import { pickQuestionnaireSubject } from "../picks";
import { QuestionnaireShell } from "./questionnaire-shell";

/**
 * S10 — step 1 of the player's questionnaire (`/me/[token]/details`), on the
 * public shell. LAN-225's player-surfaces addendum.
 *
 * Read by person id through the operator tier — never by token, and no token
 * is rendered. Every label, lead line, section heading and helper sentence is
 * `/me/[token]/details`'s own `presentation.ts`, unchanged. What changes is
 * the chrome and the components: the masthead with the crest instead of the
 * plain-text banner; `Field` at one size and full width instead of five
 * different `TextField` shapes; the date of birth on the `DateField` picker
 * rather than a native date input (audit E9, already taken); the four groups
 * as `Section`s; the foot as an `ActionBar`, sticky on a phone, so the one
 * button a fourteen-field form ends with is not 2,000px below the fold.
 *
 * The form is drawn, not wired: the real one is a client component holding
 * `saveDetails`'s returned state, and a preview that submitted it would write
 * to a seeded person.
 */
function currentContact(view: QuestionnaireView, kind: "phone" | "email"): string {
  const contact = view.person.contacts.find(
    (c) => c.kind === kind && c.validUntil === null && (kind === "phone" || c.scope === "personal"),
  );
  return contact?.rawValue ?? "";
}

export default async function PlayerDetailsPreviewPage() {
  const gate = await gateShellPage("/design-preview/player-details");
  if ("screen" in gate) return gate.screen;

  const view = await pickQuestionnaireSubject();
  if (!view) {
    return (
      <PublicShell caption="Joining" width="medium">
        <Refusal
          title="No questionnaire to show"
          message="The seed has no active membership with an outstanding ask to draw."
          action={{ href: "/design-preview", label: "Back to the preview" }}
        />
      </PublicShell>
    );
  }

  const p = view.person;
  const ec = view.emergencyContact;
  const isReturning = p.givenNameSource !== null || p.collegeSource !== null;
  const disputed = view.openDisputedFields;

  const helper = (known: boolean, who: "you" | "club", field: DisputedPersonField) =>
    disputed.has(field) ? DISPUTED_NOTICE : known ? sourceLine(who, null) : undefined;

  return (
    <QuestionnaireShell
      view={view}
      currentStep="details"
      heading={DETAILS_HEADING}
      lead={isReturning ? DETAILS_LEAD_RETURNING : DETAILS_LEAD_STEP}
      testId="player-details-preview"
    >
      {disputed.size > 0 ? <Notice severity="warning">{DISPUTED_NOTICE}</Notice> : null}

      <Section title={SECTION_WHO_YOU_ARE}>
        <Stack spacing={2}>
          <Field
            label={FIELD_GIVEN_NAME}
            name="given_name"
            defaultValue={p.givenName}
            helperText={helper(p.givenNameSource !== null, "you", "given_name")}
            required
          />
          <Field
            label={FIELD_FAMILY_NAME}
            name="family_name"
            defaultValue={p.familyName ?? ""}
            helperText={helper(p.familyNameSource !== null, "you", "family_name")}
          />
          <Field label={FIELD_MOBILE} name="mobile" defaultValue={currentContact(view, "phone")} />
          <Field
            label={FIELD_PERSONAL_EMAIL}
            name="personal_email"
            type="email"
            defaultValue={currentContact(view, "email")}
          />
        </Stack>
      </Section>

      <Section title={SECTION_WHERE_YOU_STUDY}>
        <Stack spacing={2}>
          <Field
            label={FIELD_COLLEGE}
            name="college"
            defaultValue={p.college ?? ""}
            helperText={helper(p.collegeSource !== null, "club", "college")}
          />
          <Field
            label={FIELD_MATRICULATION_YEAR}
            name="matriculation_year"
            defaultValue={p.matriculationYear?.toString() ?? ""}
            helperText={helper(p.matriculationYearSource !== null, "club", "matriculation_year")}
          />
          <Field
            label={FIELD_EXPECTED_GRADUATION}
            name="expected_graduation_year"
            defaultValue={p.expectedGraduationYear?.toString() ?? ""}
            helperText={helper(
              p.expectedGraduationYearSource !== null,
              "you",
              "expected_graduation_year",
            )}
          />
          <Field
            label={FIELD_DEGREE_FIELD}
            name="degree_field"
            defaultValue={p.degreeField ?? ""}
            helperText={helper(p.degreeFieldSource !== null, "you", "degree_field")}
          />
        </Stack>
      </Section>

      <Section
        title={SECTION_KEPT_PRIVATE}
        description="Only the committee sees this, and only where it has to."
      >
        <DateField label={FIELD_DATE_OF_BIRTH} name="date_of_birth" value={p.dateOfBirth ?? ""} />
      </Section>

      <Section title={SECTION_EMERGENCY_CONTACT}>
        <Stack spacing={2}>
          <Field
            label={FIELD_EC_GIVEN_NAME}
            name="ec_given_name"
            defaultValue={ec?.givenName ?? ""}
          />
          <Field
            label={FIELD_EC_FAMILY_NAME}
            name="ec_family_name"
            defaultValue={ec?.familyName ?? ""}
          />
          <Field
            label={FIELD_EC_RELATIONSHIP}
            name="ec_relationship"
            defaultValue={ec?.relationship ?? ""}
          />
          <Field label={FIELD_EC_PHONE} name="ec_phone" defaultValue={ec?.phone ?? ""} />
          <Field
            label={FIELD_EC_EMAIL}
            name="ec_email"
            type="email"
            defaultValue={ec?.email ?? ""}
          />
        </Stack>
      </Section>

      <Typography variant="body2" color="text.secondary">
        {DETAILS_SECONDARY}
      </Typography>

      <ActionBar
        primary={
          <Button type="button" variant="contained" sx={{ minHeight: 44 }}>
            {isReturning ? SAVE_CHANGES : SAVE_AND_CONTINUE}
          </Button>
        }
        note={REQUIRED_NOTE}
      />
    </QuestionnaireShell>
  );
}
