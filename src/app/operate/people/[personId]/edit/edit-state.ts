/**
 * The state `/operate/people/[personId]/edit`'s form is driven by — W2,
 * LAN-185. Plain data and pure helpers only, for the same reason
 * `roster/new/intake-state.ts` states: a `"use server"` file may export only
 * async functions.
 */

export interface EditFieldErrors {
  givenName?: string;
  familyName?: string;
  mobile?: string;
  mobileReason?: string;
  personalEmail?: string;
  personalEmailReason?: string;
  collegeEmail?: string;
  collegeEmailReason?: string;
  college?: string;
  matriculationYear?: string;
  expectedGraduationYear?: string;
  degreeField?: string;
  dateOfBirth?: string;
  emergencyGivenName?: string;
  emergencyFamilyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
  emergencyEmail?: string;
}

/**
 * F1, LAN-185 correction (`inv-ae866233-f12`): every field
 * `person-write.ts`'s `requireReasonForChange` covers needs a reachable
 * *Reason for the change* input, the same way `mobileReason` /
 * `personalEmailReason` / `collegeEmailReason` already work — required only
 * to change a value that is already on record, never to fill an empty one.
 * These twelve cover the remaining fields the rule applies to: the seven
 * `PersonFieldUpdate` fields (`given_name` through `date_of_birth`) and all
 * five `EmergencyContactFieldUpdate` fields.
 *
 * B1, LAN-185 correction round 2 (Brian's walk): `edit-person-form.tsx`
 * renders each `*Reason` input only once the field's live value actually
 * differs from what is stored — never up front just because the field is
 * populated. That is client behaviour (`edit-person-form.tsx`'s own state),
 * not a shape change here.
 */
export interface CorrectionReasonFormValues {
  givenNameReason: string;
  familyNameReason: string;
  collegeReason: string;
  matriculationYearReason: string;
  expectedGraduationYearReason: string;
  degreeFieldReason: string;
  dateOfBirthReason: string;
  emergencyGivenNameReason: string;
  emergencyFamilyNameReason: string;
  emergencyRelationshipReason: string;
  emergencyPhoneReason: string;
  emergencyEmailReason: string;
}

export interface EditState {
  errors: EditFieldErrors;
  formError?: string;
  /** UX-05-style: an email this save would collide with. */
  emailConflict?: {
    personId: string;
    displayName: string;
    field: "personalEmail" | "collegeEmail";
  };
  /** A concurrent save happened underneath this one. */
  concurrentEditMessage?: string;
  /** Set after a successful save, read once by the client to show a toast-free confirmation via redirect instead. */
}

export const INITIAL_EDIT_STATE: EditState = { errors: {} };

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

function optional(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export interface EditFormValues extends CorrectionReasonFormValues {
  givenName: string;
  familyName: string;
  mobile: string;
  mobileReason: string;
  personalEmail: string;
  personalEmailReason: string;
  collegeEmail: string;
  collegeEmailReason: string;
  college: string;
  matriculationYear: string;
  expectedGraduationYear: string;
  degreeField: string;
  dateOfBirth: string;
  emergencyGivenName: string;
  emergencyFamilyName: string;
  emergencyRelationship: string;
  emergencyPhone: string;
  emergencyEmail: string;
  expectedVersion: string;
}

export function readEditFormValues(formData: FormData): EditFormValues {
  return {
    givenName: optional(formData.get("givenName")),
    givenNameReason: optional(formData.get("givenNameReason")),
    familyName: optional(formData.get("familyName")),
    familyNameReason: optional(formData.get("familyNameReason")),
    mobile: optional(formData.get("mobile")),
    mobileReason: optional(formData.get("mobileReason")),
    personalEmail: optional(formData.get("personalEmail")),
    personalEmailReason: optional(formData.get("personalEmailReason")),
    collegeEmail: optional(formData.get("collegeEmail")),
    collegeEmailReason: optional(formData.get("collegeEmailReason")),
    college: optional(formData.get("college")),
    collegeReason: optional(formData.get("collegeReason")),
    matriculationYear: optional(formData.get("matriculationYear")),
    matriculationYearReason: optional(formData.get("matriculationYearReason")),
    expectedGraduationYear: optional(formData.get("expectedGraduationYear")),
    expectedGraduationYearReason: optional(formData.get("expectedGraduationYearReason")),
    degreeField: optional(formData.get("degreeField")),
    degreeFieldReason: optional(formData.get("degreeFieldReason")),
    dateOfBirth: optional(formData.get("dateOfBirth")),
    dateOfBirthReason: optional(formData.get("dateOfBirthReason")),
    emergencyGivenName: optional(formData.get("emergencyGivenName")),
    emergencyGivenNameReason: optional(formData.get("emergencyGivenNameReason")),
    emergencyFamilyName: optional(formData.get("emergencyFamilyName")),
    emergencyFamilyNameReason: optional(formData.get("emergencyFamilyNameReason")),
    emergencyRelationship: optional(formData.get("emergencyRelationship")),
    emergencyRelationshipReason: optional(formData.get("emergencyRelationshipReason")),
    emergencyPhone: optional(formData.get("emergencyPhone")),
    emergencyPhoneReason: optional(formData.get("emergencyPhoneReason")),
    emergencyEmail: optional(formData.get("emergencyEmail")),
    emergencyEmailReason: optional(formData.get("emergencyEmailReason")),
    expectedVersion: optional(formData.get("expectedVersion")),
  };
}
