import { UNREADABLE_DATE } from "@/lib/club-time";
import type { AmendmentChange } from "@/lib/services/event-amendment-rules";
import type { EventChangeKind } from "@/lib/services/event-amendment";

/**
 * The words the amendment and cancellation surfaces use — W5 and W6, LAN-156.
 *
 * Pure, and separate from the components for the reason every other
 * `presentation.ts` in this route is: a string a screen shows and a string a
 * test asserts have to be the same string, and the only way to guarantee that
 * is for both to import it.
 *
 * ## Where this copy came from
 *
 * Almost all of it is the approved mockup's, verbatim — Brian read the six
 * screens of `W5` and the three of `W6` and approved them on 2026-08-21, and
 * rewriting approved copy into something similar is how a screen stops being
 * the one that was approved.
 *
 * Where it is not verbatim, it is because the mockup states a fact this build
 * cannot state honestly. The mockup says "2 reminders were due to go out on
 * Tuesday"; nothing in this mission knows when a queued message was due,
 * because when a message goes is Mission 4's, so the sentence says how many
 * have not gone and stops.
 *
 * ## What the copy does not do
 *
 * It does not explain the application's design to the operator. Every sentence
 * here says what the surface does or what will happen to a person — "nobody
 * will be told it has moved", "their yes stands" — and none of them describes a
 * rule, a service, a status model or a constraint.
 */

// ---------------------------------------------------------------------------
// Amending — W5
// ---------------------------------------------------------------------------

export const AMEND_HEADLINE_PREFIX = "Editing";

/** W5-02, verbatim. */
export const AMEND_STAYS_APPROVED =
  "This event stays approved while you edit. Nothing here is live until you save, and " +
  "nothing is sent. If you close this without saving, nothing at all happens.";

export const ALREADY_SENT_HEADING = "Already sent about this event";

export const ALREADY_SENT_DETAIL =
  "Editing never discards an answer. Anything already sent stays sent — it cannot be recalled.";

export const AMEND_DISCARD_LABEL = "Discard changes";
export const AMEND_CONTINUE_LABEL = "Save changes…";
export const AMEND_BACK_LABEL = "Back";

export const AMEND_UNSAVED_BADGE = "Unsaved changes";

export const REVIEW_HEADLINE_PREFIX = "Save changes to";
export const WHAT_CHANGED_HEADING = "What changed";
export const TELL_PEOPLE_HEADING = "Tell people about this change";

export const QUEUED_MESSAGES_HEADING = "Messages already queued";
export const EXPLAINING_HEADING = "Explaining the change";

/** OD-1/Q7, in the mockup's own words. */
export const NO_REASON_FIELD_DETAIL =
  "There is no reason field. If people need an explanation, put it in the description — " +
  "it is already required, and it is what they will read.";

export const ONE_MESSAGE_NOT_ONE_PER_FIELD =
  "Nobody receives two messages because two fields moved.";

/** W5-01 and W6-01's two ways out of an approved event. */
export const EDIT_EVENT_LABEL = "Edit event";
export const CANCEL_EVENT_LABEL = "Cancel event";

/** The label on the button that commits the amendment. */
export function saveAndNotifyLabel(notify: boolean, recipients: number): string {
  return notify ? `Save and notify ${recipients}` : "Save without notifying";
}

/** W5-03's sentence about who hears, counted in people. */
export function whoHearsAboutIt(recipients: number, saidNo: number): string {
  const audience = `One message to all ${recipients} invited ${people(recipients)}`;
  if (saidNo === 0) return `${audience}.`;
  return (
    `${audience} — including the ${saidNo} who said no, ` +
    "because a venue or date change might change their answer."
  );
}

/** W5-03, the two sentences under the tick that name what a message means. */
export function yesStandsDetail(saidYes: number): string | null {
  if (saidYes === 0) return null;
  return (
    `The ${saidYes} who said yes ${saidYes === 1 ? "is" : "are"} told to re-read the details. ` +
    `Their yes stands — they are not asked again.`
  );
}

export function noAnswerDetail(noAnswer: number): string | null {
  if (noAnswer === 0) return null;
  return `The ${noAnswer} who ${
    noAnswer === 1 ? "has" : "have"
  } not answered get this as an ordinary reminder to answer.`;
}

