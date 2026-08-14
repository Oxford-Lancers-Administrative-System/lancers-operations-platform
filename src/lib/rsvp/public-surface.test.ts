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
  RATE_LIMIT_MAX_PER_ADDRESS,
  RATE_LIMIT_MAX_PER_LINK,
  RATE_LIMIT_WINDOW_MS,
  resetRsvpRateLimit,
  UNIFORM_TERMINAL_RESPONSE_MS,
  withUniformTerminalTiming,
} from "./public-surface";

afterEach(() => {
  resetRsvpRateLimit();
});

describe("allowRsvpRequest", () => {
  const NOW = 1_000_000;

  it("allows exactly the per-link allowance, then refuses and says which bucket", () => {
    for (let request = 1; request <= RATE_LIMIT_MAX_PER_LINK; request += 1) {
      expect(allowRsvpRequest("1.1.1.1", "token-a", NOW).allowed).toBe(true);
    }
    const refused = allowRsvpRequest("1.1.1.1", "token-a", NOW);
    expect(refused.allowed).toBe(false);
    // The reason is what makes a throttled player discoverable in the log.
    expect(refused.reason).toBe("link");
  });

  it("starts a fresh allowance once the window has passed", () => {
    for (let request = 0; request <= RATE_LIMIT_MAX_PER_LINK; request += 1) {
      allowRsvpRequest("1.1.1.1", "token-a", NOW);
    }
    expect(allowRsvpRequest("1.1.1.1", "token-a", NOW).allowed).toBe(false);
    expect(allowRsvpRequest("1.1.1.1", "token-a", NOW + RATE_LIMIT_WINDOW_MS + 1).allowed).toBe(
      true,
    );
  });

  /**
   * The finding this design exists to answer.
   *
   * The first version counted per address alone at thirty a minute. Answering
   * costs three requests and declining four, LAN-78 delivers to the whole squad
   * at once, and a mobile carrier puts thousands of subscribers behind one
   * address — so a handful of players answering together could lock out
   * everybody behind that carrier, and be told their link was dead.
   */
  it("does not let one player's reloading spend another player's allowance", () => {
    const carrier = "82.132.0.1";

    // One player exhausts their own link entirely.
    for (let request = 0; request <= RATE_LIMIT_MAX_PER_LINK + 5; request += 1) {
      allowRsvpRequest(carrier, "token-noisy", NOW);
    }
    expect(allowRsvpRequest(carrier, "token-noisy", NOW).allowed).toBe(false);

    // Every one of their team-mates, behind the same address, is unaffected.
    for (let player = 0; player < 40; player += 1) {
      expect(allowRsvpRequest(carrier, `token-player-${player}`, NOW).allowed).toBe(true);
    }
  });

  it("accommodates a whole squad answering from one address in one minute", () => {
    // Forty players, four requests each — the decline flow, the expensive one.
    const carrier = "82.132.0.1";
    for (let player = 0; player < 40; player += 1) {
      for (let request = 0; request < 4; request += 1) {
        expect(allowRsvpRequest(carrier, `token-${player}`, NOW).allowed).toBe(true);
      }
    }
  });

  it("still stops a scanner walking many links from one address", () => {
    const attacker = "203.0.113.9";
    let refusals = 0;
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_PER_ADDRESS + 10; attempt += 1) {
      const decision = allowRsvpRequest(attacker, `guess-${attempt}`, NOW);
      if (!decision.allowed) {
        expect(decision.reason).toBe("address");
        refusals += 1;
      }
    }
    expect(refusals).toBeGreaterThan(0);
  });

  it("keeps the volumetric backstop per address", () => {
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_PER_ADDRESS + 5; attempt += 1) {
      allowRsvpRequest("203.0.113.9", `guess-${attempt}`, NOW);
    }
    expect(allowRsvpRequest("203.0.113.9", "guess-fresh", NOW).allowed).toBe(false);
    expect(allowRsvpRequest("198.51.100.4", "guess-fresh", NOW).allowed).toBe(true);
  });

  it("bounds its own memory, and evicts without locking anybody out", () => {
    // The eviction branch had no test at all. Losing a live counter is the safe
    // direction — it hands a client some allowance back — and what must never
    // happen is a refusal that outlives the map.
    for (let client = 0; client < 12_000; client += 1) {
      allowRsvpRequest(`10.0.${Math.floor(client / 250)}.${client % 250}`, `t-${client}`, NOW);
    }
    expect(allowRsvpRequest("10.0.0.1", "t-fresh", NOW).allowed).toBe(true);
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
