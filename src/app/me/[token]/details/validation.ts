/**
 * Shape and required-ness checks for the player details form — LAN-216,
 * correction round 2, B-009. The form carries `noValidate`, so this module
 * supplies the required-ness half of validation the service does not:
 * `saveDetailsStep` checks shape for whatever was typed, but a blank value is
 * never a shape failure there. `DETAILS_FIELD_ORDER` is the screen's own
 * top-to-bottom order, matching `roster/new/validation.ts`'s
 * `firstInvalidField` contract.
 *
 * Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION
 */

import {
  FIELD_COLLEGE,
  FIELD_COLLEGE_EMAIL,
  FIELD_DATE_OF_BIRTH,
  FIELD_DEGREE_FIELD,
  FIELD_EC_EMAIL,
  FIELD_EC_FAMILY_NAME,
  FIELD_EC_GIVEN_NAME,
  FIELD_EC_PHONE,
  FIELD_EXPECTED_GRADUATION,
  FIELD_FAMILY_NAME,
  FIELD_GIVEN_NAME,
  FIELD_MATRICULATION_YEAR,
  FIELD_MOBILE,
  FIELD_PERSONAL_EMAIL,
} from "./presentation";

export interface DetailsFormValues {
  given_name: string;
  family_name: string;
  mobile: string;
  /** LAN-268. Required, and validated to the Oxford rule by the service. */
  college_email: string;
  personal_email: string;
  college: string;
  matriculation_year: string;
  expected_graduation_year: string;
  degree_field: string;
  /** LAN-267. Never required — a blank one prints blank on the roster form. */
  student_number: string;
  /** LAN-267. Never required, and an operator can supply it later. */
  bafa_registration_number: string;
  date_of_birth: string;
  ec_given_name: string;
  ec_family_name: string;
  ec_relationship: string;
  ec_phone: string;
  ec_email: string;
}

/** Field name → the sentence shown against that field. Empty when valid. */
export type DetailsFieldErrors = Partial<Record<keyof DetailsFormValues, string>>;

export interface DetailsFormState {
  values: DetailsFormValues;
  errors: DetailsFieldErrors;
}

export const EMPTY_DETAILS_VALUES: DetailsFormValues = {
  given_name: "",
  family_name: "",
  mobile: "",
  college_email: "",
  personal_email: "",
  college: "",
  matriculation_year: "",
  expected_graduation_year: "",
  degree_field: "",
  student_number: "",
  bafa_registration_number: "",
  date_of_birth: "",
  ec_given_name: "",
  ec_family_name: "",
  ec_relationship: "",
  ec_phone: "",
  ec_email: "",
};

/** Every field this form requires. `ec_relationship` was never required; `student_number`/`bafa_registration_number` (LAN-267) a player may genuinely not have yet. */
type ValidatedDetailsField = Exclude<
  keyof DetailsFormValues,
  "ec_relationship" | "student_number" | "bafa_registration_number"
>;

/** The screen's own top-to-bottom order. */
const DETAILS_FIELD_ORDER: readonly ValidatedDetailsField[] = [
  "given_name",
  "family_name",
  "mobile",
  "college_email",
  "personal_email",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
  "ec_given_name",
  "ec_family_name",
  "ec_phone",
  "ec_email",
];

const REQUIRED_LABEL: Readonly<Record<ValidatedDetailsField, string>> = Object.freeze({
  given_name: FIELD_GIVEN_NAME,
  family_name: FIELD_FAMILY_NAME,
  mobile: FIELD_MOBILE,
  college_email: FIELD_COLLEGE_EMAIL,
  personal_email: FIELD_PERSONAL_EMAIL,
  college: FIELD_COLLEGE,
  matriculation_year: FIELD_MATRICULATION_YEAR,
  expected_graduation_year: FIELD_EXPECTED_GRADUATION,
  degree_field: FIELD_DEGREE_FIELD,
  date_of_birth: FIELD_DATE_OF_BIRTH,
  ec_given_name: FIELD_EC_GIVEN_NAME,
  ec_family_name: FIELD_EC_FAMILY_NAME,
  ec_phone: FIELD_EC_PHONE,
  ec_email: FIELD_EC_EMAIL,
});

/** Reads every field out of a submitted form, without altering them. */
export function readDetailsValues(form: FormData): DetailsFormValues {
  const read = (name: keyof DetailsFormValues): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    given_name: read("given_name"),
    family_name: read("family_name"),
    mobile: read("mobile"),
    college_email: read("college_email"),
    personal_email: read("personal_email"),
    college: read("college"),
    matriculation_year: read("matriculation_year"),
    expected_graduation_year: read("expected_graduation_year"),
    degree_field: read("degree_field"),
    student_number: read("student_number"),
    bafa_registration_number: read("bafa_registration_number"),
    date_of_birth: read("date_of_birth"),
    ec_given_name: read("ec_given_name"),
    ec_family_name: read("ec_family_name"),
    ec_relationship: read("ec_relationship"),
    ec_phone: read("ec_phone"),
    ec_email: read("ec_email"),
  };
}

/** Every required field left blank, in screen order. Pure — no database, no player-tier knowledge (`REQ-required-set`). */
export function validateRequiredDetails(values: DetailsFormValues): DetailsFieldErrors {
  const errors: DetailsFieldErrors = {};
  for (const field of DETAILS_FIELD_ORDER) {
    if (values[field].trim() === "") {
      errors[field] = `${REQUIRED_LABEL[field]} is required.`;
    }
  }
  return errors;
}

/** `saveDetailsStep`'s error keys, mapped onto this form's field names — only the camelCase exceptions need naming. */
const SERVICE_ERROR_FIELD: Readonly<Record<string, keyof DetailsFormValues>> = Object.freeze({
  personalEmail: "personal_email",
  collegeEmail: "college_email",
});

export function mapServiceErrors(serviceErrors: Record<string, string>): DetailsFieldErrors {
  const errors: DetailsFieldErrors = {};
  for (const [key, message] of Object.entries(serviceErrors)) {
    const field = SERVICE_ERROR_FIELD[key] ?? (key as keyof DetailsFormValues);
    errors[field] = message;
  }
  return errors;
}

/** The first invalid field in screen order — same contract as `roster/new/validation.ts`'s `firstInvalidField`. */
export function firstInvalidDetailsField(
  errors: DetailsFieldErrors,
): keyof DetailsFormValues | null {
  return DETAILS_FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}
