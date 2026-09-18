import "server-only";

import { requireCapability } from "@/lib/auth/guards";
import { withTransaction, type Tx } from "@/lib/db";
import { personDisplayNameSql } from "../sql-text";
import {
  CAPACITY_WARNING_THRESHOLD,
  GLOBAL_EMERGENCY_LIMIT,
  GLOBAL_EMERGENCY_WINDOW_HOURS,
  POLICY_DECISION,
  QUEUE_WARNING_MINUTES,
  RECIPIENT_DAILY_LIMIT,
  RECIPIENT_DAILY_WINDOW_HOURS,
  RECIPIENT_PACING_LIMIT,
  RECIPIENT_PACING_WINDOW_MINUTES,
  RECIPIENT_WEEKLY_LIMIT,
  RECIPIENT_WEEKLY_WINDOW_DAYS,
  SAFETY_FIELD_RETENTION_DAYS,
  SHARED_PACING_LIMIT,
  SHARED_PACING_WINDOW_MINUTES,
  UNRESOLVED_ATTEMPT_MINUTES,
} from "./policy";
import type { SafetyReasonCode } from "./reasons";
import { MAX_ATTEMPTS } from "../delivery";
import { DUE_JOB_PREDICATE } from "../messaging-queue";
import { GLOBAL_SCOPE_KEY, readActiveScopesIn, readScopeIn, policyMatches } from "./scopes";

/**
 * What the Messaging safety section reads. LAN-394.
 *
 * One read, one shape, and no decision taken here: this module answers "what is
 * true right now", and every control that changes it guards itself separately.
 *
 * ## What is deliberately not in it
 *
 * A destination fingerprint, ever. A hold on a number is shown as the people
 * the club has recently messaged at it — which is what an operator can actually
 * act on, and which the roster already shows them — rather than as a hash they
 * could copy somewhere. The fingerprint never leaves the server.
 */

/**
 * The middle window of the runaway row group. A read window, not a threshold:
 * nothing in `policy.ts` governs an hour, and nothing here may.
 */
const RUNAWAY_HOUR_WINDOW_HOURS = 1;

/**
 * The one thing the section says first, in the order Brian's 18 September 2026
 * visual pass lists them: green, amber, amber, red, red, and the read that
 * failed.
 *
 * `paused` and `emergency_stopped` are separate states rather than one "paused"
 * with a footnote because they are two different mornings. A person paused this
 * on purpose and can say why; the ceiling tripping means the club has already
 * sent three thousand messages in a day and nobody noticed.
 */
export type MessagingSafetyState =
  | "sending_normally"
  | "messages_waiting"
  | "provider_cooling_down"
  | "paused"
  | "emergency_stopped"
  | "unavailable";

interface SafetyThresholdRow {
  readonly control: string;
  readonly value: string;
  readonly effect: string;
}

export interface SafetyHoldRow {
  readonly scopeId: string;
  readonly version: number;
  /** Never `global`: that scope's control is the section's own, not a row here. */
  readonly kind: "provider" | "person" | "destination";
  /** What the hold is on, in the club's words. Never a fingerprint. */
  readonly label: string;
  readonly reasonCode: SafetyReasonCode | null;
  readonly since: Date;
  /** People the club has recently messaged at this destination, for a destination hold. */
  readonly people: readonly { readonly personId: string; readonly name: string }[];
  /** True where more than one person shares this destination. */
  readonly shared: boolean;
  readonly pausedByName: string | null;
  readonly pausedReason: string | null;
  readonly cooldownUntil: Date | null;
  /**
   * Which ceiling this recipient actually reached, read back from the attempts
   * rather than stored. The latch reason code says `person_hold`, which is true
   * and useless to somebody deciding whether to resume: ten in a day is a
   * mistake this afternoon and thirty in a week is a mistake all week. `null`
   * once the counting fields have aged out (`SAFETY_FIELD_RETENTION_DAYS`), and
   * the reason code is shown instead.
   */
  readonly limitReached: "daily" | "weekly" | null;
}

interface SafetyAuditRow {
  readonly id: string;
  readonly occurredAt: Date;
  readonly action: string;
  readonly actorName: string;
  readonly reason: string | null;
}

