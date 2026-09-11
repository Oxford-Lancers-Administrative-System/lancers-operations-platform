import "server-only";

import crypto from "node:crypto";

import { RECIPIENT_NOT_PERMITTED_REASON, recipientPermitted } from "./allowlist";
import type { OutboundConfig, WebhookConfig } from "./config";
import { TOLL_FREE_VARIABLE } from "./config";
import type {
  DeliveryProvider,
  MessageKind,
  OutboundMessage,
  ProviderCallbackEvent,
  SendOutcome,
  Transport,
} from "./provider";
import { templateFor } from "./templates";

/**
 * The Twilio SMS adapter. LAN-330.
 *
 * This is the only file in the repository that knows what Twilio is, and the
 * only one on the delivery path that knows what an HTTP request is. Everything
 * it exports is either the `DeliveryProvider` interface or a pure function
 * over a payload, which is what makes the rest testable without a network and
 * this file testable without a database.
 *
 * ## Sender by destination
 *
 * A US phone cannot receive from an alphanumeric sender, and a UK phone should
 * not receive from a US toll-free number. So `From` is chosen from the
 * destination's country code: the toll-free number for `+1`, the alphanumeric
 * sender for everything else. While the toll-free number is unverified and
 * therefore unset, a `+1` destination is **refused with a reason**, never
 * quietly sent from the alphanumeric sender to arrive nowhere.
 *
 * ## Acceptance is not delivery
 *
 * `send` returns `accepted` when Twilio has queued the message. Delivery is
 * only ever known from the status callback, which is why the schema keeps
 * `delivery_attempts` (accepted, with the provider's SID) separate from
 * `delivery_results` (what actually happened).
 *
 * ## Nothing here is ever logged
 *
 * The API key secret is a credential and the recipient's number is personal
 * data. Neither is written to a log, an error, an audit row or a
 * `failure_reason`. Provider text that reaches a stored column goes through
 * `redactDigits` first, because Twilio's error messages quote the number.
 */

/** How long one provider call may take before it is abandoned. */
export const PROVIDER_TIMEOUT_MS = 15_000;

/** Stored in `delivery_attempts.provider`. Rows are keyed on it; keep it stable. */
export const TWILIO_SMS_PROVIDER = "twilio_sms";

/** The callback path Twilio posts status transitions to. */
export const STATUS_CALLBACK_PATH = "/api/webhooks/twilio";

/** Replaces any run of seven or more digits. */
export function redactDigits(text: string): string {
  return text.replace(/\d{7,}/g, "[redacted]");
}

/**
 * Twilio error codes on a send that a plain retry could plausibly resolve.
 * Everything absent from this set needs a human first.
 */
const RETRYABLE_PROVIDER_CODES: ReadonlySet<number> = new Set([
  20429, // too many requests
  30001, // queue overflow
]);

/** Sentences an operator can act on, per Twilio error code. */
const PROVIDER_REASONS: Readonly<Record<number, string>> = {
  20003: "The club's provider credential was refused, so nothing could be sent.",
  21211: "The provider could not route to this number. It may be incomplete or not a mobile.",
  21212: "The sender this deployment is configured with is not valid for this destination.",
  21408: "Sending to this destination's country is not enabled on the club's provider account.",
  21606: "The sender this deployment is configured with is not usable on this account.",
  21610: "This person has previously replied STOP to the sender, so the provider will not deliver.",
  21614: "This number is not a mobile, so a text message cannot reach it.",
  20429: "The provider is rate-limiting the club's account. This will be attempted again.",
  30001: "The provider's queue is full. This will be attempted again.",
  30003: "The handset was unreachable — switched off or out of coverage.",
  30005: "The destination number is unknown or no longer in service.",
  30006: "The destination is a landline or an unreachable carrier.",
  30007: "The carrier filtered this message as unwanted.",
  30008: "The carrier reported an unknown delivery error.",
  30032: "US carriers block traffic from a toll-free number until its verification clears.",
  30034: "US carriers block traffic from an unregistered local number.",
};

function reasonFor(code: number, fallback: string): string {
  return PROVIDER_REASONS[code] ?? `The provider refused this message (code ${code}). ${fallback}`;
}

export const US_SENDER_NOT_READY_REASON =
  "This person has a US number and the club's US sender is not verified yet, so nothing was " +
  `sent. Set ${TOLL_FREE_VARIABLE} once toll-free verification clears, then retry.`;

/** The Messages endpoint for this account. */
export function messagesEndpoint(config: OutboundConfig): string {
  return `${config.apiBaseUrl}/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`;
}

