/**
 * The Follow-ups queue's own words — W5.
 *
 * `docs/ux/standards.md` rule 3 forbids a raw ISO date on any screen, so every
 * date and deadline here goes through the shared formatters
 * (`formatLongDate`, `formatDeadline`) the rest of the operator shell already
 * uses, never a hand-rolled one for this page alone.
 */

export const PAGE_HEADING = "Follow-ups";

export function subheading(people: number, events: number): string {
  const peopleWord = people === 1 ? "person" : "people";
  const eventWord = events === 1 ? "event" : "events";
  return `${people} ${peopleWord} across ${events} approved ${eventWord}`;
}

export const EMPTY_QUEUE =
  "Nobody is outstanding. Every approved event has either answered or been resolved.";

export const TABLE_PERSON = "Person";
export const TABLE_EVENT = "Event";
export const TABLE_WHEN = "When";
export const TABLE_DEADLINE = "Deadline";
export const TABLE_CHASE = "Where the chase has got to";
export const TABLE_STATUS = "Status";

export const SEARCH_LABEL = "Search name or contact";

/**
 * The date-range filter's own two labels — LAN-281, Clint's ask of 2026-09-09.
 *
 * He was shown this board, said he likes it organised by player, and asked for
 * one thing: "the only thing I think that would be good to filter is to just
 * have it be like filter by a date range… who's not responding to the stuff
 * that we need them to respond to next week?" So the range is over the event's
 * own date — the "When" column — and reaches forward as readily as back.
 *
 * They name the event rather than saying only "From" and "To" because a filter
 * control is read on its own by anybody using a screen reader, and "From" alone
 * does not say from what. LAN-259 found this board's neighbours with no
 * accessible name at all; these carry one because `DateField` renders the label
 * as the input's own.
 */
export const RANGE_FROM_LABEL = "Events from";
export const RANGE_TO_LABEL = "Events to";

/** `FollowUpStatus`, in the club's words — W5's own three chips plus the vacancy. */
export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  delivery_problem: "Delivery problem",
  escalated: "Escalated",
  escalation_held: "Escalation held: no President in post",
  chasing: "Chasing",
});

export const STATUS_COLOURS: Readonly<Record<string, "default" | "warning" | "error" | "info">> =
  Object.freeze({
    delivery_problem: "warning",
    escalated: "error",
    escalation_held: "error",
    chasing: "default",
  });

export const DEADLINE_UNSET = "No deadline recorded";
export const CHASE_NONE = "not recorded";

/**
 * The mockup's own vocabulary, W5-01/OWNER-LAN173-01.
 *
 * The Status dropdown is built exactly as drawn — search plus a Status filter
 * over the same chip vocabulary the last column already shows. The mockup's
 * second dropdown, "Entry", is dropped rather than guessed at: no W5 spec text
 * defines what it filters and Brian has not defined it, so building it would
 * be inventing a meaning nobody approved. Labels come from `STATUS_LABELS`
 * rather than a second copy of the same four words, so the filter and the
 * chip can never say a status differently.
 */
export const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  Object.freeze({ value: "", label: "All" }),
  Object.freeze({ value: "delivery_problem", label: STATUS_LABELS.delivery_problem }),
  Object.freeze({ value: "escalated", label: STATUS_LABELS.escalated }),
  Object.freeze({ value: "escalation_held", label: STATUS_LABELS.escalation_held }),
  Object.freeze({ value: "chasing", label: STATUS_LABELS.chasing }),
]);
