/** Shape checks for the returner intake form (UX-10). */

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

export const GIVEN_NAME_REQUIRED = "Enter a first name. It is the one name the club always has.";

export const FAMILY_NAME_REQUIRED =
  "Enter a last name. It is required for every player, at every stage.";

export const MOBILE_REQUIRED =
  "Enter a mobile number. The welcome link is sent to it, and it is required for every player.";

export const EMAIL_SHAPE = EMAIL_SHAPE_MESSAGE;
export const PHONE_SHAPE = PHONE_SHAPE_MESSAGE;

/** The order fields are focused in, matching the order they appear on screen. */
const FIELD_ORDER: readonly (keyof IntakeFormValues)[] = [
  "givenName",
  "familyName",
  "email",
  "phone",
];

/** Validates the form; empty object means valid. Pure — takes values, not `FormData`, so rules test without a request. */
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
