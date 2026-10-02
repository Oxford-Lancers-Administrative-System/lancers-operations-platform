/**
 * The operator details form's fields — LAN-459, approved by Brian on
 * 2 October 2026. Personal information only (LAN-462's split): no student or
 * college questions, no emergency contact, no "Not now". Pure, so the form
 * component and the service share one list.
 */

export const OPERATOR_DETAILS_FIELDS = Object.freeze([
  "givenName",
  "middleName",
  "familyName",
  "knownAs",
  "mobile",
  "personalEmail",
  "dateOfBirth",
] as const);

export type OperatorDetailsField = (typeof OPERATOR_DETAILS_FIELDS)[number];

export type OperatorDetailsValues = Record<OperatorDetailsField, string>;

export type OperatorDetailsErrors = Partial<Record<OperatorDetailsField, string>>;

export const OPERATOR_DETAILS_LABELS: Readonly<Record<OperatorDetailsField, string>> =
  Object.freeze({
    givenName: "First name",
    middleName: "Middle name",
    familyName: "Last name",
    knownAs: "Known as",
    mobile: "Mobile phone",
    personalEmail: "Personal email",
    dateOfBirth: "Date of birth",
  });

/** Required whenever shown: names, mobile, personal email. Middle name, known as and date of birth are optional. */
export const REQUIRED_OPERATOR_DETAILS: ReadonlySet<OperatorDetailsField> = new Set([
  "givenName",
  "familyName",
  "mobile",
  "personalEmail",
]);

export const EMPTY_OPERATOR_DETAILS: OperatorDetailsValues = Object.freeze({
  givenName: "",
  middleName: "",
  familyName: "",
  knownAs: "",
  mobile: "",
  personalEmail: "",
  dateOfBirth: "",
});

/** The submitted values, every field read as trimmed text. */
export function readOperatorDetailsForm(formData: FormData): OperatorDetailsValues {
  const values = { ...EMPTY_OPERATOR_DETAILS };
  for (const field of OPERATOR_DETAILS_FIELDS) {
    const raw = formData.get(field);
    values[field] = typeof raw === "string" ? raw.trim() : "";
  }
  return values;
}

/** What the form's action hands back: the values as submitted, any field errors, and the saved state. */
export interface OperatorDetailsFormState {
  readonly values: OperatorDetailsValues;
  readonly errors: OperatorDetailsErrors;
  /** Set once saved from the link: the address the sign-in invitation went to. */
  readonly invitationEmail?: string | null;
  readonly saved?: boolean;
}
