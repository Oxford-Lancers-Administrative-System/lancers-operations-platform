// The comparable fields — every durable person fact but contact points. LAN-185, LAN-256, missions/intake/M-PEOPLE-AND-ROSTER

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

export type MergeFieldChoices = Partial<Record<MergePersonField, MergeChoice>> &
  Partial<Record<MergeContactKind, MergeChoice>>;
