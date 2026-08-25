import { NextResponse } from "next/server";

import { isServiceError } from "@/lib/db";
import { buildCalendarFeed } from "@/lib/services/calendar-feed";
import { listPublicSeasonEventsForFeed } from "@/lib/services/events";

/**
 * `GET /calendar/feed.ics` — `W2`'s one public subscription feed. LAN-158.
 *
 * ## Permanently stable, always the open season
 *
 * The route is fixed by the Lead's determination: no season in the path, so a
 * subscriber adds it once and it keeps serving whatever season is open —
 * "season-scoped" is satisfied by the *content*, not the address. When the
 * season rolls over, every existing subscriber's entries change wholesale on
 * their next fetch. That is `calendar-feed.ts`'s documented trade-off, not a
 * bug in this handler.
 *
 * ## A read, exactly as `/calendar` is a read
 *
 * `listPublicSeasonEventsForFeed` is one `select` inside the shared read
 * transaction, reading the same columns `PUBLIC_EVENT_COLUMNS` names and
 * nothing from `PARTICIPATION_TABLES`. No cookie is read or set here, and
 * nothing downstream of this handler writes: `tests/calendar-feed-side-effects
 * .test.ts` counts the same five tables `tests/public-calendar-side-effects
 * .test.ts` does, either side of a request.
 *
 * ## Caching
 *
 * `Cache-Control: public, max-age=300` — the Lead's determination. No
 * `Set-Cookie`, no session, and nothing here varies the response by who is
 * asking, so a shared cache in front of this route is safe.
 *
 * ## No season currently open
 *
 * `readCurrentSeasonIn` throws when nothing is open, which is a real
 * configuration state, not a defect. The workflow's own exception table
 * settles the adjacent case — "the season has no events yet ⇒ the feed is
 * valid and empty" — and this handler extends the same posture one step
 * further: a subscribed calendar app cannot render an HTTP error, and a
 * malformed or absent body reads to it as a broken feed rather than as "there
 * is nothing to show yet". So this responds with a complete, valid,
 * zero-`VEVENT` calendar instead of surfacing the refusal, exactly as it would
 * for an open season with no events in it.
 */
export const dynamic = "force-dynamic";

const FEED_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "public, max-age=300",
} as const;

export async function GET() {
  try {
    const { season, events } = await listPublicSeasonEventsForFeed();
    return new NextResponse(buildCalendarFeed({ seasonLabel: season.label, events }), {
      status: 200,
      headers: FEED_HEADERS,
    });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return new NextResponse(buildCalendarFeed({ seasonLabel: "no open season", events: [] }), {
      status: 200,
      headers: FEED_HEADERS,
    });
  }
}
