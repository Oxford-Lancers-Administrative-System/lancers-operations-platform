import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSessionCookieFitsOneCookie,
  isChunkedSessionCookieName,
  SESSION_COOKIE_NAME,
  SUPABASE_COOKIE_OPTIONS,
} from "./cookies";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const read = (relative: string) => fs.readFileSync(path.join(repoRoot, relative), "utf8");

/**
 * These tests exist because the failure they prevent is invisible. A Supabase
 * client built without `cookieOptions` gets the default `sb-<ref>-auth-token`
 * cookie name, Firebase Hosting strips it, and the only symptom is that signing
 * in silently fails to stick. Nothing throws, nothing is logged, and CI is green.
 */
describe("the session cookie is named for what Firebase Hosting forwards", () => {
  it("is exactly the name Firebase permits", () => {
    // Not a preference. Firebase forwards this name and deletes every other.
    expect(SESSION_COOKIE_NAME).toBe("__session");
    expect(SUPABASE_COOKIE_OPTIONS.name).toBe("__session");
  });

  it.each([
    ["src/lib/supabase/server.ts", "the per-request server client"],
    ["src/lib/supabase/client.ts", "the browser client"],
    ["src/proxy.ts", "the session refresh in the proxy"],
  ])("%s passes the shared cookie options", (file) => {
    // Asserted against the source rather than by constructing a client, because
    // the mistake to catch is a future edit dropping the option entirely.
    expect(read(file)).toContain("cookieOptions: SUPABASE_COOKIE_OPTIONS");
  });

  it("has no client that sets a different cookie name", () => {
    for (const file of [
      "src/lib/supabase/server.ts",
      "src/lib/supabase/client.ts",
      "src/proxy.ts",
    ]) {
      expect(read(file)).not.toMatch(/cookieOptions:\s*\{\s*name:/);
    }
  });
});

describe("a session that outgrows one cookie is loud", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["__session.0", "__session.1", "__session.12"])("recognises %s as a chunk", (name) => {
    expect(isChunkedSessionCookieName(name)).toBe(true);
  });

  it.each(["__session", "__sessionx", "sb-abc-auth-token", "__session.a"])(
    "does not mistake %s for a chunk",
    (name) => {
      expect(isChunkedSessionCookieName(name)).toBe(false);
    },
  );

  it("says nothing while the session still fits", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    assertSessionCookieFitsOneCookie([{ name: "__session" }]);
    expect(error).not.toHaveBeenCalled();
  });

  it("names the chunks, the cause and where to read about it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    assertSessionCookieFitsOneCookie([{ name: "__session.0" }, { name: "__session.1" }]);

    expect(error).toHaveBeenCalledTimes(1);
    const message = error.mock.calls[0][0] as string;
    expect(message).toContain("__session.0");
    expect(message).toContain("__session.1");
    expect(message).toContain("Firebase Hosting");
    expect(message).toContain("0031-firebase-hosting-front-door");
  });

  it("does not throw, because a 500 on every request is worse than a broken sign-in", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => assertSessionCookieFitsOneCookie([{ name: "__session.0" }])).not.toThrow();
  });
});
