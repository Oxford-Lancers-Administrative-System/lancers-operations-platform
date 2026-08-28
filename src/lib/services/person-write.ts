import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import { actorRequirement } from "./actor";
import { recordAudit } from "./audit";
import {
  type ContactKind,
  type ContactScope,
  type PersonContactValue,
  type PersonRecord,
  PERSON_NOT_FOUND_MESSAGE,
  readPersonRecordIn,
} from "./person-record";
import { validateEmailAddress, validatePhoneNumber } from "./person-validation";

/**
 * The write path for an existing person's record — LAN-183, `REQ-supersede`
 * and `REQ-audit`. `person-record.ts` is the read; this is the correction.
 *
 * ## The two shapes of write, and why they differ
 *
 * `REQ-supersede`: "Contact values supersede rather than overwrite,
 * preserving dated history and one preferred value per kind. Every other
 * field overwrites, and its previous value survives in the person's history."
 * `supersedeContactPoint` dates the row it replaces and inserts a new one;
 * `updatePersonField` and `updateEmergencyContactField` write the new value in
 * place, with `recordAudit`'s `fromState`/`toState` carrying the previous
 * value into `audit_events` — which is where "the person's history" already
 * lives for every field the schema does not give a typed history table of its
 * own, the same posture `membership.ts`'s README note documents for this
 * package's own field set.
 *
 * ## `REQ-audit`'s reason rule, enforced once
 *
 * "A reason is required to change an existing person value and never to fill
 * an empty one." `requireReasonForChange` below is the one place that rule is
 * checked, for both write shapes.
 *
 * ## Validation happens here, not only on the client
 *
 * `DEC-w2-09`: "phone and email are validated before the save is offered."
 * `person-validation.ts` is what a form calls before offering the save; this
 * module calls the same functions again before committing it, because a
 * service that trusted its caller's validation would accept whatever a script,
 * a retried request, or a future caller sent it.
 */

const requireActor = actorRequirement(
  "A person record change has to name the operator who made it.",
);

function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * `REQ-audit`: a reason is required to change an existing value, and never to
 * fill an empty one. `oldValue === null` means the field was genuinely empty —
 * `not recorded`, never defaulted (`REQ-not-recorded`) — so filling it needs
 * no reason; anything else is a correction and must say why.
 */
function requireReasonForChange(
  oldValue: string | number | null,
  reason: string | null,
  fieldLabel: string,
): void {
  if (oldValue !== null && reason === null) {
    throw new ConstraintViolated(
      `Changing ${fieldLabel} from what is already on record needs a reason.`,
      { rule: "person_field_change_requires_a_reason" },
    );
  }
}

