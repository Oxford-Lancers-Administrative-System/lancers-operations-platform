/**
 * The club's own clock. LAN-114: one timezone, expressed once, for every
 * wall-clock rule (response deadline, RSVP "has it started", calendar "today").
 * Not a general date library: `scheduled_on`/`starts_at`/`ends_at` are zoneless
 * columns and are not converted here.
 */

/** The zone every wall-clock rule in the application is expressed in. */
export const CLUB_TIME_ZONE = "Europe/London";

/** Today's date in the club's zone, as `YYYY-MM-DD`. Uses `Intl`, not `toISOString()` (UTC, an hour wrong during BST). */
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

/** What a surface shows in place of a date it cannot read (LAN-141). Renders, rather than throwing, so one bad row does not take the rest of the page with it. */
export const UNREADABLE_DATE = "Date not readable";

/** A calendar day as a `date` column stores one. A shape, not a validity check. */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The club's written form of a stored calendar date: `"21 Aug 2026"`. Read at UTC — a `date` column carries no zone. */
export function formatClubDay(day: string): string {
  if (!CALENDAR_DAY.test(day)) return UNREADABLE_DATE;
  const instant = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(instant.getTime())) return UNREADABLE_DATE;

  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(instant);

  return `${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}`;
}

/** The calendar day `count` days after `day`, as `YYYY-MM-DD`, or `null`. Computes the earliest allowed `effective_to` (schema requires `effective_to > effective_from`). */
export function addClubDays(day: string, count: number): string | null {
  if (!CALENDAR_DAY.test(day)) return null;
  const instant = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(instant.getTime())) return null;
  instant.setUTCDate(instant.getUTCDate() + count);
  return instant.toISOString().slice(0, 10);
}
