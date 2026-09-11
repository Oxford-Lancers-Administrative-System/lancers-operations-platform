import type { DeliveryState } from "@/lib/services/delivery";

// The words UX-50, UX-51, UX-52 use, in one place — `docs/ux/slice-ux.md` §
// 6 fixes the vocabulary; "Delivered never means responded." Decision
// history: relocations.md.

/** § 6's five, plus Held (LAN-156, not a provider outcome) and Cancelled (LAN-156, R156-B2). */
const DELIVERY_STATE_LABELS: Readonly<Record<DeliveryState, string>> = Object.freeze({
  queued: "Queued",
  attempted: "Attempted",
  delivered: "Delivered",
  failed: "Failed",
  retryable: "Retryable",
  held: "Held",
  cancelled: "Cancelled",
});

/** W6's two named exceptions to the plain five-state vocabulary — `REQ-no-channel-backstop`, `REQ-whatsapp-outage-visible`. */
const NOT_DISPATCHED_NO_CHANNEL = "Not dispatched — no channel";
const WHATSAPP_UNRESPONSIVE = "WhatsApp unresponsive";

export const NEEDS_ATTENTION_HEADING = "Needs attention";
export const NEEDS_ATTENTION_NOTE =
  "The system retries and falls back to email on its own. Only a missing route needs a person.";
export const OPEN_THEIR_RECORD = "Open their record";
export const NO_ACTION_NEEDED = "No action needed";

export interface DeliveryExceptionFacts {
  readonly state: DeliveryState;
  readonly noUsableRoute: boolean;
  readonly whatsappUnresponsive: boolean;
}

export function deliveryRowLabel(row: DeliveryExceptionFacts): string {
  if (row.noUsableRoute) return NOT_DISPATCHED_NO_CHANNEL;
  if (row.whatsappUnresponsive) return WHATSAPP_UNRESPONSIVE;
  return DELIVERY_STATE_LABELS[row.state];
}

export const TOKEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  live: "Live",
  revoked: "Revoked",
  none: "Not yet issued",
});

export const VIEW_DIAGNOSTICS = "View diagnostics";

export const OVERVIEW_FACTS: readonly { label: string; value: string; note: string }[] =
  Object.freeze([
    Object.freeze({
      label: "Channel",
      value: "Official WhatsApp Business Platform",
      note: "1:1 per invitation",
    }),
    Object.freeze({
      label: "Destination",
      value: "Secure signed RSVP page",
      note: "One live token",
    }),
    Object.freeze({
      label: "Fallback",
      value: "Automated email / calendar",
      note: "According to policy",
    }),
    Object.freeze({
      label: "Audit",
      value: "Provider IDs and delivery evidence",
      note: "Webhooks deduplicated",
    }),
  ]);

export const DIAGNOSTICS_HEADING = "Delivery diagnostics";

export const SEARCH_LABEL = "Search invitees";

/** `held`/`cancelled` are not offered — nothing an operator does differently for either from this screen. */
const FILTERABLE_STATES: readonly DeliveryState[] = Object.freeze([
  "queued",
  "attempted",
  "delivered",
  "failed",
  "retryable",
]);

export const STATUS_FILTERS: readonly { value: string; label: string }[] = Object.freeze([
  Object.freeze({ value: "", label: "All" }),
  Object.freeze({ value: "attention", label: "Needs attention" }),
  ...FILTERABLE_STATES.map((state) =>
    Object.freeze({ value: state, label: DELIVERY_STATE_LABELS[state] }),
  ),
]);

/** "Needs attention" is failed or retryable — the two an operator can act on. */
export function matchesStatusFilter(state: DeliveryState, filter: string): boolean {
  if (filter === "") return true;
  if (filter === "attention") return state === "failed" || state === "retryable";
  return state === filter;
}

/** `OWNER-LAN173-02`: filters an attempt's own recorded outcome, not a `DeliveryState` — an attempt has no queued/retryable of its own. */
export function matchesAttemptStatusFilter(outcome: string, filter: string): boolean {
  if (filter === "") return true;
  if (filter === "attention" || filter === "failed")
    return outcome === "failed" || outcome === "rejected";
  if (filter === "delivered") return outcome === "delivered";
  if (filter === "attempted") return outcome === "attempted" || outcome === "sent";
  return false;
}

export const REPAIR_HEADING = "Repair delivery";

export const RETRY_DELIVERY = "Retry delivery";
export const REVOKE_AND_REISSUE = "Revoke and reissue link";

/** "Safe" — everything reaching this line has been through the adapter's mapping and digit redaction. */
export const SAFE_REASON_PREFIX = "Safe provider reason";

/** UX-52's Fallback card — kept with the approved copy so `tests/no-manual-delivery.test.ts` can scan one file for the ban. */
export const FALLBACK_VALUE = "Automated email / calendar";
export const FALLBACK_NOTE = "No manual send action";

const NO_ATTEMPT_YET = "Not attempted yet";

/** Result and Retry are separate axes — describes retryability without contradicting the result beside it. */
export function describeRetryability(
  state: DeliveryState,
  attempts: number,
  max: number,
  retryable: boolean,
): string {
  if (state === "delivered") return "Delivered — nothing to repair";
  if (state === "attempted") return "Waiting for the provider to confirm delivery";
  if (state === "queued") return "Waiting to be sent";
  // LAN-156, R156-B3: says only what is true today — nothing here clears held_at.
  if (state === "held") return "Held since this event was changed.";
  if (state === "cancelled") return "Cancelled with the event. Nothing further will be sent.";
  if (!retryable) {
    return `${countAttempts(attempts)} used, and no further automatic attempt. Somebody has to fix the cause first.`;
  }
  return `${countAttempts(attempts)} of ${max} used`;
}

function countAttempts(attempts: number): string {
  return attempts === 1 ? "1 attempt" : `${attempts} attempts`;
}

export function formatAttemptTime(at: Date | null): string {
  if (!at) return NO_ATTEMPT_YET;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  })
    .format(at)
    .replace(" at ", ", ");
}
