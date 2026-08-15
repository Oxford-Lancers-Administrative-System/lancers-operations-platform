/**
 * The club's own clock. LAN-114.
 *
 * ## Why this module exists
 *
 * There is one club, it plays in Oxford, and every wall-clock rule in this
 * application is expressed in that zone: the response deadline
 * (`services/response-deadline.ts`), the RSVP page's "has it started yet"
 * (`services/rsvp.ts`), and now which day the calendar considers *today*.
 *
 * LAN-114 requires the calendar to "use the application's configured club
 * timezone" and explicitly forbids "a second timezone rule inside the calendar
 * component". Before this file the zone was a string literal repeated at each
 * call site, so a calendar with its own literal would have been that second
 * rule by definition — identical today, and free to drift. The constant is
 * declared once here and the rules refer to it.
 *
 * ## What this is not
 *
 * Not a general date library, and not a claim that every stored value is an
 * instant. `events.scheduled_on` is a bare `date` and `starts_at`/`ends_at` are
 * bare `time`s — none carries a zone, and none is converted here. The only
 * question this module answers is the one that genuinely needs a zone: given
 * the current instant, which calendar day is it in Oxford?
 */

/**
 * The zone every wall-clock rule in this application is expressed in.
 *
 * A constant rather than configuration because it is a fact about the club, not
 * a deployment setting: the Oxford Lancers play in Oxford. Making it an
 * environment variable would invite an environment where the deadline rules and
 * the calendar disagree about what day it is.
 */
export const CLUB_TIME_ZONE = "Europe/London";

/**
 * Today's date in the club's zone, as `YYYY-MM-DD`.
 *
 * Built from `Intl` parts rather than from `toISOString()`, which would answer
 * in UTC — and between midnight and 01:00 during British Summer Time that is
 * yesterday. A calendar that highlights the wrong cell for an hour every night
 * of the season is the kind of defect nobody reports and everybody distrusts.
 *
 * Takes the instant as an argument so a test can ask the question at a chosen
 * moment, including either side of a daylight-saving transition, without
 * touching the system clock.
 */
export function todayInClubZone(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const value = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}
