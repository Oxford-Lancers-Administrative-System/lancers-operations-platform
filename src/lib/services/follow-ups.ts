import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { requireGeneralOperator } from "@/lib/auth/guards";
import { NO_USABLE_EMAIL_REASON } from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";

import { chasePositionLabel, type ChaseJobFact } from "./chase-position";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  EMAIL_FALLBACK_SUFFIX,
  NOTIFICATION_JOB_RECENCY_ORDER,
} from "./delivery";
import { personDisplayNameSql as displayName } from "./sql-text";

/**
 * The Follow-ups queue — W5. `REQ-nobody-compiles-a-list`, `REQ-one-list-two-streams`.
 *
 * ## What this reads, and what it never computes
 *
 * `nonresponse_queue` already exists on `main` and already is the definition
 * of "has not answered" — `invitation_response_state` joined to approved
 * events, filtered to `awaiting_response` or `expired_without_response`. This
 * module adds nothing to that definition; it reads the view, joins each row to
 * its most recent delivery and its escalation flag, and labels the result.
 *
 * The escalation itself — raising the flag, resolving the office, sending the
 * message with no player personal data in it — is LAN-169's, in
 * `messaging-scheduler.ts`. This module only reads what that already wrote.
 *
 * ## The two streams, one list
 *
 * `F4`: somebody the club cannot reach is as unresolved as somebody who has
 * not replied. Both are `nonresponse_queue` rows — an undeliverable person has
 * not answered either, by construction, since answering removes the row from
 * the view before this module ever sees it. The distinction is a label
 * (`FollowUpStatus`), not a second query.
 */

export type FollowUpStatus = "delivery_problem" | "escalated" | "escalation_held" | "chasing";

export interface FollowUpRow {
  readonly invitationId: string;
  readonly personName: string;
  readonly deadline: Date | null;
  readonly chasePosition: string | null;
  readonly status: FollowUpStatus;
}

export interface FollowUpEvent {
  readonly eventId: string;
  readonly eventName: string;
  readonly scheduledOn: string | null;
  /** Soonest response deadline among this event's outstanding people. */
  readonly deadline: Date | null;
  readonly people: readonly FollowUpRow[];
}

interface QueueRow {
  invitation_id: string;
  event_id: string;
  event_name: string;
  scheduled_on: string | null;
  expires_at: Date | null;
  display_name: string | null;
  delivery_state: string | null;
  delivery_channel: string | null;
  delivery_failure_reason: string | null;
  escalation_job_id: string | null;
  flag_open: boolean;
}

/**
 * OWNER-LAN173-06 (correction round 2): this lateral shared
 * `participation.ts`'s `DELIVERY_LATERAL` bug exactly — `order by
 * j.created_at desc limit 1` with no tiebreaker over a set of rows that, in
 * real use, commonly share one `created_at` (a whole ladder is created in
 * `approveEvent`'s single transaction). Both now order by
 * `NOTIFICATION_JOB_RECENCY_ORDER`, so they cannot drift back into two
 * different answers to "which job is this invitee's most recent." See that
 * constant in `./delivery.ts` for the full account.
 */
async function readQueueRowsIn(tx: Tx): Promise<QueueRow[]> {
  const result = await tx.query<QueueRow>(
    `select q.invitation_id, q.event_id, q.event_name, q.scheduled_on::text as scheduled_on,
            q.expires_at,
            ${displayName("p")} as display_name,
            delivery.state as delivery_state,
            delivery.channel as delivery_channel,
            delivery.failure_reason as delivery_failure_reason,
            f.escalation_job_id,
            (f.invitation_id is not null) as flag_open
       from public.nonresponse_queue q
       join public.invitations i on i.id = q.invitation_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join lateral (
         select case when j.id is null then null else ${DELIVERY_STATE_EXPRESSION} end as state,
                j.channel::text as channel,
                j.last_error as failure_reason
           from public.notification_jobs j
           ${DELIVERY_LATEST_RESULT_JOIN}
          where j.invitation_id = i.id
            and j.idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'
          ${NOTIFICATION_JOB_RECENCY_ORDER}
          limit 1
       ) delivery on true
       left join public.nonresponse_flags f
         on f.invitation_id = i.id and f.threshold = 'escalation' and f.resolved_at is null
      order by q.scheduled_on nulls last, q.event_name, display_name`,
  );
  return result.rows;
}

