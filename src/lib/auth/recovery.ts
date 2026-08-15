/**
 * Password recovery — the whole contract in one module, LAN-125.
 *
 * Everything here is a pure function or a constant so that the route handler,
 * the two server actions, the three screens and the test suite all read the
 * same rules. Nothing in this file touches Supabase, cookies or the network;
 * the callers do that.
 *
 * ## The flow this repository implements, and why it is that one
 *
 * Supabase offers two recovery shapes and they are not interchangeable here.
 *
 *   * **PKCE.** `resetPasswordForEmail` from a cookie-backed client stores a
 *     code verifier in the browser, and the emailed link comes back as
 *     `?code=…` which only that same browser can exchange. `@supabase/ssr`
 *     hard-codes `flowType: "pkce"` *after* spreading caller options, so any
 *     client built by `createServerClient` is a PKCE client whether you ask for
 *     one or not.
 *
 *   * **Token hash.** No verifier, no cookie, no browser affinity: the email
 *     carries a one-time token hash which any device can present to
 *     `verifyOtp({ type: "recovery", token_hash })`.
 *
 * This club's operators request a reset on whatever is to hand and open the
 * email on a phone. PKCE fails that, silently, with an invalid-link screen the
 * person cannot act on. So the request is made through a **stateless** Supabase
 * client — no cookies, `flowType: "implicit"`, so no PKCE flow state is created
 * — and the recovery email is templated to carry `{{ .TokenHash }}` to
 * `/auth/recovery` on this origin. `supabase/templates/recovery.html` is that
 * template, and `RECOVERY_CALLBACK_PATH` is that path.
 *
 * Building the request client with `createServerClient` would still send an
 * email and still look correct in the confirmation screen; the link would then
 * arrive as `?code=` and the callback would refuse every one of them. That is
 * why `src/app/forgot-password/actions.ts` builds its own client and says so.
 *
 * ## Enumeration safety
 *
 * `resetPasswordForEmail` answers in ~10 ms for an address with no account and
 * in ~60 ms for one that has, because the second sends mail. Measured on this
 * repository's local stack. Copy, status and markup being identical is
 * therefore not enough on its own — the clock is a side channel too — so the
 * public response is held to a fixed floor and then quantised, and every
 * outcome (success, unknown address, provider refusal, rate limit, an origin
 * this deployment has not been configured with) returns
 * `PUBLIC_RECOVERY_CONFIRMATION` and nothing else.
 */

import { safeRelativeDestination } from "./destination";

/** The public product route that asks for an address. */
export const FORGOT_PASSWORD_PATH = "/forgot-password";

/** The public product route that sets the new password. */
export const RESET_PASSWORD_PATH = "/reset-password";

/**
 * The internal route the emailed link enters through. It exists because a
 * Server Component cannot write cookies and `verifyOtp` must, so the exchange
 * happens in a Route Handler which then redirects to `RESET_PASSWORD_PATH`
 * with the token stripped from the address bar.
 *
 * This exact path, on each origin the application answers on, is what
 * `supabase/config.toml` allow-lists locally and what Brian allow-lists in the
 * hosted dashboard. `tests/auth-recovery-configuration.test.ts` asserts the
 * two agree.
 */
export const RECOVERY_CALLBACK_PATH = "/auth/recovery";

/** `type` on the emailed link. Anything else is refused without a round trip. */
export const RECOVERY_LINK_TYPE = "recovery";

/**
 * The one public answer `/forgot-password` ever gives.
 *
 * It deliberately does not claim an email was sent — because for an unknown
 * address none was, and a message that says "sent" is an account oracle
 * written in prose.
 */
export const PUBLIC_RECOVERY_CONFIRMATION =
  "If an account exists for that email address, the club will send password-reset instructions. " +
  "Check your inbox, and your spam folder, then follow the link to choose a new password.";

/** Shown when the recovery context is missing, spent, expired or the wrong type. */
export const INVALID_RECOVERY_LINK_MESSAGE =
  "This password-reset link is no longer valid. Reset links can be used once and expire after a " +
  "short time. Request a new one and use the most recent email.";

/**
 * The configured minimum, mirroring `[auth].minimum_password_length` in
 * `supabase/config.toml`. `tests/auth-recovery-configuration.test.ts` reads the
 * TOML and fails if the two ever drift, which is the only thing keeping the
 * hint the operator reads honest.
 */
export const MINIMUM_PASSWORD_LENGTH = 8;

/** What the form tells the operator, derived so it cannot contradict the rule. */
export const PASSWORD_POLICY_HINT = `At least ${MINIMUM_PASSWORD_LENGTH} characters. No other requirement — length is what helps.`;

export const PASSWORD_TOO_SHORT_MESSAGE = `Choose a password of at least ${MINIMUM_PASSWORD_LENGTH} characters.`;

export const PASSWORD_MISMATCH_MESSAGE =
  "The two passwords do not match. Enter the same one twice.";

/**
 * The repository's own password rule, applied wherever a password is chosen.
 *
 * Run in the browser for immediate feedback and again in the server action,
 * independently, because the first is a courtesy and only the second is a
 * control. Supabase applies `minimum_password_length` a third time and is the
 * final word — this returns before the network so the operator is not made to
 * wait to be told they typed it twice differently.
 *
 * Returns the message to show, or `null` when the password is acceptable. It
 * never returns, logs or echoes the password itself.
 */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MINIMUM_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE;
  if (password !== confirmation) return PASSWORD_MISMATCH_MESSAGE;
  return null;
}