/** Where the tick started, and whether moving it will ask. */
export function notifyDefaultDetail(material: boolean, isFuture: boolean): string {
  if (!isFuture) {
    return (
      "Off by default, because the event has passed. Nobody needs a message about something " +
      "already gone."
    );
  }
  if (material) {
    return "On by default because the date, time or venue moved. Turning it off will ask you to confirm.";
  }
  return "Off by default. Turn it on to tell everyone invited that this event changed.";
}

/** W5-03's queued-message sentence, without the delivery time this mission does not own. */
export function queuedMessagesDetail(unsent: number): string {
  if (unsent === 0) return "Nothing is waiting to go out for this event.";
  return (
    `${unsent} ${unsent === 1 ? "message has" : "messages have"} not gone out yet. Saving holds ` +
    `${unsent === 1 ? "it" : "them"} until this change has been taken into account, so nobody ` +
    "receives a message describing the old details."
  );
}

// ---------------------------------------------------------------------------
// Silencing — W5-03b and W6-03
// ---------------------------------------------------------------------------

export const SILENCE_NOTIFY_LABEL = "Notify them";
export const SILENCE_PROCEED_LABEL = "Save silently";
export const SILENCE_CANCEL_PROCEED_LABEL = "Cancel silently";
export const SILENCE_TELL_THEM_LABEL = "Tell them";

/** W5-03b's heading, named after the field that moved. */
export function silenceHeadline(changes: readonly AmendmentChange[]): string {
  const material = changes.filter((change) => change.material);
  if (material.length === 0) return "Save this change without telling anyone?";
  if (material.length === 1) {
    return `Change the ${material[0].label.toLowerCase()} without telling anyone?`;
  }
  return "Change the date, time or venue without telling anyone?";
}

/** W5-03b, verbatim in shape: what they were told, and what happens if nobody is told. */
export function silenceConsequence(
  recipients: number,
  changes: readonly AmendmentChange[],
): string {
  const material = changes.filter((change) => change.material);
  const first = material[0];
  const told =
    first && first.previous
      ? `${recipients} ${people(recipients)} were told this is at ${first.previous}.`
      : `${recipients} ${people(recipients)} were told about this event as it stands.`;
  const consequence =
    first && first.next
      ? `If you save without notifying, nobody will be told it has changed to ${first.next}.`
      : "If you save without notifying, nobody will be told it has changed.";
  return `${told} ${consequence}`;
}

export const SILENCE_RIGHT_AND_WRONG =
  "This is the right choice for a corrected spelling. It is the wrong one for an event that " +
  "has actually moved.";

// ---------------------------------------------------------------------------
// Re-notify — W5-04
// ---------------------------------------------------------------------------

export const RENOTIFY_HEADING = "Tell them now";

export const RENOTIFY_DETAIL = "Changes nothing about the event or the answers already given.";

export function renotifyLabel(recipients: number): string {
  return `Re-notify ${recipients} ${people(recipients)}`;
}

/** W5-04's warning, naming the change that went out to nobody. */
export function silentChangeNotice(entry: {
  occurredAt: Date;
  changes: readonly AmendmentChange[];
}): string {
  const first = entry.changes[0];
  const what = first ? first.label.toLowerCase() : "event";
  return `The ${what} changed on ${formatRecordedDay(entry.occurredAt)} and nobody was told.`;
}

export function renotifySends(recipients: number): string {
  return `Sends the change to all ${recipients} invited ${people(recipients)}.`;
}

// ---------------------------------------------------------------------------
// The change history — W5-05
// ---------------------------------------------------------------------------

export const HISTORY_HEADING = "Change history";
export const HISTORY_COLUMN_WHEN = "When";
export const HISTORY_COLUMN_WHO = "Who";
export const HISTORY_COLUMN_WHAT = "What";
export const HISTORY_COLUMN_TOLD = "Told";

export const HISTORY_EMPTY = "Nothing has changed since this event was approved.";

/** The **What** column, in the club's words rather than in field names. */
export function describeHistoryEntry(entry: {
  kind: EventChangeKind;
  changes: readonly AmendmentChange[];
  recipients: number | null;
}): string {
  switch (entry.kind) {
    case "approved":
      return entry.recipients === null ? "Approved" : `Approved · ${entry.recipients} invited`;
    case "renotified":
      return "Re-notified the audience";
    case "cancelled":
      return "Cancelled";
    case "amended":
      return entry.changes.length === 0 ? "Amended" : entry.changes.map(describeChange).join(" · ");
  }
}

