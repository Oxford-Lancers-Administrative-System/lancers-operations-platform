import "server-only";

import { ConstraintViolated, InvalidTransition, type Tx } from "@/lib/db";
import { requireCapability } from "@/lib/auth/guards";
import { recordAudit } from "../audit";
import { emitSafetyEvent, type SafetyIncidentKind } from "./monitor";
import {
  CAPACITY_WARNING_THRESHOLD,
  GLOBAL_EMERGENCY_LIMIT,
  GLOBAL_EMERGENCY_WINDOW_HOURS,
  POLICY_VERSION,
  QUEUE_WARNING_MINUTES,
  SHARED_PACING_LIMIT,
  SHARED_PACING_WINDOW_MINUTES,
} from "./policy";
import type { SafetyReasonCode } from "./reasons";

/**
 * Safety scopes: reading them, locking them, and the two controls. LAN-394.
 *
 * ## One lock order, everywhere
 *
 * Global, then provider, then person, then destination — and scope
 * administration takes global then the one scope it is changing, never a batch
 * of jobs. Every admission and every settlement follows the same order, which
 * is the whole of the deadlock argument: two transactions that acquire the same
 * rows in the same order cannot wait on each other in a cycle.
 *
 * No transaction in this module stays open across network I/O. These are short
 * row locks on a table with four kinds of row in it.
 *
 * ## Pause and latch are not the same column
 *
 * `paused_at` is a person deciding; `latched_at` is a threshold tripping.
 * Resuming one never clears the other, so an operator who pauses for an hour
 * and resumes does not silently clear an emergency stop that landed in between,
 * and an emergency stop does not erase their reason.
 */

export const GLOBAL_SCOPE_KEY = "global";

export type SafetyScopeKind = "global" | "provider" | "person" | "destination";

export interface SafetyScope {
  readonly id: string;
  readonly scopeKind: SafetyScopeKind;
  readonly scopeKey: string;
  readonly pausedAt: Date | null;
  readonly pausedByPersonId: string | null;
  readonly pausedReason: string | null;
  readonly latchedAt: Date | null;
  readonly latchReasonCode: SafetyReasonCode | null;
  readonly resumedAt: Date | null;
  readonly resumedByPersonId: string | null;
  readonly consecutiveFaults: number;
  readonly firstFaultAt: Date | null;
  readonly cooldownUntil: Date | null;
  readonly cooldownStage: number;
  readonly probeGeneration: number;
  readonly incidentAlertAt: Date | null;
  readonly capacityAlertAt: Date | null;
  readonly queueAlertAt: Date | null;
  readonly policyVersion: string | null;
  readonly version: number;
  readonly updatedAt: Date;
}

const SCOPE_COLUMNS = `
  id, scope_kind::text as scope_kind, scope_key,
  paused_at, paused_by_person_id, paused_reason,
  latched_at, latch_reason_code,
  resumed_at, resumed_by_person_id,
  consecutive_faults, first_fault_at, cooldown_until, cooldown_stage, probe_generation,
  incident_alert_at, capacity_alert_at, queue_alert_at,
  policy_version, version, updated_at`;

interface ScopeRow {
  id: string;
  scope_kind: SafetyScopeKind;
  scope_key: string;
  paused_at: Date | null;
  paused_by_person_id: string | null;
  paused_reason: string | null;
  latched_at: Date | null;
  latch_reason_code: SafetyReasonCode | null;
  resumed_at: Date | null;
  resumed_by_person_id: string | null;
  consecutive_faults: number;
  first_fault_at: Date | null;
  cooldown_until: Date | null;
  cooldown_stage: number;
  probe_generation: number;
  incident_alert_at: Date | null;
  capacity_alert_at: Date | null;
  queue_alert_at: Date | null;
  policy_version: string | null;
  version: number;
  updated_at: Date;
}

