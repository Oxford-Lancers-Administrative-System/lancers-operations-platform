// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { settingsFor, templateNames, TEST_HOST } from "../scripts/test-box/configure.mjs";
import { verificationEnvironment } from "../scripts/test-box/verify.mjs";

const names = templateNames(fs.readFileSync("src/lib/delivery/templates.ts", "utf8"));
const current = {
  SUPABASE_DB_URL: "local-db-placeholder",
  PORT: "3101",
  WHATSAPP_ALLOW_FREE_FORM: "true",
  WHATSAPP_TEST_RECIPIENT: "old-override",
  WHATSAPP_ACCESS_TOKEN: "old-real-token",
  EMAIL_API_BASE_URL: "https://old.example.com",
  WHATSAPP_GRAPH_BASE_URL: "https://old.example.com",
};
const contacts = { phones: ["447700900901"], emails: ["walker@example.test"] };
describe("LAN-222 private test configuration", () => {
  it("keeps leased database settings but prevents runtime messaging configuration leaking into verification", () => {
    const local = {
      SUPABASE_DB_URL: "leased-local-db",
      WHATSAPP_TEMPLATE_RECRUIT_WELCOME: "recruit_welcome_v1_test",
      WHATSAPP_APP_SECRET: "private-placeholder",
      APP_BASE_URL: TEST_HOST,
    };
    const result = verificationEnvironment(
      { SUPABASE_DB_URL: "wrong-shell-db", EMAIL_API_KEY: "shell-placeholder" },
      local,
    );
    expect(result.SUPABASE_DB_URL).toBe("leased-local-db");
    expect(result.WHATSAPP_TEMPLATE_RECRUIT_WELCOME).toBe("");
    expect(result.WHATSAPP_APP_SECRET).toBe("");
    expect(result.APP_BASE_URL).toBe("");
    expect(result.EMAIL_API_KEY).toBe("");
    expect(local.WHATSAPP_APP_SECRET).toBe("private-placeholder");
  });
  it("uses every declared template with a test suffix and no optional egress overrides", () => {
    const result = settingsFor("sink", current, {}, "http://127.0.0.1:3101", names, contacts);
    expect(Object.keys(names)).toHaveLength(14);
    expect(result.APP_BASE_URL).toBe("http://127.0.0.1:3101");
    expect(result.WHATSAPP_ACCESS_TOKEN).toBe("local-stub-not-a-secret");
    expect(result.WHATSAPP_ALLOW_FREE_FORM).toBeUndefined();
    expect(result.WHATSAPP_TEST_RECIPIENT).toBeUndefined();
    expect(result.EMAIL_API_BASE_URL).toBeUndefined();
    expect(result.WHATSAPP_GRAPH_BASE_URL).toBeUndefined();
    expect(result.SUPABASE_DB_URL).toBe(current.SUPABASE_DB_URL);
    expect(result.WHATSAPP_TEMPLATE_ONBOARDING_CHASE).toBe("onboarding_chase_v1_test");
    expect(result.WHATSAPP_TEMPLATE_NAME).toBe("lancers_event_invitation_test");
    for (const [kind, name] of Object.entries(names)) {
      const key =
        kind === "invitation"
          ? "WHATSAPP_TEMPLATE_NAME"
          : `WHATSAPP_TEMPLATE_${kind.toUpperCase()}`;
      expect(result[key]).toBe(`${name}_test`);
    }
  });
  it("requires private WhatsApp credentials and explicit test recipients before selecting the tunnel", () => {
    expect(() =>
      settingsFor("whatsapp", current, {}, "http://127.0.0.1:3101", names, contacts),
    ).toThrow("missing");
    const result = settingsFor(
      "whatsapp",
      current,
      {
        WHATSAPP_ACCESS_TOKEN: "test-only",
        WHATSAPP_APP_SECRET: "test-only",
        WHATSAPP_PHONE_NUMBER_ID: "123",
        DELIVERY_RECIPIENT_ALLOWLIST: "447700900901",
      },
      "http://127.0.0.1:3101",
      names,
      contacts,
    );
    expect(result.APP_BASE_URL).toBe(TEST_HOST);
    expect(result.EMAIL_API_KEY).toBeUndefined();
    expect(result.WHATSAPP_ACCESS_TOKEN).toBe("test-only");
  });
  it("refuses a registry it cannot read as literal data", () => {
    expect(() =>
      templateNames("export const TEMPLATE_NAMES = Object.freeze({ invitation: getName() });"),
    ).toThrow("literal");
    expect(() => templateNames("export const unrelated = {};")).toThrow("not found");
  });
});
