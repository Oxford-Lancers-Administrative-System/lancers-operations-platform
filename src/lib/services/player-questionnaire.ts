import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import {
  claimOnboardingItem,
  RESOLVED_ITEM_STATUSES,
  type OnboardingItemStatus,
} from "./membership";
import { recordOnboardingActivityIn } from "./onboarding-activity-log";
import { readCompiledOutstandingAskIn } from "./onboarding-ask";
import {
  recordOnboardingAgreementIn,
  readOnboardingAgreementsIn,
  type OnboardingAgreement,
  type OnboardingAgreementType,
} from "./onboarding-agreements";
import { writeOnboardingItemHistoryIn } from "./onboarding-item-history";
import {
  grantSeasonMessagingConsentIn,
  hasGrantedSeasonMessagingConsentIn,
  readSeasonMessagingConsentIn,
  type SeasonMessagingConsent,
} from "./messaging-consent";
import {
  raisePersonFactDispute,
  readOpenPersonFactDisputesIn,
  type DisputedPersonField,
} from "./person-fact-dispute";
import { readPersonRecord, readPersonRecordIn, type PersonRecord } from "./person-record";
import { REQUIRED_FIELD_LABELS, type RequiredField } from "./person-required";
import {
  supersedeContactPoint,
  updateEmergencyContactField,
  updatePersonField,
  type EmergencyContactFieldUpdate,
  type PersonFieldUpdate,
} from "./person-write";
import { validateAcademicYear } from "./person-validation";
import { readSeasonLabelIn } from "./seasons";
import {
  EMAIL_SHAPE,
  looksLikeEmail,
  looksLikePhone,
  PHONE_SHAPE,
} from "@/app/operate/roster/new/validation";

/**
 * The player-facing questionnaire's own domain logic — `WP-player-questionnaire`,
 * LAN-216, W4 and W5. Everything `/me/[token]/details` reads and writes lives
 * here, so the route itself stays a thin resolve-throttle-render/redirect
 * shell, matching `src/lib/services/README.md` rule 1: business rules live in
 * a service, never in a route handler.
 *
 * ## What this module does not rebuild
 *
 * Every read and write below composes substrate this mission's earlier
 * packages already shipped — `person-record.ts`, `person-write.ts`,
 * `person-fact-dispute.ts`, `messaging-consent.ts`, `onboarding-ask.ts`,
 * `onboarding-agreements.ts`, `membership.ts`'s `claimOnboardingItem`, and
 * `onboarding-item-history.ts`/`onboarding-activity-log.ts`. This module adds
 * exactly two things neither of them exposes:
 *
 *   1. **The no-silent-overwrite decision** for the seven `people` columns
 *      `person_fact_disputes` already scopes itself to — direct write when the
 *      prior value is empty, unattributed, or the player's own earlier
 *      self-service submission; a raised dispute when it was last set by
 *      somebody else. `readPersonRecordIn`'s `<field>Source` already answers
 *      "who, by name" (`Q-13`); this module adds the one comparison neither
 *      `PersonRecord` nor `person-fact-dispute.ts` exposes — "was that name
 *      *this same person*" — by reading the same `audit_events` action's
 *      `actor_person_id` directly, once per changed field.
 *   2. **Completing the four onboarding items whose "who" is the player or is
 *      derived from what the player just gave** — `code_of_conduct`,
 *      `photo_release`, `contact_academic_details`, `season_welcome_consent`.
 *      `membership.ts`'s own two mutators do not fit: `claimOnboardingItem`
 *      only ever accepts a `trust`-class item (BUCS Play and Hudl, reused here
 *      unchanged), and `resolveOnboardingItem` always records `actorKind:
 *      "operator"`, which would misattribute the player's own confirmation or
 *      a derived completion. Reusing either for these four items is not
 *      possible without misrecording who acted, so this module's own small
 *      writer records `actorKind: "player"` for the two documents and
 *      `actorKind: "system"` for the two derived items instead.
 *
 * ## Emergency contact fields are overwritten in place, not disputed
 *
 * `docs/architecture/data-model.md` and `person-fact-dispute.ts`'s own module
 * note both scope the disputed-fact mechanism to exactly the seven `people`
 * columns `updatePersonField` can silently overwrite. `person_emergency_contacts`
 * is documented as "overwritten in place" — third-party data about somebody
 * who never agreed to be in this system, structurally isolated, with no
 * provenance-ranking mechanism built for it. This module follows that shipped
 * design rather than inventing a second dispute shape the schema does not
 * carry: a player's own correction to an emergency contact field always
 * writes directly, through `updateEmergencyContactField`, exactly as the
 * operator edit surface already does.
 */

