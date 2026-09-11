import "server-only";

import { parseRecipientAllowlist, RECIPIENT_ALLOWLIST_VARIABLE } from "./allowlist";

/**
 * Delivery configuration, read from the environment and from nowhere else.
 *
 * LAN-78, re-pointed at Twilio SMS by LAN-330. Two rules govern this file, and
 * both come from the working agreement rather than from taste:
 *
 *   * **No hard-coded host and no hard-coded secret.** The application's own
 *     base URL, the provider host, the senders and every credential arrive as
 *     environment variables. Locally they come from `.env.local`; in Cloud Run
 *     the secrets come from Secret Manager at runtime. `.env.example` carries
 *     placeholders and nothing else.
 *
 *   * **A missing value is a refusal, never a default.** There is no fallback
 *     credential, no default sender and no "if unset, log and continue". An
 *     unconfigured deployment records a failed, retryable delivery attempt
 *     naming the settings that are absent — by name, never by value — and
 *     sends nothing.
 *
 * ## Why outbound and inbound are resolved separately
 *
 * Sending needs the base URL, the account, the API key pair and the senders.
 * Verifying a status callback needs the account's Auth Token and the base URL
 * the callback was addressed to, and needs nothing else. Demanding all of it
 * before either half works would make an outbound-only deployment impossible
 * to configure honestly, so there are two readiness questions and two answers,
 * and each half fails closed on its own.
 *
 * ## What must never happen to these values
 *
 * `apiKeySecret` and `authToken` are secrets. They are never rendered, never
 * returned from a Server Action, never written to `delivery_attempts
 * .failure_reason`, never put in an audit row and never logged — not even
 * truncated. `describeMissingConfiguration()` below names the variables that
 * are absent, which is the only safe thing to say about them.
 */

/**
 * The environment, as this module is willing to read it.
 *
 * Deliberately looser than `NodeJS.ProcessEnv`, which requires `NODE_ENV` and
 * so cannot be satisfied by a test's small literal.
 */
export type EnvironmentSource = Record<string, string | undefined>;

/** What the Twilio SMS adapter needs in order to send. LAN-330. */
export interface OutboundConfig {
  /** Where this deployment answers, e.g. `https://…`. No trailing slash. */
  readonly appBaseUrl: string;
  /** The default calling code for a national-format number, e.g. `44`. */
  readonly defaultCallingCode: string;
  /** Twilio's API host, without a trailing slash. Configurable so a test can point elsewhere. */
  readonly apiBaseUrl: string;
  /** The Twilio account the messages are sent from. Not a secret, but not shown either. */
  readonly accountSid: string;
  /** The API key used for basic auth. */
  readonly apiKeySid: string;
  /** Secret. The API key's secret. */
  readonly apiKeySecret: string;
  /**
   * The US toll-free number, in E.164 with its `+`, or `null` while it is
   * unverified. `null` does not fall back to the alphanumeric sender: a `+1`
   * destination is refused with a reason an operator can read, because a
   * message from an alphanumeric sender to a US phone is never delivered.
   */
  readonly tollFreeNumber: string | null;
  /**
   * The alphanumeric sender for every other destination — `OxfLancers`,
   * Brian's choice under the eleven-character cap.
   */
  readonly alphaSender: string;
  /**
   * The only telephone numbers this deployment may send to, in E.164 digits.
   *
   * Never empty on a configured deployment: an allowlist that parsed to nothing
   * is treated as absent, so `resolveOutboundConfig` returns
   * `{ configured: false }` rather than a configuration permitting nobody. See
   * `allowlist.ts`.
   */
  readonly recipientAllowlist: readonly string[];
}

/** What verifying an inbound status callback needs. */
export interface WebhookConfig {
  /** Secret. Twilio signs callbacks with the account's Auth Token, not the API key. */
  readonly authToken: string;
  /**
   * The origin the callback was addressed to. The signature covers the full
   * URL as Twilio requested it, and behind a tunnel the request the app sees
   * carries a loopback host, so the URL is rebuilt from here rather than read
   * from the request.
   */
  readonly appBaseUrl: string;
}

