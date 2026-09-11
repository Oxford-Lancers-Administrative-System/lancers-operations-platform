import type { Tx } from "@/lib/db";
import type { DisputedPersonField } from "../person-fact-dispute";
import type { PersonRecord } from "../person-record";
import { updatePersonField, type PersonFieldUpdate } from "../person-write";

/**
 * The no-silent-overwrite decision — the seven disputable `people` fields.
 * B-002 (correction round 2, Q-9, Brian): last write wins, whoever gave it;
 * `updatePersonField`'s own audit row carries who and when.
 * {@link applyDisputableFieldIn} is this module's one write path for them.
 */

/** Every field `updatePersonField` can silently overwrite — `person_fact_disputes`'s own scope. */
export const DISPUTABLE_FIELDS: readonly DisputedPersonField[] = Object.freeze([
  "given_name",
  "family_name",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  // LAN-267's two identifiers join the list for the same reason every other
  // entry is on it: the player's questionnaire writes them, so the record has
  // to be able to say who supplied the value that is on it. They travel the
  // same `applyDisputableFieldIn` path, take the same
  // `person_<field>_updated` audit action, and show the same "You"/"The club"
  // source line as college and degree field already do.
  "student_number",
  "bafa_registration_number",
  "date_of_birth",
]);

const PROVENANCE_ACTION_BY_FIELD: Readonly<Record<DisputedPersonField, string>> = Object.freeze({
  given_name: "person_given_name_updated",
  family_name: "person_family_name_updated",
  college: "person_college_updated",
  matriculation_year: "person_matriculation_year_updated",
  expected_graduation_year: "person_expected_graduation_year_updated",
  degree_field: "person_degree_field_updated",
  student_number: "person_student_number_updated",
  bafa_registration_number: "person_bafa_registration_number_updated",
  date_of_birth: "person_date_of_birth_updated",
});

/**
 * Who last changed this field, through the application — the one comparison
 * `readPersonRecordIn`'s own `<field>Source` (a display name) cannot make on
 * its own. `null` covers both "never audited" (matching `<field>Source ===
 * null`) and, defensively, a row whose actor was somehow not recorded.
 */
async function lastFieldActorPersonIdIn(
  tx: Tx,
  personId: string,
  field: DisputedPersonField,
): Promise<string | null> {
  const result = await tx.query<{ actor_person_id: string | null }>(
    `select actor_person_id
       from public.audit_events
      where entity_table = 'people' and entity_id = $1::uuid and action = $2
      order by occurred_at desc
      limit 1`,
    [personId, PROVENANCE_ACTION_BY_FIELD[field]],
  );
  return result.rows[0]?.actor_person_id ?? null;
}

/**
 * The batched, display-only counterpart to {@link lastFieldActorPersonIdIn}
 * — F4 (LAN-230). One query for all seven fields rather than seven, each
 * resolved to `"you"` / `"club"` / `null` for `QuestionnaireView.fieldSuppliedBy`
 * to render straight, with no name string to compare and no risk of two
 * people sharing a display name reading as the same person.
 */
export async function readFieldSuppliedByIn(
  tx: Tx,
  personId: string,
): Promise<Record<DisputedPersonField, "you" | "club" | null>> {
  const actions = DISPUTABLE_FIELDS.map((field) => PROVENANCE_ACTION_BY_FIELD[field]);
  const result = await tx.query<{ action: string; actor_person_id: string | null }>(
    `select action, actor_person_id
       from public.audit_events
      where entity_table = 'people' and entity_id = $1::uuid
        and action = any($2::text[])
      order by occurred_at desc`,
    [personId, actions],
  );

  const actionToField = new Map(
    DISPUTABLE_FIELDS.map((field) => [PROVENANCE_ACTION_BY_FIELD[field], field]),
  );
  const latestActorByField = new Map<DisputedPersonField, string | null>();
  for (const row of result.rows) {
    const field = actionToField.get(row.action);
    if (!field || latestActorByField.has(field)) continue; // newest row for this field is already kept
    latestActorByField.set(field, row.actor_person_id);
  }

  const suppliedBy = {} as Record<DisputedPersonField, "you" | "club" | null>;
  for (const field of DISPUTABLE_FIELDS) {
    const actorId = latestActorByField.get(field);
    suppliedBy[field] = actorId === undefined ? null : actorId === personId ? "you" : "club";
  }
  return suppliedBy;
}

