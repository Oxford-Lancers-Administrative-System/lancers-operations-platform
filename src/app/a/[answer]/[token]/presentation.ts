/**
 * Every word the answer-link page says. LAN-172, W2-01 through W2-04. The No
 * button's label is quoted verbatim from `src/lib/delivery/templates.ts`
 * (Brian's Q-10) so the WhatsApp message and the page can't drift apart.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";
import { NO_BUTTON_LABEL } from "@/lib/delivery/templates";

/** The kind of event, in the club's word for it. Only `/design-preview` still calls this (LAN-265) — live screens read `templateName` off the row instead. */
export function eventTypeLabel(eventType: string): string {
  return TYPE_LABELS[eventType] ?? eventType;
}

export const PRIVACY_NOTE =
  "This secure page records only your response. Other players’ responses are never visible.";

// The single control — Brian's accepted no-JavaScript deviation from Q-11

/**
 * This on-page button is a second, separate control from the WhatsApp/email
 * message's own link (owner correction round 3, OWNER-LAN172-10). Brian,
 * verbatim: "If I have options, it should say 'Save options.' If I don't
 * have options, it should say 'Go see other events'." No keeps reusing the
 * message's own label; he did not ask to change it.
 */
export function confirmLabel(answer: "yes" | "no", hasQuestions: boolean): string {
  if (answer === "no") return NO_BUTTON_LABEL;
  return hasQuestions ? YES_CONFIRM_WITH_QUESTIONS : YES_CONFIRM_NO_QUESTIONS;
}

export const YES_CONFIRM_WITH_QUESTIONS = "Save options";
export const YES_CONFIRM_NO_QUESTIONS = "Go see other events";

export const YES_HEADING = "You're attending";
/** Owner correction round 5 (OWNER-LAN172-13): "the wording must never suggest the No is unrecorded until a reason arrives — the click already recorded it." */
export const NO_HEADING = "You're not attending — no reason given";
export const NO_EXPLANATION =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const CHANGE_TO_YES = "Change to Yes";

// Owner correction round 5 (OWNER-LAN172-12/13): the follow-up lives on this landing page, not a second page.

export const QUESTIONS_HEADING = "A couple of questions for this event";
export const REASON_LABEL = "Reason";
export const REASON_PLACEHOLDER = "e.g. clashes with a family commitment";
export const REASON_PROMPT =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const GIVE_REASON_AND_CONTINUE = "Give a reason and continue";
/** W2's Yes-path bullet, verbatim: "Changing to No remains available but visually secondary and lightly framed." */
export const PLANS_CHANGED = "Plans changed? You can change your answer.";

// LAN-203 — a recruit's own reduced confirm screen. REQ-recruit-sees-public-only,
// REQ-no-reason-asked, REQ-never-harsh: distinct copy since a recruit is never
// asked a reason and has no app account to "go see other events" in.

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

// Cancelled — the one non-uniform terminal state, same rule as LAN-79

export const CANCELLED_HEADING = "This event has been cancelled";
export const CANCELLED_NOTE = "No response is needed.";

export function cancelledSentence(eventName: string): string {
  return `${eventName} will not take place.`;
}

// Already answered through this exact link

export const ALREADY_RECORDED_HEADING = "This response is already recorded";
/**
 * LAN-343. This used to read "Check the most recent message from the club for
 * a link to your own page" — and no message the club sends contains one. The
 * page is linked from here instead.
 */
export const ALREADY_RECORDED_NOTE = "You can see and change any of your answers.";

// The one uniform terminal response — same shape LAN-79 established

export const TERMINAL_HEADING = "This link can’t be used";
export const TERMINAL_BODY =
  "Request the latest message from the club. If the event has already started, response changes are closed.";
export const TERMINAL_PRIVACY_NOTE =
  "For privacy, we can’t provide more information about this link.";
export const CLOSE = "Close";

export const BUSY_ERROR = "busy";
export const BUSY_MESSAGE =
  "Your response could not be saved just now because the club received a lot of requests at once. Please try again in a minute.";
