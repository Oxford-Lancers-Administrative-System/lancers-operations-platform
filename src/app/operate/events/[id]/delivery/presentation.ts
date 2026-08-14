import type { DeliveryState } from "@/lib/services/delivery";

/**
 * The words UX-50, UX-51 and UX-52 use, in one place.
 *
 * `docs/ux/slice-ux.md` § 6 fixes the delivery vocabulary — **Queued**,
 * **Attempted**, **Delivered**, **Failed**, **Retryable** — and § 6 closes with
 * the sentence this whole screen exists to honour: "Delivered never means
 * responded." The RSVP column is therefore rendered from
 * `invitation_response_state` and never from a delivery state, and no label
 * below implies one from the other.
 *
 * Every string a wireframe shows verbatim is here rather than inline in the
 * page, so that a test can assert the approved label and a reviewer can read
 * the whole of the screen's copy without reading its layout.
 */

/** § 6's five, and nothing else. */
export const DELIVERY_STATE_LABELS: Readonly<Record<DeliveryState, string>> = Object.freeze({
  queued: "Queued",
  attempted: "Attempted",
  delivered: "Delivered",
  failed: "Failed",
  retryable: "Retryable",
});

/**
 * MUI severity per state, used for the chip colour.
 *
 * `attempted` is deliberately neutral rather than positive. It means "the
 * provider took it and we do not yet know", which was proven on 13 August 2026
 * to be a state a message can sit in while never arriving. Colouring it green
 * would say delivered.
 */
export const DELIVERY_STATE_COLOURS: Readonly<
  Record<DeliveryState, "default" | "info" | "success" | "warning" | "error">
> = Object.freeze({
  queued: "default",
  attempted: "info",
  delivered: "success",
  failed: "error",
  retryable: "warning",
});

/** The RSVP column. Response language from § 6, never delivery language. */
export const RESPONSE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  responded_yes: "Attending",
  responded_no: "Not attending",
  awaiting_response: "Outstanding",
  expired_without_response: "No response",
  cancelled: "Cancelled",
  not_solicited: "No response asked for",
});

export const TOKEN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  live: "Live",
  revoked: "Revoked",
  none: "Not yet issued",
});

// --- UX-50 -----------------------------------------------------------------

export const OVERVIEW_SUBTITLE = "Official 1:1 WhatsApp delivery";

/**
 * The sentence the wireframe puts at the top of every delivery screen, and the
 * one piece of copy on it that is a policy statement rather than a description.
 * Both halves are load-bearing: no manual path exists, and delivery is not RSVP.
 */
export const OVERVIEW_NOTE =
  "Operators never copy, send or post invitations manually. Delivery telemetry does not " +
  "imply an RSVP.";

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

// --- UX-51 -----------------------------------------------------------------

export const DIAGNOSTICS_HEADING = "Delivery diagnostics";

export const DIAGNOSTICS_NOTE =
  "Provider-neutral statuses are queued, attempted, delivered, failed and retryable. " +
  "RSVP remains independent.";

export const SEARCH_LABEL = "Search invitees";
export const OPEN_SELECTED_ISSUE = "Open selected issue";

/** The status filter's options. "Needs attention" is the wireframe's default. */
export const STATUS_FILTERS: readonly { value: string; label: string }[] = Object.freeze([
  Object.freeze({ value: "", label: "All" }),
  Object.freeze({ value: "attention", label: "Needs attention" }),
  Object.freeze({ value: "queued", label: "Queued" }),
  Object.freeze({ value: "attempted", label: "Attempted" }),
  Object.freeze({ value: "delivered", label: "Delivered" }),
  Object.freeze({ value: "failed", label: "Failed" }),
  Object.freeze({ value: "retryable", label: "Retryable" }),
]);

/** "Needs attention" is failed or retryable — the two an operator can act on. */
export function matchesStatusFilter(state: DeliveryState, filter: string): boolean {
  if (filter === "") return true;
  if (filter === "attention") return state === "failed" || state === "retryable";
  return state === filter;
}

// --- UX-52 -----------------------------------------------------------------

export const REPAIR_HEADING = "Repair delivery";

export const REPAIR_NOTE =
  "Retry and token repair are auditable system actions. There is no copy-link, send-message " +
  "or post-to-group control.";

export const RETRY_DELIVERY = "Retry delivery";
export const REVOKE_AND_REISSUE = "Revoke and reissue link";

/**
 * What an operator is shown where the wireframe shows a provider reason.
 *
 * The wireframe's example is "Safe provider reason: recipient unavailable", and
 * the word doing the work is *safe*. Everything reaching this line has already
 * been through the adapter's mapping and digit redaction, so it can name a
 * cause without quoting the provider's body or anybody's phone number.
 */
export const SAFE_REASON_PREFIX = "Safe provider reason";

/**
 * UX-52's Fallback card.
 *
 * Kept here with the rest of the approved copy rather than inline in the page,
 * so every string a wireframe fixes has one home — and so the repository-wide
 * scan in `tests/no-manual-delivery.test.ts` reads the sentence that *states*
 * the ban in the one file that is allowed to state it, instead of having to
 * exempt the whole delivery screen from the check.
 */
export const FALLBACK_VALUE = "Automated email / calendar";
export const FALLBACK_NOTE = "No manual send action";

export const NO_ATTEMPT_YET = "Not attempted yet";

/**
 * The note under the Retry fact.
 *
 * Result and Retry are separate axes — a **Failed** delivery whose cause a human
 * has since fixed is still worth one more attempt — so this has to describe
 * retryability without contradicting the result shown beside it. It previously
 * read "Failed after 1 attempts…" under the value **Retryable**, which is both
 * ungrammatical and the opposite of what the value said.
 */
export function describeRetryability(
  state: DeliveryState,
  attempts: number,
  max: number,
  retryable: boolean,
): string {
  if (state === "delivered") return "Delivered — nothing to repair";
  if (state === "attempted") return "Waiting for the provider to confirm delivery";
  if (state === "queued") return "Waiting to be sent";
  if (!retryable) {
    return `Attempted ${countAttempts(attempts)} and not retried again automatically. Somebody has to fix the cause first.`;
  }
  return `${countAttempts(attempts)} of ${max} used`;
}

function countAttempts(attempts: number): string {
  return attempts === 1 ? "1 attempt" : `${attempts} attempts`;
}

/**
 * The Retry column on UX-51.
 *
 * The wireframe distinguishes a queued row, which is waiting for its first
 * send, from a failed one that will be tried again — "Scheduled" and
 * "Retryable" respectively — and shows an em dash where neither applies.
 */
export function describeRetryColumn(state: DeliveryState, retryable: boolean): string {
  if (state === "queued") return "Scheduled";
  return retryable ? "Retryable" : "—";
}

/** The date format the wireframes use: "12 Oct, 18:04". */
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