export interface MessagingSafetyStatus {
  readonly state: MessagingSafetyState;
  /** The global scope's identity and version, which every control posts back. */
  readonly globalScopeId: string | null;
  readonly globalVersion: number;
  readonly pausedAt: Date | null;
  readonly pausedByName: string | null;
  readonly pausedReason: string | null;
  readonly emergencyStopped: boolean;
  readonly lastChangeAt: Date | null;
  /** Jobs whose moment has arrived and which have not been sent. */
  readonly dueWaiting: number;
  readonly oldestDueMinutes: number;
  /** Jobs the guard is currently holding back. A queue, never a failure. */
  readonly heldBySafety: number;
  /** Jobs the club has scheduled for a moment that has not arrived. Not a backlog. */
  readonly scheduledAhead: number;
  readonly queueWarning: boolean;
  readonly admittedInPacingWindow: number;
  /**
   * Admissions in the last rolling hour. No ceiling governs an hour; it is here
   * because five minutes is too short to see a runaway building and a day is
   * too long to notice one starting (Brian, 18 September 2026).
   */
  readonly admittedInHour: number;
  readonly admittedInDay: number;
  readonly admittedInWeek: number;
  /**
   * The two ceilings the first row group is read against, carried from
   * `policy.ts` rather than imported by the section: the section is a client
   * component and the policy module travels through a `server-only` barrel.
   */
  readonly pacingLimit: number;
  readonly dayLimit: number;
  readonly capacityWarning: boolean;
  readonly thresholds: readonly SafetyThresholdRow[];
  readonly holds: readonly SafetyHoldRow[];
  /** Attempts with no recorded provider outcome. A diagnostic, never a retry. */
  readonly unresolvedAttempts: number;
  readonly oldestUnresolvedMinutes: number;
  readonly audit: readonly SafetyAuditRow[];
  readonly policyDecision: string;
}

/** The thresholds, exactly as decided, for the read-only table. */
export function safetyThresholds(): readonly SafetyThresholdRow[] {
  return [
    {
      control: "Shared pacing",
      value: `${SHARED_PACING_LIMIT} per ${SHARED_PACING_WINDOW_MINUTES} minutes`,
      effect: "Extra messages wait",
    },
    {
      control: "Per person",
      value: `${RECIPIENT_PACING_LIMIT} per ${RECIPIENT_PACING_WINDOW_MINUTES} minutes`,
      effect: "Extra messages wait",
    },
    {
      control: "Per number or address",
      value: `${RECIPIENT_PACING_LIMIT} per ${RECIPIENT_PACING_WINDOW_MINUTES} minutes`,
      effect: "Extra messages wait",
    },
    {
      control: "Person or number limit",
      value: `${RECIPIENT_DAILY_LIMIT} per ${RECIPIENT_DAILY_WINDOW_HOURS} hours, ${RECIPIENT_WEEKLY_LIMIT} per ${RECIPIENT_WEEKLY_WINDOW_DAYS} days`,
      effect: "Held until resumed",
    },
    {
      control: "Emergency stop",
      value: `${GLOBAL_EMERGENCY_LIMIT.toLocaleString("en-GB")} per ${GLOBAL_EMERGENCY_WINDOW_HOURS} hours`,
      effect: "All messaging paused until resumed",
    },
    {
      control: "Capacity warning",
      value: `${CAPACITY_WARNING_THRESHOLD.toLocaleString("en-GB")} per ${GLOBAL_EMERGENCY_WINDOW_HOURS} hours`,
      effect: "Warning only",
    },
    {
      control: "Queue warning",
      value: `Oldest waiting over ${QUEUE_WARNING_MINUTES} minutes`,
      effect: "Warning only",
    },
  ];
}

/**
 * Which of the two recipient ceilings a held person or number actually reached.
 *
 * Read back rather than stored, and read the same way the guard counted it, so
 * the answer on the page is the answer the guard gave. The day is checked
 * first: both can be true at once, and the shorter window is the one that says
 * what is happening today.
 */
