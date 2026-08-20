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

/**
 * What a surface shows in place of a date it cannot read.
 *
 * LAN-141: `formatDay("2026-13-45")` used to render the raw stored string, and
 * an invalid `Date` rendered the JavaScript artefact `"Invalid Date"`, on
 * screens where every other date reads `27 Aug 2026`. Neither is a sentence a
 * club officer can act on, and the second is worse than useless — it looks like
 * a value rather than like a fault.
 *
 * Throwing is still not the answer: an audit surface that dies on one bad row
 * takes the other twenty with it. So the row renders, and the cell says plainly
 * that this one value could not be read.
 */
export const UNREADABLE_DATE = "Date not readable";

/** A calendar day as a `date` column stores one. A shape, not a validity check. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The club's written form of a stored calendar date: `"21 Aug 2026"`.
 *
 * Read at UTC, because a `date` column carries no time and no zone: "2026-08-18"
 * is 18 August in Oxford, in Cardiff and in the database, and reading it on club
 * time would make it 17 August for an hour every night of British Summer Time.
 *
 * It lives here rather than in a screen's presentation module because refusals
 * quote dates too — `refuseEndBeforeStart()` told an administrator the earliest
 * usable date as `2026-08-21` while the page behind it said `21 Aug 2026`, and
 * two spellings of one date read as two dates.
 */
export function formatClubDay(day: string): string {
  if (!CALENDAR_DAY.test(day)) return UNREADABLE_DATE;
  const instant = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(instant.getTime())) return UNREADABLE_DATE;

  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(instant);

  return `${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}`;
}

/**
 * The calendar day `count` days after `day`, as `YYYY-MM-DD`, or `null`.
 *
 * UTC arithmetic on a zoneless value, for the reason above. The question its
 * one caller asks is forced by the half-open period model: with
 * `[effective_from, effective_to)` and `effective_to > effective_from` enforced
 * by the schema, the earliest date an assignment can end is the day *after* it
 * started, and a form that does not say so offers a date the service refuses.
 */
export function addClubDays(day: string, count: number): string | null {
  if (!CALENDAR_DAY.test(day)) return null;
  const instant = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(instant.getTime())) return null;
  instant.setUTCDate(instant.getUTCDate() + count);
  return instant.toISOString().slice(0, 10);
}