/**
 * Ordinary field validation, and nothing more.
 *
 * It refuses what cannot be an address at all so the operator gets a useful
 * message instead of a confirmation for a typo they can see. It stays coarse on
 * purpose: anything that reaches Supabase, including an address that is
 * well-formed and has no account, gets the uniform confirmation, so a strict
 * pattern here would turn "this looks unusual" into an account oracle.
 */
export function looksLikeEmailAddress(value: string): boolean {
  if (value.length === 0 || value.length > 320) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  return (
    domain.length > 2 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".")
  );
}

/**
 * A shape check on the emailed token hash, before any network call.
 *
 * GoTrue issues lowercase hexadecimal. Refusing anything else costs nothing,
 * keeps a hostile query string out of an outbound request body, and makes the
 * "malformed link" branch reachable in a test without inventing a Supabase
 * failure. It is not a validation of the token — only Supabase can do that, and
 * only once.
 */
export function isPlausibleRecoveryTokenHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{20,128}$/.test(value);
}

/** The `amr` entry shape Supabase puts in a verified access token. */
type AuthenticationMethodReference = { method?: unknown } | string;

/**
 * Did *this* session come from a recovery link?
 *
 * Supabase records how a session was authenticated in the verified token's
 * `amr` claim: `password` for `signInWithPassword`, `otp` for a recovery
 * `verifyOtp`. This application enables no other passwordless method — no magic
 * link, no email OTP, no OAuth, no MFA — so `otp` here means recovery and
 * nothing else, and `tests/auth-recovery-flow.test.ts` pins both halves of that
 * claim against the real Auth server.
 *
 * The check exists because the alternative fails open: a recovery link produces
 * an ordinary Supabase session, so `/reset-password` guarded only by "is
 * someone signed in?" would let anybody who is already signed in — on a shared
 * committee laptop, say — set a new password without knowing the current one.
 */
export function isRecoveryAuthenticatedSession(claims: unknown): boolean {
  const amr = (claims as { amr?: unknown } | null | undefined)?.amr;
  if (!Array.isArray(amr) || amr.length === 0) return false;

  return amr.some((entry: AuthenticationMethodReference) => {
    const method = typeof entry === "string" ? entry : entry?.method;
    return method === "otp";
  });
}

/**
 * The trusted origin recovery links are built from.
 *
 * Not the `Host` header on a deployed environment: a request can carry any
 * host, and a recovery link is the one email in this application whose
 * destination is worth stealing. So:
 *
 *   1. `APP_BASE_URL`, the value this repository already uses for the one other
 *      absolute link it sends (the RSVP link, LAN-78), when it is set;
 *   2. otherwise the request's own origin **only if it is loopback**, which is
 *      what makes a developer machine and the zero-command review environment
 *      work with no configuration at all;
 *   3. otherwise nothing, and the caller sends no email while still returning
 *      the uniform confirmation.
 *
 * Supabase's own redirect allow-list is the second line and not the first: an
 * origin it does not recognise is silently replaced with the project's Site
 * URL, so a spoofed host cannot receive a link even if this function were
 * bypassed. Both are in place deliberately.
 */
export function resolveRecoveryOrigin(input: {
  appBaseUrl?: string | null;
  requestOrigin?: string | null;
}): string | null {
  const configured = normaliseOrigin(input.appBaseUrl);
  if (configured) return configured;

  const requested = normaliseOrigin(input.requestOrigin);
  if (requested && isLoopbackOrigin(requested)) return requested;

  return null;
}

function normaliseOrigin(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed === "") return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string): boolean {
  const host = new URL(origin).hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".localhost")
  );
}

/** The absolute URL handed to `resetPasswordForEmail`, or `null` if unconfigured. */
export function recoveryCallbackUrl(input: {
  appBaseUrl?: string | null;
  requestOrigin?: string | null;
}): string | null {
  const origin = resolveRecoveryOrigin(input);
  return origin === null ? null : `${origin}${RECOVERY_CALLBACK_PATH}`;
}

/** Where the recovery journey lands once the new password is set. */
export function recoveryCompletionDestination(redirectTo: unknown): string {
  const destination = safeRelativeDestination(redirectTo);
  const query = new URLSearchParams({ reset: "1" });
  if (destination !== "/operate") query.set("redirectTo", destination);
  return `/login?${query.toString()}`;
}

/**
 * How long the public forgot-password response must take.
 *
 * A floor alone leaves a tail: a slow SMTP hand-off on the account-exists path
 * could still overhang it. Quantising on top bounds what a stopwatch can learn
 * to "which 250 ms bucket", whatever the work underneath took.
 */
export const PUBLIC_RESPONSE_FLOOR_MS = 750;
export const PUBLIC_RESPONSE_QUANTUM_MS = 250;

/** Milliseconds still owed after `elapsedMs` of real work. Never negative. */
export function remainingPublicResponseDelayMs(
  elapsedMs: number,
  floorMs: number = PUBLIC_RESPONSE_FLOOR_MS,
  quantumMs: number = PUBLIC_RESPONSE_QUANTUM_MS,
): number {
  const buckets = Math.floor(Math.max(0, elapsedMs) / quantumMs) + 1;
  const target = Math.max(floorMs, buckets * quantumMs);
  return Math.max(0, target - elapsedMs);
}
