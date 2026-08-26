/**
 * Every word the player's durable page says. LAN-172, W2-05 and W2-06.
 *
 * Owner correction round 2 (Q-22, Q-23): the first pass shipped invented copy
 * ("Your page") and a collapsed two-section structure the ticket had
 * self-authorised. This restores the approved four-section structure —
 * `New invitations`, `Still need your answer`, `Follow-up needed`, `Your
 * answers — still to come` — with the shared date/time formatters
 * `src/app/rsvp/[token]/presentation.ts` already established (never a raw
 * ISO string), while keeping every visual choice (buttons, chips, spacing,
 * type scale) in the application's own idiom per Q-23.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";
import { attendingSentence, otherOutstandingSentence } from "@/app/a/[token]/presentation";
import { formatDeadline, formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";

export const BANNER = "LANCERS OPERATIONS";
export const PRIVACY_NOTE =
  "This secure page shows only your own events and answers. Nobody else's response is ever shown here.";

export function eventTypeLabel(eventType: string): string {
  return TYPE_LABELS[eventType] ?? eventType;
}

export {
  attendingSentence,
  otherOutstandingSentence,
  formatDeadline,
  formatEventDate,
  formatEventTime,
};

// ---------------------------------------------------------------------------
// The page heading — a count of outstanding work, not a made-up title
// (W2.html:956). Brian, 2026-08-26: put the player's own name above it too,
// so they know they are on the right page. No other personal detail.
// ---------------------------------------------------------------------------

export function pageHeading(outstandingCount: number): string {
  if (outstandingCount === 0) return NO_OUTSTANDING_EVENTS;
  return outstandingCount === 1
    ? "You have 1 invitation to answer"
    : `You have ${outstandingCount} invitations to answer`;
}

export const HEADING_HELP =
  "Answer the next one now. Below that, everything you have already answered and that is still to come.";
export const EMPTY_HELP =
  "You have answered every invitation waiting for you. Nothing else needs an answer right now.";

// ---------------------------------------------------------------------------
// The four approved sections, in order — W2-answer-an-invitation.md:201-210
// ---------------------------------------------------------------------------

export const NEW_INVITATIONS_HEADING = "New invitations";
export const STILL_NEED_ANSWER_HEADING = "Still need your answer";
export const FOLLOW_UP_HEADING = "Follow-up needed";
export const ANSWERED_HEADING = "Your answers — still to come";
export const ANSWERED_HELP =
  "Everything you have already answered that has not happened yet. Change any of them.";

/**
 * The row's one-line state sentence for `Still need your answer`. Not "you
 * opened this invitation" — Q-11 keeps the answer link's GET side-effect-free,
 * so that fact is never tracked. What is actually true, and actually shown:
 * the club has already followed up once and is still waiting.
 */
export const STILL_NEED_ANSWER_SENTENCE =
  "The club has already followed up once. You have not yet said Yes or No.";

export const FOLLOW_UP_NO_REASON_SENTENCE = "Your No is recorded. Add the reason if you can.";
export const FOLLOW_UP_QUESTIONS_SENTENCE =
  "Your Yes is recorded. A couple of questions are still outstanding.";

export function answeredSentence(standingAnswer: "yes" | "no", reason: string | null): string {
  if (standingAnswer === "yes") return "You're attending.";
  return reason ? `You said: ${reason}.` : "You're not attending.";
}

export const NO_OUTSTANDING_EVENTS = "No outstanding events";
export const PUBLIC_CALENDAR_LINK = "See the public calendar";

// ---------------------------------------------------------------------------
// Further out — Q-20's 21-day horizon
// ---------------------------------------------------------------------------

export const FURTHER_OUT_HEADING = "Further ahead";
export const FURTHER_OUT_SUMMARY = "See what else is coming up";
export const FURTHER_OUT_HELP =
  "Approved events more than three weeks away. Nothing is hidden — open this to see and answer them too.";

// ---------------------------------------------------------------------------
// Row and panel controls
// ---------------------------------------------------------------------------

export const ANSWER_YES = "Yes";
export const ANSWER_NO = "No";
export const CHANGE_TO_YES = "Change to Yes";
export const CHANGE_TO_NO = "Change to No";
export const ANSWER_QUESTIONS = "Answer questions";
export const ADD_REASON = "Add reason";
export const EDIT_REASON = "Edit reason";
/**
 * The standing Yes's own low-emphasis path to changing to No — the
 * wireframe's words, quoted directly: "visually secondary and lightly
 * framed." A single tap, same as every other No — REQ-no-reason-given
 * governs a player's own click here exactly as it does the row.
 */
export const PLANS_CHANGED = "Plans changed? You can change your answer.";

export const STANDING_YES = "Attending";
export const STANDING_NO = "Not attending";
export const NO_REASON_GIVEN = "No reason given";
export const OUTSTANDING_QUESTIONS = "Additional questions outstanding";

/**
 * Row status chips — the approved row carries a status chip
 * (`W2.html:956`: `Next`, `Awaiting answer`, `No reason given`, `Attending`,
 * `Not attending`), not only the event's own type. The type chip stays
 * alongside it: dropping which kind of event this is would lose real
 * information the mockup's single-type demo never had to disambiguate.
 */
export const NEXT_CHIP = "Next";
export const AWAITING_ANSWER_CHIP = "Awaiting answer";

export const REASON_LABEL = "Reason";
export const REASON_PLACEHOLDER = "Academic conflict";
export const REASON_PROMPT =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const SAVE_REASON = "Give a reason and continue";

export const QUESTIONS_HEADING = "A couple of questions for this event";
export const SAVE_QUESTIONS = "Save answers";

export const CLOSE_DETAIL = "Done";
