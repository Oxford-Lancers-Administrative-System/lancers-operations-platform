// @vitest-environment node
/**
 * Delivery configuration. LAN-78, re-pointed at Twilio SMS by LAN-330.
 *
 * Every test here passes its own environment object. None of them writes
 * `process.env`: Vitest shares a worker between suites, and a suite that
 * mutates the process leaks into every other one — which for a file about
 * credentials would be a particularly bad way to find out.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  describeMissingConfiguration,
  isAlphanumericSender,
  isLoopbackBaseUrl,
  normaliseTollFreeNumber,
  OUTBOUND_ENVIRONMENT_VARIABLES,
  resolveOutboundConfig,
  resolveWebhookConfig,
  rsvpUrl,
  type EnvironmentSource,
  WEBHOOK_ENVIRONMENT_VARIABLES,
} from "./config";

const DEPLOYED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  TWILIO_ACCOUNT_SID: "ACtest",
  TWILIO_API_KEY_SID: "SKtest",
  TWILIO_API_KEY_SECRET: "not-a-real-secret",
  TWILIO_ALPHA_SENDER: "OxfLancers",
  // LAN-124. Ofcom's reserved drama range, which can never be dialled.
  DELIVERY_RECIPIENT_ALLOWLIST: "447700900001,447700900002",
};

describe("outbound configuration", () => {
  it("resolves when every required variable is present", () => {
    const resolution = resolveOutboundConfig(DEPLOYED);
    expect(resolution.configured).toBe(true);
    if (!resolution.configured) return;

    expect(resolution.config.appBaseUrl).toBe("https://lancers.example.org");
    expect(resolution.config.apiBaseUrl).toBe("https://api.twilio.com");
    expect(resolution.config.alphaSender).toBe("OxfLancers");
    expect(resolution.config.tollFreeNumber).toBeNull();
    expect(resolution.config.defaultCallingCode).toBe("44");
  });

  it.each(OUTBOUND_ENVIRONMENT_VARIABLES)("refuses when %s is absent", (name) => {
    const resolution = resolveOutboundConfig({ ...DEPLOYED, [name]: "" });
    expect(resolution.configured).toBe(false);
    if (resolution.configured) return;
    expect(resolution.missing).toContain(name);
  });

  it("treats whitespace as absence rather than as a value", () => {
    const resolution = resolveOutboundConfig({ ...DEPLOYED, TWILIO_API_KEY_SECRET: "   " });
    expect(resolution.configured).toBe(false);
  });

  describe("LAN-330 — the two senders", () => {
    it("is not required to have a toll-free number, so the UK leg starts before verification", () => {
      expect(OUTBOUND_ENVIRONMENT_VARIABLES).not.toContain("TWILIO_FROM_TOLL_FREE");
    });

    it("carries the toll-free number in E.164 with its plus when one is set", () => {
      const resolution = resolveOutboundConfig({
        ...DEPLOYED,
        TWILIO_FROM_TOLL_FREE: "+1 (800) 555-0100",
      });
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.tollFreeNumber).toBe("+18005550100");
    });

    it.each(["8005550100", "+448005550100", "+1800555", "+1", ""])(
      "treats %s as no toll-free number rather than a wrong one",
      (raw) => {
        expect(normaliseTollFreeNumber(raw)).toBeNull();
      },
    );

    it.each(["OxfLancers", "Lancers", "OULAFC 2026", "A"])(
      "accepts %s as an alphanumeric sender",
      (sender) => {
        expect(isAlphanumericSender(sender)).toBe(true);
      },
    );

    it.each(["OxfordLancers", "12345", "Oxf-Lancers", "", "Oxford_Lancers"])(
      "refuses %s as an alphanumeric sender, and the outbound path with it",
      (sender) => {
        expect(isAlphanumericSender(sender)).toBe(false);
        const resolution = resolveOutboundConfig({ ...DEPLOYED, TWILIO_ALPHA_SENDER: sender });
        expect(resolution.configured).toBe(false);
        if (resolution.configured) return;
        expect(resolution.missing).toContain("TWILIO_ALPHA_SENDER");
      },
    );
  });

  describe("LAN-124 — the recipient allowlist is required, and its absence is a refusal", () => {
    it("resolves the allowlist onto the configuration", () => {
      const resolution = resolveOutboundConfig(DEPLOYED);
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.recipientAllowlist).toEqual(["447700900001", "447700900002"]);
    });

    it("refuses the whole outbound path when the allowlist is absent", () => {
      const resolution = resolveOutboundConfig({
        ...DEPLOYED,
        DELIVERY_RECIPIENT_ALLOWLIST: "",
      });
      expect(resolution.configured).toBe(false);
      if (resolution.configured) return;
      expect(resolution.missing).toContain("DELIVERY_RECIPIENT_ALLOWLIST");
    });

    it("refuses a value that is present but parses to nobody", () => {
      for (const raw of ["   ", ",", ",,;", "not-a-number"]) {
        const resolution = resolveOutboundConfig({
          ...DEPLOYED,
          DELIVERY_RECIPIENT_ALLOWLIST: raw,
        });
        expect(resolution.configured, JSON.stringify(raw)).toBe(false);
        if (resolution.configured) return;
        expect(resolution.missing).toContain("DELIVERY_RECIPIENT_ALLOWLIST");
      }
    });

    it("keeps one usable number when another entry is unparseable", () => {
      const resolution = resolveOutboundConfig({
        ...DEPLOYED,
        DELIVERY_RECIPIENT_ALLOWLIST: "nonsense, 07700900001",
      });
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.recipientAllowlist).toEqual(["447700900001"]);
    });

    it("normalises against the deployment's own calling code", () => {
      const resolution = resolveOutboundConfig({
        ...DEPLOYED,
        DELIVERY_DEFAULT_CALLING_CODE: "1",
        DELIVERY_RECIPIENT_ALLOWLIST: "02025550123",
      });
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.recipientAllowlist).toEqual(["12025550123"]);
    });

    it("never names a number in the sentence an operator reads", () => {
      const sentence = describeMissingConfiguration(["DELIVERY_RECIPIENT_ALLOWLIST"]);
      expect(sentence).toContain("DELIVERY_RECIPIENT_ALLOWLIST");
      expect(sentence).not.toMatch(/\d{6,}/);
    });
  });

  it("strips a trailing slash so a link never carries a double slash", () => {
    const resolution = resolveOutboundConfig({
      ...DEPLOYED,
      APP_BASE_URL: "https://lancers.example.org/",
    });
    expect(resolution.configured).toBe(true);
    if (!resolution.configured) return;
    expect(rsvpUrl(resolution.config.appBaseUrl, "abc")).toBe(
      "https://lancers.example.org/rsvp/abc",
    );
  });

  it.each(WEBHOOK_ENVIRONMENT_VARIABLES)("refuses the webhook path when %s is absent", (name) => {
    const complete = {
      APP_BASE_URL: "https://lancers.example.org/",
      TWILIO_AUTH_TOKEN: "not-a-real-token",
    };
    expect(resolveWebhookConfig({ ...complete, [name]: "" }).configured).toBe(false);
    const resolved = resolveWebhookConfig(complete);
    expect(resolved.configured).toBe(true);
    if (!resolved.configured) return;
    expect(resolved.config.appBaseUrl).toBe("https://lancers.example.org");
  });

  it("resolves outbound without the webhook secret, and the reverse", () => {
    expect(resolveOutboundConfig(DEPLOYED).configured).toBe(true);
    expect(resolveWebhookConfig(DEPLOYED).configured).toBe(false);
  });
});

describe("the missing-configuration sentence", () => {
  it("names the variables and never their values", () => {
    const message = describeMissingConfiguration(["TWILIO_API_KEY_SECRET"]);
    expect(message).toContain("TWILIO_API_KEY_SECRET");
    expect(message).not.toContain(DEPLOYED.TWILIO_API_KEY_SECRET as string);
  });

  it("says whose problem it is, because an operator cannot fix one", () => {
    expect(describeMissingConfiguration(["APP_BASE_URL"])).toMatch(/administrator/i);
  });
});

describe("the loopback guard", () => {
  it.each([
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://app.localhost:3010",
    "https://localhost",
  ])("recognises %s as loopback", (url) => {
    expect(isLoopbackBaseUrl(url)).toBe(true);
  });

  it.each([
    // The one a substring match gets wrong, and the reason this parses a URL.
    "https://localhost.example.com",
    "https://lancers.example.org",
    "https://127.0.0.1.example.com",
    "not a url at all",
    "",
  ])("does not mistake %s for loopback", (url) => {
    expect(isLoopbackBaseUrl(url)).toBe(false);
  });
});
