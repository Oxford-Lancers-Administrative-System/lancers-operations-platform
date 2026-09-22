import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "./shared";
import { KIT_ITEMS, type KitItemCode } from "./vocabulary";

/**
 * One issued-kit cell — LAN-375. Eleven per player. Nine hold one value from
 * that item's own list or nothing; Braces L and Braces R hold a set of them
 * (LAN-409). Recording which kit was issued, never an inventory: nothing here
 * counts stock.
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
  return commitKitItemValues({
    ...params,
    values: params.value === null ? [] : [params.value],
  });
}

/**
 * The whole of one item's issued kit — LAN-409's multi-value form, and the one
 * writer the single-value form goes through too.
 *
 * The set is written whole rather than as a diff, for the reason every other
 * multi-select on the board gives: the screen holds the truth while it is
 * open, and a diff applied out of order would leave a player wearing a brace
 * nobody chose.
 */
export async function commitKitItemValues(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  item: KitItemCode;
  /** The whole selection. Empty blanks the cell. */
  values: readonly string[];
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  const item = KIT_ITEMS.find((entry) => entry.item === params.item);
  if (!item) {
    throw new ConstraintViolated("That is not an issued-kit item.", {
      rule: "kit_issue_records_value_in_item",
    });
  }
  // De-duplicated here as well as in the index: the same brace chosen twice is
  // one brace, not a refusal an operator could do anything about.
  const values = [...new Set(params.values)];
  for (const value of values) {
    if (!item.values.includes(value)) {
      throw new ConstraintViolated(`"${value}" is not a ${item.label} value.`, {
        rule: "kit_issue_records_value_in_item",
      });
    }
  }
  if (!item.multi && values.length > 1) {
    throw new ConstraintViolated(`${item.label} holds one value, not ${values.length}.`, {
      rule: "kit_issue_records_one_per_single_item",
    });
  }
  // The item's own list order, so a cell reads the same however it was chosen.
  const chosen = item.values.filter((value) => values.includes(value));

  return withTransaction(async (tx) => {
    const before = await heldValues(tx, params.membershipId, params.item);
    if (before.length === chosen.length && before.every((value, at) => value === chosen[at])) {
      return;
    }

    await tx.query(
      `delete from public.kit_issue_records
        where season_membership_id = $1::uuid and item = $2::public.kit_item`,
      [params.membershipId, params.item],
    );
    for (const value of chosen) {
      await tx.query(
        `insert into public.kit_issue_records
           (season_membership_id, season_id, item, value, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::public.kit_item, $4, $5::uuid)`,
        [params.membershipId, params.seasonId, params.item, value, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "kit_issue_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      // One audit line reads the same for a single pick as it always did, and
      // for a set it is the set, joined the way the board shows it.
      fromState: before.length === 0 ? null : before.join(", "),
      toState: chosen.length === 0 ? null : chosen.join(", "),
      context: { issue: item.multi ? "LAN-409" : "LAN-375", item: params.item },
    });
  });
}

/** What this membership already holds for one item, in the item's own list order, locked for the write. */
async function heldValues(tx: Tx, membershipId: string, item: KitItemCode): Promise<string[]> {
  const held = await tx.query<{ value: string }>(
    `select k.value
       from public.kit_issue_records k
       join public.kit_item_options o on o.item = k.item and o.value = k.value
      where k.season_membership_id = $1::uuid and k.item = $2::public.kit_item
      order by o.sort_order
      for update of k`,
    [membershipId, item],
  );
  return held.rows.map((row) => row.value);
}
