import { UNREADABLE_DATE } from "@/lib/club-time";
import type { AmendableField, AmendmentChange } from "@/lib/services/event-amendment-rules";
import type { EventChangeKind } from "@/lib/services/event-amendment";

// The words the amendment/cancellation surfaces use — W5, W6, LAN-156. Almost
// all verbatim from the approved mockup (Brian, 2026-08-21). Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md.

export const AMEND_HEADLINE_PREFIX = "Editing";

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

export const EDIT_EVENT_LABEL = "Edit event";
export const CANCEL_EVENT_LABEL = "Cancel event";
/** LAN-267. A game-day action, on a game only. */
export const ROSTER_FORM_LABEL = "Roster form";

export function saveAndNotifyLabel(notify: boolean, recipients: number): string {
  return notify ? `Save and notify ${recipients}` : "Save without notifying";
}

/** W5-03's sentence about who hears, counted in people. Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md. */
export function whoHearsAboutIt(recipients: number): string {
  return `One message to all ${recipients} invited ${people(recipients)}.`;
}

/** Whether moving the tick will stop and ask, and nothing else. `null` when nothing to say. */
export function notifyDefaultDetail(material: boolean, isFuture: boolean): string | null {
  return material && isFuture ? "Turning this off will ask you to confirm." : null;
}

export function cancelNotifyDefaultDetail(isFuture: boolean): string | null {
  return isFuture ? "Turning this off will ask you to confirm." : null;
}

/** What saving does to messages not yet sent — LAN-156's hold, R156-B3. Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md. */
export function queuedMessagesDetail(unsent: number): string | null {
  if (unsent === 0) return null;
  const plural = unsent === 1 ? "message" : "messages";
  const pronoun = unsent === 1 ? "it" : "them";
  return `Saving holds ${unsent} queued ${plural}, then resumes ${pronoun}.`;
}

/** W8, `REQ-reschedule-recomputes`, acceptance #7. Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md. */
export const RESCHEDULE_RECOMPUTES_NOTE =
  "You changed the date or start, so the RSVP deadline and every reminder are recalculated from " +
  "the new one. The app will say a reschedule is happening.";

export const SILENCE_NOTIFY_LABEL = "Notify them";
export const SILENCE_PROCEED_LABEL = "Save silently";
export const SILENCE_CANCEL_PROCEED_LABEL = "Cancel silently";
export const SILENCE_TELL_THEM_LABEL = "Tell them";

export function silenceHeadline(changes: readonly AmendmentChange[]): string {
  const material = changes.filter((change) => change.material);
  if (material.length === 0) return "Save this change without telling anyone?";
  if (material.length === 1) {
    return `Change the ${material[0].label.toLowerCase()} without telling anyone?`;
  }
  return "Change the date, time or venue without telling anyone?";
}

/** R156-B4: each of the 5 material fields gets its own preposition. Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md. */
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

export const RENOTIFY_HEADING = "Tell them now";

export const RENOTIFY_DETAIL = "Changes nothing about the event or the answers already given.";

export function renotifyLabel(recipients: number): string {
  return `Re-notify ${recipients} ${people(recipients)}`;
}

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

export const HISTORY_HEADING = "Change history";
export const HISTORY_COLUMN_WHEN = "When";
export const HISTORY_COLUMN_WHO = "Who";
export const HISTORY_COLUMN_WHAT = "What";
export const HISTORY_COLUMN_TOLD = "Told";

export const HISTORY_EMPTY = "Nothing has changed since this event was approved.";

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

export function describeTold(notified: boolean | null, recipients: number | null): string {
  if (notified === null) return "—";
  if (!notified) return "Silent";
  return recipients === null ? "Notified" : `Notified ${recipients}`;
}

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

/** W6-01 leads with the invited-and-expected count, not the name — LAN-242. Decision history: docs/ux/tickets/LAN-156-amend-and-cancel.md · missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md · missions/intake/M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY/decision-history.md. */
export function expectingToBeThere(saidYes: number, invited: number): string {
  return `${saidYes} of ${invited} invited ${saidYes === 1 ? "is" : "are"} expecting to be there.`;
}

export function everyoneWillBeTold(recipients: number): string {
  return `All ${recipients} invited will be told it is off. They will not be told why.`;
}

export function nobodyWillBeTold(recipients: number): string {
  return `None of the ${recipients} invited will be told it is off.`;
}

export function cancelSilenceConsequence(
  saidYes: number,
  invited: number,
  venue: string | null,
): string {
  const where = venue ? ` at ${venue}` : "";
  return (
    `${saidYes} of ${invited} invited ${saidYes === 1 ? "is" : "are"} expecting to be there${where}. ` +
    "If you cancel without telling them, nobody will be told it is off."
  );
}

export const CANCEL_SILENCE_HEADLINE = "Cancel without telling anyone?";

export const CANCELLED_REASON_HEADING = "Why it was cancelled";

export const CANCELLED_REASON_INTERNAL = "Internal. Never shown to anyone who was invited.";

export const CANCELLED_ANSWERS_HEADING = "The answers people gave";

export const CANCELLED_ANSWERS_DETAIL = "Kept as they were.";

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

function people(count: number): string {
  return count === 1 ? "person" : "people";
}

/** A recorded moment, on club time — `docs/ux/standards.md` rule 3. Unparseable prints as {@link UNREADABLE_DATE}, never raw. */
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

function formatRecordedDay(at: Date | string): string {
  const instant = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(instant.getTime())) return UNREADABLE_DATE;

  const part = (options: Intl.DateTimeFormatOptions): string =>
    new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "Europe/London" }).format(instant);

  return `${part({ day: "numeric" })} ${part({ month: "short" })} ${part({ year: "numeric" })}`;
}
