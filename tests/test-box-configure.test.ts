// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PRIVATE_SMS_SETTINGS, settingsFor, TEST_HOST } from "../scripts/test-box/configure.mjs";
import { verificationEnvironment } from "../scripts/test-box/verify.mjs";

const current = {
  SUPABASE_DB_URL: "local-db-placeholder",
  PORT: "3010",
  WHATSAPP_ACCESS_TOKEN: "old-real-token",
  TWILIO_API_KEY_SECRET: "old-real-secret",
  EMAIL_API_BASE_URL: "https://old.example.com",
  TWILIO_API_BASE_URL: "https://old.example.com",
};
const contacts = { phones: ["447700900901"], emails: ["walker@example.test"] };
const privateSettings = {
  TWILIO_ACCOUNT_SID: "ACprivate",
  TWILIO_API_KEY_SID: "SKprivate",
  TWILIO_API_KEY_SECRET: "test-only",
  TWILIO_AUTH_TOKEN: "test-only-token",
  TWILIO_ALPHA_SENDER: "OxfLancers",
  DELIVERY_RECIPIENT_ALLOWLIST: "447700900901",
};
describe("LAN-330 private test configuration", () => {
  it("keeps leased database settings but prevents runtime messaging configuration leaking into verification", () => {
    const local = {
      SUPABASE_DB_URL: "leased-local-db",
      TWILIO_AUTH_TOKEN: "private-placeholder",
      WHATSAPP_APP_SECRET: "stale-placeholder",
      APP_BASE_URL: TEST_HOST,
    };
    const result = verificationEnvironment(
      { SUPABASE_DB_URL: "wrong-shell-db", EMAIL_API_KEY: "shell-placeholder" },
      local,
    );
    expect(result.SUPABASE_DB_URL).toBe("leased-local-db");
    expect(result.TWILIO_AUTH_TOKEN).toBe("");
    expect(result.WHATSAPP_APP_SECRET).toBe("");
    expect(result.APP_BASE_URL).toBe("");
    expect(result.EMAIL_API_KEY).toBe("");
    expect(local.TWILIO_AUTH_TOKEN).toBe("private-placeholder");
  });
  it("writes stubs for every Twilio setting in sink mode and drops stale provider overrides", () => {
    const result = settingsFor("sink", current, {}, "http://127.0.0.1:3010", contacts);
    expect(result.APP_BASE_URL).toBe("http://127.0.0.1:3010");
    expect(result.TWILIO_API_KEY_SECRET).toBe("local-stub-not-a-secret");
    expect(result.TWILIO_AUTH_TOKEN).toBe("local-stub-not-a-secret");
    expect(result.TWILIO_ALPHA_SENDER).toBe("OxfLancers");
    // A stub US sender, so a +1 tester can be intercepted before verification clears.
    expect(result.TWILIO_FROM_TOLL_FREE).toMatch(/^\+1\d{10}$/);
    expect(result.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    expect(result.EMAIL_API_BASE_URL).toBeUndefined();
    expect(result.TWILIO_API_BASE_URL).toBeUndefined();
    expect(result.SUPABASE_DB_URL).toBe(current.SUPABASE_DB_URL);
    expect(result.DELIVERY_RECIPIENT_ALLOWLIST).toBe(contacts.phones.join(","));
  });
  it("requires every private Twilio credential before selecting the tunnel", () => {
    expect(() => settingsFor("sms", current, {}, "http://127.0.0.1:3010", contacts)).toThrow(
      "missing",
    );
    for (const key of PRIVATE_SMS_SETTINGS) {
      expect(() =>
        settingsFor("sms", current, { ...privateSettings, [key]: " " }, "http://x", contacts),
      ).toThrow(key);
    }
    const result = settingsFor("sms", current, privateSettings, "http://127.0.0.1:3010", contacts);
    expect(result.APP_BASE_URL).toBe(TEST_HOST);
    expect(result.EMAIL_API_KEY).toBe("local-stub-not-a-secret");
    expect(result.TWILIO_API_KEY_SECRET).toBe("test-only");
    expect(result.TWILIO_AUTH_TOKEN).toBe("test-only-token");
    // No toll-free number in the private file means none in the app: +1
    // destinations are refused with a reason rather than sent from the name.
    expect(result.TWILIO_FROM_TOLL_FREE).toBeUndefined();
    const withUs = settingsFor(
      "sms",
      current,
      { ...privateSettings, TWILIO_FROM_TOLL_FREE: "+18005550100" },
      "http://x",
      contacts,
    );
    expect(withUs.TWILIO_FROM_TOLL_FREE).toBe("+18005550100");
  });
  it("preserves the provisioned public form URL without enabling actual sends", () => {
    const result = settingsFor(
      "sink",
      { ...current, APP_BASE_URL: TEST_HOST },
      {},
      "http://127.0.0.1:3010",
      contacts,
    );
    expect(result.APP_BASE_URL).toBe(TEST_HOST);
    expect(result.TWILIO_API_KEY_SECRET).toBe("local-stub-not-a-secret");
    expect(result.EMAIL_API_KEY).toBe("local-stub-not-a-secret");
    expect(result.DELIVERY_RECIPIENT_ALLOWLIST).toBe(contacts.phones.join(","));
  });
  it("refuses any other mode", () => {
    expect(() => settingsFor("whatsapp", current, {}, "http://x", contacts)).toThrow("--sms");
  });
});