// ---------------------------------------------------------------------------
// The step sequence
// ---------------------------------------------------------------------------

export type QuestionnaireStep =
  "details" | "code_of_conduct" | "photo_release" | "bucs_play" | "hudl" | "done";

export const STEP_ORDER: readonly QuestionnaireStep[] = Object.freeze([
  "details",
  "code_of_conduct",
  "photo_release",
  "bucs_play",
  "hudl",
]);

/** The four checklist items this package is the sole writer of, plus the two derived ones. */
export const DIRECT_PLAYER_ITEM_CODES = Object.freeze([
  "code_of_conduct",
  "photo_release",
] as const);
export const DERIVED_ITEM_CODES = Object.freeze([
  "contact_academic_details",
  "season_welcome_consent",
] as const);
export const TRUST_ITEM_CODES = Object.freeze(["bucs_play", "hudl_access"] as const);

/** Every field `updatePersonField` can silently overwrite — `person_fact_disputes`'s own scope. */
export const DISPUTABLE_FIELDS: readonly DisputedPersonField[] = Object.freeze([
  "given_name",
  "family_name",
  "college",
  "matriculation_year",
  "expected_graduation_year",
  "degree_field",
  "date_of_birth",
]);

// ---------------------------------------------------------------------------
// Emergency contact — the four required fields, read with their own provenance
// ---------------------------------------------------------------------------

export interface EmergencyContactFacts {
  givenName: string | null;
  familyName: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  /** Who last touched this row — compared against the subject to say "you" or "the club". */
  recordedByPersonId: string | null;
  recordedAt: Date | null;
}

