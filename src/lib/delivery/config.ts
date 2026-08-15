import "server-only";

import { parseRecipientAllowlist, RECIPIENT_ALLOWLIST_VARIABLE } from "./allowlist";

/**
 * Delivery configuration, read from the environment and from nowhere else.
 *
 * LAN-78. Two rules govern this file, and both come from the working agreement
 * rather than from taste:
 *
 *   * **No hard-coded host and no hard-coded secret.** The application's own
 *     base URL, the Graph host, the phone-number identifier, the template and
 *     every credential arrive as environment variables. Locally they come from
 *     `.env.local`; in Cloud Run the secrets come from Secret Manager at
 *     runtime. `.env.example` carries placeholders and nothing else.
 *
 *   * **A missing value is a refusal, never a default.** There is no fallback
 *     access token, no default template name and no "if unset, log and
 *     continue". An unconfigured deployment records a failed, retryable
 *     delivery attempt naming the settings that are absent — by name, never by
 *     value — and sends nothing. Sending to a guessed number is worse than not
 *     sending at all.
 *
 * ## Why outbound and inbound are resolved separately
 *
 * Sending needs the base URL, the phone-number identifier, the access token and
 * the template. Receiving a callback needs the app secret and the subscription
 * verify token, and needs neither of the first two. Demanding all six before
 * either half works would make an outbound-only deployment — which is exactly
 * what the non-production test path is, while LAN-93 still owes the public
 * endpoint — impossible to configure honestly.
 *
 * So there are two readiness questions and two answers, and each half fails
 * closed on its own.
 *
 * ## Why the result is a union rather than an exception
 *
 * The unconfigured case is expected, not exceptional: every developer machine
 * and every CI run is unconfigured, and the delivery path still has to behave
 * sensibly there. Returning `{ configured: false, missing }` lets the
 * dispatcher record an honest failure against the job, which is what the
 * operator's **Failed / Retryable** state is for. An exception would either be
 * swallowed or would take down a request that had already committed an
 * approval.
 *
 * ## What must never happen to these values
 *
 * `accessToken`, `appSecret` and `webhookVerifyToken` are secrets. They are
 * never rendered, never returned from a Server Action, never written to
 * `delivery_attempts.failure_reason`, never put in an audit row and never
 * logged — not even truncated. `describeMissingConfiguration()` below names the
 * variables that are absent, which is the only safe thing to say about them.
 */

/**
 * The environment, as this module is willing to read it.
 *
 * Deliberately looser than `NodeJS.ProcessEnv`, which requires `NODE_ENV` and
 * so cannot be satisfied by a test's small literal. Every caller passes either
 * `process.env` or an object built for one case, and nothing here reads a
 * variable this file does not name.
 */
export type EnvironmentSource = Record<string, string | undefined>;

/** What the Meta Cloud API adapter needs in order to send. */
export interface OutboundConfig {
  /** Where this deployment answers, e.g. `https://…`. No trailing slash. */
  readonly appBaseUrl: string;
  /** The default calling code for a national-format number, e.g. `44`. */
  readonly defaultCallingCode: string;
  /** Graph host, without a trailing slash. Configurable so a test can point elsewhere. */
  readonly graphBaseUrl: string;
  /** Graph API version segment, e.g. `v21.0`. */
  readonly graphVersion: string;
  /** The WhatsApp Business phone-number identifier the message is sent from. */
  readonly phoneNumberId: string;
  /** Secret. The Cloud API access token. */
  readonly accessToken: string;
  /** The approved message template's name. */
  readonly templateName: string;
  /** The approved template's language code, e.g. `en_GB`. */
  readonly templateLanguage: string;
  /**
   * The only telephone numbers this deployment may send to, in E.164 digits.
   *
   * Never empty on a configured deployment: an allowlist that parsed to nothing
   * is treated as absent, so `resolveOutboundConfig` returns
   * `{ configured: false }` rather than a configuration permitting nobody. See
   * `allowlist.ts`.
   */
  readonly recipientAllowlist: readonly string[];
  /**
   * Local-only test affordances, resolved to their inert values unless
   * `appBaseUrl` is a loopback host. See `resolveLocalTestOverrides`.
   */
  readonly localTest: LocalTestOverrides;
}

