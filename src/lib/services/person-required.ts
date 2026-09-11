/**
 * The required set — LAN-183, `REQ-required-set`. Three tiers, below: the
 * tiers do not nest (LAN-268) — college email is in `recruit`/`player` but
 * not `everyoneElse`. `AssembledStatus`'s onboarding/active/inactive map to
 * `player`; `recruit` to `recruit`; everything else to `everyoneElse`.
 */

export type AssembledStatus =
  "recruit" | "onboarding" | "active" | "inactive" | "departed" | "archived" | null;

export type RequiredField =
  | "given_name"
  | "family_name"
  | "mobile"
  | "college_email"
  | "personal_email"
  | "college"
  | "matriculation_year"
  | "expected_graduation_year"
  | "degree_field"
  | "date_of_birth"
  | "emergency_contact";

export const REQUIRED_FIELD_LABELS: Readonly<Record<RequiredField, string>> = Object.freeze({
  given_name: "First name",
  family_name: "Last name",
  mobile: "Mobile phone",
  college_email: "College email",
  personal_email: "Personal email",
  college: "College",
  matriculation_year: "Matriculation year",
  expected_graduation_year: "Expected graduation",
  degree_field: "Degree field",
  date_of_birth: "Date of birth",
  emergency_contact: "Emergency contact",
});

const EVERY_TIER: readonly RequiredField[] = Object.freeze(["given_name", "family_name", "mobile"]);

const RECRUIT_TIER: readonly RequiredField[] = Object.freeze([...EVERY_TIER, "college_email"]);

const EVERYONE_ELSE_TIER: readonly RequiredField[] = Object.freeze([
  ...EVERY_TIER,
  "personal_email",
]);

const PLAYER_TIER: readonly RequiredField[] = Object.freeze([
  ...EVERYONE_ELSE_TIER,
  "college_email",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
  "emergency_contact",
]);

const PLAYER_STATUSES: ReadonlySet<AssembledStatus> = new Set(["onboarding", "active", "inactive"]);

export function requiredFieldsFor(status: AssembledStatus): readonly RequiredField[] {
  if (status === "recruit") return RECRUIT_TIER;
  if (PLAYER_STATUSES.has(status)) return PLAYER_TIER;
  return EVERYONE_ELSE_TIER;
}

export interface PersonFactPresence {
  givenName: boolean;
  familyName: boolean;
  mobile: boolean;
  collegeEmail: boolean;
  personalEmail: boolean;
  college: boolean;
  matriculationYear: boolean;
  expectedGraduationYear: boolean;
  degreeField: boolean;
  dateOfBirth: boolean;
  emergencyContact: boolean;
}

const PRESENCE_KEY_FOR_FIELD: Readonly<Record<RequiredField, keyof PersonFactPresence>> =
  Object.freeze({
    given_name: "givenName",
    family_name: "familyName",
    mobile: "mobile",
    college_email: "collegeEmail",
    personal_email: "personalEmail",
    college: "college",
    matriculation_year: "matriculationYear",
    expected_graduation_year: "expectedGraduationYear",
    degree_field: "degreeField",
    date_of_birth: "dateOfBirth",
    emergency_contact: "emergencyContact",
  });

/** The required fields this rung asks for that the record lacks. `presence` is never defaulted (`REQ-not-recorded`). */
export function missingRequiredFields(
  status: AssembledStatus,
  presence: PersonFactPresence,
): RequiredField[] {
  return requiredFieldsFor(status).filter((field) => !presence[PRESENCE_KEY_FOR_FIELD[field]]);
}
