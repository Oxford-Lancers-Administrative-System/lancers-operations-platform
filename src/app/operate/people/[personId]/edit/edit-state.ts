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

export interface MobileConfirmation {
  /** What the operator typed, unmodified. */
  raw: string;
  /** The E.164 preview — `+` plus digits — for "will be saved as …". */
  normalisedPreview: string;
  reason: string;
  /** The WhatsApp seam banner, when it applies. Always absent today — see `person-whatsapp-seam.ts`. */
  whatsappWarning: string | null;
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
  /** W2-05: the mobile change is validated but not yet committed. */
  pendingMobileConfirmation?: MobileConfirmation;
  /** Set after a successful save, read once by the client to show a toast-free confirmation via redirect instead. */
}

export const INITIAL_EDIT_STATE: EditState = { errors: {} };

export const GENERIC_FAILURE =
  "That could not be saved, and nothing was written. Try again, and tell the club " +
  "administrator if it keeps happening.";

function optional(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value : "";
}

export interface EditFormValues {
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
  confirmMobile: string;
}

export function readEditFormValues(formData: FormData): EditFormValues {
  return {
    givenName: optional(formData.get("givenName")),
    familyName: optional(formData.get("familyName")),
    mobile: optional(formData.get("mobile")),
    mobileReason: optional(formData.get("mobileReason")),
    personalEmail: optional(formData.get("personalEmail")),
    personalEmailReason: optional(formData.get("personalEmailReason")),
    collegeEmail: optional(formData.get("collegeEmail")),
    collegeEmailReason: optional(formData.get("collegeEmailReason")),
    college: optional(formData.get("college")),
    matriculationYear: optional(formData.get("matriculationYear")),
    expectedGraduationYear: optional(formData.get("expectedGraduationYear")),
    degreeField: optional(formData.get("degreeField")),
    dateOfBirth: optional(formData.get("dateOfBirth")),
    emergencyGivenName: optional(formData.get("emergencyGivenName")),
    emergencyFamilyName: optional(formData.get("emergencyFamilyName")),
    emergencyRelationship: optional(formData.get("emergencyRelationship")),
    emergencyPhone: optional(formData.get("emergencyPhone")),
    emergencyEmail: optional(formData.get("emergencyEmail")),
    expectedVersion: optional(formData.get("expectedVersion")),
    confirmMobile: optional(formData.get("confirmMobile")),
  };
}