async function limitReachedFor(
  tx: Tx,
  kind: "person" | "destination",
  scopeKey: string,
): Promise<"daily" | "weekly" | null> {
  const column = kind === "person" ? "safety_person_id::text" : "safety_destination_key";
  const counted = await tx.query<{ day: string; week: string }>(
    `select
       count(*) filter (where safety_admitted_at > now() - $2::interval)::text as day,
       count(*) filter (where safety_admitted_at > now() - $3::interval)::text as week
     from public.delivery_attempts
    where safety_admitted_at is not null and ${column} = $1`,
    [scopeKey, `${RECIPIENT_DAILY_WINDOW_HOURS} hours`, `${RECIPIENT_WEEKLY_WINDOW_DAYS} days`],
  );

  if (Number(counted.rows[0].day) >= RECIPIENT_DAILY_LIMIT) return "daily";
  if (Number(counted.rows[0].week) >= RECIPIENT_WEEKLY_LIMIT) return "weekly";
  return null;
}

/** Reads the section. Capability-checked here as well as on the page. */
export async function readMessagingSafetyStatus(): Promise<MessagingSafetyStatus> {
  await requireCapability("delivery_administration");

  return withTransaction(async (tx) => {
    const global = await readScopeIn(tx, "global", GLOBAL_SCOPE_KEY);
    const thresholds = safetyThresholds();

    if (!global || !policyMatches(global)) {
      return {
        state: "unavailable" as const,
        globalScopeId: global?.id ?? null,
        globalVersion: global?.version ?? 0,
        pausedAt: null,
        pausedByName: null,
        pausedReason: null,
        emergencyStopped: false,
        lastChangeAt: null,
        dueWaiting: 0,
        oldestDueMinutes: 0,
        heldBySafety: 0,
        scheduledAhead: 0,
        queueWarning: false,
        admittedInPacingWindow: 0,
        admittedInHour: 0,
        admittedInDay: 0,
        admittedInWeek: 0,
        pacingLimit: SHARED_PACING_LIMIT,
        dayLimit: GLOBAL_EMERGENCY_LIMIT,
        capacityWarning: false,
        thresholds,
        holds: [],
        unresolvedAttempts: 0,
        oldestUnresolvedMinutes: 0,
        audit: [],
        policyDecision: POLICY_DECISION,
      };
    }

    const queue = await tx.query<{
      due: string;
      oldest_minutes: string | null;
      ahead: string;
      held: string;
    }>(
      // What the page counts as waiting is what the **sweep** would actually
      // take. It was its own looser predicate for one afternoon, and on the
      // seeded database that read "645 due, oldest 3,648 hours" — hundreds of
      // historical jobs for events that have long since happened, which no
      // sweep would ever claim and which an operator can do nothing about. A
      // queue warning that fires on work nobody is waiting for is a warning
      // nobody reads.
      `with due as (
         select coalesce(next_attempt_at, scheduled_for, created_at) as due_at
           from public.notification_jobs
          where ${DUE_JOB_PREDICATE}
       )
       select
         (select count(*)::text from due) as due,
         (select (extract(epoch from now() - min(due_at)) / 60)::int::text from due) as oldest_minutes,
         (select count(*)::text from public.notification_jobs
           where held_at is null and status in ('pending', 'ready')
             and coalesce(scheduled_for, created_at) > now()) as ahead,
         (select count(*)::text from public.notification_jobs
           where safety_reason_code is not null and status in ('pending', 'ready')) as held`,
      [MAX_ATTEMPTS],
    );

    const usage = await tx.query<{ pacing: string; hour: string; day: string; week: string }>(
      `select
         count(*) filter (where safety_admitted_at > now() - $1::interval)::text as pacing,
         count(*) filter (where safety_admitted_at > now() - $2::interval)::text as hour,
         count(*) filter (where safety_admitted_at > now() - $3::interval)::text as day,
         count(*) filter (where safety_admitted_at > now() - $4::interval)::text as week
       from public.delivery_attempts
      where safety_admitted_at is not null`,
      [
        `${SHARED_PACING_WINDOW_MINUTES} minutes`,
        `${RUNAWAY_HOUR_WINDOW_HOURS} hours`,
        `${GLOBAL_EMERGENCY_WINDOW_HOURS} hours`,
        `${RECIPIENT_WEEKLY_WINDOW_DAYS} days`,
      ],
    );

    const unresolved = await tx.query<{ count: string; oldest_minutes: string | null }>(
      // Accepted by the provider, or requested and never concluded, with no
      // recorded outcome at all. A count and an age, and no action: v2 is
      // explicit that this is a diagnostic threshold, not a lease and not a
      // reason to send anything again.
      `select count(*)::text as count,
              (extract(epoch from now() - min(a.requested_at)) / 60)::int::text as oldest_minutes
         from public.delivery_attempts a
        where a.safety_admitted_at is not null
          and a.concluded_at is null
          and a.requested_at < now() - $1::interval
          and not exists (
            select 1 from public.delivery_results r
             where r.notification_job_id = a.notification_job_id
               and r.attempt_number = a.attempt_number
          )`,
      [`${UNRESOLVED_ATTEMPT_MINUTES} minutes`],
    );

    const scopes = await readActiveScopesIn(tx);

    const holds: SafetyHoldRow[] = [];
    for (const scope of scopes) {
      // The global row is the Controls section's own subject and already has a
      // button there. Listing it again under "People held back", with a second
      // Resume beside it, would offer the same act twice and leave an operator
      // wondering which one they pressed. The contract's list is of *scoped*
      // holds — a provider, a person, a number.
      if (scope.scopeKind === "global") continue;
      let label: string;
      let people: { personId: string; name: string }[] = [];
      let shared = false;

      if (scope.scopeKind === "provider") {
        label = scope.scopeKey === "email" ? "Email" : "WhatsApp";
      } else if (scope.scopeKind === "person") {
        const person = await tx.query<{ id: string; name: string }>(
          `select p.id, ${personDisplayNameSql("p")} as name
             from public.people p where p.id = $1::uuid`,
          [scope.scopeKey],
        );
        people = person.rows.map((row) => ({ personId: row.id, name: row.name }));
        label = people[0]?.name ?? "A person";
      } else {
        // A destination. Never the fingerprint: who the club has actually
        // messaged at it, which is the thing an operator can look at.
        const rows = await tx.query<{ id: string; name: string }>(
          `select distinct p.id, ${personDisplayNameSql("p")} as name
             from public.delivery_attempts a
             join public.people p on p.id = a.safety_person_id
            where a.safety_destination_key = $1
            order by name`,
          [scope.scopeKey],
        );
        people = rows.rows.map((row) => ({ personId: row.id, name: row.name }));
        shared = people.length > 1;
        label = people.length === 0 ? "A number or address" : "One number or address";
      }

      holds.push({
        scopeId: scope.id,
        version: scope.version,
        kind: scope.scopeKind,
        label,
        reasonCode: scope.latchReasonCode,
        since: scope.latchedAt ?? scope.pausedAt ?? scope.updatedAt,
        people,
        shared,
        pausedByName: null,
        pausedReason: scope.pausedReason,
        cooldownUntil: scope.cooldownUntil,
        limitReached:
          scope.scopeKind === "provider"
            ? null
            : await limitReachedFor(tx, scope.scopeKind, scope.scopeKey),
      });
    }

    const pausedBy = global.pausedByPersonId
      ? await tx.query<{ name: string }>(
          `select ${personDisplayNameSql("p")} as name from public.people p where p.id = $1::uuid`,
          [global.pausedByPersonId],
        )
      : null;

    const audit = await tx.query<{
      id: string;
      occurred_at: Date;
      action: string;
      reason: string | null;
      actor_name: string | null;
      actor_label: string | null;
    }>(
      // Bounded, deliberately: the page shows the last few changes, not the
      // whole history. `administration-audit` is where a full record belongs.
      `select e.id, e.occurred_at, e.action, e.reason,
              ${personDisplayNameSql("p")} as actor_name, e.actor_label
         from public.audit_events e
         left join public.people p on p.id = e.actor_person_id
        where e.entity_table = 'messaging_safety_scopes'
        order by e.occurred_at desc
        limit 10`,
    );

    const dueWaiting = Number(queue.rows[0].due);
    const oldestDueMinutes = Number(queue.rows[0].oldest_minutes ?? 0);
    const admittedInDay = Number(usage.rows[0].day);
    const coolingDown = scopes.some(
      (scope) => scope.scopeKind === "provider" && scope.cooldownUntil !== null,
    );

    // The ceiling tripping outranks a deliberate pause: if both are true the
    // club needs to know the emergency stop is what it will have to clear.
    const state: MessagingSafetyState = global.latchedAt
      ? "emergency_stopped"
      : global.pausedAt
        ? "paused"
        : coolingDown
          ? "provider_cooling_down"
          : dueWaiting > 0
            ? "messages_waiting"
            : "sending_normally";

    return {
      state,
      globalScopeId: global.id,
      globalVersion: global.version,
      pausedAt: global.pausedAt,
      pausedByName: pausedBy?.rows[0]?.name ?? null,
      pausedReason: global.pausedReason,
      emergencyStopped: global.latchedAt !== null,
      lastChangeAt: global.updatedAt,
      dueWaiting,
      oldestDueMinutes,
      heldBySafety: Number(queue.rows[0].held),
      scheduledAhead: Number(queue.rows[0].ahead),
      queueWarning: oldestDueMinutes > QUEUE_WARNING_MINUTES,
      admittedInPacingWindow: Number(usage.rows[0].pacing),
      admittedInHour: Number(usage.rows[0].hour),
      admittedInDay,
      admittedInWeek: Number(usage.rows[0].week),
      pacingLimit: SHARED_PACING_LIMIT,
      dayLimit: GLOBAL_EMERGENCY_LIMIT,
      capacityWarning: admittedInDay >= CAPACITY_WARNING_THRESHOLD,
      thresholds,
      holds,
      unresolvedAttempts: Number(unresolved.rows[0].count),
      oldestUnresolvedMinutes: Number(unresolved.rows[0].oldest_minutes ?? 0),
      audit: audit.rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at,
        action: row.action,
        actorName: row.actor_name ?? row.actor_label ?? "Unknown",
        reason: row.reason,
      })),
      policyDecision: POLICY_DECISION,
    };
  });
}

