import "server-only";

import { requireCapability } from "@/lib/auth/guards";
import { grantAtLeast } from "@/lib/auth/grants";
import { todayInClubZone } from "@/lib/club-time";
import { withTransaction, type Tx } from "@/lib/db";
import { NO_USABLE_EMAIL_REASON } from "@/lib/delivery/email";
import { NO_USABLE_NUMBER_REASON } from "@/lib/delivery/phone";

import {
  DELIVERY_LATEST_RESULT_JOIN,
  DELIVERY_STATE_EXPRESSION,
  NO_CONSENT_REASON,
  NOT_DELIVERED_EXPRESSION,
} from "./delivery";
import {
  isJobTypeLightsOutExempt,
  isLightsOut,
  lightsOutNow,
  lightsOutReleaseAt,
} from "./messaging-schedule/lights-out";
import { waitingLabelFor, type SafetyReasonCode } from "./messaging-safety/reasons";
import {
  DEFAULT_WINDOW,
  KIND_FAMILIES,
  PAGE_SIZE,
  statesForFilter,
  windowDays,
  windowReadsForward,
  type ChannelFilter,
  type KindFamily,
  type MessageKind,
  type MessageState,
  type QueueWindow,
  type StatusFilter,
} from "./message-queue-vocabulary";
import { personDisplayNameSql } from "./sql-text";

/**
 * The whole-club message queue — LAN-468.
 *
 * Every message the application has sent, is sending, or will send, across
 * events, recruitment and onboarding, read from `notification_jobs` (one row
 * per message, M4) plus the invitations written with no message at all because
 * consent was missing. Read-only: nothing here dispatches, retries or changes a
 * row.
 *
 * ## Bounds
 *
 * The list is always a window of whole club days and one page of at most
 * {@link PAGE_SIZE} rows. The summary is aggregates only — counts and one
 * timestamp — so it never returns rows whatever the table's size.
 *
 * ## One definition per fact, borrowed
 *
 * The state is `DELIVERY_STATE_EXPRESSION`, exactly as the event's Delivery
 * screen reads it, with two facts added in front of it that a per-event read
 * never needs (`not_sent`, `withheld` — see `message-queue-vocabulary.ts`).
 * "Will never send" repeats `DUE_JOB_PREDICATE`'s event clause rather than
 * importing the predicate, because the predicate also answers "is it due *now*"
 * and that is not the question a row asks.
 */

/** A message's moment: when it went (or last tried to), or when it is due. */
const AT_EXPRESSION = `
  case
    when j.status in ('pending', 'ready') then coalesce(j.next_attempt_at, j.scheduled_for, j.created_at)
    when j.status = 'cancelled' then j.updated_at
    else coalesce(
      (select max(a.requested_at) from public.delivery_attempts a where a.notification_job_id = j.id),
      j.updated_at)
  end`;

/** `DUE_JOB_PREDICATE`'s event clause, negated: queued against an event that has started or gone. */
const WILL_NEVER_SEND = `(
  j.event_id is not null
  and j.job_type not in ('escalation', 'cancellation_notice')
  and not exists (
    select 1 from public.events e
     where e.id = j.event_id
       and e.status = 'approved'
       and (e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
             at time zone 'Europe/London' > now()))`;

const STATE_EXPRESSION = `
  case
    when j.held_at is null and j.status in ('pending', 'ready') and ${WILL_NEVER_SEND} then 'not_sent'
    when j.status = 'failed' and j.last_error = $1 then 'withheld'
    else ${DELIVERY_STATE_EXPRESSION}
  end`;

