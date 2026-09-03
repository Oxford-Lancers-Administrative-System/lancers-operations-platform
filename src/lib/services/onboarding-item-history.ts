import "server-only";

import { type Tx } from "@/lib/db";
import type { OnboardingItemStatus } from "./membership";

/**
 * The typed home `REQ-item-history` asks for — LAN-214, `WP-onboarding-substrate`.
 *
 * `onboarding_items` (LAN-75) carries current state only; W6's own grounding
 * names exactly what that loses: "The record can say an item is complete; it
 * cannot say it was complete, reopened in November and completed again."
 * `public.onboarding_item_history` is the append-only record that answers it,
 * and this module is its only writer and its reader.
 *
 * ## Append-only, structurally
 *
 * The migration's grant on `onboarding_item_history` is `select, insert` —
 * no `update`, no `delete`. This module therefore exposes no update or delete
 * function; there is nothing here to call. A caller that tried to alter a row
 * directly would be refused by the database itself, which is what
 * `onboarding-item-history.test.ts` proves.
 *
 * ## Who calls this
 *
 * `membership.ts`'s `resolveOnboardingItem` (an operator's four resolutions,
 * `reopen` included) and `claimOnboardingItem` (a player's own trust-class
 * claim) both write through here in the same transaction as the state change
 * they describe — the same "a change and its history commit together or not
 * at all" posture every other typed table in this schema takes. Later
 * packages read it back through {@link readOnboardingItemHistoryIn} to render
 * "who said so, and when" on the record (W6).
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

/**
 * Appends one row. Never called for a no-op: every caller here has already
 * confirmed `fromStatus !== toStatus` before reaching this, and the database's
 * own `onboarding_item_history_is_a_real_change` check refuses a row that
 * claims otherwise (except the very first row for an item, whose
 * `fromStatus` is `null`).
 *
 * `actorKind: "system"` carries no `actorPersonId` — the database's
 * `onboarding_item_history_system_has_no_person` constraint requires it —
 * and every other kind requires one, enforced the same way.
 */
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

/** One item's full history, oldest first — the whole point of `REQ-item-history` over the current-state-only `onboarding_items` row. */
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
