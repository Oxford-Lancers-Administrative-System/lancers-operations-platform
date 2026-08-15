// @vitest-environment node
/**
 * `/forgot-password`'s server action — LAN-125.
 *
 * The subject is one property: **every outcome is the same outcome**. Supabase
 * is mocked so that the outcomes an integration test cannot produce on demand —
 * a provider refusal, the per-address frequency limit, a transport failure —
 * are all reachable, and so that the timing assertions are about the action's
 * own padding rather than about a local container's mood.
 *
 * The real Supabase halves are in `tests/auth-recovery-flow.test.ts`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/stateless", () => ({
  createStatelessClient: () => ({ auth: { resetPasswordForEmail } }),
}));

const requestHeaders = vi.fn<() => Headers>();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders() }));

import { PUBLIC_RECOVERY_CONFIRMATION, PUBLIC_RESPONSE_FLOOR_MS } from "@/lib/auth/recovery";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const IDLE: ForgotPasswordState = { status: "idle" };

/** Wall-clock slack. See the note in the timing describe; the rule itself is exact. */
const TIMER_SLACK_MS = 25;

const EXISTING = "operator@oxfordlancers.local";
const UNKNOWN = "nobody-at-all@oxfordlancers.local";

/**
 * Submits, and lets the action's own padding elapse on a fake clock.
 *
 * The padding is three quarters of a second by design, and paying it twenty
 * times over would put this file among the slowest in the suite for no added
 * confidence. That the pad is really applied, and applied equally, is measured
 * against the real clock in its own describe below.
 */
async function submit(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  vi.useFakeTimers();
  try {
    const answered = requestPasswordReset(IDLE, formData);
    await vi.runAllTimersAsync();
    return await answered;
  } finally {
    vi.useRealTimers();
  }
}

/** The same submission, on the real clock, for the timing assertions. */
function submitAndTime(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  return requestPasswordReset(IDLE, formData);
}

function givenHeaders(entries: Record<string, string>) {
  requestHeaders.mockReturnValue(new Headers(entries));
}

/** The account-exists path is the slower one in reality, so it is here too. */
function givenSupabase(behaviour: "sent" | "unknown" | "refused" | "rate-limited" | "throws") {
  resetPasswordForEmail.mockImplementation(async () => {
    if (behaviour === "throws") throw new Error("connect ECONNREFUSED");
    await new Promise((resolve) => setTimeout(resolve, behaviour === "sent" ? 60 : 5));
    if (behaviour === "refused") return { data: null, error: { message: "provider unavailable" } };
    if (behaviour === "rate-limited") {
      return {
        data: null,
        error: { status: 429, code: "over_email_send_rate_limit", message: "too soon" },
      };
    }
    return { data: {}, error: null };
  });
}

