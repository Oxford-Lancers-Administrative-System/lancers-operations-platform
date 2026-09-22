import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "./shared";
import { WARMUP_SMALL_GROUP_VALUES } from "./vocabulary";

/**
 * One player's warmup small group — LAN-401. One cell, one pick from the eight
 * names or blank, and nothing reads it but the operator looking at it.
 *
 * Blank is the absence of a row, never a row holding an empty string — the
 * same rule the special-teams and issued-kit cells keep, so "not recorded" has
 * one representation across the whole board.
 */
export async function commitWarmupSmallGroup(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  /** The chosen group, or `null` to blank the cell. */
  smallGroup: string | null;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  if (params.smallGroup !== null && !WARMUP_SMALL_GROUP_VALUES.includes(params.smallGroup)) {
    throw new ConstraintViolated(`"${params.smallGroup}" is not a warmup small group.`, {
      rule: "warmup_group_assignments_value_in_vocabulary",
    });
  }

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ small_group: string }>(
      `select small_group from public.warmup_group_assignments
        where season_membership_id = $1::uuid
        for update`,
      [params.membershipId],
    );
    const before = existing.rows[0]?.small_group ?? null;
    if (before === params.smallGroup) return;

    if (params.smallGroup === null) {
      await tx.query(
        `delete from public.warmup_group_assignments where season_membership_id = $1::uuid`,
        [params.membershipId],
      );
    } else {
      await tx.query(
        `insert into public.warmup_group_assignments
           (season_membership_id, season_id, small_group, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3, $4::uuid)
         on conflict (season_membership_id)
         do update set small_group = excluded.small_group,
                       recorded_by_person_id = excluded.recorded_by_person_id,
                       updated_at = now()`,
        [params.membershipId, params.seasonId, params.smallGroup, params.actorPersonId],
      );
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "warmup_small_group_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.smallGroup,
      context: { issue: "LAN-401" },
    });
  });
}
