import "server-only";

import { type Tx } from "@/lib/db";
import type { OnboardingItemStatus } from "./membership";

/**
 * Append-only history for onboarding items (REQ-item-history, LAN-214).
 * Migration grants only `select, insert`; no update/delete here.
 * Decision history: missions/intake/M-ONBOARDING-AND-INFORMATION-COMPLETION
 */

export type OnboardingActorKind = "operator" | "player" | "system";

export interface OnboardingItemHistoryEntry {
  id: string;
  onboardingItemId: string;
  seasonMembershipId: string;
  fromStatus: OnboardingItemStatus | null;
  toStatus: OnboardingItemStatus;
  actorKind: OnboardingActorKind;
  actorPersonId: string | null;
  reason: string | null;
  occurredAt: Date;
}

interface HistoryRow {
  id: string;
  onboarding_item_id: string;
  season_membership_id: string;
  from_status: OnboardingItemStatus | null;
  to_status: OnboardingItemStatus;
  actor_kind: OnboardingActorKind;
  actor_person_id: string | null;
  reason: string | null;
  occurred_at: Date;
}

function toEntry(row: HistoryRow): OnboardingItemHistoryEntry {
  return {
    id: row.id,
    onboardingItemId: row.onboarding_item_id,
    seasonMembershipId: row.season_membership_id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    actorKind: row.actor_kind,
    actorPersonId: row.actor_person_id,
    reason: row.reason,
    occurredAt: row.occurred_at,
  };
}

/** Appends one row; never with `fromStatus === toStatus` (db enforces it, first row excepted). `actorKind: "system"` has no `actorPersonId`. */
export async function writeOnboardingItemHistoryIn(
  tx: Tx,
  params: {
    onboardingItemId: string;
    seasonMembershipId: string;
    fromStatus: OnboardingItemStatus | null;
    toStatus: OnboardingItemStatus;
    actorKind: OnboardingActorKind;
    actorPersonId?: string | null;
    reason?: string | null;
  },
): Promise<OnboardingItemHistoryEntry> {
  const result = await tx.query<HistoryRow>(
    `insert into public.onboarding_item_history
       (onboarding_item_id, season_membership_id, from_status, to_status,
        actor_kind, actor_person_id, reason)
     values ($1::uuid, $2::uuid, $3::public.onboarding_item_status,
             $4::public.onboarding_item_status, $5::public.onboarding_actor_kind,
             $6::uuid, $7)
     returning id, onboarding_item_id, season_membership_id,
               from_status::text as from_status, to_status::text as to_status,
               actor_kind::text as actor_kind, actor_person_id, reason, occurred_at`,
    [
      params.onboardingItemId,
      params.seasonMembershipId,
      params.fromStatus,
      params.toStatus,
      params.actorKind,
      params.actorPersonId ?? null,
      params.reason ?? null,
    ],
  );
  return toEntry(result.rows[0] as unknown as HistoryRow);
}

/** One item's full history, oldest first. */
export async function readOnboardingItemHistoryIn(
  tx: Tx,
  onboardingItemId: string,
): Promise<OnboardingItemHistoryEntry[]> {
  const result = await tx.query<HistoryRow>(
    `select id, onboarding_item_id, season_membership_id,
            from_status::text as from_status, to_status::text as to_status,
            actor_kind::text as actor_kind, actor_person_id, reason, occurred_at
       from public.onboarding_item_history
      where onboarding_item_id = $1::uuid
      order by occurred_at asc`,
    [onboardingItemId],
  );
  return result.rows.map((row) => toEntry(row as unknown as HistoryRow));
}
