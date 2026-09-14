import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { type PersonRecord, readPersonRecordIn } from "../person-record";
import { validateDateOfBirth } from "../person-validation";
import {
  assertNoConcurrentPersonChange,
  lockPersonRow,
  optional,
  requireActor,
  requireReasonForChange,
} from "./shared";

/** Every other person field — overwrite, with history in the audit trail. LAN-183. */

export type PersonFieldUpdate =
  | { field: "given_name"; value: string }
  | { field: "family_name"; value: string | null }
  | { field: "college"; value: string | null }
  | { field: "matriculation_year"; value: number | null }
  | { field: "expected_graduation_year"; value: number | null }
  | { field: "degree_field"; value: string | null }
  /** LAN-267: collected on the player questionnaire, printed on the BAFRA roster form. Free text. */
  | { field: "student_number"; value: string | null }
  /** LAN-267: not questionnaire-only — a coach never sees the questionnaire, so this also has an operator edit. */
  | { field: "bafa_registration_number"; value: string | null }
  | { field: "date_of_birth"; value: string | null };

const PERSON_FIELD_LABELS: Readonly<Record<PersonFieldUpdate["field"], string>> = Object.freeze({
  given_name: "the first name",
  family_name: "the last name",
  college: "college",
  matriculation_year: "the matriculation year",
  expected_graduation_year: "expected graduation",
  degree_field: "the degree field",
  student_number: "the student number",
  bafa_registration_number: "the BAFA registration number",
  date_of_birth: "date of birth",
});

const PERSON_FIELD_COLUMNS: Readonly<Record<PersonFieldUpdate["field"], string>> = Object.freeze({
  given_name: "given_name",
  family_name: "family_name",
  college: "college",
  matriculation_year: "matriculation_year",
  expected_graduation_year: "expected_graduation_year",
  degree_field: "degree_field",
  student_number: "student_number",
  bafa_registration_number: "bafa_registration_number",
  date_of_birth: "date_of_birth",
});

function normalisedFieldValue(update: PersonFieldUpdate): string | number | null {
  if (update.field === "given_name") return update.value.trim();
  if (typeof update.value === "string") return optional(update.value);
  return update.value;
}

/** Overwrites one durable person field. `given_name` never blank (`people_given_name_not_blank`); `date_of_birth` refused the same way (LAN-245/LAN-258). */
export async function updatePersonField(
  params: {
    actorPersonId: string;
    personId: string;
    reason?: string | null;
    expectedVersion?: string | null;
  } & PersonFieldUpdate,
): Promise<PersonRecord> {
  const { actorPersonId, personId, field } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason);
  const value = normalisedFieldValue(params);

  if (field === "given_name" && (value === null || value === "")) {
    throw new ConstraintViolated("Every person needs a first name.", {
      rule: "people_given_name_not_blank",
    });
  }

  // Clearing a date of birth is legitimate and not validated; only a recorded value is.
  if (field === "date_of_birth" && typeof value === "string" && value !== "") {
    const validation = validateDateOfBirth(value);
    if (!validation.valid) {
      throw new ConstraintViolated(validation.message, { rule: validation.rule });
    }
  }

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const column = PERSON_FIELD_COLUMNS[field];
    // date_of_birth read as text (to_char) — a driver Date's String() form doesn't match "YYYY-MM-DD".
    const selectExpr = field === "date_of_birth" ? "to_char(date_of_birth, 'YYYY-MM-DD')" : column;
    const current = await tx.query<Record<string, string | number | null>>(
      `select ${selectExpr} as value from public.people where id = $1::uuid`,
      [personId],
    );
    const oldValue = current.rows[0]?.value ?? null;

    requireReasonForChange(oldValue, reason, PERSON_FIELD_LABELS[field]);

    if (String(oldValue ?? "") === String(value ?? "")) {
      throw new ConstraintViolated(`${PERSON_FIELD_LABELS[field]} already has that value.`, {
        rule: "person_field_unchanged",
      });
    }

    await tx.query(
      `update public.people set ${column} = $2, updated_at = now() where id = $1::uuid`,
      [personId, value],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: `person_${field}_updated`,
      entityTable: "people",
      entityId: personId,
      fromState: oldValue === null ? null : String(oldValue),
      toState: value === null ? null : String(value),
      reason,
      context: { issue: "LAN-183", field },
    });

    return readPersonRecordIn(tx, personId);
  });
}
