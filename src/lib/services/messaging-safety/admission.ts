import "server-only";

import type { Tx } from "@/lib/db";
import { destinationKey } from "./keys";
import { emitSafetyEvent } from "./monitor";
import {
  CAPACITY_WARNING_THRESHOLD,
  cooldownMinutesForStage,
  GLOBAL_EMERGENCY_LIMIT,
  GLOBAL_EMERGENCY_WINDOW_HOURS,
  RECIPIENT_DAILY_LIMIT,
  RECIPIENT_DAILY_WINDOW_HOURS,
  RECIPIENT_PACING_LIMIT,
  RECIPIENT_PACING_WINDOW_MINUTES,
  RECIPIENT_WEEKLY_LIMIT,
  RECIPIENT_WEEKLY_WINDOW_DAYS,
  SHARED_PACING_LIMIT,
  SHARED_PACING_WINDOW_MINUTES,
} from "./policy";
import type { SafetyReasonCode } from "./reasons";
import {
  GLOBAL_SCOPE_KEY,
  latchScopeIn,
  lockOrCreateScopeIn,
  lockScopeIn,
  openIncidentIn,
  policyMatches,
  safetyNowIn,
  type SafetyScope,
} from "./scopes";

/**
 * The one admission boundary. LAN-394.
 *
 * ## Where this runs
 *
 * Inside the job-claim transaction of each of the seven dispatchers, after
 * eligibility and after the destination has actually been chosen, and **before**
 * the claim increments the attempt, mints a token or writes an attempt row.
 * That ordering is the whole design: a message the guard defers has had nothing
 * done to it at all, so it consumes no retry, invalidates no link, triggers no
 * fallback, and never becomes a failure.
 *
 * There is no second ledger, no receipt, no permit and no lease. A committed
 * claim is the in-flight boundary: a pause landing after it may find a message
 * already on its way to the provider, and nothing in software can recall that.
 * What a pause does guarantee is that no *later* claim passes it, which is a
 * promise the shared row lock actually keeps.
 *
 * ## What is counted
 *
 * Admitted attempts — potential provider requests — not delivered messages. A
 * committed admission counts even when its outcome is never learned, because
 * the club may have been charged for it and the recipient may have received it.
 * Deliberately conservative in the one direction that matters.
 *
 * ## Two independent ways of counting one recipient
 *
 * By person and by destination, both enforced. Person counting catches somebody
 * getting WhatsApp *and* email; destination counting catches two duplicate
 * person records sharing one number. Brian accepted the consequence on 17
 * September 2026: two people genuinely sharing a number may need a manual
 * resume.
 */

interface AdmissionRequest {
  readonly jobId: string;
  /** The person this message is addressed to, where the job carries one. */
  readonly personId: string | null;
  readonly channel: "whatsapp" | "email";
  /** The destination actually selected for this send. Never stored raw here. */
  readonly recipient: string;
}

export interface AdmissionGranted {
  readonly admitted: true;
  /** The database instant this admission happened. Written onto the attempt. */
  readonly admittedAt: Date;
  readonly personId: string | null;
  readonly destinationKey: string;
  /**
   * The provider circuit's generation at the moment this send was admitted.
   * Carried through to settlement so an outcome that arrives after a newer
   * incident has opened cannot close it.
   */
  readonly probeGeneration: number;
}

export interface AdmissionDeferred {
  readonly admitted: false;
  readonly reasonCode: SafetyReasonCode;
  /** When it is worth asking again, where that is knowable. */
  readonly nextEligibleAt: Date | null;
  readonly scopeId: string | null;
  readonly scopeKind: "global" | "provider" | "person" | "destination" | null;
}

type Admission = AdmissionGranted | AdmissionDeferred;

/** How the two windows are expressed to PostgreSQL, once. */
const MINUTES = (n: number) => `${n} minutes`;
const HOURS = (n: number) => `${n} hours`;
const DAYS = (n: number) => `${n} days`;

async function countAdmitted(
  tx: Tx,
  now: Date,
  interval: string,
  column: "safety_person_id" | "safety_destination_key" | null,
  value: string | null,
): Promise<{ count: number; oldest: Date | null }> {
  const filter = column ? `and ${column} = $3` : "";
  const result = await tx.query<{ count: string; oldest: Date | null }>(
    `select count(*)::text as count, min(safety_admitted_at) as oldest
       from public.delivery_attempts
      where safety_admitted_at is not null
        and safety_admitted_at > $1::timestamptz - $2::interval
        ${filter}`,
    column ? [now, interval, value] : [now, interval],
  );
  return { count: Number(result.rows[0].count), oldest: result.rows[0].oldest };
}

