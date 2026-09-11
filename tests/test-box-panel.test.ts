// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  effectivePersonSettings,
  requestAllowed,
  validatePersonSettings,
} from "../scripts/test-box/panel-state.mjs";
import { observedStatus } from "../scripts/test-box/panel-data.mjs";
vi.mock("server-only", () => ({}));

const person = { phone: "447700900901" };
function request(headers: Record<string, string | undefined> = {}) {
  return {
    socket: { remoteAddress: "127.0.0.1" },
    headers: { host: "127.0.0.1:43210", ...headers },
  };
}
describe("LAN-222 panel boundaries", () => {
  it("refuses remote peers, rebinding hosts and foreign browser origins", () => {
    expect(requestAllowed(request(), 43210)).toBe(true);
    expect(requestAllowed({ ...request(), socket: { remoteAddress: "192.0.2.1" } }, 43210)).toBe(
      false,
    );
    for (const headers of [
      { host: "evil.example:43210" },
      { origin: "https://evil.example" },
      { "sec-fetch-site": "cross-site" },
    ])
      expect(requestAllowed(request(headers), 43210)).toBe(false);
  });
  it("requires same-origin JSON, session cookie and action token for mutations", () => {
    const headers = {
      origin: "http://127.0.0.1:43210",
      "content-type": "application/json",
      cookie: "lancers_test_panel=session",
      "x-test-panel": "csrf",
    };
    const options = { mutation: true, session: "session", csrf: "csrf" };
    expect(requestAllowed(request(headers), 43210, options)).toBe(true);
    for (const key of Object.keys(headers)) {
      const incomplete = { ...headers };
      delete incomplete[key as keyof typeof headers];
      expect(requestAllowed(request(incomplete), 43210, options)).toBe(false);
    }
  });
  it("never gives real people simulated responses and never selects real delivery implicitly", () => {
    expect(effectivePersonSettings(null, person).delivery).toBe("intercepted");
    expect(() => validatePersonSettings({ identity: "real", responder: "prompt" }, person)).toThrow(
      "synthetic",
    );
    expect(() =>
      validatePersonSettings({ identity: "synthetic", delivery: "real" }, person),
    ).toThrow("real person");
    const real = validatePersonSettings({ identity: "real", delivery: "real" }, person);
    expect(real).toHaveProperty("responder", "none");
    expect(effectivePersonSettings(real, { phone: "447700900902" }).delivery).toBe("intercepted");
  });
  it("does not claim real delivery from acceptance or local capture", () => {
    expect(observedStatus({ accepted_at: "2026-09-09T12:00:00Z" }, null, 0)).toBe("accepted");
    expect(observedStatus({ outcome: "delivered" }, {}, 0)).toBe("simulated_delivered");
    expect(observedStatus({}, {}, 0)).toBe("captured");
    expect(observedStatus({ outcome: "delivered" }, null, 0)).toBe("delivered_evidence");
    expect(observedStatus({ outcome: "delivered" }, { transport: "real" }, 0)).toBe(
      "delivered_evidence",
    );
    expect(observedStatus({ accepted_at: "2026-09-09T12:00:00Z" }, { transport: "real" }, 0)).toBe(
      "accepted",
    );
  });
});

describe("LAN-222 actual egress selection", () => {
  it("intercepts unknown and unselected destinations, even if routable", async () => {
    const { routeRecipient } = await import("../scripts/test-box/routing.mjs");
    expect(routeRecipient("447700900901", [{ id: "a", phone: "07700 900901" }], {}).mode).toBe(
      "intercepted",
    );
    expect(routeRecipient("447700900999", [], {}).mode).toBe("intercepted");
  });
  it("requires one explicitly selected real identity, current destination and no simulation", async () => {
    const { routeRecipient } = await import("../scripts/test-box/routing.mjs");
    const people = [{ id: "a", phone: "07700 900901" }];
    const settings = {
      a: { identity: "real", delivery: "real", responder: "none", destination: "447700900901" },
    };
    expect(routeRecipient("447700900901", people, settings).mode).toBe("real");
    expect(() =>
      routeRecipient("447700900901", [...people, { id: "b", phone: "447700900901" }], settings),
    ).toThrow("more than one");
    expect(() =>
      routeRecipient("447700900901", people, { a: { ...settings.a, destination: "447700900902" } }),
    ).toThrow("confirm");
    expect(() =>
      routeRecipient("447700900901", people, { a: { ...settings.a, responder: "prompt" } }),
    ).toThrow("confirm");
  });
  it("refuses arbitrary endpoints and malformed Twilio forms before any network call", async () => {
    const { assertProviderRequest } = await import("../scripts/test-box/routing.mjs");
    const form = {
      To: "+447700900901",
      From: "OxfLancers",
      Body: "Oxford Lancers: hello",
      StatusCallback: "https://tunnel.example/api/webhooks/twilio?kind=invitation",
    };
    expect(
      assertProviderRequest("https://api.twilio.com/2010-04-01/Accounts/ACstub/Messages.json", form)
        .hostname,
    ).toBe("api.twilio.com");
    expect(() =>
      assertProviderRequest("https://example.com/2010-04-01/Accounts/x/Messages.json", form),
    ).toThrow();
    expect(() =>
      assertProviderRequest("https://api.twilio.com/2010-04-01/Accounts/x/Messages.json", {
        ...form,
        To: "447700900901",
      }),
    ).toThrow();
    expect(() =>
      assertProviderRequest("https://api.twilio.com/2010-04-01/Accounts/x/Messages.json", {
        ...form,
        StatusCallback: "",
      }),
    ).toThrow();
  });
});

describe("LAN-222 production exclusion", () => {
  it("keeps the production seam inert even when test variables are present", async () => {
    const hooks = await import("../src/lib/test-runtime");
    const env = {
      LANCERS_TEST_BOX: "1",
      K_SERVICE: "production",
      APP_BASE_URL: "http://localhost:3101",
    };
    expect(hooks.testTransport(env)).toBeNull();
    expect(hooks.testRecipientsUnrestricted()).toBe(false);
    expect(hooks.testSource(env)).toBe(env);
    expect(hooks.applicationSql("select now()")).toBe("select now()");
  });
  it("uses a built-in development and server-only loader condition", async () => {
    const { default: config } = await import("../next.config");
    expect(config.turbopack?.rules?.["test-runtime.ts"]).toMatchObject({
      condition: { all: ["development", "node", { not: "browser" }] },
    });
  });
});
