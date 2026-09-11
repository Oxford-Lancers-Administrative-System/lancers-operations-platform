import { NextResponse } from "next/server";

import { resolveWebhookConfig } from "@/lib/delivery/config";
import {
  parseFormBody,
  parseStatusCallback,
  STATUS_CALLBACK_PATH,
  TWILIO_SMS_PROVIDER,
  verifyTwilioSignature,
} from "@/lib/delivery/sms-twilio";
import { applyProviderCallback } from "@/lib/services/delivery";

/**
 * Twilio's message status callbacks. LAN-330.
 *
 * This is the only route in the application an unauthenticated stranger on the
 * internet is expected to POST to, which makes its order of operations the
 * whole of its security:
 *
 *   1. Read the **raw** body as text.
 *   2. Verify `X-Twilio-Signature` over the URL Twilio was given and the
 *      parameters in that body.
 *   3. Only then touch the database.
 *
 * ## The URL in the signature is ours, not the request's
 *
 * Twilio signs the URL it requested, which is the `StatusCallback` this
 * deployment sent: `APP_BASE_URL` plus this path. Behind a tunnel the request
 * the app sees carries a loopback host and port, so rebuilding the URL from
 * the request would fail every genuine signature. The path and query are
 * taken from the request; the origin comes from configuration.
 *
 * ## What an unverified request gets
 *
 * `403`, an empty body, and no database access whatsoever. Nothing is stored:
 * `delivery_callbacks` carries a check constraint that only verified rows
 * exist, so the guarantee survives a future caller forgetting this.
 *
 * ## Why a failure still answers 200
 *
 * Once a callback is verified, this route answers 200 even if applying it found
 * nothing to apply. Twilio retries a non-2xx, and a callback for a message this
 * deployment has never heard of — sent before a database reset, say — is not a
 * transient failure and will never succeed. It is recorded as unmatched, which
 * is a fact worth having, and acknowledged.
 */

/**
 * The largest callback this route will read. Twilio's status callbacks are
 * under a kilobyte; the cap exists because verifying costs an HMAC over the
 * whole body, and an unauthenticated caller must not get to choose how much of
 * that the club pays for.
 */
export const MAX_CALLBACK_BYTES = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  const webhook = resolveWebhookConfig();
  // Unconfigured means this deployment cannot verify anything, and a route that
  // cannot verify must not accept. 503, not 200: it is a real inability.
  if (!webhook.configured) return new NextResponse(null, { status: 503 });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CALLBACK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_CALLBACK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const requested = new URL(request.url);
  const signedUrl = `${webhook.config.appBaseUrl}${STATUS_CALLBACK_PATH}${requested.search}`;
  const params = parseFormBody(raw);

  if (
    requested.pathname !== STATUS_CALLBACK_PATH ||
    !verifyTwilioSignature(
      signedUrl,
      params,
      request.headers.get("x-twilio-signature"),
      webhook.config,
    )
  ) {
    return new NextResponse(null, { status: 403 });
  }

  const event = parseStatusCallback(params);
  if (!event) return NextResponse.json({ received: 0, applied: 0 }, { status: 200 });

  const outcome = await applyProviderCallback(TWILIO_SMS_PROVIDER, event, {
    signatureVerified: true,
  });

  // Counts only. No identifier, no status, no recipient — this response goes
  // back over the internet to a caller that is owed nothing about the club.
  return NextResponse.json(
    { received: 1, applied: outcome === "applied" ? 1 : 0 },
    { status: 200 },
  );
}
