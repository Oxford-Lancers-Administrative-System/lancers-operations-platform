import { derivedEventState, type EventList, type EventListEntry } from "@/lib/services/events";
import { DERIVED_STATE_LABELS, labelFor, STATUS_LABELS } from "./presentation";

/** What the Status filter offers and each row's Status column says — Q-6, Brian at the visual gate. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function statusLabel(event: EventListEntry, today: string): string {
  const derived = derivedEventState(event, today);
  return event.status === "approved" && derived === "occurred"
    ? labelFor(DERIVED_STATE_LABELS, derived)
    : labelFor(STATUS_LABELS, event.status);
}

/** Three empty states, distinguished — `slice-ux.md` § 9, W1's exception table. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export function emptyTestId(list: EventList, filtered: boolean): string {
  if (list.totalInSeason === 0) return "events-empty";
  return filtered ? "events-filter-empty" : "events-period-empty";
}

export function emptyMessage(
  list: EventList,
  filtered: boolean,
  mayManage: boolean,
  periodLabel: string,
): string {
  if (list.totalInSeason === 0) {
    return mayManage
      ? "This season has no events yet. Create the first one."
      : "This season has no events yet.";
  }
  if (filtered) {
    return "No event in this season matches those filters. Clear them to see the season’s events.";
  }
  return `Nothing in ${periodLabel.toLowerCase()}. Try a wider period.`;
}

/** Every column sorts — `REQ-list-shape`. "Term and week" resolves to the same SQL as Date. */
export const SORT_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  { value: "date", label: "Date" },
  { value: "term", label: "Term and week" },
  { value: "name", label: "Event name" },
  { value: "type", label: "Type" },
  { value: "venue", label: "Where" },
  { value: "status", label: "Status" },
  { value: "invited", label: "Invited" },
  { value: "said_yes", label: "Said yes" },
  { value: "showed", label: "Showed" },
]);
