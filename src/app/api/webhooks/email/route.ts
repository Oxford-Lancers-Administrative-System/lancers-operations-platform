import { NextResponse } from "next/server";

import { resolveEmailWebhookConfig } from "@/lib/delivery/config";
import { EMAIL_PROVIDER } from "@/lib/delivery/email";
import { MAX_CALLBACK_BYTES, readBodyUpTo } from "@/lib/delivery/read-body";
import { parseResendEvent, verifySvixSignature } from "@/lib/delivery/resend-webhook";
import { applyProviderCallback } from "@/lib/services/delivery";

/**
 * Resend's delivery receipts — LAN-484. The WhatsApp route's twin, in the same
 * order, because the order is its security: read the raw body, verify the Svix
 * signature and its timestamp over those exact bytes, and only then parse and
 * touch the database. A verified receipt answers 200 even when it matches no
 * attempt or changes nothing (a delay, a spam complaint): Svix retries any
 * non-2xx for days, and none of those would ever succeed.
 */

export { MAX_CALLBACK_BYTES };

export async function POST(request: Request): Promise<Response> {
  const webhook = resolveEmailWebhookConfig();
  // A route that cannot verify must not accept: 503, not 200.
  if (!webhook.configured) return new NextResponse(null, { status: 503 });

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_CALLBACK_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const raw = await readBodyUpTo(request, MAX_CALLBACK_BYTES);
  if (raw === null) return new NextResponse(null, { status: 413 });

  const svixId = request.headers.get("svix-id");
  const verified = verifySvixSignature(
    raw,
    {
      id: svixId,
      timestamp: request.headers.get("svix-timestamp"),
      signature: request.headers.get("svix-signature"),
    },
    webhook.config,
  );
  if (!verified || svixId === null) return new NextResponse(null, { status: 403 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    // Signed but unparseable — acknowledged, not retried forever.
    return NextResponse.json({ received: 0 }, { status: 200 });
  }

  const event = parseResendEvent(payload, svixId);
  if (event === null) return NextResponse.json({ received: 0 }, { status: 200 });

  const outcome = await applyProviderCallback(EMAIL_PROVIDER, event, { signatureVerified: true });

  // Counts only — no identifier, status or recipient goes back over the internet.
  return NextResponse.json(
    { received: 1, applied: outcome === "applied" ? 1 : 0 },
    { status: 200 },
  );
}
