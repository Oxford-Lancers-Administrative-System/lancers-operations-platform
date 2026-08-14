/**
 * The public RSVP surface's two protections — LAN-79.
 *
 * Pure functions, tested at their boundaries, because both are the kind of code
 * whose bugs are invisible in use: a limiter that is off by one still looks
 * like it works, and a timing floor that returns early still renders the right
 * page.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  allowRsvpRequest,
  clientKeyFrom,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  resetRsvpRateLimit,
  UNIFORM_TERMINAL_RESPONSE_MS,
  withUniformTerminalTiming,
} from "./public-surface";

afterEach(() => {
  resetRsvpRateLimit();
});

describe("allowRsvpRequest", () => {
  it("allows exactly the allowance, then refuses", () => {
    const now = 1_000_000;
    for (let request = 1; request <= RATE_LIMIT_MAX_REQUESTS; request += 1) {
      expect(allowRsvpRequest("client", now)).toBe(true);
    }
    expect(allowRsvpRequest("client", now)).toBe(false);
  });

  it("starts a fresh allowance once the window has passed", () => {
    const now = 1_000_000;
    for (let request = 0; request <= RATE_LIMIT_MAX_REQUESTS; request += 1) {
      allowRsvpRequest("client", now);
    }
    expect(allowRsvpRequest("client", now)).toBe(false);
    expect(allowRsvpRequest("client", now + RATE_LIMIT_WINDOW_MS + 1)).toBe(true);
  });

  it("counts each client separately, so one flood cannot lock everybody out", () => {
    const now = 1_000_000;
    for (let request = 0; request <= RATE_LIMIT_MAX_REQUESTS + 5; request += 1) {
      allowRsvpRequest("noisy", now);
    }
    expect(allowRsvpRequest("noisy", now)).toBe(false);
    expect(allowRsvpRequest("quiet", now)).toBe(true);
  });
});

describe("clientKeyFrom", () => {
  it("reads the last forwarded hop, which is the one the load balancer wrote", () => {
    // The first entry is caller-supplied and therefore chooseable; trusting it
    // would let one client pick a fresh bucket per request.
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3" });
    expect(clientKeyFrom(headers)).toBe("3.3.3.3");
  });

  it("falls back to a single shared bucket when nothing identifies the caller", () => {
    expect(clientKeyFrom(new Headers())).toBe("unattributed");
    expect(clientKeyFrom(new Headers({ "x-forwarded-for": "  " }))).toBe("unattributed");
  });
});

describe("withUniformTerminalTiming", () => {
  it("holds a fast terminal outcome to the floor", async () => {
    const startedAt = Date.now();
    await withUniformTerminalTiming(
      async () => "terminal",
      () => true,
    );
    // The whole point: an unknown token costs almost nothing and must not
    // return measurably sooner than a revoked one that cost a database join.
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(UNIFORM_TERMINAL_RESPONSE_MS - 5);
  });

  it("does not delay a usable link", async () => {
    const startedAt = Date.now();
    const result = await withUniformTerminalTiming(
      async () => "valid",
      () => false,
    );
    expect(result).toBe("valid");
    expect(Date.now() - startedAt).toBeLessThan(UNIFORM_TERMINAL_RESPONSE_MS);
  });

  it("does not add the floor on top of work that already took longer", async () => {
    const slow = UNIFORM_TERMINAL_RESPONSE_MS + 60;
    const startedAt = Date.now();
    await withUniformTerminalTiming(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, slow));
        return "terminal";
      },
      () => true,
    );
    // Padding is to a deadline, not by a duration — otherwise the slow path
    // would stay slower than the fast one and the whole exercise would be moot.
    expect(Date.now() - startedAt).toBeLessThan(slow + UNIFORM_TERMINAL_RESPONSE_MS);
  });

  it("returns the work's own result untouched", async () => {
    const outcome = await withUniformTerminalTiming(
      async () => ({ state: "revoked", page: null }),
      (result) => result.page === null,
    );
    expect(outcome).toEqual({ state: "revoked", page: null });
  });
});
