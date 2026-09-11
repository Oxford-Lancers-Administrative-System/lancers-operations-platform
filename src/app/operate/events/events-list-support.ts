import { derivedEventState, type EventList, type EventListEntry } from "@/lib/services/events";
import { DERIVED_STATE_LABELS, labelFor, STATUS_LABELS } from "./presentation";

/**
 * What the Status filter offers, and what each row's Status column says — Q-6.
 *
 * Brian, at the visual gate: "I want to be able to see the status on the status
 * filter, and I want to see the events that occurred, to easily be able to tell
 * which ones happened versus not." So **Occurred** is a fourth choice beside the
 * three stored states, and a past approved event reads `Occurred` in the column
 * rather than `Approved`.
 *
 * It stays derived. Nothing stores it, nobody asserts it, and the enum is still
 * three values (D30) — `EVENT_STATUS_FILTERS` lives beside `derivedEventState` in
 * the service layer for exactly that reason, so a reader who follows the word
 * arrives at the rule rather than at a column.
 */
export function statusLabel(event: EventListEntry, today: string): string {
  const derived = derivedEventState(event, today);
  return event.status === "approved" && derived === "occurred"
    ? labelFor(DERIVED_STATE_LABELS, derived)
    : labelFor(STATUS_LABELS, event.status);
}

/**
 * Colour is never the only carrier — every chip states its status in words.
 *
 * Keyed on the word the chip actually shows rather than on the stored status, so
 * an `Occurred` chip cannot be shaded as though it read `Approved`.
 */

/**
 * Three empty states, distinguished, because the recovery differs.
 *
 * `slice-ux.md` § 9, and `W1`'s exception table: "nothing this week" is not
 * "nothing all season", which is not "nothing matching your filter". Each says
 * what is true and offers the smallest recovery the reader is authorized to
 * take — and none of them explains a rule.
 */
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

/**
 * The sort choices, as the phone control needs them.
 *
 * Every column in the table, so the phone has the sorts the desktop headers
 * have — `REQ-list-shape`: "Every column sorts". **Term and week** is here and
 * resolves to the same SQL as Date, which is the requirement rather than a
 * shortcut.
 */
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