interface ChaseJobRow {
  invitation_id: string;
  job_type: string;
  channel: string;
  ladder_rung: number | null;
  status: string;
  scheduled_for: Date | null;
}

async function readChaseJobsForIn(
  tx: Tx,
  invitationIds: readonly string[],
): Promise<Map<string, ChaseJobFact[]>> {
  const byInvitation = new Map<string, ChaseJobFact[]>();
  if (invitationIds.length === 0) return byInvitation;

  const rows = await tx.query<ChaseJobRow>(
    `select invitation_id, job_type::text as job_type, channel::text as channel,
            ladder_rung, status::text as status, scheduled_for
       from public.notification_jobs
      where invitation_id = any($1::uuid[])
        and job_type in ('invitation', 'reminder', 'escalation')
        and idempotency_key not like '%${EMAIL_FALLBACK_SUFFIX}'`,
    [invitationIds],
  );

  for (const row of rows.rows) {
    const list = byInvitation.get(row.invitation_id) ?? [];
    list.push({
      jobType: row.job_type as ChaseJobFact["jobType"],
      channel: row.channel,
      ladderRung: row.ladder_rung,
      status: row.status,
      scheduledFor: row.scheduled_for,
    });
    byInvitation.set(row.invitation_id, list);
  }
  return byInvitation;
}

/**
 * The cross-event queue, grouped by event, soonest first — W5's own layout.
 *
 * `requireGeneralOperator()` is the floor, exactly as the participation
 * table's does: seeing who has not answered is not gated on a further
 * capability, and the narrow coaching assignment is already excluded by that
 * guard the same way it is everywhere else.
 */
export async function readFollowUpsQueue(): Promise<readonly FollowUpEvent[]> {
  await requireGeneralOperator();
  return withTransaction(async (tx) => {
    const rows = await readQueueRowsIn(tx);
    const jobsByInvitation = await readChaseJobsForIn(
      tx,
      rows.map((row) => row.invitation_id),
    );

    const byEvent = new Map<string, FollowUpEvent>();
    for (const row of rows) {
      const noUsableRoute =
        row.delivery_state === "failed" &&
        (row.delivery_failure_reason === NO_USABLE_NUMBER_REASON ||
          row.delivery_failure_reason === NO_USABLE_EMAIL_REASON);

      // F4: one list, two streams. A delivery problem is shown as one, ahead
      // of where escalation or chasing would otherwise put this row — the
      // club cannot chase somebody it has never reached.
      const status: FollowUpStatus = noUsableRoute
        ? "delivery_problem"
        : row.flag_open
          ? row.escalation_job_id
            ? "escalated"
            : // T03-escalation-office: a vacant seat holds the escalation
              // visibly rather than dropping it or sending it to a stale
              // holder — messaging-scheduler.ts's own words for this state.
              "escalation_held"
          : "chasing";

      const chasePosition = noUsableRoute
        ? null
        : chasePositionLabel({
            responseState: "awaiting_response",
            isWalkUp: false,
            escalated: row.flag_open,
            jobs: jobsByInvitation.get(row.invitation_id) ?? [],
          });

      const person: FollowUpRow = {
        invitationId: row.invitation_id,
        personName: row.display_name ?? "Unnamed participant",
        deadline: row.expires_at,
        chasePosition,
        status,
      };

      const existing = byEvent.get(row.event_id);
      if (existing) {
        (existing.people as FollowUpRow[]).push(person);
        if (
          row.expires_at &&
          (!existing.deadline || row.expires_at.getTime() < existing.deadline.getTime())
        ) {
          byEvent.set(row.event_id, { ...existing, deadline: row.expires_at });
        }
      } else {
        byEvent.set(row.event_id, {
          eventId: row.event_id,
          eventName: row.event_name,
          scheduledOn: row.scheduled_on,
          deadline: row.expires_at,
          people: [person],
        });
      }
    }

    return [...byEvent.values()].sort((a, b) =>
      (a.scheduledOn ?? "").localeCompare(b.scheduledOn ?? ""),
    );
  });
}

/** The flat count W5-01's own opening line reads — people, not rows. */
export function countPeople(events: readonly FollowUpEvent[]): number {
  return events.reduce((total, event) => total + event.people.length, 0);
}
