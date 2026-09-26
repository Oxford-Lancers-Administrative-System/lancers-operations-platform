import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { requireGrant } from "@/lib/auth/guards";
import { grantAtLeast, templatesAtLeast } from "@/lib/auth/grants";
import { NO_USABLE_EMAIL_REASON } from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";

import { chasePositionLabel, type ChaseJobFact } from "./chase-position";
import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  EMAIL_FALLBACK_SUFFIX,
  NOT_DELIVERED_EXPRESSION,
  NOTIFICATION_JOB_RECENCY_ORDER,
} from "./delivery";
import { EXIT_STATUSES } from "./recruitment-vocabulary";
import { personDisplayNameSql as displayName } from "./sql-text";

/**
 * The Follow-ups queue — W5 (`REQ-nobody-compiles-a-list`, `REQ-one-list-two-streams`). Reads `nonresponse_queue` (the existing "has not answered" definition) and joins each row to its most recent delivery and escalation flag; adds no logic of its own. The escalation itself — raising the flag, resolving the office, sending it — is LAN-169's, in `messaging-scheduler.ts`.
 * `F4`: an undeliverable person and one who has not replied are both unresolved and both `nonresponse_queue` rows; the split is a `FollowUpStatus` label, not a second query.
 */

type FollowUpStatus =
  "delivery_problem" | "escalation_held" | "escalated" | "not_delivered" | "chasing";

/** The most recent message this invitation has — LAN-322, so a second operator can see one has already gone. `state` is `DELIVERY_STATE_EXPRESSION`'s own vocabulary. */
export interface FollowUpDelivery {
  readonly state: string;
  readonly channel: string | null;
  readonly at: Date | null;
}

export interface FollowUpRow {
  readonly invitationId: string;
  /** LAN-329: the row's link to the person's own record. */
  readonly personId: string;
  readonly personName: string;
  readonly deadline: Date | null;
  readonly chasePosition: string | null;
  readonly status: FollowUpStatus;
  /** LAN-322: what was last sent, from the delivery this query already joins. */
  readonly lastDelivery: FollowUpDelivery | null;
  /** `REQ-never-harsh`: a recruit is never chased a second time, so the queue says the row cannot be. */
  readonly chaseable: boolean;
  /** LAN-431: Manage on the event's template. Without it the row offers no chase at all. */
  readonly mayChase: boolean;
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
  template_id: string;
  event_name: string;
  person_id: string;
  capacity: string;
  scheduled_on: string | null;
  expires_at: Date | null;
  display_name: string | null;
  delivery_state: string | null;
  /** LAN-411 — `NOT_DELIVERED_EXPRESSION`. `null` where this invitation has no job. */
  delivery_not_delivered: boolean | null;
  delivery_channel: string | null;
  delivery_at: Date | null;
  delivery_failure_reason: string | null;
  escalation_job_id: string | null;
  /** F-B1: the escalation job's own `notification_jobs.status`; null when the office was vacant. */
  escalation_status: string | null;
  flag_open: boolean;
}

