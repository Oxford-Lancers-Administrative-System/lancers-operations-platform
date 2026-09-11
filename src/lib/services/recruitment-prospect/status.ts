import "server-only";

import { InvalidTransition, NotFound, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "../audit";
import { EXIT_STATUSES, type ProspectStatus } from "../recruitment-vocabulary";

/** The exits — `W13`. `joined` is refused here; `flip.ts` owns it. LAN-204. */

export interface UpdateRecruitmentStatusOptions {
  readonly reason?: string | null;
}

const JOINED_THROUGH_FLIP_RULE = "recruitment_prospect_joined_through_flip";

/**
 * Every status change except `joined` — the three exits and re-engagement —
 * `W13`: one status control each, no confirmation, no callout. Cancels every
 * queued cycle job on an exit (`declined`, `disengaged`, `void`): "nothing is
 * sent to them" has to mean a queued ask does not go out five minutes later
 * because the sweep had already claimed it before this ran, so this cancels
 * `pending`/`ready`/`failed` rows outright rather than relying on
 * `dispatchRecruitmentCycleJob`'s own re-check to catch every one of them in
 * time.
 */
export async function updateRecruitmentProspectStatusIn(
  tx: Tx,
  actorPersonId: string,
  prospectId: string,
  toStatus: Exclude<ProspectStatus, "joined">,
  options: UpdateRecruitmentStatusOptions = {},
): Promise<void> {
  // Belt and braces against a server action called directly with a raw
  // payload: the type parameter excludes `joined` at compile time, but a
  // request that bypasses TypeScript entirely must still be refused here,
  // in words, rather than falling through to
  // `recruitment_prospects_conversion_matches_status`'s raw constraint error.
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

  // `Q-every-status-reachable` (Brian, 2026-09-02): "It shouldn't stop me" —
  // the service supplies what the two constraints need rather than gating the
  // control on them. `recruitment_prospects_commitment_is_dated` needs
  // `committed_on` the moment `status` becomes `committed`;
  // `Q-committed-on-is-derived` (same walkthrough) is explicit that this is
  // always today's date on the write that makes it committed, never a second
  // field an operator flips themselves. `recruitment_prospects_conversion_matches_status`
  // needs `converted_membership_id` cleared the moment a `joined` recruit is
  // moved to any other status through this same free-select control — the
  // membership the earlier flip created is left exactly as it is; only the
  // prospect's own back-reference to it is cleared, so the constraint reads
  // consistently either way and no transition through this control is ever
  // refused by a constraint the write itself could have satisfied.
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
    await tx.query(
      `update public.notification_jobs
          set status = 'cancelled', cancelled_reason = $2, claimed_at = null, claimed_by = null,
              updated_at = now()
        where person_id = $1::uuid
          and idempotency_key like 'recruit-cycle:%'
          and status in ('pending', 'ready', 'failed')`,
      [row.person_id, `Recruit moved to ${toStatus}.`],
    );
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
