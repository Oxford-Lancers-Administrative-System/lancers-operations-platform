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
  // LAN-124. Ofcom's reserved drama range, which can never be dialled.
  DELIVERY_RECIPIENT_ALLOWLIST: "447700900001,447700900002",
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

  describe("LAN-124 — the template parameter shape", () => {
    it("defaults to the club's own invitation, which is the shape with the link", () => {
      // The direction of this default is the point. An unset or misspelled
      // value must resolve to the message that carries an RSVP link, never to
      // the one that does not — invitations nobody can answer, all reported
      // delivered, is the failure worth engineering against.
      for (const raw of [undefined, "", "   ", "invitation", "INVITATION", "nonsense", "no"]) {
        const resolution = resolveOutboundConfig({
          ...DEPLOYED,
          ...(raw === undefined ? {} : { WHATSAPP_TEMPLATE_PARAMETERS: raw }),
        });
        expect(resolution.configured).toBe(true);
        if (!resolution.configured) return;
        expect(resolution.config.templateParameters, JSON.stringify(raw)).toBe("invitation");
      }
    });

    it("takes the parameterless shape only when asked for it exactly", () => {
      // Trimmed and lowercased, so a value pasted with a trailing space still
      // means what the person typing it meant.
      for (const raw of ["none", "NONE", "None", " none ", "None "]) {
        const resolution = resolveOutboundConfig({
          ...DEPLOYED,
          WHATSAPP_TEMPLATE_PARAMETERS: raw,
        });
        expect(resolution.configured).toBe(true);
        if (!resolution.configured) return;
        expect(resolution.config.templateParameters, raw).toBe("none");
      }
    });

    it("is not required, because it has a safe default", () => {
      expect(OUTBOUND_ENVIRONMENT_VARIABLES).not.toContain("WHATSAPP_TEMPLATE_PARAMETERS");
    });
  });

  describe("LAN-124 — the recipient allowlist is required, and its absence is a refusal", () => {
    it("resolves the allowlist onto the configuration", () => {
      const resolution = resolveOutboundConfig(DEPLOYED);
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.recipientAllowlist).toEqual(["447700900001", "447700900002"]);
    });

    it("refuses the whole outbound path when the allowlist is absent", () => {
      // Not "sends to everybody", which is what an allowlist bolted on as an
      // optional filter would do. This is the single most important assertion
      // in the file: it is the difference between an unconfigured deployment
      // sending nothing and an unconfigured deployment messaging the roster.
      const resolution = resolveOutboundConfig({
        ...DEPLOYED,
        DELIVERY_RECIPIENT_ALLOWLIST: "",
      });
      expect(resolution.configured).toBe(false);
      if (resolution.configured) return;
      expect(resolution.missing).toContain("DELIVERY_RECIPIENT_ALLOWLIST");
    });

    it("refuses a value that is present but parses to nobody", () => {
      // Present as a string, absent as a control. A deployment that reported
      // itself configured here would refuse every recipient at send time, which
      // looks like a provider fault rather than a missing setting.
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
        DELIVERY_RECIPIENT_ALLOWLIST: "05550100",
      });
      expect(resolution.configured).toBe(true);
      if (!resolution.configured) return;
      expect(resolution.config.recipientAllowlist).toEqual(["15550100"]);
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

  describe("LAN-124 — free-form text on a deployed revision, opt-in only", () => {
    it("stays template-only when the mode is set but the flag is not", () => {
      // Setting the mode alone must change nothing off loopback. This is the
      // assertion that keeps the relaxation opt-in rather than accidental.
      const overrides = resolveLocalTestOverrides("https://lancers.example.org", {
        WHATSAPP_MESSAGE_MODE: "text",
      });
      expect(overrides.messageMode).toBe("template");
      expect(overrides.recipientOverride).toBeNull();
    });

    it("stays template-only when the flag is set but the mode is not", () => {
      const overrides = resolveLocalTestOverrides("https://lancers.example.org", {
        WHATSAPP_ALLOW_FREE_FORM: "true",
      });
      expect(overrides.messageMode).toBe("template");
    });

    it("permits text only when both are set, and exactly `true`", () => {
      const base = { WHATSAPP_MESSAGE_MODE: "text" };
      for (const flag of ["yes", "1", "TRUE ", "", "false"]) {
        expect(
          resolveLocalTestOverrides("https://lancers.example.org", {
            ...base,
            WHATSAPP_ALLOW_FREE_FORM: flag,
          }).messageMode,
          JSON.stringify(flag),
        ).toBe(flag.trim().toLowerCase() === "true" ? "text" : "template");
      }
    });

    it("never redirects a deployed message to another handset, flag or no flag", () => {
      // The recipient override stays loopback-only. Sending somebody else's
      // message to a different number is a development affordance and has no
      // deployed reading at all.
      const overrides = resolveLocalTestOverrides("https://lancers.example.org", {
        WHATSAPP_ALLOW_FREE_FORM: "true",
        WHATSAPP_MESSAGE_MODE: "text",
        WHATSAPP_TEST_RECIPIENT: "447700900999",
      });
      expect(overrides.recipientOverride).toBeNull();
      expect(overrides.messageMode).toBe("text");
    });

    it("leaves loopback behaviour exactly as it was", () => {
      const overrides = resolveLocalTestOverrides("http://localhost:3010", {
        WHATSAPP_MESSAGE_MODE: "text",
        WHATSAPP_TEST_RECIPIENT: "447700900123",
      });
      expect(overrides.messageMode).toBe("text");
      expect(overrides.recipientOverride).toBe("447700900123");
    });
  });

  it("default to template mode on loopback when no mode is set", () => {
    const overrides = resolveLocalTestOverrides("http://localhost:3010", {});
    expect(overrides.messageMode).toBe("template");
    expect(overrides.recipientOverride).toBeNull();
  });
});
