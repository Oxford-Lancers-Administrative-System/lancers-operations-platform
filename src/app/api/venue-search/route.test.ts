// @vitest-environment node
/**
 * The address-search endpoint — LAN-115.
 *
 * What is under test here is the boundary, not the geocoder: who reaches the
 * provider, what a refusal looks like to a form that is part-way through, and
 * what the browser is told about the deployment. The search itself is proved in
 * `src/lib/venue-search/provider.test.ts`.
 *
 * The criterion "unauthorized users gain no new event-write capability" has a
 * quieter twin this file exists for — an unauthorized user must gain no new
 * *read* capability either, and no ability to spend a free service in the
 * club's name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/guards", () => ({ requireCapability: vi.fn() }));
vi.mock("@/lib/venue-search/provider", () => ({ searchVenues: vi.fn() }));

import { requireCapability } from "@/lib/auth/guards";
import { NotPermitted } from "@/lib/db";
import { searchVenues } from "@/lib/venue-search/provider";

import { GET } from "./route";

const SUGGESTION = {
  id: "0",
  label: "Horspath Sports Ground",
  detail: "Oxford, OX33 1RY",
  formatted: "Horspath Sports Ground, Oxford, OX33 1RY",
};

function request(query: string): Request {
  return new Request(`http://localhost:3000/api/venue-search?q=${encodeURIComponent(query)}`);
}

function permit() {
  vi.mocked(requireCapability).mockResolvedValue({
    personId: "11111111-1111-4111-8111-111111111111",
  } as unknown as Awaited<ReturnType<typeof requireCapability>>);
}

describe("GET /api/venue-search", () => {
  // "The provider was never reached" is only evidence if it was not reached in
  // *this* test, so no call from a previous one may survive into the next.
  beforeEach(() => vi.clearAllMocks());

  it("requires the same capability that setting a venue requires", async () => {
    permit();
    vi.mocked(searchVenues).mockResolvedValue({ status: "ok", suggestions: [SUGGESTION] });

    await GET(request("horspath"));

    expect(requireCapability).toHaveBeenCalledWith("event_calendar_management");
  });

  it("returns the provider's suggestions to an authorized operator", async () => {
    permit();
    vi.mocked(searchVenues).mockResolvedValue({ status: "ok", suggestions: [SUGGESTION] });

    const response = await GET(request("horspath"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", suggestions: [SUGGESTION] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses anyone else with a 403, and never reaches the provider", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new NotPermitted("Not permitted."));

    const response = await GET(request("horspath"));

    expect(response.status).toBe(403);
    // Not a redirect: this is answered into a `fetch` from a half-filled form,
    // and a login page arriving where a suggestion list was expected is worse
    // than a refusal.
    expect(response.headers.get("location")).toBeNull();
    expect(searchVenues).not.toHaveBeenCalled();
  });

  it("does not tell the browser which environment variables are absent", async () => {
    permit();
    vi.mocked(searchVenues).mockResolvedValue({
      status: "unavailable",
      missing: ["VENUE_SEARCH_PROVIDER"],
    });

    const response = await GET(request("horspath"));
    const body = await response.json();

    expect(body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(body)).not.toContain("VENUE_SEARCH");
  });

  it.each(["rate_limited", "provider_error"] as const)(
    "passes a %s outcome through as a state the field can name",
    async (status) => {
      permit();
      vi.mocked(searchVenues).mockResolvedValue({ status });

      const response = await GET(request("horspath"));

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status });
    },
  );

  it("treats a missing query as an empty one rather than an error", async () => {
    permit();
    vi.mocked(searchVenues).mockResolvedValue({ status: "ok", suggestions: [] });

    const response = await GET(new Request("http://localhost:3000/api/venue-search"));

    expect(response.status).toBe(200);
    expect(searchVenues).toHaveBeenCalledWith("", expect.anything());
  });

  it("lets an unexpected fault through as itself", async () => {
    vi.mocked(requireCapability).mockRejectedValue(new Error("the session store is down"));

    // Not flattened into a 403. A genuine fault must reach the platform, or a
    // broken session store looks exactly like a permission decision.
    await expect(GET(request("horspath"))).rejects.toThrow("the session store is down");
  });
});
