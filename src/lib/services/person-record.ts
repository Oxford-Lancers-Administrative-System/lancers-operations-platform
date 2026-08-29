import "server-only";

import { ConstraintViolated, NotFound, withTransaction, type Tx } from "@/lib/db";
import {
  type AssembledStatus,
  type PersonFactPresence,
  type RequiredField,
  missingRequiredFields,
} from "./person-required";
import {
  escapeLikePattern,
  personAssembledStatusSql,
  personDisplayAliasSql,
  personDisplayNameSql,
} from "./sql-text";

/**
 * The person record, assembled — LAN-183, `REQ-person-record` and
 * `REQ-status-ladder`. The four surface packages this mission still owes call
 * here instead of each writing their own read.
 *
 * ## What "assembled" means
 *
 * One `people` row, its aliases, its current and superseded contact points,
 * its emergency contact (0 or 1 row, structurally its own table —
 * `REQ-restricted-fields`), and two derived views LAN-182 built —
 * `person_standing` and `person_blues_totals` — read together and returned as
 * one shape. Nothing here writes; `person-write.ts` is the correction path.
 *
 * ## `REQ-no-disputed` and `REQ-no-verification-mark`
 *
 * There is no contested-value field, no verification-mark field and no
 * confidence class anywhere below — not struck out, never added. A contact
 * value's `source` says who supplied it and nothing more, which is the whole
 * of what LAN-182's schema carries and the whole of what this module returns.
 *
 * ## Derived provenance — `Q-13`
 *
 * `given_name`, `family_name`, `college`, `matriculation_year`,
 * `expected_graduation_year`, `degree_field` and `date_of_birth` have no
 * `source` column of their own on `main`. Brian's walkthrough of LAN-184
 * chose to derive "who supplied it" for these seven from `audit_events`
 * instead of adding one: the most recent `person_<field>_updated` row this
 * module finds naming the person is who supplied the value currently on file;
 * a field never changed through the application — seeded, imported, or set at
 * `person_created`, which names no single field and is deliberately not
 * treated as attributing one — has no such row, and the corresponding
 * `<field>Source` reads `null` rather than a guess. See
 * `readFieldProvenanceIn` below.
 *
 * ## Merged-away records
 *
 * Invariant I6: a merged person's row survives forever, pointing at the
 * survivor, and is never offered as a live identity again. `readPersonRecord`
 * refuses one with `NotFound` rather than assembling it — the identity it
 * would return is not the one anybody holds a live tie to — and
 * `searchPeople` excludes them from its `where` clause outright, the same
 * guarantee `roster.ts`'s duplicate check gives.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface PersonAlias {
  id: string;
  alias: string;
  isDisplayName: boolean;
  source: string | null;
  notedAt: Date;
}

export type ContactKind = "email" | "phone";
export type ContactScope = "college" | "personal" | null;

export interface PersonContactValue {
  id: string;
  kind: ContactKind;
  scope: ContactScope;
  rawValue: string;
  normalisedValue: string | null;
  isPreferred: boolean;
  /** Who supplied it, and nothing more — `REQ-no-verification-mark`. */
  source: string | null;
  validFrom: Date;
  /** `null` means current. A dated value is superseded, never deleted — `REQ-supersede`. */
  validUntil: Date | null;
}

export interface EmergencyContact {
  givenName: string;
  familyName: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
}

