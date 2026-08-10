// @vitest-environment node
/**
 * Email/password authentication, end to end against the local Supabase stack.
 *
 * This is the whole authentication scope of this ticket: one pre-provisioned
 * user, password sign-in, no public registration. No roles, no profile table,
 * no invitations — asserting their absence is part of the point.
 *
 * Requires `npm run db:start` and `npm run db:seed-user`. CI does both.
 */
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.TEST_USER_EMAIL ?? "test.user@oxfordlancers.local";
const password = process.env.TEST_USER_PASSWORD;

const configured = Boolean(url && publishableKey && password);

if (process.env.REQUIRE_SUPABASE_TESTS === "1" && !configured) {
  throw new Error("REQUIRE_SUPABASE_TESTS=1 but local Supabase / test user env is incomplete.");
}

function anonClient() {
  return createClient(url!, publishableKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

describe.runIf(configured)("email/password authentication", () => {
  it("signs the pre-provisioned user in", async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({
      email,
      password: password!,
    });

    expect(error).toBeNull();
    expect(data.session?.access_token).toBeTruthy();
    expect(data.user?.email).toBe(email);
  });

  it("rejects a wrong password", async () => {
    const { data, error } = await anonClient().auth.signInWithPassword({
      email,
      password: "definitely-not-the-password",
    });

    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("refuses public self-registration", async () => {
    // enable_signup = false in supabase/config.toml. If this ever starts
    // passing, anyone on the internet can create an account.
    const { data, error } = await anonClient().auth.signUp({
      email: `should-not-exist-${Date.now()}@oxfordlancers.local`,
      password: "AnotherLongEnoughPassword1!",
    });

    expect(error, "public sign-up succeeded — registration is not disabled").not.toBeNull();
    expect(data.session).toBeNull();
  });

  it("issues an authenticated role, not an elevated one", async () => {
    const { data } = await anonClient().auth.signInWithPassword({ email, password: password! });
    const claims = JSON.parse(
      Buffer.from(data.session!.access_token.split(".")[1], "base64url").toString("utf8"),
    );

    expect(claims.role).toBe("authenticated");
    // No application roles exist in this ticket, by design.
    expect(claims.app_metadata?.roles).toBeUndefined();
  });
});
