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

/**
 * The six messages the club sends. LAN-169.
 *
 * Fixed and closed, because each one is an approved WhatsApp template and an
 * email body declared together in `./templates.ts`, and a seventh kind is a
 * thing Meta has to approve before it can exist. The ladder's own order —
 * WhatsApp, WhatsApp again, email, then the President — is not represented
 * here: `invitation` and `reminder` are both carried on either channel, and
 * which channel carries which rung is the schedule's business, not the
 * message's.
 */
export type MessageKind =
  | "invitation"
  | "reminder"
  /** A player who said yes but has not finished the event's questions. */
  | "nudge"
  | "change_notice"
  | "cancellation"
  /** To the President, as an office. Carries no player personal data. */
  | "escalation";

/**
 * One message, reduced to what any channel would need to send it.
 *
 * ## Why `recipient` is channel-shaped and the interface is not
 *
 * `recipient` is E.164 digits for WhatsApp and an email address for email, and
 * nothing above this line has to know which — the provider resolved for the
 * job is the thing that decides what a recipient is, and the dispatcher hands
 * it the one the job's channel selected. A `phoneNumber` and an `emailAddress`
 * field would put that decision in the dispatcher, where it would have to be
 * re-made at every call site.
 *
 * ## Why the optional fields are optional
 *
 * Each kind reads a different subset — a cancellation needs a reason and no
 * link, an escalation needs counts and no name — and `./templates.ts` declares
 * per kind which are required. A field missing where its template needs it is a
 * refusal at render time rather than a message with a blank in it, because a
 * message reading "Cancelled: undefined" is worse than one that was not sent.
 */
export interface OutboundMessage {
  /**
   * Which of the six this is. Optional, and it defaults to `invitation` — the
   * message that carries the RSVP link and does the real work — so an unset
   * kind resolves to something a player can answer rather than something they
   * cannot. Same reasoning `templateShape` records in `./config.ts`.
   */
  readonly kind?: MessageKind;
  /** E.164 digits with no `+` for WhatsApp, or an email address for email. */
  readonly recipient: string;
  /** How the club addresses this person — their known-as or given name. */
  readonly inviteeName: string;
  readonly eventName: string;
  /** The event's date and time, already formatted for a human. */
  readonly whenLabel: string;
  /** The signed RSVP link. Carries the plaintext token and is never logged. */
  readonly rsvpUrl: string;
  /** Where the event happens, where the club records one. */
  readonly venue?: string | null;
  /** The response deadline, already formatted. Displayed, never enforced here. */
  readonly deadlineLabel?: string | null;
  /** How many others have already said yes. A dispatch-time snapshot (W2-02). */
  readonly attendingCount?: number | null;
  /** What an amendment changed, in the club's own words. */
  readonly changeSummary?: string | null;
  /** Why an event was cancelled. Required by the cancellation template. */
  readonly cancellationReason?: string | null;
  /** How many people have not answered. Escalation only. */
  readonly outstandingCount?: number | null;
  /** The operator-tier follow-up queue. Escalation only. */
  readonly queueUrl?: string | null;
}

/**
 * The name this type had when there was one message.
 *
 * Kept because `whatsapp-cloud.ts`, its tests and LAN-124's live-provider path
 * all name it, and renaming a type across those for no behavioural reason would
 * be churn dressed as tidying. New code should say `OutboundMessage`.
 */
export type InvitationMessage = OutboundMessage;

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