async function readEmergencyContactFactsIn(
  tx: Tx,
  personId: string,
): Promise<EmergencyContactFacts | null> {
  const result = await tx.query<{
    given_name: string;
    family_name: string | null;
    relationship: string | null;
    phone: string | null;
    email: string | null;
    recorded_by_person_id: string | null;
    updated_at: Date;
  }>(
    `select given_name, family_name, relationship, phone, email,
            recorded_by_person_id, updated_at
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
    recordedByPersonId: row.recorded_by_person_id,
    recordedAt: row.updated_at,
  };
}

/** The four required emergency-contact facts — `relationship` is the one left optional. */
export function emergencyContactIsComplete(facts: EmergencyContactFacts | null): boolean {
  if (!facts) return false;
  return Boolean(facts.givenName && facts.familyName && facts.phone && facts.email);
}

// ---------------------------------------------------------------------------
// The read model
// ---------------------------------------------------------------------------

export interface OutstandingSectionItem {
  label: string;
  step: QuestionnaireStep;
}

export interface OutstandingSection {
  section: string;
  items: OutstandingSectionItem[];
}

export interface QuestionnaireView {
  personId: string;
  seasonId: string;
  seasonLabel: string | null;
  membershipId: string;
  person: PersonRecord;
  emergencyContact: EmergencyContactFacts | null;
  consent: SeasonMessagingConsent | null;
  needsConsentStep: boolean;
  missingRequiredFields: RequiredField[];
  detailsComplete: boolean;
  /** Open disputes on the seven `people` fields — `REQ-no-silent-overwrite`'s own visible trace. */
  openDisputedFields: ReadonlySet<DisputedPersonField>;
  agreements: Record<OnboardingAgreementType, OnboardingAgreement | null>;
  itemStatus: Record<
    (typeof TRUST_ITEM_CODES)[number] | (typeof DIRECT_PLAYER_ITEM_CODES)[number],
    OnboardingItemStatus
  >;
  /** Everything still outstanding for the player, in the sequence's own order. */
  nothingOutstanding: boolean;
  outstandingSections: OutstandingSection[];
  /** The first step the sequence should resume at, or `"done"` when nothing needs it. */
  nextStep: QuestionnaireStep;
}

async function readAgreementsByTypeIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<Record<OnboardingAgreementType, OnboardingAgreement | null>> {
  const rows = await readOnboardingAgreementsIn(tx, personId, seasonId);
  const byType: Record<OnboardingAgreementType, OnboardingAgreement | null> = {
    code_of_conduct: null,
    photo_release: null,
  };
  for (const row of rows) byType[row.agreementType] = row;
  return byType;
}

/** The one whole read `/me/[token]/details` needs, assembled from substrate the mission already built. */
export async function readQuestionnaireViewIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<QuestionnaireView | null> {
  const ask = await readCompiledOutstandingAskIn(tx, personId, seasonId);
  if (!ask) return null;

  const [person, emergencyContact, consent, agreements, seasonLabel, disputes] = await Promise.all([
    readPersonRecordIn(tx, personId),
    readEmergencyContactFactsIn(tx, personId),
    readSeasonMessagingConsentIn(tx, personId, seasonId),
    readAgreementsByTypeIn(tx, personId, seasonId),
    readSeasonLabelIn(tx, seasonId),
    readOpenPersonFactDisputesIn(tx, personId),
  ]);
  const openDisputedFields = new Set(disputes.map((d) => d.field));

  const needsConsentStep = ask.hasGrantedConsent === false;
  const missingRequiredFields = ask.missingRequiredFields;
  const detailsComplete =
    missingRequiredFields.length === 0 &&
    emergencyContactIsComplete(emergencyContact) &&
    !needsConsentStep;

  const itemByCode = new Map(ask.outstandingItems.map((item) => [item.code, item.status]));
  const itemStatus: QuestionnaireView["itemStatus"] = {
    code_of_conduct: itemByCode.get("code_of_conduct") ?? "complete",
    photo_release: itemByCode.get("photo_release") ?? "complete",
    bucs_play: itemByCode.get("bucs_play") ?? "complete",
    hudl_access: itemByCode.get("hudl_access") ?? "complete",
  };
  // `readCompiledOutstandingAskIn` only lists items still `pending`/`invited`/
  // `claimed` — an absent code means resolved, and every code above genuinely
  // exists once `generateOnboardingItems` has run (LAN-214), so `"complete"`
  // is a safe fallback rather than a guess.

  const codeOfConductDone = itemStatus.code_of_conduct === "complete";
  const photoReleaseDone = itemStatus.photo_release === "complete";
  const bucsDone =
    itemStatus.bucs_play === "claimed" || RESOLVED_ITEM_STATUSES.includes(itemStatus.bucs_play);
  const hudlDone =
    itemStatus.hudl_access === "claimed" || RESOLVED_ITEM_STATUSES.includes(itemStatus.hudl_access);

  const sections: OutstandingSection[] = [];

  const detailItems: OutstandingSectionItem[] = [];
  for (const field of missingRequiredFields) {
    if (field === "emergency_contact") continue; // covered granularly below
    detailItems.push({ label: REQUIRED_FIELD_LABELS[field], step: "details" });
  }
  if (!emergencyContactIsComplete(emergencyContact)) {
    const missing: string[] = [];
    if (!emergencyContact?.givenName) missing.push("first name");
    if (!emergencyContact?.familyName) missing.push("last name");
    if (!emergencyContact?.phone) missing.push("phone");
    if (!emergencyContact?.email) missing.push("email");
    if (missing.length > 0) {
      detailItems.push({ label: `Emergency contact ${missing.join(", ")}`, step: "details" });
    }
  }
  if (needsConsentStep) {
    detailItems.push({ label: "Messaging consent", step: "details" });
  }
  if (detailItems.length > 0) sections.push({ section: "Your details", items: detailItems });

  if (!codeOfConductDone) {
    sections.push({
      section: "Code of Conduct",
      items: [{ label: "Read and agree to the Code of Conduct", step: "code_of_conduct" }],
    });
  }
  if (!photoReleaseDone) {
    sections.push({
      section: "Photo release",
      items: [{ label: "Read and agree to the photo release", step: "photo_release" }],
    });
  }
  if (!bucsDone) {
    sections.push({
      section: "BUCS Play",
      items: [{ label: "Confirm you have registered", step: "bucs_play" }],
    });
  }
  if (!hudlDone) {
    sections.push({
      section: "Hudl",
      items: [{ label: "Confirm you have accepted your invitation", step: "hudl" }],
    });
  }

  const nothingOutstanding = sections.length === 0;

  let nextStep: QuestionnaireStep = "done";
  if (!detailsComplete) nextStep = "details";
  else if (!codeOfConductDone) nextStep = "code_of_conduct";
  else if (!photoReleaseDone) nextStep = "photo_release";
  else if (!bucsDone) nextStep = "bucs_play";
  else if (!hudlDone) nextStep = "hudl";

  return {
    personId,
    seasonId,
    seasonLabel,
    membershipId: ask.membershipId,
    person,
    emergencyContact,
    consent,
    needsConsentStep,
    missingRequiredFields,
    detailsComplete,
    openDisputedFields,
    agreements,
    itemStatus,
    nothingOutstanding,
    outstandingSections: sections,
    nextStep,
  };
}

export async function readQuestionnaireView(
  personId: string,
  seasonId: string,
): Promise<QuestionnaireView | null> {
  return withTransaction((tx) => readQuestionnaireViewIn(tx, personId, seasonId));
}

// ---------------------------------------------------------------------------
// Item completion — the two shapes `membership.ts` does not offer
// ---------------------------------------------------------------------------

interface OnboardingItemLookup {
  id: string;
  status: OnboardingItemStatus;
}

async function findOnboardingItemIn(
  tx: Tx,
  membershipId: string,
  code: string,
): Promise<OnboardingItemLookup | null> {
  const result = await tx.query<{ id: string; status: OnboardingItemStatus }>(
    `select i.id, i.status::text as status
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
      where i.season_membership_id = $1::uuid and t.code = $2
      limit 1`,
    [membershipId, code],
  );
  const row = result.rows[0];
  return row ? { id: row.id, status: row.status } : null;
}

/**
 * Completes one of the four player/derived items, once, forward-only.
 *
 * A season with no configured item of this code (should not happen once
 * `generateOnboardingItems` has run — LAN-214 — but this module never assumes
 * another package's invariant) or one already resolved is a no-op: there is
 * nothing this call needs to do, and nothing here ever reopens an item — that
 * stays an operator's `resolveOnboardingItem` action, four-role, `W7`'s.
 */
async function completePlayerOrDerivedItemIn(
  tx: Tx,
  params: {
    membershipId: string;
    code: string;
    actorKind: "player" | "system";
    actorPersonId: string | null;
  },
): Promise<void> {
  const item = await findOnboardingItemIn(tx, params.membershipId, params.code);
  if (!item) return;
  if (RESOLVED_ITEM_STATUSES.includes(item.status)) return;

  await tx.query(
    `update public.onboarding_items
        set status = 'complete'::public.onboarding_item_status,
            completed_on = current_date,
            updated_at = now()
      where id = $1::uuid`,
    [item.id],
  );

  await writeOnboardingItemHistoryIn(tx, {
    onboardingItemId: item.id,
    seasonMembershipId: params.membershipId,
    fromStatus: item.status,
    toStatus: "complete",
    actorKind: params.actorKind,
    actorPersonId: params.actorKind === "system" ? null : params.actorPersonId,
  });
}

/**
 * Recomputes the two derived items against what is on record right now —
 * item 9 ("contact & academic details… completes when every required field
 * is present") and item 12 ("season welcome & consent… approval is what
 * completes it"), item-and-ask-inventory.md's own words. Called after every
 * details save and safe to call at any other time: forward-only, and a no-op
 * once complete.
 */
async function syncDerivedItemsIn(
  tx: Tx,
  params: { personId: string; seasonId: string; membershipId: string },
): Promise<void> {
  const [person, emergencyContact, grantedConsent] = await Promise.all([
    readPersonRecordIn(tx, params.personId),
    readEmergencyContactFactsIn(tx, params.personId),
    hasGrantedSeasonMessagingConsentIn(tx, params.personId, params.seasonId),
  ]);

  if (person.missingRequiredFields.length === 0 && emergencyContactIsComplete(emergencyContact)) {
    await completePlayerOrDerivedItemIn(tx, {
      membershipId: params.membershipId,
      code: "contact_academic_details",
      actorKind: "system",
      actorPersonId: null,
    });
  }

  if (grantedConsent) {
    await completePlayerOrDerivedItemIn(tx, {
      membershipId: params.membershipId,
      code: "season_welcome_consent",
      actorKind: "system",
      actorPersonId: null,
    });
  }
}

// ---------------------------------------------------------------------------
// The no-silent-overwrite decision — the seven disputable `people` fields
// ---------------------------------------------------------------------------

const PROVENANCE_ACTION_BY_FIELD: Readonly<Record<DisputedPersonField, string>> = Object.freeze({
  given_name: "person_given_name_updated",
  family_name: "person_family_name_updated",
  college: "person_college_updated",
  matriculation_year: "person_matriculation_year_updated",
  expected_graduation_year: "person_expected_graduation_year_updated",
  degree_field: "person_degree_field_updated",
  date_of_birth: "person_date_of_birth_updated",
});

/**
 * Who last changed this field, through the application — the one comparison
 * `readPersonRecordIn`'s own `<field>Source` (a display name) cannot make on
 * its own. `null` covers both "never audited" (matching `<field>Source ===
 * null`) and, defensively, a row whose actor was somehow not recorded.
 */
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

const PERSON_FIELD_SOURCE_KEY: Readonly<Record<DisputedPersonField, keyof PersonRecord>> =
  Object.freeze({
    given_name: "givenNameSource",
    family_name: "familyNameSource",
    college: "collegeSource",
    matriculation_year: "matriculationYearSource",
    expected_graduation_year: "expectedGraduationYearSource",
    degree_field: "degreeFieldSource",
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
    date_of_birth: "dateOfBirth",
  });

export type FieldSaveOutcome = "unchanged" | "filled" | "self-corrected" | "disputed";

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
    case "date_of_birth":
      return { field, value };
    case "matriculation_year":
      return { field, value: Number.parseInt(value, 10) };
    case "expected_graduation_year":
      return { field, value: Number.parseInt(value, 10) };
  }
}

/**
 * Applies one submitted value for one of the seven disputable fields —
 * `REQ-no-silent-overwrite`. `newValue` is the trimmed, already-validated
 * string the form collected; an empty string is treated as "nothing
 * submitted" (never a clearing edit — this page has no way to blank a
 * required fact, matching `OD7-required-no-decline`).
 *
 * Four branches, decided fresh against the record read at the top of this
 * same save:
 *
 *   - nothing changed → `"unchanged"`, nothing written;
 *   - the field was empty → direct write, `"filled"`;
 *   - the field was non-empty but its most recent change has no attributable
 *     actor (seeded, imported, or `person_created`) → direct write,
 *     `"filled"` — nobody asserted the old value (the locked recommendation
 *     `REQ-no-silent-overwrite`'s own null-provenance row);
 *   - the field's most recent change was **this same person** → direct
 *     write, `"self-corrected"` — their own earlier answer, their
 *     prerogative (W5's own table, row 1);
 *   - otherwise (an operator, or anybody else) → `raisePersonFactDispute`,
 *     `"disputed"` — both values kept, a four-role operator decides (`W7`).
 */
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

  await raisePersonFactDispute({
    personId,
    field,
    clubValue: String(currentValue),
    playerValue: trimmed,
    raisedByPersonId: personId,
  });
  return "disputed";
}

// ---------------------------------------------------------------------------
// The step 1 save — every field this call was given, applied in one pass
// ---------------------------------------------------------------------------

export interface DetailsStepInput {
  personId: string;
  seasonId: string;
  membershipId: string;
  grantConsent: boolean;
  fields: Partial<Record<DisputedPersonField, string>>;
  mobile: string;
  personalEmail: string;
  emergencyContact: {
    givenName: string;
    familyName: string;
    relationship: string;
    phone: string;
    email: string;
  };
}

export interface DetailsStepResult {
  errors: Record<string, string>;
  outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>>;
}

/**
 * Validates first, writes only what actually changed — the same posture
 * `/operate/people/[personId]/edit`'s own action takes: nothing is written
 * until every submitted value that needs a shape check has passed one, so a
 * single malformed field never leaves the record half-updated.
 *
 * Every write below is its own already-audited, already-transactional call
 * (`updatePersonField`, `supersedeContactPoint`, `updateEmergencyContactField`,
 * `raisePersonFactDispute`) — none of them expose a transaction-scoped
 * variant, so this save is a sequence of independently-committed steps
 * rather than one all-or-nothing transaction. That is not a shortcut: it is
 * the exact semantics `REQ-required-set` asks for — "whatever a step saved
 * stays saved" — a save interrupted partway through still keeps everything
 * that committed before the interruption, rather than losing it to a
 * rollback.
 */
export async function saveDetailsStep(input: DetailsStepInput): Promise<DetailsStepResult> {
  const current = await readPersonRecord(input.personId);
  const errors: Record<string, string> = {};

  // Mobile, personal email and the two emergency-contact fields all share one
  // shape idiom — `src/app/operate/roster/new/validation.ts`'s own
  // `looksLikePhone`/`looksLikeEmail` — rather than each inventing its own,
  // per Brian's correction (B-001, LAN-216 round 1): "Should be the same as
  // all other form validations we have." A blank value is never rejected here
  // — required-ness is a separate check (`missingRequiredFields`) — this only
  // catches a value that was actually typed and does not look like its kind.
  const mobileChanged = input.mobile.trim() !== "" && needsMobileWrite(current, input.mobile);
  if (mobileChanged && !looksLikePhone(input.mobile)) errors.mobile = PHONE_SHAPE;
  const emailChanged =
    input.personalEmail.trim() !== "" && needsPersonalEmailWrite(current, input.personalEmail);
  if (emailChanged && !looksLikeEmail(input.personalEmail)) errors.personalEmail = EMAIL_SHAPE;
  if (input.emergencyContact.phone.trim() !== "" && !looksLikePhone(input.emergencyContact.phone)) {
    errors.ec_phone = PHONE_SHAPE;
  }
  if (input.emergencyContact.email.trim() !== "" && !looksLikeEmail(input.emergencyContact.email)) {
    errors.ec_email = EMAIL_SHAPE;
  }
  if (input.fields.matriculation_year) {
    const validation = validateAcademicYear(input.fields.matriculation_year, "Matriculation year");
    if (!validation.valid) errors.matriculation_year = validation.message;
  }
  if (input.fields.expected_graduation_year) {
    const validation = validateAcademicYear(
      input.fields.expected_graduation_year,
      "Expected graduation",
    );
    if (!validation.valid) errors.expected_graduation_year = validation.message;
  }

  if (Object.keys(errors).length > 0) {
    return { errors, outcomes: {} };
  }

  if (input.grantConsent) {
    // Idempotent by construction: a crafted resubmission of an already-granted
    // tick must never bump `changed_at` again, so this is checked and granted
    // inside one transaction rather than granted unconditionally.
    await withTransaction(async (tx) => {
      const granted = await hasGrantedSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
      if (!granted) await grantSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
    });
  }

  const outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>> = {};
  for (const field of DISPUTABLE_FIELDS) {
    const raw = input.fields[field];
    if (raw === undefined) continue;
    const outcome = await withTransaction((tx) =>
      applyDisputableFieldIn(tx, {
        personId: input.personId,
        field,
        currentRecord: current,
        newValue: raw,
      }),
    );
    outcomes[field] = outcome;
  }

  if (mobileChanged) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "phone",
      rawValue: input.mobile,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }
  if (emailChanged) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "email",
      scope: "personal",
      rawValue: input.personalEmail,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }

  await writeEmergencyContactIn(input.personId, input.emergencyContact);

  await withTransaction(async (tx) => {
    await syncDerivedItemsIn(tx, {
      personId: input.personId,
      seasonId: input.seasonId,
      membershipId: input.membershipId,
    });
    await recordOnboardingActivityIn(tx, {
      membershipId: input.membershipId,
      seasonId: input.seasonId,
      section: "Your details",
      kind: "answer",
      channel: "signed link",
      actorPersonId: input.personId,
    });
  });

  return { errors: {}, outcomes };
}

function needsMobileWrite(record: PersonRecord, raw: string): boolean {
  const current = record.contacts.find((c) => c.kind === "phone" && c.validUntil === null);
  return (current?.rawValue ?? "") !== raw.trim();
}

function needsPersonalEmailWrite(record: PersonRecord, raw: string): boolean {
  const current = record.contacts.find(
    (c) => c.kind === "email" && c.scope === "personal" && c.validUntil === null,
  );
  return (current?.rawValue ?? "") !== raw.trim();
}

/**
 * Emergency contact fields are overwritten in place (see the module note) —
 * one `updateEmergencyContactField` call per field that changed, `given_name`
 * always first so a fresh record is never started on any other field
 * (`person_emergency_contacts_given_name_not_blank`, enforced by that
 * function itself).
 */
type EmergencyContactField = "given_name" | "family_name" | "relationship" | "phone" | "email";

const EMERGENCY_CONTACT_FIELD_ORDER: readonly EmergencyContactField[] = Object.freeze([
  "given_name",
  "family_name",
  "relationship",
  "phone",
  "email",
]);

/** One call per field, keeping `updateEmergencyContactField`'s own discriminated union real. */
function emergencyContactUpdateFor(
  field: EmergencyContactField,
  value: string,
): EmergencyContactFieldUpdate {
  switch (field) {
    case "given_name":
      return { field, value };
    case "family_name":
      return { field, value };
    case "relationship":
      return { field, value };
    case "phone":
      return { field, value };
    case "email":
      return { field, value };
  }
}

async function writeEmergencyContactIn(
  personId: string,
  submitted: DetailsStepInput["emergencyContact"],
): Promise<void> {
  const current = await withTransaction((tx) => readEmergencyContactFactsIn(tx, personId));
  const submittedByField: Record<EmergencyContactField, string> = {
    given_name: submitted.givenName.trim(),
    family_name: submitted.familyName.trim(),
    relationship: submitted.relationship.trim(),
    phone: submitted.phone.trim(),
    email: submitted.email.trim(),
  };
  const currentByField: Record<EmergencyContactField, string | null> = {
    given_name: current?.givenName ?? null,
    family_name: current?.familyName ?? null,
    relationship: current?.relationship ?? null,
    phone: current?.phone ?? null,
    email: current?.email ?? null,
  };

  for (const field of EMERGENCY_CONTACT_FIELD_ORDER) {
    const value = submittedByField[field];
    if (value === "") continue; // never clears a field — no decline, ever
    if ((currentByField[field] ?? "") === value) continue;

    const hadValue = currentByField[field] !== null;
    await updateEmergencyContactField({
      actorPersonId: personId,
      personId,
      reason: hadValue ? "Player self-service correction." : null,
      ...emergencyContactUpdateFor(field, value),
    });
  }
}

// ---------------------------------------------------------------------------
// Steps 2 and 3 — the two documents
// ---------------------------------------------------------------------------

const AGREEMENT_SECTION_LABEL: Record<OnboardingAgreementType, string> = {
  code_of_conduct: "Code of Conduct",
  photo_release: "Photo release",
};

/**
 * Records one document's agreement, completes its onboarding item, and logs
 * the answer — one transaction, since `recordOnboardingAgreementIn` and
 * `writeOnboardingItemHistoryIn` both expose a transaction-scoped variant.
 * `onboarding_agreements_one_per_person_season_type` refuses a second call
 * for the same (person, season, type) — this is genuinely a once-per-season
 * action, matching item 11's own "asked of everyone every season".
 */
export async function agreeOnboardingDocument(params: {
  personId: string;
  seasonId: string;
  membershipId: string;
  agreementType: OnboardingAgreementType;
}): Promise<OnboardingAgreement> {
  return withTransaction(async (tx) => {
    const agreement = await recordOnboardingAgreementIn(tx, {
      personId: params.personId,
      seasonId: params.seasonId,
      agreementType: params.agreementType,
    });
    await completePlayerOrDerivedItemIn(tx, {
      membershipId: params.membershipId,
      code: params.agreementType,
      actorKind: "player",
      actorPersonId: params.personId,
    });
    await recordOnboardingActivityIn(tx, {
      membershipId: params.membershipId,
      seasonId: params.seasonId,
      section: AGREEMENT_SECTION_LABEL[params.agreementType],
      kind: "answer",
      channel: "signed link",
      actorPersonId: params.personId,
    });
    return agreement;
  });
}

// ---------------------------------------------------------------------------
// Steps 4 and 5 — BUCS Play and Hudl, the two trust-class claims
// ---------------------------------------------------------------------------

const TRUST_SECTION_LABEL: Record<(typeof TRUST_ITEM_CODES)[number], string> = {
  bucs_play: "BUCS Play",
  hudl_access: "Hudl",
};

/**
 * The player's own "yes, I've done it" — `claimOnboardingItem`, unchanged.
 * Idempotent from this module's side: a step already `claimed` or resolved is
 * left exactly as it is rather than raising the substrate's own
 * `onboarding_item_already_in_that_state` refusal, because "someone
 * returning part-way" (W4) must never see an error for a step they already
 * finished.
 */
export async function claimTrustItem(params: {
  personId: string;
  seasonId: string;
  membershipId: string;
  code: (typeof TRUST_ITEM_CODES)[number];
}): Promise<void> {
  const item = await withTransaction((tx) =>
    findOnboardingItemIn(tx, params.membershipId, params.code),
  );
  if (!item || item.status === "claimed" || RESOLVED_ITEM_STATUSES.includes(item.status)) {
    return;
  }

  await claimOnboardingItem({
    actorPersonId: params.personId,
    membershipId: params.membershipId,
    itemId: item.id,
  });

  await withTransaction((tx) =>
    recordOnboardingActivityIn(tx, {
      membershipId: params.membershipId,
      seasonId: params.seasonId,
      section: TRUST_SECTION_LABEL[params.code],
      kind: "answer",
      channel: "signed link",
      actorPersonId: params.personId,
    }),
  );
}

/**
 * Hudl's second answer — "no invitation has reached me". Nothing here moves
 * the item's status: the invitation genuinely has not gone out, so the item
 * stays exactly as outstanding as it was, and this is purely the record the
 * club reads to see the player is not the hold-up. No column exists to carry
 * this as a distinct state without a migration this package does not own, so
 * it is recorded the same way every other player answer is — the activity
 * log, whose `channel` already carries free text describing how an answer
 * arrived.
 */
export async function recordHudlNoInvitation(params: {
  personId: string;
  seasonId: string;
  membershipId: string;
}): Promise<void> {
  await withTransaction((tx) =>
    recordOnboardingActivityIn(tx, {
      membershipId: params.membershipId,
      seasonId: params.seasonId,
      section: "Hudl",
      kind: "answer",
      channel: "signed link — reports no invitation received",
      actorPersonId: params.personId,
    }),
  );
}
