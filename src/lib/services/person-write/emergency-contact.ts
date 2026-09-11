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
 * Creates or corrects one field of the person's emergency contact — one row
 * per person, structurally isolated (`REQ-restricted-fields`).
 *
 * A first call for a person with none yet creates the row (needing only the
 * one field's value; the schema requires nothing beyond a name — "a partially
 * filled contact is chased by the missing-data queue, not refused at the
 * door"). A later call on an existing row corrects one field, and — the same
 * rule as every other field — needs a reason only when it changes a value
 * that was not empty.
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

    // The schema's `person_emergency_contacts.given_name` is `not null` with no
    // default. Starting a record on any other field would either insert a row
    // that violates that constraint (a raw driver error, not a club sentence)
    // or silently invent a first name — neither of which this module does.
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

    // Deliberately not `entityTable: "person_emergency_contacts"` with the raw
    // before/after in `fromState`/`toState`: this table's structural isolation
    // (`REQ-restricted-fields`) is the whole reason it is not a `contact_point`
    // or a `people` row, and putting a real name, phone or email into
    // `audit_events` — which `public.transition_ledger` reads as one stream
    // with rows a future audience-facing surface could plausibly scan — would
    // undo that by a side door. The audit event records *that* a field changed
    // and *which* one, never the value itself.
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
