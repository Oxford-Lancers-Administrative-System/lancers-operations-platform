import { UNREADABLE_DATE } from "@/lib/club-time";
import type { AmendableField, AmendmentChange } from "@/lib/services/event-amendment-rules";
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
 * ## What the copy does not do — Brian, 2026-08-23, at the visual gate
 *
 * **A control says what it does and what the consequence is. Nothing else.** It
 * never explains the application's design, never justifies a default, and never
 * instructs the operator to go and use a different field.
 *
 * That rule arrived because this file had drifted the other way. It carried a
 * sentence explaining why people who declined are told anyway, one explaining
 * what happens to the people who said yes, one explaining what happens to the
 * people who have not answered, one explaining that the record "gets tidied",
 * one explaining that two changed fields do not produce two messages, and a
 * whole block explaining that there is no reason field and that the operator
 * should put an explanation in the description instead. Every one of them
 * answered a question nobody had asked, and together they buried the two facts
 * that decide the action: how many people get a message, and whether turning
 * the tick off will stop and ask.
 *
 * **A default does not need a reason on screen.** Where the tick starts is
 * visible; why it starts there is not the operator's problem. Where a sentence
 * had nothing left after its justification was removed, the function now
 * returns `null` and the surface renders nothing rather than a line of filler.
 *
 * The mockup's copy is still the source where the mockup says something. This
 * rule cuts; it does not rewrite approved sentences into different ones.
 */

// ---------------------------------------------------------------------------
// Amending — W5
// ---------------------------------------------------------------------------

export const AMEND_HEADLINE_PREFIX = "Editing";

/** W5-02, cut to the consequence: nothing leaves this screen until you save. */
export const AMEND_STAYS_APPROVED = "Nothing is saved or sent until you save.";

export const ALREADY_SENT_HEADING = "Already sent about this event";

export const ALREADY_SENT_DETAIL = "Anything already sent cannot be recalled.";

export const AMEND_DISCARD_LABEL = "Discard changes";
export const AMEND_CONTINUE_LABEL = "Save changes…";
export const AMEND_BACK_LABEL = "Back";

export const AMEND_UNSAVED_BADGE = "Unsaved changes";

export const REVIEW_HEADLINE_PREFIX = "Save changes to";
export const WHAT_CHANGED_HEADING = "What changed";
export const TELL_PEOPLE_HEADING = "Tell people about this change";

export const QUEUED_MESSAGES_HEADING = "Messages already queued";

/** W5-01 and W6-01's two ways out of an approved event. */
export const EDIT_EVENT_LABEL = "Edit event";
export const CANCEL_EVENT_LABEL = "Cancel event";

/** The label on the button that commits the amendment. */
export function saveAndNotifyLabel(notify: boolean, recipients: number): string {
  return notify ? `Save and notify ${recipients}` : "Save without notifying";
}

/**
 * W5-03's sentence about who hears, counted in people.
 *
 * How many people get a message is the consequence of the tick, so it stays.
 * Which of them declined, and why they are told anyway, was the application
 * explaining its own audience rule; `all ${recipients} invited` already
 * includes them.
 */
export function whoHearsAboutIt(recipients: number): string {
  return `One message to all ${recipients} invited ${people(recipients)}.`;
}

/**
 * Whether moving the tick will stop and ask — and nothing else.
 *
 * `null` where there is nothing to say, which is every case except the one
 * where silencing is guarded. Where the tick starts is visible on the tick.
 */
export function notifyDefaultDetail(material: boolean, isFuture: boolean): string | null {
  return material && isFuture ? "Turning this off will ask you to confirm." : null;
}

/**
 * W6-03's version of the same sentence.
 *
 * A cancellation's guard follows the event's date and nothing else, so a past
 * event has nothing to warn about and says nothing.
 */
export function cancelNotifyDefaultDetail(isFuture: boolean): string | null {
  return isFuture ? "Turning this off will ask you to confirm." : null;
}

/**
 * What saving does to messages that have not gone out — LAN-156's hold.
 *
 * `null` when there are none: a heading and a line saying nothing is waiting is
 * a fact about nothing, and the surface renders neither.
 *
 * The count is the one the **delivery** screen reports as **Held** after the
 * save, and `readAmendmentContext` scopes it to invitation jobs for exactly
 * that reason — see the cross-surface test in `change-screens.test.tsx`. It
 * previously counted every job type, so an event whose only unsent jobs were
 * change notices from an earlier amendment announced a number the delivery
 * screen showed as zero.
 *
 * R156-B3. This used to end "… held until you tell people about this
 * change", which promised that notifying — now or later, at Save or at
 * Re-notify — released the hold. At the time nothing in the repository ever
 * cleared `held_at`; W8 is Mission 4's decision arriving, and
 * `resumeHeldMessagesIn` in `event-amendment.ts` now releases every held job
 * in the same save that holds it — held is never a resting state a page
 * reload can observe. The sentence says that, and stops: which held messages
 * and when each was due is the panel's own list, not this one line.
 */
export function queuedMessagesDetail(unsent: number): string | null {
  if (unsent === 0) return null;
  const plural = unsent === 1 ? "message" : "messages";
  const pronoun = unsent === 1 ? "it" : "them";
  return `Saving holds ${unsent} queued ${plural}, then resumes ${pronoun}.`;
}

/**
 * W8, `REQ-reschedule-recomputes`, acceptance #7 — "the application says a
 * reschedule is happening". The mockup's own sentence: a reschedule
 * recomputes the response deadline and every reminder counted from it, using
 * W7's rules, and this is the one place the operator is told so before they
 * commit to it.
 */
export const RESCHEDULE_RECOMPUTES_NOTE =
  "You changed the date or start, so the RSVP deadline and every reminder are recalculated from " +
  "the new one. The app will say a reschedule is happening.";

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

/**
 * R156-B4. The mockup's one worked example is a venue — "told this is at
 * **Iffley Road Astro**" — and the build applied that same "at" to every
 * material field, including a delivery-mode change, which read "told this is
 * at In person": a stored value printed as though the sentence around it did
 * not matter. `MATERIAL_FIELDS` is five fields, not one, and each needs the
 * preposition that makes the sentence a sentence rather than a template with a
 * value dropped in. `scheduledOn`'s value already arrives formatted — see
 * `renderValue` in `event-amendment-rules.ts` — so this is about grammar
 * only, never about the value itself.
 */
function telling(field: AmendableField, value: string): string {
  switch (field) {
    case "venue":
    case "startsAt":
    case "endsAt":
      return `at ${value}`;
    case "scheduledOn":
      return `on ${value}`;
    case "deliveryMode":
      return value.toLowerCase();
    default:
      return value;
  }
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
      ? `${recipients} ${people(recipients)} were told this is ${telling(first.field, first.previous)}.`
      : `${recipients} ${people(recipients)} were told about this event as it stands.`;
  const consequence =
    first && first.next
      ? `If you save without notifying, nobody will be told it has changed to ${first.next}.`
      : "If you save without notifying, nobody will be told it has changed.";
  return `${told} ${consequence}`;
}

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

export const CANCEL_REASON_HELP = "Recipients never see this.";

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

export const CANCELLED_ANSWERS_DETAIL = "Kept as they were.";

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
    `${part({ hour: "numeric", minute: "2-digit", hour12: true })}`
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
