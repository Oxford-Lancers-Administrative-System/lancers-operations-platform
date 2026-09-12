import "server-only";

import { InvalidTransition, NotFound, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "../audit";
import { EXIT_STATUSES, type ProspectStatus } from "../recruitment-vocabulary";
import {
  cancelRecruitCycleJobsIn,
  cancelRecruitEventJobsIn,
  recruitStatusCancellationReason,
} from "./cancellations";

/** The exits — `W13`. `joined` is refused here; `flip.ts` owns it. LAN-204. */

export interface UpdateRecruitmentStatusOptions {
  readonly reason?: string | null;
}

const JOINED_THROUGH_FLIP_RULE = "recruitment_prospect_joined_through_flip";

/**
 * Every status change except `joined` (W13). On an exit (`declined`,
 * `disengaged`, `void`) it cancels every queued message on both of the
 * recruit's ladders — the recruitment cycle, and any event that already holds
 * them (LAN-341): "nothing is sent to them" must be true even for a job the
 * sweep already claimed.
 *
 * Consent is deliberately untouched. Declined is a recruitment status, and
 * withdrawing consent stays the person's own act through the stop link
 * (Brian's own recommendation on LAN-341).
 */
export async function updateRecruitmentProspectStatusIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  toStatus: Exclude<ProspectStatus, "joined">,
  options: UpdateRecruitmentStatusOptions = {},
): Promise<void> {
  // Belt and braces: a raw payload bypassing TypeScript must still be refused in words, not a raw constraint error.
  assertNotJoinedThroughStatusControl(toStatus);

  const current = await tx.query<{ person_id: string; season_id: string; status: string }>(
    `select person_id, season_id, status::text as status
       from public.recruitment_prospects where id = $1::uuid for update`,
    [prospectId],
  );
  const row = current.rows[0];
  if (!row)
    throw new NotFound("That recruit could not be found.", {
      rule: "recruitment_prospect_not_found",
    });

  if ((row.status as ProspectStatus) === toStatus) {
    throw new InvalidTransition(`This recruit is already ${toStatus}.`, {
      rule: "recruitment_prospect_status_is_a_change",
    });
  }

  const reason = options.reason?.trim() || null;
  if (toStatus === "void" && !reason) {
    throw new InvalidTransition(
      "Voiding a record needs a reason — the record was a mistake, and this says why.",
      {
        rule: "recruitment_prospect_status_events_void_is_explained",
      },
    );
  }

  // Q-every-status-reachable: the service supplies what the two constraints need rather than gating the control on them.
  await tx.query(
    `update public.recruitment_prospects
        set status = $2::public.prospect_status,
            committed_on = case
              when $2::public.prospect_status = 'committed' then $3::date
              else committed_on
            end,
            converted_membership_id = case
              when $4::boolean then null
              else converted_membership_id
            end,
            updated_at = now()
      where id = $1::uuid`,
    [prospectId, toStatus, todayInClubZone(), row.status === "joined"],
  );

  await tx.query(
    `insert into public.recruitment_prospect_status_events
       (prospect_id, from_status, to_status, actor_person_id, reason)
     values ($1::uuid, $2::public.prospect_status, $3::public.prospect_status, $4::uuid, $5)`,
    [prospectId, row.status, toStatus, actorPersonId, reason],
  );

  await recordAudit(tx, {
    actorPersonId,
    action: "recruitment_prospect.status_changed",
    entityTable: "recruitment_prospects",
    entityId: prospectId,
    fromState: row.status,
    toState: toStatus,
    reason,
  });

  if (EXIT_STATUSES.includes(toStatus)) {
    // LAN-341. The cycle was already stood down here; the event ladder was not,
    // so an exited recruit still received the invitation and the follow-up of
    // any event that already held them. Both ladders, one reason, in
    // `./cancellations.ts` — and the flip (`./flip.ts`) shares the first.
    const reason = recruitStatusCancellationReason(toStatus);
    const cycleJobs = await cancelRecruitCycleJobsIn(tx, row.person_id, row.season_id, reason);
    const eventJobs = await cancelRecruitEventJobsIn(tx, row.person_id, row.season_id, reason);

    if (cycleJobs + eventJobs > 0) {
      await recordAudit(tx, {
        actorPersonId,
        action: "recruitment_prospect.messages_cancelled",
        entityTable: "recruitment_prospects",
        entityId: prospectId,
        reason,
        context: { issue: "LAN-341", cycleJobs, eventJobs },
      });
    }
  }
}

export async function updateRecruitmentProspectStatus(
  actorPersonId: string,
  prospectId: string,
  toStatus: Exclude<ProspectStatus, "joined">,
  options: UpdateRecruitmentStatusOptions = {},
): Promise<void> {
  return withTransaction((tx) =>
    updateRecruitmentProspectStatusIn(tx, actorPersonId, prospectId, toStatus, options),
  );
}

/** Refuses `joined` explicitly, naming the flip, rather than writing a status nobody can reach this way. */
function assertNotJoinedThroughStatusControl(toStatus: string): void {
  if (toStatus === "joined") {
    throw new InvalidTransition(
      "Joined is not a status you can set directly — it flips the recruit onto the roster. Use the confirmation for that.",
      { rule: JOINED_THROUGH_FLIP_RULE },
    );
  }
}