const PERSON_FIELD_SOURCE_KEY: Readonly<Record<DisputedPersonField, keyof PersonRecord>> =
  Object.freeze({
    given_name: "givenNameSource",
    family_name: "familyNameSource",
    college: "collegeSource",
    matriculation_year: "matriculationYearSource",
    expected_graduation_year: "expectedGraduationYearSource",
    degree_field: "degreeFieldSource",
    student_number: "studentNumberSource",
    bafa_registration_number: "bafaRegistrationNumberSource",
    date_of_birth: "dateOfBirthSource",
  });

const PERSON_FIELD_VALUE_KEY: Readonly<Record<DisputedPersonField, keyof PersonRecord>> =
  Object.freeze({
    given_name: "givenName",
    family_name: "familyName",
    college: "college",
    matriculation_year: "matriculationYear",
    expected_graduation_year: "expectedGraduationYear",
    degree_field: "degreeField",
    student_number: "studentNumber",
    bafa_registration_number: "bafaRegistrationNumber",
    date_of_birth: "dateOfBirth",
  });

export type FieldSaveOutcome = "unchanged" | "filled" | "self-corrected" | "overwritten";

function buildFieldUpdate(field: DisputedPersonField, value: string): PersonFieldUpdate {
  switch (field) {
    case "given_name":
      return { field, value };
    case "family_name":
      return { field, value };
    case "college":
      return { field, value };
    case "degree_field":
      return { field, value };
    case "student_number":
      return { field, value };
    case "bafa_registration_number":
      return { field, value };
    case "date_of_birth":
      return { field, value };
    case "matriculation_year":
      return { field, value: Number.parseInt(value, 10) };
    case "expected_graduation_year":
      return { field, value: Number.parseInt(value, 10) };
  }
}

/**
 * Applies one submitted value for one of the seven fields that used to carry
 * a dispute. `newValue` is the trimmed, already-validated string the form
 * collected; an empty string is treated as "nothing submitted" (never a
 * clearing edit — this page has no way to blank a required fact, matching
 * `OD7-required-no-decline`).
 *
 * B-002 (correction round 2, Q-9, Brian's decision — "I don't think the
 * disputed fact mechanism survives at all"): the disputed state, the second
 * contested value and the four-role resolve control are gone. A player's
 * answer now simply takes effect — last write wins, whoever gave it — and
 * the audit history the person record already renders is what carries who
 * changed what and when.
 *
 * Four branches, decided fresh against the record read at the top of this
 * same save:
 *
 *   - nothing changed → `"unchanged"`, nothing written;
 *   - the field was empty → direct write, `"filled"`;
 *   - the field was non-empty but its most recent change has no attributable
 *     actor (seeded, imported, or `person_created`) → direct write,
 *     `"filled"` — nobody asserted the old value;
 *   - the field's most recent change was **this same person** → direct
 *     write, `"self-corrected"` — their own earlier answer, their
 *     prerogative (W5's own table, row 1);
 *   - otherwise (an operator, or anybody else, previously recorded it) →
 *     direct write, `"overwritten"` — the player's own submission stands,
 *     with its own provenance, and the prior value's history is exactly
 *     what the person record's audit trail already keeps.
 */
export async function applyDisputableFieldIn(
  tx: Tx,
  params: {
    personId: string;
    field: DisputedPersonField;
    currentRecord: PersonRecord;
    newValue: string;
  },
): Promise<FieldSaveOutcome> {
  const { personId, field, currentRecord, newValue } = params;
  const trimmed = newValue.trim();
  if (trimmed === "") return "unchanged";

  const currentValue = currentRecord[PERSON_FIELD_VALUE_KEY[field]] as unknown as
    string | number | null;
  if (String(currentValue ?? "") === trimmed) return "unchanged";

  if (currentValue === null) {
    await updatePersonField({
      actorPersonId: personId,
      personId,
      ...buildFieldUpdate(field, trimmed),
    });
    return "filled";
  }

  const source = currentRecord[PERSON_FIELD_SOURCE_KEY[field]] as unknown as string | null;
  if (source === null) {
    await updatePersonField({
      actorPersonId: personId,
      personId,
      reason:
        "Replaced by the player's own submission — the prior value had no attributable source.",
      ...buildFieldUpdate(field, trimmed),
    });
    return "filled";
  }

  const lastActorId = await lastFieldActorPersonIdIn(tx, personId, field);
  if (lastActorId === personId) {
    await updatePersonField({
      actorPersonId: personId,
      personId,
      reason: "Player self-service correction.",
      ...buildFieldUpdate(field, trimmed),
    });
    return "self-corrected";
  }

  await updatePersonField({
    actorPersonId: personId,
    personId,
    reason: "Replaced by the player's own submission — last write wins.",
    ...buildFieldUpdate(field, trimmed),
  });
  return "overwritten";
}
