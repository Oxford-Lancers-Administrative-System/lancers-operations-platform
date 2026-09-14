// @vitest-environment node
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  settingsFor,
  templateNames,
  testTemplateName,
  TEST_HOST,
} from "../scripts/test-box/configure.mjs";
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

/**
 * Does `src/app` serve this approved button prefix, with one more dynamic
 * segment for the token Meta appends? Literal segments match a directory of
 * that name; anything else has to be the route's own `[param]`. LAN-349: the
 * eight single-button bases were approved against routes LAN-343 had not
 * built yet, and half of them landed on a 404 for a day.
 */
function routeExists(base: string): boolean {
  let directory = "src/app";
  for (const segment of base.split("/").filter(Boolean)) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    const match =
      entries.find((entry) => entry.isDirectory() && entry.name === segment) ??
      entries.find((entry) => entry.isDirectory() && /^\[[^.\]]+\]$/.test(entry.name));
    if (!match) return false;
    directory = `${directory}/${match.name}`;
  }
  // The token itself: one dynamic segment with a page under this prefix.
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .some(
      (entry) =>
        entry.isDirectory() &&
        /^\[[^.\]]+\]$/.test(entry.name) &&
        fs.existsSync(`${directory}/${entry.name}/page.tsx`),
    );
}
describe("LAN-222 private test configuration", () => {
  it("keeps leased database settings but prevents runtime messaging configuration leaking into verification", () => {
    const local = {
      SUPABASE_DB_URL: "leased-local-db",
      WHATSAPP_TEMPLATE_RECRUIT_WELCOME: "recruit_welcome_v2_test",
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
  it("uses every declared template's Utility test name and no optional egress overrides", () => {
    const result = settingsFor("sink", current, {}, "http://127.0.0.1:3101", names, contacts);
    expect(Object.keys(names)).toHaveLength(14);
    expect(result.APP_BASE_URL).toBe("http://127.0.0.1:3101");
    expect(result.WHATSAPP_ACCESS_TOKEN).toBe("local-stub-not-a-secret");
    expect(result.WHATSAPP_ALLOW_FREE_FORM).toBeUndefined();
    expect(result.WHATSAPP_TEST_RECIPIENT).toBeUndefined();
    expect(result.EMAIL_API_BASE_URL).toBeUndefined();
    expect(result.WHATSAPP_GRAPH_BASE_URL).toBeUndefined();
    expect(result.SUPABASE_DB_URL).toBe(current.SUPABASE_DB_URL);
    expect(result.WHATSAPP_TEMPLATE_ONBOARDING_CHASE).toBe("onboarding_chase_v3_test");
    expect(result.WHATSAPP_TEMPLATE_NAME).toBe("lancers_event_invitation_v2_test");
    // LAN-335/349: the production version suffix is replaced, never stacked —
    // production is on `_v2` with the invitation on `_v3`, and neither moves
    // the approved test names.
    // LAN-344: the eight rebuilt templates are `_v3_test`; the six others stay `_v2_test`.
    expect(result.WHATSAPP_TEMPLATE_RECRUIT_WELCOME).toBe("recruit_welcome_v3_test");
    expect(result.WHATSAPP_TEMPLATE_RECRUIT_EVENT_FOLLOWUP).toBe("recruit_event_followup_v2_test");
    for (const [kind, name] of Object.entries(names)) {
      const key =
        kind === "invitation"
          ? "WHATSAPP_TEMPLATE_NAME"
          : `WHATSAPP_TEMPLATE_${kind.toUpperCase()}`;
      expect(result[key]).toBe(testTemplateName(name));
    }
  });
  // LAN-349. The box sends against the fourteen templates that are actually
  // approved at Meta, and its only link to them is `testTemplateName()`. A
  // production rename that this derivation does not absorb would send a name
  // Meta has never seen, so the derivation is checked against the checked-in
  // submission records rather than against itself.
  it("derives exactly the fourteen approved test template names, each on a route this app serves", () => {
    const records = JSON.parse(fs.readFileSync("scripts/test-box/templates-test.json", "utf8")) as {
      name: string;
      kind: string;
      buttons?: { url: string }[];
    }[];
    expect(new Set(Object.values(names).map(testTemplateName))).toEqual(
      new Set(records.map((record) => record.name)),
    );
    for (const record of records) {
      expect(testTemplateName(names[record.kind as keyof typeof names])).toBe(record.name);
      for (const button of record.buttons ?? []) {
        // The fixed prefix Meta approved, minus the host and the `{{1}}` the
        // send fills in. Read off the raw string: `URL.pathname` escapes the
        // braces and the base stops matching a route.
        const base = button.url.replace(/^https?:\/\/[^/]+/, "").replace(/\{\{1\}\}$/, "");
        expect(routeExists(base)).toBe(true);
      }
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
    expect(result.EMAIL_API_KEY).toBe("local-stub-not-a-secret");
    expect(result.WHATSAPP_ACCESS_TOKEN).toBe("test-only");
  });
  it("preserves the provisioned public form URL without enabling actual sends", () => {
    const result = settingsFor(
      "sink",
      { ...current, APP_BASE_URL: TEST_HOST },
      {},
      "http://127.0.0.1:3101",
      names,
      contacts,
    );
    expect(result.APP_BASE_URL).toBe(TEST_HOST);
    expect(result.WHATSAPP_ACCESS_TOKEN).toBe("local-stub-not-a-secret");
    expect(result.EMAIL_API_KEY).toBe("local-stub-not-a-secret");
    expect(result.DELIVERY_RECIPIENT_ALLOWLIST).toBe(contacts.phones.join(","));
  });
  it("refuses a registry it cannot read as literal data", () => {
    expect(() =>
      templateNames("export const TEMPLATE_NAMES = Object.freeze({ invitation: getName() });"),
    ).toThrow("literal");
    expect(() => templateNames("export const unrelated = {};")).toThrow("not found");
  });
});