/** What the email transport needs in order to send. LAN-169. */
export interface EmailConfig {
  /** Resend's API host, without a trailing slash. Configurable so a test can point elsewhere. */
  readonly apiBaseUrl: string;
  /** Secret. The provider API key. Never rendered, logged or returned. */
  readonly apiKey: string;
  /** The verified sending address, e.g. `Oxford Lancers <events@…>`. */
  readonly fromAddress: string;
  /** Where a reply goes, where the club sets one. */
  readonly replyToAddress: string | null;
  /**
   * The only addresses this deployment may email, lowercased.
   *
   * Never empty on a configured deployment: an allowlist that parsed to nothing
   * is treated as absent, so `resolveEmailConfig` returns
   * `{ configured: false }` rather than a configuration permitting nobody.
   */
  readonly recipientAllowlist: readonly string[];
  /** Loopback-only. Redirects every email to one inbox. Never set off loopback. */
  readonly recipientOverride: string | null;
}

export type OutboundResolution =
  | { readonly configured: true; readonly config: OutboundConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

export type EmailResolution =
  | { readonly configured: true; readonly config: EmailConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

export type WebhookResolution =
  | { readonly configured: true; readonly config: WebhookConfig }
  | { readonly configured: false; readonly missing: readonly string[] };

/**
 * Variables the sending path refuses to run without.
 *
 * `TWILIO_FROM_TOLL_FREE` is deliberately absent: the UK leg starts before
 * toll-free verification clears, and a `+1` destination is refused at send
 * time with a reason rather than the whole channel being unconfigured.
 *
 * `DELIVERY_RECIPIENT_ALLOWLIST` is here rather than among the defaults for the
 * reason the whole file is built on: a missing value is a refusal, never a
 * default. See `allowlist.ts`.
 */
export const OUTBOUND_ENVIRONMENT_VARIABLES = Object.freeze([
  "APP_BASE_URL",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY_SID",
  "TWILIO_API_KEY_SECRET",
  "TWILIO_ALPHA_SENDER",
  RECIPIENT_ALLOWLIST_VARIABLE,
] as const);

/** Variables the callback path refuses to run without. */
export const WEBHOOK_ENVIRONMENT_VARIABLES = Object.freeze([
  "APP_BASE_URL",
  "TWILIO_AUTH_TOKEN",
] as const);

/** The optional US sender. Read by name so the refusal can say what to set. */
export const TOLL_FREE_VARIABLE = "TWILIO_FROM_TOLL_FREE";

/**
 * Variables the email path refuses to run without. LAN-169.
 *
 * `DELIVERY_EMAIL_ALLOWLIST` is here for exactly the reason
 * `DELIVERY_RECIPIENT_ALLOWLIST` is in the outbound list: it is the one
 * variable whose absence would *widen* what the deployment does.
 */
export const EMAIL_ENVIRONMENT_VARIABLES = Object.freeze([
  "EMAIL_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "DELIVERY_EMAIL_ALLOWLIST",
] as const);

/** Variables with a safe, non-secret default. Absence is not a refusal. */
const DEFAULTS = Object.freeze({
  TWILIO_API_BASE_URL: "https://api.twilio.com",
  DELIVERY_DEFAULT_CALLING_CODE: "44",
  EMAIL_API_BASE_URL: "https://api.resend.com",
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
 * An alphanumeric sender Twilio will accept: one to eleven characters, letters,
 * digits and spaces only, at least one letter. Anything else is treated as
 * absent, because a sender the provider refuses is a channel that sends
 * nothing while reporting itself configured.
 */
export function isAlphanumericSender(value: string): boolean {
  return /^[A-Za-z0-9 ]{1,11}$/.test(value) && /[A-Za-z]/.test(value);
}

/** A toll-free number in E.164 with its `+`, or `null` for anything else. */
export function normaliseTollFreeNumber(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  if (digits === "" || !value.trim().startsWith("+")) return null;
  if (!digits.startsWith("1") || digits.length !== 11) return null;
  return `+${digits}`;
}

/**
 * The default calling code for a national-format number — `"44"` unless
 * overridden — with its safe, non-secret default applied.
 *
 * LAN-171. Exported on its own, separate from `resolveOutboundConfig`, because
 * a caller that only needs to know whether one person's own recorded number
 * converts must not be gated on the deployment's outbound secrets being
 * present.
 */
export function resolveDefaultCallingCode(source: EnvironmentSource = process.env): string {
  return withDefault("DELIVERY_DEFAULT_CALLING_CODE", source).replace(/^\+/, "");
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
  const defaultCallingCode = resolveDefaultCallingCode(source);

  const alphaSender = trimmed("TWILIO_ALPHA_SENDER", source);
  if (!isAlphanumericSender(alphaSender)) {
    return { configured: false, missing: ["TWILIO_ALPHA_SENDER"] };
  }

  // Parsed before the configuration is declared complete, because an allowlist
  // of "," or of one unparseable entry is present as a string and absent as a
  // control.
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
      defaultCallingCode,
      apiBaseUrl: withDefault("TWILIO_API_BASE_URL", source).replace(/\/+$/, ""),
      accountSid: trimmed("TWILIO_ACCOUNT_SID", source),
      apiKeySid: trimmed("TWILIO_API_KEY_SID", source),
      apiKeySecret: trimmed("TWILIO_API_KEY_SECRET", source),
      tollFreeNumber: normaliseTollFreeNumber(trimmed(TOLL_FREE_VARIABLE, source)),
      alphaSender,
      recipientAllowlist,
    },
  };
}

/**
 * Resolves the email configuration, or names what is absent. LAN-169.
 *
 * A third readiness question with its own answer: a deployment can
 * legitimately have SMS and not email while the club's sending domain is
 * still being verified.
 */
export function resolveEmailConfig(source: EnvironmentSource = process.env): EmailResolution {
  const missing = EMAIL_ENVIRONMENT_VARIABLES.filter((name) => trimmed(name, source) === "");
  if (missing.length > 0) return { configured: false, missing };

  const appBaseUrl = trimmed("APP_BASE_URL", source).replace(/\/+$/, "");

  const recipientAllowlist = parseEmailAllowlist(trimmed("DELIVERY_EMAIL_ALLOWLIST", source));
  if (recipientAllowlist.length === 0) {
    return { configured: false, missing: ["DELIVERY_EMAIL_ALLOWLIST"] };
  }

  const replyTo = trimmed("EMAIL_REPLY_TO", source);

  // Loopback-only: redirecting every message to one inbox is a development
  // affordance, and there is no reading under which a deployed revision should
  // silently send somebody else's message to a different mailbox.
  const override = isLoopbackBaseUrl(appBaseUrl) ? trimmed("EMAIL_TEST_RECIPIENT", source) : "";

  return {
    configured: true,
    config: {
      apiBaseUrl: withDefault("EMAIL_API_BASE_URL", source).replace(/\/+$/, ""),
      apiKey: trimmed("EMAIL_API_KEY", source),
      fromAddress: trimmed("EMAIL_FROM_ADDRESS", source),
      replyToAddress: replyTo === "" ? null : replyTo,
      recipientAllowlist,
      recipientOverride: override === "" ? null : override.toLowerCase(),
    },
  };
}

/**
 * Parses the email allowlist into lowercase addresses.
 *
 * Comma, semicolon and newline separate. Sorted and deduplicated so two
 * orderings produce the same allowlist.
 */
export function parseEmailAllowlist(raw: string): readonly string[] {
  const entries = raw
    .split(/[,;\n\r\s]+/)
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "" && entry.includes("@"));

  return Object.freeze([...new Set(entries)].sort());
}

/** Resolves the callback configuration, or names what is absent. */
export function resolveWebhookConfig(source: EnvironmentSource = process.env): WebhookResolution {
  const missing = WEBHOOK_ENVIRONMENT_VARIABLES.filter((name) => trimmed(name, source) === "");
  if (missing.length > 0) return { configured: false, missing };

  return {
    configured: true,
    config: {
      authToken: trimmed("TWILIO_AUTH_TOKEN", source),
      appBaseUrl: trimmed("APP_BASE_URL", source).replace(/\/+$/, ""),
    },
  };
}

/**
 * The sentence stored against a failed attempt when delivery is not configured.
 *
 * Names the variables, never their values. It is written to
 * `delivery_attempts.failure_reason`, which an operator reads, so it also has
 * to say whose problem this is.
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

/** The SMS/email answer link for one one-time token — LAN-172, Q-11. */
export function playerAnswerUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/a/${encodeURIComponent(token)}`;
}

/** The player's own durable page for one season — LAN-172. */
export function playerHomeUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/me/${encodeURIComponent(token)}`;
}
