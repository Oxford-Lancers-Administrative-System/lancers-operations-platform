// @vitest-environment node
/**
 * The recovery contract — LAN-125.
 *
 * Everything asserted here is a rule the route handler, the two actions and the
 * three screens all consult. The integration halves — that Supabase really does
 * stamp `otp` on a recovery session and `password` on a sign-in, that a spent
 * link really is refused — are in `tests/auth-recovery-flow.test.ts`, against
 * the real auth server. This file is about what the application decides.
 */
import { describe, expect, it } from "vitest";
import {
  INVALID_RECOVERY_LINK_MESSAGE,
  isPlausibleRecoveryTokenHash,
  isRecoveryAuthenticatedSession,
  looksLikeEmailAddress,
  MINIMUM_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  PUBLIC_RECOVERY_CONFIRMATION,
  PUBLIC_RESPONSE_FLOOR_MS,
  RECOVERY_CALLBACK_PATH,
  recoveryCallbackUrl,
  recoveryCompletionDestination,
  remainingPublicResponseDelayMs,
  resolveRecoveryOrigin,
  validateNewPassword,
} from "./recovery";

describe("the public confirmation promises nothing", () => {
  it("does not claim an email was sent", () => {
    // The whole enumeration defence in one sentence: for an unknown address no
    // email was sent, so a message that says one was is an account oracle.
    expect(PUBLIC_RECOVERY_CONFIRMATION).toMatch(/if an account exists/i);
    expect(PUBLIC_RECOVERY_CONFIRMATION).not.toMatch(/\bwe (have )?sent\b|\bemail sent\b/i);
  });

  it("names no account, address, state or provider", () => {
    for (const message of [PUBLIC_RECOVERY_CONFIRMATION, INVALID_RECOVERY_LINK_MESSAGE]) {
      expect(message).not.toMatch(/supabase|gotrue|token|smtp|@/i);
      expect(message).not.toMatch(/\bno account\b|\bnot found\b|\bunknown\b|\bdoes not exist\b/i);
    }
  });
});

describe("ordinary field validation on the address", () => {
  it.each(["operator@oxfordlancers.local", "first.last+tag@example.co.uk", "a@b.io"])(
    "accepts %s",
    (value) => {
      expect(looksLikeEmailAddress(value)).toBe(true);
    },
  );

  it.each(["", "operator", "operator@", "@example.com", "a b@example.com", "two@@example.com"])(
    "refuses %s",
    (value) => {
      expect(looksLikeEmailAddress(value)).toBe(false);
    },
  );

  it("accepts an address that will plainly have no account", () => {
    // Deliberate. Anything well-formed must reach the uniform confirmation; a
    // stricter rule here would answer "that looks unusual" differently from
    // "that has no account", which is the channel this whole flow closes.
    expect(looksLikeEmailAddress("definitely-nobody-at-all@oxfordlancers.local")).toBe(true);
  });
});

describe("the emailed token hash is shape-checked before any round trip", () => {
  it("accepts what GoTrue issues", () => {
    expect(isPlausibleRecoveryTokenHash("9d1273d925d7a6064170239fe8e5eaa45af11aee3ce0b918")).toBe(
      true,
    );
  });

  it.each([
    ["nothing", undefined],
    ["an empty string", ""],
    ["upper case", "9D1273D925D7A6064170239FE8E5EAA45AF11AEE3CE0B918"],
    ["a short value", "9d1273"],
    ["punctuation", "9d1273d9-25d7-a606-4170-239fe8e5eaa4"],
    ["an injection attempt", "9d1273d9' or '1'='1"],
    ["a URL", "https://evil.example/9d1273d9"],
  ])("refuses %s", (_why, value) => {
    expect(isPlausibleRecoveryTokenHash(value)).toBe(false);
  });
});

describe("only a recovery session may set a password", () => {
  it("accepts the amr Supabase stamps on a verified recovery link", () => {
    expect(isRecoveryAuthenticatedSession({ amr: [{ method: "otp", timestamp: 1 }] })).toBe(true);
  });

  it("refuses an ordinary password session", () => {
    // The failure this check exists to prevent: a recovery link produces a
    // normal Supabase session, so a page guarded by "is somebody signed in?"
    // would let anyone at an already-signed-in committee laptop change the
    // password without knowing it.
    expect(isRecoveryAuthenticatedSession({ amr: [{ method: "password", timestamp: 1 }] })).toBe(
      false,
    );
  });

  it.each([
    ["no session at all", undefined],
    ["null claims", null],
    ["claims without amr", { sub: "user" }],
    ["an empty amr", { amr: [] }],
    ["an amr that is not an array", { amr: "otp" }],
    ["a method that is not otp", { amr: [{ method: "mfa/totp" }] }],
    ["an object with no method", { amr: [{}] }],
  ])("refuses %s", (_why, claims) => {
    expect(isRecoveryAuthenticatedSession(claims)).toBe(false);
  });

  it("accepts the bare-string amr form the claim type also allows", () => {
    expect(isRecoveryAuthenticatedSession({ amr: ["otp"] })).toBe(true);
    expect(isRecoveryAuthenticatedSession({ amr: ["password"] })).toBe(false);
  });
});

