import "server-only";

import type { Tx } from "@/lib/db";
import { actorRequirement } from "../actor";

// Types and helpers shared by the membership module's read and write
// siblings. Decision history: docs/ux/tickets/LAN-186-roster-board.md.

/**
 * `public.membership_status`, in the ladder's own order. Five values since
 * LAN-182 — see `relocations.md` for why `carried_forward`, `confirmed` and
 * `withdrawn` are gone, and why there is no transition table any more.
 */
export type MembershipStatus = "onboarding" | "active" | "inactive" | "departed" | "archived";

/**
 * `public.onboarding_item_status`. `claimed` joined it under LAN-214
 * (`REQ-item-states`, W6's own `R2-V`): the player says done and awaits
 * confirmation. It is a live, unresolved state — the item is not counted
 * among the resolved statuses, the same way `invited` is not.
 */
export type OnboardingItemStatus =
  "pending" | "invited" | "claimed" | "complete" | "waived" | "not_applicable";

export function optional(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export const MEMBERSHIP_NOT_FOUND_MESSAGE = "That membership no longer exists.";

export const requireActor = actorRequirement(
  "A membership change has to name the operator who made it.",
);

/**
 * Creates the season's onboarding items for one membership, once.
 *
 * Idempotent by the schema's own `onboarding_items_one_per_type` unique
 * constraint rather than by a preceding `select` — `on conflict do nothing`
 * cannot lose a race with a concurrent call, and a check-then-insert can.
 * Calling it a second time inserts nothing and is not an error, which is what
 * lets it sit safely on the confirmation path *and* be re-run for a membership
 * confirmed before this issue existed.
 *
 * A season with no configured item types yields no items. That is a real
 * configuration state, not a failure: the club has not decided what onboarding
 * means for that season yet.
 *
 * Returns how many rows this call actually created.
 */
export async function generateOnboardingItems(
  tx: Tx,
  membershipId: string,
  seasonId: string,
): Promise<number> {
  const result = await tx.query(
    `insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
     select $1::uuid, t.season_id, t.id, 'pending'::public.onboarding_item_status
       from public.onboarding_item_types t
      where t.season_id = $2::uuid
     on conflict (season_membership_id, item_type_id) do nothing`,
    [membershipId, seasonId],
  );
  return result.rowCount ?? 0;
}