/** OWNER-LAN173-06: orders by `NOTIFICATION_JOB_RECENCY_ORDER` (see `./delivery.ts`). */
async function readQueueRowsIn(tx: Tx, templateIds: readonly string[]): Promise<QueueRow[]> {
  const result = await tx.query<QueueRow>(
    `select q.invitation_id, q.event_id, ev.template_id::text as template_id, q.event_name, q.scheduled_on::text as scheduled_on,
            q.expires_at, q.capacity::text as capacity, p.id as person_id,
            ${displayName("p")} as display_name,
            delivery.state as delivery_state,
            delivery.not_delivered as delivery_not_delivered,
            delivery.channel as delivery_channel,
            delivery.at as delivery_at,
            delivery.failure_reason as delivery_failure_reason,
            f.escalation_job_id,
            ej.status::text as escalation_status,
            (f.invitation_id is not null) as flag_open
       from public.nonresponse_queue q
       join public.invitations i on i.id = q.invitation_id
       join public.events ev on ev.id = q.event_id
       left join public.season_memberships m on m.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, m.person_id)
       left join lateral (
         select case when j.id is null then null else ${DELIVERY_STATE_EXPRESSION} end as state,
                -- LAN-411: the same derivation the event's own screens make.
                ${NOT_DELIVERED_EXPRESSION} as not_delivered,
                j.channel::text as channel,
                -- LAN-322. When that message was last acted on, so the row can
                -- say a chase has already gone rather than only that one has.
                j.updated_at as at,
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
       -- F-B1, mechanism 4. The escalation job's own state, not merely
       -- whether one was created.
       left join public.notification_jobs ej on ej.id = f.escalation_job_id
      -- LAN-341. This queue is people who owe an answer and can be chased. A
      -- recruit who has left recruitment is neither: LAN-341 cancelled every
      -- message they were holding and nothing more will be sent, so a row
      -- reading "Chasing" against them is work an operator cannot do. The
      -- invitation itself stays exactly as it is — the record of what was sent —
      -- and only this list drops them.
      where not (i.capacity = 'recruit'
                 and exists (select 1
                               from public.recruitment_prospects rp
                              where rp.person_id = i.person_id
                                and rp.season_id = i.season_id
                                and rp.status = any($1::public.prospect_status[])))
        -- LAN-431: only events of templates the reader holds at View or above.
        and ev.template_id::text = any($2::text[])
      order by q.scheduled_on nulls last, q.event_name, display_name`,
    [[...EXIT_STATUSES], [...templateIds]],
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
 * The cross-event queue, grouped by event, soonest first (W5). LAN-431: any template at View, and
 * only rows of events whose template the reader holds at View or above; each row says whether the
 * reader may chase it (Manage on that template).
 */
export async function readFollowUpsQueue(): Promise<readonly FollowUpEvent[]> {
  const operator = await requireGrant({ anyOf: "template", minimum: "view" });
  return withTransaction(async (tx) => {
    const rows = await readQueueRowsIn(tx, templatesAtLeast(operator.grants, "view"));
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

      // F-B1: a job that exists is not a job that was delivered.
      const escalationDelivered =
        row.escalation_status === "completed" || row.escalation_status === "processing";

      /**
       * LAN-411: the club's last message to this person was accepted by Meta
       * an hour ago and has said nothing since. Advisory — nothing about the
       * person or the ladder changes, and the follow-up is a human one.
       */
      const notDelivered =
        row.delivery_state === "attempted" && row.delivery_not_delivered === true;

      /**
       * F4: delivery problem outranks escalation/chasing — the club cannot
       * chase somebody it has never reached.
       *
       * LAN-411 adds one rung, fourth of five (Brian, 2026-09-21): Delivery
       * problem, Escalation held, Escalated, **Not delivered**, Chasing. The
       * first three are the club's own problem to fix; Not delivered beats
       * Chasing because it says the chase is probably not landing, and sits
       * under Escalated because an escalation already has a named owner.
       */
      const status: FollowUpStatus = noUsableRoute
        ? "delivery_problem"
        : row.flag_open
          ? row.escalation_job_id
            ? escalationDelivered
              ? "escalated"
              : "delivery_problem"
            : // T03-escalation-office: a vacant seat holds the escalation visibly.
              "escalation_held"
          : notDelivered
            ? "not_delivered"
            : "chasing";

      const chasePosition = noUsableRoute
        ? null
        : chasePositionLabel({
            responseState: "awaiting_response",
            isWalkUp: false,
            escalated: row.flag_open,
            escalationJobStatus: row.escalation_status,
            jobs: jobsByInvitation.get(row.invitation_id) ?? [],
          });

      const person: FollowUpRow = {
        invitationId: row.invitation_id,
        personId: row.person_id,
        personName: row.display_name ?? "Unnamed participant",
        deadline: row.expires_at,
        chasePosition,
        status,
        lastDelivery:
          row.delivery_state === null
            ? null
            : {
                state: row.delivery_state,
                channel: row.delivery_channel,
                at: row.delivery_at,
              },
        // W11/`REQ-never-harsh`: the recruitment ladder sends one invitation and
        // at most one follow-up, so the queue offers no operator chase for a
        // recruit either — `sendEventChases` refuses one, and this is the same
        // fact said on the row rather than a second rule.
        chaseable: row.capacity !== "recruit",
        mayChase: grantAtLeast(
          operator.grants,
          { kind: "template", templateId: row.template_id },
          "manage",
        ),
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
