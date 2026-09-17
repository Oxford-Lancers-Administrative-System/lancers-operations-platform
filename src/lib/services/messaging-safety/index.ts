import "server-only";

/**
 * Messaging safety — LAN-394.
 *
 * One admission guard, inside the job-claim transaction every one of the club's
 * seven sending paths already runs. Nothing here decides *whether the club
 * meant* to send a message; that is the approved plan's business and it is
 * unchanged. This decides only whether it may be attempted right now, and the
 * answer is never worse than "later".
 *
 * The parts, in the order they matter:
 *
 *   * `policy.ts` — the thresholds, as named constants with the decision on
 *     them. Not configurable, shown read-only on the page.
 *   * `admission.ts` — the guard itself, and the waiting state a deferral
 *     writes on the job.
 *   * `scopes.ts` — the durable switches, the lock order, and the two operator
 *     controls.
 *   * `settlement.ts` — what a provider's answer does to its circuit.
 *   * `keys.ts` — how a destination is counted without storing it twice.
 *   * `monitor.ts` — the independent, count-only alert route.
 *   * `status.ts` — what the Messaging safety section reads.
 *
 * ## What this barrel re-exports, and what it deliberately does not
 *
 * Only the names something outside this directory actually uses. A barrel that
 * re-exports everything is a barrel that hides which of its parts are internal,
 * and the module's own seams — the lock helper, the reason-code table, the
 * fingerprint's version — are internal on purpose. `npm run knip` holds this to
 * it.
 */

export {
  admitSendIn,
  readWaitingIn,
  recordWaitingIn,
  type AdmissionDeferred,
  type AdmissionGranted,
} from "./admission";

export { destinationKey, destinationKeysForContactPoints } from "./keys";

export {
  emitSafetyHeartbeat,
  SAFETY_HEARTBEAT_EVENT,
  SAFETY_LOG_EVENT,
  setSafetyMonitor,
  type SafetyMonitor,
} from "./monitor";

export * from "./policy";

export { waitingLabelFor, WAITING_ALLOWANCE_LABEL, type SafetyReasonCode } from "./reasons";

export {
  GLOBAL_SCOPE_KEY,
  pauseMessagingIn,
  readScopeIn,
  reconcileSafetyAlertsIn,
  resumeMessagingIn,
} from "./scopes";

export { recordProviderOutcomeIn } from "./settlement";

export {
  clearExpiredSafetyFieldsIn,
  clearExpiredSafetyScopesIn,
  readMessagingSafetyStatus,
  safetyThresholds,
  type MessagingSafetyState,
  type MessagingSafetyStatus,
  type SafetyHoldRow,
} from "./status";
