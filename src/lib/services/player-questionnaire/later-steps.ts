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

/** Steps 2-5 — the two documents, then BUCS Play and Hudl. F2 (LAN-230): no configured item is never a reason to drop the answer. */

const AGREEMENT_SECTION_LABEL: Record<OnboardingAgreementType, string> = {
  code_of_conduct: "Code of Conduct",
  photo_release: "Photo release",
};

/** Records one document's agreement, completes its item, logs the answer — one transaction. Once-per-season (`onboarding_agreements_one_per_person_season_type`). */
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

/** The player's "yes, I've done it". Idempotent: already claimed/resolved is left as-is, never a refusal. F2: no item is not a reason to drop the answer. */
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
 * LAN-333 removed `recordHudlNoInvitation`. Hudl is self-serve from the club's
 * join link and no operator sends an invitation, so "no invitation has reached
 * me" was an answer to a question the workflow never asks. Activity-log rows
 * already written with its `channel` stay exactly where they are: they are a
 * true record of what a player pressed, and history is not rewritten.
 */