describe("the recovery link's origin is never taken from an untrusted host", () => {
  it("uses the configured application origin when there is one", () => {
    expect(
      resolveRecoveryOrigin({
        appBaseUrl: "https://lancers.example.org",
        requestOrigin: "https://evil.example",
      }),
    ).toBe("https://lancers.example.org");
  });

  it("ignores the path on the configured value", () => {
    expect(resolveRecoveryOrigin({ appBaseUrl: "https://lancers.example.org/operate" })).toBe(
      "https://lancers.example.org",
    );
  });

  it("falls back to the request origin only when it is loopback", () => {
    expect(resolveRecoveryOrigin({ requestOrigin: "http://localhost:3010" })).toBe(
      "http://localhost:3010",
    );
    expect(resolveRecoveryOrigin({ requestOrigin: "http://127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000",
    );
  });

  it.each([
    "https://evil.example",
    "http://localhost.evil.example",
    "https://lancers-operations-platform.a.run.app",
  ])("refuses the deployed-looking request origin %s", (requestOrigin) => {
    // A Host header is whatever the caller wrote. On a deployed environment the
    // answer is "no link at all", which the action turns into the same uniform
    // confirmation as every other outcome.
    expect(resolveRecoveryOrigin({ requestOrigin })).toBeNull();
  });

  it.each([undefined, null, "", "   ", "not-a-url", "ftp://lancers.example.org"])(
    "refuses the unusable configured value %s",
    (appBaseUrl) => {
      expect(resolveRecoveryOrigin({ appBaseUrl })).toBeNull();
    },
  );

  it("builds the callback on the allow-listed path, and only that path", () => {
    expect(recoveryCallbackUrl({ appBaseUrl: "https://lancers.example.org" })).toBe(
      `https://lancers.example.org${RECOVERY_CALLBACK_PATH}`,
    );
    expect(recoveryCallbackUrl({ requestOrigin: "https://evil.example" })).toBeNull();
  });
});

describe("the password rule is one rule", () => {
  it("refuses anything under the configured minimum", () => {
    expect(validateNewPassword("a".repeat(MINIMUM_PASSWORD_LENGTH - 1), "a".repeat(7))).toBe(
      PASSWORD_TOO_SHORT_MESSAGE,
    );
  });

  it("refuses a mismatch", () => {
    expect(validateNewPassword("correct-horse-battery", "correct-horse-batteru")).toBe(
      PASSWORD_MISMATCH_MESSAGE,
    );
  });

  it("checks length before match, so a short typo is not reported as a mismatch", () => {
    expect(validateNewPassword("short", "different")).toBe(PASSWORD_TOO_SHORT_MESSAGE);
  });

  it("accepts a long password with no composition requirement", () => {
    // `password_requirements = ""` in supabase/config.toml, asserted against
    // this expectation in tests/auth-recovery-configuration.test.ts.
    expect(validateNewPassword("all lower case and long", "all lower case and long")).toBeNull();
  });

  it("never returns the password in the message", () => {
    const message = validateNewPassword("hunter2", "hunter3");
    expect(message).not.toContain("hunter");
  });
});

describe("the public response is held to a floor and quantised", () => {
  it("pads a fast response up to the floor", () => {
    expect(10 + remainingPublicResponseDelayMs(10)).toBe(PUBLIC_RESPONSE_FLOOR_MS);
    expect(60 + remainingPublicResponseDelayMs(60)).toBe(PUBLIC_RESPONSE_FLOOR_MS);
  });

  it("gives the known and unknown address the same total, which is the point", () => {
    // The measured gap on this repository's local stack: ~10 ms for an address
    // with no account, ~60 ms for one with, because the second sends mail.
    expect(10 + remainingPublicResponseDelayMs(10)).toBe(60 + remainingPublicResponseDelayMs(60));
  });

  it("quantises beyond the floor rather than adding a constant", () => {
    // A slow provider must not push the account-exists path past the floor and
    // reopen the channel. Anything in one bucket lands on the same total.
    expect(800 + remainingPublicResponseDelayMs(800)).toBe(1000);
    expect(999 + remainingPublicResponseDelayMs(999)).toBe(1000);
    expect(1001 + remainingPublicResponseDelayMs(1001)).toBe(1250);
  });

  it("never asks for a negative delay", () => {
    expect(remainingPublicResponseDelayMs(60_000)).toBeGreaterThanOrEqual(0);
    expect(remainingPublicResponseDelayMs(-5)).toBeGreaterThanOrEqual(0);
  });
});

describe("where a completed recovery lands", () => {
  it("goes to sign-in with a non-sensitive flag", () => {
    expect(recoveryCompletionDestination(undefined)).toBe("/login?reset=1");
  });

  it("keeps a safe destination", () => {
    expect(recoveryCompletionDestination("/operate/roster")).toBe(
      "/login?reset=1&redirectTo=%2Foperate%2Froster",
    );
  });

  it.each(["https://evil.example", "//evil.example", "/\\evil.example"])(
    "drops the unsafe destination %s",
    (candidate) => {
      expect(recoveryCompletionDestination(candidate)).toBe("/login?reset=1");
    },
  );
});
