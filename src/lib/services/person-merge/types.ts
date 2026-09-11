/**
 * The comparable fields — every durable person fact but the contact points,
 * which compare separately (there can be more than one kind). LAN-185,
 * `REQ-merge`, invariant I6, `Q-5`. LAN-256: a choice is required whenever
 * the two sides disagree, in either direction — never assumed as the
 * survivor's.
 */

export type MergePersonField =
  | "given_name"
  | "family_name"
  | "college"
  | "matriculation_year"
  | "expected_graduation_year"
  | "degree_field"
  | "date_of_birth"
  | "emergency_contact";

export const MERGE_PERSON_FIELD_LABELS: Readonly<Record<MergePersonField, string>> = Object.freeze({
  given_name: "First name",
  family_name: "Last name",
  college: "College",
  matriculation_year: "Matriculation year",
  expected_graduation_year: "Expected graduation",
  degree_field: "Degree field",
  date_of_birth: "Date of birth",
  emergency_contact: "Emergency contact",
});

export type MergeContactKind = "mobile" | "personal_email" | "college_email";

export const MERGE_CONTACT_KIND_LABELS: Readonly<Record<MergeContactKind, string>> = Object.freeze({
  mobile: "Mobile phone",
  personal_email: "Personal email",
  college_email: "College email",
});

export type MergeChoice = "survivor" | "loser";

/**
 * Every field an operator may choose per-side for.
 *
 * LAN-256: undeclared no longer means "keep the survivor's own value" on a row
 * where the two records disagree. It used to, and the comparison screen
 * pre-selected the survivor on every row to match, so a merge submitted
 * without touching a single radio silently kept the survivor's *blank* last
 * name, college, matriculation year, expected graduation, degree field, date
 * of birth and emergency contact over the loser's complete ones. A row where
 * both sides hold the same value still needs no declaration — there is
 * nothing to choose between — and `mergePersons` refuses a merge that leaves
 * any disagreeing row unanswered.
 */
export type MergeFieldChoices = Partial<Record<MergePersonField, MergeChoice>> &
  Partial<Record<MergeContactKind, MergeChoice>>;
