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

/**
 * How many body parameters the configured template takes.
 *
 * LAN-124. A template is not a free-form message: Meta matches the parameters
 * sent against the parameters the approved template declares, and refuses the
 * message with `132000` when they disagree. The club's invitation template
 * takes four; Meta's pre-approved `hello_world` takes none. One adapter has to
 * be able to send either, and it cannot infer which from the template's name.
 */
export type TemplateParameterShape = "invitation" | "none";

/**
 * Reads the shape, defaulting to the club's own template.
 *
 * The default matters more than it looks. `invitation` is the shape that
 * carries the RSVP link, so an unset or misspelled value resolves to the
 * message that does the real work rather than to the one that does not. A
 * deployment that quietly fell back to `none` would send invitations nobody
 * could answer, and every one of them would be reported as delivered.
 */
export function templateShape(source: EnvironmentSource = process.env): TemplateParameterShape {
  return trimmed("WHATSAPP_TEMPLATE_PARAMETERS", source).toLowerCase() === "none"
    ? "none"
    : "invitation";
}

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
   * The shape of the template's body parameters.
   *
   * `invitation` is the club's own template and the only shape that carries an
   * RSVP link: four body parameters, in the order the adapter builds them.
   *
   * `none` sends a template with no parameters at all. It exists for exactly
   * one situation — proving a live provider path with Meta's pre-approved
   * `hello_world`, which takes none and answers `132000` to anything that sends
   * some. A message sent this way **carries no RSVP link**, so it demonstrates
   * that delivery works and demonstrates nothing else. See `templateShape`.
   */
  readonly templateParameters: TemplateParameterShape;
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

/**
 * Variables the email path refuses to run without. LAN-169.
 *
 * `DELIVERY_EMAIL_ALLOWLIST` is here for exactly the reason
 * `DELIVERY_RECIPIENT_ALLOWLIST` is in the outbound list: it is the one
 * variable whose absence would *widen* what the deployment does. An absent
 * email allowlist meaning "email anybody" would make the fallback channel the
 * one hole in a control the club relies on, and the fallback is automatic —
 * nobody presses anything before it sends.
 */
export const EMAIL_ENVIRONMENT_VARIABLES = Object.freeze([
  "EMAIL_API_KEY",
  "EMAIL_FROM_ADDRESS",
  "DELIVERY_EMAIL_ALLOWLIST",
] as const);

