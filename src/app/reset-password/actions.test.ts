// @vitest-environment node
/**
 * Setting the new password — LAN-125.
 *
 * The claim under test is the one that decides whether this feature is a
 * password reset or a privilege escalation: **the action re-asks whether this
 * session came from a recovery link, and refuses if it did not.** A form post
 * is its own request, and the page's answer a moment earlier is not evidence
 * about it.
 *
 * `updateUser` is mocked here; that it really replaces the password, really
 * retires the old one and really spends the link is proved against the auth
 * server in `tests/auth-recovery-flow.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims, updateUser, signOut } }),
}));

// LAN-131. This action now also ends an invitation, so it reaches the service
// layer — which is `server-only` and, unmocked, opens a database pool. Both are
// stubbed, exactly as every other server-action suite in `src/app` does.
vi.mock("server-only", () => ({}));

// `vi.hoisted`, because this factory returns the spy itself rather than a
// closure over it — `vi.mock` is hoisted above ordinary `const`s, so the spy
// has to be created up there with it.
const { activateOperatorAccount } = vi.hoisted(() => ({ activateOperatorAccount: vi.fn() }));
vi.mock("@/lib/services/operator-invitations", () => ({ activateOperatorAccount }));

// LAN-132. The same screen also completes an administrator email re-home, and
// for the same reason it is stubbed here: this suite is about the action's own
// order of operations, and the service is proved against the real database in
// `src/lib/services/operator-administration.test.ts`.
const { verifyOperatorEmailRehome } = vi.hoisted(() => ({
  verifyOperatorEmailRehome: vi.fn(),
}));
vi.mock("@/lib/services/operator-administration", () => ({ verifyOperatorEmailRehome }));

const redirect = vi.fn((destination: string) => {
  throw new Error(`REDIRECT:${destination}`);
});
vi.mock("next/navigation", () => ({ redirect: (destination: string) => redirect(destination) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  INVALID_RECOVERY_LINK_MESSAGE,
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
} from "@/lib/auth/recovery";
import { completePasswordReset, type ResetPasswordState } from "./actions";

const IDLE: ResetPasswordState = { error: null };
const GOOD = "a-long-enough-new-passphrase";

function submit(fields: { password?: string; confirmPassword?: string; redirectTo?: string } = {}) {
  const formData = new FormData();
  formData.set("password", fields.password ?? GOOD);
  formData.set("confirmPassword", fields.confirmPassword ?? fields.password ?? GOOD);
  if (fields.redirectTo !== undefined) formData.set("redirectTo", fields.redirectTo);
  return completePasswordReset(IDLE, formData);
}

function givenSession(amr: unknown) {
  getClaims.mockResolvedValue({ data: { claims: { sub: "auth-user-id", amr } } });
}

/** Captures the destination a `redirect()` threw its way out with. */
async function destinationOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const match = /^REDIRECT:(.*)$/.exec((error as Error).message);
    if (match) return match[1];
    throw error;
  }
  throw new Error("The action returned instead of redirecting.");
}

beforeEach(() => {
  vi.clearAllMocks();
  givenSession([{ method: "otp", timestamp: 1 }]);
  updateUser.mockResolvedValue({ data: {}, error: null });
  signOut.mockResolvedValue({ error: null });
  activateOperatorAccount.mockResolvedValue(null);
  verifyOperatorEmailRehome.mockResolvedValue(null);
});

describe("this is where an invitation stops being pending — LAN-131", () => {
  it("records the activation against the session's verified subject", async () => {
    await destinationOf(submit());

    // The `sub` from the claim set `getClaims()` verified, never an id a form
    // supplied: this is the one call that decides an account is Active.
    expect(activateOperatorAccount).toHaveBeenCalledExactlyOnceWith("auth-user-id");
    expect(verifyOperatorEmailRehome).toHaveBeenCalledExactlyOnceWith("auth-user-id");
  });

  it("records it only after the password was actually accepted", async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: "weak password" } });

    const state = await submit();

    // An account marked Active whose holder has no password is an account
    // nobody can sign into and no administrator is offered a resend for.
    expect(state.error).toContain("was not accepted");
    expect(activateOperatorAccount).not.toHaveBeenCalled();
    expect(verifyOperatorEmailRehome).not.toHaveBeenCalled();
  });

  it("records nothing for a session that was refused", async () => {
    givenSession([{ method: "password", timestamp: 1 }]);

    await submit();

    expect(activateOperatorAccount).not.toHaveBeenCalled();
    expect(verifyOperatorEmailRehome).not.toHaveBeenCalled();
  });

  it("does not swallow a failure to record it", async () => {
    // The alternative is a person who can sign in while every Administration
    // surface still shows their invitation pending — a divergence nobody would
    // notice until it confused somebody. Their password is already set, so they
    // can sign in from the sign-in page while it is looked at.
    activateOperatorAccount.mockRejectedValue(new Error("database unavailable"));

    await expect(submit()).rejects.toThrow("database unavailable");
    expect(signOut).not.toHaveBeenCalled();
  });
});

