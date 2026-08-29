/**
 * Column visibility for the person record — LAN-183, `REQ-authority` and
 * `REQ-restricted-fields`, answering `Q-4`.
 *
 * Pure. No database. Every function here takes role codes rather than a
 * session, for the reason `capabilities.ts` gives its own equivalent: the same
 * decision has to be checkable from a test with an arbitrary actor, from a
 * server function and from a page, without any of them differing.
 *
 * ## The decision this module builds to (`Q-4`, Brian, 2026-08-28)
 *
 * > The four offices keep everything; coaching seats reach no contact value at
 * > all; column visibility is a function of category grants, so widening
 * > access later drops restricted columns automatically. No login, seat or
 * > club role is granted or changed anywhere in this mission.
 *
 * `REQ-authority`, verbatim: "Every surface in this mission is four-role only
 * — President, Vice-President, Secretary, General Manager. Anything the
 * viewer's role does not grant is absent from the DOM and the payload."
 * Nothing here is scoped to "contact" alone: every category a person's record
 * carries is gated the same way, because the requirement gates the *surface*,
 * not one field on it.
 *
 * ## Why the grant itself lives in `capabilities.ts`, not here
 *
 * `tests/capability-map-single-source.test.ts` makes `capabilities.ts` the
 * only module in `src/` permitted to name a `public.roles` code in a string
 * literal — "the capability map is the only place a role code decides
 * anything." This module answers a role-code question, so it reads
 * `capabilityRoleCodes("person_record_authority")` rather than naming a seat
 * of its own. That entry is where the administrative seat's inclusion is
 * decided too, on the same LAN-124 precedent every other grant in that file
 * carries — this module has no independent opinion about it.
 *
 * ## Why categories, not a field-by-field list
 *
 * `Q-4`'s "column visibility is a function of category grants, so widening
 * access later drops restricted columns automatically" is the load-bearing
 * sentence. A per-field allow-list would need a fresh look at every field
 * whenever a new grant is drafted; a category means a later mission that grants
 * a coaching seat `"contact"` gets exactly email and phone, and gets no
 * `"restricted"` category, without anybody re-enumerating fields. This module
 * defines what each category contains once; nothing above it redeclares a
 * field's category on its own authority. Every category reads the same single
 * capability today, because `REQ-authority` gates the whole record on one
 * four-role test rather than differentiating within it — the categories exist
 * as separate keys so that a later, different decision (`Q-4`'s own example —
 * "coaching seats may hold `contact`") is a new capability and an edit to one
 * row of `PERSON_CATEGORY_CAPABILITY`, not a redesign.
 *
 * ## What this module does not decide
 *
 * `REQ-restricted-fields` is stronger than a category grant for date of birth
 * and emergency contact: they must never appear "on any list, board or queue" —
 * that is a shape rule (list rows never carry them, whoever is asking), not
 * only a role rule, and it is enforced by `person-record.ts` never putting
 * them on a list-shaped result rather than by this module redacting them out
 * after the fact. `redactPersonRecord` below is the *single-record* read's
 * gate; it is not consulted for a list, a board or a queue at all.
 */
import { type CapabilityKey, capabilityRoleCodes } from "./capabilities";

/**
 * The categories a person's record is divided into. Every field this package
 * assembles belongs to exactly one.
 */
export type PersonFieldCategory = "identity" | "contact" | "academic" | "restricted" | "standing";

/**
 * Which capability grants each category, on the person record.
 *
 * Every category reads `person_record_authority` today — see the module note
 * on why they are still separate keys. `Object.freeze`, matching
 * `capabilities.ts`'s own posture: no later module may repoint a category at
 * a different capability by mutation.
 */
export const PERSON_CATEGORY_CAPABILITY: Readonly<Record<PersonFieldCategory, CapabilityKey>> =
  Object.freeze({
    identity: "person_record_authority",
    contact: "person_record_authority",
    academic: "person_record_authority",
    restricted: "person_record_authority",
    standing: "person_record_authority",
  });