async function lockPersonRow(tx: Tx, personId: string): Promise<void> {
  const result = await tx.query<{ id: string; merged_into_person_id: string | null }>(
    `select id, merged_into_person_id from public.people where id = $1::uuid for update`,
    [personId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFound(PERSON_NOT_FOUND_MESSAGE, { rule: "people_not_found" });
  if (row.merged_into_person_id) {
    throw new ConstraintViolated(
      "This record was merged into another person, so it cannot be corrected on its own.",
      { rule: "person_merged_away" },
    );
  }
}

// ---------------------------------------------------------------------------
// Contact points — supersede, not overwrite
// ---------------------------------------------------------------------------

export interface SupersedeContactPointParams {
  actorPersonId: string;
  personId: string;
  kind: ContactKind;
  /** `null` for phone; for email, `"college"`, `"personal"`, or `null` for not-yet-classified. */
  scope?: ContactScope;
  rawValue: string;
  /** Required only when a current preferred value of this kind and scope already exists. */
  reason?: string | null;
  /** Who supplied it — `REQ-no-verification-mark`. Free text, e.g. "operator correction". */
  source?: string | null;
}

export interface SupersedeContactPointResult {
  contact: PersonContactValue;
  supersededContact: PersonContactValue | null;
}

function toContactValue(row: {
  id: string;
  kind: ContactKind;
  scope: ContactScope;
  raw_value: string;
  normalised_value: string | null;
  is_preferred: boolean;
  source: string | null;
  valid_from: Date;
  valid_until: Date | null;
}): PersonContactValue {
  return {
    id: row.id,
    kind: row.kind,
    scope: row.scope,
    rawValue: row.raw_value,
    normalisedValue: row.normalised_value,
    isPreferred: row.is_preferred,
    source: row.source,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
  };
}

/**
 * Replaces the current preferred contact value of one kind and scope,
 * preserving the old one, dated. Filling a kind/scope this person has no
 * current preferred value for needs no reason; replacing one does.
 *
 * `contact_points_one_preferred_per_kind` is the schema's own guarantee of "one
 * preferred value per kind" — a partial unique index on
 * `(person_id, kind, scope)`. This function keeps that true by dating the old
 * preferred row's `valid_until` in the same statement that would otherwise
 * collide with it, rather than racing it.
 */
export async function supersedeContactPoint(
  params: SupersedeContactPointParams,
): Promise<SupersedeContactPointResult> {
  const { actorPersonId, personId, kind } = params;
  requireActor(actorPersonId);

  const scope = params.scope ?? null;
  if (kind === "phone" && scope !== null) {
    throw new ConstraintViolated("A phone number does not carry a college/personal scope.", {
      rule: "contact_points_scope_is_for_email",
    });
  }

  const validation =
    kind === "email" ? validateEmailAddress(params.rawValue) : validatePhoneNumber(params.rawValue);
  if (!validation.valid) {
    throw new ConstraintViolated(validation.message, { rule: validation.rule });
  }
  const rawValue = params.rawValue.trim();
  const reason = optional(params.reason);
  const source = optional(params.source);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);

    const current = await tx.query<{
      id: string;
      kind: ContactKind;
      scope: ContactScope;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
      source: string | null;
      valid_from: Date;
      valid_until: Date | null;
    }>(
      `select id, kind::text as kind, scope::text as scope, raw_value, normalised_value,
              is_preferred, source, valid_from, valid_until
         from public.contact_points
        where person_id = $1::uuid and kind = $2::public.contact_point_kind
          and scope is not distinct from $3::public.contact_point_scope
          and valid_until is null and is_preferred
        for update`,
      [personId, kind, scope],
    );
    const supersededRow = current.rows[0] ?? null;

    const fieldLabel =
      kind === "email"
        ? scope === "college"
          ? "the college email"
          : scope === "personal"
            ? "the personal email"
            : "the email"
        : "the mobile number";
    requireReasonForChange(supersededRow ? supersededRow.raw_value : null, reason, fieldLabel);

    if (supersededRow) {
      // Both columns, in one statement. `contact_points_one_preferred_per_kind`
      // is a partial unique index over every row where `is_preferred` is true —
      // it carries no `valid_until` condition — so leaving the old row flagged
      // preferred while inserting a new preferred row for the same
      // `(person_id, kind, scope)` would collide with the index the very
      // guarantee this function exists to keep true. Dated *and* demoted is
      // what "no longer the preferred, current value" means.
      await tx.query(
        `update public.contact_points set valid_until = now(), is_preferred = false where id = $1::uuid`,
        [supersededRow.id],
      );
    }

    const inserted = await tx.query<{
      id: string;
      kind: ContactKind;
      scope: ContactScope;
      raw_value: string;
      normalised_value: string | null;
      is_preferred: boolean;
      source: string | null;
      valid_from: Date;
      valid_until: Date | null;
    }>(
      `insert into public.contact_points (person_id, kind, scope, raw_value, is_preferred, source)
       values ($1::uuid, $2::public.contact_point_kind, $3::public.contact_point_scope, $4, true, $5)
       returning id, kind::text as kind, scope::text as scope, raw_value, normalised_value,
                 is_preferred, source, valid_from, valid_until`,
      [personId, kind, scope, rawValue, source],
    );
    const contact = toContactValue(inserted.rows[0]);

    await recordAudit(tx, {
      actorPersonId,
      action: supersededRow ? "person_contact_superseded" : "person_contact_recorded",
      entityTable: "contact_points",
      entityId: contact.id,
      fromState: supersededRow?.raw_value ?? null,
      toState: contact.rawValue,
      reason,
      context: {
        issue: "LAN-183",
        person_id: personId,
        kind,
        scope,
        superseded_contact_id: supersededRow?.id ?? null,
      },
    });

    return {
      contact,
      supersededContact: supersededRow ? toContactValue(supersededRow) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Every other person field — overwrite, with history in the audit trail
// ---------------------------------------------------------------------------

export type PersonFieldUpdate =
  | { field: "given_name"; value: string }
  | { field: "family_name"; value: string | null }
  | { field: "college"; value: string | null }
  | { field: "matriculation_year"; value: number | null }
  | { field: "expected_graduation_year"; value: number | null }
  | { field: "degree_field"; value: string | null }
  /** `YYYY-MM-DD`, or `null`. Restricted — `REQ-restricted-fields` — but this is the one edit surface it is reached from. */
  | { field: "date_of_birth"; value: string | null };

const PERSON_FIELD_LABELS: Readonly<Record<PersonFieldUpdate["field"], string>> = Object.freeze({
  given_name: "the first name",
  family_name: "the last name",
  college: "college",
  matriculation_year: "the matriculation year",
  expected_graduation_year: "expected graduation",
  degree_field: "the degree field",
  date_of_birth: "date of birth",
});

const PERSON_FIELD_COLUMNS: Readonly<Record<PersonFieldUpdate["field"], string>> = Object.freeze({
  given_name: "given_name",
  family_name: "family_name",
  college: "college",
  matriculation_year: "matriculation_year",
  expected_graduation_year: "expected_graduation_year",
  degree_field: "degree_field",
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
 */
export async function updatePersonField(
  params: { actorPersonId: string; personId: string; reason?: string | null } & PersonFieldUpdate,
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

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);

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

// ---------------------------------------------------------------------------
// Emergency contact — restricted, four-role only, edited here alone
// ---------------------------------------------------------------------------

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
