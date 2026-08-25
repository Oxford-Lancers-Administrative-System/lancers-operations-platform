/**
 * How the coach's list is ordered — Brian, 14 August 2026.
 *
 * "We should be looking forward… I want to see what's coming up, and anything
 * before today is just Earlier. That's it."
 *
 * Two sections, and no third:
 *
 *   * **Upcoming** — today, then everything ahead of it, soonest first. Today's
 *     sessions are badged and drawn out of the page, and sorted to the top of
 *     the section, because the register a coach opens the application to fill
 *     in is almost always one of them.
 *   * **Earlier** — everything before today, most recent first, because the
 *     other reason to open this is to correct the session you were at last
 *     week.
 *
 * ## Why this list is not occurred-only
 *
 * It cannot be. Looking forward means showing events that are not yet open, and
 * saying so on the card: they carry **Attendance not open**, and opening one
 * gives UX-90 rather than a register.
 *
 * The two sections and the open/not-open line are **not** the same question,
 * and W-F1 is what happens when they are treated as one. Which section a
 * session sits in is about the day — today and ahead, or behind. Whether its
 * register may be opened is about the instant, six hours before it starts
 * (D71). For several hours of every session's own day the honest answers differ:
 * it is in **Upcoming**, and its register is open.
 *
 * That is a widening of what a coaching assignment sees, and it is recorded as
 * a deviation in `docs/ux/tickets/LAN-110-coach-attendance.md`. What it adds is
 * the club's own fixture list — a name, a date and a venue for sessions the
 * coach is running. It adds no audience, no responses, no counts, and no way to
 * change anything: `/operate/events/[id]` still refuses them outright.
 *
 * ## What is deliberately not in either section
 *
 * A draft, and a cancelled event. Neither is a session anybody is going to;
 * showing a coach the calendar's unfinished drafts would be the event
 * administration § 3 withholds, and listing a cancelled game under Upcoming
 * would be worse than not listing it.
 */
import { todayInClubZone } from "@/lib/club-time";
import { isRegisterAvailable } from "@/lib/services/attendance-window";
import type { EventListEntry } from "@/lib/services/events";

export type CoachEventBucketKey = "upcoming" | "earlier";

export interface CoachEventBucket {
  key: CoachEventBucketKey;
  label: string;
  /** One line under the heading. */
  detail: string;
  events: EventListEntry[];
}

export const UPCOMING_LABEL = "Upcoming";
export const UPCOMING_DETAIL = "Today first, then what is coming up";
export const EARLIER_LABEL = "Earlier";
export const EARLIER_DETAIL = "Before today, most recent first";

/**
 * The statuses a coach sees at all.
 *
 * `approved` covers both halves of what a coach needs — a session that is going
 * to happen and one that did, which are the same stored status and differ only
 * in whether the date has passed (D30). A draft is a decision still being
 * taken and a cancelled event is not happening, and neither is a coach's
 * business — see the note above.
 */
export const COACH_VISIBLE_STATUSES: readonly string[] = Object.freeze(["approved"]);

/**
 * Today's date in the club's timezone, as `YYYY-MM-DD`.
 *
 * Delegates to `@/lib/club-time`'s `todayInClubZone` — the one place this
 * repository answers "which day is it in Oxford", per that module's own
 * doc — rather than carrying a second `Intl.DateTimeFormat` call reaching the
 * same conclusion. Kept as its own name here because this file's callers, and
 * its tests, know it as `londonToday`.
 *
 * Comparing the returned `YYYY-MM-DD` strings lexicographically is the same
 * comparison PostgreSQL would make against `events.scheduled_on`, and it
 * avoids constructing a `Date` per row and then arguing with it about which
 * day a 23:00 kickoff in October belongs to.
 */
export function londonToday(now: Date = new Date()): string {
  return todayInClubZone(now);
}

/** The same date, `days` later. Both argument and result are `YYYY-MM-DD`. */
export function shiftDays(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/** Is this event happening today? Drives the badge and the outline. */
export function isToday(event: EventListEntry, today: string): boolean {
  return event.scheduledOn === today;
}

/**
 * Can a register be opened for it yet? Drives the "Attendance not open" line.
 *
 * **The same question the register itself asks**, through the same function —
 * finding W-F1, and the reason it is worth a paragraph. This used to ask
 * `hasOccurred`, which compares *dates*: it answered "not open" for the whole
 * of the day a session happens, while the register — moved to D71's buffer,
 * which is an *instant* six hours before the start — was open, working, and
 * reachable from the operator's event page.
 *
 * What that cost is the whole point of the mission. At 19:45 on a Wednesday,
 * with tonight's 20:00 practice open for recording since 14:00, the coach's
 * only screen said attendance was not open. The card went on saying it until
 * the following day.
 *
 * So the coach's card, the event page's panel and the register are one
 * function with three call sites. `registerSaved` is carried on the list entry
 * for exactly this: D72 says a register with anything in it never closes, and
 * a card that dropped that half would disagree with the register again, more
 * quietly.
 */
export function isOpenForAttendance(event: EventListEntry, now: Date): boolean {
  // The register's status half, which `services/attendance.ts` states as
  // `ATTENDANCE_OPEN_STATUS`. Written out rather than imported because that
  // module reaches the database and this one must stay pure. A cancelled
  // evening did not happen; a draft has nobody on it.
  if (!COACH_VISIBLE_STATUSES.includes(event.status)) return false;
  return isRegisterAvailable(event, event.registerSaved, now);
}

/**
 * The two sections, in reading order.
 *
 * Sorted here rather than left in the order the service returned, because the
 * two sections want opposite orders — soonest-first ahead of today, most-recent
 * first behind it — and the service can only return one of them.
 *
 * An event with no date at all is `earlier`, and last within it. It cannot be
 * upcoming, because nothing is known about when it is; putting it at the top of
 * the list a coach reads first would be the loudest possible place for the one
 * row that says nothing.
 */
export function bucketCoachEvents(
  events: readonly EventListEntry[],
  today: string,
): CoachEventBucket[] {
  const visible = events.filter((event) => COACH_VISIBLE_STATUSES.includes(event.status));

  const upcoming = visible
    .filter((event) => event.scheduledOn !== null && event.scheduledOn >= today)
    .sort((left, right) => (left.scheduledOn ?? "").localeCompare(right.scheduledOn ?? ""));

  const earlier = visible
    .filter((event) => event.scheduledOn === null || event.scheduledOn < today)
    .sort((left, right) => {
      // Undated rows to the bottom, whichever direction the rest is going.
      if (left.scheduledOn === null) return right.scheduledOn === null ? 0 : 1;
      if (right.scheduledOn === null) return -1;
      return right.scheduledOn.localeCompare(left.scheduledOn);
    });

  return [
    { key: "upcoming", label: UPCOMING_LABEL, detail: UPCOMING_DETAIL, events: upcoming },
    { key: "earlier", label: EARLIER_LABEL, detail: EARLIER_DETAIL, events: earlier },
  ];
}