const KIND_EXPRESSION = `
  case
    when j.job_type = 'invitation' then 'invitation'
    when j.job_type = 'reminder' and i.capacity = 'recruit' then 'recruit_followup'
    when j.job_type = 'reminder' then 'reminder'
    when j.job_type = 'escalation' then 'escalation'
    when j.job_type = 'schedule_change_notice' then 'change_notice'
    when j.job_type = 'cancellation_notice' then 'cancellation'
    when j.job_type = 'question_change_notice' then 'question_change'
    when j.idempotency_key like 'recruit-cycle:welcome:%' then 'recruit_welcome'
    when j.idempotency_key like 'recruit-cycle:details\\_reminder:%' then 'recruit_details_reminder'
    when j.idempotency_key like 'recruit-cycle:interest\\_ask:%' then 'recruit_interest_ask'
    when j.idempotency_key like 'recruit-cycle:interest\\_reminder:%' then 'recruit_interest_reminder'
    when j.idempotency_key like 'onboarding-welcome:%' then 'onboarding_welcome'
    when j.idempotency_key like 'onboarding-chase-escalation:%' then 'onboarding_escalation'
    when j.idempotency_key like 'onboarding-chase:%' then 'onboarding_chase'
    when j.idempotency_key like 'onboarding-nudge:%' then 'onboarding_nudge'
    when j.idempotency_key like 'attendance-sheet:%' then 'attendance_sheet'
    else 'other'
  end`;

/**
 * Every message, one row each. `$1` is `NO_CONSENT_REASON`. The second arm is
 * the invitations a rule wrote with no message (`message_withheld_reason`) and
 * no job since: a recruit nobody may message is a send that did not happen, and
 * the queue is where somebody asks why not.
 *
 * `onboarding-chase-exhausted:` is left out: it is a ledger marker written as
 * `completed`, never a message (see `messaging-queue.ts`).
 */
const MESSAGES_CTE = `
  messages as (
    select j.id::text as id,
           ${KIND_EXPRESSION} as kind,
           ${STATE_EXPRESSION} as state,
           ${AT_EXPRESSION} as at,
           j.channel::text as channel,
           j.job_type::text as job_type,
           j.person_id,
           coalesce(j.event_id, i.event_id) as event_id,
           j.status::text as status,
           j.attempt_count,
           case when j.status = 'failed' then j.next_attempt_at end as next_attempt_at,
           j.last_error,
           j.cancelled_reason,
           j.safety_reason_code,
           j.safety_retry_at,
           (j.status = 'processing' and ${NOT_DELIVERED_EXPRESSION}) as not_delivered
      from public.notification_jobs j
      left join public.invitations i on i.id = j.invitation_id
      ${DELIVERY_LATEST_RESULT_JOIN}
     where j.idempotency_key not like 'onboarding-chase-exhausted:%'
    union all
    select 'invitation:' || i.id::text,
           'invitation',
           'withheld',
           i.created_at,
           null,
           'invitation',
           coalesce(i.person_id, m.person_id),
           i.event_id,
           'withheld',
           0,
           null,
           i.message_withheld_reason,
           null,
           null,
           null,
           false
      from public.invitations i
      left join public.season_memberships m on m.id = i.season_membership_id
     where i.message_withheld_reason is not null
       and not exists (select 1 from public.notification_jobs x where x.invitation_id = i.id)
  )`;

/** `[from, to)` of a club day range as SQL instants, from `YYYY-MM-DD` parameters. */
function dayStart(param: string): string {
  return `((${param}::date)::timestamp at time zone 'Europe/London')`;
}

export interface MessageQueueFilters {
  readonly window?: QueueWindow;
  readonly status?: StatusFilter | null;
  readonly channel?: ChannelFilter | null;
  readonly kind?: KindFamily | null;
  /** 1-based. */
  readonly page?: number;
}

export interface MessageQueueRow {
  readonly id: string;
  readonly kind: MessageKind;
  readonly state: MessageState;
  readonly channel: string | null;
  /** When it went, last tried, or is due. */
  readonly at: Date;
  /**
   * For a queued row, when it will actually go: lights-out moves an overnight
   * moment to 07:00. `null` for every other state.
   */
  readonly sendsAt: Date | null;
  /** The existing waiting wording (`messaging-safety/reasons.ts`), or `null`. */
  readonly waiting: string | null;
  /** A retryable row's next automatic attempt. */
  readonly nextAttemptAt: Date | null;
  readonly attemptCount: number;
  readonly noUsableRoute: boolean;
  readonly notDelivered: boolean;
  readonly personId: string | null;
  readonly personName: string | null;
  readonly eventId: string | null;
  readonly eventName: string | null;
  /** Template View on the event's template (LAN-431); the page links the event only then. */
  readonly mayOpenEvent: boolean;
}

