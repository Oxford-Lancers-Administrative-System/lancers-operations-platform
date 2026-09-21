import "server-only";

import type { EmailConfig } from "./config";
import { renderEmailHtml } from "./email-shell";
import type {
  DeliveryProvider,
  OutboundMessage,
  SendFaultScope,
  SendOutcome,
  Transport,
} from "./provider";
import { RECRUIT_STOP_MESSAGES_LABEL, templateFor } from "./templates";

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
 * this module produces names Resend's own status and nothing else. And nobody
 * the club has no standing to email is reached: LAN-287 removed this module's
 * deployment-wide address allowlist, and what decides who may be written to is
 * the job the dispatcher created — membership, recorded consent, withdrawal and
 * departure, each enforced where the ladder is built.
 */

export const EMAIL_PROVIDER = "resend";

/**
 * The name an email from the club arrives under. LAN-398, Brian 2026-09-18.
 *
 * The club's university mailbox shows in iPhone Mail as "Oxford University
 * Lancers American Football Club"; the app's own mail showed as two initials
 * and an address, because `from` carried a bare address and nothing else. This
 * is the club's full name, written out, and it is the bar the club set.
 *
 * It lives here rather than in the environment on purpose. `deploy.yml` folds
 * `--set-env-vars` into one whitespace-free token, so a value with spaces in it
 * splits the flag mid-value and silently drops every setting after it
 * (`docs/deployment.md`; `tests/deployment-configuration.test.ts` parses that
 * token on whitespace). `EMAIL_FROM_ADDRESS` therefore stays a bare address
 * exactly as that pipeline requires, and the name in front of it is a fact
 * about the club rather than about the deployment — every deployment sends as
 * the same club.
 */
export const EMAIL_FROM_DISPLAY_NAME = "Oxford University Lancers American Football Club";

/**
 * The `from` header: the club's name, then the deployment's verified address.
 *
 * The angle-bracket form is what Resend documents and what every client parses
 * into a display name. The address is taken *out* of `fromAddress` rather than
 * assumed bare: `.env.example` documented the `Name <address>` form until this
 * change, so a deployment may still be carrying one, and concatenating a
 * display name onto a value that already has one produces `A <B <c@d>>` — which
 * Resend refuses with a terminal 422 on every send. The address itself is
 * unchanged either way.
 */
export function emailFromHeader(fromAddress: string): string {
  const angled = /<([^<>]+)>\s*$/.exec(fromAddress);
  const address = (angled ? angled[1] : fromAddress).trim();
  return `${EMAIL_FROM_DISPLAY_NAME} <${address}>`;
}

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

/**
 * Whose fault the refusal is, for LAN-394's provider circuit. From the status
 * alone, never from the sentence: a credential or a 5xx is the provider being
 * unwell, a malformed message is this message, and a refusal about one address
 * is that address.
 */
function faultScopeFor(status: number): SendFaultScope {
  if (status === 401 || status === 403) return "provider";
  if (status === 422) return "message";
  if (status === 429 || status === 408 || status >= 500) return "provider";
  return "message";
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

/**
 * The request body for one email.
 *
 * Exported for the same reason `buildMessageBody` is: it is the part worth
 * asserting on. The body is rendered from `./templates.ts`, so the email and
 * the WhatsApp template for one kind cannot drift into two different things the
 * club is saying.
 *
 * Both a text and an HTML part, because a text-only email lands in more spam
 * filters and an HTML-only one is unreadable in a client that refuses HTML.
 *
 * The two parts are the same lines. `text` is those lines and nothing else, and
 * LAN-398 left it alone deliberately — it is what a client refusing HTML shows,
 * and it is the copy Meta's classifier approved. `html` puts the identical
 * lines, escaped, one `<p>` each, inside the club's shell (`./email-shell.ts`).
 * There is still no second rendering to keep in step: there is one body, in a
 * frame. The one line that moves is the Stop line, from the end of the message
 * to the signature block — see below, and see `email-shell.ts` on why.
 */
export function buildEmailBody(
  config: EmailConfig,
  message: OutboundMessage,
): Record<string, unknown> {
  const template = templateFor(message);
  const lines = template.body(message);

  const subject = template.subject(message);

  // `stopLine()` puts `Stop messages: <url>` last, on the four recruit kinds
  // that carry one and nowhere else (LAN-372). In the HTML it belongs with the
  // signature rather than with the message, so it is separated here and the
  // shell signs off with it. Same line, same wording, moved and not copied.
  // `text` is assembled from the untouched `lines` and is unaffected.
  const stop = lines.at(-1)?.startsWith(`${RECRUIT_STOP_MESSAGES_LABEL}: `) === true;

  return {
    from: emailFromHeader(config.fromAddress),
    to: [config.recipientOverride ?? message.recipient],
    subject,
    text: lines.join("\n\n"),
    html: renderEmailHtml({
      appBaseUrl: config.appBaseUrl,
      subject,
      lines: stop ? lines.slice(0, -1) : lines,
      stopLine: stop ? (lines.at(-1) ?? null) : null,
    }),
    ...(config.replyToAddress ? { reply_to: config.replyToAddress } : {}),
  };
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
      faultScope: "provider",
    };
  }

  return {
    status: "refused",
    reason: reasonFor(status),
    retryable: retryableStatus(status),
    faultScope: faultScopeFor(status),
  };
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
        return {
          status: "refused",
          reason: NO_USABLE_EMAIL_REASON,
          retryable: false,
          faultScope: "recipient",
        };
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
          faultScope: "provider",
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
