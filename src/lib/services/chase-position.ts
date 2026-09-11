// Chase position — W4, W5. Pure, shared by the participation table and the Follow-ups queue.

export interface ChaseJobFact {
  readonly jobType: "invitation" | "reminder" | "escalation";
  readonly channel: string;
  readonly ladderRung: number | null; // 0 is the invitation; null for a job the ladder does not number
  readonly status: string;
  readonly scheduledFor: Date | null; // when next due, for a job still waiting to go
}

export interface ChaseInput {
  readonly responseState: string; // invitation_response_state.response_state, or the equivalent
  readonly isWalkUp: boolean; // never invited, so nothing here to chase
  readonly escalated: boolean; // an unresolved nonresponse_flags row exists for this invitation
  readonly escalationJobStatus: string | null; // F-B1: the President's own escalation job status — see relocations.md
  readonly jobs: readonly ChaseJobFact[]; // every invitation/reminder job this invitation has, any status
}

export const CHASE_STOPPED = "Chase stopped";
export const ESCALATED_TO_PRESIDENT = "Escalated to the President";
// F-B1: escalation exists but has not (or never will) reach the President.
export const ESCALATION_NOT_DELIVERED = "Escalation not delivered";

const ESCALATION_SENT_STATUSES: ReadonlySet<string> = new Set(["completed", "processing"]);

const ANSWERED_STATES: ReadonlySet<string> = new Set(["responded_yes", "responded_no"]);

// The rung's name (W5-01). Q-19: invitation is WhatsApp #1, so the first reminder is "WhatsApp 2".
function rungName(job: ChaseJobFact, atSentenceStart: boolean): string {
  if (job.jobType === "invitation") return "Invitation";
  if (job.channel === "whatsapp") return `WhatsApp ${(job.ladderRung ?? 0) + 1}`;
  const word = job.jobType === "escalation" ? "escalation" : "email";
  return atSentenceStart ? word[0].toUpperCase() + word.slice(1) : word;
}

export function formatChaseDue(at: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/London",
  }).format(at);
}

// The rung already sent and the next one due, in one sentence — or null (W4's exceptions table).
export function chasePositionLabel(input: ChaseInput): string | null {
  if (input.isWalkUp) return null;

  if (ANSWERED_STATES.has(input.responseState)) {
    // OWNER-LAN173-04 (see relocations.md)
    const aReminderActuallyWentOut = input.jobs.some(
      (job) => job.jobType !== "invitation" && job.status === "completed",
    );
    return aReminderActuallyWentOut ? CHASE_STOPPED : null;
  }

  // REQ-chase-position, F-B1 (see relocations.md)
  if (input.escalated) {
    return input.escalationJobStatus !== null &&
      ESCALATION_SENT_STATUSES.has(input.escalationJobStatus)
      ? ESCALATED_TO_PRESIDENT
      : ESCALATION_NOT_DELIVERED;
  }

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
