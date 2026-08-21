/**
 * The name Supabase's auth cookie must have, and why it is not the default.
 *
 * ## The constraint
 *
 * `app.oxfordlancers.com` is served by Firebase Hosting, which rewrites every
 * request to Cloud Run — see `docs/adr/0031-firebase-hosting-front-door.md`.
 * Firebase strips cookies from requests it forwards, so that its CDN can cache
 * safely, and permits exactly one through:
 *
 *   "cookies are generally stripped from incoming requests. This is necessary
 *    to allow for efficient CDN cache behavior. Only the specially-named
 *    `__session` cookie is permitted to pass through to the execution of your
 *    app."
 *   — https://firebase.google.com/docs/hosting/manage-cache
 *
 * Supabase's default cookie is `sb-<project-ref>-auth-token`. Through Firebase
 * that name is deleted on every request, so the server sees no session: sign-in
 * appears to succeed, and the next page bounces back to /login. The same
 * mechanism breaks password recovery, because `/auth/recovery` writes the
 * session and `/reset-password` never receives it.
 *
 * Naming the cookie `__session` is therefore not a preference. It is the
 * condition on which authentication works at all in production.
 *
 * ## The limit this buys, and the guard that watches it
 *
 * `@supabase/ssr` splits a cookie larger than roughly 3180 bytes into
 * `__session.0`, `__session.1`, … Firebase permits only the exact name
 * `__session`, so a chunked session is stripped exactly like the default one
 * was, and the symptom is identical and equally silent.
 *
 * Measured on 2026-08-21, a real signed-in session was 2653 bytes — it fits,
 * with about 500 bytes of headroom. Anything that enlarges the token, and
 * custom JWT claims are the obvious candidate, spends that headroom.
 *
 * `assertSessionCookieFitsOneCookie` exists so that the day it no longer fits
 * is a loud line in the logs rather than an evening of people being mysteriously
 * signed out.
 */

/** The one cookie name Firebase Hosting will forward to Cloud Run. */
export const SESSION_COOKIE_NAME = "__session";

/** Passed to every cookie-backed Supabase client in this application. */
export const SUPABASE_COOKIE_OPTIONS = { name: SESSION_COOKIE_NAME } as const;

/** True for the `__session.0`-style names `@supabase/ssr` produces when it splits. */
export function isChunkedSessionCookieName(name: string): boolean {
  return new RegExp(`^${SESSION_COOKIE_NAME}\\.\\d+$`).test(name);
}

/**
 * Shout if the session has outgrown a single cookie.
 *
 * Called wherever Supabase hands us cookies to write. It does not throw: a
 * chunked session is already broken through Firebase, and turning that into an
 * exception would replace a broken sign-in with a 500 on every request. What it
 * must not do is stay quiet.
 */
export function assertSessionCookieFitsOneCookie(cookiesToSet: readonly { name: string }[]): void {
  const chunked = cookiesToSet.filter(({ name }) => isChunkedSessionCookieName(name));
  if (chunked.length === 0) return;

  console.error(
    `[auth] The Supabase session no longer fits one cookie and was split into ` +
      `${chunked.map(({ name }) => name).join(", ")}. Firebase Hosting forwards only ` +
      `the exact name "${SESSION_COOKIE_NAME}", so these will be stripped and every ` +
      `user will appear signed out. See src/lib/supabase/cookies.ts and ` +
      `docs/adr/0031-firebase-hosting-front-door.md.`,
  );
}
