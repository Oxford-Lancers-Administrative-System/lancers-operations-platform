/**
 * Safe reason codes. LAN-394.
 *
 * A code, never a sentence and never free text. Three readers depend on that:
 * the count-only monitoring log, which must carry nothing about a person; the
 * page, which renders the club's own words from a fixed map rather than
 * whatever a database row happens to hold; and the job row, whose
 * `safety_reason_code` is compared rather than displayed.
 *
 * `last_error` is not one of those readers. It means "what the provider said
 * about a delivery that was attempted", and a message that is waiting was never
 * attempted.
 */

export type SafetyReasonCode =
  /** A person paused this scope. */
  | "paused_by_operator"
  /** The global emergency ceiling tripped. Durable until somebody resumes it. */
  | "global_emergency_stop"
  /** Too many attempts, application-wide, in the last five minutes. */
  | "shared_pacing"
  /** This person has had one in the last five minutes. */
  | "person_pacing"
  /** This destination has had one in the last five minutes. */
  | "destination_pacing"
  /** This person's daily or weekly ceiling tripped; held until resumed. */
  | "person_hold"
  /** This destination's daily or weekly ceiling tripped; held until resumed. */
  | "destination_hold"
  /** The provider is cooling down after a run of provider-side faults. */
  | "provider_cooldown"
  /** Safety state could not be read, so nothing is sent. Never "sending normally". */
  | "safety_unavailable";

export const SAFETY_REASON_CODES: readonly SafetyReasonCode[] = Object.freeze([
  "paused_by_operator",
  "global_emergency_stop",
  "shared_pacing",
  "person_pacing",
  "destination_pacing",
  "person_hold",
  "destination_hold",
  "provider_cooldown",
  "safety_unavailable",
]);

/**
 * What an operator reads for each code — labels and states, never an
 * explanation (`docs/ux/standards.md`; no narrative text in the application
 * frame).
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

/**
 * The two sentences a queued message shows. One is a pause and the other is an
 * allowance, and telling them apart is the difference between "somebody
 * stopped this" and "this is its turn shortly".
 */
export const WAITING_PAUSED_LABEL = "Queued — messaging paused";
export const WAITING_ALLOWANCE_LABEL = "Queued — waiting for the sending allowance";

export function waitingLabelFor(code: SafetyReasonCode): string {
  return code === "paused_by_operator" ||
    code === "global_emergency_stop" ||
    code === "person_hold" ||
    code === "destination_hold" ||
    code === "provider_cooldown"
    ? WAITING_PAUSED_LABEL
    : WAITING_ALLOWANCE_LABEL;
}
