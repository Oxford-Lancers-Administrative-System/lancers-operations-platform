/**
 * Step 1 — the details. Split from `page.tsx` (LAN-300).
 */
import Typography from "@mui/material/Typography";
import type { QuestionnaireView } from "@/lib/services/player-questionnaire";

import { DetailsForm } from "./details-form";
import type { DetailsFormValues } from "./validation";
import {
  DETAILS_HEADING,
  DETAILS_LEAD_RETURNING,
  DETAILS_LEAD_STEP,
  DETAILS_SECONDARY,
  sourceLine,
} from "./presentation";
import { Shell } from "./step-shell";

function currentContact(view: QuestionnaireView, kind: "phone" | "email"): string {
  const contact = view.person.contacts.find(
    (c) => c.kind === kind && c.validUntil === null && (kind === "phone" || c.scope === "personal"),
  );
  return contact?.rawValue ?? "";
}

/** LAN-268. The current college address, or empty — the same read, one scope over. */
function currentCollegeEmail(view: QuestionnaireView): string {
  const contact = view.person.contacts.find(
    (c) => c.kind === "email" && c.scope === "college" && c.validUntil === null,
  );
  return contact?.rawValue ?? "";
}

/** F4 (LAN-230): source line read from who actually supplied it (`view.fieldSuppliedBy`), not hard-coded per field name. */
function sourceOf(
  view: QuestionnaireView,
  field: keyof QuestionnaireView["fieldSuppliedBy"],
): string | null {
  const who = view.fieldSuppliedBy[field];
  return who ? sourceLine(who, null) : null;
}

/** B-009 (LAN-216, r2): field-level rendering lives in `./details-form.tsx`, a client component holding `saveDetails`'s returned state. Everything here is plain server data. */
export function DetailsStepPage({ view, token }: { view: QuestionnaireView; token: string }) {
  const p = view.person;
  const ec = view.emergencyContact;
  const isReturning = p.givenNameSource !== null || p.collegeSource !== null;

  const initialValues: DetailsFormValues = {
    given_name: p.givenName,
    family_name: p.familyName ?? "",
    mobile: currentContact(view, "phone"),
    college_email: currentCollegeEmail(view),
    personal_email: currentContact(view, "email"),
    college: p.college ?? "",
    matriculation_year: p.matriculationYear?.toString() ?? "",
    expected_graduation_year: p.expectedGraduationYear?.toString() ?? "",
    degree_field: p.degreeField ?? "",
    student_number: p.studentNumber ?? "",
    bafa_registration_number: p.bafaRegistrationNumber ?? "",
    date_of_birth: p.dateOfBirth ?? "",
    ec_given_name: ec?.givenName ?? "",
    ec_family_name: ec?.familyName ?? "",
    ec_relationship: ec?.relationship ?? "",
    ec_phone: ec?.phone ?? "",
    ec_email: ec?.email ?? "",
  };

  return (
    <Shell
      view={view}
      currentStep="details"
      heading={DETAILS_HEADING}
      lead={isReturning ? DETAILS_LEAD_RETURNING : DETAILS_LEAD_STEP}
    >
      <DetailsForm
        token={token}
        needsConsentStep={view.needsConsentStep}
        isReturning={isReturning}
        initialValues={initialValues}
        meta={{
          given_name: {
            source: sourceOf(view, "given_name"),
            disputed: view.openDisputedFields.has("given_name"),
          },
          family_name: {
            source: sourceOf(view, "family_name"),
            disputed: view.openDisputedFields.has("family_name"),
          },
          college: {
            source: sourceOf(view, "college"),
            disputed: view.openDisputedFields.has("college"),
          },
          matriculation_year: {
            source: sourceOf(view, "matriculation_year"),
            disputed: view.openDisputedFields.has("matriculation_year"),
          },
          expected_graduation_year: {
            source: sourceOf(view, "expected_graduation_year"),
            disputed: view.openDisputedFields.has("expected_graduation_year"),
          },
          degree_field: {
            source: sourceOf(view, "degree_field"),
            disputed: view.openDisputedFields.has("degree_field"),
          },
          date_of_birth: {
            source: sourceOf(view, "date_of_birth"),
            disputed: view.openDisputedFields.has("date_of_birth"),
          },
        }}
      />
      <Typography sx={{ fontSize: 13, color: "text.secondary", mt: 2 }}>
        {DETAILS_SECONDARY}
      </Typography>
    </Shell>
  );
}
