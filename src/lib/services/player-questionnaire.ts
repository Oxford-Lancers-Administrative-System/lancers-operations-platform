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
import { readOpenPersonFactDisputesIn, type DisputedPersonField } from "./person-fact-dispute";
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
import { EMAIL_SHAPE, PHONE_SHAPE } from "@/app/operate/roster/new/validation";
import { looksLikeEmail, looksLikePhone } from "@/lib/validation/contact";

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
 *   1. **The provenance-aware write** for the seven `people` columns
 *      `person_fact_disputes` used to scope its now-removed dispute mechanism
 *      to (B-002, correction round 2, Q-9) — direct write in every case: when
 *      the prior value is empty, unattributed, the player's own earlier
 *      self-service submission, or somebody else's — last write wins,
 *      whoever gave it, with `updatePersonField`'s own audit row carrying who
 *      and when. `readPersonRecordIn`'s `<field>Source` already answers "who,
 *      by name" (`Q-13`); this module adds the one comparison neither
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
  /**
   * Who actually supplied each of the seven disputable fields' current value
   * — F4 (LAN-230). `"you"` when the most recent `person_<field>_updated` row
   * names this same person, `"club"` when it names anybody else, `null` when
   * there is no such row at all (seeded, imported, or never edited — nothing
   * to attribute). The display used to hard-code "you" or "the club" by
   * field *name* regardless of this; this is the one comparison
   * `PersonRecord`'s own `<field>Source` (a display name, not an id) cannot
   * make on its own — see `readFieldSuppliedByIn`.
   */
  fieldSuppliedBy: Record<DisputedPersonField, "you" | "club" | null>;
  agreements: Record<OnboardingAgreementType, OnboardingAgreement | null>;
  /**
   * `null` means no `onboarding_items` row of this code exists for this
   * membership at all — F2 (LAN-230): "a season with no configured item
   * types yields no items… a real configuration state, not a failure"
   * (`generateOnboardingItems`'s own module note), and it must read that way
   * here too rather than defaulting to `"complete"`. Never treated as done by
   * anything in this module — matching the operator record's own "This
   * season has no onboarding items configured" honesty.
   */
  itemStatus: Record<
    (typeof TRUST_ITEM_CODES)[number] | (typeof DIRECT_PLAYER_ITEM_CODES)[number],
    OnboardingItemStatus | null
  >;
  /** Everything still outstanding for the player, in the sequence's own order. */
  nothingOutstanding: boolean;
  outstandingSections: OutstandingSection[];
  /** The first step the sequence should resume at, or `"done"` when nothing needs it. */
  nextStep: QuestionnaireStep;
  /**
   * When this membership's most recent player answer was actually recorded —
   * B2 (LAN-230 correction round 1). The Done screen is revisitable for the
   * whole season (`W4`/`W5`), so `new Date()` there misstated the date on
   * every reopen after the day it was first shown. `null` only for a
   * membership `readQuestionnaireView` can somehow reach with no recorded
   * answer at all — not expected on a page reached by having answered
   * something, but never assumed.
   */
  lastAnsweredAt: Date | null;
}

/**
 * The most recent time this membership actually saved something — B2
 * (LAN-230 correction round 1). `onboarding_activity_log` already carries one
 * `kind = 'answer'` row per save (`recordOnboardingActivityIn`, written by
 * every action in this module), so this is a read of substrate already kept
 * for exactly this reason, not a new one.
 */
