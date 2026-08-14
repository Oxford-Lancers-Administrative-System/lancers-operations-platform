// @vitest-environment node
/**
 * Delivery configuration, and the guard that keeps the test affordances out of
 * production. LAN-78.
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
  isLoopbackBaseUrl,
  OUTBOUND_ENVIRONMENT_VARIABLES,
  resolveLocalTestOverrides,
  resolveOutboundConfig,
  resolveWebhookConfig,
  rsvpUrl,
  type EnvironmentSource,
  WEBHOOK_ENVIRONMENT_VARIABLES,
} from "./config";

const DEPLOYED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
};

describe("outbound configuration", () => {
  it("resolves when every required variable is present", () => {
    const resolution = resolveOutboundConfig(DEPLOYED);
    expect(resolution.configured).toBe(true);
    if (!resolution.configured) return;

    expect(resolution.config.appBaseUrl).toBe("https://lancers.example.org");
    expect(resolution.config.graphBaseUrl).toBe("https://graph.facebook.com");
    expect(resolution.config.templateLanguage).toBe("en_GB");
    expect(resolution.config.defaultCallingCode).toBe("44");
  });

  it.each(OUTBOUND_ENVIRONMENT_VARIABLES)("refuses when %s is absent", (name) => {
    const resolution = resolveOutboundConfig({ ...DEPLOYED, [name]: "" });
    expect(resolution.configured).toBe(false);
    if (resolution.configured) return;
    expect(resolution.missing).toContain(name);
  });

  it("treats whitespace as absence rather than as a value", () => {
    const resolution = resolveOutboundConfig({ ...DEPLOYED, WHATSAPP_ACCESS_TOKEN: "   " });
    expect(resolution.configured).toBe(false);
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
      WHATSAPP_APP_SECRET: "not-a-real-secret",
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: "not-a-real-verify-token",
    };
    expect(resolveWebhookConfig({ ...complete, [name]: "" }).configured).toBe(false);
    expect(resolveWebhookConfig(complete).configured).toBe(true);
  });

  it("resolves outbound without the webhook secrets, and the reverse", () => {
    // The whole reason the two halves are separate: the non-production test
    // path sends without receiving, because LAN-93 still owes a public
    // endpoint. Demanding all six would make that configuration impossible.
    expect(resolveOutboundConfig(DEPLOYED).configured).toBe(true);
    expect(resolveWebhookConfig(DEPLOYED).configured).toBe(false);
  });
});

describe("the missing-configuration sentence", () => {
  it("names the variables and never their values", () => {
    const message = describeMissingConfiguration(["WHATSAPP_ACCESS_TOKEN"]);
    expect(message).toContain("WHATSAPP_ACCESS_TOKEN");
    expect(message).not.toContain(DEPLOYED.WHATSAPP_ACCESS_TOKEN as string);
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

describe("the local test affordances", () => {
  const WITH_OVERRIDES: EnvironmentSource = {
    WHATSAPP_TEST_RECIPIENT: "447700900123",
    WHATSAPP_MESSAGE_MODE: "text",
  };

  it("are honoured on a loopback deployment", () => {
    const overrides = resolveLocalTestOverrides("http://localhost:3010", WITH_OVERRIDES);
    expect(overrides.recipientOverride).toBe("447700900123");
    expect(overrides.messageMode).toBe("text");
  });

  /**
   * The test this whole guard exists for.
   *
   * A deployed environment that has somehow acquired both variables — copied
   * from a developer's file, left in a Secret Manager entry, set by a script —
   * must still send the approved template to the recorded contact point. If
   * this ever fails, a production deployment can redirect every club invitation
   * to one number.
   */
  it("are inert on a deployed one, however the environment is set", () => {
    const overrides = resolveLocalTestOverrides("https://lancers.example.org", WITH_OVERRIDES);
    expect(overrides.recipientOverride).toBeNull();
    expect(overrides.messageMode).toBe("template");
  });

  it("are inert for a host that merely contains 'localhost'", () => {
    const overrides = resolveLocalTestOverrides("https://localhost.example.com", WITH_OVERRIDES);
    expect(overrides.recipientOverride).toBeNull();
    expect(overrides.messageMode).toBe("template");
  });

  it("reach the resolved configuration, so no caller re-derives the guard", () => {
    const deployed = resolveOutboundConfig({ ...DEPLOYED, ...WITH_OVERRIDES });
    expect(deployed.configured).toBe(true);
    if (!deployed.configured) return;
    expect(deployed.config.localTest.recipientOverride).toBeNull();
    expect(deployed.config.localTest.messageMode).toBe("template");

    const local = resolveOutboundConfig({
      ...DEPLOYED,
      ...WITH_OVERRIDES,
      APP_BASE_URL: "http://localhost:3010",
    });
    expect(local.configured).toBe(true);
    if (!local.configured) return;
    expect(local.config.localTest.recipientOverride).toBe("447700900123");
  });

  it("default to template mode on loopback when no mode is set", () => {
    const overrides = resolveLocalTestOverrides("http://localhost:3010", {});
    expect(overrides.messageMode).toBe("template");
    expect(overrides.recipientOverride).toBeNull();
  });
});
