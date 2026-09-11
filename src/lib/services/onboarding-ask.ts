import "server-only";

import { type Tx } from "@/lib/db";
import { hasGrantedSeasonMessagingConsentIn } from "./messaging-consent";
import type { RequiredField } from "./person-required";
import { readPersonRecordIn } from "./person-record";
import type { OnboardingItemStatus } from "./membership";

// The compiled-outstanding-ask reader — LAN-214, REQ-one-link: compiled fresh every time, never
// frozen at mint. This module reads; it mints nothing.

interface OutstandingOnboardingItem {
  itemId: string;
  code: string;
  label: string;
  status: OnboardingItemStatus;
}

export interface CompiledOutstandingAsk {
  personId: string;
  seasonId: string;
  membershipId: string;
  missingRequiredFields: RequiredField[]; // REQ-required-set's share — person-required.ts's tiers, read, never redefined here
  outstandingItems: OutstandingOnboardingItem[]; // pending/invited/claimed only; never filtered by who completes it
  hasGrantedConsent: boolean;
}

interface OutstandingItemRow {
  id: string;
  code: string;
  label: string;
  status: OnboardingItemStatus;
}

// REQ-one-link: returns null, not a throw, for no membership this season.
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
    missingRequiredFields: person.missingRequiredFields, // readPersonRecordIn already computes this against person-required.ts's tiers
    outstandingItems: items.rows.map((row) => ({
      itemId: row.id,
      code: row.code,
      label: row.label,
      status: row.status,
    })),
    hasGrantedConsent,
  };
}

// person_access_tokens_one_live_per_person_season's own guarantee; false covers "never issued" and "revoked".
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