async function readLastAnsweredAtIn(tx: Tx, membershipId: string): Promise<Date | null> {
  const result = await tx.query<{ occurred_at: Date | null }>(
    `select max(occurred_at) as occurred_at
       from public.onboarding_activity_log
      where season_membership_id = $1::uuid and kind = 'answer'`,
    [membershipId],
  );
  return result.rows[0]?.occurred_at ?? null;
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

  const [person, emergencyContact, consent, agreements, seasonLabel, disputes, fieldSuppliedBy] =
    await Promise.all([
      readPersonRecordIn(tx, personId),
      readEmergencyContactFactsIn(tx, personId),
      readSeasonMessagingConsentIn(tx, personId, seasonId),
      readAgreementsByTypeIn(tx, personId, seasonId),
      readSeasonLabelIn(tx, seasonId),
      readOpenPersonFactDisputesIn(tx, personId),
      readFieldSuppliedByIn(tx, personId),
    ]);
  const openDisputedFields = new Set(disputes.map((d) => d.field));

  const needsConsentStep = ask.hasGrantedConsent === false;
  const missingRequiredFields = ask.missingRequiredFields;
  const detailsComplete =
    missingRequiredFields.length === 0 &&
    emergencyContactIsComplete(emergencyContact) &&
    !needsConsentStep;

  const [itemStatus, trustClaimed, lastAnsweredAt] = await Promise.all([
    readDisplayedItemStatusesIn(tx, ask.membershipId),
    readTrustClaimedIn(tx, ask.membershipId),
    readLastAnsweredAtIn(tx, ask.membershipId),
  ]);

  // The `|| agreements… !== null` half is F2's own necessary companion, found
  // walking the fix live: `agreeDocument` advances by *resuming* to the next
  // outstanding step (`nextStepUrl`), never by a literal one (unlike BUCS/Hudl,
  // which always advance regardless — `literalNextStepUrl`, "nothing gates").
  // With no configured `code_of_conduct`/`photo_release` item,
  // `completePlayerOrDerivedItemIn` has nothing to mark complete, so
  // `itemStatus` alone would leave a player who *did* agree stuck resuming to
  // the same step forever — a deadlock this fix would otherwise introduce.
  // `agreements` (`onboarding_agreements`, read above) is the item-independent
  // record of that same fact, already on hand.
  const codeOfConductDone =
    itemStatus.code_of_conduct === "complete" || agreements.code_of_conduct !== null;
  const photoReleaseDone =
    itemStatus.photo_release === "complete" || agreements.photo_release !== null;
  // B1 (LAN-230 correction round 1): `trustClaimed`'s `|| ` half is the exact
  // same necessary companion as `agreements` above, for the two trust items —
  // see `readTrustClaimedIn`'s own module note.
  const bucsDone =
    itemStatus.bucs_play === "claimed" ||
    (itemStatus.bucs_play !== null && RESOLVED_ITEM_STATUSES.includes(itemStatus.bucs_play)) ||
    trustClaimed.bucs_play;
  const hudlDone =
    itemStatus.hudl_access === "claimed" ||
    (itemStatus.hudl_access !== null && RESOLVED_ITEM_STATUSES.includes(itemStatus.hudl_access)) ||
    trustClaimed.hudl_access;

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
    fieldSuppliedBy,
    agreements,
    itemStatus,
    nothingOutstanding,
    outstandingSections: sections,
    nextStep,
    lastAnsweredAt,
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

/** The four codes `readQuestionnaireViewIn` displays and gates the sequence on. */
const DISPLAYED_ITEM_CODES: readonly string[] = Object.freeze([
  ...DIRECT_PLAYER_ITEM_CODES,
  ...TRUST_ITEM_CODES,
]);

/**
 * The four items' real current status, read directly rather than inferred
 * from what `readCompiledOutstandingAskIn` leaves out — F2 (LAN-230).
 * `outstandingItems` only lists `pending`/`invited`/`claimed` rows, so
 * "absent from that list" used to be read as "resolved" and defaulted to
 * `"complete"`. That conflates two different facts: a resolved item, and a
 * membership with **no row of this code at all** (never generated, or a
 * season with no configured item types — a real, unexceptional state
 * `generateOnboardingItems`'s own module note names). This reads every one of
 * the four codes' actual rows, so the second case reads `null` rather than
 * a guess, and is never treated as done.
 */
async function readDisplayedItemStatusesIn(
  tx: Tx,
  membershipId: string,
): Promise<QuestionnaireView["itemStatus"]> {
  const result = await tx.query<{ code: string; status: OnboardingItemStatus }>(
    `select t.code, i.status::text as status
       from public.onboarding_items i
       join public.onboarding_item_types t on t.id = i.item_type_id
      where i.season_membership_id = $1::uuid and t.code = any($2::text[])`,
    [membershipId, DISPLAYED_ITEM_CODES],
  );
  const byCode = new Map(result.rows.map((row) => [row.code, row.status]));
  return {
    code_of_conduct: byCode.get("code_of_conduct") ?? null,
    photo_release: byCode.get("photo_release") ?? null,
    bucs_play: byCode.get("bucs_play") ?? null,
    hudl_access: byCode.get("hudl_access") ?? null,
  };
}

/**
 * The item-independent counterpart to `agreements` for the two trust items —
 * B1 (LAN-230 correction round 1), the identical deadlock `agreements` above
 * already fixes for Code of Conduct/photo release, reproduced live on a
 * zero-`onboarding_items` membership: `bucsDone`/`hudlDone` had no signal
 * except `itemStatus`, so a player who genuinely claimed both was left
 * `nothingOutstanding: false`, `nextStep: "bucs_play"`, forever, on every
 * reopen of the link. `claimTrustItem` already logs the player's own claim to
 * `onboarding_activity_log` whether or not there is an item to move
 * (`channel: "signed link"`, F2's own fix) — that recorded answer is this
 * signal, read back the same way `agreements` reads back an `onboarding_agreements`
 * row. Scoped to `kind = 'answer'` and `channel = 'signed link'` specifically
 * so Hudl's distinct "no invitation has reached me" answer
 * (`recordHudlNoInvitation`'s own `channel`) never counts as a claim — exactly
 * as it already does not complete the `hudl_access` item when one exists.
 */
async function readTrustClaimedIn(
  tx: Tx,
  membershipId: string,
): Promise<Record<(typeof TRUST_ITEM_CODES)[number], boolean>> {
  const sections = TRUST_ITEM_CODES.map((code) => TRUST_SECTION_LABEL[code]);
  const result = await tx.query<{ section: string }>(
    `select distinct section from public.onboarding_activity_log
      where season_membership_id = $1::uuid
        and kind = 'answer' and channel = 'signed link'
        and section = any($2::text[])`,
    [membershipId, sections],
  );
  const claimed = new Set(result.rows.map((row) => row.section));
  return {
    bucs_play: claimed.has(TRUST_SECTION_LABEL.bucs_play),
    hudl_access: claimed.has(TRUST_SECTION_LABEL.hudl_access),
  };
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

/**
 * The batched, display-only counterpart to {@link lastFieldActorPersonIdIn}
 * — F4 (LAN-230). One query for all seven fields rather than seven, each
 * resolved to `"you"` / `"club"` / `null` for `QuestionnaireView.fieldSuppliedBy`
 * to render straight, with no name string to compare and no risk of two
 * people sharing a display name reading as the same person.
 */
async function readFieldSuppliedByIn(
  tx: Tx,
  personId: string,
): Promise<Record<DisputedPersonField, "you" | "club" | null>> {
  const actions = DISPUTABLE_FIELDS.map((field) => PROVENANCE_ACTION_BY_FIELD[field]);
  const result = await tx.query<{ action: string; actor_person_id: string | null }>(
    `select action, actor_person_id
       from public.audit_events
      where entity_table = 'people' and entity_id = $1::uuid
        and action = any($2::text[])
      order by occurred_at desc`,
    [personId, actions],
  );

  const actionToField = new Map(
    DISPUTABLE_FIELDS.map((field) => [PROVENANCE_ACTION_BY_FIELD[field], field]),
  );
  const latestActorByField = new Map<DisputedPersonField, string | null>();
  for (const row of result.rows) {
    const field = actionToField.get(row.action);
    if (!field || latestActorByField.has(field)) continue; // newest row for this field is already kept
    latestActorByField.set(field, row.actor_person_id);
  }

  const suppliedBy = {} as Record<DisputedPersonField, "you" | "club" | null>;
  for (const field of DISPUTABLE_FIELDS) {
    const actorId = latestActorByField.get(field);
    suppliedBy[field] = actorId === undefined ? null : actorId === personId ? "you" : "club";
  }
  return suppliedBy;
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

export type FieldSaveOutcome = "unchanged" | "filled" | "self-corrected" | "overwritten";

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
 * Applies one submitted value for one of the seven fields that used to carry
 * a dispute. `newValue` is the trimmed, already-validated string the form
 * collected; an empty string is treated as "nothing submitted" (never a
 * clearing edit — this page has no way to blank a required fact, matching
 * `OD7-required-no-decline`).
 *
 * B-002 (correction round 2, Q-9, Brian's decision — "I don't think the
 * disputed fact mechanism survives at all"): the disputed state, the second
 * contested value and the four-role resolve control are gone. A player's
 * answer now simply takes effect — last write wins, whoever gave it — and
 * the audit history the person record already renders is what carries who
 * changed what and when.
 *
 * Four branches, decided fresh against the record read at the top of this
 * same save:
 *
 *   - nothing changed → `"unchanged"`, nothing written;
 *   - the field was empty → direct write, `"filled"`;
 *   - the field was non-empty but its most recent change has no attributable
 *     actor (seeded, imported, or `person_created`) → direct write,
 *     `"filled"` — nobody asserted the old value;
 *   - the field's most recent change was **this same person** → direct
 *     write, `"self-corrected"` — their own earlier answer, their
 *     prerogative (W5's own table, row 1);
 *   - otherwise (an operator, or anybody else, previously recorded it) →
 *     direct write, `"overwritten"` — the player's own submission stands,
 *     with its own provenance, and the prior value's history is exactly
 *     what the person record's audit trail already keeps.
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

  await updatePersonField({
    actorPersonId: personId,
    personId,
    reason: "Replaced by the player's own submission — last write wins.",
    ...buildFieldUpdate(field, trimmed),
  });
  return "overwritten";
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
 * Validates first, then writes every field that validated — never all or
 * nothing. F1 (LAN-230, a critical fix on Brian's own confirmed requirement,
 * 2026-09-02: "Whatever a step saved stays saved… never discards"; CE-008,
 * `REQ-required-set`: "the required set… blocks the form and never the
 * player, and whatever a step saved stays saved"): a submission this module
 * used to abort *entirely* the moment any single field failed its own shape
 * check, discarding nine valid answers over one malformed one. Each of the
 * six independently-checked slots below (mobile, personal email, the two
 * emergency-contact fields, and the two academic years) now gates only its
 * own write; every other slot, and the five disputable fields with no shape
 * check at all, commit regardless of what else in the same submission failed.
 * `errors` is still returned in full, so the player sees exactly what still
 * needs fixing — it just never again means nothing was kept.
 *
 * Every write below is its own already-audited, already-transactional call
 * (`updatePersonField`, `supersedeContactPoint`, `updateEmergencyContactField`)
 * — none of them expose a transaction-scoped variant, so this save is a
 * sequence of independently-committed steps rather than one all-or-nothing
 * transaction. That is not a shortcut: it is the exact semantics
 * `REQ-required-set` asks for — a save interrupted partway through, or one
 * that arrived with some fields invalid, still keeps everything that
 * validated and committed, rather than losing it to an all-or-nothing gate.
 */
export async function saveDetailsStep(input: DetailsStepInput): Promise<DetailsStepResult> {
  const current = await readPersonRecord(input.personId);
  const errors: Record<string, string> = {};

  // Mobile, personal email and the two emergency-contact fields all share one
  // shape idiom — `src/lib/validation/contact.ts`'s own
  // `looksLikePhone`/`looksLikeEmail` (LAN-215, B-007's shared module; this
  // file's import moved onto it when that package extracted the predicates
  // out of `src/app/operate/roster/new/validation.ts`, which now re-exports
  // only the two error sentences) — rather than each inventing its own,
  // per Brian's correction (B-001, LAN-216 round 1): "Should be the same as
  // all other form validations we have." A blank value is never rejected here
  // — required-ness is a separate check (`missingRequiredFields`) — this only
  // catches a value that was actually typed and does not look like its kind.
  const mobileChanged = input.mobile.trim() !== "" && needsMobileWrite(current, input.mobile);
  if (mobileChanged && !looksLikePhone(input.mobile)) errors.mobile = PHONE_SHAPE;
  const emailChanged =
    input.personalEmail.trim() !== "" && needsPersonalEmailWrite(current, input.personalEmail);
  if (emailChanged && !looksLikeEmail(input.personalEmail)) errors.personalEmail = EMAIL_SHAPE;
  const ecPhoneInvalid =
    input.emergencyContact.phone.trim() !== "" && !looksLikePhone(input.emergencyContact.phone);
  if (ecPhoneInvalid) errors.ec_phone = PHONE_SHAPE;
  const ecEmailInvalid =
    input.emergencyContact.email.trim() !== "" && !looksLikeEmail(input.emergencyContact.email);
  if (ecEmailInvalid) errors.ec_email = EMAIL_SHAPE;
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

  if (input.grantConsent) {
    // Idempotent by construction: a crafted resubmission of an already-granted
    // tick must never bump `changed_at` again, so this is checked and granted
    // inside one transaction rather than granted unconditionally. Consent is
    // never gated on any other field's validity — it is its own tick.
    await withTransaction(async (tx) => {
      const granted = await hasGrantedSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
      if (!granted) await grantSeasonMessagingConsentIn(tx, input.personId, input.seasonId);
    });
  }

  const outcomes: Partial<Record<DisputedPersonField, FieldSaveOutcome>> = {};
  for (const field of DISPUTABLE_FIELDS) {
    // `matriculation_year`/`expected_graduation_year` are the only two of the
    // seven with a shape check (`validateAcademicYear`, above); a value that
    // failed it is left unwritten rather than parsed and stored anyway — the
    // other five fields have no shape check at all and always attempt to
    // write (a blank one is already a no-op inside `applyDisputableFieldIn`).
    if (errors[field]) continue;
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

  if (mobileChanged && !errors.mobile) {
    await supersedeContactPoint({
      actorPersonId: input.personId,
      personId: input.personId,
      kind: "phone",
      rawValue: input.mobile,
      source: "player self-service",
      reason: "Player self-service correction.",
    });
  }
  if (emailChanged && !errors.personalEmail) {
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

  // A malformed emergency-contact phone or email is blanked before reaching
  // `writeEmergencyContactIn`, whose own "never clears a field" rule then
  // treats it exactly as "not submitted" — every other emergency-contact
  // field submitted alongside it still writes.
  await writeEmergencyContactIn(input.personId, {
    ...input.emergencyContact,
    phone: ecPhoneInvalid ? "" : input.emergencyContact.phone,
    email: ecEmailInvalid ? "" : input.emergencyContact.email,
  });

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

  return { errors, outcomes };
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
 *
 * F2 (LAN-230): a season with no configured item of this code (`!item`,
 * exactly the state `completePlayerOrDerivedItemIn`'s own module note
 * describes — real, and not this module's invariant to assume away) used to
 * make this whole call a silent no-op: the player's own claim vanished with
 * nothing recorded anywhere. There being no item to move is never a reason to
 * drop the player's answer — the activity log is not gated on one existing,
 * so it is always written below, whether or not there was an item to claim.
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
  if (item && (item.status === "claimed" || RESOLVED_ITEM_STATUSES.includes(item.status))) {
    return;
  }

  if (item) {
    await claimOnboardingItem({
      actorPersonId: params.personId,
      membershipId: params.membershipId,
      itemId: item.id,
    });
  }

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
