/**
 * How the coach's list is ordered — Brian, 14 August 2026.
 *
 * "Events happening today should be highlighted at the top", then this past
 * week, then everything older. A coach opens this at the side of a pitch,
 * minutes after a session, and the session they were just at should be the
 * first thing under their thumb rather than somewhere in a list of sixty.
 *
 * ## Why "this past week" and not "the next 7 days"
 *
 * Because the list is occurred events only, and an event that has not happened
 * cannot have been asserted to have happened — invariant E5 makes occurrence a
 * human act, and no operator marks next Tuesday's practice occurred. A
 * forward-looking section would therefore be permanently empty. Brian confirmed
 * the reading on 14 August 2026: today, then the week behind, then earlier.
 *
 * ## The fourth case, which has no section
 *
 * An occurred event dated **after** today is not a thing the club can produce,
 * and it falls into `earlier` along with everything else that is neither today
 * nor this past week. The local synthetic dataset has 67 of them — it dates the
 * whole 2026-27 season ahead of the seed's own "today" — so the section is not
 * hypothetical on a development machine, and calling that bucket anything more
 * specific than "Earlier" would be a label that lies about the data underneath
 * it on the one machine where it appears.
 */
import type { EventListEntry } from "@/lib/services/events";

export type CoachEventBucketKey = "today" | "past_week" | "earlier";

export interface CoachEventBucket {
  key: CoachEventBucketKey;
  label: string;
  /** One line under the heading. Empty where the heading says enough. */
  detail: string;
  events: EventListEntry[];
}

export const TODAY_LABEL = "Today";
export const TODAY_DETAIL = "Happening today";
export const PAST_WEEK_LABEL = "This past week";
export const PAST_WEEK_DETAIL = "The last seven days";
export const EARLIER_LABEL = "Earlier";
export const EARLIER_DETAIL = "Everything else this season";

/**
 * Today's date in the club's timezone, as `YYYY-MM-DD`.
 *
 * `en-CA` because it formats exactly that way, which is also how
 * `events.scheduled_on` arrives — a `date` column, not an instant. Comparing
 * two `YYYY-MM-DD` strings lexicographically is the same comparison PostgreSQL
 * would make, and it avoids constructing a `Date` per row and then arguing with
 * it about which day a 23:00 kickoff in October belongs to.
 *
 * Europe/London rather than the server's zone: the club is in Oxford, and a
 * container in `europe-west2` running on UTC would put a 00:30 social on the
 * wrong day for half the year.
 */
export function londonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** The same date, `days` earlier. Both arguments and result are `YYYY-MM-DD`. */
export function shiftDays(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The three sections, in reading order, each keeping the order it was given.
 *
 * The caller hands over a date-descending list, which is the right order inside
 * every section: the most recent first is what somebody looking for "the one I
 * was just at" wants, and for `today` it puts a 20:00 practice above the 18:00
 * chalk talk that preceded it.
 *
 * An event with no date at all — possible on a draft, not on an occurred event,
 * but the type allows it — is `earlier`. That is the fail-quiet direction: it
 * stays reachable at the bottom of the list rather than claiming to be today.
 */
export function bucketCoachEvents(
  events: readonly EventListEntry[],
  today: string,
): CoachEventBucket[] {
  const weekAgo = shiftDays(today, -7);

  const bucketFor = (event: EventListEntry): CoachEventBucketKey => {
    const day = event.scheduledOn;
    if (day === null) return "earlier";
    if (day === today) return "today";
    if (day < today && day >= weekAgo) return "past_week";
    return "earlier";
  };

  const buckets: CoachEventBucket[] = [
    { key: "today", label: TODAY_LABEL, detail: TODAY_DETAIL, events: [] },
    { key: "past_week", label: PAST_WEEK_LABEL, detail: PAST_WEEK_DETAIL, events: [] },
    { key: "earlier", label: EARLIER_LABEL, detail: EARLIER_DETAIL, events: [] },
  ];

  for (const event of events) {
    const key = bucketFor(event);
    buckets.find((bucket) => bucket.key === key)?.events.push(event);
  }

  return buckets;
}
