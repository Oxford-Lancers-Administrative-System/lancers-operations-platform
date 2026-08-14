// @vitest-environment node
/**
 * The Meta Cloud API adapter. LAN-78.
 *
 * No network. The transport is injected, so every branch the real provider can
 * take — accepted, refused with a code we know, refused with one we do not,
 * a 2xx carrying nothing usable, a 5xx, a thrown transport — is reachable here
 * and reachable deterministically.
 *
 * The one thing these tests cannot prove is that Meta behaves as documented,
 * and that is why a live send was performed against the test number on
 * 13 August 2026. What that established is asserted below as the *rule* it
 * revealed: an accepted message is not a delivered one.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import crypto from "node:crypto";

import type { OutboundConfig, WebhookConfig } from "./config";
import type { InvitationMessage } from "./provider";
import {
  buildMessageBody,
  createWhatsAppCloudProvider,
  interpretResponse,
  parseCallbackPayload,
  redactDigits,
  verifyWebhookSignature,
} from "./whatsapp-cloud";

const config = (overrides: Partial<OutboundConfig> = {}): OutboundConfig => ({
  appBaseUrl: "https://lancers.example.org",
  defaultCallingCode: "44",
  graphBaseUrl: "https://graph.example.test",
  graphVersion: "v21.0",
  phoneNumberId: "5550001",
  accessToken: "not-a-real-token",
  templateName: "event_invitation",
  templateLanguage: "en_GB",
  localTest: { recipientOverride: null, messageMode: "template" },
  ...overrides,
});

const MESSAGE: InvitationMessage = {
  recipient: "447700900123",
  inviteeName: "Alex",
  eventName: "Team Practice",
  whenLabel: "Wednesday 19 November, 19:00",
  rsvpUrl: "https://lancers.example.org/rsvp/abc123",
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the request body", () => {
  it("sends the approved template with its four parameters in order", () => {
    const body = buildMessageBody(config(), MESSAGE) as Record<string, never>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("447700900123");
    expect(body.type).toBe("template");

    const template = body.template as unknown as {
      name: string;
      language: { code: string };
      components: { type: string; parameters: { text: string }[] }[];
    };
    expect(template.name).toBe("event_invitation");
    expect(template.language.code).toBe("en_GB");

    // The order is the contract the club's Meta template is built against.
    // Reordering these silently produces "a Wednesday 19 November on Team
    // Practice", which no test of the transport would catch.
    expect(template.components[0].parameters.map((parameter) => parameter.text)).toEqual([
      "Alex",
      "Team Practice",
      "Wednesday 19 November, 19:00",
      "https://lancers.example.org/rsvp/abc123",
    ]);
  });

  it("sends free-form text carrying the link, only in the loopback test mode", () => {
    const body = buildMessageBody(
      config({ localTest: { recipientOverride: null, messageMode: "text" } }),
      MESSAGE,
    ) as Record<string, never>;
    expect(body.type).toBe("text");
    expect((body.text as unknown as { body: string }).body).toContain(MESSAGE.rsvpUrl);
  });

  it("redirects to the test recipient only when the override is set", () => {
    const redirected = buildMessageBody(
      config({ localTest: { recipientOverride: "447700900999", messageMode: "text" } }),
      MESSAGE,
    ) as Record<string, never>;
    expect(redirected.to).toBe("447700900999");

    expect((buildMessageBody(config(), MESSAGE) as Record<string, never>).to).toBe("447700900123");
  });
});

describe("interpreting a response", () => {
  it("accepts a 200 carrying a message identifier", () => {
    const outcome = interpretResponse(200, { messages: [{ id: "wamid.TEST" }] });
    expect(outcome).toEqual({ status: "accepted", providerMessageId: "wamid.TEST" });
  });

  /**
   * A 2xx with no identifier is not a usable success: nothing could ever match
   * a callback to it, so the message would sit at "attempted" forever.
   */
  it("refuses a 200 that carries no message identifier", () => {
    const outcome = interpretResponse(200, { messages: [] });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.retryable).toBe(true);
  });

  it("maps an expired credential to a sentence, and does not retry it", () => {
    const outcome = interpretResponse(401, { error: { code: 190, fbtrace_id: "trace-1" } });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.reason).toMatch(/credential has expired/i);
    expect(outcome.reason).toContain("trace-1");
    expect(outcome.retryable).toBe(false);
  });

  it("retries a rate limit and a server fault, and nothing else by default", () => {
    const limited = interpretResponse(429, { error: { code: 130429 } });
    expect(limited.status === "refused" && limited.retryable).toBe(true);

    const faulted = interpretResponse(500, { error: { code: 131000 } });
    expect(faulted.status === "refused" && faulted.retryable).toBe(true);

    // An unknown code is treated as needing a human. Retrying five times would
    // bury the real cause under identical failures.
    const unknown = interpretResponse(400, { error: { code: 999999 } });
    expect(unknown.status === "refused" && unknown.retryable).toBe(false);
  });

  it("explains the window failure the live test produced", () => {
    // 131047 is what an out-of-window free-form message becomes. The sentence
    // has to be one an operator can act on without knowing what a window is.
    const outcome = interpretResponse(400, { error: { code: 131047 } });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.reason).toMatch(/no open conversation/i);
  });
});