export interface PersonRecord {
  personId: string;
  givenName: string;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  givenNameSource: string | null;
  familyName: string | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  familyNameSource: string | null;
  aliases: PersonAlias[];
  /** The alias flagged `is_display_name`, if there is one; else `givenName`, plus `familyName`. */
  displayName: string;
  /** The six-rung ladder. `null` for a person on neither the prospect nor the membership record. */
  status: AssembledStatus;
  college: string | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  collegeSource: string | null;
  matriculationYear: number | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  matriculationYearSource: string | null;
  expectedGraduationYear: number | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  expectedGraduationYearSource: string | null;
  degreeField: string | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  degreeFieldSource: string | null;
  /** `REQ-restricted-fields`: four-role only, and never on a list, board or queue. */
  dateOfBirth: string | null;
  /** `Q-13`: derived from `audit_events`, `null` when no edit has ever named this field. */
  dateOfBirthSource: string | null;
  /** `REQ-restricted-fields`: structurally isolated; four-role only. `null` when none is recorded. */
  emergencyContact: EmergencyContact | null;
  /** Current and superseded, oldest last within each kind and scope. */
  contacts: PersonContactValue[];
  isPastMember: boolean;
  standingIsOverridden: boolean;
  /** Derived from date of birth; never the date itself. `null` when no date of birth is held. */
  isUnder18: boolean | null;
  halfBlueCount: number;
  fullBlueCount: number;
  mergedIntoPersonId: string | null;
  /** Required for this person's rung and not yet recorded. Names, never a bare count. */
  missingRequiredFields: RequiredField[];
}

/** A list-shaped row. Structurally excludes date of birth and the emergency contact — `REQ-restricted-fields`. */
export interface PersonSummary {
  personId: string;
  givenName: string;
  familyName: string | null;
  displayAlias: string | null;
  displayName: string;
  status: AssembledStatus;
  /** Contactability, not a value — `DEC-w1-03`, `DEC-w5-02`. */
  hasMobile: boolean;
  hasPersonalEmail: boolean;
  mergedIntoPersonId: string | null;
  missingRequiredFields: RequiredField[];
}

export const PERSON_NOT_FOUND_MESSAGE = "That person is not on record.";
export const PERSON_MERGED_AWAY_MESSAGE =
  "This record was merged into another person and is no longer opened on its own.";

// ---------------------------------------------------------------------------
// Reading one person
// ---------------------------------------------------------------------------

interface PersonRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  college: string | null;
  matriculation_year: number | null;
  expected_graduation_year: number | null;
  degree_field: string | null;
  date_of_birth: string | null;
  merged_into_person_id: string | null;
  display_alias: string | null;
  status: AssembledStatus;
  is_past_member: boolean | null;
  standing_is_overridden: boolean | null;
  is_under_18: boolean | null;
  half_blue_count: string | null;
  full_blue_count: string | null;
}

function displayNameOf(row: {
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
}): string {
  const trimmedAlias = row.display_alias?.trim();
  const first = trimmedAlias ? trimmedAlias : row.given_name;
  return row.family_name ? `${first} ${row.family_name}` : first;
}

async function readPersonRowIn(tx: Tx, personId: string): Promise<PersonRow> {
  const result = await tx.query<PersonRow>(
    `select p.id as person_id, p.given_name, p.family_name,
            p.college, p.matriculation_year, p.expected_graduation_year, p.degree_field,
            to_char(p.date_of_birth, 'YYYY-MM-DD') as date_of_birth,
            p.merged_into_person_id,
            ${personDisplayAliasSql("p")} as display_alias,
            ${personAssembledStatusSql("p")} as status,
            ps.is_past_member, ps.standing_is_overridden, ps.is_under_18,
            coalesce(bt.half_blue_count, 0)::text as half_blue_count,
            coalesce(bt.full_blue_count, 0)::text as full_blue_count
       from public.people p
       left join public.person_standing ps on ps.person_id = p.id
       left join public.person_blues_totals bt on bt.person_id = p.id
      where p.id = $1::uuid`,
    [personId],
  );

  const row = result.rows[0];
  if (!row) {
    throw new NotFound(PERSON_NOT_FOUND_MESSAGE, { rule: "people_not_found" });
  }
  if (row.merged_into_person_id) {
    throw new NotFound(PERSON_MERGED_AWAY_MESSAGE, { rule: "person_merged_away" });
  }
  return row;
}