/**
 * Where Twilio posts status transitions for a message sent by this deployment.
 *
 * The kind travels as a query parameter. It is not a secret and nothing in the
 * callback route trusts it; it is there so a callback log, the local sink and
 * the test panel can say *which* message a SID belongs to without reading the
 * body, which for a text carries no template name.
 */
export function statusCallbackUrl(appBaseUrl: string, kind: MessageKind): string {
  return `${appBaseUrl.replace(/\/+$/, "")}${STATUS_CALLBACK_PATH}?kind=${encodeURIComponent(kind)}`;
}

/** E.164 digits, no `+`, to the `+`-prefixed form Twilio takes. */
export function toTwilioNumber(digits: string): string {
  return `+${digits.replace(/[^0-9]/g, "")}`;
}

/** Is this E.164 number in the North American plan? */
export function isNorthAmerican(digits: string): boolean {
  const clean = digits.replace(/[^0-9]/g, "");
  return clean.startsWith("1") && clean.length === 11;
}

export type SenderRefusal = { readonly ok: false; readonly reason: string };
export type SenderChoice = { readonly ok: true; readonly from: string } | SenderRefusal;

/** The sender for one destination, or the reason there is none. */
export function senderFor(recipientDigits: string, config: OutboundConfig): SenderChoice {
  if (isNorthAmerican(recipientDigits)) {
    return config.tollFreeNumber
      ? { ok: true, from: config.tollFreeNumber }
      : { ok: false, reason: US_SENDER_NOT_READY_REASON };
  }
  return { ok: true, from: config.alphaSender };
}

/**
 * The text of one message.
 *
 * Rendered from `./templates.ts`, so the SMS and the email for one kind cannot
 * drift into two different things the club is saying.
 */
export function renderSmsBody(message: OutboundMessage): string {
  return templateFor(message).sms(message);
}

/**
 * The form-encoded request for one message.
 *
 * Exported because it is the part worth asserting on. A `Record` rather than
 * `URLSearchParams` so a test can read it and the local sink can validate it
 * without re-parsing.
 */
export function buildSmsRequest(
  config: OutboundConfig,
  message: OutboundMessage,
): { readonly ok: true; readonly form: Readonly<Record<string, string>> } | SenderRefusal {
  const sender = senderFor(message.recipient, config);
  if (!sender.ok) return sender;
  return {
    ok: true,
    form: {
      To: toTwilioNumber(message.recipient),
      From: sender.from,
      Body: renderSmsBody(message),
      StatusCallback: statusCallbackUrl(config.appBaseUrl, message.kind ?? "invitation"),
    },
  };
}

function encodeForm(form: Readonly<Record<string, string>>): string {
  return new URLSearchParams(form).toString();
}

/** Twilio's success shape, as far as this adapter is willing to look at it. */
interface AcceptedBody {
  sid?: unknown;
  status?: unknown;
}

