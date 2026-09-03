/**
 * Shape checks for the returner intake form. UX-10.
 *
 * ## How hard these try, and why they stop there
 *
 * LAN-74: "Validate shape enough to help the operator; do not silently rewrite
 * what was typed." Both halves of that sentence are load-bearing.
 *
 * The club's real files contain a reversed top-level domain, an address with a
 * trailing space, and a phone number one digit short. `contact_points.raw_value`
 * has no format constraint precisely so those survive intake, because a contact
 * the club cannot store is a contact the club loses. So these checks catch the
 * things that are almost certainly a slip at the keyboard — an address with no
 * `@` at all, a phone number with no digits in it — and let everything else
 * through to be stored exactly as typed.
 *
 * That means `avery@example.ac.ox` passes. It is not a real domain, and it is
 * also not this form's business: normalisation and verification are separate,
 * reversible steps that the data model deliberately keeps apart from intake.
 *
 * Nothing here mutates the operator's input. The trimming below happens inside
 * the checks so that a trailing space does not fail a test the value should
 * pass; the value that reaches the database is the original string.
 */

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

export const EMAIL_SHAPE =
  "This does not look like an email address. Enter it as it was given, including the @, " +
  "or leave it blank.";

export const PHONE_SHAPE =
  "This does not look like a phone number. Enter it as it was given, or leave it blank.";

/** The order fields are focused in, matching the order they appear on screen. */
export const FIELD_ORDER: readonly (keyof IntakeFormValues)[] = [
  "givenName",
  "familyName",
  "email",
  "phone",
];

export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  // One `@`, something before it, something after it, and no internal spaces.
  // Deliberately not a full RFC address parser: the strict ones reject real
  // addresses, and the club's messy-but-genuine addresses must get through.
  return /^[^\s@]+@[^\s@]+$/.test(trimmed);
}

export function looksLikePhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  // Seven is the shortest thing anybody writes down as a contactable number,
  // and the club's files contain numbers one digit short of correct, which
  // must still be accepted and stored.
  return digits.length >= 7;
}

/**
 * Validates the form. Returns the errors to show; an empty object means valid.
 *
 * Pure, and takes the values rather than a `FormData`, so the rules can be
 * tested without a request, a form or a browser.
 */
export function validateIntake(values: IntakeFormValues): IntakeFieldErrors {
  const errors: IntakeFieldErrors = {};

  if (values.givenName.trim() === "") errors.givenName = GIVEN_NAME_REQUIRED;
  if (values.email.trim() !== "" && !looksLikeEmail(values.email)) errors.email = EMAIL_SHAPE;
  if (values.phone.trim() !== "" && !looksLikePhone(values.phone)) errors.phone = PHONE_SHAPE;

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
