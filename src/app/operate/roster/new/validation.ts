/**
 * Shape checks for the returner intake form. UX-10.
 *
 * ## How hard these try, and why they stop there
 *
 * LAN-74: "Validate shape enough to help the operator; do not silently rewrite
 * what was typed." Both halves of that sentence are load-bearing.
 *
 * The required-field rules below are this form's own — first name, last name
 * and mobile, per `W2`'s locked decision. The *shape* of a phone number or an
 * email address is a question this form shares with the bulk importer, so it
 * is delegated to `src/lib/validation/contact.ts` rather than kept as a
 * private copy: LAN-215, B-007, Brian at this form, "the same phone
 * validation everywhere."
 *
 * Email stays permissive, as LAN-74 decided: `avery@example.ac.ox` passes,
 * because it is not a real domain and also not this form's business —
 * normalisation and verification are separate, reversible steps the data
 * model deliberately keeps apart from intake. Phone no longer is: B-007
 * tightened it to "can this become E.164", because the old rule — any value
 * with seven or more digits — is how a nonsense number got in.
 *
 * Nothing here mutates the operator's input. The trimming below happens inside
 * the checks so that a trailing space does not fail a test the value should
 * pass; the value that reaches the database is the original string.
 */

import {
  EMAIL_SHAPE_MESSAGE,
  PHONE_SHAPE_MESSAGE,
  looksLikeEmail,
  looksLikePhone,
} from "@/lib/validation/contact";

export interface IntakeFormValues {
  givenName: string;
  familyName: string;
  email: string;
  phone: string;
}

/** Field name → the sentence shown against that field. Empty when valid. */
export type IntakeFieldErrors = Partial<Record<keyof IntakeFormValues, string>>;

export const EMPTY_VALUES: IntakeFormValues = {
  givenName: "",
  familyName: "",
  email: "",
  phone: "",
};

/** The one field the club always has, and the database's only name constraint. */
// "First name" matches the label on screen (Brian, reviewing UX-10). The field
// and the column stay `givenName` / `given_name` — the model's vocabulary is
// not the operator's, and conflating them is how a rename reaches the schema.
export const GIVEN_NAME_REQUIRED = "Enter a first name. It is the one name the club always has.";

/**
 * LAN-215, W2's locked decision: "Last name and mobile become required,
 * joining first name" — the approved item-and-ask inventory and
 * `person-required.ts`'s own recruit tier, which already requires all three
 * at every rung. The form was behind the required set it feeds; today only
 * first name was enforced.
 */
export const FAMILY_NAME_REQUIRED =
  "Enter a last name. It is required for every player, at every stage.";

export const MOBILE_REQUIRED =
  "Enter a mobile number. The welcome link is sent to it, and it is required for every player.";

export const EMAIL_SHAPE = EMAIL_SHAPE_MESSAGE;
export const PHONE_SHAPE = PHONE_SHAPE_MESSAGE;

/** The order fields are focused in, matching the order they appear on screen. */
export const FIELD_ORDER: readonly (keyof IntakeFormValues)[] = [
  "givenName",
  "familyName",
  "email",
  "phone",
];

/**
 * Validates the form. Returns the errors to show; an empty object means valid.
 *
 * Pure, and takes the values rather than a `FormData`, so the rules can be
 * tested without a request, a form or a browser.
 */
export function validateIntake(values: IntakeFormValues): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {};

  if (values.givenName.trim() === "") errors.givenName = GIVEN_NAME_REQUIRED;
  if (values.familyName.trim() === "") errors.familyName = FAMILY_NAME_REQUIRED;
  if (values.phone.trim() === "") {
    errors.phone = MOBILE_REQUIRED;
  } else if (!looksLikePhone(values.phone)) {
    errors.phone = PHONE_SHAPE;
  }
  if (values.email.trim() !== "" && !looksLikeEmail(values.email)) errors.email = EMAIL_SHAPE;

  return errors;
}

/**
 * The first invalid field in screen order, for the shared state contract's
 * "focus the first invalid control".
 */
export function firstInvalidField(errors: IntakeFieldErrors): keyof IntakeFormValues | null {
  return FIELD_ORDER.find((field) => errors[field] !== undefined) ?? null;
}

/** Reads the four fields out of a submitted form, without altering them. */
export function readIntakeValues(formData: FormData): IntakeFormValues {
  const read = (name: keyof IntakeFormValues): string => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    givenName: read("givenName"),
    familyName: read("familyName"),
    email: read("email"),
    phone: read("phone"),
  };
}
