import "server-only";

import type { Tx } from "@/lib/db";
import { readOnboardingChaseSettingsIn } from "./settings";
import {
  describeOnboardingChaseNext,
  ONBOARDING_CHASE_KEY_PREFIX,
  ONBOARDING_NUDGE_KEY_PREFIX,
  readOnboardingChaseCandidatesForMembershipsIn,
  readOnboardingLastContactIn,
  type OnboardingChaseNext,
  type OnboardingLastContact,
} from "./chase-state";

/** One player's record — the manual ask and everything it needs to say. LAN-266. */

/** What became of the most recent ask the club actually queued for this player. */
type OnboardingAskDelivery = "queued" | "delivered" | "failed";

/**
 * Everything `/operate/roster/[membershipId]`'s **Send onboarding
 * questionnaire** control needs to render itself and its status line —
 * LAN-266.
 *
 * Deliberately assembled from the queue's own readers and nothing else.
 * Brian's requirement 6 is that "the queue's Nudge and this button write the
 * same job type and the same activity-log entry, so a nudge from either place
 * appears identically" — the corollary is that the two surfaces must *read*
 * identically too, or the record and the queue would eventually disagree
 * about a player they are both describing. So {@link lastContact} and
 * {@link next} are the queue's own two columns, from the queue's own
 * functions, and the record renders them through the queue's own wording
 * (`chase-presentation.ts`).
 */
export interface OnboardingSendStatus {
  /** `false` when this membership is not onboarding — the send has nothing to chase. */
  readonly onboarding: boolean;
  readonly lastContact: OnboardingLastContact | null;
  readonly next: OnboardingChaseNext;
  readonly hasReachableNumber: boolean;
  readonly isUnder18: boolean;
  /** Asks delivered so far, and the cap they are counted against — "Chase 2 of 4 sent". */
  readonly deliveredCount: number;
  readonly chaseCount: number;
  /**
   * The most recent queued ask and what became of it, or `null` when none was
   * ever queued. `reason` carries the stored, provider-neutral sentence for a
   * `failed` one — requirement 3's "a named refusal… not 'could not be
   * completed'" — and is `null` for every other state.
   */
  readonly lastAsk: {
    readonly requestedAt: Date;
    readonly delivery: OnboardingAskDelivery;
    readonly reason: string | null;
  } | null;
  /**
   * The named reason this send is withheld, or `null` when it may be pressed.
   * Requirement 5: the button "respects the same gates the queue's Nudge
   * respects… and is withheld with the reason shown when a gate fails, the
   * way the queue withholds and reads 'No phone number on file'" — so this is
   * `isNudgeable`'s own two absolute refusals, in words, rather than a second
   * refusal list that could drift from the queue's.
   */
  readonly withheldReason: string | null;
}

/** `isNudgeable`'s two absolute refusals, in the words the queue already shows for each. */
const NO_PHONE_NUMBER_ON_FILE = "No phone number on file";
const UNDER_18 = "Unmessageable · under 18";
const NOT_ONBOARDING = "This membership is not onboarding, so there is nothing to chase.";

/**
 * The most recent ask queued for this membership, of either kind, and what
 * became of it — LAN-266's "Sent 9 Sept 2026, 14:02 · delivered (or the
 * delivery state: queued, delivered, failed with the reason the delivery page
 * shows)".
 *
 * Reads the job table rather than `onboarding_activity_log`, because the log
 * records that an ask *happened* and this has to say what became of it. The
 * outcome is the latest attempt's own `delivery_results` row, on the identical
 * reasoning {@link readOnboardingChaseProgressIn} states for never reading
 * `notification_jobs.status` as a delivery truth — with two differences.
 *
 * A job with no attempt at all has not failed: it is queued, and says so. And
 * a job the dispatcher refused *before* it ever attempted — delivery not
 * configured on this deployment being the case an operator actually meets —
 * writes no `delivery_results` row at all, only `status = 'failed'` and its
 * reason in `last_error`. Reading the result row alone therefore reported that
 * refusal as "queued", which is the silent failure LAN-266 requirement 3
 * forbids. Both are read, and the reason comes back with the outcome: the same
 * stored, provider-neutral sentence `delivery.ts`'s own delivery page shows an
 * operator, on the same footing LAN-218's own C-5 correction put the queue's
 * `Delivery failed · <reason>` column.
 */
async function readLatestOnboardingAskIn(
  tx: Tx,
  membershipId: string,
): Promise<OnboardingSendStatus["lastAsk"]> {
  const result = await tx.query<{
    created_at: Date;
    status: string;
    last_error: string | null;
    outcome: string | null;
    detail: string | null;
  }>(
    `select j.created_at, j.status::text as status, j.last_error,
            latest.outcome, latest.detail
       from public.notification_jobs j
       left join lateral (
         select r.outcome::text as outcome, r.detail
           from public.delivery_results r
          where r.notification_job_id = j.id
          order by r.attempt_number desc
          limit 1
       ) latest on true
      where j.idempotency_key like $1 or j.idempotency_key like $2
      order by j.created_at desc
      limit 1`,
    [
      `${ONBOARDING_CHASE_KEY_PREFIX}${membershipId}:%`,
      `${ONBOARDING_NUDGE_KEY_PREFIX}${membershipId}:%`,
    ],
  );
  const row = result.rows[0];
  if (!row) return null;

  if (row.outcome === "delivered") {
    return { requestedAt: row.created_at, delivery: "delivered", reason: null };
  }
  if (row.outcome !== null || row.status === "failed") {
    return {
      requestedAt: row.created_at,
      delivery: "failed",
      reason: row.detail ?? row.last_error ?? null,
    };
  }
  return { requestedAt: row.created_at, delivery: "queued", reason: null };
}

/**
 * The record's own composite read — one membership, everything its send
 * control shows. `null` for a membership that is not there at all.
 */
export async function readOnboardingSendStatusIn(
  tx: Tx,
  membershipId: string,
): Promise<OnboardingSendStatus> {
  const [settings, candidates, lastContact, lastAsk] = await Promise.all([
    readOnboardingChaseSettingsIn(tx),
    readOnboardingChaseCandidatesForMembershipsIn(tx, [membershipId]),
    readOnboardingLastContactIn(tx, membershipId),
    readLatestOnboardingAskIn(tx, membershipId),
  ]);

  const candidate = candidates.get(membershipId);
  if (!candidate) {
    // `readOnboardingChaseCandidatesForMembershipsIn` is scoped to memberships
    // that are still `onboarding`, so an absent candidate means this player is
    // past onboarding (or never in it). The record still shows what was sent —
    // that history does not stop being true — and withholds the send.
    return {
      onboarding: false,
      lastContact,
      next: { kind: "no_automated_chase" },
      hasReachableNumber: true,
      isUnder18: false,
      deliveredCount: 0,
      chaseCount: settings.chaseCount,
      lastAsk,
      withheldReason: NOT_ONBOARDING,
    };
  }

  const next = describeOnboardingChaseNext(candidate, settings);
  const withheldReason = candidate.isUnder18
    ? UNDER_18
    : !candidate.hasReachableNumber
      ? NO_PHONE_NUMBER_ON_FILE
      : null;

  return {
    onboarding: true,
    lastContact,
    next,
    hasReachableNumber: candidate.hasReachableNumber,
    isUnder18: candidate.isUnder18,
    deliveredCount: candidate.deliveredCount,
    chaseCount: settings.chaseCount,
    lastAsk,
    withheldReason,
  };
}