describe("only a recovery session may set a password", () => {
  it("refuses an ordinary signed-in session", async () => {
    // The escalation this prevents: a recovery link mints a normal Supabase
    // session, so a check of "is somebody signed in?" would let anyone at an
    // already-signed-in committee laptop change the password without it.
    givenSession([{ method: "password", timestamp: 1 }]);

    const state = await submit();

    expect(state).toEqual({ error: INVALID_RECOVERY_LINK_MESSAGE, expired: true });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each([
    ["no session", undefined],
    ["an empty amr", []],
    ["an unrelated method", [{ method: "mfa/totp" }]],
  ])("refuses %s", async (_why, amr) => {
    if (amr === undefined) getClaims.mockResolvedValue({ data: null });
    else givenSession(amr);

    const state = await submit();

    expect(state.expired).toBe(true);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("asks the auth server itself rather than trusting what the page decided", async () => {
    await destinationOf(submit());

    expect(getClaims).toHaveBeenCalled();
  });

  it("refuses before the policy check, so a refusal says nothing about the password", async () => {
    givenSession([{ method: "password" }]);

    const state = await submit({ password: "short", confirmPassword: "different" });

    expect(state.error).toBe(INVALID_RECOVERY_LINK_MESSAGE);
  });
});

describe("the password rule is applied here as well as in the browser", () => {
  it("refuses a password under the configured minimum", async () => {
    const state = await submit({ password: "a".repeat(MINIMUM_PASSWORD_LENGTH - 1) });

    expect(state).toEqual({ error: PASSWORD_TOO_SHORT_MESSAGE });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("refuses a mismatch", async () => {
    const state = await submit({ password: GOOD, confirmPassword: `${GOOD}x` });

    expect(state).toEqual({ error: PASSWORD_MISMATCH_MESSAGE });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("never echoes the password back to the browser", async () => {
    const state = await submit({ password: GOOD, confirmPassword: "mismatched" });

    expect(JSON.stringify(state)).not.toContain(GOOD);
  });

  it("restates the rule rather than relaying what Supabase said", async () => {
    // Supabase's own message can name the account state. The operator gets the
    // rule they can act on instead.
    updateUser.mockResolvedValue({
      data: null,
      error: { message: "New password should be different from the old password." },
    });

    const state = await submit();

    expect(state.error).toContain(String(MINIMUM_PASSWORD_LENGTH));
    expect(state.error).not.toMatch(/old password|supabase/i);
    expect(state.expired).toBeUndefined();
  });
});

describe("a successful reset ends the recovery session", () => {
  it("updates, signs out, and sends the operator back to sign in", async () => {
    const destination = await destinationOf(submit());

    expect(updateUser).toHaveBeenCalledExactlyOnceWith({ password: GOOD });
    expect(signOut).toHaveBeenCalledOnce();
    expect(destination).toBe("/login?reset=1");
  });

  it("signs out after the update, never before", async () => {
    const order: string[] = [];
    updateUser.mockImplementation(async () => {
      order.push("update");
      return { data: {}, error: null };
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });

    await destinationOf(submit());

    expect(order).toEqual(["update", "signOut"]);
  });

  it("does not sign out when the update failed", async () => {
    // The operator is still mid-recovery and gets another attempt on the same
    // link. Ending the session here would strand them on a spent link.
    updateUser.mockResolvedValue({ data: null, error: { message: "weak password" } });

    await submit();

    expect(signOut).not.toHaveBeenCalled();
  });

  it("keeps a safe destination and drops an unsafe one", async () => {
    expect(await destinationOf(submit({ redirectTo: "/operate/roster" }))).toBe(
      "/login?reset=1&redirectTo=%2Foperate%2Froster",
    );
    expect(await destinationOf(submit({ redirectTo: "https://evil.example" }))).toBe(
      "/login?reset=1",
    );
  });

  it("puts nothing sensitive in the destination", async () => {
    const destination = await destinationOf(submit());

    expect(destination).not.toContain(GOOD);
    expect(destination).not.toMatch(/token|code|email|@/i);
  });
});
