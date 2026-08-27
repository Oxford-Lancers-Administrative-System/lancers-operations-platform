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
  // Permits `MESSAGE.recipient`, so that every test below exercises the send
  // path rather than the LAN-124 refusal. The refusal has its own describe
  // block, which narrows this deliberately.
  recipientAllowlist: ["447700900123"],
  templateParameters: "invitation",
  localTest: { recipientOverride: null, messageMode: "template" },
  ...overrides,
});

const MESSAGE: InvitationMessage = {
  kind: "invitation",
  recipient: "447700900123",
  inviteeName: "Alex",
  eventName: "Team Practice",
  whenLabel: "Wednesday 19 November, 19:00",
  rsvpUrl: "https://lancers.example.org/rsvp/abc123",
  yesUrl: "https://lancers.example.org/a/y.11111111-1111-1111-1111-111111111111.abc",
  noUrl: "https://lancers.example.org/a/n.11111111-1111-1111-1111-111111111111.xyz",
};

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("the request body", () => {
  it("sends the approved template with its three body parameters in order", () => {
    const body = buildMessageBody(config(), MESSAGE) as Record<string, never>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("447700900123");
    expect(body.type).toBe("template");

    const template = body.template as unknown as {
      name: string;
      language: { code: string };
      components: {
        type: string;
        sub_type?: string;
        index?: string;
        parameters: { text: string }[];
      }[];
    };
    expect(template.name).toBe("event_invitation");
    expect(template.language.code).toBe("en_GB");

    // The order is the contract the club's Meta template is built against.
    // Reordering these silently produces "a Wednesday 19 November on Team
    // Practice", which no test of the transport would catch. LAN-172: the
    // link left the body entirely — it is carried by the two buttons below.
    const body_component = template.components.find((c) => c.type === "body");
    expect(body_component?.parameters.map((parameter) => parameter.text)).toEqual([
      "Alex",
      "Team Practice",
      "Wednesday 19 November, 19:00",
    ]);
  });

  it("sends the two answer buttons as URL buttons carrying only the token suffix", () => {
    // LAN-172, Q-11: Meta's button component takes the dynamic *suffix* of the
    // approved template's URL, never the whole address — the fixed prefix is
    // part of the template Meta approved. Sending the full URL here would be
    // the reordering mistake's cousin: a message that looks right and carries
    // a doubled path.
    const body = buildMessageBody(config(), MESSAGE) as {
      template: {
        components: {
          type: string;
          sub_type?: string;
          index?: string;
          parameters: { text: string }[];
        }[];
      };
    };
    const buttons = body.template.components.filter((c) => c.type === "button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toMatchObject({
      sub_type: "url",
      index: "0",
      parameters: [{ text: "y.11111111-1111-1111-1111-111111111111.abc" }],
    });
    expect(buttons[1]).toMatchObject({
      sub_type: "url",
      index: "1",
      parameters: [{ text: "n.11111111-1111-1111-1111-111111111111.xyz" }],
    });
  });

  it("carries no full URL string on either button — the suffix only", () => {
    const body = buildMessageBody(config(), MESSAGE);
    const serialised = JSON.stringify(body);
    expect(serialised).not.toContain("https://lancers.example.org/a/");
  });

  it("sends no buttons for a kind that carries a single link, not two answers", () => {
    const body = buildMessageBody(config(), { ...MESSAGE, kind: "nudge" }) as {
      template: { components: { type: string }[] };
    };
    expect(body.template.components.some((c) => c.type === "button")).toBe(false);
  });

  it("sends free-form text carrying the Yes link, only in the loopback test mode", () => {
    // The free-text loopback affordance predates the two-button answer shape
    // and still carries one link — `yesUrl` is what it prefers now, and it
    // falls back to `rsvpUrl` for any caller that has not supplied one.
    const body = buildMessageBody(
      config({ localTest: { recipientOverride: null, messageMode: "text" } }),
      MESSAGE,
    ) as Record<string, never>;
    expect(body.type).toBe("text");
    expect((body.text as unknown as { body: string }).body).toContain(MESSAGE.yesUrl);
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

  /**
   * The known-terminal codes, pinned as terminal.
   *
   * The test above proves an *unknown* code is not retried, which is the safe
   * default — but it pins no known one, so moving a terminal code into
   * `RETRYABLE_PROVIDER_CODES` passes the whole suite. The consequence is not
   * cosmetic: a terminal refusal recorded as `failed` rather than `rejected`
   * renders as **Retryable**, so the screen invites an operator to press Retry
   * on a dead credential or an unroutable number, five times, against a real
   * provider.
   */
  it.each([
    [131026, "the number is not a WhatsApp account"],
    [131030, "the recipient is not on the allow list"],
    [132001, "the template does not exist"],
    [190, "the credential has expired"],
  ])("never retries %i — %s", (code) => {
    const outcome = interpretResponse(400, { error: { code } });
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" && outcome.retryable).toBe(false);
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

describe("LAN-124 — a template that takes no parameters", () => {
  /**
   * Meta's pre-approved `hello_world`. The reason this shape exists at all is
   * that the club's own template has to clear approval before it can be sent,
   * and a demonstration cannot be scheduled around Meta's review queue.
   */
  it("omits components entirely rather than sending an empty list", () => {
    // `components: []` is not the same request. Meta matches parameters against
    // the approved template and answers 132000 when they disagree, which is the
    // failure this shape exists to avoid.
    const body = buildMessageBody(
      config({
        templateName: "hello_world",
        templateLanguage: "en_US",
        templateParameters: "none",
      }),
      MESSAGE,
    );

    expect(body).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "447700900123",
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } },
    });
    expect(body.template).not.toHaveProperty("components");
  });

  it("still sends the three-parameter body plus two buttons for the club's own template", () => {
    const body = buildMessageBody(config(), MESSAGE) as {
      template: { components: { type: string; parameters: { text: string }[] }[] };
    };

    const bodyComponent = body.template.components.find((c) => c.type === "body");
    expect(bodyComponent?.parameters.map((p) => p.text)).toEqual([
      "Alex",
      "Team Practice",
      "Wednesday 19 November, 19:00",
    ]);
    expect(body.template.components.filter((c) => c.type === "button")).toHaveLength(2);
  });

  it("carries no RSVP link in the parameterless shape, which is the whole limitation", () => {
    // Asserted rather than left implicit: somebody reading the runbook needs to
    // know that this proves delivery and proves nothing about the RSVP loop.
    const body = buildMessageBody(config({ templateParameters: "none" }), MESSAGE);

    expect(JSON.stringify(body)).not.toContain(MESSAGE.rsvpUrl);
  });
});

describe("LAN-124 — the allowlist at the egress", () => {
  /**
   * The service layer refuses an unlisted recipient before it mints a token,
   * and that is where the workflow behaves well. This block is about the other
   * half: the adapter is the only code in the repository that opens a
   * connection to Meta, so it refuses on its own account rather than trusting
   * that every future caller came through `claimNextJobIn`.
   *
   * Each of these asserts the transport was **never called**. "Returned
   * refused" is not the property under test — not sending is.
   */
  it("refuses a recipient outside the allowlist without contacting the provider", async () => {
    const transport = vi.fn(async () => respond(200, { messages: [{ id: "wamid.OK" }] }));
    const provider = createWhatsAppCloudProvider(
      config({ recipientAllowlist: ["447700900999"] }),
      transport,
    );

    const outcome = await provider.send(MESSAGE);

    expect(transport).not.toHaveBeenCalled();
    expect(outcome.status).toBe("refused");
    expect(outcome.status === "refused" && outcome.retryable).toBe(false);
  });

  it("refuses everybody when the allowlist is empty", async () => {
    const transport = vi.fn(async () => respond(200, { messages: [{ id: "wamid.OK" }] }));
    const provider = createWhatsAppCloudProvider(config({ recipientAllowlist: [] }), transport);

    await provider.send(MESSAGE);

    expect(transport).not.toHaveBeenCalled();
  });

  it("checks the number that would actually be dialled, not the invitation's", async () => {
    // A local test override redirects the send. Checking `message.recipient`
    // while dialling the override would leave a hole exactly the shape of a
    // test affordance: an allowlisted invitee whose message goes elsewhere.
    const transport = vi.fn(async () => respond(200, { messages: [{ id: "wamid.OK" }] }));
    const provider = createWhatsAppCloudProvider(
      config({
        recipientAllowlist: ["447700900123"],
        localTest: { recipientOverride: "447700900999", messageMode: "text" },
      }),
      transport,
    );

    const outcome = await provider.send(MESSAGE);

    expect(transport).not.toHaveBeenCalled();
    expect(outcome.status).toBe("refused");
  });

  it("sends when the override itself is allowlisted", async () => {
    const transport = vi.fn(async () => respond(200, { messages: [{ id: "wamid.OK" }] }));
    const provider = createWhatsAppCloudProvider(
      config({
        recipientAllowlist: ["447700900999"],
        localTest: { recipientOverride: "447700900999", messageMode: "text" },
      }),
      transport,
    );

    const outcome = await provider.send(MESSAGE);

    expect(transport).toHaveBeenCalledTimes(1);
    expect(outcome.status).toBe("accepted");
  });

  it("names no telephone number in the reason it records", async () => {
    const provider = createWhatsAppCloudProvider(
      config({ recipientAllowlist: ["447700900999"] }),
      vi.fn(async () => respond(200, {})),
    );

    const outcome = await provider.send(MESSAGE);
    expect(outcome.status === "refused" && outcome.reason).not.toMatch(/\d{4,}/);
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
  it.each(["sent", "read"])(
    "keeps %s, which it has no outcome for, rather than discarding it",
    (status) => {
      const events = parseCallbackPayload(payload([{ id: "wamid.C", status }]));
      expect(events).toHaveLength(1);
      expect(events[0].outcome).toBeNull();
      expect(events[0].providerStatus).toBe(status);
    },
  );

  it("never reads `sent` as a delivery, which is this branch's whole finding", () => {
    // Meta emits `sent` for every accepted message, before `delivered`, always.
    // Mapping it to `delivered` is the single most plausible future mistake here
    // — the word invites it — and it is the exact defect the live test on
    // 13 August disproved: a provider 200 is acceptance, not arrival.
    //
    // With that mapping, the first callback concludes the attempt, completes the
    // job and writes a `delivery.delivered` audit row. The real `delivered` is
    // then superseded, and so is a later `failed`, because `delivery_results` is
    // authoritative per attempt. A message that never arrived reads Delivered
    // for ever, and `retryable` is false for a delivered job, so there is no
    // repair path.
    const events = parseCallbackPayload(payload([{ id: "wamid.S", status: "sent" }]));
    expect(events[0].outcome).not.toBe("delivered");
    expect(events[0].outcome).toBeNull();
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