/** What verifying and answering an inbound callback needs. */
export interface WebhookConfig {
  /** Secret. Used to verify `X-Hub-Signature-256` on inbound callbacks. */
  readonly appSecret: string;
  /** Secret. Echoed back during Meta's webhook subscription handshake. */
  readonly webhookVerifyToken: string;
}

/**
 * The two affordances that make a live non-production send possible, and the
 * single condition under which either exists.
 *
 * Meta's test number cannot reach the club's synthetic roster — those numbers
 * are in Ofcom's reserved drama range and are unroutable by design — and it can
 * only send free-form text inside a customer-service window the recipient
 * opened. Proving the adapter against the real Graph API therefore needs a
 * recipient override and a message-type override.
 *
 * Both are read **only when `appBaseUrl` is loopback**. Not "only when NODE_ENV
 * is development", which a deployment can set by accident, and not behind a
 * flag somebody could turn on in production: the base URL is the address the
 * application tells the world to visit, so a deployment that has one cannot
 * also be a loopback deployment. In a deployed environment these resolve to
 * `{ recipientOverride: null, messageMode: "template" }` whatever the
 * environment says, and a test asserts exactly that.
 */
export interface LocalTestOverrides {
  /** E.164 digits the message is redirected to. Never set outside loopback. */
  readonly recipientOverride: string | null;
  /**
   * `template` is the only production shape — an invitation is business-
   * initiated and Meta requires an approved template for that. `text` exists
   * for the loopback test path alone.
   */
  readonly messageMode: "template" | "text";
}