async function readAliasesIn(tx: Tx, personId: string): Promise<PersonAlias[]> {
  const result = await tx.query<{
    id: string;
    alias: string;
    is_display_name: boolean;
    source: string | null;
    noted_at: Date;
  }>(
    `select id, alias, is_display_name, source, noted_at
       from public.person_aliases
      where person_id = $1::uuid
      order by is_display_name desc, noted_at`,
    [personId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    alias: r.alias,
    isDisplayName: r.is_display_name,
    source: r.source,
    notedAt: r.noted_at,
  }));
}

async function readContactsIn(tx: Tx, personId: string): Promise<PersonContactValue[]> {
  const result = await tx.query<{
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
      where person_id = $1::uuid
      order by kind, scope nulls first, valid_from desc`,
    [personId],
  );
  return result.rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    scope: r.scope,
    rawValue: r.raw_value,
    normalisedValue: r.normalised_value,
    isPreferred: r.is_preferred,
    source: r.source,
    validFrom: r.valid_from,
    validUntil: r.valid_until,
  }));
}

async function readEmergencyContactIn(tx: Tx, personId: string): Promise<EmergencyContact | null> {
  const result = await tx.query<{
    given_name: string;
    family_name: string | null;
    relationship: string | null;
    phone: string | null;
    email: string | null;
  }>(
    `select given_name, family_name, relationship, phone, email
       from public.person_emergency_contacts
      where person_id = $1::uuid`,
    [personId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    givenName: row.given_name,
    familyName: row.family_name,
    relationship: row.relationship,
    phone: row.phone,
    email: row.email,
  };
}

/**
 * The seven `people` columns `person-write.ts`'s `updatePersonField` can
 * change and LAN-182's schema gives no `source` column of their own. Each
 * name here is also the `field` half of that function's own
 * `person_<field>_updated` audit action — the one place these columns are
 * ever the subject of an audit row.
 */
const DERIVED_PROVENANCE_FIELDS = [
  "given_name",
  "family_name",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
] as const;

type DerivedProvenanceField = (typeof DERIVED_PROVENANCE_FIELDS)[number];

/**
 * "Who supplied it" for the seven fields above, read from `audit_events`
 * rather than stored — `Q-13`. The most recent `person_<field>_updated` row
 * naming this person is who supplied that field's current value; a field
 * with no such row reads `null`, which the page renders as an explicit "not
 * recorded" rather than a guess.
 *
 * `person_created` is deliberately excluded even though it may have set
 * several of these columns at once: it names no single field, so treating it
 * as provenance for every column it happened to populate would attribute a
 * fact this row does not actually state — the exact shape of invented
 * caption `Q-13` and amendment `W1-A2` both refuse. This is also why almost
 * nothing renders a caption yet: almost every person on file today arrived
 * through an intake path that writes `person_created` and nothing more.
 */
async function readFieldProvenanceIn(
  tx: Tx,
  personId: string,
): Promise<Record<DerivedProvenanceField, string | null>> {
  const actions = DERIVED_PROVENANCE_FIELDS.map((field) => `person_${field}_updated`);
  const result = await tx.query<{
    action: string;
    actor_label: string | null;
    actor_display_name: string | null;
  }>(
    `select a.action, a.actor_label,
            ${personDisplayNameSql("actor")} as actor_display_name
       from public.audit_events a
       left join public.people actor on actor.id = a.actor_person_id
      where a.entity_table = 'people' and a.entity_id = $1::uuid
        and a.action = any($2::text[])
      order by a.occurred_at desc`,
    [personId, actions],
  );

  const bySource = new Map<string, string>();
  for (const row of result.rows) {
    // Inverse of `person_${field}_updated` — the field name is what
    // `updatePersonField` put in the middle of its own action string.
    const field = row.action.slice("person_".length, -"_updated".length);
    if (bySource.has(field)) continue; // the newest row for this field is already kept
    bySource.set(field, row.actor_display_name ?? row.actor_label ?? "Unknown");
  }

  return Object.fromEntries(
    DERIVED_PROVENANCE_FIELDS.map((field) => [field, bySource.get(field) ?? null]),
  ) as Record<DerivedProvenanceField, string | null>;
}

function presenceFrom(
  row: PersonRow,
  contacts: readonly PersonContactValue[],
  emergencyContact: EmergencyContact | null,
): PersonFactPresence {
  return {
    givenName: true, // people.given_name is `not null` in the schema
    familyName: row.family_name !== null,
    mobile: contacts.some((c) => c.kind === "phone" && c.validUntil === null),
    personalEmail: contacts.some(
      (c) => c.kind === "email" && c.scope === "personal" && c.validUntil === null,
    ),
    college: row.college !== null,
    matriculationYear: row.matriculation_year !== null,
    expectedGraduationYear: row.expected_graduation_year !== null,
    degreeField: row.degree_field !== null,
    dateOfBirth: row.date_of_birth !== null,
    emergencyContact: emergencyContact !== null,
  };
}

/**
 * The transaction-scoped read, exported so `person-write.ts` can read back the
 * record it just changed **inside the same transaction** — a write followed
 * by `readPersonRecord()` would open a second connection and could read the
 * pre-commit state, or deadlock against the write's own row lock.
 */
export async function readPersonRecordIn(tx: Tx, personId: string): Promise<PersonRecord> {
  const row = await readPersonRowIn(tx, personId);
  const [aliases, contacts, emergencyContact, fieldProvenance] = await Promise.all([
    readAliasesIn(tx, personId),
    readContactsIn(tx, personId),
    readEmergencyContactIn(tx, personId),
    readFieldProvenanceIn(tx, personId),
  ]);

  const presence = presenceFrom(row, contacts, emergencyContact);

  return {
    personId: row.person_id,
    givenName: row.given_name,
    givenNameSource: fieldProvenance.given_name,
    familyName: row.family_name,
    familyNameSource: fieldProvenance.family_name,
    aliases,
    displayName: displayNameOf(row),
    status: row.status,
    college: row.college,
    collegeSource: fieldProvenance.college,
    matriculationYear: row.matriculation_year,
    matriculationYearSource: fieldProvenance.matriculation_year,
    expectedGraduationYear: row.expected_graduation_year,
    expectedGraduationYearSource: fieldProvenance.expected_graduation_year,
    degreeField: row.degree_field,
    degreeFieldSource: fieldProvenance.degree_field,
    dateOfBirth: row.date_of_birth,
    dateOfBirthSource: fieldProvenance.date_of_birth,
    emergencyContact,
    contacts,
    isPastMember: row.is_past_member ?? false,
    standingIsOverridden: row.standing_is_overridden ?? false,
    isUnder18: row.is_under_18,
    halfBlueCount: Number(row.half_blue_count ?? 0),
    fullBlueCount: Number(row.full_blue_count ?? 0),
    mergedIntoPersonId: row.merged_into_person_id,
    missingRequiredFields: missingRequiredFields(row.status, presence),
  };
}

/**
 * One person, assembled from every record this mission touches. Throws
 * `NotFound` when the id does not exist, and throws it again — with a
 * different message — when the id names a person merged away under
 * invariant I6.
 *
 * Returns the **full** record. Authorization is not here — the same
 * separation `membership.ts` states for `setMembershipStatus()`: a caller
 * redacts with `src/lib/auth/person-authority.ts`'s `redactPersonRecord()`
 * before this reaches anybody outside the four offices. Keeping the two apart
 * means this function is testable against the database with an arbitrary role,
 * and the redaction is testable with no database at all.
 */
export async function readPersonRecord(personId: string): Promise<PersonRecord> {
  return withTransaction(async (tx) => readPersonRecordIn(tx, personId));
}

// ---------------------------------------------------------------------------
// Search — REQ-person-record, "Search"
// ---------------------------------------------------------------------------

/** The most this call returns. `DEC-w1-12`: query shape and pagination are delegated; the club holds hundreds of people, not millions. */
export const SEARCH_RESULT_LIMIT = 100;

interface SummaryRow {
  person_id: string;
  given_name: string;
  family_name: string | null;
  display_alias: string | null;
  status: AssembledStatus;
  has_mobile: boolean;
  has_personal_email: boolean;
  merged_into_person_id: string | null;
}

function toSummary(row: SummaryRow): PersonSummary {
  const presence: PersonFactPresence = {
    givenName: true,
    familyName: row.family_name !== null,
    mobile: row.has_mobile,
    personalEmail: row.has_personal_email,
    // A list row never carries these facts (`REQ-restricted-fields`), so they
    // cannot be known to be missing from here — `readPersonRecord` is where a
    // caller learns the full missing set for one person.
    college: true,
    matriculationYear: true,
    expectedGraduationYear: true,
    degreeField: true,
    dateOfBirth: true,
    emergencyContact: true,
  };

  return {
    personId: row.person_id,
    givenName: row.given_name,
    familyName: row.family_name,
    displayAlias: row.display_alias,
    displayName: displayNameOf(row),
    status: row.status,
    hasMobile: row.has_mobile,
    hasPersonalEmail: row.has_personal_email,
    mergedIntoPersonId: row.merged_into_person_id,
    missingRequiredFields: missingRequiredFields(row.status, presence),
  };
}

/**
 * Finds people by first name, last name, or **any** alias — including one
 * that is not the display name (`REQ-person-record`: "including an alias that
 * is not the display name"). Never returns a merged-away record.
 *
 * A list-shaped result, structurally: `PersonSummary` has no `dateOfBirth` and
 * no `emergencyContact` field to leave absent, so there is nothing a role
 * check could fail to redact. `DEC-w1-03`'s "missing-data flag" is
 * `missingRequiredFields`, computed only from what a list is allowed to know —
 * academic and safety facts are assumed present here and corrected by opening
 * the full record, which is what keeps this query from reaching restricted
 * columns at all.
 */
export async function searchPeople(
  query: string,
  options: { limit?: number } = {},
): Promise<PersonSummary[]> {
  const term = query.trim();
  if (term === "") {
    throw new ConstraintViolated("Enter a name or alias to search for.", {
      rule: "person_search_requires_a_term",
    });
  }
  const pattern = escapeLikePattern(term.toLowerCase());
  const limit = Math.min(options.limit ?? SEARCH_RESULT_LIMIT, SEARCH_RESULT_LIMIT);

  return withTransaction(async (tx) => {
    const result = await tx.query<SummaryRow>(
      `select p.id as person_id, p.given_name, p.family_name,
              ${personDisplayAliasSql("p")} as display_alias,
              ${personAssembledStatusSql("p")} as status,
              p.merged_into_person_id,
              exists (
                select 1 from public.contact_points c
                 where c.person_id = p.id and c.kind = 'phone' and c.valid_until is null
              ) as has_mobile,
              exists (
                select 1 from public.contact_points c
                 where c.person_id = p.id and c.kind = 'email' and c.scope = 'personal'
                   and c.valid_until is null
              ) as has_personal_email
         from public.people p
        where p.merged_into_person_id is null
          and (
            lower(btrim(p.given_name)) like '%' || $1 || '%'
            or lower(btrim(coalesce(p.family_name, ''))) like '%' || $1 || '%'
            or exists (
              select 1 from public.person_aliases a
               where a.person_id = p.id and lower(btrim(a.alias)) like '%' || $1 || '%'
            )
          )
        order by p.family_name nulls last, p.given_name, p.id
        limit $2`,
      [pattern, limit],
    );

    return result.rows.map(toSummary);
  });
}