export interface MessageQueueSummary {
  /** Every queued message that will still send, at any date. */
  readonly queued: number;
  /** Of those, how many are already due and waiting for the sweep. */
  readonly dueNow: number;
  readonly nextDueAt: Date | null;
  readonly attempted: number;
  readonly deliveredToday: number;
  readonly deliveredYesterday: number;
  readonly failedToday: number;
  readonly failedYesterday: number;
  readonly held: number;
  readonly lightsOut: boolean;
}

export interface MessageQueue {
  readonly summary: MessageQueueSummary;
  readonly window: QueueWindow;
  readonly fromDay: string;
  readonly toDay: string;
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly rows: readonly MessageQueueRow[];
}

interface ListParams {
  readonly fromDay: string;
  readonly toDay: string;
  readonly states: readonly string[] | null;
  readonly channel: string | null;
  readonly kinds: readonly string[] | null;
  readonly forward: boolean;
  readonly limit: number;
  readonly offset: number;
}

/**
 * The list's SQL and parameters, separately from running it, so the bounds can
 * be asserted without a database: a window is always present and the limit is
 * never above {@link PAGE_SIZE}.
 */
export function buildListQuery(params: ListParams): { text: string; values: unknown[] } {
  if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > PAGE_SIZE) {
    throw new RangeError(`A page is 1 to ${PAGE_SIZE} rows.`);
  }
  if (!Number.isInteger(params.offset) || params.offset < 0) {
    throw new RangeError("A page offset is a whole number.");
  }
  const where = `
     where m.at >= ${dayStart("$2")} and m.at < ${dayStart("$3")}
       and ($4::text[] is null or m.state = any($4::text[]))
       and ($5::text is null or m.channel = $5::text)
       and ($6::text[] is null or m.kind = any($6::text[]))`;
  const direction = params.forward ? "asc" : "desc";
  const text = `
    with ${MESSAGES_CTE}
    select m.*,
           count(*) over () as total,
           ${personDisplayNameSql("p")} as person_name,
           ev.name as event_name,
           ev.template_id::text as template_id
      from messages m
      left join public.people p on p.id = m.person_id
      left join public.events ev on ev.id = m.event_id
      ${where}
     order by m.at ${direction}, m.id ${direction}
     limit $7 offset $8`;
  return {
    text,
    values: [
      NO_CONSENT_REASON,
      params.fromDay,
      params.toDay,
      params.states,
      params.channel,
      params.kinds,
      params.limit,
      params.offset,
    ],
  };
}

interface ListRow {
  id: string;
  kind: MessageKind;
  state: MessageState;
  at: Date;
  channel: string | null;
  job_type: string;
  person_id: string | null;
  event_id: string | null;
  attempt_count: number;
  next_attempt_at: Date | null;
  last_error: string | null;
  safety_reason_code: string | null;
  safety_retry_at: Date | null;
  not_delivered: boolean;
  total: string;
  person_name: string | null;
  event_name: string | null;
  template_id: string | null;
}

interface SummaryRow {
  queued: number;
  due_now: number;
  next_due_at: Date | null;
  attempted: number;
  delivered_today: number;
  delivered_yesterday: number;
  failed_today: number;
  failed_yesterday: number;
  held: number;
}

async function readSummaryIn(tx: Tx, today: string, yesterday: string): Promise<SummaryRow> {
  const result = await tx.query<SummaryRow>(
    `with ${MESSAGES_CTE}
     select count(*) filter (where state = 'queued')::int as queued,
            count(*) filter (where state = 'queued' and at <= now())::int as due_now,
            min(at) filter (where state = 'queued' and at > now()) as next_due_at,
            count(*) filter (where state = 'attempted')::int as attempted,
            count(*) filter (where state = 'delivered'
                               and at >= ${dayStart("$2")} and at < ${dayStart("$2")} + interval '1 day')::int
              as delivered_today,
            count(*) filter (where state = 'delivered'
                               and at >= ${dayStart("$3")} and at < ${dayStart("$2")})::int
              as delivered_yesterday,
            count(*) filter (where state in ('failed', 'retryable')
                               and at >= ${dayStart("$2")} and at < ${dayStart("$2")} + interval '1 day')::int
              as failed_today,
            count(*) filter (where state in ('failed', 'retryable')
                               and at >= ${dayStart("$3")} and at < ${dayStart("$2")})::int
              as failed_yesterday,
            count(*) filter (where state = 'held')::int as held
       from messages`,
    [NO_CONSENT_REASON, today, yesterday],
  );
  return result.rows[0]!;
}

