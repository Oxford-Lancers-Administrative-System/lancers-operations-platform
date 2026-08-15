"use server";

import { headers } from "next/headers";
import {
  looksLikeEmailAddress,
  PUBLIC_RECOVERY_CONFIRMATION,
  recoveryCallbackUrl,
  remainingPublicResponseDelayMs,
} from "@/lib/auth/recovery";
import { createStatelessClient } from "@/lib/supabase/stateless";

/**
 * What the browser is told. `confirmed` carries no detail because there is no
 * detail it may carry; `invalid` is ordinary field validation on something that
 * cannot be an address at all, and is reached before Supabase is contacted.
 */
export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "confirmed"; message: string }
  | { status: "invalid"; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start password recovery — LAN-125.
 *
 * ## Every outcome is the same outcome
 *
 * Account exists, account does not exist, Supabase refuses, the per-address
 * frequency limit rejects a resend, the deployment has no configured origin to
 * build a link from: all of them return `PUBLIC_RECOVERY_CONFIRMATION`, with
 * the same shape, the same status and — see below — materially the same
 * duration. The only branch that answers differently is a value that is not an
 * address, which is answered before any account could be looked up and
 * therefore tells the caller nothing about accounts.
 *
 * Nothing here logs the submitted address, and nothing logs whether Supabase
 * accepted it. A log line saying "recovery requested for x@y" is the same
 * account oracle as an error message, written somewhere quieter.
 *
 * ## Timing
 *
 * Measured against this repository's local stack, Supabase answers an unknown
 * address in ~10 ms and a known one in ~60 ms, because the second sends mail.
 * That gap is readable with a stopwatch, so the response is held to a floor and
 * then quantised — the delay is computed from the elapsed time rather than
 * simply added to it, so a slow provider does not push the account-exists path
 * past the floor and reopen the channel it was closing.
 *
 * ## The destination
 *
 * `recoveryCallbackUrl` derives it from `APP_BASE_URL`, or from the request's
 * own origin when that origin is loopback, and never from form input. Supabase
 * then checks it against its own redirect allow-list and silently substitutes
 * the project's Site URL for anything it does not recognise, so a link cannot
 * be pointed at another host even if this resolution were wrong.
 */
export async function requestPasswordReset(
  _previous: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const startedAt = Date.now();
  const email = String(formData.get("email") ?? "").trim();

  if (!looksLikeEmailAddress(email)) {
    return { status: "invalid", error: "Enter an email address, for example name@example.com." };
  }

  const requestHeaders = await headers();
  const callbackUrl = recoveryCallbackUrl({
    appBaseUrl: process.env.APP_BASE_URL,
    requestOrigin: requestOriginFrom(requestHeaders),
  });

  if (callbackUrl === null) {
    // Deliberately not a visible failure. Naming the variable is a
    // configuration message for whoever runs the deployment; it says nothing
    // about the address and nothing about any account.
    console.warn(
      "Password recovery is not configured for this deployment: APP_BASE_URL is unset and the request origin is not loopback. No recovery email was requested.",
    );
  } else {
    try {
      // The result is deliberately discarded. Reading it could only be used to
      // vary the response, and varying the response is the defect.
      await createStatelessClient().auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl,
      });
    } catch {
      // A transport failure is not the caller's business either.
    }
  }

  await sleep(remainingPublicResponseDelayMs(Date.now() - startedAt));

  return { status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION };
}

/**
 * The origin this request arrived on, as the deployment sees it.
 *
 * Used only as a loopback-development convenience — `resolveRecoveryOrigin`
 * discards it for any host that is not loopback, so a forged `Host` on a
 * deployed environment resolves to "unconfigured" rather than to a link.
 */
function requestOriginFrom(requestHeaders: Headers): string | null {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  if (!host) return null;
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}
