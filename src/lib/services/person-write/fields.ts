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
  /**
   * The university's own identifier. LAN-267: collected on the player
   * questionnaire and printed beside the name on the BAFRA roster form. Free
   * text — the club has no authority over its shape, and refusing a real one
   * would lose it.
   */
  | { field: "student_number"; value: string | null }
  /**
   * LAN-267, and the reason it is here rather than questionnaire-only: a coach
   * is invited and given a role assignment and never sees a questionnaire, so
   * if this could only arrive that way the roster form's coach table would
   * print blank at every game — which is the half the officials need.
   */
  | { field: "bafa_registration_number"; value: string | null }
  /** `YYYY-MM-DD`, or `null`. Restricted — `REQ-restricted-fields` — but this is the one edit surface it is reached from. */
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

/**
 * Overwrites one durable person field, other than a contact value or the
 * emergency contact. `given_name` may never become blank — the schema's own
 * `people_given_name_not_blank` says so, and this refuses it before the
 * statement is sent so the operator gets the club's sentence rather than an
 * integrity error.
 *
 * `date_of_birth` is refused here on the same footing, and for the same
 * reason, as of LAN-245/LAN-258: `people_date_of_birth_in_the_past` was the
 * only thing standing between a future date and the `people` row, and a check
 * constraint reaching a caller raw is what produced a 500 on the player's own
 * questionnaire and an unnamed "the database refused this change" on the
 * operator's edit form. Both forms now ask `validateDateOfBirth` before they
 * offer the save; this is the service layer's own backstop, so a third caller
 * — a script, a future surface — gets the club's sentence naming the field
 * rather than an integrity error, exactly as `given_name` already does.
 */
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

  // Clearing a date of birth is a legitimate correction and is not validated;
  // only a value actually being recorded is.
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
    // `date_of_birth` is read as text, matching `person-record.ts`'s own
    // `to_char` — the driver otherwise returns a `date` column as a
    // JavaScript `Date`, whose `String()` form ("Sat Jan 01 2005…") neither
    // equals the `"YYYY-MM-DD"` this module writes nor reads back sensibly
    // from an audit row.
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