function plus(from: Date, minutes: number): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

function deferred(
  reasonCode: SafetyReasonCode,
  nextEligibleAt: Date | null,
  scope: SafetyScope | null,
): AdmissionDeferred {
  return {
    admitted: false,
    reasonCode,
    nextEligibleAt,
    scopeId: scope?.id ?? null,
    scopeKind: scope?.scopeKind ?? null,
  };
}

/**
 * Decides whether one send may happen now, and records anything that tripped.
 *
 * Never throws for a refusal: a deferral is a normal outcome the caller has to
 * handle, and a throw would roll back the very latch this may have just
 * committed. It throws only for a real database fault, which takes the whole
 * claim down as it should.
 */
export async function admitSendIn(tx: Tx, request: AdmissionRequest): Promise<Admission> {
  // 1. The global row, first and always. Every admission, every settlement and
  //    every operator control takes this lock before any other, which is what
  //    makes the order total.
  const global = await lockOrCreateScopeIn(tx, "global", GLOBAL_SCOPE_KEY);
  if (!global || !policyMatches(global)) {
    // No safety state, or state set up for a different revision of the policy.
    // Neither is a reason to send: "Safety status unavailable" is the honest
    // answer, and it stops sending rather than defaulting to permissive.
    return deferred("safety_unavailable", null, global);
  }

  // 2. The clock, read *after* the lock wait rather than at transaction start.
  //    A transaction that waited four seconds for the global row would
  //    otherwise evaluate its rolling windows against the moment it began.
  const now = await safetyNowIn(tx);

  if (global.pausedAt) return deferred("paused_by_operator", null, global);
  if (global.latchedAt) {
    return deferred(global.latchReasonCode ?? "global_emergency_stop", null, global);
  }

  // 3. The provider circuit. WhatsApp and email are independent scopes, so one
  //    being unreachable never stops the other.
  const provider = await lockOrCreateScopeIn(tx, "provider", request.channel);
  if (!provider) return deferred("safety_unavailable", null, global);
  if (provider.pausedAt) return deferred("paused_by_operator", null, provider);

  const coolingDown = provider.cooldownUntil !== null && provider.cooldownUntil > now;
  if (coolingDown) {
    return deferred("provider_cooldown", provider.cooldownUntil, provider);
  }
  // The half-open state: the cooldown has elapsed and the circuit is still
  // open, so this one send is the probe. The probe slot is spent below, only
  // once every other check has passed — otherwise a pacing deferral would
  // silently consume the club's single attempt to find out whether the
  // provider is well again.
  const isProbe = provider.cooldownStage > 0 && provider.cooldownUntil !== null;

  // 4. The recipient's two scopes, in the fixed order — read, never created.
  //
  //    A person or a destination that has never been held has no row here, and
  //    an absent row is read as "no hold". Ordinary sending therefore leaves no
  //    trace in this table at all: the only rows in it are holds, and the
  //    retention sweep takes them away again once they hold nothing. The
  //    exclusion two concurrent claimers need is the global row above, which
  //    this transaction is still holding.
  const key = destinationKey(request.channel, request.recipient);
  const personScope = request.personId ? await lockScopeIn(tx, "person", request.personId) : null;
  if (personScope?.latchedAt) return deferred("person_hold", null, personScope);
  if (personScope?.pausedAt) return deferred("paused_by_operator", null, personScope);

  const destinationScope = await lockScopeIn(tx, "destination", key);
  if (destinationScope?.latchedAt) return deferred("destination_hold", null, destinationScope);
  if (destinationScope?.pausedAt) return deferred("paused_by_operator", null, destinationScope);

  // 5. The rolling windows. Every one of these is a count over
  //    `delivery_attempts` — the rows that already record that the club asked a
  //    provider to send something — and never a cached counter.

  // The shared allowance across every application send.
  const shared = await countAdmitted(tx, now, MINUTES(SHARED_PACING_WINDOW_MINUTES), null, null);
  if (shared.count >= SHARED_PACING_LIMIT) {
    const next = shared.oldest
      ? plus(shared.oldest, SHARED_PACING_WINDOW_MINUTES)
      : plus(now, SHARED_PACING_WINDOW_MINUTES);
    return deferred("shared_pacing", next, global);
  }

  // The global emergency ceiling. Reaching it latches, durably; the latch is
  // committed with the deferral rather than thrown away by it.
  const day = await countAdmitted(tx, now, HOURS(GLOBAL_EMERGENCY_WINDOW_HOURS), null, null);
  if (day.count >= GLOBAL_EMERGENCY_LIMIT) {
    await latchScopeIn(tx, global.id, "global_emergency_stop");
    if (global.incidentAlertAt === null) {
      await openIncidentIn(tx, global, "global_emergency_stop", "global_emergency_stop", {
        admittedInDay: day.count,
        allowance: GLOBAL_EMERGENCY_LIMIT,
      });
    }
    return deferred("global_emergency_stop", null, global);
  }

  // Per-person and per-destination pacing.
  if (request.personId) {
    const paced = await countAdmitted(
      tx,
      now,
      MINUTES(RECIPIENT_PACING_WINDOW_MINUTES),
      "safety_person_id",
      request.personId,
    );
    if (paced.count >= RECIPIENT_PACING_LIMIT) {
      const next = paced.oldest
        ? plus(paced.oldest, RECIPIENT_PACING_WINDOW_MINUTES)
        : plus(now, RECIPIENT_PACING_WINDOW_MINUTES);
      return deferred("person_pacing", next, personScope);
    }
  }

  const pacedDestination = await countAdmitted(
    tx,
    now,
    MINUTES(RECIPIENT_PACING_WINDOW_MINUTES),
    "safety_destination_key",
    key,
  );
  if (pacedDestination.count >= RECIPIENT_PACING_LIMIT) {
    const next = pacedDestination.oldest
      ? plus(pacedDestination.oldest, RECIPIENT_PACING_WINDOW_MINUTES)
      : plus(now, RECIPIENT_PACING_WINDOW_MINUTES);
    return deferred("destination_pacing", next, destinationScope);
  }

  // Per-person and per-destination ceilings. These latch a hold on that one
  // recipient, never anything wider.
  let personDay = 0;
  let personWeek = 0;
  if (request.personId) {
    personDay = (
      await countAdmitted(
        tx,
        now,
        HOURS(RECIPIENT_DAILY_WINDOW_HOURS),
        "safety_person_id",
        request.personId,
      )
    ).count;
    personWeek = (
      await countAdmitted(
        tx,
        now,
        DAYS(RECIPIENT_WEEKLY_WINDOW_DAYS),
        "safety_person_id",
        request.personId,
      )
    ).count;
    if (personDay >= RECIPIENT_DAILY_LIMIT || personWeek >= RECIPIENT_WEEKLY_LIMIT) {
      // The hold is recorded now, which is the moment this person's scope row
      // is allowed to exist at all.
      const scope = personScope ?? (await lockOrCreateScopeIn(tx, "person", request.personId));
      if (scope) await latchScopeIn(tx, scope.id, "person_hold");
      return deferred("person_hold", null, scope);
    }
  }

  const destinationDay = (
    await countAdmitted(tx, now, HOURS(RECIPIENT_DAILY_WINDOW_HOURS), "safety_destination_key", key)
  ).count;
  const destinationWeek = (
    await countAdmitted(tx, now, DAYS(RECIPIENT_WEEKLY_WINDOW_DAYS), "safety_destination_key", key)
  ).count;
  if (destinationDay >= RECIPIENT_DAILY_LIMIT || destinationWeek >= RECIPIENT_WEEKLY_LIMIT) {
    const scope = destinationScope ?? (await lockOrCreateScopeIn(tx, "destination", key));
    if (scope) await latchScopeIn(tx, scope.id, "destination_hold");
    return deferred("destination_hold", null, scope);
  }

  // 6. Admitted. Everything below commits with the caller's claim, or with
  //    nothing at all.

  // The last permitted admission trips the latch for the next one, in this same
  // transaction. Doing it here rather than on the following attempt is what
  // makes the ceiling exact: the three-thousandth send happens, and the
  // three-thousand-and-first never gets as far as being counted.
  if (day.count + 1 >= GLOBAL_EMERGENCY_LIMIT) {
    await latchScopeIn(tx, global.id, "global_emergency_stop");
    await openIncidentIn(tx, global, "global_emergency_stop", "global_emergency_stop", {
      admittedInDay: day.count + 1,
      allowance: GLOBAL_EMERGENCY_LIMIT,
    });
  } else if (day.count + 1 >= CAPACITY_WARNING_THRESHOLD && global.capacityAlertAt === null) {
    // Eighty per cent: a warning and an alert, and nothing stops.
    await tx.query(
      "update public.messaging_safety_scopes set capacity_alert_at = now() where id = $1",
      [global.id],
    );
    emitSafetyEvent({
      kind: "capacity_warning",
      phase: "open",
      scope: "global",
      reasonCode: "global_emergency_stop",
      counts: {
        admittedInDay: day.count + 1,
        warningAt: CAPACITY_WARNING_THRESHOLD,
        allowance: GLOBAL_EMERGENCY_LIMIT,
      },
    });
  }

  if (
    request.personId &&
    (personDay + 1 >= RECIPIENT_DAILY_LIMIT || personWeek + 1 >= RECIPIENT_WEEKLY_LIMIT)
  ) {
    const scope = personScope ?? (await lockOrCreateScopeIn(tx, "person", request.personId));
    if (scope) await latchScopeIn(tx, scope.id, "person_hold");
  }
  if (
    destinationDay + 1 >= RECIPIENT_DAILY_LIMIT ||
    destinationWeek + 1 >= RECIPIENT_WEEKLY_LIMIT
  ) {
    const scope = destinationScope ?? (await lockOrCreateScopeIn(tx, "destination", key));
    if (scope) await latchScopeIn(tx, scope.id, "destination_hold");
  }

  if (isProbe) {
    // One probe per cooldown, and the next cooldown is armed before it is made.
    // If the probe succeeds, `recordProviderOutcomeIn` clears all of this; if
    // it fails, the longer cooldown is already in place and no second probe can
    // slip through in between.
    const nextStage = provider.cooldownStage + 1;
    await tx.query(
      `update public.messaging_safety_scopes
          set cooldown_stage = $2,
              cooldown_until = $3::timestamptz,
              probe_generation = probe_generation + 1,
              version = version + 1,
              updated_at = now()
        where id = $1`,
      [provider.id, nextStage, plus(now, cooldownMinutesForStage(nextStage))],
    );
  }

  // The job is no longer waiting on anything.
  await tx.query(
    `update public.notification_jobs
        set safety_retry_at = null, safety_block_scope_id = null, safety_reason_code = null
      where id = $1`,
    [request.jobId],
  );

  return {
    admitted: true,
    admittedAt: now,
    personId: request.personId,
    destinationKey: key,
    probeGeneration: provider.probeGeneration + (isProbe ? 1 : 0),
  };
}

