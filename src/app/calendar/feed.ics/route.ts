import { NextResponse } from "next/server";

import { NotFound } from "@/lib/db";
import { buildCalendarFeed } from "@/lib/services/calendar-feed";
import { listPublicSeasonEventsForFeed } from "@/lib/services/events";
import { NO_CURRENT_SEASON_RULE } from "@/lib/services/seasons";

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
 * ## Caching — and why the two branches below deliberately disagree about it
 *
 * `Cache-Control: public, max-age=300` on a HEALTHY response — the Lead's
 * determination, unchanged by this correction. No `Set-Cookie`, no session,
 * and nothing here varies the response by who is asking, so a shared cache in
 * front of a genuinely healthy response is safe. `docs/deployment.md`'s "Edge
 * caching" confirms Firebase Hosting, the real front door (ADR 0031), honours
 * that header for a dynamically rendered route rather than only for a
 * prerendered one — it is a real mechanism, not a hopeful one.
 *
 * That is exactly why a FAILURE must never carry it. Every failure response
 * below sends `Cache-Control: no-store` instead, on purpose and distinctly
 * from `FEED_HEADERS`.
 *
 * ## R158-B1 — a database outage used to be served as an empty calendar
 *
 * The independent security review of the head this correction resumes from
 * proved, live, that this handler previously caught `isServiceError(error)` —
 * a supertype test true for `NotFound`'s one genuine "nothing is open" case
 * **and** for `UnexpectedDatabaseError`, `NotPermitted`, `InvalidTransition`,
 * `ConstraintViolated` and `Conflict` alike. `UnexpectedDatabaseError` is what
 * a real connection failure or unrecognised database fault becomes by the
 * time it reaches this handler (`mapDatabaseError`, `withTransaction`), and it
 * used to take the identical path as a genuinely empty season: `200`, a
 * syntactically valid zero-`VEVENT` calendar, the same public, cacheable
 * headers, and nothing logged.
 *
 * That is not a cosmetic wrong answer. This is the one route in the
 * application designed to be polled forever, unauthenticated, by Google,
 * Microsoft and Apple, and the response used to carry `public, max-age=300` —
 * so one transient database hiccup during one request got baked into
 * Firebase's *shared* edge cache and served to every subscriber for up to
 * five minutes as "the season now has zero events." Most calendar-
 * subscription consumers read a re-synced empty feed as "remove everything I
 * previously had," not "temporarily unreachable, keep the old copy" — so the
 * failure mode was a silent, unlogged, edge-cached wipe of every subscriber's
 * calendar, recovering on its own a few minutes later with no record
 * anywhere of why it had ever happened.
 *
 * ## The fix: name the one genuine case precisely, never by supertype
 *
 * {@link isNoCurrentSeason} matches only an instance of `NotFound` whose
 * `rule` is exactly {@link NO_CURRENT_SEASON_RULE} — the identifier
 * `readCurrentSeasonIn` actually throws (`src/lib/services/seasons.ts`).
 * Nothing else can produce that combination, including every other
 * `ServiceError` subclass and kind. Everything else — another `ServiceError`,
 * `UnexpectedDatabaseError` above all, or a genuinely unanticipated
 * exception — is logged server-side and answered with a `503` and
 * `Cache-Control: no-store`, so neither Firebase's edge nor a well-behaved
 * subscribing provider caches the failure, and a provider retries on its own
 * schedule instead of concluding the season is now empty.
 */
export const dynamic = "force-dynamic";

const FEED_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Cache-Control": "public, max-age=300",
} as const;

/**
 * The `no-store` failure response never carries the calendar `Content-Type` —
 * a subscribed calendar app that received a `text/calendar` body containing
 * an ordinary error sentence would try to parse it as one.
 */
const FAILURE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/**
 * The one case this route treats as "there is genuinely nothing to show yet"
 * rather than a failure — see the module header's R158-B1 section for why
 * this must be an exact identity check and never a supertype test.
 */
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

    // R158-B1. Never the cacheable 200 the success path uses, and never
    // silent: an outage that answers `200` with a fabricated empty calendar
    // is exactly the defect this branch exists to close, and replacing it
    // with a silent `500` would only move the same failure mode one status
    // code over. `error.message` is safe to log verbatim for a `ServiceError`
    // — the taxonomy in `src/lib/db/errors.ts` guarantees it never carries
    // SQL, a connection string, or a row value — and a non-`ServiceError` is
    // logged by its own message without further inspection.
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