/**
 * When a queued message will actually go, and what is holding it. Pure.
 *
 * The plan's moment is not moved (LAN-433): the row still says when its rung
 * falls. This answers the separate question "when does it leave", in the same
 * words the other surfaces already use.
 */
export function queuedTiming(
  row: {
    readonly state: string;
    readonly jobType: string;
    readonly at: Date;
    readonly safetyReasonCode: string | null;
    readonly safetyRetryAt: Date | null;
  },
  now: Date,
): { sendsAt: Date | null; waiting: string | null } {
  if (row.state !== "queued") return { sendsAt: null, waiting: null };
  if (row.safetyReasonCode !== null) {
    const retry = row.safetyRetryAt && row.safetyRetryAt > now ? row.safetyRetryAt : null;
    return {
      sendsAt: retry,
      waiting: waitingLabelFor(row.safetyReasonCode as SafetyReasonCode),
    };
  }
  const moment = row.at > now ? row.at : now;
  if (!isJobTypeLightsOutExempt(row.jobType) && isLightsOut(moment)) {
    return { sendsAt: lightsOutReleaseAt(moment), waiting: null };
  }
  return { sendsAt: moment, waiting: null };
}

/**
 * The queue: summary, then one page of the window. `delivery_administration` —
 * the capability that already reads messaging safety for the whole club.
 */
export async function readMessageQueue(filters: MessageQueueFilters = {}): Promise<MessageQueue> {
  const operator = await requireCapability("delivery_administration");

  const window = filters.window ?? DEFAULT_WINDOW;
  const today = todayInClubZone();
  const { fromDay, toDay } = windowDays(window, today);
  const yesterday = windowDays("yesterday", today).fromDay;
  const page = Number.isInteger(filters.page) && (filters.page ?? 0) > 0 ? filters.page! : 1;

  const query = buildListQuery({
    fromDay,
    toDay,
    states: filters.status ? [...statesForFilter(filters.status)] : null,
    channel: filters.channel ?? null,
    kinds: filters.kind ? [...KIND_FAMILIES[filters.kind]] : null,
    forward: windowReadsForward(window),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  return withTransaction(async (tx) => {
    // One connection, so one statement at a time.
    const summary = await readSummaryIn(tx, today, yesterday);
    const list = await tx.query<ListRow>(query.text, query.values);
    const now = lightsOutNow();

    const rows = list.rows.map((row): MessageQueueRow => {
      const timing = queuedTiming(
        {
          state: row.state,
          jobType: row.job_type,
          at: row.at,
          safetyReasonCode: row.safety_reason_code,
          safetyRetryAt: row.safety_retry_at,
        },
        now,
      );
      return {
        id: row.id,
        kind: row.kind,
        state: row.state,
        channel: row.channel,
        at: row.at,
        sendsAt: timing.sendsAt,
        waiting: timing.waiting,
        nextAttemptAt: row.state === "retryable" ? row.next_attempt_at : null,
        attemptCount: row.attempt_count,
        noUsableRoute:
          row.state === "failed" &&
          (row.last_error === NO_USABLE_NUMBER_REASON || row.last_error === NO_USABLE_EMAIL_REASON),
        notDelivered: row.state === "attempted" && row.not_delivered,
        personId: row.person_id,
        personName: row.person_name,
        eventId: row.event_id,
        eventName: row.event_name,
        mayOpenEvent:
          row.template_id !== null &&
          grantAtLeast(operator.grants, { kind: "template", templateId: row.template_id }, "view"),
      };
    });

    return {
      summary: {
        queued: summary.queued,
        dueNow: summary.due_now,
        nextDueAt: summary.next_due_at,
        attempted: summary.attempted,
        deliveredToday: summary.delivered_today,
        deliveredYesterday: summary.delivered_yesterday,
        failedToday: summary.failed_today,
        failedYesterday: summary.failed_yesterday,
        held: summary.held,
        lightsOut: isLightsOut(now),
      },
      window,
      fromDay,
      toDay,
      page,
      pageSize: PAGE_SIZE,
      total: list.rows.length > 0 ? Number(list.rows[0]!.total) : 0,
      rows,
    };
  });
}
