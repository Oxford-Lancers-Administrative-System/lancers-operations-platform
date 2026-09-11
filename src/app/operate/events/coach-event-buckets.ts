// The coach's list order — Brian, 14 Aug 2026.
import { todayInClubZone } from "@/lib/club-time";
import { isRegisterAvailable } from "@/lib/services/attendance-window";
import type { EventListEntry } from "@/lib/services/events";

type CoachEventBucketKey = "upcoming" | "earlier";

export interface CoachEventBucket {
  key: CoachEventBucketKey;
  label: string;
  detail: string;
  events: EventListEntry[];
}

const UPCOMING_LABEL = "Upcoming";
const UPCOMING_DETAIL = "Today first, then what is coming up";
const EARLIER_LABEL = "Earlier";
const EARLIER_DETAIL = "Before today, most recent first";

export const COACH_VISIBLE_STATUSES: readonly string[] = Object.freeze(["approved"]);

export function londonToday(now: Date = new Date()): string {
  return todayInClubZone(now);
}

export function shiftDays(day: string, days: number): string {
  const shifted = new Date(`${day}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function isToday(event: EventListEntry, today: string): boolean {
  return event.scheduledOn === today;
}

// Can a register be opened for it yet — the same question the register itself asks (W-F1).
export function isOpenForAttendance(event: EventListEntry, now: Date): boolean {
  if (!COACH_VISIBLE_STATUSES.includes(event.status)) return false;
  return isRegisterAvailable(event, event.registerSaved, now);
}

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
      if (left.scheduledOn === null) return right.scheduledOn === null ? 0 : 1;
      if (right.scheduledOn === null) return -1;
      return right.scheduledOn.localeCompare(left.scheduledOn);
    });

  return [
    { key: "upcoming", label: UPCOMING_LABEL, detail: UPCOMING_DETAIL, events: upcoming },
    { key: "earlier", label: EARLIER_LABEL, detail: EARLIER_DETAIL, events: earlier },
  ];
}