let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleLog: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  givenHeaders({ host: "localhost:3000" });
  givenSupabase("sent");
  consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("every outcome is the same outcome", () => {
  it.each(["sent", "unknown", "refused", "rate-limited", "throws"] as const)(
    "answers identically when Supabase %s",
    async (behaviour) => {
      givenSupabase(behaviour);

      const state = await submit(behaviour === "unknown" ? UNKNOWN : EXISTING);

      expect(state).toEqual({ status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION });
    },
  );

  it("answers identically when the deployment has no origin to build a link from", async () => {
    // Not a visible failure: an unconfigured deployment must not become an
    // account oracle by refusing differently from an unknown address.
    givenHeaders({ host: "lancers.example.org", "x-forwarded-proto": "https" });

    const state = await submit(EXISTING);

    expect(state).toEqual({ status: "confirmed", message: PUBLIC_RECOVERY_CONFIRMATION });
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("says nothing about the account in any log line", async () => {
    givenSupabase("sent");
    await submit(EXISTING);
    givenSupabase("unknown");
    await submit(UNKNOWN);

    const written = [consoleWarn, consoleLog, consoleError]
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .join(" ");

    expect(written).not.toContain(EXISTING);
    expect(written).not.toContain(UNKNOWN);
    expect(written).not.toMatch(/exists|unknown|not found|sent/i);
  });

  it("names the missing configuration, and only that, when unconfigured", async () => {
    givenHeaders({ host: "lancers.example.org", "x-forwarded-proto": "https" });

    await submit(EXISTING);

    const written = consoleWarn.mock.calls.flat().join(" ");
    expect(written).toContain("APP_BASE_URL");
    expect(written).not.toContain(EXISTING);
  });
});

describe("timing carries no signal either", () => {
  it("holds both the known and the unknown address to the same floor", async () => {
    givenSupabase("sent");
    const startedSent = Date.now();
    await submitAndTime(EXISTING);
    const sentMs = Date.now() - startedSent;

    givenSupabase("unknown");
    const startedUnknown = Date.now();
    await submitAndTime(UNKNOWN);
    const unknownMs = Date.now() - startedUnknown;

    // The measured gap this closes is ~50 ms on the real stack. Both must clear
    // the floor, and — the assertion that matters — must be indistinguishable
    // from each other.
    //
    // The tolerance is against the clock, not the rule: a `setTimeout(750)` can
    // fire a millisecond before `Date.now()` agrees 750 have passed, which
    // failed this once at 749. `remainingPublicResponseDelayMs` is asserted
    // exactly, on arithmetic, in src/lib/auth/recovery.test.ts.
    expect(sentMs).toBeGreaterThan(PUBLIC_RESPONSE_FLOOR_MS - TIMER_SLACK_MS);
    expect(unknownMs).toBeGreaterThan(PUBLIC_RESPONSE_FLOOR_MS - TIMER_SLACK_MS);
    expect(Math.abs(sentMs - unknownMs)).toBeLessThan(120);
  });

  it("pads a refusal to the same floor as a success", async () => {
    givenSupabase("rate-limited");
    const started = Date.now();

    await submitAndTime(EXISTING);

    expect(Date.now() - started).toBeGreaterThan(PUBLIC_RESPONSE_FLOOR_MS - TIMER_SLACK_MS);
  });
});

describe("the destination is derived, never supplied", () => {
  it("uses the configured application origin", async () => {
    vi.stubEnv("APP_BASE_URL", "https://lancers.example.org");
    givenHeaders({ host: "evil.example", "x-forwarded-proto": "https" });

    await submit(EXISTING);

    expect(resetPasswordForEmail).toHaveBeenCalledWith(EXISTING, {
      redirectTo: "https://lancers.example.org/auth/recovery",
    });
  });

  it("falls back to a loopback request origin, which is what local review is", async () => {
    givenHeaders({ host: "127.0.0.1:3010" });

    await submit(EXISTING);

    expect(resetPasswordForEmail).toHaveBeenCalledWith(EXISTING, {
      redirectTo: "http://127.0.0.1:3010/auth/recovery",
    });
  });

  it("ignores a destination smuggled through the form", async () => {
    const formData = new FormData();
    formData.set("email", EXISTING);
    formData.set("redirectTo", "https://evil.example/steal");
    formData.set("redirect_to", "https://evil.example/steal");

    await requestPasswordReset(IDLE, formData);

    expect(resetPasswordForEmail).toHaveBeenCalledWith(EXISTING, {
      redirectTo: "http://localhost:3000/auth/recovery",
    });
  });
});

describe("ordinary field validation happens before any account could be looked up", () => {
  it.each(["", "   ", "operator", "operator@", "a b@example.com"])(
    "refuses %s without contacting Supabase",
    async (value) => {
      const state = await submit(value);

      expect(state.status).toBe("invalid");
      expect(resetPasswordForEmail).not.toHaveBeenCalled();
    },
  );

  it("says nothing about accounts when it refuses", async () => {
    const state = await submit("operator");

    expect(state.status === "invalid" && state.error).toMatch(/email address/i);
    expect(state.status === "invalid" && state.error).not.toMatch(
      /account|exists|unknown|registered/i,
    );
  });

  it("trims before deciding, so a pasted address with a space still works", async () => {
    await submit(`  ${EXISTING}  `);

    expect(resetPasswordForEmail).toHaveBeenCalledWith(EXISTING, expect.anything());
  });
});
