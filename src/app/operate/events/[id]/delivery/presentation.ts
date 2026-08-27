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

/**
 * § 6's five, plus **Held**.
 *
 * Held is LAN-156's and it is not a sixth provider status — it is the club
 * stopping its own message. § 6's vocabulary describes what the provider did
 * with a message, and a held message has not been offered to the provider at
 * all, so no existing word covers it. It was previously rendered as **Queued**,
 * which told the operator the opposite of the truth: that it was on its way.
 */
export const DELIVERY_STATE_LABELS: Readonly<Record<DeliveryState, string>> = Object.freeze({
  queued: "Queued",
  attempted: "Attempted",
  delivered: "Delivered",
  failed: "Failed",
  retryable: "Retryable",
  held: "Held",
  // LAN-156 (R156-B2). Not a provider outcome either, for the same reason
  // Held is not: the club stopped the message itself, before it ever reached
  // a provider. Distinct from Held because there is nothing left to resume —
  // the event is terminal.
  cancelled: "Cancelled",
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
  // Not an error — nothing has gone wrong, and the club did this on purpose.
  // Warning rather than neutral because it is a message that has stopped.
  held: "warning",
  // Not an error either, and calmer than Held: the event is cancelled and
  // terminal, so there is no change coming that would make this message
  // send after all.
  cancelled: "default",
});

/**
 * W6's two named exceptions to the plain five-state vocabulary above —
 * `REQ-no-channel-backstop` and `REQ-whatsapp-outage-visible`. Both replace
 * what would otherwise render as an undifferentiated **Failed**, on this
 * screen and on the participation table's own Delivery column
 * (`src/app/participation/presentation.ts` carries the identical two
 * strings, for the same reason `DELIVERY_LABELS` there already duplicates
 * this file's five rather than importing them — `docs/ux/standards.md` rule
 * 7 asks the two surfaces to agree, not to share one module).
 */
export const NOT_DISPATCHED_NO_CHANNEL = "Not dispatched — no channel";
export const WHATSAPP_UNRESPONSIVE = "WhatsApp unresponsive";

export const NEEDS_ATTENTION_HEADING = "Needs attention";
export const NEEDS_ATTENTION_NOTE =
  "The system retries and falls back to email on its own. Only a missing route needs a person.";
export const OPEN_THEIR_RECORD = "Open their record";
export const NO_ACTION_NEEDED = "No action needed";

/** The one row shape both exceptions read — `DeliveryRow`'s relevant fields. */
export interface DeliveryExceptionFacts {
  readonly state: DeliveryState;
  readonly noUsableRoute: boolean;
  readonly whatsappUnresponsive: boolean;
}

/** The chip's actual text, once the two exceptions are applied. */
export function deliveryRowLabel(row: DeliveryExceptionFacts): string {
  if (row.noUsableRoute) return NOT_DISPATCHED_NO_CHANNEL;
  if (row.whatsappUnresponsive) return WHATSAPP_UNRESPONSIVE;
  return DELIVERY_STATE_LABELS[row.state];
}

/** The chip's actual colour, once the two exceptions are applied. */
export function deliveryRowColour(
  row: DeliveryExceptionFacts,
): "default" | "info" | "success" | "warning" | "error" {
  if (row.noUsableRoute) return "error";
  // Reached — the club's own channel failed and that stays visible, but it is
  // not the same alarm as a person nothing has reached at all.
  if (row.whatsappUnresponsive) return "warning";
  return DELIVERY_STATE_COLOURS[row.state];
}

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

/**
 * OWNER-LAN173-02, W6-02. The mockup draws one table on this page — per
 * attempt, not per invitee — so the standing note says what that table is
 * rather than a claim (RSVP independence) that belonged to the table this
 * correction removed.
 */
export const DIAGNOSTICS_NOTE =
  "Every attempt on every channel, including the automatic email fallback. No message content " +
  "is shown.";

export const SEARCH_LABEL = "Search invitees";

/**
 * The five provider-neutral states offered as filters — `held` and
 * `cancelled` are not, because there is nothing an operator does differently
 * for either from this screen.
 */
const FILTERABLE_STATES: readonly DeliveryState[] = Object.freeze([
  "queued",
  "attempted",
  "delivered",
  "failed",
  "retryable",
]);

/**
 * The status filter's options. "Needs attention" is the wireframe's default.
 *
 * Labels come from {@link DELIVERY_STATE_LABELS} rather than a second copy of
 * the same five words, so the filter and the chip can never say the state
 * differently.
 */
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

/**
 * OWNER-LAN173-02's Status filter, read against one **attempt**'s own
 * recorded outcome rather than against a `DeliveryState` — an attempt row has
 * no job-level "queued" or "retryable" of its own, only what the provider (or
 * the club, before ever offering it) actually returned.
 *
 * "attention" mirrors {@link matchesStatusFilter}'s failed+retryable pairing
 * with the two outcomes that mean the same thing at the attempt level:
 * `failed` and `rejected` are both a refusal, one retryable and one not.
 * "queued" and "retryable" match no recorded attempt on purpose — a queued or
 * awaiting-retry job has not produced an attempt yet, so the honest answer to
 * "show me its queued/retryable attempts" is none, not a guess.
 */
export function matchesAttemptStatusFilter(outcome: string, filter: string): boolean {
  if (filter === "") return true;
  if (filter === "attention" || filter === "failed")
    return outcome === "failed" || outcome === "rejected";
  if (filter === "delivered") return outcome === "delivered";
  if (filter === "attempted") return outcome === "attempted" || outcome === "sent";
  return false;
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
  // LAN-156. Says what stopped it. It used to add "Re-notify to send the
  // change", which told the operator that pressing Re-notify sends *this*
  // message — R156-B3. Re-notify writes a separate notice job; nothing here
  // ever clears `held_at`, so that sentence promised a release the codebase
  // does not perform. Whether a held job itself ever resumes is Mission 4's
  // decision, so this says only what is true today and stops.
  if (state === "held") return "Held since this event was changed.";
  // LAN-156 (R156-B2). The event is cancelled and terminal, so unlike Held
  // there is nothing to say would release it — nothing will.
  if (state === "cancelled") return "Cancelled with the event. Nothing further will be sent.";
  if (!retryable) {
    return `${countAttempts(attempts)} used, and no further automatic attempt. Somebody has to fix the cause first.`;
  }
  return `${countAttempts(attempts)} of ${max} used`;
}

function countAttempts(attempts: number): string {
  return attempts === 1 ? "1 attempt" : `${attempts} attempts`;
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
