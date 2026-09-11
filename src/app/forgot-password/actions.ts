"use server";

import { headers } from "next/headers";
import {
  looksLikeEmailAddress,
  PUBLIC_RECOVERY_CONFIRMATION,
  recoveryCallbackUrl,
  remainingPublicResponseDelayMs,
} from "@/lib/auth/recovery";
import { createStatelessClient } from "@/lib/supabase/stateless";

/** What the browser is told. `confirmed` carries no detail; `invalid` is reached before Supabase is contacted. */
export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "confirmed"; message: string }
  | { status: "invalid"; error: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Start password recovery — LAN-125. Every outcome — account exists, does
 * not, Supabase refuses, frequency-limited, unconfigured origin — returns
 * `PUBLIC_RECOVERY_CONFIRMATION` with the same shape/status/duration; only an
 * invalid address answers differently, before any account lookup. Nothing
 * here logs the address or whether Supabase accepted it. Timing is held to a
 * floor then quantised, computed from elapsed time so a slow provider cannot
 * reopen the channel. `recoveryCallbackUrl` never derives from form input.
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
    // Not a visible failure: a configuration message for the deployment, saying nothing about the address.
    console.warn(
      "Password recovery is not configured for this deployment: APP_BASE_URL is unset and the request origin is not loopback. No recovery email was requested.",
    );
  } else {
    try {
      // Result deliberately discarded: reading it could only vary the response.
      await createStatelessClient().auth.resetPasswordForEmail(email, {
        redirectTo: callbackUrl,
      });
    } catch {
      // Not the caller's business either.
    }
  }

  await sleep(remainingPublicResponseDelayMs(Date.now() - startedAt));

  return { status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION };
}

/** The request's origin — a loopback-development convenience; `resolveRecoveryOrigin` discards it for any non-loopback host. */
function requestOriginFrom(requestHeaders: Headers): string | null {
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const host = forwardedHost ?? requestHeaders.get("host");
  if (!host) return null;
  const proto = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${proto}://${host}`;
}
