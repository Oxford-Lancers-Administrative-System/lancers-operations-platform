import "server-only";

/**
 * The independent alert route. LAN-394.
 *
 * ## Why it is a log line and not a message
 *
 * Everything else the club sends goes through the queue this feature exists to
 * stop. An alert that told somebody the messaging had paused, by message, would
 * be the one thing the pause guaranteed nobody received. So the route out is
 * the one thing Cloud Run cannot pause: structured JSON on stdout, which Cloud
 * Logging ingests and a log-based alert policy watches. No second mail sender,
 * no webhook, no credential.
 *
 * ## What may be in one
 *
 * A scope category, a safe reason code, aggregate counts, and the address of
 * the page that shows the detail. Nothing else, ever: no phone number, no email
 * address, no name, no person id, no destination fingerprint, no token URL, no
 * message body, and no operator's typed reason. Alerts leave the application's
 * authorization boundary and land in an inbox, and an inbox is not a place the
 * club's personal data goes. The page is behind the login; the alert is a
 * pointer to it.
 *
 * `emitSafetyEvent` is therefore deliberately narrow: it takes a fixed shape,
 * not a payload. There is no `detail` field to widen later by accident, and
 * `tests/messaging-safety-alerts.test.ts` asserts on the exact key set.
 *
 * ## Why delivery is not guaranteed and that is fine
 *
 * A log line can be lost, an alert policy can be misconfigured, and a
 * notification channel can bounce. The durable status is the Messaging safety
 * section, which reads the database. This route exists so that somebody is
 * *told*, not so that being told is the mechanism anything depends on — and an
 * alert that fails must never fail the write that caused it, which is why every
 * caller emits after its transaction has committed and why this function cannot
 * throw.
 */

/** Which of the four things is being reported. */
export type SafetyIncidentKind =
  "global_emergency_stop" | "capacity_warning" | "queue_warning" | "provider_cooldown";

/** Where an incident is in its life. */
export type SafetyIncidentPhase = "open" | "still_open" | "recovered";

/** The scope category — a category, never a key, and never a person. */
export type SafetyScopeCategory = "global" | "provider";

export interface SafetyEvent {
  readonly kind: SafetyIncidentKind;
  readonly phase: SafetyIncidentPhase;
  readonly scope: SafetyScopeCategory;
  /**
   * Which provider, for a provider-scoped incident. `whatsapp` or `email` —
   * the transport's own name, which identifies nobody.
   */
  readonly provider?: "whatsapp" | "email";
  /** A code from the fixed list in `reasons.ts`. */
  readonly reasonCode: string;
  /** Aggregate counts only. Whole numbers about volume, never about people. */
  readonly counts: Readonly<Record<string, number>>;
}

/** Where the operator goes. A path, not a link with anything in it. */
export const SAFETY_ADMIN_PATH = "/operate/admin/messaging";

/**
 * The name every LAN-394 log line carries, and the one thing a Cloud Monitoring
 * log-based alert filters on. Changing it breaks the owner's configured alert,
 * so it is a constant with a test on it rather than a string at the call site.
 */
export const SAFETY_LOG_EVENT = "messaging_safety_incident";

/**
 * The heartbeat the sweep writes every tick, whatever it did.
 *
 * Scheduler silence is the failure this exists for: a stopped scheduler sends
 * nothing, holds nothing back, and produces no incident at all, so a route that
 * only reported incidents would report perfect health. An alert on the
 * *absence* of this line for longer than a few ticks is what notices.
 */
export const SAFETY_HEARTBEAT_EVENT = "messaging_safety_heartbeat";

/**
 * How an event reaches the outside world. Injected so a test can assert on the
 * exact records emitted without reading process stdout, and so no test ever
 * depends on console formatting.
 */
export type SafetyMonitor = (record: Readonly<Record<string, unknown>>) => void;

/**
 * The real one: a single line of JSON per event, which is what Cloud Logging
 * parses into a structured entry. `console.log` rather than a logging library,
 * because Cloud Run's contract is stdout and a library is one more thing that
 * can fail closed on the path whose whole job is to be reachable when the rest
 * is not.
 */
export const cloudRunMonitor: SafetyMonitor = (record) => {
  // stdout, deliberately: that is Cloud Run's own logging contract, and the one
  // route out of this process that a paused message queue cannot affect.
  console.log(JSON.stringify(record));
};

let monitor: SafetyMonitor = cloudRunMonitor;

/** Replaces the monitor. Returns the previous one so a test can restore it. */
export function setSafetyMonitor(next: SafetyMonitor): SafetyMonitor {
  const previous = monitor;
  monitor = next;
  return previous;
}

/**
 * Emits one incident event. Never throws: an alert that failed must not unwind
 * the pause that caused it.
 */
export function emitSafetyEvent(event: SafetyEvent): void {
  try {
    monitor({
      event: SAFETY_LOG_EVENT,
      severity: event.phase === "recovered" ? "NOTICE" : "WARNING",
      kind: event.kind,
      phase: event.phase,
      scope: event.scope,
      ...(event.provider ? { provider: event.provider } : {}),
      reasonCode: event.reasonCode,
      counts: event.counts,
      page: SAFETY_ADMIN_PATH,
    });
  } catch {
    // See the module note: the durable status is the page, not this line.
  }
}

/**
 * Emits one sweep heartbeat. Counts only, and it is written on every tick —
 * including a tick that dispatched nothing — because the point is the line's
 * existence rather than its numbers.
 */
export function emitSafetyHeartbeat(counts: Readonly<Record<string, number>>): void {
  try {
    monitor({
      event: SAFETY_HEARTBEAT_EVENT,
      severity: "INFO",
      counts,
      page: SAFETY_ADMIN_PATH,
    });
  } catch {
    // See above.
  }
}
