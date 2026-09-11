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

export const DISPUTABLE_FIELDS: readonly DisputedPersonField[] = Object.freeze([
  "given_name",
  "family_name",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  // LAN-267's two identifiers: same applyDisputableFieldIn path, same audit action, same source line.
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

/** Who last changed this field. `null` covers "never audited" and, defensively, an actor somehow not recorded. */
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

/** Batched, display-only counterpart to {@link lastFieldActorPersonIdIn} (F4, LAN-230) — one query for all seven fields. */
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

/** Applies one submitted value for one of the seven fields (B-002: last write wins). Four outcomes: unchanged, filled, self-corrected, overwritten. Decision history: LAN-230, missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION */
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
