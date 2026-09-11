/**
 * Every word the RSVP page says, in one place. LAN-79. Terminal copy is
 * quoted from Brian's 12 August 2026 owner decision; constants, not JSX
 * literals, so the uniform-response rule (UX-63/64/65 render the same string)
 * is provable by a test.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";

// UX-60 — the invitation

/** The kind of event, in the club's word for it. Only `/design-preview` still calls this (LAN-265) — live screens read `templateName` off the row instead. */
export function eventTypeLabel(eventType: string): string {
  return TYPE_LABELS[eventType] ?? eventType;
}

export const PRIVACY_NOTE =
  "This secure page records only your response. Other players’ responses are never visible.";
export const PLAYER_LABEL = "Player";
export const INVITATION_LABEL = "Your invitation";
export const VENUE_LABEL = "Venue";
/** D17, LAN-264. Imported, not re-typed, so every surface calls it the same thing (rule 7). */
export { DESCRIPTION_LABEL, EQUIPMENT_LABEL } from "@/lib/services/event-vocabulary";
export const DEADLINE_LABEL = "Response deadline";
export const DEADLINE_NOTE = "Late responses accepted until start";
export const CURRENT_ANSWER_LABEL = "Current answer";
export const CURRENT_ANSWER_NOTE = "Only you can see this";

export const ATTENDING = "I’m attending";
export const NOT_ATTENDING = "I’m not attending";

/** The three standing answers, in the shared vocabulary of `slice-ux.md` § 6. */
export const ANSWER_ATTENDING = "Attending";
export const ANSWER_NOT_ATTENDING = "Not attending";
export const ANSWER_NONE = "No response";

// UX-61 — declining

export const DECLINE_HEADING = "Not attending";
export const DECLINE_PROMPT = "Choose a reason before saving Not attending.";
export const REASON_LABEL = "Reason";
export const REASON_PLACEHOLDER = "Academic conflict";
// Deliberately no "Additional detail" field — Brian removed it 14 August 2026.
export const SAVE_NOT_ATTENDING = "Save Not attending";
export const BACK = "Back";

// UX-62 — saved

export const SAVED_HEADING = "Your response is saved";
export const SAVED_NOTE =
  "You can change this answer until the event starts, including after the stated response deadline.";
export const CHANGE_RESPONSE = "Change response";
export const CLOSE = "Close";

// UX-63, UX-64, UX-65 — the one uniform terminal response

/** Quoted from the owner decision. All three internal states render exactly this, at `404`, with the same actions and headers. */
export const TERMINAL_HEADING = "This RSVP link can’t be used";
export const TERMINAL_BODY =
  "Request the latest RSVP link from the club. If the event has already started, response changes are closed.";
export const TERMINAL_PRIVACY_NOTE =
  "For privacy, we can’t provide more information about this link.";
export const CONTACT_THE_CLUB = "Contact the club";

/** Where "Contact the club" goes, or empty when nobody has decided. `NEXT_PUBLIC_*` is inlined at build time. No default: a plausible placeholder once shipped a `mailto:` to a reserved `.example` domain. */
export const CLUB_CONTACT_EMAIL = (process.env.NEXT_PUBLIC_CLUB_CONTACT_EMAIL ?? "").trim();

// UX-66 — a valid link to a cancelled event

export const CANCELLED_HEADING = "This event has been cancelled";
export const CANCELLED_NOTE =
  "No response is needed. Existing RSVP history remains auditable but cannot be changed here.";

/** "Team Practice on Wednesday, 14 October will not take place." */
export function cancelledSentence(eventName: string, when: string | null): string {
  return when === null
    ? `${eventName} will not take place.`
    : `${eventName} on ${when} will not take place.`;
}

// Formatting — fixed to Europe/London and en-GB, never the viewer's locale.

const ZONE = "Europe/London";

/** "Wednesday, 14 October 2026" */
export function formatEventDate(scheduledOn: string | null): string | null {
  if (scheduledOn === null) return null;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${scheduledOn}T00:00:00Z`));
}

/** "Wednesday, 14 October" — assembled from two formatters since `en-GB` drops the comma the wireframes show without a year. */
export function formatEventDateShort(scheduledOn: string | null): string | null {
  if (scheduledOn === null) return null;
  const date = new Date(`${scheduledOn}T00:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(date);
  const dayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
  return `${weekday}, ${dayMonth}`;
}

/** "20:00–22:30", or "20:00" where no end is recorded, or null where no time is. */
export function formatEventTime(startsAt: string | null, endsAt: string | null): string | null {
  if (startsAt === null) return null;
  return endsAt === null ? startsAt : `${startsAt}–${endsAt}`;
}

/** "Tuesday, 13 October at 18:00" */
export function formatDeadline(deadline: Date | null): string | null {
  if (deadline === null) return null;
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: ZONE,
  }).format(deadline);
  const dayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: ZONE,
  }).format(deadline);
  const date = `${weekday}, ${dayMonth}`;
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ZONE,
  }).format(deadline);
  return `${date} at ${time}`;
}

/** The event line the saved and declining screens repeat back. */
export function eventSummary(
  eventName: string,
  scheduledOn: string | null,
  startsAt: string | null,
): string {
  const date = formatEventDateShort(scheduledOn);
  if (date === null) return eventName;
  return startsAt === null ? `${eventName} · ${date}` : `${eventName} · ${date} at ${startsAt}`;
}
