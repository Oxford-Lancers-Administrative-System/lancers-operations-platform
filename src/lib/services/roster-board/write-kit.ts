import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "./shared";
import { KIT_ITEMS, type KitItemCode } from "./vocabulary";

/**
 * One issued-kit cell — LAN-375. Eleven per player, each a single pick from
 * that item's own list or blank. Recording which kit was issued, never an
 * inventory: nothing here counts stock.
 *
 * Kit Distributed is not touched from here. It is derived in the database by
 * `refresh_kit_distributed`, which this write's trigger fires, so the flag
 * moves as a consequence of the kit and can never be set beside it.
 */
export async function commitKitItem(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  item: KitItemCode;
  /** The chosen value, or `null` to blank the cell. */
  value: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  const item = KIT_ITEMS.find((entry) => entry.item === params.item);
  if (!item) {
    throw new ConstraintViolated("That is not an issued-kit item.", {
      rule: "kit_issue_records_value_in_item",
    });
  }
  if (params.value !== null && !item.values.includes(params.value)) {
    throw new ConstraintViolated(`"${params.value}" is not a ${item.label} value.`, {
      rule: "kit_issue_records_value_in_item",
    });
  }

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ value: string }>(
      `select value from public.kit_issue_records
        where season_membership_id = $1::uuid and item = $2::public.kit_item
        for update`,
      [params.membershipId, params.item],
    );
    const before = existing.rows[0]?.value ?? null;
    if (before === params.value) return;

    if (params.value === null) {
      await tx.query(
        `delete from public.kit_issue_records
          where season_membership_id = $1::uuid and item = $2::public.kit_item`,
        [params.membershipId, params.item],
      );
    } else {
      await tx.query(
        `insert into public.kit_issue_records
           (season_membership_id, season_id, item, value, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::public.kit_item, $4, $5::uuid)
         on conflict (season_membership_id, item)
         do update set value = excluded.value,
                       recorded_by_person_id = excluded.recorded_by_person_id,
                       updated_at = now()`,
        [params.membershipId, params.seasonId, params.item, params.value, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "kit_issue_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.value,
      context: { issue: "LAN-375", item: params.item },
    });
  });
}
