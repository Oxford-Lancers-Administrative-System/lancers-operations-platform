import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { resolveWebhookConfig } from "@/lib/delivery/config";
import { parseCallbackPayload, verifyWebhookSignature } from "@/lib/delivery/whatsapp-cloud";
import { WHATSAPP_CLOUD_PROVIDER } from "@/lib/delivery/whatsapp-cloud";
import { applyProviderCallback } from "@/lib/services/delivery";

/**
 * Meta's delivery callbacks. LAN-78.
 *
 * This is the only route in the application an unauthenticated stranger on the
 * internet is expected to POST to, which makes its order of operations the
 * whole of its security:
 *
 *   1. Read the **raw** body as text.
 *   2. Verify `X-Hub-Signature-256` over those exact bytes.
 *   3. Only then parse it, and only then touch the database.
 *
 * Reading `await request.json()` first would be the natural way to write this
 * and would destroy step 2: the signature is over bytes, and re-serialising
 * parsed JSON changes key order and whitespace. Such a route appears to work
 * until the provider reorders a field, at which point it either rejects
 * everything or — worse, if somebody "fixes" it by dropping the check — accepts
 * anything.
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
 * nothing to apply. Meta retries a non-2xx for hours, and a callback for a
 * message this deployment has never heard of — a different environment sharing
 * a WhatsApp Business Account, a message sent before a database reset — is not
 * a transient failure and will never succeed. It is recorded as unmatched,
 * which is a fact worth having, and acknowledged.
 *
 * An unexpected *server* failure does answer 500, because that one is worth
 * retrying.
 *
 * ## LAN-93 owns what is not proven here
 *
 * Signature verification and deduplication are tested against synthesised
 * payloads signed with a test secret. Meta actually reaching this route needs a
 * public HTTPS endpoint, which LAN-93 owes, and until then no deployment
 * receives a real callback. That is disclosed rather than implied: an accepted
 * message stays **Attempted** forever without one.
 */

/**
 * The largest callback this route will read.
 *
 * Meta's status payloads are a few kilobytes; 64 KiB is generous. The cap
 * exists because verifying costs an HMAC over the whole body, and an
 * unauthenticated caller must not get to choose how much of that the club pays
 * for.
 */
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

  // The verify token is a shared secret, so it is compared the same way the
  // POST path compares a signature — length first, then `timingSafeEqual`. A
  // `!==` on a secret leaks, through timing, how many leading characters were
  // right. A mismatch says only "no", never which part was wrong.
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
  // Unconfigured means this deployment cannot verify anything, and a route that
  // cannot verify must not accept. 503, not 200: it is a real inability.
  if (!webhook.configured) return new NextResponse(null, { status: 503 });

  // Bounded before it is **hashed**, which is the honest claim. An earlier
  // version of this comment said "before it is read", and that was false: the
  // body is buffered by `request.text()` regardless, and the platform's own
  // limit is what bounds that. What these two checks avoid is computing an HMAC
  // over an arbitrarily large body chosen by an unauthenticated caller — the
  // one endpoint a stranger is meant to reach.
  //
  // `content-length` is a hint, not a guarantee: it is absent on a chunked
  // request and can be a lie. So it is used only when it is present and
  // numeric, and the real check is on the decoded bytes afterwards —
  // `Buffer.byteLength`, not `String.length`, because the latter counts UTF-16
  // code units and would let a UTF-8 body of roughly three times the cap
  // through.
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
    // Signed, so it came from Meta, but unparseable. Acknowledged rather than
    // retried forever; there is nothing a retry would fix.
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

  // Counts only. No identifier, no status, no recipient — this response goes
  // back over the internet to a caller that has already been authenticated but
  // is owed nothing about the club.
  return NextResponse.json({ received: events.length, applied }, { status: 200 });
}
