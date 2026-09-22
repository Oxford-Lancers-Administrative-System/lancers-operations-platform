import "server-only";

import { ConstraintViolated, withTransaction } from "@/lib/db";
import { recordAudit } from "../audit";
import { applyAudienceGroupRuleIn } from "../event-audience-rule";
import { actorRequirement, personIdOfMembershipIn } from "./shared";
import {
  SPECIAL_TEAMS_SLOTS,
  SPECIAL_TEAMS_SQUADS,
  type SpecialTeamsSlot,
  type SpecialTeamsSquad,
} from "./vocabulary";

/**
 * One special-teams cell — LAN-374. Twenty-four of them per player, each a
 * single pick from its own squad's list or blank. This still writes exactly the
 * cell it was given and nothing else.
 *
 * LAN-414 added one consequence outside the cell: `special_teams:<squad>` is an
 * audience pill, and the pill is per **squad**, never per slot — Stewart's rule
 * that "if you have an assignment in kick return, you need to get a message…
 * even if they're backup three." So filling any slot in a squad can put
 * somebody into an approved event's audience, and clearing one takes them out
 * only when it was their last slot in that squad. Nothing here counts the
 * remaining slots: `SPECIAL_TEAMS_SQUADS_EXPRESSION` aggregates the squads the
 * player still holds any slot in, and the rule re-reads it after this write, so
 * "their last slot" is decided by the same expression the picker used.
 */
export async function commitSpecialTeamsAssignment(params: {
  actorPersonId: string;
  membershipId: string;
  seasonId: string;
  squad: SpecialTeamsSquad;
  slot: SpecialTeamsSlot;
  /** The chosen position, or `null` to blank the cell. */
  positionName: string | null;
  /**
   * LAN-392 Brian's decision 8, as `enterReturningPlayer` states it: the CSV
   * import does not trigger the audience group rule. Only `roster-import.ts`
   * passes `false`, and it says why at its own call site.
   */
  applyAudienceGroupRule?: boolean;
}): Promise<void> {
  actorRequirement(params.actorPersonId);

  const squad = SPECIAL_TEAMS_SQUADS.find((entry) => entry.squad === params.squad);
  const slot = SPECIAL_TEAMS_SLOTS.find((entry) => entry.slot === params.slot);
  if (!squad || !slot) {
    throw new ConstraintViolated("That is not a special-teams squad and slot.", {
      rule: "special_teams_assignments_value_in_squad",
    });
  }
  if (params.positionName !== null && !squad.positions.includes(params.positionName)) {
    throw new ConstraintViolated(`"${params.positionName}" is not a ${squad.label} position.`, {
      rule: "special_teams_assignments_value_in_squad",
    });
  }

  return withTransaction(async (tx) => {
    const existing = await tx.query<{ position_name: string }>(
      `select position_name from public.special_teams_assignments
        where season_membership_id = $1::uuid and squad = $2::public.special_teams_squad
          and slot = $3::public.special_teams_slot
        for update`,
      [params.membershipId, params.squad, params.slot],
    );
    const before = existing.rows[0]?.position_name ?? null;
    if (before === params.positionName) return;

    if (params.positionName === null) {
      // Blank is the absence of a row, never a row holding an empty string.
      await tx.query(
        `delete from public.special_teams_assignments
          where season_membership_id = $1::uuid and squad = $2::public.special_teams_squad
            and slot = $3::public.special_teams_slot`,
        [params.membershipId, params.squad, params.slot],
      );
    } else {
      await tx.query(
        `insert into public.special_teams_assignments
           (season_membership_id, season_id, squad, slot, position_name, recorded_by_person_id)
         values ($1::uuid, $2::uuid, $3::public.special_teams_squad,
                 $4::public.special_teams_slot, $5, $6::uuid)
         on conflict (season_membership_id, squad, slot)
         do update set position_name = excluded.position_name,
                       recorded_by_person_id = excluded.recorded_by_person_id,
                       updated_at = now()`,
        [
          params.membershipId,
          params.seasonId,
          params.squad,
          params.slot,
          params.positionName,
          params.actorPersonId,
        ],
      );
    }

    if (params.applyAudienceGroupRule !== false) {
      const personId = await personIdOfMembershipIn(tx, params.membershipId);
      if (personId !== null) {
        await applyAudienceGroupRuleIn(tx, {
          personId,
          seasonId: params.seasonId,
          trigger: "special_teams_assignment_changed",
          actorPersonId: params.actorPersonId,
        });
      }
    }

    await recordAudit(tx, {
      actorPersonId: params.actorPersonId,
      action: "special_teams_assignment_changed",
      entityTable: "season_memberships",
      entityId: params.membershipId,
      fromState: before,
      toState: params.positionName,
      context: { issue: "LAN-374", squad: params.squad, slot: params.slot },
    });
  });
}
