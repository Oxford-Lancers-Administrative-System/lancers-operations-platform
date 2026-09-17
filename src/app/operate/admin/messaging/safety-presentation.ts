import type {
  MessagingSafetyState,
  SafetyHoldRow,
  SafetyReasonCode,
} from "@/lib/services/messaging-safety";

/**
 * The Messaging safety section's own words — LAN-394.
 *
 * Labels, values and states. The one sentence of prose in the whole section is
 * {@link SAFETY_NORMAL_SENTENCE}, which is the sentence the approved design
 * quotes and the only explanation the application frame carries; everything
 * else an operator needs to understand about the thresholds is outside the
 * frame, in `docs/operating-the-slice.md`.
 */

export const SAFETY_SECTION_HEADING = "Messaging safety";

/** The five states, in the order the UX contract lists them. */
export const SAFETY_STATE_LABELS: Readonly<Record<MessagingSafetyState, string>> = Object.freeze({
  sending_normally: "Sending normally",
  messages_waiting: "Messages waiting",
  paused: "Paused",
  provider_unavailable: "Provider temporarily unavailable",
  unavailable: "Safety status unavailable",
});

/**
 * The one sentence. It is here because a person about to stop every message the
 * club sends is owed the three facts that decide whether they should: what
 * stops, what does not, and what may still arrive.
 */
export const SAFETY_NORMAL_SENTENCE =
  "Pausing stops new application WhatsApp and email sends. Signups and replies continue to be " +
  "saved. Messages already in progress may still arrive.";

export const PAUSE_LABEL = "PAUSE MESSAGING";
export const RESUME_LABEL = "RESUME MESSAGING";
export const RESUME_SCOPE_LABEL = "RESUME";
export const PAUSE_REASON_LABEL = "Why is messaging being paused?";
export const RESUME_REASON_LABEL = "Why is messaging being resumed?";
export const REASON_REQUIRED = "Say why, then press the button again.";

/**
 * What an operator reads for each safe reason code — labels and states, never
 * an explanation (`docs/ux/standards.md`; no narrative text in the application
 * frame).
 *
 * Here rather than beside the codes themselves, and that is not tidiness: the
 * section is a client component, and every runtime value it imports from
 * `@/lib/services/messaging-safety` would drag the server barrel — and with it
 * `pg` and `next/headers` — into the browser bundle. The barrel is
 * `server-only`; this file is words.
 */
export const SAFETY_REASON_LABELS: Readonly<Record<SafetyReasonCode, string>> = Object.freeze({
  paused_by_operator: "Messaging paused",
  global_emergency_stop: "Emergency stop",
  shared_pacing: "Waiting for the sending allowance",
  person_pacing: "Waiting — one message per person at a time",
  destination_pacing: "Waiting — one message per number at a time",
  person_hold: "Held — this person's limit reached",
  destination_hold: "Held — this number's limit reached",
  provider_cooldown: "Provider temporarily unavailable",
  safety_unavailable: "Safety status unavailable",
});

export const THRESHOLDS_SUMMARY = "Limits and current use";
export const HOLDS_HEADING = "Active holds";
export const AUDIT_HEADING = "Recent changes";
export const NO_HOLDS = "None";
export const NO_AUDIT = "None recorded";

/** The paused-state notice at the top of the page, which links to the section. */
export const PAUSED_BANNER = "Messaging is paused.";
export const PAUSED_BANNER_LINK = "Messaging safety";

export const SHARED_DESTINATION_LABEL = "Shared by more than one person";

export function pausedNotice(): string {
  return "Messaging is paused.";
}

export function resumedNotice(): string {
  return "Messaging is resumed.";
}

export function queueLabel(dueWaiting: number, oldestDueMinutes: number): string {
  if (dueWaiting === 0) return "None";
  const age =
    oldestDueMinutes >= 60
      ? `${Math.floor(oldestDueMinutes / 60)} h ${oldestDueMinutes % 60} min`
      : `${oldestDueMinutes} min`;
  return `${dueWaiting} — oldest ${age}`;
}

/** What one hold is on. Never a destination fingerprint; see `status.ts`. */
export function holdLabel(hold: SafetyHoldRow): string {
  if (hold.kind === "destination" && hold.people.length > 0) {
    return hold.people.map((person) => person.name).join(", ");
  }
  return hold.label;
}

export const SAFETY_ACTION_FAILED =
  "That could not be done, and nothing changed. Reload and look at the state again.";
