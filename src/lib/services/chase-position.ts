/**
 * Chase position — W4, W5. One reading of `notification_jobs`, shared by the
 * per-event participation table (W4) and the cross-event Follow-ups queue
 * (W5), so the two screens cannot describe one person's chase differently
 * (`docs/ux/standards.md` rule 7).
 *
 * ## What this is not
 *
 * It writes nothing and decides nothing. W7 owns the offsets that decide when
 * a rung is due, W5 owns raising the escalation flag, W6 owns what a failed
 * delivery means. This module only turns the rows those write into the one
 * sentence an operator reads: the rung already sent, and the next one due.
 *
 * ## Why this is pure
 *
 * Every fact it needs — the response state, the escalation flag, and the
 * jobs themselves — is cheap to read once per invitation and expensive to get
 * wrong twice. A pure function taking plain data is what lets both call sites
 * share one definition and one test file, rather than one query each quietly
 * drifting from the other.
 */

export interface ChaseJobFact {
  readonly jobType: "invitation" | "reminder" | "escalation";
  readonly channel: string;
  /** 0 is the invitation. `null` for a job the ladder does not number. */
  readonly ladderRung: number | null;
  readonly status: string;
  /** When this job is next due, for a job still waiting to go. */
  readonly scheduledFor: Date | null;
}

export interface ChaseInput {
  /** `invitation_response_state.response_state`, or the equivalent. */
  readonly responseState: string;
  /** A walk-up was never invited, so there is nothing here to chase. */
  readonly isWalkUp: boolean;
  /** An unresolved `nonresponse_flags` row exists for this invitation. */
  readonly escalated: boolean;
  /** Every invitation/reminder/escalation job this invitation has, any status. */
  readonly jobs: readonly ChaseJobFact[];
}

export const CHASE_STOPPED = "Chase stopped";
export const ESCALATED_TO_PRESIDENT = "Escalated to the President";

const ANSWERED_STATES: ReadonlySet<string> = new Set(["responded_yes", "responded_no"]);

/**
 * The rung's name, as the mockup writes it — W5-01. Q-19: the invitation is
 * WhatsApp #1, so the first WhatsApp *reminder* is "WhatsApp 2", counting the
 * invitation itself rather than starting the reminders back at one. `email`
 * carries no number: `messaging_schedules.email_reminder_count` never exceeds
 * one rung in the approved ladder (`OWN-default-sequence-v2`), so there is
 * never a second one to distinguish it from.
 *
 * `atSentenceStart` decides the case: **Invitation** delivered, but "…· email
 * Fri 09:00" — a proper noun (WhatsApp) is capitalised either way.
 */
function rungName(job: ChaseJobFact, atSentenceStart: boolean): string {
  if (job.jobType === "invitation") return "Invitation";
  if (job.channel === "whatsapp") return `WhatsApp ${(job.ladderRung ?? 0) + 1}`;
  const word = job.jobType === "escalation" ? "escalation" : "email";
  return atSentenceStart ? word[0].toUpperCase() + word.slice(1) : word;
}

/** "Thu 18:00" — the mockup's own format for a chase rung's due time. */
export function formatChaseDue(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(at);
}

/**
 * The rung already sent and the next one due, in one sentence — or `null`
 * where W4's own exceptions table says there is nothing to show.
 */
export function chasePositionLabel(input: ChaseInput): string | null {
  if (input.isWalkUp) return null;

  if (ANSWERED_STATES.has(input.responseState)) {
    // OWNER-LAN173-04. "Chase stopped" only tells an operator something they
    // did not already know from the Answer column two cells away when a
    // reminder actually went out before the answer arrived — the person was
    // chased despite answering. Narrowed from "any non-invitation job that
    // was cancelled or completed": on an ordinary event everybody answers,
    // every one of their still-pending rungs is cancelled in the same
    // transaction (W3), and that cancellation alone used to read "Chase
    // stopped" on every single row — true of every answered person and
    // therefore informative about none of them. A reminder that was only
    // cancelled, never sent, is the ladder being stood down before it ever
    // reached them, which is not a chase to report as stopped.
    const aReminderActuallyWentOut = input.jobs.some(
      (job) => job.jobType !== "invitation" && job.status === "completed",
    );
    return aReminderActuallyWentOut ? CHASE_STOPPED : null;
  }

  // REQ-chase-position's acceptance: an escalated person shows no further
  // player-facing rung, whatever the reminder ladder is separately doing.
  if (input.escalated) return ESCALATED_TO_PRESIDENT;

  const ladder = input.jobs
    .filter((job) => job.jobType !== "escalation")
    .slice()
    .sort((a, b) => (a.ladderRung ?? 0) - (b.ladderRung ?? 0));

  const sent = [...ladder]
    .reverse()
    .find((job) => job.status === "completed" || job.status === "processing");
  const due = ladder.find((job) => job.status === "pending" || job.status === "ready");

  const sentPhrase = sent
    ? `${rungName(sent, true)} ${sent.jobType === "invitation" ? "delivered" : "sent"}`
    : null;
  const duePhrase =
    due && due.scheduledFor
      ? `${rungName(due, sentPhrase === null)} ${formatChaseDue(due.scheduledFor)}`
      : null;

  if (sentPhrase && duePhrase) return `${sentPhrase} · ${duePhrase}`;
  return sentPhrase ?? duePhrase;
}
