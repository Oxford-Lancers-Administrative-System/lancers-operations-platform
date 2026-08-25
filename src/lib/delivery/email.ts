import "server-only";

import type { EmailConfig } from "./config";
import type { DeliveryProvider, OutboundMessage, SendOutcome, Transport } from "./provider";
import { templateFor } from "./templates";

/**
 * The automated email transport. LAN-169, on Resend.
 *
 * ## Why email exists at all, and why it is not "the backup"
 *
 * `resolveDeliveryProvider` named WhatsApp Cloud as the only provider, so email
 * did not exist as a delivery channel. It has two jobs and they are different:
 *
 *   * **The third rung of the chase.** WhatsApp, WhatsApp again, then email
 *     (`REQ-ladder-order`). A scheduled step, not a repair.
 *   * **The automatic fallback.** When WhatsApp cannot deliver, this carries
 *     that message (`REQ-fallback-is-automatic`). No operator sends it, routes
 *     to it, or confirms it — by the time anybody could, it has already gone.
 *
 * `REQ-whatsapp-outage-visible` is the rule that makes the second job subtle.
 * The person was reached, and the club's primary channel still failed. So a
 * WhatsApp failure that email then carried is **not** absorbed: it stays a
 * recorded WhatsApp failure, it stays counted, and the delivery surface reads
 * "WhatsApp unresponsive". This module's job is to carry the message. It is
 * emphatically not to make the failure go away, and there is deliberately no
 * code path here that touches the WhatsApp attempt's outcome.
 *
 * ## Why it implements the same interface as WhatsApp and nothing more
 *
 * `provider.ts` says a second provider "implements this interface and changes
 * nothing else", and this is that claim being cashed. The dispatcher, the
 * operator screens and the reporting path are unchanged: they see a channel and
 * an outcome, and `delivery_results.channel` already carries `email` in the
 * frozen vocabulary.
 *
 * ## What never happens here
 *
 * No message body is logged. No API key is rendered, returned, written to
 * `delivery_attempts.failure_reason`, or put in an audit row — the refusal text
 * this module produces names Resend's own status and nothing else. And no
 * recipient outside the configured allowlist is ever sent to, which is enforced
 * by the dispatcher before a token is minted and again here at the egress, for
 * the same reason the WhatsApp adapter enforces it twice.
 */

export const EMAIL_PROVIDER = "resend";

/**
 * How long one send may take.
 *
 * The same fifteen seconds the WhatsApp adapter allows, and for the same
 * reason: the total dispatch budget is ninety seconds, so a per-call deadline
 * has to leave room for several invitees when the provider is slow rather than
 * down.
 */
export const EMAIL_TIMEOUT_MS = 15_000;

/**
 * Resend's failure statuses this transport considers worth trying again.
 *
 * `retryable` means "the identical send could plausibly succeed without anybody
 * changing anything". A 429 and a 5xx are that. A 401, a 403 and a 422 are not:
 * they are a dead key, a domain that is not verified, and a malformed payload,
 * and every one of them needs a human before a retry can do anything except
 * burn the attempt ceiling and hide the real problem behind "failed 5 times".
 */
function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function reasonFor(status: number): string {
  if (status === 401 || status === 403) {
    return (
      "The email provider rejected this deployment's credentials, so nothing was sent. " +
      "This needs the club's administrator, not an operator."
    );
  }
  if (status === 422) {
    return (
      "The email provider refused the message as malformed or its sending domain as " +
      "unverified. Retrying will not help until that is fixed."
    );
  }
  if (status === 429) {
    return "The email provider is rate-limiting this deployment. This will be attempted again.";
  }
  if (status >= 500) {
    return "The email provider is not responding. This will be attempted again.";
  }
  return `The email provider refused this message (status ${status}).`;
}

/** An email address, near enough for a guard that must never be the only one. */
export function looksLikeAnEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(value.trim());
}

export const NO_USABLE_EMAIL_REASON =
  "This person has no usable email address on their record, so the email step could not be " +
  "attempted. Adding one is a change to their roster entry, not a delivery repair.";