export type OutboundResolution =
  | { readonly configured: true; readonly config: OutboundConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

export type WebhookResolution =
  | { readonly configured: true; readonly config: WebhookConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

/**
 * Variables the sending path refuses to run without.
 *
 * `DELIVERY_RECIPIENT_ALLOWLIST` is here rather than among the defaults for the
 * reason the whole file is built on: a missing value is a refusal, never a
 * default. An absent allowlist that meant "send to everybody" would be the one
 * variable in this list whose absence *widened* what the deployment does. See
 * `allowlist.ts`.
 */
export const OUTBOUND_ENVIRONMENT_VARIABLES = Object.freeze([
  "APP_BASE_URL",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_TEMPLATE_NAME",
  RECIPIENT_ALLOWLIST_VARIABLE,
] as const);

/** Variables the callback path refuses to run without. */
export const WEBHOOK_ENVIRONMENT_VARIABLES = Object.freeze([
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
] as const);

/** Variables with a safe, non-secret default. Absence is not a refusal. */
const DEFAULTS = Object.freeze({
  WHATSAPP_GRAPH_BASE_URL: "https://graph.facebook.com",
  WHATSAPP_GRAPH_VERSION: "v21.0",
  WHATSAPP_TEMPLATE_LANGUAGE: "en_GB",
  DELIVERY_DEFAULT_CALLING_CODE: "44",
});

function trimmed(name: string, source: EnvironmentSource): string {
  return (source[name] ?? "").trim();
}

function withDefault(name: keyof typeof DEFAULTS, source: EnvironmentSource): string {
  const value = trimmed(name, source);
  return value === "" ? DEFAULTS[name] : value;
}

/**
 * Is this base URL a loopback address?
 *
 * Parsed rather than pattern-matched. `https://localhost.example.com` contains
 * the string "localhost" and is emphatically not loopback, and a hand-written
 * regular expression is how that gets missed.
 */
export function isLoopbackBaseUrl(appBaseUrl: string): boolean {
  let host: string;
  try {
    host = new URL(appBaseUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

/**
 * The local test overrides, or the inert pair.
 *
 * Exported so the guard can be tested directly with a deployed-looking base URL
 * and a fully populated environment — which is the case that matters, and the
 * one an integration test cannot reach.
 */
export function resolveLocalTestOverrides(
  appBaseUrl: string,
  source: EnvironmentSource = process.env,
): LocalTestOverrides {
  if (!isLoopbackBaseUrl(appBaseUrl)) {
    return { recipientOverride: null, messageMode: "template" };
  }

  const recipient = trimmed("WHATSAPP_TEST_RECIPIENT", source).replace(/[^0-9]/g, "");
  const mode = trimmed("WHATSAPP_MESSAGE_MODE", source).toLowerCase();

  return {
    recipientOverride: recipient === "" ? null : recipient,
    messageMode: mode === "text" ? "text" : "template",
  };
}

/**
 * Resolves the outbound configuration, or names what is absent.
 *
 * Takes the environment as an argument so a test can supply one without
 * mutating the process — a suite that writes `process.env` leaks into every
 * other suite sharing the worker.
 */
export function resolveOutboundConfig(source: EnvironmentSource = process.env): OutboundResolution {
  const missing = OUTBOUND_ENVIRONMENT_VARIABLES.filter((name) => trimmed(name, source) === "");
  if (missing.length > 0) return { configured: false, missing };

  const appBaseUrl = trimmed("APP_BASE_URL", source).replace(/\/+$/, "");
  const defaultCallingCode = withDefault("DELIVERY_DEFAULT_CALLING_CODE", source).replace(
    /^\+/,
    "",
  );

  // Parsed before the configuration is declared complete, because an allowlist
  // of "," or of one unparseable entry is present as a string and absent as a
  // control. Treating it as configured would produce a deployment that refuses
  // every recipient while reporting itself ready, which is the failure this is
  // hardest to notice in.
  const recipientAllowlist = parseRecipientAllowlist(
    trimmed(RECIPIENT_ALLOWLIST_VARIABLE, source),
    defaultCallingCode,
  );
  if (recipientAllowlist.length === 0) {
    return { configured: false, missing: [RECIPIENT_ALLOWLIST_VARIABLE] };
  }

  return {
    configured: true,
    config: {
      appBaseUrl,
      recipientAllowlist,
      defaultCallingCode,
      graphBaseUrl: withDefault("WHATSAPP_GRAPH_BASE_URL", source).replace(/\/+$/, ""),
      graphVersion: withDefault("WHATSAPP_GRAPH_VERSION", source),
      phoneNumberId: trimmed("WHATSAPP_PHONE_NUMBER_ID", source),
      accessToken: trimmed("WHATSAPP_ACCESS_TOKEN", source),
      templateName: trimmed("WHATSAPP_TEMPLATE_NAME", source),
      templateLanguage: withDefault("WHATSAPP_TEMPLATE_LANGUAGE", source),
      localTest: resolveLocalTestOverrides(appBaseUrl, source),
    },
  };
}

/** Resolves the callback configuration, or names what is absent. */
export function resolveWebhookConfig(source: EnvironmentSource = process.env): WebhookResolution {
  const missing = WEBHOOK_ENVIRONMENT_VARIABLES.filter((name) => trimmed(name, source) === "");
  if (missing.length > 0) return { configured: false, missing };

  return {
    configured: true,
    config: {
      appSecret: trimmed("WHATSAPP_APP_SECRET", source),
      webhookVerifyToken: trimmed("WHATSAPP_WEBHOOK_VERIFY_TOKEN", source),
    },
  };
}

/**
 * The sentence stored against a failed attempt when delivery is not configured.
 *
 * Names the variables, never their values. It is written to
 * `delivery_attempts.failure_reason`, which an operator reads, so it also has
 * to say whose problem this is: nobody on the committee can fix an environment
 * variable, and telling them to "check the configuration" would be an
 * instruction they cannot follow.
 */
export function describeMissingConfiguration(missing: readonly string[]): string {
  return (
    "Automated delivery is not configured on this deployment, so nothing was sent. " +
    `Missing settings: ${[...missing].join(", ")}. This needs the club's administrator, ` +
    "not an operator — the invitation is unchanged and can be retried once it is set up."
  );
}

/**
 * The RSVP link for one token.
 *
 * The only place a token becomes a URL. Kept here so the base URL has exactly
 * one reader, and so no route, component or template string anywhere else can
 * grow a hard-coded host.
 */
export function rsvpUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/rsvp/${encodeURIComponent(token)}`;
}
