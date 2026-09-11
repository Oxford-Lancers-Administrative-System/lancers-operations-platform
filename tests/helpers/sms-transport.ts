/**
 * Shared fixtures for tests that drive the delivery path through a fake
 * transport. LAN-330.
 *
 * The phone channel posts a form-encoded Twilio request; email posts JSON to
 * Resend. `parseTransportBody` reads either, so a test can assert on what was
 * sent without knowing the encoding, and `twilioAccepted` answers the way
 * Twilio does when it queues a message.
 */

/** Outbound configuration a test can pass without any real credential. */
export const TWILIO_TEST_ENVIRONMENT = Object.freeze({
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_API_KEY_SID: "SKtest",
  TWILIO_API_KEY_SECRET: "not-a-real-secret",
  TWILIO_ALPHA_SENDER: "OxfLancers",
  TWILIO_FROM_TOLL_FREE: "+18005550100",
});

export interface SmsForm {
  readonly To: string;
  readonly From: string;
  readonly Body: string;
  readonly StatusCallback: string;
  /** The `kind` the adapter put on its callback URL, or `null`. */
  readonly kind: string | null;
}

/** Is this request bound for Twilio's Messages endpoint? */
export function isTwilioMessagesUrl(url: string): boolean {
  return /\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(new URL(url).pathname);
}

/** The form a Twilio-bound request carries, with the kind pulled off the callback. */
export function parseSmsForm(body: RequestInit["body"]): SmsForm {
  const params = new URLSearchParams(typeof body === "string" ? body : "");
  const callback = params.get("StatusCallback") ?? "";
  let kind: string | null = null;
  try {
    kind = new URL(callback).searchParams.get("kind");
  } catch {
    kind = null;
  }
  return {
    To: params.get("To") ?? "",
    From: params.get("From") ?? "",
    Body: params.get("Body") ?? "",
    StatusCallback: callback,
    kind,
  };
}

/** JSON for an email request, the parsed form for a Twilio one. */
export function parseTransportBody(
  url: string,
  body: RequestInit["body"],
): Record<string, unknown> {
  if (isTwilioMessagesUrl(url)) return { ...parseSmsForm(body) };
  try {
    return JSON.parse(typeof body === "string" ? body : "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Twilio's answer when it queues a message. */
export function twilioAccepted(sid: string, status = 201): Response {
  return new Response(JSON.stringify({ sid, status: "queued" }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** The first `/<prefix>/<token>` link in a text body, e.g. `a`, `rsvp`, `me`, `me/join`. */
export function linkToken(body: string, prefix = "a"): string | null {
  const match = new RegExp(`/${prefix}/([^\\s/?#]+)`).exec(body);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Every `/a/<token>` link in order, so Yes precedes No as the template lays them out. */
export function answerTokens(body: string): string[] {
  return [...body.matchAll(/\/a\/([^\s/?#]+)/g)].map((m) => decodeURIComponent(m[1]));
}