/**
 * Records that a job is waiting, and why.
 *
 * Written on the job row, in three columns that exist only for this: never
 * `scheduled_for` (when the club meant to send), never `next_attempt_at` (a
 * delivery backoff), never `last_error` (what a provider said) and never
 * `held_at` (an event amendment). Nothing about the job's own status, attempt
 * count or tokens changes.
 *
 * The not-before is at least the next regular sweep, so a candidate that has
 * just been deferred does not dominate the next tick ahead of work that has
 * never been looked at.
 */
const SAFETY_MINIMUM_WAIT_MINUTES = 5;

export async function recordWaitingIn(
  tx: Tx,
  jobId: string,
  outcome: AdmissionDeferred,
  now: Date,
): Promise<void> {
  const floor = plus(now, SAFETY_MINIMUM_WAIT_MINUTES);
  const retryAt =
    outcome.nextEligibleAt && outcome.nextEligibleAt > floor ? outcome.nextEligibleAt : floor;

  await tx.query(
    `update public.notification_jobs
        set safety_retry_at = $2::timestamptz,
            safety_block_scope_id = $3::uuid,
            safety_reason_code = $4,
            updated_at = now()
      where id = $1`,
    [jobId, retryAt, outcome.scopeId, outcome.reasonCode],
  );
}

/** The waiting state one job is in, for a caller that has to show it. */
interface SafetyWaiting {
  readonly jobId: string;
  readonly reasonCode: SafetyReasonCode;
  readonly nextEligibleAt: Date | null;
  readonly scopeKind: string | null;
}

export async function readWaitingIn(tx: Tx, jobId: string): Promise<SafetyWaiting | null> {
  const result = await tx.query<{
    safety_reason_code: SafetyReasonCode | null;
    safety_retry_at: Date | null;
    scope_kind: string | null;
  }>(
    `select j.safety_reason_code, j.safety_retry_at, s.scope_kind::text as scope_kind
       from public.notification_jobs j
       left join public.messaging_safety_scopes s on s.id = j.safety_block_scope_id
      where j.id = $1`,
    [jobId],
  );
  const row = result.rows[0];
  if (!row?.safety_reason_code) return null;
  return {
    jobId,
    reasonCode: row.safety_reason_code,
    nextEligibleAt: row.safety_retry_at,
    scopeKind: row.scope_kind,
  };
}
