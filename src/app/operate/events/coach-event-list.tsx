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

// The coaching assignment's event list — LAN-110.
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