export const EMAIL_NOT_PERMITTED_REASON =
  "This deployment is restricted to an approved list of email recipients, and this person is " +
  "not on it, so nothing was sent. The restriction is deliberate and is lifted by the club's " +
  "administrator, not by an operator.";

/** Is this address on the deployment's allowlist? Empty permits nobody. */
export function emailPermitted(recipient: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) return false;
  return allowlist.includes(recipient.trim().toLowerCase());
}

/**
 * The request body for one email.
 *
 * Exported for the same reason `buildMessageBody` is: it is the part worth
 * asserting on. The body is rendered from `./templates.ts`, so the email and
 * the WhatsApp template for one kind cannot drift into two different things the
 * club is saying.
 *
 * Both a text and an HTML part, because a text-only email lands in more spam
 * filters and an HTML-only one is unreadable in a client that refuses HTML. The
 * HTML is the same lines, escaped — there is no second rendering to keep in
 * step.
 */
export function buildEmailBody(
  config: EmailConfig,
  message: OutboundMessage,
): Record<string, unknown> {
  const template = templateFor(message);
  const lines = template.body(message);

  return {
    from: config.fromAddress,
    to: [config.recipientOverride ?? message.recipient],
    subject: template.subject(message),
    text: lines.join("\n\n"),
    html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n"),
    ...(config.replyToAddress ? { reply_to: config.replyToAddress } : {}),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Resend's success shape, as far as this adapter is willing to look at it. */
interface AcceptedBody {
  id?: unknown;
}

/**
 * Turns one Resend response into an outcome.
 *
 * Pure and exported, so every branch is testable without a network.
 */
export function interpretEmailResponse(status: number, body: unknown): SendOutcome {
  if (status >= 200 && status < 300) {
    const id = (body as AcceptedBody | null)?.id;
    if (typeof id === "string" && id !== "") {
      return { status: "accepted", providerMessageId: id };
    }
    // Accepted with no identifier is not acceptance this system can use: the
    // attempt would have nothing to match a bounce callback against, and
    // `delivery_attempts` refuses an accepted row with no message id. Recorded
    // as a retryable refusal rather than as a silent success.
    return {
      status: "refused",
      reason: "The email provider accepted the message without returning an identifier.",
      retryable: true,
    };
  }

  return { status: "refused", reason: reasonFor(status), retryable: retryableStatus(status) };
}

/**
 * The email provider.
 *
 * `transport` is injected for the same reason the WhatsApp adapter injects it:
 * so the adapter can be driven from a test without a network, and so the local
 * delivery sink can stand in front of it without this file knowing.
 */
export function createEmailProvider(
  config: EmailConfig,
  transport: Transport = fetch,
): DeliveryProvider {
  return {
    name: EMAIL_PROVIDER,
    channel: "email",

    async send(message: OutboundMessage): Promise<SendOutcome> {
      const addressed = config.recipientOverride ?? message.recipient;

      if (!looksLikeAnEmailAddress(addressed)) {
        return { status: "refused", reason: NO_USABLE_EMAIL_REASON, retryable: false };
      }

      // The second enforcement, at the egress. The dispatcher already refused a
      // recipient off the allowlist before minting a token; this one exists
      // because a deployment restricted to two addresses must not be one code
      // path away from messaging forty.
      if (!emailPermitted(addressed, config.recipientAllowlist)) {
        return { status: "refused", reason: EMAIL_NOT_PERMITTED_REASON, retryable: false };
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);

      try {
        const response = await transport(`${config.apiBaseUrl}/emails`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(buildEmailBody(config, message)),
          signal: controller.signal,
        });

        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          // Left null; `interpretEmailResponse` treats a bodyless response by
          // status alone.
        }

        return interpretEmailResponse(response.status, body);
      } catch (error) {
        // A timeout or a network fault. Retryable, and the reason names neither
        // the address nor the exception's message — a fetch error routinely
        // quotes the host and the recipient.
        const aborted = error instanceof Error && error.name === "AbortError";
        return {
          status: "refused",
          reason: aborted
            ? "The email provider did not answer within the time allowed. This will be attempted again."
            : "The email provider could not be reached. This will be attempted again.",
          retryable: true,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
