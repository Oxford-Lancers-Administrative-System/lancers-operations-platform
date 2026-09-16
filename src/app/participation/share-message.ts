import { formatEventDateShort, formatEventTime } from "../rsvp/[token]/presentation";

/**
 * The plain text an operator puts in a group chat — LAN-384.
 *
 * Four lines, nothing else, and no names: the event, when and where, the two
 * counts, and the club link. Time and place are formatted by the RSVP page's
 * own formatters (Europe/London), so the message and the page it links to say
 * the same words.
 */

export const COPY_SHARE_MESSAGE = "Copy share message";
export const COPY_SHARE_MESSAGE_DONE = "Copied";

export interface ShareMessageFacts {
  readonly eventName: string;
  readonly scheduledOn: string | null;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly venue: string | null;
  readonly saidYes: number;
  readonly saidNo: number;
  readonly url: string;
}

/** "Wednesday, 14 October, 20:00–22:30 at University Parks" — each part dropped where the event does not carry it. */
function whenAndWhere(facts: ShareMessageFacts): string {
  const date = formatEventDateShort(facts.scheduledOn);
  const time = formatEventTime(facts.startsAt, facts.endsAt);
  const when = [date, time].filter((part) => part !== null).join(", ");
  if (facts.venue === null || facts.venue.trim() === "") return when;
  return when === "" ? facts.venue : `${when} at ${facts.venue}`;
}

export function buildShareMessage(facts: ShareMessageFacts): string {
  return [
    facts.eventName,
    whenAndWhere(facts),
    `${facts.saidYes} yes, ${facts.saidNo} no so far`,
    facts.url,
  ].join("\n");
}
