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

/**
 * The two sentences a queued message shows. One is a pause and the other is an
 * allowance, and telling them apart is the difference between "somebody
 * stopped this" and "this is its turn shortly".
 */
const WAITING_PAUSED_LABEL = "Queued — messaging paused";
export const WAITING_ALLOWANCE_LABEL = "Queued — waiting for the sending allowance";
/** LAN-433. Held overnight by lights-out, not by the safety guard. */
export const WAITING_LIGHTS_OUT_LABEL = "Queued — sends at 07:00";

export function waitingLabelFor(code: SafetyReasonCode): string {
  return code === "paused_by_operator" ||
    code === "global_emergency_stop" ||
    code === "person_hold" ||
    code === "destination_hold" ||
    code === "provider_cooldown"
    ? WAITING_PAUSED_LABEL
    : WAITING_ALLOWANCE_LABEL;
}
