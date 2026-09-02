import "server-only";

import crypto from "node:crypto";

import { RECIPIENT_NOT_PERMITTED_REASON, recipientPermitted } from "./allowlist";
import type { OutboundConfig, WebhookConfig } from "./config";
import type {
  DeliveryProvider,
  InvitationMessage,
  ProviderCallbackEvent,
  SendOutcome,
  Transport,
} from "./provider";
import { templateFor, templateNameFor } from "./templates";

/**
 * The direct Meta Cloud API adapter. LAN-92 chose it; LAN-78 builds it.
 *
 * This is the only file in the repository that knows what WhatsApp is. It is
 * also the only one that knows what an HTTP request is, on the delivery path.
 * Everything it exports is either the `DeliveryProvider` interface or a pure
 * function over a payload, which is what makes the rest testable without a
 * network and this file testable without a database.
 *
 * ## Business-initiated messages must be templates
 *
 * Proven against Meta's test number on 13 August 2026: a free-form text message
 * to a recipient who has not messaged the business inside the previous
 * twenty-four hours is accepted with HTTP 200 and then never delivered. The
 * same recipient received an approved template immediately.
 *
 * An event invitation is always business-initiated — the club approves an event
 * and the player has, by definition, not just messaged us — so **production is
 * template-only**. The free-form path exists solely for the loopback test
 * affordance in `config.ts`, which cannot be reached from a deployed
 * environment. That is a Meta platform rule, not a preference, and the club
 * therefore needs an approved invitation template before any real send. It is
 * named as an owner action in the handoff.
 *
 * ## Acceptance is not delivery
 *
 * `send` returns `accepted` when Meta has taken responsibility for the message,
 * which is exactly what the 200 above meant while the message went nowhere.
 * Delivery is only ever known from a callback, and that is why the schema has
 * `delivery_attempts` (accepted, with the provider's identifier) separate from
 * `delivery_results` (what actually happened). Treating a 200 as success would
 * have reported that undelivered message as delivered.
 *
 * ## Nothing here is ever logged
 *
 * The access token is a bearer credential and the recipient's number is
 * personal data. Neither is written to a log, an error, an audit row or a
 * `failure_reason`. Provider text that reaches a stored column goes through
 * `redactDigits` first, because Meta's error messages quote the recipient.
 */

/**
 * How long one provider call may take before it is abandoned.
 *
 * Fifteen seconds. Long enough for a slow but working Graph response, short
 * enough that approving an event with forty invitees cannot hang for minutes on
 * one unreachable host.
 */
export const PROVIDER_TIMEOUT_MS = 15_000;

/** Stored in `delivery_attempts.provider`. Rows are keyed on it; keep it stable. */
export const WHATSAPP_CLOUD_PROVIDER = "meta_whatsapp_cloud";

/**
 * Replaces any run of seven or more digits.
 *
 * Long enough not to touch an error code, a version or a timestamp fragment;
 * short enough to catch every national and international phone number. Applied
 * to anything from the provider that will be stored or shown.
 */
export function redactDigits(text: string): string {
  return text.replace(/\d{7,}/g, "[redacted]");
}

/**
 * Meta error codes that a plain retry could plausibly resolve.
 *
 * Everything absent from this set is treated as needing a human, which is the
 * safe default: retrying an unroutable number or an unapproved template five
 * times produces five identical failures and buries the actual problem under
 * "failed (5 attempts)".
 */
const RETRYABLE_PROVIDER_CODES: ReadonlySet<number> = new Set([
  130429, // rate limit hit
  131056, // pair rate limit hit
  131000, // something went wrong, unspecified
  368, // temporarily blocked for policy violations — clears on its own
]);

/** Sentences an operator can act on, per Meta error code. */
const PROVIDER_REASONS: Readonly<Record<number, string>> = {
  131047:
    "WhatsApp would not deliver this message because the club has no open " +
    "conversation with this person and the message was not an approved template.",
  131026: "WhatsApp could not deliver to this number — it may not be a WhatsApp account.",
  131030: "This number is not on the provider's permitted recipient list.",
  132000: "The approved message template did not match what was sent.",
  132001: "The message template named for invitations does not exist on the club's account.",
  132015: "The message template named for invitations has been paused by the provider.",
  132016: "The message template named for invitations has been disabled by the provider.",
  190: "The club's provider credential has expired or been revoked, so nothing could be sent.",
  130429: "The provider is rate-limiting the club's account. This will be retried automatically.",
};

