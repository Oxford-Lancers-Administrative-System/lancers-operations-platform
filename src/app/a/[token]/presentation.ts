/**
 * Every word the answer-link page says. LAN-172, W2-01 through W2-04.
 *
 * The No button's label is Brian's Q-10 decision, quoted verbatim from
 * `src/lib/delivery/templates.ts` rather than restated, so the WhatsApp
 * message and the page it opens can never drift into two different labels for
 * that action. The Yes button's on-page label no longer reuses the message's
 * own text — owner correction round 3, `confirmLabel`'s own doc comment below
 * has the reasoning. Everything else is new copy for this ticket and is
 * reviewed alongside the mockup, same as LAN-79's was.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";
import { NO_BUTTON_LABEL } from "@/lib/delivery/templates";

export const BANNER = "LANCERS OPERATIONS";

export function eventTypeLabel(eventType: string): string {
  return TYPE_LABELS[eventType] ?? eventType;
}

export const PRIVACY_NOTE =
  "This secure page records only your response. Other players’ responses are never visible.";

// ---------------------------------------------------------------------------
// The single control — Brian's accepted no-JavaScript deviation from Q-11
// ---------------------------------------------------------------------------

/**
 * Owner correction round 3 (LAN-172, OWNER-LAN172-10): this on-page button is
 * a second, separate control from the WhatsApp/email message's own link —
 * the player has already arrived by the time they see it, so naming "what
 * tapping this does" by repeating the message's own "view details" reads as
 * a category error once the details are already on screen. Q-10 governs only
 * the message's own `YES_BUTTON_LABEL` / `NO_BUTTON_LABEL` (Meta enforces
 * their 25-character, alphanumeric shape); an on-page button carries no such
 * constraint and is free to say what actually happens next.
 *
 * Brian, verbatim: "If I have options, it should say 'Save options.' If I
 * don't have options, it should say 'Go see other events'." He did not ask
 * to change the No button's own wording — only what a Yes does next — so No
 * keeps reusing the message's own label.
 */
export function confirmLabel(answer: "yes" | "no", hasQuestions: boolean): string {
  if (answer === "no") return NO_BUTTON_LABEL;
  return hasQuestions ? YES_CONFIRM_WITH_QUESTIONS : YES_CONFIRM_NO_QUESTIONS;
}

export const YES_CONFIRM_WITH_QUESTIONS = "Save options";
export const YES_CONFIRM_NO_QUESTIONS = "Go see other events";

export const YES_HEADING = "You're attending";
/**
 * Owner correction round 5 (OWNER-LAN172-13), overriding correction
 * LAN-172-c2's earlier reasoning. W2's No-path section, read in full per the
 * Mission Lead's instruction: "Lead with You're not attending — no reason
 * given... The wording must never suggest the No is unrecorded until a
 * reason arrives. The click already recorded it" — this is the spec's own
 * words for the page the player lands on immediately after tapping No in
 * WhatsApp, describing their own stated choice and the reason field's honest
 * current value, not a claim about which HTTP request has completed. Q-11 is
 * unchanged by this: the GET underneath this heading still writes nothing;
 * only the page's own form submission (`submitAnswer`) records anything, and
 * does so whether or not the reason field was ever touched.
 */
export const NO_HEADING = "You're not attending — no reason given";
export const NO_EXPLANATION =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const CHANGE_TO_YES = "Change to Yes";
export const OUTSTANDING_QUESTIONS = "Additional questions outstanding";

// ---------------------------------------------------------------------------
// Owner correction round 5 (OWNER-LAN172-12, OWNER-LAN172-13): the follow-up
// itself now lives on this landing page, not a second page reached after a
// click. W2 line 61 (the approved landing-page table): the Yes landing
// "asks applicable event questions"; the No-path section: "the reason field
// belongs on that page" and "Give a reason and continue is the single
// forward action, with no separate continue control competing with it."
// ---------------------------------------------------------------------------

export const QUESTIONS_HEADING = "A couple of questions for this event";
export const REASON_LABEL = "Reason";
export const REASON_PLACEHOLDER = "e.g. clashes with a family commitment";
export const REASON_PROMPT =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const GIVE_REASON_AND_CONTINUE = "Give a reason and continue";
/**
 * W2's own Yes-path bullet, quoted verbatim: "Changing to No remains
 * available but visually secondary and lightly framed." The same shortcut
 * `/me/[token]`'s focused panel already offers a standing Yes, now also
 * offered here, before the RSVP has even been recorded yet.
 */
export const PLANS_CHANGED = "Plans changed? You can change your answer.";

// ---------------------------------------------------------------------------
// LAN-203 — a recruit's own reduced confirm screen
// ---------------------------------------------------------------------------
//
// REQ-recruit-sees-public-only, REQ-no-reason-asked, REQ-never-harsh. A
// recruit reaches this exact route through `recruit_event_followup`'s own
// yes/no buttons (the invitation itself reuses `event_invitation`
// unchanged), and needs distinct copy in three places: the player's page
// name and event questions are never asked of them, a No is never asked
// for a reason, and "Go see other events" presumes an app account they do
// not have.

export const RECRUIT_YES_HEADING = "You're attending";
export const RECRUIT_NO_HEADING = "Not attending";
export const RECRUIT_CONFIRM_LABEL = "Confirm";

export function attendingSentence(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "One other person is already attending."
    : `${count} other people are already attending.`;
}

export function otherOutstandingSentence(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "You have one other invitation still waiting for an answer."
    : `You have ${count} other invitations still waiting for an answer.`;
}

// ---------------------------------------------------------------------------
// Cancelled — the one non-uniform terminal state, same rule as LAN-79
// ---------------------------------------------------------------------------

export const CANCELLED_HEADING = "This event has been cancelled";
export const CANCELLED_NOTE = "No response is needed.";

export function cancelledSentence(eventName: string): string {
  return `${eventName} will not take place.`;
}

// ---------------------------------------------------------------------------
// Already answered through this exact link
// ---------------------------------------------------------------------------

export const ALREADY_RECORDED_HEADING = "This response is already recorded";
export const ALREADY_RECORDED_NOTE =
  "Check the most recent message from the club for a link to your own page, where you can see and change any of your answers.";

// ---------------------------------------------------------------------------
// The one uniform terminal response — same shape LAN-79 established
// ---------------------------------------------------------------------------

export const TERMINAL_HEADING = "This link can’t be used";
export const TERMINAL_BODY =
  "Request the latest message from the club. If the event has already started, response changes are closed.";
export const TERMINAL_PRIVACY_NOTE =
  "For privacy, we can’t provide more information about this link.";
export const CLOSE = "Close";

export const BUSY_ERROR = "busy";
export const BUSY_MESSAGE =
  "Your response could not be saved just now because the club received a lot of requests at once. Please try again in a minute.";