function toScope(row: ScopeRow): SafetyScope {
  return {
    id: row.id,
    scopeKind: row.scope_kind,
    scopeKey: row.scope_key,
    pausedAt: row.paused_at,
    pausedByPersonId: row.paused_by_person_id,
    pausedReason: row.paused_reason,
    latchedAt: row.latched_at,
    latchReasonCode: row.latch_reason_code,
    resumedAt: row.resumed_at,
    resumedByPersonId: row.resumed_by_person_id,
    consecutiveFaults: row.consecutive_faults,
    firstFaultAt: row.first_fault_at,
    cooldownUntil: row.cooldown_until,
    cooldownStage: row.cooldown_stage,
    probeGeneration: row.probe_generation,
    incidentAlertAt: row.incident_alert_at,
    capacityAlertAt: row.capacity_alert_at,
    queueAlertAt: row.queue_alert_at,
    policyVersion: row.policy_version,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

/** The database's own clock, read after any lock wait rather than before it. */
export async function safetyNowIn(tx: Tx): Promise<Date> {
  const result = await tx.query<{ now: Date }>("select clock_timestamp() as now");
  return result.rows[0].now;
}

export const SAFETY_STATE_MISSING_RULE = "messaging_safety_state_missing";

/**
 * Locks one scope, creating it on first sight.
 *
 * A person or destination scope legitimately does not exist until something
 * needs to record a hold against it, so it is inserted on demand.
 *
 * The global and provider rows are created by the migration, and are re-created
 * here if they are somehow absent. That is not a permissive default: the row
 * this writes is the row the migration wrote — not paused, not latched, at the
 * running code's own policy version — so a recreated row grants nothing a fresh
 * deployment would not have granted. What it avoids is a whole class of local
 * and showcase accidents: `truncate public.people … cascade` reaches this table
 * through its two actor columns, so every seed, reload and rollback would
 * otherwise leave the application unable to send anything until somebody
 * noticed why.
 *
 * The genuinely broken case — the table or the type missing, a database that
 * cannot be reached — is still a fault, and still stops the send: the query
 * throws, and the throw takes the claim transaction down with it.
 */
export async function lockScopeIn(
  tx: Tx,
  kind: SafetyScopeKind,
  key: string,
): Promise<SafetyScope | null> {
  const existing = await tx.query<ScopeRow>(
    `select ${SCOPE_COLUMNS}
       from public.messaging_safety_scopes
      where scope_kind = $1::public.messaging_safety_scope_kind and scope_key = $2
      for update`,
    [kind, key],
  );
  if (existing.rows[0]) return toScope(existing.rows[0]);

  await tx.query(
    `insert into public.messaging_safety_scopes (scope_kind, scope_key, policy_version)
     values ($1::public.messaging_safety_scope_kind, $2, $3)
     on conflict (scope_kind, scope_key) do nothing`,
    [kind, key, kind === "global" ? POLICY_VERSION : null],
  );

  const created = await tx.query<ScopeRow>(
    `select ${SCOPE_COLUMNS}
       from public.messaging_safety_scopes
      where scope_kind = $1::public.messaging_safety_scope_kind and scope_key = $2
      for update`,
    [kind, key],
  );
  return created.rows[0] ? toScope(created.rows[0]) : null;
}

/** Reads one scope without locking it. For the page, never for a decision. */
export async function readScopeIn(
  tx: Tx,
  kind: SafetyScopeKind,
  key: string,
): Promise<SafetyScope | null> {
  const result = await tx.query<ScopeRow>(
    `select ${SCOPE_COLUMNS}
       from public.messaging_safety_scopes
      where scope_kind = $1::public.messaging_safety_scope_kind and scope_key = $2`,
    [kind, key],
  );
  return result.rows[0] ? toScope(result.rows[0]) : null;
}

/** Every scope currently holding something back, for the page's list. */
export async function readActiveScopesIn(tx: Tx): Promise<readonly SafetyScope[]> {
  const result = await tx.query<ScopeRow>(
    `select ${SCOPE_COLUMNS}
       from public.messaging_safety_scopes
      where paused_at is not null
         or latched_at is not null
         or (cooldown_until is not null and cooldown_until > now())
      order by scope_kind, updated_at desc`,
  );
  return result.rows.map(toScope);
}

/** Does the running code's policy agree with what the database was set up for? */
export function policyMatches(global: SafetyScope): boolean {
  return global.policyVersion === POLICY_VERSION;
}

/**
 * Latches a scope. Called from inside an admission that has just decided this
 * threshold is reached, in that same transaction — never thrown, because a
 * throw would roll the latch back and let the next attempt through.
 */
export async function latchScopeIn(
  tx: Tx,
  scopeId: string,
  reasonCode: SafetyReasonCode,
): Promise<void> {
  await tx.query(
    `update public.messaging_safety_scopes
        set latched_at = coalesce(latched_at, now()),
            latch_reason_code = coalesce(latch_reason_code, $2),
            version = version + 1,
            updated_at = now()
      where id = $1`,
    [scopeId, reasonCode],
  );
}

// ---------------------------------------------------------------------------
// The two operator controls
// ---------------------------------------------------------------------------

export const SAFETY_STALE_VERSION_RULE = "messaging_safety_stale_version";
export const SAFETY_STALE_VERSION_MESSAGE =
  "The messaging safety state changed after this page was loaded, so nothing was done. " +
  "Reload and look at it again.";

export const SAFETY_ALREADY_PAUSED_MESSAGE = "Messaging is already paused.";
export const SAFETY_NOT_PAUSED_MESSAGE = "Messaging is not paused.";

/** Which scope a control is acting on. The browser supplies these, so both are checked. */
export interface ScopeTarget {
  readonly scopeId: string;
  readonly version: number;
}

async function lockScopeByIdIn(tx: Tx, target: ScopeTarget): Promise<SafetyScope> {
  const result = await tx.query<ScopeRow>(
    `select ${SCOPE_COLUMNS} from public.messaging_safety_scopes where id = $1 for update`,
    [target.scopeId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated("That messaging safety scope no longer exists.", {
      rule: SAFETY_STATE_MISSING_RULE,
    });
  }
  if (row.version !== target.version) {
    throw new InvalidTransition(SAFETY_STALE_VERSION_MESSAGE, { rule: SAFETY_STALE_VERSION_RULE });
  }
  return toScope(row);
}

/**
 * Pauses application messaging globally.
 *
 * The capability is re-checked here as well as in the action. An action is a
 * POST endpoint and a service function is callable from anywhere in the server;
 * the rule in `docs/architecture.md` is that every entry point guards, and this
 * is an entry point.
 *
 * A reason is required, and it is stored and audited but never logged to the
 * monitoring route: an operator's free text is the one field most likely to
 * name a person.
 */
export async function pauseMessagingIn(
  tx: Tx,
  target: ScopeTarget,
  reason: string,
): Promise<SafetyScope> {
  const operator = await requireCapability("messaging_safety_authority");

  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new ConstraintViolated("Say why messaging is being paused.", {
      rule: "messaging_safety_pause_needs_a_reason",
    });
  }

  const scope = await lockScopeByIdIn(tx, target);
  if (scope.pausedAt) {
    throw new InvalidTransition(SAFETY_ALREADY_PAUSED_MESSAGE, {
      rule: "messaging_safety_already_paused",
    });
  }

  const updated = await tx.query<ScopeRow>(
    `update public.messaging_safety_scopes
        set paused_at = now(),
            paused_by_person_id = $2,
            paused_reason = $3,
            version = version + 1,
            updated_at = now()
      where id = $1
      returning ${SCOPE_COLUMNS}`,
    [scope.id, operator.personId, trimmed],
  );

  await recordAudit(tx, {
    actorPersonId: operator.personId,
    action: "messaging_safety.paused",
    entityTable: "messaging_safety_scopes",
    entityId: scope.id,
    reason: trimmed,
    context: { scopeKind: scope.scopeKind, scopeKey: scope.scopeKey },
  });

  return toScope(updated.rows[0]);
}

/**
 * Resumes a paused or latched scope.
 *
 * Resume clears the latch and the pause on **this** scope and nothing else: a
 * person hold resumed does not lift the global stop, and the global stop
 * resumed does not lift a person hold. It deletes no usage — every admitted
 * attempt still counts inside its window — so a scope resumed while its rolling
 * allowance is still spent simply defers again, with the next eligible time
 * shown. That is deliberate: there is no "clear counters" and no "send all
 * now".
 */
export async function resumeMessagingIn(
  tx: Tx,
  target: ScopeTarget,
  reason: string,
): Promise<SafetyScope> {
  const operator = await requireCapability("messaging_safety_authority");

  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new ConstraintViolated("Say why messaging is being resumed.", {
      rule: "messaging_safety_resume_needs_a_reason",
    });
  }

  const scope = await lockScopeByIdIn(tx, target);
  if (!scope.pausedAt && !scope.latchedAt) {
    throw new InvalidTransition(SAFETY_NOT_PAUSED_MESSAGE, {
      rule: "messaging_safety_not_paused",
    });
  }

  const wasLatched = scope.latchedAt !== null;

  const updated = await tx.query<ScopeRow>(
    `update public.messaging_safety_scopes
        set paused_at = null,
            paused_by_person_id = null,
            paused_reason = null,
            latched_at = null,
            latch_reason_code = null,
            incident_alert_at = null,
            resumed_at = now(),
            resumed_by_person_id = $2,
            resume_reason = $3,
            version = version + 1,
            updated_at = now()
      where id = $1
      returning ${SCOPE_COLUMNS}`,
    [scope.id, operator.personId, trimmed],
  );

  // Every job this scope was holding becomes eligible again at the next
  // admission — which re-checks everything from the beginning, including the
  // pacing allowance this resume did not refund.
  await tx.query(
    `update public.notification_jobs
        set safety_retry_at = null, safety_block_scope_id = null, safety_reason_code = null,
            updated_at = now()
      where safety_block_scope_id = $1`,
    [scope.id],
  );

  await recordAudit(tx, {
    actorPersonId: operator.personId,
    action: "messaging_safety.resumed",
    entityTable: "messaging_safety_scopes",
    entityId: scope.id,
    reason: trimmed,
    context: {
      scopeKind: scope.scopeKind,
      scopeKey: scope.scopeKey,
      clearedLatch: wasLatched,
    },
  });

  return toScope(updated.rows[0]);
}

// ---------------------------------------------------------------------------
// The alert lifecycle
// ---------------------------------------------------------------------------

/** Has this incident been reported inside the last hour? */
function reportedRecently(at: Date | null, now: Date): boolean {
  return at !== null && now.getTime() - at.getTime() < 60 * 60 * 1000;
}

/** One incident-open line, and the durable note that it was sent. */
export async function openIncidentIn(
  tx: Tx,
  scope: SafetyScope,
  kind: SafetyIncidentKind,
  reasonCode: SafetyReasonCode,
  counts: Readonly<Record<string, number>>,
): Promise<void> {
  await tx.query(
    "update public.messaging_safety_scopes set incident_alert_at = now() where id = $1",
    [scope.id],
  );
  emitSafetyEvent({
    kind,
    phase: "open",
    scope: scope.scopeKind === "provider" ? "provider" : "global",
    ...(scope.scopeKind === "provider"
      ? { provider: scope.scopeKey === "email" ? ("email" as const) : ("whatsapp" as const) }
      : {}),
    reasonCode,
    counts,
  });
}

export interface SweepSafetyCounts {
  /** Admitted attempts inside the rolling emergency window. */
  readonly admittedInDay: number;
  /** Admitted attempts inside the rolling pacing window. */
  readonly admittedInPacingWindow: number;
  /** Jobs whose moment has arrived and that have not been sent. */
  readonly dueWaiting: number;
  /** The age in minutes of the oldest such job, or 0. */
  readonly oldestDueMinutes: number;
}

/**
 * Re-reports what is still open, and reports what has recovered.
 *
 * Called once per sweep, after the tick's own work. This is what makes a pause
 * that committed and then lost its process still reach somebody: the latch is
 * durable, so the next tick sees it open and says so.
 */
export async function reconcileSafetyAlertsIn(tx: Tx, counts: SweepSafetyCounts): Promise<void> {
  const now = await safetyNowIn(tx);

  const global = await readScopeIn(tx, "global", GLOBAL_SCOPE_KEY);
  if (!global) return;

  // --- the global emergency stop -----------------------------------------
  const stopped = global.latchedAt !== null && global.latchReasonCode === "global_emergency_stop";
  if (stopped && !reportedRecently(global.incidentAlertAt, now)) {
    await tx.query(
      "update public.messaging_safety_scopes set incident_alert_at = now() where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "global_emergency_stop",
      phase: global.incidentAlertAt === null ? "open" : "still_open",
      scope: "global",
      reasonCode: "global_emergency_stop",
      counts: { admittedInDay: counts.admittedInDay, allowance: GLOBAL_EMERGENCY_LIMIT },
    });
  }
  if (!stopped && global.incidentAlertAt !== null) {
    await tx.query(
      "update public.messaging_safety_scopes set incident_alert_at = null where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "global_emergency_stop",
      phase: "recovered",
      scope: "global",
      reasonCode: "global_emergency_stop",
      counts: { admittedInDay: counts.admittedInDay, allowance: GLOBAL_EMERGENCY_LIMIT },
    });
  }

  // --- the capacity warning ----------------------------------------------
  const nearCapacity = counts.admittedInDay >= CAPACITY_WARNING_THRESHOLD;
  if (nearCapacity && !reportedRecently(global.capacityAlertAt, now)) {
    await tx.query(
      "update public.messaging_safety_scopes set capacity_alert_at = now() where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "capacity_warning",
      phase: global.capacityAlertAt === null ? "open" : "still_open",
      scope: "global",
      reasonCode: "global_emergency_stop",
      counts: {
        admittedInDay: counts.admittedInDay,
        warningAt: CAPACITY_WARNING_THRESHOLD,
        allowance: GLOBAL_EMERGENCY_LIMIT,
        windowHours: GLOBAL_EMERGENCY_WINDOW_HOURS,
      },
    });
  }
  if (!nearCapacity && global.capacityAlertAt !== null) {
    await tx.query(
      "update public.messaging_safety_scopes set capacity_alert_at = null where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "capacity_warning",
      phase: "recovered",
      scope: "global",
      reasonCode: "global_emergency_stop",
      counts: { admittedInDay: counts.admittedInDay, warningAt: CAPACITY_WARNING_THRESHOLD },
    });
  }

  // --- the queue warning --------------------------------------------------
  const queueBacked = counts.oldestDueMinutes > QUEUE_WARNING_MINUTES;
  if (queueBacked && !reportedRecently(global.queueAlertAt, now)) {
    await tx.query(
      "update public.messaging_safety_scopes set queue_alert_at = now() where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "queue_warning",
      phase: global.queueAlertAt === null ? "open" : "still_open",
      scope: "global",
      reasonCode: "shared_pacing",
      counts: {
        dueWaiting: counts.dueWaiting,
        oldestDueMinutes: counts.oldestDueMinutes,
        warningAtMinutes: QUEUE_WARNING_MINUTES,
        pacingAllowance: SHARED_PACING_LIMIT,
        pacingWindowMinutes: SHARED_PACING_WINDOW_MINUTES,
      },
    });
  }
  if (!queueBacked && global.queueAlertAt !== null) {
    await tx.query(
      "update public.messaging_safety_scopes set queue_alert_at = null where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "queue_warning",
      phase: "recovered",
      scope: "global",
      reasonCode: "shared_pacing",
      counts: { dueWaiting: counts.dueWaiting, oldestDueMinutes: counts.oldestDueMinutes },
    });
  }

  // --- each provider's circuit -------------------------------------------
  for (const key of ["whatsapp", "email"] as const) {
    const provider = await readScopeIn(tx, "provider", key);
    if (!provider) continue;
    const coolingDown = provider.cooldownUntil !== null && provider.cooldownUntil > now;

    if (coolingDown && !reportedRecently(provider.incidentAlertAt, now)) {
      await tx.query(
        "update public.messaging_safety_scopes set incident_alert_at = now() where id = $1",
        [provider.id],
      );
      emitSafetyEvent({
        kind: "provider_cooldown",
        phase: provider.incidentAlertAt === null ? "open" : "still_open",
        scope: "provider",
        provider: key,
        reasonCode: "provider_cooldown",
        counts: {
          consecutiveFaults: provider.consecutiveFaults,
          cooldownStage: provider.cooldownStage,
        },
      });
    }
    if (!coolingDown && provider.incidentAlertAt !== null) {
      await tx.query(
        "update public.messaging_safety_scopes set incident_alert_at = null where id = $1",
        [provider.id],
      );
      emitSafetyEvent({
        kind: "provider_cooldown",
        phase: "recovered",
        scope: "provider",
        provider: key,
        reasonCode: "provider_cooldown",
        counts: { cooldownStage: provider.cooldownStage },
      });
    }
  }
}
