import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSupabasePublishableKey, getSupabaseSecretKey, getSupabaseUrl } from "./env";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("supabase environment resolution", () => {
  it("reads the API URL", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    expect(getSupabaseUrl()).toBe("http://127.0.0.1:54321");
  });

  it("prefers the current publishable key over the legacy anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_current";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";
    expect(getSupabasePublishableKey()).toBe("sb_publishable_current");
  });

  it("falls back to the legacy anon key", () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "legacy_anon";
    expect(getSupabasePublishableKey()).toBe("legacy_anon");
  });

  it("accepts either name for the privileged server-only key", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy_service_role";
    expect(getSupabaseSecretKey()).toBe("legacy_service_role");
    process.env.SUPABASE_SECRET_KEY = "sb_secret_current";
    expect(getSupabaseSecretKey()).toBe("sb_secret_current");
  });

  it("fails loudly rather than silently using an empty key", () => {
    expect(() => getSupabaseUrl()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    expect(() => getSupabasePublishableKey()).toThrow(/PUBLISHABLE/);
    expect(() => getSupabaseSecretKey()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("never exposes the privileged key under a NEXT_PUBLIC_ name", () => {
    // A NEXT_PUBLIC_ prefix would inline the value into the browser bundle.
    // This asserts the contract of the module, not just today's implementation.
    const source = getSupabaseSecretKey.toString();
    expect(source).not.toMatch(/NEXT_PUBLIC/);
  });
});
