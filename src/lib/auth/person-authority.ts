/**
 * Column visibility for the person record — LAN-183, `REQ-authority` and
 * `REQ-restricted-fields`, answering `Q-4`.
 *
 * Pure. No database. Every function here takes an operator's grants
 * (`./grants.ts`, LAN-429) rather than a session, for the reason
 * `capabilities.ts` gives its own equivalent: the same decision has to be
 * checkable from a test with an arbitrary actor, from a server function and
 * from a page, without any of them differing.
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
 * the grants rather than naming a seat of its own. Since LAN-432 each
 * category asks its own grant: on the roster and People, Person or Contact &
 * emergency at `view`; on a recruit's record, Person information at `view`.
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
import { grantRuleHolds, type CategoryLevel, type GrantRule, type OperatorGrants } from "./grants";

/**
 * The categories a person's record is divided into. Every field this package
 * assembles belongs to exactly one.
 */
export type PersonFieldCategory = "identity" | "contact" | "academic" | "restricted" | "standing";

/**
 * Which surface is asking. The same person is read from the roster and People
 * (`roster`: Person and Contact & emergency) and from a recruit's record
 * (`recruiting`: Person information, one line for the whole person).
 */
export type PersonRecordSurface = "roster" | "recruiting";

function rosterRule(key: "person" | "contact_emergency", minimum: CategoryLevel): GrantRule {
  return Object.freeze({ subject: Object.freeze({ kind: "roster", key }), minimum }) as GrantRule;
}

function recruitRule(minimum: CategoryLevel): GrantRule {
  return Object.freeze({
    subject: Object.freeze({ kind: "recruiting", key: "recruit_person" }),
    minimum,
  }) as GrantRule;
}

/**
 * The grant each category asks at a level, on each surface — LAN-432.
 *
 * On the roster and People: who they are, their academic facts, date of birth
 * and under-18, and where they stand read as Person; mobile, emails and the
 * emergency contact read as Contact & emergency — the three facts W3 splits
 * out of Person into their own section. On a recruit's record every category
 * is Person information. `Object.freeze`, matching `capabilities.ts`'s own
 * posture: no later module may repoint a category by mutation.
 */
export function personCategoryRule(
  category: PersonFieldCategory,
  minimum: CategoryLevel,
  surface: PersonRecordSurface = "roster",
): GrantRule {
  if (surface === "recruiting") return recruitRule(minimum);
  return rosterRule(category === "contact" ? "contact_emergency" : "person", minimum);
}

/** The rule that admits each category to be *read*, on the roster and People. */
export const PERSON_CATEGORY_CAPABILITY: Readonly<Record<PersonFieldCategory, GrantRule>> =
  Object.freeze({
    identity: personCategoryRule("identity", "view"),
    contact: personCategoryRule("contact", "view"),
    academic: personCategoryRule("academic", "view"),
    restricted: personCategoryRule("restricted", "view"),
    standing: personCategoryRule("standing", "view"),
  });

/** Every category key, for exhaustive iteration. */
export const PERSON_FIELD_CATEGORIES: readonly PersonFieldCategory[] = Object.freeze(
  Object.keys(PERSON_CATEGORY_CAPABILITY) as PersonFieldCategory[],
);

/** Do these grants hold the named category on the person record, at `minimum` (default `view`)? */
export function grantsHoldCategory(
  grants: OperatorGrants,
  category: PersonFieldCategory,
  surface: PersonRecordSurface = "roster",
  minimum: CategoryLevel = "view",
): boolean {
  return grantRuleHolds(grants, personCategoryRule(category, minimum, surface));
}

/** Every category these grants hold on the person record. */
export function categoriesGranted(
  grants: OperatorGrants,
  surface: PersonRecordSurface = "roster",
): ReadonlySet<PersonFieldCategory> {
  const granted = new Set<PersonFieldCategory>();
  for (const category of PERSON_FIELD_CATEGORIES) {
    if (grantsHoldCategory(grants, category, surface)) granted.add(category);
  }
  return granted;
}

/**
 * Do these grants hold every category the person record has?
 *
 * On the seeded matrix: the President, Vice-President, Secretary, General
 * Manager and IT Officer; nobody else, including every coaching seat —
 * `Q-4`'s "coaching seats reach no contact value at all" is the specific case
 * of the general rule this function checks.
 */
export function holdsFullPersonRecordAuthority(
  grants: OperatorGrants,
  surface: PersonRecordSurface = "roster",
): boolean {
  return PERSON_FIELD_CATEGORIES.every((category) => grantsHoldCategory(grants, category, surface));
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
    // LAN-366. The same category as the rest of the name: it is shown beside
    // the given and family name and nowhere else.
    middleName: "identity",
    middleNameSource: "identity",
    familyName: "identity",
    familyNameSource: "identity",
    aliases: "identity",
    displayName: "identity",
    // LAN-306. The Known-as alias, shown beside the name: the same category as
    // the name and the alias list it is drawn from, never a wider one.
    knownAs: "identity",
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
    // LAN-267's two identifiers. `academic` rather than `standing`, and
    // deliberately not a sixth category.
    //
    // They are durable, non-contact facts about the person, exactly like
    // college and matriculation year, and LAN-267's own words for how they are
    // held are "under the same privacy handling as the other personal facts" —
    // which is this row. `standing` would be wrong in the one direction that
    // matters: it is the category `missingRequiredFields` sits in, the widest
    // thing on the record, and a personal identifier does not belong in the
    // widest category. A new category is an authority decision (`Q-4`), not
    // one this package makes; if a later grant needs to separate a BAFA
    // number from a college, that is an edit to one row here, which is exactly
    // what the category design is for.
    studentNumber: "academic",
    studentNumberSource: "academic",
    bafaRegistrationNumber: "academic",
    bafaRegistrationNumberSource: "academic",
    dateOfBirth: "restricted",
    dateOfBirthSource: "restricted",
    // LAN-432: the emergency contact is one of Contact & emergency's three
    // facts (W3), so it reads with the mobile and emails, never with Person.
    emergencyContact: "contact",
  });

/**
 * The full person record, redacted to exactly what these grants may
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
  grants: OperatorGrants,
  surface: PersonRecordSurface = "roster",
): Partial<T> {
  const granted = categoriesGranted(grants, surface);
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
