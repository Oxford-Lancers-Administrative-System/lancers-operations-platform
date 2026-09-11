import { withTransaction, type Tx } from "@/lib/db";
import { RESOLVED_ITEM_STATUSES, type OnboardingItemStatus } from "../membership";
import {
  readOnboardingAgreementsIn,
  type OnboardingAgreement,
  type OnboardingAgreementType,
} from "../onboarding-agreements";
import { readCompiledOutstandingAskIn } from "../onboarding-ask";
import { writeOnboardingItemHistoryIn } from "../onboarding-item-history";
import {
  hasGrantedSeasonMessagingConsentIn,
  readSeasonMessagingConsentIn,
  type SeasonMessagingConsent,
} from "../messaging-consent";
import { readOpenPersonFactDisputesIn, type DisputedPersonField } from "../person-fact-dispute";
import { readPersonRecordIn, type PersonRecord } from "../person-record";
import { REQUIRED_FIELD_LABELS, type RequiredField } from "../person-required";
import { readSeasonLabelIn } from "../seasons";
import { emergencyContactIsComplete, type EmergencyContactFacts } from "./emergency-contact";
import { readFieldSuppliedByIn } from "./provenance";
import { TRUST_ITEM_CODES, type QuestionnaireStep } from "./types";

/**
 * The read model — the one whole read `/me/[token]/details` needs, and the
 * item-completion writer both it and steps 2-5 share.
 * `WP-player-questionnaire`, LAN-216, W4 and W5. Decision history: docs/ux/tickets/LAN-216-player-questionnaire.md.
 */

/** The four checklist items this package is the sole writer of, plus the two derived ones. */
const DIRECT_PLAYER_ITEM_CODES = Object.freeze(["code_of_conduct", "photo_release"] as const);

/** The two trust items' own activity-log section name, read back here and by `later-steps.ts`. */
export const TRUST_SECTION_LABEL: Record<(typeof TRUST_ITEM_CODES)[number], string> = {
  bucs_play: "BUCS Play",
  hudl_access: "Hudl",
};

export async function readEmergencyContactFactsIn(
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

interface OutstandingSectionItem {
  label: string;
  step: QuestionnaireStep;
}

interface OutstandingSection {
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
   * Whether each document is *settled* — LAN-240. Deliberately not "is there
   * an agreement row", which is what the step panel used to ask on its own
   * and is exactly how it came to print "Already agreed" beneath a navigator
   * reading "Outstanding". This is the same answer `outstandingSections` and
   * `nextStep` are computed from, published so every part of the player's
   * link reads one fact rather than each deriving its own.
   */
  documentAgreed: Record<OnboardingAgreementType, boolean>;
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

  // LAN-240 (walker M7, finding M7-01). The item is the authority whenever
  // there *is* one, and the agreement row is the fallback only when there is
  // not.
  //
  // This used to be a plain `||`, and that is what let the operator's reopen
  // never reach the player: setting Photo release back to "No" moved
  // `onboarding_items.status` to `pending`, but the agreement row's mere
  // existence went on answering "done" here, so the sequence skipped the step
  // and the step itself rendered "Already agreed" under a navigator reading
  // "Outstanding". `resolveOnboardingItem` now removes that row in the same
  // transaction as the reopen, so the two facts can no longer disagree — but
  // the precedence still has to be stated, because it is the precedence, not
  // the delete alone, that makes the item what the player's link obeys.
  //
  // The fallback itself is unchanged and still load-bearing — F2's own
  // necessary companion, found walking that fix live: `agreeDocument` advances
  // by *resuming* to the next outstanding step (`nextStepUrl`), never by a
  // literal one (unlike BUCS/Hudl, which always advance regardless —
  // `literalNextStepUrl`, "nothing gates"). With no configured
  // `code_of_conduct`/`photo_release` item, `completePlayerOrDerivedItemIn`
  // has nothing to mark complete, so a player who *did* agree would be stuck
  // resuming to the same step forever. `agreements` (`onboarding_agreements`,
  // read above) is the item-independent record of that same fact, already on
  // hand, and answers only for the membership that genuinely has no item.
  const codeOfConductDone =
    itemStatus.code_of_conduct !== null
      ? itemStatus.code_of_conduct === "complete"
      : agreements.code_of_conduct !== null;
  const photoReleaseDone =
    itemStatus.photo_release !== null
      ? itemStatus.photo_release === "complete"
      : agreements.photo_release !== null;
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
    documentAgreed: { code_of_conduct: codeOfConductDone, photo_release: photoReleaseDone },
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

interface OnboardingItemLookup {
  id: string;
  status: OnboardingItemStatus;
}

export async function findOnboardingItemIn(
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
export async function completePlayerOrDerivedItemIn(
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
export async function syncDerivedItemsIn(
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
