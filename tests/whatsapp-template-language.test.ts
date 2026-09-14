// @vitest-environment node
/**
 * The outbound template language cannot drift from what the club approved —
 * LAN-351.
 *
 * Meta resolves an approved template by name AND language together. The
 * club's fourteen approved production templates
 * (`scripts/production/whatsapp-templates.json`) are all one language, and
 * `DEFAULTS.WHATSAPP_TEMPLATE_LANGUAGE` in `src/lib/delivery/config.ts` has to
 * default to that same value or every unconfigured send fails at Meta with
 * "template does not exist" — which is exactly what happened when the
 * default read `en_GB` against templates approved as `en`.
 *
 * So this does not hard-code the expected language. It reads the same
 * checked-in submission record production sends against and fails if the two
 * are ever pointed at different values again. It lives here, outside `src/`,
 * because `tests/production-smoke-contract.test.ts` forbids any application
 * source file from naming `scripts/production` — that path is for owner-run
 * procedures, not something the running application may reference.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveOutboundConfig, type EnvironmentSource } from "../src/lib/delivery/config";

interface SubmissionRecord {
  readonly language: string;
}

const records: SubmissionRecord[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts/production/whatsapp-templates.json"), "utf8"),
);

const DEPLOYED: EnvironmentSource = {
  APP_BASE_URL: "https://lancers.example.org",
  WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  WHATSAPP_ACCESS_TOKEN: "not-a-real-token",
  WHATSAPP_TEMPLATE_NAME: "event_invitation",
};

describe("the outbound template language default", () => {
  it("has one language across all fourteen approved production templates", () => {
    const languages = new Set(records.map((record) => record.language));
    expect(records.length).toBeGreaterThan(0);
    expect(languages.size).toBe(1);
  });

  it("defaults to that same value with no override", () => {
    const [approvedLanguage] = records.map((record) => record.language);
    const resolution = resolveOutboundConfig(DEPLOYED);
    expect(resolution.configured).toBe(true);
    if (!resolution.configured) return;
    expect(resolution.config.templateLanguage).toBe(approvedLanguage);
  });
});
