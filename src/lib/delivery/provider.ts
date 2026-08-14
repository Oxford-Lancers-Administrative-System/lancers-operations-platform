import "server-only";

/**
 * The provider boundary. LAN-78.
 *
 * Everything above this file — the dispatcher, the operator screens, the
 * reporting path — is written against these types and knows nothing about
 * WhatsApp, Meta or HTTP. That is not architectural decoration: LAN-90's
 * approved contract requires the operator surface to be provider-neutral
 * (queued, attempted, delivered, failed, retryable), and LAN-92 chose Meta's
 * Cloud API as an implementation of a decision that is explicitly allowed to be
 * revisited. A second provider, or the automated email fallback the policy
 * names, implements this interface and changes nothing else.
 *
 * ## Why `send` returns a union instead of throwing
 *
 * A refusal is a normal outcome that has to be **recorded**, not an exception
 * that unwinds a request. The dispatcher writes every refusal to
 * `delivery_attempts` so an operator can see it, so throwing would mean
 * catching immediately at the one call site and reconstructing what happened
 * from an error message. The union makes the two paths equally first-class and
 * makes `retryable` a value the caller must handle rather than a guess.
 *
 * ## What `retryable` means
 *
 * Whether trying the identical send again could plausibly succeed without
 * anybody changing anything. A network timeout, a 429 and a 5xx are retryable.
 * An unroutable number, a rejected template and an expired credential are not —
 * they need a human to fix something first, and retrying them just burns the
 * attempt ceiling and hides the real problem behind "failed 5 times".
 */

/** One invitation, reduced to what any channel would need to send it. */
export interface InvitationMessage {
  /** E.164 digits, no `+`. Already normalised; the provider does not guess. */
  readonly recipient: string;
  /** How the club addresses this person — their known-as or given name. */
  readonly inviteeName: string;
  readonly eventName: string;
  /** The event's date and time, already formatted for a human. */
  readonly whenLabel: string;
  /** The signed RSVP link. Carries the plaintext token and is never logged. */
  readonly rsvpUrl: string;
}

export type SendOutcome =
  | { readonly status: "accepted"; readonly providerMessageId: string }
  | { readonly status: "refused"; readonly reason: string; readonly retryable: boolean };

/**
 * A parsed inbound callback.
 *
 * `outcome` is `null` for a status this slice has no domain value for —
 * WhatsApp reports `sent` and `read`, and `delivery_outcome` has neither.
 * Widening that enum would be a change to the frozen model, so such a callback
 * is stored as evidence, deduplicated like any other, and applied to nothing.
 */
export interface ProviderCallbackEvent {
  /** The provider's identifier for this notification. The deduplication key. */
  readonly providerEventId: string;
  readonly providerMessageId: string | null;
  /** The provider's own word, kept verbatim as evidence. */
  readonly providerStatus: string | null;
  readonly outcome: "delivered" | "failed" | "rejected" | null;
  /** Safe, provider-neutral summary. Never the raw body. */
  readonly detail: string | null;
}

export interface DeliveryProvider {
  /** Stored in `delivery_attempts.provider`. Stable; rows are keyed on it. */
  readonly name: string;
  /** The provider-neutral channel this provider delivers on. Never `manual`. */
  readonly channel: "whatsapp" | "email" | "sms";
  send(message: InvitationMessage): Promise<SendOutcome>;
}

/**
 * The `fetch`-shaped function the Cloud API adapter calls.
 *
 * Injected rather than closed over so the adapter can be driven from a test
 * without a network, and so the live non-production test can use the real one
 * without the adapter knowing the difference.
 */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;
