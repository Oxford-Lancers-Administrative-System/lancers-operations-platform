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
import { personDisplayNameSql } from "./sql-text";

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
// A concurrent edit refuses rather than wins — LAN-185, W2-09
//
// "Nothing about a person is important enough to lose to a race." There is no
// row version column on `people`, and adding one would be exactly the kind of
// migration this package does not own. The audit trail is already the
// person's history and already append-only, so it is also the version: the
// occurred-at of the most recent audited change to anything this edit surface
// can write is the snapshot an operator loaded, and it can only move forward.
// `personVersion()` reads it; the edit form carries it back as a hidden field,
// and every write below is asked to check it before it changes anything.
// ---------------------------------------------------------------------------

/** One row from every audit source this edit surface can change, shaped alike. */
interface LatestChangeRow {
  occurred_at: Date;
  action: string;
  entity_table: string;
  from_state: string | null;
  to_state: string | null;
  actor_display_name: string | null;
  actor_label: string | null;
}

const CONCURRENT_FIELD_LABELS: Readonly<Record<string, string>> = Object.freeze({
  person_given_name_updated: "First name",
  person_family_name_updated: "Last name",
  person_college_updated: "College",
  person_matriculation_year_updated: "Matriculation year",
  person_expected_graduation_year_updated: "Expected graduation",
  person_degree_field_updated: "Degree field",
  person_date_of_birth_updated: "Date of birth",
  person_contact_superseded: "A contact value",
  person_contact_recorded: "A contact value",
  person_alias_added: "Aliases",
  person_alias_removed: "Aliases",
  person_alias_display_name_set: "Aliases",
  person_emergency_contact_recorded: "The emergency contact",
  person_emergency_contact_field_updated: "The emergency contact",
});

/**
 * Every audited change to this person's record, its contact points, its
 * aliases or its emergency contact, newest first, limited to one row.
 *
 * A UNION rather than four separate queries so "the most recent change,
 * whichever table it landed in" is one comparison rather than four — the same
 * reason `readPersonHistory()` in `people-directory.ts` will want the same
 * union one day; this one stays local because its shape (one row, one
 * comparison) is different from that panel's (every row, paginated).
 */
async function latestPersonChangeIn(tx: Tx, personId: string): Promise<LatestChangeRow | null> {
  const result = await tx.query<LatestChangeRow>(
    `select occurred_at, action, entity_table, from_state, to_state, actor_label,
            ${personDisplayNameSql("actor")} as actor_display_name
       from public.audit_events a
       left join public.people actor on actor.id = a.actor_person_id
      where (a.entity_table = 'people' and a.entity_id = $1::uuid)
         or (a.entity_table = 'person_emergency_contacts' and a.entity_id = $1::uuid)
         or (a.entity_table in ('contact_points', 'person_aliases')
             and a.context ->> 'person_id' = $1::text)
      order by occurred_at desc
      limit 1`,
    [personId],
  );
  return result.rows[0] ?? null;
}

/**
 * The version an edit form loads with, and carries back on save —
 * `personVersion()`'s ISO string, or `null` when nothing has ever been
 * audited about this person (a legacy or freshly seeded record).
 */
export async function personVersion(personId: string): Promise<string | null> {
  return withTransaction(async (tx) => personVersionIn(tx, personId));
}

async function personVersionIn(tx: Tx, personId: string): Promise<string | null> {
  const latest = await latestPersonChangeIn(tx, personId);
  return latest ? latest.occurred_at.toISOString() : null;
}

/**
 * Refuses with what changed underneath the caller, when `expectedVersion` no
 * longer matches. `undefined` skips the check entirely — a caller that never
 * loaded a version (a script, an older test) is not suddenly refused; `null`
 * is a real, checked claim that nothing had ever been audited yet.
 */
