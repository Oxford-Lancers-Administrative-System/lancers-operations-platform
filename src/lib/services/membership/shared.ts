import "server-only";

import type { Tx } from "@/lib/db";
import { actorRequirement } from "../actor";

// Types and helpers shared by the membership module's read and write siblings.

export type MembershipStatus = "onboarding" | "active" | "inactive" | "departed" | "archived";

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

// Idempotent via the onboarding_items_one_per_type constraint, not a preceding select.
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
