// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const script = path.join(root, "scripts", "create-test-user.mjs");

function invoke(url: string) {
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: url,
      SUPABASE_SECRET_KEY: "test-placeholder",
      TEST_USER_EMAIL: "local-review@example.test",
      TEST_USER_PASSWORD: "local-test-password-123",
    },
  });
}

describe("local review user endpoint guard", () => {
  it.each([
    "https://project.supabase.co",
    "http://preview.example.test:54321",
    "http://localhost.example.test:54321",
    "http://10.0.0.5:54321",
  ])("refuses non-loopback endpoint %s before making a request", (url) => {
    const result = invoke(url);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/not a local Supabase URL/i);
  });
});
