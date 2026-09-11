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

/** Everything `/operate/roster/[membershipId]`'s Send onboarding questionnaire control needs — LAN-266. Deliberately assembled from the queue's own readers and nothing else, so {@link lastContact} and {@link next} can never disagree with the queue. */
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
  /** Most recent queued ask, or `null` if none. `reason`: a named refusal, never "could not be completed" (requirement 3). */
  readonly lastAsk: {
    readonly requestedAt: Date;
    readonly delivery: OnboardingAskDelivery;
    readonly reason: string | null;
  } | null;
  /** Named reason this send is withheld, or `null` if it may be pressed — `isNudgeable`'s own two refusals, in words (requirement 5). */
  readonly withheldReason: string | null;
}

/** `isNudgeable`'s two absolute refusals, in the words the queue already shows for each. */
const NO_PHONE_NUMBER_ON_FILE = "No phone number on file";
const UNDER_18 = "Unmessageable · under 18";
const NOT_ONBOARDING = "This membership is not onboarding, so there is nothing to chase.";

/** The most recent ask queued for this membership and what became of it (LAN-266). Reads the job table, not `onboarding_activity_log`; reads both the latest `delivery_results` row and `notification_jobs.status`/`last_error`, since a pre-attempt dispatcher refusal writes no result row (requirement 3). */
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

/** The record's own composite read — one membership, everything its send control shows. */
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
    // Absent candidate = past onboarding or never in it; the record still shows what was sent.
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
