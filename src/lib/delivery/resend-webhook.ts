import crypto from "node:crypto";

import type { EmailWebhookConfig } from "./config";
import type { ProviderCallbackEvent } from "./provider";

/**
 * Resend's delivery receipts — LAN-484.
 *
 * Resend signs every webhook with Svix: three headers, `svix-id`,
 * `svix-timestamp` and `svix-signature`, and a signature that is
 * `base64(HMAC-SHA256(key, "<id>.<timestamp>.<raw body>"))`, where the key is
 * the base64 part of the endpoint's `whsec_…` signing secret. The signature
 * header may carry several space-separated `v1,<signature>` entries while a
 * secret is being rotated; any one matching is enough.
 *
 * Verified by hand rather than with the `svix` package: it is one HMAC, the
 * WhatsApp route already does the same with `node:crypto`, and a dependency
 * on the inbound path is a dependency every forged request reaches.
 */

/** How far a signed timestamp may be from now, either way. Svix's own default. */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export interface SvixHeaders {
  readonly id: string | null;
  readonly timestamp: string | null;
  readonly signature: string | null;
}

/** The key bytes of a `whsec_…` secret, or `null` when it is not one. */
function signingKey(secret: string): Buffer | null {
  const encoded = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  const key = Buffer.from(encoded, "base64");
  return key.length === 0 ? null : key;
}

/**
 * Verifies a Svix signature over the **raw** request body.
 *
 * The same three rules as `verifyWebhookSignature` for Meta: the bytes as
 * received, a constant-time comparison, and nothing parsed before it passes.
 * Svix adds a fourth: the timestamp is inside the signed content and must be
 * recent, so a captured request cannot be replayed later.
 */
export function verifySvixSignature(
  rawBody: string,
  headers: SvixHeaders,
  config: EmailWebhookConfig,
  now: Date = new Date(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  if (!/^\d+$/.test(timestamp)) return false;

  const signedAt = Number(timestamp);
  if (Math.abs(now.getTime() / 1000 - signedAt) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = signingKey(config.signingSecret);
  if (key === null) return false;

  const expected = Buffer.from(
    crypto
      .createHmac("sha256", key)
      .update(`${id}.${timestamp}.${rawBody}`, "utf8")
      .digest("base64"),
    "utf8",
  );

  return signature.split(" ").some((entry) => {
    const [version, given] = entry.split(",", 2);
    if (version !== "v1" || !given) return false;
    const candidate = Buffer.from(given, "utf8");
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

/** What an operator reads for a bounce. Provider-neutral, never the raw diagnostic. */
export const EMAIL_BOUNCED_REASON =
  "The recipient's mail server refused this email permanently, so it was not delivered.";

/** What an operator reads for a send the provider gave up on. */
export const EMAIL_FAILED_REASON =
  "The email provider could not deliver this email, so it was not delivered.";

/**
 * Resend's event type, mapped onto the delivery outcomes.
 *
 * `email.delivered` means the recipient's mail server accepted it — not that it
 * reached the inbox rather than spam. A bounce and a provider failure are both
 * final: sending the same email to the same address again gives the same
 * answer, so neither is Retryable. A delay is temporary and changes nothing;
 * a spam complaint is acknowledged and changes nothing (Brian, 6 October
 * 2026). Every other type — sent, opened, clicked — has no outcome here.
 */
function outcomeFor(type: string): Pick<ProviderCallbackEvent, "outcome" | "detail"> {
  switch (type) {
    case "email.delivered":
      return { outcome: "delivered", detail: null };
    case "email.bounced":
      return { outcome: "rejected", detail: EMAIL_BOUNCED_REASON };
    case "email.failed":
      return { outcome: "rejected", detail: EMAIL_FAILED_REASON };
    default:
      return { outcome: null, detail: null };
  }
}

/**
 * One Resend webhook, as the callback the delivery service applies.
 *
 * Resend sends one event per request. The deduplication key is the `svix-id`,
 * which Svix keeps the same across its own retries of one message. The match
 * to an attempt is Resend's email id, which the sender stored as the attempt's
 * `provider_message_id` when Resend accepted it. A payload of any other shape
 * yields `null` rather than an exception, so a field Resend adds never makes
 * the route fail and the provider retry for days.
 */
export function parseResendEvent(payload: unknown, svixId: string): ProviderCallbackEvent | null {
  const body = payload as { type?: unknown; data?: { email_id?: unknown } } | null;
  const type = typeof body?.type === "string" ? body.type : null;
  if (type === null) return null;

  const emailId = typeof body?.data?.email_id === "string" ? body.data.email_id : null;

  return {
    providerEventId: svixId,
    providerMessageId: emailId === "" ? null : emailId,
    providerStatus: type,
    ...outcomeFor(type),
  };
}
