import "server-only";

import type { Tx } from "@/lib/db";

/**
 * Standing a recruit's queued messages down — LAN-341.
 *
 * A recruit's status changing is the club deciding it has stopped talking to
 * them (an exit) or started talking to them as a player (the flip). Either way
 * whatever is still queued describes the old relationship, and LAN-204's own
 * rule for the recruitment cycle — "every exit cancels every currently queued
 * recruit-cycle job outright, not merely refuses new ones" — is the rule this
 * file states once for both ladders rather than twice in two writers.
 *
 * Two ladders, because a recruit is addressed by two kinds of message and they
 * are keyed differently: the recruitment CYCLE carries no invitation and is
 * found by its `recruit-cycle:` idempotency key, while every EVENT message —
 * invitation, follow-up, and an operator's own chase — hangs off a
 * recruit-capacity `invitations` row. Nothing else is touched: `'processing'`
 * is a message already handed to the provider, and `'completed'` is one that
 * has gone.
 */

/** The exits' own reason, in the club's words. `toStatus` is the recruit vocabulary's own. */
export function recruitStatusCancellationReason(toStatus: string): string {
  return `Recruit moved to ${toStatus}.`;
}

/** The flip's reason — W14. Says what happened, not merely that something did. */
export const RECRUIT_JOINED_CANCELLATION_REASON = "Recruit joined the roster.";

/**
 * The recruitment cycle's queued steps for one person in one season.
 *
 * Scoped by the key's own trailing `:<personId>:<seasonId>`
 * (`recruitment-cycle.ts` mints it) as well as by `person_id`: a person can be
 * a prospect in two seasons, and a status change in one says nothing about the
 * other.
 */
export async function cancelRecruitCycleJobsIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  reason: string,
): Promise<number> {
  const cancelled = await tx.query(
    `update public.notification_jobs
        set status = 'cancelled', cancelled_reason = $3, claimed_at = null, claimed_by = null,
            updated_at = now()
      where person_id = $1::uuid
        and idempotency_key like 'recruit-cycle:%:' || $1::text || ':' || $2::text
        and status in ('pending', 'ready', 'failed')`,
    [personId, seasonId, reason],
  );
  return cancelled.rowCount ?? 0;
}

/**
 * Every queued message addressed to one person's recruit-capacity invitations
 * in one season — LAN-341's first two defects.
 *
 * Keyed off `invitations.capacity = 'recruit'` rather than off the job's
 * idempotency key, so it reaches the invitation, its one follow-up, and an
 * operator's own chase (`event:…:chase:…`) alike, and reaches a job type this
 * package has not thought of without being amended for it. It deliberately
 * leaves the same person's PLAYER invitations alone: a person who is both a
 * prospect and a player in the season is still expected at practice.
 */
export async function cancelRecruitEventJobsIn(
  tx: Tx,
  personId: string,
  seasonId: string,
  reason: string,
): Promise<number> {
  const cancelled = await tx.query(
    `update public.notification_jobs j
        set status = 'cancelled', cancelled_reason = $3, claimed_at = null, claimed_by = null,
            updated_at = now()
       from public.invitations i
      where j.invitation_id = i.id
        and i.capacity = 'recruit'
        and i.season_id = $2::uuid
        and i.person_id = $1::uuid
        and j.status in ('pending', 'ready', 'failed')`,
    [personId, seasonId, reason],
  );
  return cancelled.rowCount ?? 0;
}