/** Variables with a safe, non-secret default. Absence is not a refusal. */
const DEFAULTS = Object.freeze({
  WHATSAPP_GRAPH_BASE_URL: "https://graph.facebook.com",
  // LAN-169, mission decision Q-1/Q-2: target the latest Graph version Meta
  // supports rather than the version this was pinned at when LAN-92 wrote it.
  // Meta retires a version roughly two years after release and answers a
  // retired one with an error rather than a redirect, so a pin that is never
  // moved becomes an outage on a date nobody has in a calendar. The value is
  // still a variable, so a deployment that needs to hold a version can.
  WHATSAPP_GRAPH_VERSION: "v26.0",
  WHATSAPP_TEMPLATE_LANGUAGE: "en_GB",
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
  const loopback = isLoopbackBaseUrl(appBaseUrl);

  // LAN-124, 17 August 2026, Brian's decision, taken in front of the failure
  // that forced it. Meta declined to deliver our template with `131049` — the
  // per-recipient throttle on marketing-category templates — having accepted
  // the API call and returned a message id. A utility-category template would
  // pass, and creating one means going through Meta's review, which the
  // walkthrough could not wait for.
  //
  // Free-form text has no category and no review. Meta permits it inside a
  // 24-hour service window that the *recipient* opens by messaging the number
  // first, which is a thing two people can do and forty-two cannot.
  //
  // So this is opt-in, explicit, and separate from `WHATSAPP_MESSAGE_MODE`:
  // setting the mode alone still does nothing off loopback. Both are required.
  //
  // What makes it acceptable is not this flag. It is
  // `DELIVERY_RECIPIENT_ALLOWLIST`, which is required, fails closed, and is
  // enforced twice — before a token is minted and again at the egress. This
  // deployment can free-form text exactly the two people on that list, and a
  // message outside a service window is refused by Meta with `131047` rather
  // than delivered.
  const freeFormAllowed = trimmed("WHATSAPP_ALLOW_FREE_FORM", source).toLowerCase() === "true";

  if (!loopback && !freeFormAllowed) {
    return { recipientOverride: null, messageMode: "template" };
  }

  const mode = trimmed("WHATSAPP_MESSAGE_MODE", source).toLowerCase();
  const messageMode: LocalTestOverrides["messageMode"] = mode === "text" ? "text" : "template";

  // The recipient override stays loopback-only, and deliberately so. Redirecting
  // every message to one number is a development affordance; there is no reading
  // under which a deployed revision should silently send somebody else's message
  // to a different handset.
  if (!loopback) return { recipientOverride: null, messageMode };

  const recipient = trimmed("WHATSAPP_TEST_RECIPIENT", source).replace(/[^0-9]/g, "");

  return {
    recipientOverride: recipient === "" ? null : recipient,
    messageMode,
  };
}

/**
 * The default calling code for a national-format number — `"44"` unless
 * overridden — with its safe, non-secret default applied.
 *
 * LAN-171. Exported on its own, separate from `resolveOutboundConfig`, because
 * a caller that only needs to know whether one person's own recorded number
 * converts — the pre-approval WhatsApp-reachability check `event-approval.ts`
 * runs for every audience member — must not be gated on the deployment's
 * outbound secrets being present. The calling code carries no secret and
 * already has a sensible default; folding this into `configured: true` would
 * report a real "this person has no usable number" fact as "deployment not
 * configured" on every developer machine and every CI run, which is exactly
 * where that check has to work.
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
      templateParameters: templateShape(source),
      localTest: resolveLocalTestOverrides(appBaseUrl, source),
    },
  };
}

/**
 * Resolves the email configuration, or names what is absent. LAN-169.
 *
 * A third readiness question with its own answer, for the reason the other two
 * are separate: a deployment can legitimately have WhatsApp and not email while
 * the club's sending domain is still being verified, and demanding all three
 * before any of them works would make that state impossible to configure
 * honestly. An unconfigured email path records a failed, retryable attempt
 * naming the missing settings and sends nothing.
 */
export function resolveEmailConfig(source: EnvironmentSource = process.env): EmailResolution {
  const missing = EMAIL_ENVIRONMENT_VARIABLES.filter((name) => trimmed(name, source) === "");
  if (missing.length > 0) return { configured: false, missing };

  const appBaseUrl = trimmed("APP_BASE_URL", source).replace(/\/+$/, "");

  // Parsed before the configuration is declared complete, exactly as the
  // telephone allowlist is: an allowlist of "," is present as a string and
  // absent as a control, and treating it as configured would produce a
  // deployment that refuses every recipient while reporting itself ready.
  const recipientAllowlist = parseEmailAllowlist(trimmed("DELIVERY_EMAIL_ALLOWLIST", source));
  if (recipientAllowlist.length === 0) {
    return { configured: false, missing: ["DELIVERY_EMAIL_ALLOWLIST"] };
  }

  const replyTo = trimmed("EMAIL_REPLY_TO", source);

  // Loopback-only, and the same guard `resolveLocalTestOverrides` applies for
  // the same reason: redirecting every message to one inbox is a development
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
 * Comma, semicolon and newline separate; the space does not, for the same
 * reason it does not in the telephone allowlist. Sorted and deduplicated so two
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

/**
 * The WhatsApp/email answer link for one one-time token — LAN-172, Q-11.
 *
 * The only place a player-answer token becomes a URL, for the same reason
 * `rsvpUrl` is the only place its token does: one reader for the base URL
 * means no route, adapter or template string anywhere else can grow a
 * hard-coded host. `app.oxfordlancers.com` is the decided permanent host
 * (Q-14), but it is still read from `APP_BASE_URL` here, never inlined — a
 * local or review deployment keeps its own configured host.
 */
export function playerAnswerUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/a/${encodeURIComponent(token)}`;
}

/** The player's own durable page for one season — LAN-172. */
export function playerHomeUrl(appBaseUrl: string, token: string): string {
  return `${appBaseUrl.replace(/\/+$/, "")}/me/${encodeURIComponent(token)}`;
}
