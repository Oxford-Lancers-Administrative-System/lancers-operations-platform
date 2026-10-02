import type { PersonRecord } from "./person-record";

/** The facts the record's Student information section reads, for {@link showsStudentInformation}. */
export type StudentFactsOf = Pick<
  PersonRecord,
  | "status"
  | "contacts"
  | "college"
  | "matriculationYear"
  | "expectedGraduationYear"
  | "degreeField"
  | "studentNumber"
  | "bafaRegistrationNumber"
>;

/**
 * Does this person's record show the Student information section — LAN-462,
 * Brian 2026-10-02.
 *
 * Yes when they have ever been a player or a recruit, or when any student fact
 * is recorded for them. "Ever been a player or a recruit" is any season
 * membership or any recruitment prospect row, which is exactly when
 * `personAssembledStatusSql` (`sql-text.ts`) gives a status at all — a
 * departed or archived player still was one. The student facts are the
 * section's own: a current college email, college, matriculation year,
 * expected graduation, degree field, student number and the BAFA registration
 * number. A coach who does not play has none of them until somebody records
 * one, and from then on the section shows.
 *
 * Read from the full record, never the redacted one: whether the section
 * exists is decided here; which of its rows a viewer reads is the redaction's.
 * Pure, and in its own module so the record and its edit form can share it
 * without importing the server-only reader.
 */
export function showsStudentInformation(record: StudentFactsOf): boolean {
  if (record.status !== null) return true;
  return (
    record.college !== null ||
    record.matriculationYear !== null ||
    record.expectedGraduationYear !== null ||
    record.degreeField !== null ||
    record.studentNumber !== null ||
    record.bafaRegistrationNumber !== null ||
    record.contacts.some(
      (contact) =>
        contact.kind === "email" && contact.scope === "college" && contact.validUntil === null,
    )
  );
}
