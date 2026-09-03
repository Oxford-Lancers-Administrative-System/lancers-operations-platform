import "server-only";

import { type Tx, withTransaction } from "@/lib/db";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import type { RequiredField } from "./person-required";
import { readPersonRecordIn } from "./person-record";
import type { OnboardingItemStatus } from "./membership";

/**
 * The compiled-outstanding-ask reader — LAN-214, `REQ-one-link`'s share of
 * this package: "the compiled-outstanding-ask reader, and one open ask per
 * person. You add no page." `W4`'s form and `W8`'s nudge both need one
 * answer to the same question — "what does this person still need to do?" —
 * compiled fresh every time rather than frozen at the moment a link was
 * minted, because "every later message re-sends the same link, compiled to
 * whatever is still outstanding" (item-and-ask-inventory.md).
 *
 * ## "Never a second open ask" — where that guarantee actually lives
 *
 * This module reads; it mints nothing. The one-open-ask-per-person invariant
 * is `person_access_tokens_one_live_per_person_season`, a partial unique
 * index Mission 4 (LAN-169) already built and this package does not touch —
 * see the brief's repository-drift note. {@link hasLiveOnboardingLinkIn} reads
 * that same index rather than duplicating its guarantee, so a caller minting
 * a link has one place to check first and this reader never needs to know
 * how a token is issued.
 */

export interface OutstandingOnboardingItem {
  itemId: string;
  code: string;
  label: string;
  status: OnboardingItemStatus;
}

export interface CompiledOutstandingAsk {
  personId: string;
  seasonId: string;
  membershipId: string;
  /** `REQ-required-set`'s share of the compiled ask — person-required.ts's tiers, read, never redefined here. */
  missingRequiredFields: RequiredField[];
  /** Every checklist item not yet resolved — `pending`, `invited` or `claimed`. Never filtered by who completes it; that grouping is the reading package's. */
  outstandingItems: OutstandingOnboardingItem[];
  hasGrantedConsent: boolean;
}

interface OutstandingItemRow {
  id: string;
  code: string;
  label: string;
  status: OnboardingItemStatus;
}

/**
 * What is still outstanding for one person, in one season — `REQ-one-link`:
 * "new outstanding facts join the open ask rather than starting a second."
 * Throws nothing when the person has no membership this season; it returns
 * `null` instead, because "not onboarding this season" is a real, unexceptional
 * answer a caller has to handle, not a fault.
 */
export async function readCompiledOutstandingAskIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<CompiledOutstandingAsk | null> {
  const membership = await tx.query<{ id: string }>(
    `select id from public.season_memberships where person_id = $1::uuid and season_id = $2::uuid`,
    [personId, seasonId],
  );
  const membershipId = membership.rows[0]?.id;
  if (!membershipId) return null;

  const [person, items, hasGrantedConsent] = await Promise.all([
    readPersonRecordIn(tx, personId),
    tx.query<OutstandingItemRow>(
      `select i.id, t.code, t.label, i.status::text as status
         from public.onboarding_items i
         join public.onboarding_item_types t on t.id = i.item_type_id
        where i.season_membership_id = $1::uuid
          and i.status in ('pending', 'invited', 'claimed')
        order by t.sort_order, t.label`,
      [membershipId],
    ),
    hasGrantedSeasonMessagingConsentIn(tx, personId, seasonId),
  ]);

  return {
    personId,
    seasonId,
    membershipId,
    // `readPersonRecordIn` already computes this against person-required.ts's
    // tiers for this person's assembled status — the same computation this
    // reader would otherwise duplicate.
    missingRequiredFields: person.missingRequiredFields,
    outstandingItems: items.rows.map((row) => ({
      itemId: row.id,
      code: row.code,
      label: row.label,
      status: row.status,
    })),
    hasGrantedConsent,
  };
}

/** Convenience wrapper for a caller with no open transaction. */
export async function readCompiledOutstandingAsk(
  personId: string,
  seasonId: string,
): Promise<CompiledOutstandingAsk | null> {
  return withTransaction((tx) => readCompiledOutstandingAskIn(tx, personId, seasonId));
}

/**
 * Whether this person already holds a live, durable onboarding link this
 * season — `person_access_tokens_one_live_per_person_season`'s own
 * guarantee, read rather than re-derived. `false` covers both "never issued"
 * and "revoked"; a caller deciding whether to mint one reads this first.
 */
export async function hasLiveOnboardingLinkIn(
  tx: Tx,
  personId: string,
  seasonId: string,
): Promise<boolean> {
  const result = await tx.query(
    `select 1 from public.person_access_tokens
      where person_id = $1::uuid and season_id = $2::uuid
        and not single_use and revoked_at is null
      limit 1`,
    [personId, seasonId],
  );
  return result.rows.length > 0;
}
