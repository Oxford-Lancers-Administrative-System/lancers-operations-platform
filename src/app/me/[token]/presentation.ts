/**
 * Every word the player's durable page says. LAN-172, W2-05 and W2-06. Owner
 * correction round 2 (Q-22, Q-23) restored the approved four-section
 * structure — `New invitations`, `Still need your answer`, `Follow-up
 * needed`, `Your answers — still to come` — with the shared date/time
 * formatters already in `src/app/rsvp/[token]/presentation.ts`.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";
import { attendingSentence, otherOutstandingSentence } from "@/app/a/[token]/presentation";
import { formatDeadline, formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";

export const PRIVACY_NOTE =
  "This secure page shows only your own events and answers. Nobody else's response is ever shown here.";

/** The kind of event, in the club's word for it. Only `/design-preview` still calls this (LAN-265) — live screens read `templateName` off the row instead. */
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

// The page heading — a count of outstanding work, not a made-up title (W2.html:956)
/** Owner correction round 5 (OWNER-LAN172-14): a second, honest heading for when `Follow-up needed` is non-empty, instead of reusing the empty-queue one. */
export function pageHeading(outstandingCount: number, hasFollowUpNeeded: boolean): string {
  if (outstandingCount > 0) {
    return outstandingCount === 1
      ? "You have 1 invitation to answer"
      : `You have ${outstandingCount} invitations to answer`;
  }
  return hasFollowUpNeeded ? FOLLOW_UP_ONLY_HEADING : NO_OUTSTANDING_EVENTS;
}

export const FOLLOW_UP_ONLY_HEADING = "You have follow-up work to finish";

export const HEADING_HELP =
  "Answer the next one now. Below that, everything you have already answered and that is still to come.";
export const FOLLOW_UP_ONLY_HELP =
  "Nothing new needs an answer, but a standing answer below still needs a reason or a question finished.";
export const EMPTY_HELP =
  "You have answered every invitation waiting for you. Nothing else needs an answer right now.";

// The four approved sections, in order — W2-answer-an-invitation.md:201-210

export const NEW_INVITATIONS_HEADING = "New invitations";
export const STILL_NEED_ANSWER_HEADING = "Still need your answer";
export const FOLLOW_UP_HEADING = "Follow-up needed";
export const ANSWERED_HEADING = "Your answers — still to come";
export const ANSWERED_HELP =
  "Everything you have already answered that has not happened yet. Change any of them.";

/** Not "you opened this invitation" — Q-11 keeps the GET side-effect-free, so that fact is never tracked. */
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

// The club's main WhatsApp group — LAN-327. Rendered only when the link is
// configured; the recruits' sign-up form has had the equivalent since LAN-202,
// and a recruit flipped to joined moved from a flow that offered a group to
// one that never mentioned it.

export const WHATSAPP_GROUP_HEADING = "The club's WhatsApp group";
export const JOIN_WHATSAPP_GROUP = "Join the WhatsApp group";

// Further out — Q-20's 21-day horizon

export const FURTHER_OUT_HEADING = "Further ahead";
export const FURTHER_OUT_SUMMARY = "See what else is coming up";
export const FURTHER_OUT_HELP =
  "Approved events more than three weeks away. Nothing is hidden — open this to see and answer them too.";

// Row and panel controls

export const ANSWER_YES = "Yes";
export const ANSWER_NO = "No";
export const CHANGE_TO_YES = "Change to Yes";
/** Owner correction round 3 (OWNER-LAN172-11). Brian: "Change to 'no' should just say 'change answer.'" */
export const CHANGE_TO_NO = "Change answer";
export const ANSWER_QUESTIONS = "Answer questions";
export const ADD_REASON = "Add reason";
export const EDIT_REASON = "Edit reason";
/** The wireframe's words: "visually secondary and lightly framed." */
export const PLANS_CHANGED = "Plans changed? You can change your answer.";

export const STANDING_YES = "Attending";
export const STANDING_NO = "Not attending";
export const NO_REASON_GIVEN = "No reason given";
export const OUTSTANDING_QUESTIONS = "Additional questions outstanding";

/** Row status chips (`W2.html:956`) — alongside the type chip, not replacing it. */
export const NEXT_CHIP = "Next";
export const AWAITING_ANSWER_CHIP = "Awaiting answer";

export const REASON_LABEL = "Reason";
/** Owner correction round 3 (OWNER-LAN172-09). Brian: the old "Academic conflict" placeholder "reads as a real answer rather than an example." */
export const REASON_PLACEHOLDER = "e.g. clashes with a family commitment";
export const REASON_PROMPT =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
/** Owner correction round 3 (OWNER-LAN172-09). Brian: "It should have an answer and should go to 'Save.'" */
export const SAVE_REASON = "Save";

export const QUESTIONS_HEADING = "A couple of questions for this event";
export const SAVE_QUESTIONS = "Save answers";
/** Owner correction round 3 (OWNER-LAN172-08). Brian: "it should close it up and say 'Answer recorded'... right now, it just goes blank." */
export const QUESTIONS_RECORDED = "Answer recorded";

export const CLOSE_DETAIL = "Done";
