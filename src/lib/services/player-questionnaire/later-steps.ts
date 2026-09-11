import { withTransaction } from "@/lib/db";
import { claimOnboardingItem, RESOLVED_ITEM_STATUSES } from "../membership";
import { recordOnboardingActivityIn } from "../onboarding-activity-log";
import {
  recordOnboardingAgreementIn,
  type OnboardingAgreement,
  type OnboardingAgreementType,
} from "../onboarding-agreements";
import { completePlayerOrDerivedItemIn, findOnboardingItemIn, TRUST_SECTION_LABEL } from "./read";
import { TRUST_ITEM_CODES } from "./types";

/**
 * Steps 2 through 5 — the two documents, then BUCS Play and Hudl, the two
 * trust-class claims. `WP-player-questionnaire`, LAN-216, F2 (LAN-230): no
 * configured item for a code is never a reason to drop the player's answer.
 */

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
