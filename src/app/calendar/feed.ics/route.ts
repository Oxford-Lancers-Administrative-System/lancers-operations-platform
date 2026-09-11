import { NextResponse } from "next/server";

import { NotFound } from "@/lib/db";
import { buildCalendarFeed } from "@/lib/services/calendar-feed";
import { listPublicSeasonEventsForFeed } from "@/lib/services/events";
import { NO_CURRENT_SEASON_RULE } from "@/lib/services/seasons";

/**
 * `GET /calendar/feed.ics` — `W2`'s one public subscription feed, LAN-158.
 * Fixed route, no season in the path — content, not the address, is
 * season-scoped. A pure read, same columns as `/calendar`, no cookie.
 * `Cache-Control: public, max-age=300` on success only (R158-B1): a failure
 * always sends `no-store`, or a transient outage gets edge-cached as "zero
 * events" for every subscriber. {@link isNoCurrentSeason} is an exact
 * `NotFound` identity check, never a supertype test — everything else is a
 * logged `503`.
 */
export const dynamic = "force-dynamic";

const FEED_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "public, max-age=300",
} as const;

/** Never carries `text/calendar`: a calendar app would try to parse the error sentence as feed content. */
const FAILURE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/** "Nothing to show yet", not a failure — must stay an exact identity check, never a supertype test (R158-B1). */
function isNoCurrentSeason(error: unknown): error is NotFound {
  return error instanceof NotFound && error.rule === NO_CURRENT_SEASON_RULE;
}

export async function GET() {
  try {
    const { season, events } = await listPublicSeasonEventsForFeed();
    return new NextResponse(buildCalendarFeed({ seasonLabel: season.label, events }), {
      status: 200,
      headers: FEED_HEADERS,
    });
  } catch (error) {
    if (isNoCurrentSeason(error)) {
      return new NextResponse(buildCalendarFeed({ seasonLabel: "no open season", events: [] }), {
        status: 200,
        headers: FEED_HEADERS,
      });
    }

    // R158-B1: never the cacheable 200, and never silent. `error.message` is
    // safe to log verbatim for a `ServiceError` (`src/lib/db/errors.ts`
    // guarantees no SQL, connection string, or row value in it).
    console.error(
      `[calendar-feed] GET /calendar/feed.ics failed: ${
        error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      }`,
    );
    return new NextResponse(
      "The calendar feed is temporarily unavailable. Please try again shortly.",
      {
        status: 503,
        headers: FAILURE_HEADERS,
      },
    );
  }
}