function reasonFor(code: number, fallback: string): string {
  return PROVIDER_REASONS[code] ?? `The provider refused this message (code ${code}). ${fallback}`;
}

/** The Graph endpoint one message is posted to. */
function messagesEndpoint(config: OutboundConfig): string {
  return `${config.graphBaseUrl}/${config.graphVersion}/${config.phoneNumberId}/messages`;
}

/**
 * The request body for one invitation.
 *
 * Exported because it is the part worth asserting on: a test that checks the
 * exact payload catches a template-parameter reordering, which is the mistake
 * that produces a message reading "Please confirm you can make it to 19:00, on
 * Team Practice".
 */
export function buildMessageBody(
  config: OutboundConfig,
  message: InvitationMessage,
): Record<string, unknown> {
  const to = config.localTest.recipientOverride ?? message.recipient;

  if (config.localTest.messageMode === "text") {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: true,
        body:
          `${message.inviteeName}, the Oxford Lancers have a ${message.eventName} ` +
          `on ${message.whenLabel}.\n\nPlease tell us whether you can make it:\n` +
          (message.yesUrl ?? message.rsvpUrl),
      },
    };
  }

  // A template with no body parameters at all — LAN-124.
  //
  // Meta matches what is sent against what the approved template declares and
  // answers 132000 when they disagree, so a parameterless template needs the
  // `components` key *absent*, not present and empty. This is the shape that
  // `hello_world` takes, and `hello_world` is what proves a live provider path
  // before the club's own template has cleared approval.
  //
  // It carries no RSVP link, because there is nowhere in a parameterless
  // template to put one. That is a real limitation of this shape and not an
  // oversight here: a message sent this way demonstrates that delivery works
  // and demonstrates nothing else.
  const kind = message.kind ?? "invitation";
  const templateName = templateNameFor(kind, config);

  if (config.templateParameters === "none") {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: config.templateLanguage },
      },
    };
  }

  // The approved template's body parameters, in the order `./templates.ts`
  // declares for this kind. The club creates each template to match that
  // contract; the order is part of the handoff, and it is declared in one place
  // rather than written out here so the local sink can validate against the
  // same declaration the adapter sent from — which is what makes a reordering
  // fail on a developer machine instead of arriving at Meta as `132000`, or
  // worse, arriving at a player as a correctly-delivered message with its
  // sentences swapped.
  const template = templateFor(message);
  const components: Record<string, unknown>[] = [];

  // The body component only when the approved template declares body variables.
  //
  // `recruit_details_reminder` declares none, and an empty `parameters` array
  // against a template with no variables is the same disagreement Meta answers
  // `132000` to as a wrong count — the rule the parameterless branch above
  // states for the whole message applies per component too. Nothing local
  // caught it, because the sink validates against this registry rather than
  // against Meta.
  const bodyParameters = template.parameters(message);
  if (bodyParameters.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParameters.map((text) => ({ type: "text", text })),
    });
  }

  // The buttons the approved template declares, in its own index order.
  //
  // Meta's button component takes only the URL's *dynamic suffix* — the
  // approved template supplies the fixed prefix — so the token, and nothing
  // else, is what gets sent as each button's parameter. A static button
  // (`escalation`'s follow-up queue) carries no parameter and therefore needs
  // no component at all, which is why `index` counts across every button while
  // the URLs are consumed only by the dynamic ones.
  //
  // Walked from `whatsapp.buttons` rather than assumed to be a Yes/No pair:
  // that assumption is what kept `nudge`, `change_notice` and `escalation`
  // putting raw URLs in body text, where a link is a variable that barely
  // varies and the player loses the one-tap journey the rest of the ladder has.
  const urls = template.buttonUrls?.(message) ?? [];
  let urlIndex = 0;
  template.whatsapp.buttons.forEach((button, index) => {
    if (!button.dynamic) return;
    const url = urls[urlIndex++];
    if (url === undefined) {
      throw new Error(
        `The approved ${message.kind ?? "invitation"} template declares a dynamic button ` +
          `at index ${index} and no URL was resolved for it. Refusing to send a template ` +
          "whose button would arrive without its one-time token.",
      );
    }
    components.push({
      type: "button",
      sub_type: "url",
      index: String(index),
      parameters: [{ type: "text", text: suffixFor(url, button.path) }],
    });
  });

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: config.templateLanguage },
      components,
    },
  };
}