/** Twilio's error shape, likewise. */
interface ErrorBody {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

/**
 * Turns one Twilio response into an outcome.
 *
 * Pure and exported, so every branch — accepted, refused with a known code,
 * refused with an unknown code, malformed body, 5xx — is testable without a
 * transport at all.
 */
export function interpretTwilioResponse(status: number, body: unknown): SendOutcome {
  const error = body as ErrorBody | null;
  const code = typeof error?.code === "number" ? error.code : 0;

  if (status >= 200 && status < 300 && code === 0) {
    const sid = (body as AcceptedBody | null)?.sid;
    if (typeof sid === "string" && sid !== "") {
      return { status: "accepted", providerMessageId: sid };
    }
    return {
      status: "refused",
      reason:
        "The provider accepted the message but returned no message identifier, " +
        "so its delivery could not be tracked. Nothing is known to have been sent.",
      retryable: true,
    };
  }

  if (code !== 0) {
    return {
      status: "refused",
      reason: reasonFor(code, "This needs the club's administrator."),
      retryable: RETRYABLE_PROVIDER_CODES.has(code) || status === 429 || status >= 500,
    };
  }

  return {
    status: "refused",
    reason:
      `The provider could not be reached or answered unexpectedly (HTTP ${status}). ` +
      "Nothing was sent.",
    retryable: status === 429 || status >= 500,
  };
}

/** Builds the provider. `transport` is injected so tests need no network. */
export function createTwilioSmsProvider(
  config: OutboundConfig,
  transport: Transport = fetch,
): DeliveryProvider {
  return {
    name: TWILIO_SMS_PROVIDER,
    channel: "sms",

    async send(message: OutboundMessage): Promise<SendOutcome> {
      // The service layer refuses a recipient outside the allowlist before it
      // mints a token; this is the same refusal at the last point it can be
      // made, immediately before a connection is opened to the provider.
      if (
        !recipientPermitted(message.recipient, config.recipientAllowlist, config.defaultCallingCode)
      ) {
        return { status: "refused", reason: RECIPIENT_NOT_PERMITTED_REASON, retryable: false };
      }

      const request = buildSmsRequest(config, message);
      if (!request.ok) return { status: "refused", reason: request.reason, retryable: false };

      let response: Response;
      try {
        response = await transport(messagesEndpoint(config), {
          method: "POST",
          headers: {
            // The one place this credential is used. Never logged, never stored.
            Authorization:
              "Basic " +
              Buffer.from(`${config.apiKeySid}:${config.apiKeySecret}`, "utf8").toString("base64"),
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: encodeForm(request.form),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
      } catch (error) {
        return {
          status: "refused",
          reason:
            "The provider could not be reached, so nothing was sent: " +
            redactDigits(error instanceof Error ? error.message : "unknown transport failure"),
          retryable: true,
        };
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        // Left null; `interpretTwilioResponse` treats a bodyless response by status.
      }

      const outcome = interpretTwilioResponse(response.status, body);
      return outcome.status === "refused"
        ? { ...outcome, reason: redactDigits(outcome.reason) }
        : outcome;
    },
  };
}

// ---------------------------------------------------------------------------
// Inbound status callbacks
// ---------------------------------------------------------------------------

/**
 * Twilio's request signature, computed the way Twilio documents it: the full
 * URL the callback was addressed to, followed by every POST parameter's name
 * and value concatenated in name order, HMAC-SHA1 under the account's Auth
 * Token, base64.
 *
 * `url` must be the URL **Twilio** requested — the `StatusCallback` this
 * deployment sent — not the URL the app saw, which behind a tunnel carries a
 * loopback host.
 */
export function expectedTwilioSignature(
  url: string,
  params: Readonly<Record<string, string>>,
  authToken: string,
): string {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((key) => key + params[key])
      .join("");
  return crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/**
 * Verifies `X-Twilio-Signature`. Constant-time on the digest; a `null` header
 * never matches.
 */
export function verifyTwilioSignature(
  url: string,
  params: Readonly<Record<string, string>>,
  header: string | null,
  config: WebhookConfig,
): boolean {
  if (!header) return false;
  const given = Buffer.from(header, "utf8");
  const mine = Buffer.from(expectedTwilioSignature(url, params, config.authToken), "utf8");
  if (given.length !== mine.length) return false;
  return crypto.timingSafeEqual(given, mine);
}

/** The form body of a callback, as a plain record. Repeated keys keep the last value. */
export function parseFormBody(raw: string): Readonly<Record<string, string>> {
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(raw)) params[key] = value;
  return params;
}

/** Twilio's status vocabulary, mapped onto the frozen model's outcomes. */
function outcomeFor(status: string): ProviderCallbackEvent["outcome"] {
  switch (status) {
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
      return "failed";
    // `queued`, `sending`, `sent` and `read` are real transitions with no
    // `delivery_outcome` value. They are stored as evidence and applied to
    // nothing, exactly as acceptance already was at send time.
    default:
      return null;
  }
}

/**
 * One status callback as a provider-neutral event, or `null` when the body
 * carries no message identifier at all.
 */
export function parseStatusCallback(
  params: Readonly<Record<string, string>>,
): ProviderCallbackEvent | null {
  const sid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  if (sid === "") return null;
  const status = (params.MessageStatus ?? params.SmsStatus ?? "").trim().toLowerCase();
  const code = Number.parseInt(params.ErrorCode ?? "", 10);
  const outcome = outcomeFor(status);

  return {
    // Twilio reuses the SID across a message's transitions, so the SID alone is
    // not a deduplication key. The pair is unique per transition.
    providerEventId: `${sid}:${status || "unknown"}`,
    providerMessageId: sid,
    providerStatus: status === "" ? null : status,
    outcome,
    detail:
      outcome === "failed"
        ? redactDigits(
            Number.isFinite(code)
              ? `${reasonFor(code, "The provider gave no further detail.")} (Twilio ${code})`
              : "The provider reported the message as not delivered and gave no error code.",
          )
        : null,
  };
}
