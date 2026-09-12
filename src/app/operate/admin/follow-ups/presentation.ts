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

// RANGE_*: LAN-281 (Clint, 2026-09-09), range over the event's date, named — LAN-259.
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

// LAN-322: what the club last sent this person, so a second operator does not
// chase somebody who has just been chased.
export const TABLE_LAST_MESSAGE = "Last message";
export const LAST_MESSAGE_NONE = "Nothing sent yet";

export const CHANNEL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  whatsapp: "WhatsApp",
  email: "Email",
});

/** The queue's own action — LAN-322, `/operate/people/missing`'s own wording one workflow over. */
export function chaseButtonLabel(selected: number): string {
  return selected === 1 ? "Chase 1 person" : `Chase ${selected} people`;
}

export function chaseSentNotice(accepted: number): string {
  return accepted === 1 ? "Chased 1 person." : `Chased ${accepted} people.`;
}

export function chaseProblemNotice(refused: number): string {
  return refused === 1 ? "1 person could not be chased:" : `${refused} people could not be chased:`;
}

export const CHASE_NOBODY_SELECTED = "Select at least one person to chase.";

/** A refusal the delivery path recorded no sentence for — the claim itself threw. */
export const CHASE_REFUSAL_UNRECORDED = "Not sent — no reason recorded";

/**
 * Who was refused, and why — LAN-322's walk.
 *
 * The notice used to be a count and a run of names, which told an operator
 * that something was wrong and nothing about what. The three refusals this
 * queue actually produces each want a different next action — correct a phone
 * number, ask the club's administrator to configure the deployment, or leave a
 * recruit alone — so a name is useless without the reason beside it.
 *
 * `names` is everybody who hit the same reason, because they usually all did:
 * one press refused three people locally and repeating the configuration
 * sentence under each of them rebuilt the wall of text {@link REFUSALS_NAMED}
 * exists to prevent.
 */
export function chaseRefusalLine(names: string, reason: string): string {
  return `${names} — ${reason}`;
}

/**
 * How many refused people a notice names before it counts the rest.
 *
 * Measured at 375px against the seeded queue: a select-all over 559
 * outstanding people refused every one of them (nothing is configured to send
 * locally) and the notice became a wall of names nobody could read. The count
 * is already in the sentence above them, so the names are there to start the
 * operator somewhere, not to be the list.
 */
export const REFUSALS_NAMED = 5;

export function andMore(remaining: number): string {
  return remaining === 1 ? "and 1 more" : `and ${remaining} more`;
}

/** `REQ-never-harsh`: a recruit gets one invitation and at most one follow-up, so the queue offers no chase against one. */
export const NOT_CHASEABLE = "Recruit — not chased from here";

/** W5-01/OWNER-LAN173-01's vocabulary; the mockup's "Entry" dropdown is dropped, undefined. */
export const STATUS_FILTER_OPTIONS: readonly { value: string; label: string }[] = Object.freeze([
  Object.freeze({ value: "", label: "All" }),
  Object.freeze({ value: "delivery_problem", label: STATUS_LABELS.delivery_problem }),
  Object.freeze({ value: "escalated", label: STATUS_LABELS.escalated }),
  Object.freeze({ value: "escalation_held", label: STATUS_LABELS.escalation_held }),
  Object.freeze({ value: "chasing", label: STATUS_LABELS.chasing }),
]);
