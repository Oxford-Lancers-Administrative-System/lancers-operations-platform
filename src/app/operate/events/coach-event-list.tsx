import { UnavailableScreen } from "@/app/operate/unavailable";
import { isServiceError } from "@/lib/db";
import { listCurrentSeasonEvents, type EventList } from "@/lib/services/events";
import { CoachEligibleEvents } from "./coach-eligible-events";
import {
  bucketCoachEvents,
  isOpenForAttendance,
  isToday,
  londonToday,
} from "./coach-event-buckets";
import { formatListWhen } from "./presentation";

/**
 * The coaching assignment's event list. LAN-110.
 *
 * It reads through `listCurrentSeasonEvents` — the same service, the same season
 * resolution, the same query — rather than through a second reader of its own,
 * and filters the statuses in `./coach-event-buckets.ts`. LAN-110's own criterion
 * is that "no code path duplicates LAN-80's attendance model", and a private
 * events query for coaches would be the first step towards two answers to "which
 * events are there".
 *
 * It reads the unguarded service call rather than `listEventsForOperator`, and
 * that is not a gap: the page's own gate has already resolved this coach as a
 * linked, active operator, and calling the guard again would resolve the same
 * session a second time to reach the same answer. What the coach may *see* is
 * narrowed below and in `./coach-event-buckets.ts`, which is where LAN-110 put
 * it — approved and occurred, no status from the query string, and none of the
 * counts.
 *
 * A function the page awaits rather than a component it returns. An async
 * component element returned from another async component is resolved by the
 * framework but not by a direct `render(await Page())`, so writing it that way
 * would have made the coach's list untestable at exactly the level the rest of
 * this screen is tested at.
 */
export async function coachEventList(search: string) {
  let list: EventList;
  try {
    list = await listCurrentSeasonEvents({ search, sort: "date", direction: "desc" });
  } catch (error) {
    if (!isServiceError(error)) throw error;
    return (
      <UnavailableScreen title="Attendance" message={error.message} testId="events-unavailable" />
    );
  }

  const today = londonToday();
  // The card's open/not-open line is about an instant, not a day — W-F1. The
  // sections are still bucketed by date; only the register's own question needs
  // the clock.
  const now = new Date();

  return (
    <CoachEligibleEvents
      search={search}
      filtered={search !== ""}
      sections={bucketCoachEvents(list.events, today).map((bucket) => ({
        key: bucket.key,
        label: bucket.label,
        detail: bucket.detail,
        events: bucket.events.map((event) => ({
          id: event.id,
          name: event.name,
          when: formatListWhen(event),
          venue: event.venue,
          isToday: isToday(event, today),
          isOpen: isOpenForAttendance(event, now),
        })),
      }))}
    />
  );
}