/** "Venue: Iffley Road Astro → University Parks". */
export function describeChange(change: AmendmentChange): string {
  const from = change.previous ?? "not set";
  const to = change.next ?? "not set";
  return `${change.label}: ${from} → ${to}`;
}

/** The **Told** column. `null` for an entry nobody decided about. */
export function describeTold(notified: boolean | null, recipients: number | null): string {
  if (notified === null) return "—";
  if (!notified) return "Silent";
  return recipients === null ? "Notified" : `Notified ${recipients}`;
}

// ---------------------------------------------------------------------------
// Cancelling — W6
// ---------------------------------------------------------------------------

export const CANCEL_KEEP_LABEL = "Keep it";
export const CANCEL_REASON_LABEL = "Why is it off?";

export const CANCEL_REASON_HELP = "For the club's record. Recipients never see this.";

export const CANCEL_TELL_EVERYONE_LABEL = "Tell everyone invited";

export const CANCEL_IRREVERSIBLE =
  "This cannot be undone. If it is rearranged it will be a new event.";

export function cancelHeadline(typeLabel: string): string {
  return `Cancel this ${typeLabel.toLowerCase()}?`;
}

export function cancelConfirmLabel(typeLabel: string): string {
  return `Cancel the ${typeLabel.toLowerCase()}`;
}

/** W6-01 leads with the number of people expecting to be there, not with the name. */
export function expectingToBeThere(saidYes: number): string {
  return `${saidYes} ${people(saidYes)} ${saidYes === 1 ? "is" : "are"} expecting to be there.`;
}

export function everyoneWillBeTold(recipients: number): string {
  return `All ${recipients} invited will be told it is off. They will not be told why.`;
}

export function nobodyWillBeTold(recipients: number): string {
  return `None of the ${recipients} invited will be told it is off.`;
}

/** W6-03's silencing confirmation, counted in people. */
export function cancelSilenceConsequence(saidYes: number, venue: string | null): string {
  const where = venue ? ` at ${venue}` : "";
  return (
    `${saidYes} ${people(saidYes)} ${saidYes === 1 ? "is" : "are"} expecting to be there${where}. ` +
    "If you cancel without telling them, nobody will be told it is off."
  );
}

export const CANCEL_SILENCE_HEADLINE = "Cancel without telling anyone?";

// --- the cancelled event's own page, W6-02 ---------------------------------

export const CANCELLED_REASON_HEADING = "Why it was cancelled";

export const CANCELLED_REASON_INTERNAL = "Internal. Never shown to anyone who was invited.";

export const CANCELLED_ANSWERS_HEADING = "The answers people gave";

export const CANCELLED_ANSWERS_DETAIL =
  "Kept as they were. They are a record of what people said, not an obligation to anything.";

/** W6-02's opening line: who, when, and whether people were told. */
export function cancelledSummary(entry: {
  occurredAt: Date;
  actorName: string | null;
  notified: boolean | null;
  recipients: number | null;
}): string {
  const who = entry.actorName ? ` by ${entry.actorName}` : "";
  const when = `Cancelled on ${formatRecordedMoment(entry.occurredAt)}${who}.`;
  if (entry.notified === null) return when;
  if (!entry.notified) return `${when} Nobody was told.`;
  const count = entry.recipients ?? 0;
  return `${when} All ${count} invited ${people(count)} were told.`;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function people(count: number): string {
  return count === 1 ? "person" : "people";
}

/**
 * A recorded moment, on club time — `docs/ux/standards.md` rule 3.
 *
 * The guard is the rule's own story: an unparseable value says so in words and
 * is never printed raw and never printed as `Invalid Date`. Nothing on these
 * screens can produce one today, because every value arrives from a
 * `timestamptz`; the guard is here because that is what the rule asks for and
 * because one unreadable row must not take the other twenty with it.
 */
export function formatRecordedMoment(at: Date | string): string {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) return UNREADABLE_DATE;

  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(instant);

  return (
    `${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}, ` +
    `${part({ hour: "2-digit", minute: "2-digit", hour12: false })}`
  );
}

/** The same moment without the clock, for a sentence that only needs the day. */
export function formatRecordedDay(at: Date | string): string {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) return UNREADABLE_DATE;

  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(instant);

  return `${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}`;
}
