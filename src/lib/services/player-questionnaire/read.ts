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
  /** F4: "you"/"club"/`null` (no row at all) for who last touched each field — see `readFieldSuppliedByIn`. */
  fieldSuppliedBy: Record<DisputedPersonField, "you" | "club" | null>;
  agreements: Record<OnboardingAgreementType, OnboardingAgreement | null>;
  /** Whether each document is settled (LAN-240) — the same fact `outstandingSections`/`nextStep` compute from. */
  documentAgreed: Record<OnboardingAgreementType, boolean>;
  /** `null` means no `onboarding_items` row of this code exists (F2, LAN-230) — never treated as done. */
  itemStatus: Record<
    (typeof TRUST_ITEM_CODES)[number] | (typeof DIRECT_PLAYER_ITEM_CODES)[number],
    OnboardingItemStatus | null
  >;
  /** Everything still outstanding for the player, in the sequence's own order. */
  nothingOutstanding: boolean;
  outstandingSections: OutstandingSection[];
  /** The first step the sequence should resume at, or `"done"` when nothing needs it. */
  nextStep: QuestionnaireStep;
  /** Most recent player answer (B2, LAN-230) — `null` only if unreachable in practice, never assumed. */
  lastAnsweredAt: Date | null;
}

/** Most recent save time (B2, LAN-230) — read of `onboarding_activity_log`'s existing `kind = 'answer'` rows. */
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

  // LAN-240: the item is the authority whenever there is one; the agreement row is the fallback
  // only when there is not (needed for a membership with no configured item — F2).
  const codeOfConductDone =
    itemStatus.code_of_conduct !== null
      ? itemStatus.code_of_conduct === "complete"
      : agreements.code_of_conduct !== null;
  const photoReleaseDone =
    itemStatus.photo_release !== null
      ? itemStatus.photo_release === "complete"
      : agreements.photo_release !== null;
  // B1 (LAN-230): trustClaimed is the same necessary companion as agreements above, for the trust items.
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

/** The four items' real current status, read directly rather than inferred from `readCompiledOutstandingAskIn` (F2, LAN-230) — no row reads `null`, never a guessed `"complete"`. */
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
 * The item-independent counterpart to `agreements`, for the two trust items
 * (B1, LAN-230) — reads `claimTrustItem`'s own log row back, the same way
 * `agreements` reads an `onboarding_agreements` row. Scoped to
 * `channel = 'signed link'` so Hudl's "no invitation reached me" answer
 * never counts as a claim.
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

/** Completes one of the four player/derived items, once, forward-only. No configured item or one already resolved is a no-op; never reopens (that stays `resolveOnboardingItem`, W7). */
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

/** Recomputes the two derived items against the current record (item-and-ask-inventory.md). Forward-only, a no-op once complete. */
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
