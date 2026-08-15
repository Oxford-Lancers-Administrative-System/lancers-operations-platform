// @vitest-environment node
/**
 * One address search, and every way it can fail — LAN-115.
 *
 * These cover the acceptance criterion that "no-results, provider-error,
 * rate-limit, and unavailable-provider states are understandable and do not
 * crash the form": each one has to be a distinguishable *value* here, because
 * upstream that is what becomes a different sentence under the field.
 *
 * No test in this file touches the network. Every one passes its own `fetch`,
 * so a CI run with no provider configured — which is every CI run — exercises
 * the same code paths a configured deployment does.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { normalizeQuery, searchVenues } from "./provider";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH } from "./suggestion";

const CONFIGURED = { VENUE_SEARCH_PROVIDER: "photon" } as const;

const ONE_RESULT = {
  features: [
    {
      type: "Feature",
      properties: { name: "Horspath Sports Ground", city: "Oxford", postcode: "OX33 1RY" },
    },
  ],
};

function respondWith(body: unknown, init: ResponseInit = {}): typeof fetch {
  return vi.fn(
    async () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
        ...init,
      }),
  ) as unknown as typeof fetch;
}

describe("normalizeQuery", () => {
  it("trims, and bounds what an operator's keyboard can send", () => {
    expect(normalizeQuery("  iffley  ")).toBe("iffley");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
  });
});

describe("searchVenues", () => {
  it("returns suggestions when the provider answers", async () => {
    const fetchImpl = respondWith(ONE_RESULT);
    const outcome = await searchVenues("horspath", { env: CONFIGURED, fetchImpl });

    expect(outcome.status).toBe("ok");
    expect(outcome.status === "ok" && outcome.suggestions[0].label).toBe("Horspath Sports Ground");
  });

  it("identifies itself and refuses a cache on the way out", async () => {
    const fetchImpl = respondWith(ONE_RESULT);
    await searchVenues("horspath", { env: CONFIGURED, fetchImpl });

    const [, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect((init?.headers as Record<string, string>)["user-agent"]).toContain(
      "lancers-operations-platform",
    );
    expect(init?.cache).toBe("no-store");
  });

  it("makes no request at all when no provider is configured", async () => {
    const fetchImpl = respondWith(ONE_RESULT);
    const outcome = await searchVenues("horspath", { env: {}, fetchImpl });

    expect(outcome.status).toBe("unavailable");
    expect(outcome.status === "unavailable" && outcome.missing).toEqual(["VENUE_SEARCH_PROVIDER"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("makes no request for a query too short to mean anything", async () => {
    const fetchImpl = respondWith(ONE_RESULT);
    const outcome = await searchVenues("ox", { env: CONFIGURED, fetchImpl });
    expect("ox".length).toBeLessThan(MIN_QUERY_LENGTH);

    // An empty field is not an error, and neither is two letters.
    expect(outcome).toEqual({ status: "ok", suggestions: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports being rate-limited as its own outcome", async () => {
    const fetchImpl = respondWith("slow down", { status: 429 });
    expect(await searchVenues("horspath", { env: CONFIGURED, fetchImpl })).toEqual({
      status: "rate_limited",
    });
  });

  it.each([500, 502, 400, 403])("reports a %d as a provider error", async (status) => {
    const fetchImpl = respondWith("no", { status });
    expect(await searchVenues("horspath", { env: CONFIGURED, fetchImpl })).toEqual({
      status: "provider_error",
    });
  });

  it("reports a 200 carrying something that is not JSON as a provider error", async () => {
    const fetchImpl = respondWith("<html>maintenance</html>");
    expect(await searchVenues("horspath", { env: CONFIGURED, fetchImpl })).toEqual({
      status: "provider_error",
    });
  });

  it("reports a network failure as a provider error rather than throwing", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    await expect(searchVenues("horspath", { env: CONFIGURED, fetchImpl })).resolves.toEqual({
      status: "provider_error",
    });
  });

  it("survives a provider that answers 200 with a shape it has never seen", async () => {
    const fetchImpl = respondWith({ results: [{ label: "somewhere" }] });
    expect(await searchVenues("horspath", { env: CONFIGURED, fetchImpl })).toEqual({
      status: "ok",
      suggestions: [],
    });
  });

  it("passes the caller's cancellation through to the request", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      controller.abort();
      // A real fetch rejects once the signal it was handed aborts.
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return new Response("{}");
    }) as unknown as typeof fetch;

    const outcome = await searchVenues("horspath", {
      env: CONFIGURED,
      fetchImpl,
      signal: controller.signal,
    });

    // The operator has gone; there is nothing to tell them, and nothing thrown.
    expect(outcome).toEqual({ status: "provider_error" });
  });

  it("asks the self-hosted instance when one is configured", async () => {
    const fetchImpl = respondWith(ONE_RESULT);
    await searchVenues("horspath", {
      env: { VENUE_SEARCH_PROVIDER: "photon", VENUE_SEARCH_BASE_URL: "https://geo.example.org" },
      fetchImpl,
    });

    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toMatch(
      /^https:\/\/geo\.example\.org\/api\?/,
    );
  });
});
