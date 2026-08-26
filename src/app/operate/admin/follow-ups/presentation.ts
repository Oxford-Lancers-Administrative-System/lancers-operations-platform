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
  return `${people} ${peopleWord} across ${events} approved ${eventWord} · nobody compiles this list`;
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
export const CHASE_NONE = "—";
