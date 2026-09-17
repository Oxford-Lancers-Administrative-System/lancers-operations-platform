/**
 * The thresholds, as decided. LAN-394.
 *
 * Every number in this file is Brian's, 17 September 2026, and none of them is
 * configurable at runtime. They are constants in code rather than rows in a
 * table for one reason: a limit stored as data is a limit somebody can move
 * without a decision, and the whole point of this feature is that the club's
 * outbound volume has a ceiling nobody reaches by accident. The Messaging
 * safety section shows them read-only, from here.
 *
 * `POLICY_VERSION` is written on the global scope row by the migration and
 * re-checked at every admission. Two revisions of the application serving at
 * once with different numbers in this file would each enforce their own
 * ceiling, which is not a ceiling; a mismatch refuses to send instead.
 *
 * ## No "off until turned on"
 *
 * Brian, 17 September 2026: this ships enabled with these values from the first
 * deploy. There is no disabled state, no environment variable, and no override.
 */

/** The decision every constant here carries. */
export const POLICY_DECISION = "Brian, 17 September 2026";

/**
 * The revision these numbers are. Recorded on the global scope row; an
 * admission whose stored version disagrees refuses rather than guesses.
 */
export const POLICY_VERSION = "lan-394-v1";

// ---------------------------------------------------------------------------
// Shared pacing — every application send, together
// ---------------------------------------------------------------------------

/**
 * How many attempts may be admitted across all application WhatsApp and email
 * in any rolling five minutes. Extra jobs wait; recovery is automatic and needs
 * nobody.
 *
 * Fifty and five minutes are deliberately the scheduler's own batch and tick,
 * so an ordinary healthy sweep is never slowed by this. What it stops is a
 * second sweep, an approval and an operator's retry all running at once and
 * multiplying that throughput.
 */
export const SHARED_PACING_LIMIT = 50;
export const SHARED_PACING_WINDOW_MINUTES = 5;

// ---------------------------------------------------------------------------
// Per-recipient pacing
// ---------------------------------------------------------------------------

/**
 * At most one admission per rolling five minutes for the same person, and
 * independently for the same destination. A recovered backlog therefore reaches
 * one person once per five minutes instead of all at once.
 */
export const RECIPIENT_PACING_LIMIT = 1;
export const RECIPIENT_PACING_WINDOW_MINUTES = 5;

// ---------------------------------------------------------------------------
// Per-recipient holds
// ---------------------------------------------------------------------------

/**
 * The point at which one person, or one destination, stops receiving anything
 * until somebody looks. Ten in a day or thirty in a week is far beyond any
 * approved ladder, so reaching either means something is wrong rather than
 * busy.
 *
 * A hold latches on that person or that number **only** — never globally — and
 * is cleared by an operator resume from the Messaging safety section. Brian
 * accepted, 17 September 2026, that two people genuinely sharing one number may
 * therefore need a manual resume.
 */
export const RECIPIENT_DAILY_LIMIT = 10;
export const RECIPIENT_DAILY_WINDOW_HOURS = 24;
export const RECIPIENT_WEEKLY_LIMIT = 30;
export const RECIPIENT_WEEKLY_WINDOW_DAYS = 7;

// ---------------------------------------------------------------------------
// The global emergency stop
// ---------------------------------------------------------------------------

/**
 * The whole application's ceiling: three thousand admitted attempts in any
 * rolling twenty-four hours latches a durable global pause.
 *
 * Durable is the operative word. It does not reset at midnight, it does not
 * reset on a restart, and it does not lift when the rolling window ages out —
 * a daily allowance that re-enables itself is a recurring spend authorisation,
 * not a brake. Only an operator resume clears it.
 */
export const GLOBAL_EMERGENCY_LIMIT = 3_000;
export const GLOBAL_EMERGENCY_WINDOW_HOURS = 24;

/**
 * Eighty per cent of the global allowance: a warning and an alert, and nothing
 * stops. It exists so the first anybody hears of a busy day is not the club's
 * messaging stopping.
 */
export const CAPACITY_WARNING_FRACTION = 0.8;
export const CAPACITY_WARNING_THRESHOLD = Math.floor(
  GLOBAL_EMERGENCY_LIMIT * CAPACITY_WARNING_FRACTION,
);

// ---------------------------------------------------------------------------
// Provider cooldown
// ---------------------------------------------------------------------------

/**
 * Five consecutive provider-side faults inside five minutes cools that provider
 * down. WhatsApp and email are independent: one being unreachable never stops
 * the other.
 *
 * "Provider-side" is a classification the adapter makes, not a sentence this
 * module parses. A bad number, a rejected template and a per-recipient rate
 * limit are recipient- or message-scoped and never count towards this streak
 * (Brian, 17 September 2026) — otherwise one unroutable number could pause a
 * healthy provider for the whole club.
 */
export const PROVIDER_FAULT_STREAK = 5;
export const PROVIDER_FAULT_WINDOW_MINUTES = 5;

/**
 * Five minutes, then one probe; a failed probe backs off to ten, twenty, thirty
 * and stays at thirty. Indexed by stage rather than computed, for
 * `BACKOFF_MINUTES`' own reason: an exponent is a number somebody tunes without
 * noticing where the last step moved to.
 */
export const PROVIDER_COOLDOWN_MINUTES: readonly number[] = Object.freeze([5, 10, 20, 30]);

/** The cooldown length for a stage, with the last entry repeating for ever. */
export function cooldownMinutesForStage(stage: number): number {
  const index = Math.max(0, Math.min(stage - 1, PROVIDER_COOLDOWN_MINUTES.length - 1));
  return PROVIDER_COOLDOWN_MINUTES[index];
}

// ---------------------------------------------------------------------------
// Queue warning
// ---------------------------------------------------------------------------

/**
 * When the oldest due job has been waiting more than an hour, warn and alert.
 * Nothing stops: a backlog is a thing to look at, not a reason to send less.
 */
export const QUEUE_WARNING_MINUTES = 60;

// ---------------------------------------------------------------------------
// Retention of the identifying counting fields
// ---------------------------------------------------------------------------

/**
 * Eight days, then the person id and destination fingerprint on an admitted
 * attempt are cleared together by the existing scheduler sweep (Brian, 17
 * September 2026). Eight rather than seven so the longest counting window — the
 * rolling week — always has a full set of rows behind it with a day to spare.
 *
 * Delivery history itself is untouched. The attempt row, its outcome, its
 * provider reference and its failure reason all remain; only the two fields
 * that identify a recipient are cleared, and `safety_admitted_at` stays so the
 * global accounting remains conservative.
 */
export const SAFETY_FIELD_RETENTION_DAYS = 8;

/**
 * The alert threshold for an attempt whose provider outcome was never recorded.
 * A diagnostic, deliberately: it is not a lease, not an expiry, and never a
 * reason to send anything a second time.
 */
export const UNRESOLVED_ATTEMPT_MINUTES = 10;
