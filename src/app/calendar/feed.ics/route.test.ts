// @vitest-environment node
/**
 * `GET /calendar/feed.ics` — the HTTP boundary. LAN-158.
 *
 * What is under test here is the response shape: headers, status, and every
 * path through `listPublicSeasonEventsForFeed` — an open season, the one
 * genuine "nothing is open" refusal, and a real failure. The document itself
 * is `calendar-feed.test.ts`'s, and the real database's identity, cancellation
 * and side-effect proofs are `tests/calendar-feed-side-effects.test.ts`'s.
 *
 * ## R158-B1 — the regression this file exists to prove
 *
 * The independent security review proved live that the previous handler
 * caught `isServiceError(error)`, a supertype test true for the one genuine
 * "no season open" case *and* for `UnexpectedDatabaseError` — what a real
 * database or connection failure becomes by the time it reaches this
 * handler — alike. Both used to produce an identical `200` with a fabricated
 * empty, publicly-cacheable calendar. The shipped unit suite could not have
 * caught that: its one "genuinely unexpected error" case used a plain `Error`,
 * which `isServiceError` was always false for and which the old handler
 * therefore already rethrew correctly. A real database failure is never a
 * plain `Error` by the time this handler sees it — it is an
 * `UnexpectedDatabaseError`, a `ServiceError` subclass — so that is exactly
 * what "an amended event that broke and got fixed" test below injects.
 *
 * "narrow the catch. Only the genuine no-season-open case may yield an empty
 * 200" is proved twice, deliberately: the amendment/injection case below, and
 * the pre-existing "still returns its empty 200" case, in the same file, so a
 * fix that satisfies one by breaking the other cannot pass either test in
 * isolation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/services/events", () => ({ listPublicSeasonEventsForFeed: vi.fn() }));

import { NotFound, NotPermitted, UnexpectedDatabaseError } from "@/lib/db";
import { listPublicSeasonEventsForFeed } from "@/lib/services/events";
import { NO_CURRENT_SEASON_RULE } from "@/lib/services/seasons";
import { GET } from "./route";

const A_SEASON = {
  id: "s1",
  label: "2026-27",
  status: "active",
  startsOn: "2026-04-26",
  endsOn: null,
};

describe("GET /calendar/feed.ics", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("serves text/calendar with the Lead's caching determination, and no cookie", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockResolvedValue({ season: A_SEASON, events: [] });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("Set-Cookie")).toBeNull();
  });

  it("carries the season's events as VEVENTs", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockResolvedValue({
      season: A_SEASON,
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
          description: null,
          requiredEquipment: null,
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

  it("responds with a valid, empty calendar when no season is open — identified by NotFound's exact rule", async () => {
    // The real identifier `readCurrentSeasonIn` throws (src/lib/services
    // /seasons.ts), imported rather than retyped — retyping it as a sibling
    // module's similarly-named but different rule string is exactly the
    // mistake this suite's own history made once (see route.ts's header).
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(
      new NotFound("There is no season currently open.", { rule: NO_CURRENT_SEASON_RULE }),
    );

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("R158-B1 regression: a real database failure is NOT answered as an empty calendar", async () => {
    // UnexpectedDatabaseError is a ServiceError, exactly what withTransaction
    // maps a dropped connection or unrecognised database fault to — the
    // reviewer's own live-injected class.
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(new UnexpectedDatabaseError());

    const response = await GET();
    const body = await response.text();

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    // Not the success path's cacheable header under any circumstance.
    expect(response.headers.get("Cache-Control")).not.toContain("max-age");
    // Not a fabricated empty calendar — a subscribed app must not read this
    // as "the season now has zero events."
    expect(body).not.toContain("VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
    // Logged, not silent — the specific defect being corrected.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toContain("calendar-feed");
  });

  it("a NotFound that is NOT the no-current-season rule is not treated as an empty season either", async () => {
    // Same ServiceError kind, same class, different rule — proves the check
    // is the exact rule identity `route.ts` documents, not `instanceof
    // NotFound` alone.
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(
      new NotFound("That event no longer exists.", { rule: "event_not_found" }),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("another ServiceError kind entirely also fails loudly rather than being swallowed", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(
      new NotPermitted("Not permitted.", { rule: "not_an_actual_rule" }),
    );

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("a genuinely unanticipated exception also fails loudly with no-store, logged, rather than crashing uncaught", async () => {
    vi.mocked(listPublicSeasonEventsForFeed).mockRejectedValue(new Error("connection refused"));

    const response = await GET();
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).not.toContain("VCALENDAR");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]![0]).toContain("connection refused");
  });
});
