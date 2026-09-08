/**
 * Shape and required-ness checks for the player details form — LAN-216,
 * correction round 2, B-009.
 *
 * ## Why this exists
 *
 * The form used to rely on the DOM `required` attribute to keep a player from
 * submitting a blank required field. That meant Chrome, not this app, decided
 * what "this field needs something" looked like — its own bubble, its own
 * wording, pointed at whichever field the browser's own tab order reached
 * first, which was not even always the first blank field on screen. The
 * server-side shape checks in `saveDetailsStep`
 * (`src/lib/services/player-questionnaire.ts`) were never reached, because the
 * browser refused to submit at all.
 *
 * The form now carries `noValidate`, so every submission reaches the server
 * action regardless of what was typed. This module supplies the half of
 * validation the service does not: required-ness. `saveDetailsStep` checks
 * shape (`looksLikePhone`/`looksLikeEmail`, the same predicates
 * `src/app/operate/roster/new/validation.ts` exports) for whatever was typed,
 * but a blank value is never a shape failure there — "required" is
 * deliberately a separate concern, so it is deliberately a separate check
 * here, run before the service is ever called.
 *
 * ## Which fields
 *
 * Every field this route's form marks with an asterisk: the nine player-tier
 * facts a text field can hold (`REQ-required-set`'s `PLAYER_TIER` in
 * `person-required.ts` names ten — the tenth, `emergency_contact`, is a single
 * aggregate fact that this form collects as the four fields below), plus the
 * emergency contact's given name, family name, phone and email. The
 * relationship field is deliberately not required and carries no shape check —
 * the form has never asked that of it, and this correction does not add one.
 *
 * `DETAILS_FIELD_ORDER` is the screen's own top-to-bottom order, so
 * `firstInvalidDetailsField` sends focus to the same field a sighted player
 * would reach first, matching `src/app/operate/roster/new/validation.ts`'s own
 * `firstInvalidField` contract.
 */

import {
  FIELD_COLLEGE,
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
  personal_email: string;
  college: string;
  matriculation_year: string;
  expected_graduation_year: string;
  degree_field: string;
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
  personal_email: "",
  college: "",
  matriculation_year: "",
  expected_graduation_year: "",
  degree_field: "",
  date_of_birth: "",
  ec_given_name: "",
  ec_family_name: "",
  ec_relationship: "",
  ec_phone: "",
  ec_email: "",
};

/** Every field this correction validates. `ec_relationship` is never required. */
export type ValidatedDetailsField = Exclude<keyof DetailsFormValues, "ec_relationship">;

/** The screen's own top-to-bottom order. */
export const DETAILS_FIELD_ORDER: readonly ValidatedDetailsField[] = [
  "given_name",
  "family_name",
  "mobile",
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

/** Reads the fourteen fields out of a submitted form, without altering them. */
export function readDetailsValues(form: FormData): DetailsFormValues {
  const read = (name: keyof DetailsFormValues): string => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    given_name: read("given_name"),
    family_name: read("family_name"),
    mobile: read("mobile"),
    personal_email: read("personal_email"),
    college: read("college"),
    matriculation_year: read("matriculation_year"),
    expected_graduation_year: read("expected_graduation_year"),
    degree_field: read("degree_field"),
    date_of_birth: read("date_of_birth"),
    ec_given_name: read("ec_given_name"),
    ec_family_name: read("ec_family_name"),
    ec_relationship: read("ec_relationship"),
    ec_phone: read("ec_phone"),
    ec_email: read("ec_email"),
  };
}

/**
 * Every required field left blank, in screen order. Pure — no database, no
 * knowledge of what tier this particular player is on: this form's own
 * asterisks say all thirteen are required of whoever is filling it in, and
 * that is unchanged by this correction (`REQ-required-set`: "required still
 * blocks the form and never the player").
 */
export function validateRequiredDetails(values: DetailsFormValues): DetailsFieldErrors {
  const errors: DetailsFieldErrors = {};
  for (const field of DETAILS_FIELD_ORDER) {
    if (values[field].trim() === "") {
      errors[field] = `${REQUIRED_LABEL[field]} is required.`;
    }
  }
  return errors;
}

/**
 * `saveDetailsStep`'s own error keys, mapped onto this form's field names.
 * Every key it returns is already this form's field name except one:
 * `personalEmail`, which the service keys in camelCase while the form (and
 * every other field here) uses `personal_email`. Anything the service ever
 * adds under a name that already matches a form field passes through
 * unchanged, so this map only needs to name the one exception.
 */
const SERVICE_ERROR_FIELD: Readonly<Record<string, keyof DetailsFormValues>> = Object.freeze({
  personalEmail: "personal_email",
});

export function mapServiceErrors(serviceErrors: Record<string, string>): DetailsFieldErrors {
  const errors: DetailsFieldErrors = {};
  for (const [key, message] of Object.entries(serviceErrors)) {
    const field = SERVICE_ERROR_FIELD[key] ?? (key as keyof DetailsFormValues);
    errors[field] = message;
  }
  return errors;
}

/**
 * The first invalid field in screen order, for "focus the first invalid
 * control" — the same contract `src/app/operate/roster/new/validation.ts`'s
 * own `firstInvalidField` keeps.
 */
export function firstInvalidDetailsField(
  errors: DetailsFieldErrors,
): keyof DetailsFormValues | null {
  return DETAILS_FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}