describe("sending", () => {
  it("posts to the configured endpoint with the bearer credential", async () => {
    const transport = vi.fn(async () => respond(200, { messages: [{ id: "wamid.OK" }] }));
    const provider = createWhatsAppCloudProvider(config(), transport);

    const outcome = await provider.send(MESSAGE);
    expect(outcome).toEqual({ status: "accepted", providerMessageId: "wamid.OK" });

    const [url, init] = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://graph.example.test/v21.0/5550001/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer not-a-real-token");
  });

  it("treats a thrown transport as retryable and quotes no digits", async () => {
    const transport = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 447700900123:443");
    });
    const outcome = await createWhatsAppCloudProvider(config(), transport).send(MESSAGE);

    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.retryable).toBe(true);
    expect(outcome.reason).not.toContain("447700900123");
    expect(outcome.reason).toContain("[redacted]");
  });

  it("never lets a provider sentence carry a phone number", async () => {
    const transport = vi.fn(async () =>
      respond(400, {
        error: { code: 131026, message: "Recipient 447700900123 is not a WhatsApp user" },
      }),
    );
    const outcome = await createWhatsAppCloudProvider(config(), transport).send(MESSAGE);

    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.reason).not.toContain("447700900123");
  });

  it("survives a response with no parseable body", async () => {
    const transport = vi.fn(async () => new Response("<html>502</html>", { status: 502 }));
    const outcome = await createWhatsAppCloudProvider(config(), transport).send(MESSAGE);
    expect(outcome.status === "refused" && outcome.retryable).toBe(true);
  });
});

describe("redaction", () => {
  it("removes a phone number and leaves an error code readable", () => {
    // Seven is the threshold precisely so that Meta's six-digit error codes
    // survive — an operator's failure sentence is useless if the code in it has
    // been scrubbed, and no phone number is that short.
    expect(redactDigits("number 447700900123 failed with code 131026")).toBe(
      "number [redacted] failed with code 131026",
    );
    expect(redactDigits("code 190 on v21.0")).toBe("code 190 on v21.0");
  });
});

describe("webhook signature verification", () => {
  const webhook: WebhookConfig = {
    appSecret: "not-a-real-secret",
    webhookVerifyToken: "not-a-real-verify-token",
  };

  const sign = (body: string, secret = webhook.appSecret) =>
    `sha256=${crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

  it("accepts a signature over the exact bytes", () => {
    const body = '{"entry":[{"changes":[]}]}';
    expect(verifyWebhookSignature(body, sign(body), webhook)).toBe(true);
  });

  /**
   * The failure a route that parses first would introduce. The bytes differ
   * only in whitespace, and the signature is over bytes.
   */
  it("rejects a signature computed over re-serialised JSON", () => {
    const original = '{"entry": [{"changes": []}]}';
    const reserialised = JSON.stringify(JSON.parse(original));
    expect(reserialised).not.toBe(original);
    expect(verifyWebhookSignature(reserialised, sign(original), webhook)).toBe(false);
  });

  it("rejects a missing header, a wrong secret and a tampered body", () => {
    const body = '{"entry":[]}';
    expect(verifyWebhookSignature(body, null, webhook)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, "another-secret"), webhook)).toBe(false);
    expect(verifyWebhookSignature('{"entry":[1]}', sign(body), webhook)).toBe(false);
  });

  it("rejects a truncated signature rather than throwing", () => {
    // `timingSafeEqual` throws on unequal lengths, so the length check has to
    // come first. Without it this is a 500 instead of a refusal.
    const body = '{"entry":[]}';
    expect(verifyWebhookSignature(body, "sha256=abc", webhook)).toBe(false);
  });
});

describe("parsing a callback", () => {
  const payload = (statuses: unknown[]) => ({
    entry: [{ changes: [{ value: { statuses } }] }],
  });

  it("maps delivered and failed onto the frozen model's outcomes", () => {
    const events = parseCallbackPayload(
      payload([
        { id: "wamid.A", status: "delivered" },
        { id: "wamid.B", status: "failed", errors: [{ code: 131026 }] },
      ]),
    );

    expect(events.map((event) => event.outcome)).toEqual(["delivered", "failed"]);
    expect(events[1].detail).toMatch(/not be a WhatsApp account/i);
  });

  /**
   * `sent` and `read` are real transitions with no `delivery_outcome` value,
   * and widening that enum is a frozen-model change. They are parsed, kept as
   * evidence, and applied to nothing.
   */
  it("keeps a status it has no outcome for, rather than discarding it", () => {
    const events = parseCallbackPayload(payload([{ id: "wamid.C", status: "read" }]));
    expect(events).toHaveLength(1);
    expect(events[0].outcome).toBeNull();
    expect(events[0].providerStatus).toBe("read");
  });

  it("gives one message's two transitions distinct deduplication keys", () => {
    const events = parseCallbackPayload(
      payload([
        { id: "wamid.D", status: "sent" },
        { id: "wamid.D", status: "delivered" },
      ]),
    );
    // Keying on the message alone would make the second look like a duplicate
    // of the first and silently drop every delivery confirmation.
    expect(new Set(events.map((event) => event.providerEventId)).size).toBe(2);
  });

  it("yields nothing for a shape it does not recognise, and never throws", () => {
    // A webhook that 500s because the provider added a field is a webhook the
    // provider retries forever.
    expect(parseCallbackPayload(null)).toEqual([]);
    expect(parseCallbackPayload({ entry: "not an array" })).toEqual([]);
    expect(parseCallbackPayload({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
    expect(parseCallbackPayload(payload([{ status: "delivered" }]))).toEqual([]);
  });
});
