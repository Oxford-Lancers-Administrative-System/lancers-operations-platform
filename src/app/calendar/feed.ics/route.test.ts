// @vitest-environment node
/**
 * `GET /calendar/feed.ics` — the HTTP boundary. LAN-158.
 *
 * What is under test here is the response shape: headers, status, and the two
 * paths through `listPublicSeasonEventsForFeed` — an open season and the
 * refusal case. The document itself is `calendar-feed.test.ts`'s, and the real
 * database's identity, cancellation and side-effect proofs are
 * `tests/calendar-feed-side-effects.test.ts`'s.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/events", () => ({ listPublicSeasonEventsForFeed: vi.fn() }));

import { NotFound } from "@/lib/db";
import { listPublicSeasonEventsForFeed } from "@/lib/services/events";
import { GET } from "./route";

describe("GET /calendar/feed.ics", () => {
  it("serves text/calendar with the Lead's caching determination, and no cookie", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockResolvedValue({
      season: {
        id: "s1",
        label: "2026-27",
        status: "active",
        startsOn: "2026-04-26",
        endsOn: null,
      },
      events: [],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("carries the season's events as VEVENTs", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockResolvedValue({
      season: {
        id: "s1",
        label: "2026-27",
        status: "active",
        startsOn: "2026-04-26",
        endsOn: null,
      },
      events: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Practice — michaelmas week 4",
          eventType: "practice",
          scheduledOn: "2026-10-21",
          startsAt: "18:00",
          endsAt: "19:00",
          deliveryMode: "in_person",
          venue: "Iffley Road Astro",
          isMandatory: false,
          isCancelled: false,
          updatedAt: "2026-10-01T12:00:00.000Z",
        },
      ],
    });

    const response = await GET();
    const body = await response.text();

    expect(body).toContain("BEGIN:VEVENT");
    expect(body).toContain("UID:33333333-3333-4333-8333-333333333333@app.oxfordlancers.com");
    expect(body).toContain("SUMMARY:Practice — michaelmas week 4");
  });

  it("responds with a valid, empty calendar rather than an error when no season is open", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: "no_open_season" }),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("does not swallow a genuinely unexpected error", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(new Error("connection refused"));

    await expect(GET()).rejects.toThrow("connection refused");
  });
});
