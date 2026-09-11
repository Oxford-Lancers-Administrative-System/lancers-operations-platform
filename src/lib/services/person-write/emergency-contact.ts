import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { type PersonRecord, readPersonRecordIn } from "../person-record";
import {
  assertNoConcurrentPersonChange,
  lockPersonRow,
  optional,
  requireActor,
  requireReasonForChange,
} from "./shared";

/** Emergency contact — restricted, four-role only, edited here alone. LAN-183. */

export type EmergencyContactFieldUpdate =
  | { field: "given_name"; value: string }
  | { field: "family_name"; value: string | null }
  | { field: "relationship"; value: string | null }
  | { field: "phone"; value: string | null }
  | { field: "email"; value: string | null };

const EMERGENCY_CONTACT_FIELD_LABELS: Readonly<
  Record<EmergencyContactFieldUpdate["field"], string>
> = Object.freeze({
  given_name: "the emergency contact's first name",
  family_name: "the emergency contact's last name",
  relationship: "the emergency contact's relationship",
  phone: "the emergency contact's phone number",
  email: "the emergency contact's email",
});

/**
 * Creates or corrects one field of the emergency contact — one row per
 * person, structurally isolated (`REQ-restricted-fields`). A first call
 * creates the row; a later call corrects one field, needing a reason only
 * when it changes a non-empty value.
 */
export async function updateEmergencyContactField(
  params: {
    actorPersonId: string;
    personId: string;
    reason?: string | null;
    expectedVersion?: string | null;
  } & EmergencyContactFieldUpdate,
): Promise<PersonRecord> {
  const { actorPersonId, personId, field } = params;
  requireActor(actorPersonId);
  const reason = optional(params.reason);
  const value = typeof params.value === "string" ? optional(params.value) : params.value;

  if (field === "given_name" && value === null) {
    throw new ConstraintViolated("An emergency contact needs a first name.", {
      rule: "person_emergency_contacts_given_name_not_blank",
    });
  }

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const existing = await tx.query<{
      given_name: string;
      family_name: string | null;
      relationship: string | null;
      phone: string | null;
      email: string | null;
    }>(
      `select given_name, family_name, relationship, phone, email
         from public.person_emergency_contacts
        where person_id = $1::uuid
        for update`,
      [personId],
    );
    const existingRow = existing.rows[0] ?? null;

    // given_name is `not null` with no default — starting on another field would either violate it or invent a name.
    if (!existingRow && field !== "given_name") {
      throw new ConstraintViolated(
        "An emergency contact record needs a first name before any other detail can be added.",
        { rule: "person_emergency_contacts_given_name_not_blank" },
      );
    }

    const oldValue = existingRow ? existingRow[field] : null;

    requireReasonForChange(oldValue, reason, EMERGENCY_CONTACT_FIELD_LABELS[field]);

    if (existingRow && oldValue === value) {
      throw new ConstraintViolated(
        `${EMERGENCY_CONTACT_FIELD_LABELS[field]} already has that value.`,
        {
          rule: "person_emergency_contact_field_unchanged",
        },
      );
    }

    if (existingRow) {
      await tx.query(
        `update public.person_emergency_contacts
            set ${field} = $2, recorded_by_person_id = $3, updated_at = now()
          where person_id = $1::uuid`,
        [personId, value, actorPersonId],
      );
    } else {
      await tx.query(
        `insert into public.person_emergency_contacts (person_id, ${field}, recorded_by_person_id)
         values ($1::uuid, $2, $3::uuid)`,
        [personId, value, actorPersonId],
      );
    }

    // No raw value in fromState/toState (REQ-restricted-fields): records that a field changed, never the value.
    await recordAudit(tx, {
      actorPersonId,
      action: existingRow
        ? "person_emergency_contact_field_updated"
        : "person_emergency_contact_recorded",
      entityTable: "person_emergency_contacts",
      entityId: personId,
      fromState: existingRow ? "recorded" : null,
      toState: "recorded",
      reason,
      context: { issue: "LAN-183", field },
    });

    return readPersonRecordIn(tx, personId);
  });
}
