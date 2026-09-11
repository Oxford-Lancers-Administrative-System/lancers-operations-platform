// @vitest-environment node
/**
 * The Twilio SMS adapter — LAN-330.
 *
 * Every branch here is driven without a network: the request builder and the
 * response interpreter are pure, and the provider takes an injected transport.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { OutboundConfig } from "./config";
import type { OutboundMessage } from "./provider";
import {
  buildSmsRequest,
  createTwilioSmsProvider,
  expectedTwilioSignature,
  interpretTwilioResponse,
  messagesEndpoint,
  parseFormBody,
  parseStatusCallback,
  senderFor,
  statusCallbackUrl,
  TWILIO_SMS_PROVIDER,
  US_SENDER_NOT_READY_REASON,
  verifyTwilioSignature,
} from "./sms-twilio";

const CONFIG: OutboundConfig = {
  appBaseUrl: "https://lancers.example.org",
  defaultCallingCode: "44",
  apiBaseUrl: "https://api.twilio.com",
  accountSid: "ACtest",
  apiKeySid: "SKtest",
  apiKeySecret: "not-a-real-secret",
  tollFreeNumber: "+18005550100",
  alphaSender: "OxfLancers",
  recipientAllowlist: ["447700900001", "12025550123"],
};

function message(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    kind: "invitation",
    recipient: "447700900001",
    inviteeName: "Jamie",
    eventName: "Michaelmas week 3",
    whenLabel: "Wed 14 Oct 20:00",
    rsvpUrl: "https://lancers.example.org/rsvp/abc",
    yesUrl: "https://lancers.example.org/a/y.11111111-1111-1111-1111-111111111111.abc",
    noUrl: "https://lancers.example.org/a/n.11111111-1111-1111-1111-111111111111.xyz",
    venue: "Iffley Road",
    deadlineLabel: "Tue 13 Oct 20:00",
    ...overrides,
  };
}

describe("choosing the sender", () => {
  it("uses the alphanumeric sender for a UK number", () => {
    expect(senderFor("447700900001", CONFIG)).toEqual({ ok: true, from: "OxfLancers" });
  });

  it("uses the toll-free number for a North American number", () => {
    expect(senderFor("12025550123", CONFIG)).toEqual({ ok: true, from: "+18005550100" });
  });

  it("refuses a North American number with a reason while the toll-free number is unset", () => {
    // Never a silent fallback to the alphanumeric sender: that message would
    // be accepted by Twilio and never arrive.
    const choice = senderFor("12025550123", { ...CONFIG, tollFreeNumber: null });
    expect(choice).toEqual({ ok: false, reason: US_SENDER_NOT_READY_REASON });
    expect(US_SENDER_NOT_READY_REASON).toContain("TWILIO_FROM_TOLL_FREE");
  });
});

describe("building the request", () => {
  it("posts a plus-prefixed To, the sender, the body and a callback carrying the kind", () => {
    const request = buildSmsRequest(CONFIG, message());
    expect(request.ok).toBe(true);
    if (!request.ok) return;
    expect(request.form.To).toBe("+447700900001");
    expect(request.form.From).toBe("OxfLancers");
    expect(request.form.Body).toContain("Jamie");
    expect(request.form.Body).toContain("/a/y.");
    expect(request.form.StatusCallback).toBe(
      "https://lancers.example.org/api/webhooks/twilio?kind=invitation",
    );
  });

  it("addresses the account's Messages endpoint", () => {
    expect(messagesEndpoint(CONFIG)).toBe(
      "https://api.twilio.com/2010-04-01/Accounts/ACtest/Messages.json",
    );
    expect(statusCallbackUrl("https://x/", "reminder")).toBe(
      "https://x/api/webhooks/twilio?kind=reminder",
    );
  });
});

describe("interpreting the response", () => {
  it("accepts a queued message by its SID", () => {
    expect(interpretTwilioResponse(201, { sid: "SM1", status: "queued" })).toEqual({
      status: "accepted",
      providerMessageId: "SM1",
    });
  });

  it("refuses a 2xx with no SID as retryable, because it could never be matched", () => {
    const outcome = interpretTwilioResponse(201, { status: "queued" });
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.retryable).toBe(true);
  });

  it.each([21211, 21408, 21610, 21606, 21212, 21614, 20003])(
    "treats code %s as needing a human, not a retry",
    (code) => {
      const outcome = interpretTwilioResponse(400, { code, message: "x", status: 400 });
      expect(outcome.status).toBe("refused");
      if (outcome.status !== "refused") return;
      expect(outcome.retryable).toBe(false);
      expect(outcome.reason).not.toBe("");
    },
  );

  it("retries a rate limit and a provider fault", () => {
    for (const [status, body] of [
      [429, { code: 20429, message: "x", status: 429 }],
      [503, null],
      [500, { code: 12345 }],
    ] as const) {
      const outcome = interpretTwilioResponse(status, body);
      expect(outcome.status).toBe("refused");
      if (outcome.status !== "refused") return;
      expect(outcome.retryable, String(status)).toBe(true);
    }
  });
});

describe("the provider", () => {
  it("sends form-encoded with basic auth on the API key pair, never the account", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const transport = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ sid: "SM2", status: "queued" }), { status: 201 });
    };
    const provider = createTwilioSmsProvider(CONFIG, transport);
    expect(provider.name).toBe(TWILIO_SMS_PROVIDER);
    expect(provider.channel).toBe("sms");

    const outcome = await provider.send(message());
    expect(outcome).toEqual({ status: "accepted", providerMessageId: "SM2" });

    const [{ url, init }] = calls;
    expect(url).toBe(messagesEndpoint(CONFIG));
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from("SKtest:not-a-real-secret").toString("base64")}`,
    );
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(init.body as string);
    expect(form.get("To")).toBe("+447700900001");
    expect(form.get("From")).toBe("OxfLancers");
  });

  it("refuses a recipient off the allowlist before opening a connection", async () => {
    const transport = vi.fn();
    const provider = createTwilioSmsProvider(CONFIG, transport);
    const outcome = await provider.send(message({ recipient: "447700900002" }));
    expect(outcome.status).toBe("refused");
    expect(transport).not.toHaveBeenCalled();
  });

  it("refuses a US recipient with the sender reason, non-retryably, and sends nothing", async () => {
    const transport = vi.fn();
    const provider = createTwilioSmsProvider({ ...CONFIG, tollFreeNumber: null }, transport);
    const outcome = await provider.send(message({ recipient: "12025550123" }));
    expect(outcome).toEqual({
      status: "refused",
      reason: US_SENDER_NOT_READY_REASON,
      retryable: false,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("redacts a number a transport error quotes", async () => {
    const provider = createTwilioSmsProvider(CONFIG, async () => {
      throw new Error("connect ECONNREFUSED to +447700900001");
    });
    const outcome = await provider.send(message());
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.retryable).toBe(true);
    expect(outcome.reason).not.toContain("447700900001");
  });
});

describe("status callbacks", () => {
  const authToken = "not-a-real-auth-token";
  const url = "https://lancers.example.org/api/webhooks/twilio?kind=invitation";
  const params = { MessageSid: "SM3", MessageStatus: "delivered", To: "+447700900001" };

  it("verifies Twilio's signature over the URL and the sorted parameters", () => {
    const header = expectedTwilioSignature(url, params, authToken);
    expect(
      verifyTwilioSignature(url, params, header, {
        authToken,
        appBaseUrl: "https://lancers.example.org",
      }),
    ).toBe(true);
    // A different URL — the loopback host the app sees behind a tunnel, say —
    // is exactly the case the route rebuilds the URL for.
    expect(
      verifyTwilioSignature(
        "http://127.0.0.1:3010/api/webhooks/twilio?kind=invitation",
        params,
        header,
        {
          authToken,
          appBaseUrl: "https://lancers.example.org",
        },
      ),
    ).toBe(false);
    expect(verifyTwilioSignature(url, params, null, { authToken, appBaseUrl: "" })).toBe(false);
    expect(verifyTwilioSignature(url, params, "nope", { authToken, appBaseUrl: "" })).toBe(false);
  });

  it("matches Twilio's documented worked example", () => {
    // https://www.twilio.com/docs/usage/security — "Validating requests".
    const example = expectedTwilioSignature(
      "https://example.com/myapp.php?foo=1&bar=2",
      {
        CallSid: "CA1234567890ABCDE",
        Caller: "+14158675310",
        Digits: "1234",
        From: "+14158675310",
        To: "+18005551212",
      },
      "12345",
    );
    expect(example).toBe("L/OH5YylLD5NRKLltdqwSvS0BnU=");
  });

  it("parses a form body and maps the status vocabulary onto outcomes", () => {
    expect(parseFormBody("MessageSid=SM4&MessageStatus=delivered")).toEqual({
      MessageSid: "SM4",
      MessageStatus: "delivered",
    });
    expect(parseStatusCallback({ MessageSid: "SM4", MessageStatus: "delivered" })).toMatchObject({
      providerEventId: "SM4:delivered",
      providerMessageId: "SM4",
      providerStatus: "delivered",
      outcome: "delivered",
      detail: null,
    });
    for (const status of ["queued", "sending", "sent", "read"]) {
      expect(parseStatusCallback({ MessageSid: "SM4", MessageStatus: status })?.outcome).toBeNull();
    }
  });

  it("carries Twilio's error code into the failure detail, redacted", () => {
    const event = parseStatusCallback({
      MessageSid: "SM5",
      MessageStatus: "undelivered",
      ErrorCode: "30032",
      To: "+12025550123",
    });
    expect(event?.outcome).toBe("failed");
    expect(event?.detail).toContain("30032");
    expect(event?.detail).toContain("toll-free");
    expect(event?.detail).not.toContain("2025550123");
  });

  it("yields nothing for a body with no message identifier", () => {
    expect(parseStatusCallback({ MessageStatus: "delivered" })).toBeNull();
  });
});
