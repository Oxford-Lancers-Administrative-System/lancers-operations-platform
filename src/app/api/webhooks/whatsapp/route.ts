import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { resolveWebhookConfig } from "@/lib/delivery/config";
import { parseCallbackPayload, verifyWebhookSignature } from "@/lib/delivery/whatsapp-cloud";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";
import { applyProviderCallback } from "@/lib/services/delivery";

/**
 * Meta's delivery callbacks. LAN-78. The only route an unauthenticated
 * stranger is expected to POST to, so order of operations is the whole of its
 * security: read the raw body, verify `X-Hub-Signature-256` over those exact
 * bytes, only then parse and touch the database. A verified callback still
 * answers 200 even when unmatched (Meta retries a non-2xx for hours, and a
 * stale/foreign callback will never succeed); a genuine server failure
 * answers 500. LAN-93 owns the public HTTPS endpoint this needs to ever
 * receive a real callback.
 *
 * Decision history: docs/adr/0023-rsvp-token-and-whatsapp-delivery.md
 */

/** The largest callback this route will read — Meta's payloads are a few KB; 64 KiB avoids an unauthenticated caller choosing the HMAC's cost. */
export const MAX_CALLBACK_BYTES = 64 * 1024;

/** Constant-time equality for a shared secret. `null` never matches. */
function matchesSecret(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Meta's subscription handshake. Answers only with the challenge it was given. */
export async function GET(request: Request): Promise<Response> {
  const webhook = resolveWebhookConfig();
  if (!webhook.configured) return new NextResponse(null, { status: 503 });

  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Compared the same way the POST path compares a signature: length first, then `timingSafeEqual`, so no timing leak.
  if (mode !== "subscribe" || !matchesSecret(token, webhook.config.webhookVerifyToken)) {
    return new NextResponse(null, { status: 403 });
  }

  return new NextResponse(challenge ?? "", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const webhook = resolveWebhookConfig();
  // A route that cannot verify must not accept: 503, not 200.
  if (!webhook.configured) return new NextResponse(null, { status: 503 });

  // Bounded before it is hashed: avoids an HMAC over an arbitrarily large body.
  // `content-length` is a hint (absent on chunked, can lie); the real check is
  // on decoded bytes via `Buffer.byteLength`, not `String.length` (UTF-16 units).
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CALLBACK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_CALLBACK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), webhook.config)) {
    return new NextResponse(null, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed (from Meta) but unparseable — acknowledged, not retried forever.
    return NextResponse.json({ received: 0 }, { status: 200 });
  }

  const events = parseCallbackPayload(payload);

  let applied = 0;
  for (const event of events) {
    const outcome = await applyProviderCallback(WHATSAPP_CLOUD_PROVIDER, event, {
      signatureVerified: true,
    });
    if (outcome === "applied") applied += 1;
  }

  // Counts only — no identifier, status or recipient goes back over the internet.
  return NextResponse.json({ received: events.length, applied }, { status: 200 });
}
