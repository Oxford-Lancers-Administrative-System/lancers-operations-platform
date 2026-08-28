/**
 * The required set — LAN-183, `REQ-required-set`.
 *
 * Pure. No database, no `server-only`. `docs/architecture/data-model.md`'s
 * field inventory records the table this module is: required-ness depends on
 * where a person stands, approved by Brian on 2026-08-26 and amended the same
 * day, and it is data rather than a chain of `if`s for the same reason
 * `membership.ts`'s transition table is — a rung a reader cannot find by
 * reading `REQUIRED_FIELDS_BY_TIER` is a rung this module does not enforce.
 *
 * ## The three tiers, and the rung each status maps to
 *
 * | Tier          | Required                                                                                                  |
 * | ------------- | ---------------------------------------------------------------------------------------------------------- |
 * | `recruit`     | First name · last name · mobile                                                                             |
 * | `everyoneElse`| Recruit's set, plus personal email                                                                          |
 * | `player`      | Everyone-else's set, plus college, matriculation year, expected graduation, degree field, DOB, emergency contact |
 *
 * **Last name is required at every tier**, amended 2026-08-27 — the field
 * inventory's own words: "roughly a quarter of the club flags for a missing
 * last name the day the queue opens, and the queue is where they get chased."
 * That is the intent, not a defect in this module.
 *
 * ## Which assembled status maps to which tier
 *
 * `AssembledStatus` is the six-rung ladder `person-record.ts` assembles:
 * `"recruit"` from a prospect with no membership, the five stored
 * `membership_status` values from a membership, or `null` for a person who is
 * neither — a coach or committee member holding no season tie at all
 * (`REQ-create-without-roles`: the add-person path "creates people and
 * nothing else… a person created here has no tie to any season").
 *
 * The field inventory's "Onboarding, active or inactive" row is the mission's
 * name for a **player working through the season**, and its "Everyone else
 * (coach, committee, alumnus)" row is every other standing a person can hold.
 * This module reads that distinction off the assembled status rather than off
 * a role or a job title — nothing in this mission's substrate records "this
 * person is a coach" as a fact about the *person*; a coaching seat is an
 * operator role assignment, which this package does not touch
 * (`REQ-create-without-roles`, and the boundary that "no login, seat or club
 * role is granted or changed anywhere in this mission"). So `departed`,
 * `archived` and no membership at all all fall to `everyoneElse` — the same
 * tier the field inventory gives an alumnus or a coach, and for the same
 * reason: none of them is a player currently working through a season's
 * onboarding, so none of them owes the club matriculation year or a date of
 * birth to keep their record current. Recorded here as the reading this
 * package makes, cheap for a later mission to narrow if a source ever ties a
 * person to a coaching role structurally.
 */

/** The six-rung ladder an operator sees. `null` is a person on neither record. */
export type AssembledStatus =
  "recruit" | "onboarding" | "active" | "inactive" | "departed" | "archived" | null;

export type RequiredField =
  | "given_name"
  | "family_name"
  | "mobile"
  | "personal_email"
  | "college"
  | "matriculation_year"
  | "expected_graduation_year"
  | "degree_field"
  | "date_of_birth"
  | "emergency_contact";

/** What the field inventory table calls each required fact, for a refusal or a queue row. */
export const REQUIRED_FIELD_LABELS: Readonly<Record<RequiredField, string>> = Object.freeze({
  given_name: "First name",
  family_name: "Last name",
  mobile: "Mobile phone",
  personal_email: "Personal email",
  college: "College",
  matriculation_year: "Matriculation year",
  expected_graduation_year: "Expected graduation",
  degree_field: "Degree field",
  date_of_birth: "Date of birth",
  emergency_contact: "Emergency contact",
});

const RECRUIT_TIER: readonly RequiredField[] = Object.freeze([
  "given_name",
  "family_name",
  "mobile",
]);

const EVERYONE_ELSE_TIER: readonly RequiredField[] = Object.freeze([
  ...RECRUIT_TIER,
  "personal_email",
]);

const PLAYER_TIER: readonly RequiredField[] = Object.freeze([
  ...EVERYONE_ELSE_TIER,
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
  "emergency_contact",
]);

const PLAYER_STATUSES: ReadonlySet<AssembledStatus> = new Set(["onboarding", "active", "inactive"]);

/** The required fields for whatever rung this assembled status is on. */
export function requiredFieldsFor(status: AssembledStatus): readonly RequiredField[] {
  if (status === "recruit") return RECRUIT_TIER;
  if (PLAYER_STATUSES.has(status)) return PLAYER_TIER;
  // "departed", "archived", or null (a coach, committee member or alumnus
  // holding no season tie at all) — the field inventory's "everyone else" row.
  return EVERYONE_ELSE_TIER;
}

/** Whether each fact this module knows about is present on a person's record. */
export interface PersonFactPresence {
  givenName: boolean;
  familyName: boolean;
  mobile: boolean;
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
    personal_email: "personalEmail",
    college: "college",
    matriculation_year: "matriculationYear",
    expected_graduation_year: "expectedGraduationYear",
    degree_field: "degreeField",
    date_of_birth: "dateOfBirth",
    emergency_contact: "emergencyContact",
  });

/**
 * The required fields this rung asks for that this record does not have.
 * Empty when nothing required is missing.
 *
 * `not recorded` is never defaulted (`REQ-not-recorded`): a field's presence
 * is exactly what `presence` says it is, and this function invents nothing
 * about a fact it was not told.
 */
export function missingRequiredFields(
  status: AssembledStatus,
  presence: PersonFactPresence,
): RequiredField[] {
  return requiredFieldsFor(status).filter((field) => !presence[PRESENCE_KEY_FOR_FIELD[field]]);
}