/**
 * Clears the identifying counting fields once every window has elapsed.
 *
 * Eight days (Brian, 17 September 2026), cleared together by the sweep that
 * already runs. It touches nothing else: the attempt row, its outcome, its
 * provider reference and its failure reason all remain, and `safety_admitted_at`
 * is deliberately kept so the global accounting stays conservative for rows
 * whose recipient is no longer recorded. There is no delete here and no new
 * delete privilege over delivery history.
 */
export async function clearExpiredSafetyFieldsIn(tx: Tx): Promise<number> {
  const result = await tx.query(
    `update public.delivery_attempts
        set safety_person_id = null, safety_destination_key = null
      where safety_admitted_at is not null
        and safety_admitted_at < now() - $1::interval
        and (safety_person_id is not null or safety_destination_key is not null)`,
    [`${SAFETY_FIELD_RETENTION_DAYS} days`],
  );
  return result.rowCount ?? 0;
}

/**
 * Removes recipient scope rows that hold nothing any more.
 *
 * The other half of the same retention decision, and the reason this table can
 * be described honestly as "one row per person or destination that has been
 * held" (LAN-394 review, B-01). A recipient row only ever exists because
 * something was held; once the hold has been resumed and eight days have
 * passed with nothing further recorded against it, the row is a person id or a
 * destination fingerprint that nothing is using, so it goes — on the same tick,
 * by the same rule, as the two identifying fields on the attempts themselves.
 *
 * Deliberately narrow, three times over: `person` and `destination` scopes
 * only, so the global row and the two provider circuits can never be touched;
 * nothing currently paused, latched or cooling down; and nothing a waiting job
 * still points at, so a deferral can never lose the name of what is holding it.
 */
export async function clearExpiredSafetyScopesIn(tx: Tx): Promise<number> {
  const result = await tx.query(
    `delete from public.messaging_safety_scopes s
      where s.scope_kind in ('person', 'destination')
        and s.paused_at is null
        and s.latched_at is null
        and s.cooldown_until is null
        and s.updated_at < now() - $1::interval
        and not exists (
          select 1 from public.notification_jobs j where j.safety_block_scope_id = s.id)`,
    [`${SAFETY_FIELD_RETENTION_DAYS} days`],
  );
  return result.rowCount ?? 0;
}