/**
 * The part of a resolved URL that Meta appends to the approved button.
 *
 * Taken against the button's own declared `path` rather than guessed as the
 * last path segment. The guess only ever worked for a token sitting at the end
 * of a path; the escalation's button carries its suffix in a query string
 * (`?event=<id>`), where the last path segment is the route's own name and the
 * guess would have sent "follow-ups" to Meta as the variable.
 */
function suffixFor(url: string, path: string): string {
  const at = url.indexOf(path);
  if (at === -1) {
    throw new Error(
      "A button URL was resolved that does not contain the path its approved template declares. " +
        "Refusing to send a suffix Meta would append to a different destination.",
    );
  }
  return url.slice(at + path.length);
}

/** Meta's success shape, as far as this adapter is willing to look at it. */
interface AcceptedBody {
  messages?: { id?: unknown }[];
}

/** Meta's error shape, likewise. */
interface ErrorBody {
  error?: {
    code?: unknown;
    message?: unknown;
    error_subcode?: unknown;
    fbtrace_id?: unknown;
  };
}

/**
 * Turns one Graph response into an outcome.
 *
 * Pure and exported, so every branch — accepted, refused with a known code,
 * refused with an unknown code, malformed body, 5xx — is testable without a
 * transport at all.
 */
export function interpretResponse(status: number, body: unknown): SendOutcome {
  const error = (body as ErrorBody | null)?.error;

  if (status >= 200 && status < 300 && !error) {
    const id = (body as AcceptedBody | null)?.messages?.[0]?.id;
    if (typeof id === "string" && id !== "") {
      return { status: "accepted", providerMessageId: id };
    }
    // A 2xx with no message identifier is not a success this system can use:
    // without the identifier no callback can ever be matched to this attempt,
    // so the message would be permanently stuck at "attempted".
    return {
      status: "refused",
      reason:
        "The provider accepted the message but returned no message identifier, " +
        "so its delivery could not be tracked. Nothing is known to have been sent.",
      retryable: true,
    };
  }

  const code = typeof error?.code === "number" ? error.code : 0;
  const trace =
    typeof error?.fbtrace_id === "string" ? ` (provider reference ${error.fbtrace_id})` : "";

  if (error) {
    return {
      status: "refused",
      reason: `${reasonFor(code, "This needs the club's administrator.")}${trace}`,
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
export function createWhatsAppCloudProvider(
  config: OutboundConfig,
  transport: Transport = fetch,
): DeliveryProvider {
  return {
    name: WHATSAPP_CLOUD_PROVIDER,
    channel: "whatsapp",

    async send(message: InvitationMessage): Promise<SendOutcome> {
      // LAN-124. The service layer refuses a recipient outside the allowlist
      // before it mints a token, and this is the same refusal at the last point
      // it can be made: the statement immediately below opens a connection to
      // Meta. The duplication is deliberate — the check above protects the
      // workflow, and this one protects the egress from any future caller that
      // reaches the adapter without going through `claimNextJobIn`.
      //
      // `localTest.recipientOverride` is checked rather than `message.recipient`
      // where one is set, because the override is the number that would
      // actually be dialled; allowing an unlisted override would be a hole in
      // the shape of a test affordance.
      const dialled = config.localTest.recipientOverride ?? message.recipient;
      if (!recipientPermitted(dialled, config.recipientAllowlist, config.defaultCallingCode)) {
        return {
          status: "refused",
          reason: RECIPIENT_NOT_PERMITTED_REASON,
          // Not retryable: retrying changes nothing until the allowlist does,
          // and a retryable refusal would put the job back in the queue to be
          // refused again on a schedule.
          retryable: false,
        };
      }

      let response: Response;
      try {
        response = await transport(messagesEndpoint(config), {
          method: "POST",
          headers: {
            // The one place this credential is used. Never logged, never stored.
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildMessageBody(config, message)),
          // Approval awaits dispatch, one invitee at a time, inside a Server
          // Action. Without a deadline a single hung provider connection holds
          // an operator's approval open for as long as the platform allows —
          // multiplied by the number of people being invited. A timeout is a
          // transport failure, which is retryable, so the invitation is not
          // lost by giving up on it.
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
      } catch (error) {
        // A DNS failure, a TLS failure, a timeout. Retryable by definition, and
        // the driver's text is redacted because a proxy error can quote a URL.
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
        // Left null; `interpretResponse` treats a bodyless response by status.
      }

      const outcome = interpretResponse(response.status, body);
      return outcome.status === "refused"
        ? { ...outcome, reason: redactDigits(outcome.reason) }
        : outcome;
    },
  };
}

// ---------------------------------------------------------------------------
// Inbound callbacks
// ---------------------------------------------------------------------------

/**
 * Verifies Meta's `X-Hub-Signature-256` over the **raw** request body.
 *
 * Three things here are load-bearing:
 *
 *   * **The raw body, not the parsed one.** Re-serialising JSON changes byte
 *     order and whitespace, and the signature is over bytes. A route that
 *     reads `await request.json()` and then stringifies it cannot verify
 *     anything, and will appear to work right up until Meta reorders a key.
 *
 *   * **`timingSafeEqual`.** A `===` on a hex digest leaks, through timing, how
 *     many leading characters of a forged signature were right, which is enough
 *     to construct one. The length check first is required because
 *     `timingSafeEqual` throws on unequal lengths.
 *
 *   * **It runs before the body is parsed at all.** An unverified payload is
 *     never inspected, never stored and never acted on.
 */
export function verifyWebhookSignature(
  rawBody: string,
  header: string | null,
  config: WebhookConfig,
): boolean {
  if (!header) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", config.appSecret)
    .update(rawBody, "utf8")
    .digest("hex")}`;

  const given = Buffer.from(header, "utf8");
  const mine = Buffer.from(expected, "utf8");
  if (given.length !== mine.length) return false;

  return crypto.timingSafeEqual(given, mine);
}

/** Meta's status vocabulary, mapped onto the frozen model's four outcomes. */
function outcomeFor(status: string): ProviderCallbackEvent["outcome"] {
  switch (status) {
    case "delivered":
      return "delivered";
    case "failed":
      return "failed";
    // `sent` and `read` are real transitions with no `delivery_outcome` value.
    // Widening that enum is a frozen-model change, so they are stored as
    // evidence and applied to nothing. See `delivery_callbacks.ignored_reason`.
    default:
      return null;
  }
}

/**
 * Extracts every status transition from one callback payload.
 *
 * Meta batches: one POST carries `entry[].changes[].value.statuses[]`, and each
 * status is independently deduplicated by its own identifier. Anything
 * unrecognised yields no events rather than an exception — a webhook that 500s
 * because the provider added a field is a webhook the provider will retry
 * forever.
 */
export function parseCallbackPayload(payload: unknown): ProviderCallbackEvent[] {
  const events: ProviderCallbackEvent[] = [];
  const entries = (payload as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return events;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: unknown } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;

      for (const status of statuses) {
        const row = status as {
          id?: unknown;
          status?: unknown;
          timestamp?: unknown;
          errors?: { code?: unknown; title?: unknown }[];
        };
        if (typeof row.id !== "string" || row.id === "") continue;

        const state = typeof row.status === "string" ? row.status : "";
        const failure = Array.isArray(row.errors) ? row.errors[0] : undefined;
        const code = typeof failure?.code === "number" ? failure.code : 0;

        events.push({
          // Meta reuses the message identifier across its status transitions,
          // so the message alone is not a deduplication key — "delivered" and
          // "read" for one message share it. The pair is unique.
          providerEventId: `${row.id}:${state}`,
          providerMessageId: row.id,
          providerStatus: state === "" ? null : state,
          outcome: outcomeFor(state),
          detail: failure
            ? redactDigits(reasonFor(code, "The provider gave no further detail."))
            : null,
        });
      }
    }
  }

  return events;
}
