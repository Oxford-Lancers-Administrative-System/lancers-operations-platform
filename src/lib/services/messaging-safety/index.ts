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
 */

export {
  admitSendIn,
  readWaitingIn,
  recordWaitingIn,
  SAFETY_MINIMUM_WAIT_MINUTES,
  type Admission,
  type AdmissionDeferred,
  type AdmissionGranted,
  type AdmissionRequest,
  type SafetyWaiting,
} from "./admission";

export { destinationKey, DESTINATION_KEY_VERSION } from "./keys";

export {
  cloudRunMonitor,
  emitSafetyEvent,
  emitSafetyHeartbeat,
  SAFETY_ADMIN_PATH,
  SAFETY_HEARTBEAT_EVENT,
  SAFETY_LOG_EVENT,
  setSafetyMonitor,
  type SafetyEvent,
  type SafetyIncidentKind,
  type SafetyIncidentPhase,
  type SafetyMonitor,
} from "./monitor";

export * from "./policy";

export {
  SAFETY_REASON_CODES,
  SAFETY_REASON_LABELS,
  waitingLabelFor,
  WAITING_ALLOWANCE_LABEL,
  WAITING_PAUSED_LABEL,
  type SafetyReasonCode,
} from "./reasons";

export {
  GLOBAL_SCOPE_KEY,
  lockScopeIn,
  pauseMessagingIn,
  readActiveScopesIn,
  readScopeIn,
  reconcileSafetyAlertsIn,
  resumeMessagingIn,
  safetyNowIn,
  SAFETY_ALREADY_PAUSED_MESSAGE,
  SAFETY_NOT_PAUSED_MESSAGE,
  SAFETY_STALE_VERSION_MESSAGE,
  SAFETY_STALE_VERSION_RULE,
  SAFETY_STATE_MISSING_RULE,
  type SafetyScope,
  type SafetyScopeKind,
  type ScopeTarget,
  type SweepSafetyCounts,
} from "./scopes";

export { recordProviderOutcomeIn } from "./settlement";

export {
  clearExpiredSafetyFieldsIn,
  readMessagingSafetyStatus,
  safetyThresholds,
  type MessagingSafetyState,
  type MessagingSafetyStatus,
  type SafetyAuditRow,
  type SafetyHoldRow,
  type SafetyThresholdRow,
} from "./status";
