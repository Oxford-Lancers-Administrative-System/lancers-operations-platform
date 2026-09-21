import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "./audit";
import { generateOnboardingItems } from "./membership";
import { ONBOARDING_ITEM_TYPES } from "./onboarding-item-shapes";

/**
 * A season's onboarding item types, and the items every membership in it
 * should already have — LAN-396.
 *
 * Production, 2026-09-17: the 2026-27 season was opened by
 * `scripts/production/baseline/season-2026-27.sql`, which creates the season,
 * its terms, its positions and its committee year and no item types at all.
 * Nothing in the application creates them either — a season is only ever
 * created by baseline SQL — so every 2026-27 membership was generated with no
 * onboarding items, and the roster board's onboarding cells were silently
 * uneditable. Brian repaired it by hand in the SQL editor the same day.
 *
 * This module is that repair, written down: the same idempotent insert of the
 * canonical eleven, and the same back-generation for memberships that already
 * exist. It is deliberately not wired to a screen. Opening a season is an
 * owner act performed in SQL, and the thing the application owes is that the
 * list it would install is the list the baseline installs, and that a season
 * missing them can be said so.
 */

/** How many onboarding item types this season carries. Zero is the gap LAN-396 exists for. */
export async function countSeasonOnboardingItemTypes(tx: Tx, seasonId: string): Promise<number> {
  const result = await tx.query<{ count: string }>(
    `select count(*)::text as count from public.onboarding_item_types where season_id = $1::uuid`,
    [seasonId],
  );
  return Number(result.rows[0]?.count ?? "0");
}

/**
 * Installs the canonical eleven item types on a season, and generates the
 * items every membership already in that season should have.
 *
 * Idempotent in both halves: the types insert `on conflict (season_id, code)
 * do nothing`, and `generateOnboardingItems` is idempotent through
 * `onboarding_items_one_per_type`. Re-running it on a season that is already
 * right writes nothing and audits nothing.
 *
 * Audited as a system act. Nobody clicked this: it repairs a season that was
 * opened without its list, and the honest actor is the mechanism, not whoever
 * happened to trigger it (`audit.ts`'s own rule for `actorLabel`).
 */
export async function installSeasonOnboardingItemTypes(seasonId: string): Promise<{
  typesAdded: number;
  itemsGenerated: number;
}> {
  return withTransaction(async (tx) => {
    let typesAdded = 0;
    for (const [index, type] of ONBOARDING_ITEM_TYPES.entries()) {
      const inserted = await tx.query(
        `insert into public.onboarding_item_types
           (season_id, code, label, is_required, is_subscription, sort_order, verification_class)
         values ($1::uuid, $2, $3, $4, $5, $6, $7::public.onboarding_item_verification_class)
         on conflict (season_id, code) do nothing`,
        [
          seasonId,
          type.code,
          type.label,
          type.isRequired,
          type.isSubscription,
          index,
          type.verificationClass,
        ],
      );
      typesAdded += inserted.rowCount ?? 0;
    }

    const itemsGenerated = await backGenerateIn(tx, seasonId);

    if (typesAdded > 0 || itemsGenerated > 0) {
      await recordAudit(tx, {
        actorLabel: "system: season onboarding items",
        action: "season_onboarding_item_types_installed",
        entityTable: "seasons",
        entityId: seasonId,
        fromState: null,
        toState: `${typesAdded} item types, ${itemsGenerated} items`,
        reason: "A season was opened without its onboarding item types.",
        context: { issue: "LAN-396" },
      });
    }

    return { typesAdded, itemsGenerated };
  });
}

/**
 * Generates the missing onboarding items for every membership in one season —
 * the insert Brian ran by hand, on its own, for a season whose types are
 * already right but whose memberships predate them.
 */
export async function backGenerateSeasonOnboardingItems(seasonId: string): Promise<number> {
  return withTransaction(async (tx) => {
    const generated = await backGenerateIn(tx, seasonId);
    if (generated > 0) {
      await recordAudit(tx, {
        actorLabel: "system: season onboarding items",
        action: "season_onboarding_items_back_generated",
        entityTable: "seasons",
        entityId: seasonId,
        fromState: null,
        toState: `${generated} items`,
        reason: "Memberships in this season predated its onboarding item types.",
        context: { issue: "LAN-396" },
      });
    }
    return generated;
  });
}

/** Every membership in the season, through the one generator the intake doors already use. */
async function backGenerateIn(tx: Tx, seasonId: string): Promise<number> {
  const memberships = await tx.query<{ id: string }>(
    `select id from public.season_memberships where season_id = $1::uuid order by id`,
    [seasonId],
  );
  let generated = 0;
  for (const membership of memberships.rows) {
    generated += await generateOnboardingItems(tx, membership.id, seasonId);
  }
  return generated;
}
