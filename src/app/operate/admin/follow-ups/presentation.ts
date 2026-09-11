// The Follow-ups queue's own words — W5. Dates use the shared formatters (`docs/ux/standards.md` rule 3).

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

// RANGE_*: LAN-281 (Clint, 2026-09-09), range over the event's date, named — LAN-259. Decision history: missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md.
export const RANGE_FROM_LABEL = "Events from";
export const RANGE_TO_LABEL = "Events to";

export const STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  delivery_problem: "Delivery problem",
  escalated: "Escalated",
  escalation_held: "Escalation held: no President in post",
  chasing: "Chasing",
});

export const DEADLINE_UNSET = "No deadline recorded";
export const CHASE_NONE = "not recorded";

/** W5-01/OWNER-LAN173-01's vocabulary; the mockup's "Entry" dropdown is dropped, undefined. Decision history: missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md · missions/intake/M-OPERATOR-ADMIN-WITHOUT-SQL/decision-history.md. */
export const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  Object.freeze({ value: "", label: "All" }),
  Object.freeze({ value: "delivery_problem", label: STATUS_LABELS.delivery_problem }),
  Object.freeze({ value: "escalated", label: STATUS_LABELS.escalated }),
  Object.freeze({ value: "escalation_held", label: STATUS_LABELS.escalation_held }),
  Object.freeze({ value: "chasing", label: STATUS_LABELS.chasing }),
]);