/** Every category key, for exhaustive iteration. */
export const PERSON_FIELD_CATEGORIES: readonly PersonFieldCategory[] = Object.freeze(
  Object.keys(PERSON_CATEGORY_CAPABILITY) as PersonFieldCategory[],
);

/** Does this set of role codes hold the named category on the person record? */
export function roleCodesHoldCategory(
  roleCodes: readonly string[],
  category: PersonFieldCategory,
): boolean {
  const permitted = capabilityRoleCodes(PERSON_CATEGORY_CAPABILITY[category]);
  if (permitted.length === 0) return false;
  return roleCodes.some((code) => permitted.includes(code));
}

/** Every category this set of role codes holds on the person record. */
export function categoriesGranted(roleCodes: readonly string[]): ReadonlySet<PersonFieldCategory> {
  const granted = new Set<PersonFieldCategory>();
  for (const category of PERSON_FIELD_CATEGORIES) {
    if (roleCodesHoldCategory(roleCodes, category)) granted.add(category);
  }
  return granted;
}

/**
 * Does this set of role codes hold every category the person record has?
 *
 * The four offices today; nobody else, including every coaching seat —
 * `Q-4`'s "coaching seats reach no contact value at all" is the specific case
 * of the general rule this function checks.
 */
export function holdsFullPersonRecordAuthority(roleCodes: readonly string[]): boolean {
  return PERSON_FIELD_CATEGORIES.every((category) => roleCodesHoldCategory(roleCodes, category));
}

/**
 * Which category each field of the full person record belongs to.
 *
 * `person-record.ts`'s `PersonRecord` keys, named here rather than there —
 * this is the file `REQ-authority`'s checkpoint-approval covers, and a
 * category assignment is an authority decision even when the field itself is
 * assembled elsewhere. Widening or narrowing what a category contains is an
 * edit to this one table.
 */
export const PERSON_RECORD_FIELD_CATEGORY: Readonly<Record<string, PersonFieldCategory>> =
  Object.freeze({
    personId: "identity",
    givenName: "identity",
    givenNameSource: "identity",
    familyName: "identity",
    familyNameSource: "identity",
    aliases: "identity",
    displayName: "identity",
    status: "standing",
    isPastMember: "standing",
    standingIsOverridden: "standing",
    isUnder18: "restricted",
    halfBlueCount: "standing",
    fullBlueCount: "standing",
    mergedIntoPersonId: "identity",
    missingRequiredFields: "standing",
    contacts: "contact",
    college: "academic",
    collegeSource: "academic",
    matriculationYear: "academic",
    matriculationYearSource: "academic",
    expectedGraduationYear: "academic",
    expectedGraduationYearSource: "academic",
    degreeField: "academic",
    degreeFieldSource: "academic",
    dateOfBirth: "restricted",
    dateOfBirthSource: "restricted",
    emergencyContact: "restricted",
  });

/**
 * The full person record, redacted to exactly what this set of role codes may
 * see — every disallowed key **absent from the object**, not present with a
 * `null` or a placeholder. `REQ-authority`: "absent from the DOM and the
 * payload, not hidden in it." `Object.keys()` on the result never names a key
 * this viewer was not granted; that is what LAN-183's acceptance criterion —
 * "proved by a test that inspects the payload" — checks.
 *
 * Generic over the record shape so `person-record.ts` does not have to import
 * this module's own type for its return value; it only has to agree on field
 * names, which `PERSON_RECORD_FIELD_CATEGORY` is the single list of.
 */
export function redactPersonRecord<T extends Record<string, unknown>>(
  record: T,
  roleCodes: readonly string[],
): Partial<T> {
  const granted = categoriesGranted(roleCodes);
  const visible: Partial<T> = {};

  for (const key of Object.keys(record) as (keyof T & string)[]) {
    const category = PERSON_RECORD_FIELD_CATEGORY[key];
    // A field this table does not name is not silently shown: absence of a
    // decision is never permission, the same posture `capabilities.ts` states
    // for an empty role list. Add the field to the table above to grant it.
    if (category !== undefined && granted.has(category)) {
      visible[key] = record[key];
    }
  }

  return visible;
}