async function assertNoConcurrentPersonChange(
  tx: Tx,
  personId: string,
  expectedVersion: string | null | undefined,
): Promise<void> {
  if (expectedVersion === undefined) return;
  const latest = await latestPersonChangeIn(tx, personId);
  const actual = latest ? latest.occurred_at.toISOString() : null;
  if (actual === expectedVersion) return;

  const who = latest?.actor_display_name ?? latest?.actor_label ?? "somebody else";
  const field = latest ? (CONCURRENT_FIELD_LABELS[latest.action] ?? "This record") : "This record";
  const at = latest
    ? latest.occurred_at.toLocaleString("en-GB", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  const valueClause =
    latest?.to_state !== null && latest?.to_state !== undefined
      ? ` was set to ${latest.to_state}`
      : " changed";

  throw new ConstraintViolated(
    `This record changed while you were editing it. ${field}${valueClause} by ${who}` +
      (at ? ` at ${at}` : "") +
      `. Your changes were not saved.`,
    { rule: "person_concurrent_edit" },
  );
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
  /** `personVersion()`'s snapshot, from when the edit form loaded. LAN-185, W2-09. */
  expectedVersion?: string | null;
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
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

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

    // LAN-185, W2-07: "An email that already belongs to another person" is
    // refused rather than saved twice. `contact_points` carries no unique
    // constraint on `raw_value` — Source Data Analysis §11.1's messy real
    // data would refuse a legitimate import on day one — so this is checked
    // here, the one write path a duplicate email can arrive through. Phones
    // are deliberately not checked the same way: a shared household number
    // is common and not itself a signal of one person recorded twice, the
    // reading the workflow's own acceptance evidence draws by only ever
    // showing this refusal for an email.
    if (kind === "email") {
      const collision = await tx.query<{ person_id: string; display_name: string }>(
        `select c.person_id, ${personDisplayNameSql("p")} as display_name
           from public.contact_points c
           join public.people p on p.id = c.person_id
          where c.kind = 'email' and c.valid_until is null
            and lower(btrim(c.raw_value)) = lower(btrim($1::text))
            and c.person_id <> $2::uuid
            and p.merged_into_person_id is null
          limit 1`,
        [rawValue, personId],
      );
      const other = collision.rows[0];
      if (other) {
        throw new ConstraintViolated(
          `${other.display_name} already holds this email. Two records sharing a contact point is usually one person twice.`,
          { rule: "person_contact_email_in_use" },
        );
      }
    }

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

// ---------------------------------------------------------------------------
// Aliases — add, remove, flag as the display name. LAN-185
//
// `person-record.ts`'s own note: LAN-182 collapsed `people.known_as` into
// `person_aliases`, where a single row may be flagged `is_display_name`
// (`person_aliases_one_display_name_per_person`, at most one per person).
// Every write here needs no reason: aliases are name forms, not the durable
// facts `REQ-audit`'s reason rule guards, and the workflow names none.
// ---------------------------------------------------------------------------

/**
 * Adds one alias. Never a reason, never destructive — a second alias is
 * additional evidence, not a correction to the first.
 */
export async function addPersonAlias(params: {
  actorPersonId: string;
  personId: string;
  alias: string;
  /** Free text — who supplied it, `REQ-no-verification-mark`'s posture applied to a name form. */
  source?: string | null;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId } = params;
  requireActor(actorPersonId);
  const alias = params.alias.trim();
  if (alias === "") {
    throw new ConstraintViolated("An alias cannot be blank.", {
      rule: "person_aliases_alias_not_blank",
    });
  }

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const existing = await tx.query(
      `select 1 from public.person_aliases where person_id = $1::uuid and alias = $2`,
      [personId, alias],
    );
    if (existing.rows.length > 0) {
      throw new ConstraintViolated("This person already carries that alias.", {
        rule: "person_aliases_unique_per_person",
      });
    }

    const inserted = await tx.query<{ id: string }>(
      `insert into public.person_aliases (person_id, alias, source)
       values ($1::uuid, $2, $3)
       returning id`,
      [personId, alias, optional(params.source)],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_added",
      entityTable: "person_aliases",
      entityId: inserted.rows[0].id,
      fromState: null,
      toState: alias,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}

/**
 * Removes one alias. Not a delete for the *person* — `given_name`,
 * `family_name` and every other durable fact are untouched — but it is a
 * real row delete on `person_aliases`, which carries no soft-hide column of
 * its own on `main`. The audit row this writes is what "kept as dedupe
 * evidence" means once the live row is gone: the fact that this person once
 * carried this name form survives permanently in `audit_events`, readable on
 * the person's own history, even though `findPersonDuplicates()` — which
 * matches only current, live rows — can no longer see it. Recorded here
 * rather than smoothed over: a structural "hidden, not deleted" column is a
 * migration, and this package does not own one.
 */
export async function removePersonAlias(params: {
  actorPersonId: string;
  personId: string;
  aliasId: string;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId, aliasId } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const existing = await tx.query<{ alias: string }>(
      `delete from public.person_aliases where id = $1::uuid and person_id = $2::uuid
       returning alias`,
      [aliasId, personId],
    );
    const row = existing.rows[0];
    if (!row) {
      throw new NotFound("That alias is not on this person's record.", {
        rule: "person_aliases_not_found",
      });
    }

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_removed",
      entityTable: "person_aliases",
      entityId: aliasId,
      fromState: row.alias,
      toState: null,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}

/**
 * Flags one alias as the display name, replacing whichever alias held the
 * flag before — `person_aliases_one_display_name_per_person` permits at most
 * one. The list's name column follows this immediately, because
 * `person-record.ts`'s `displayNameOf()` reads it directly.
 */
export async function setDisplayNamePersonAlias(params: {
  actorPersonId: string;
  personId: string;
  aliasId: string;
  expectedVersion?: string | null;
}): Promise<PersonRecord> {
  const { actorPersonId, personId, aliasId } = params;
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    await lockPersonRow(tx, personId);
    await assertNoConcurrentPersonChange(tx, personId, params.expectedVersion);

    const target = await tx.query<{ alias: string; is_display_name: boolean }>(
      `select alias, is_display_name from public.person_aliases
        where id = $1::uuid and person_id = $2::uuid`,
      [aliasId, personId],
    );
    const row = target.rows[0];
    if (!row) {
      throw new NotFound("That alias is not on this person's record.", {
        rule: "person_aliases_not_found",
      });
    }
    if (row.is_display_name) {
      throw new ConstraintViolated("This alias is already the display name.", {
        rule: "person_alias_display_name_unchanged",
      });
    }

    // Unflag whichever alias held it, then flag this one — in one statement so
    // the partial unique index is never asked to hold two `true` rows at once.
    await tx.query(
      `update public.person_aliases
          set is_display_name = (id = $1::uuid)
        where person_id = $2::uuid and (is_display_name or id = $1::uuid)`,
      [aliasId, personId],
    );

    await recordAudit(tx, {
      actorPersonId,
      action: "person_alias_display_name_set",
      entityTable: "person_aliases",
      entityId: aliasId,
      fromState: null,
      toState: row.alias,
      context: { issue: "LAN-185", person_id: personId },
    });

    return readPersonRecordIn(tx, personId);
  });
}
