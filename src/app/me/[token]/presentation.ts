/**
 * Every word the player's durable page says. LAN-172, W2-05 and W2-06.
 */

import { TYPE_LABELS } from "@/app/operate/events/presentation";

export const BANNER = "LANCERS OPERATIONS";
export const PAGE_HEADING = "Your page";
export const PRIVACY_NOTE =
  "This secure page shows only your own events and answers. Nobody else's response is ever shown here.";

export function eventTypeLabel(eventType: string): string {
  return TYPE_LABELS[eventType] ?? eventType;
}

export const NEEDS_ANSWER_HEADING = "Needs your answer";
export const ANSWERED_HEADING = "Your answers — still to come";

export const NO_OUTSTANDING_EVENTS = "No outstanding events";
export const SEE_ANSWERED = "Your answered events are below.";
export const PUBLIC_CALENDAR_LINK = "See the public calendar";

export const ANSWER_YES = "Yes, I'm attending";
export const ANSWER_NO = "No, I'm not attending";
export const CHANGE_TO_YES = "Change to Yes";
export const CHANGE_TO_NO = "Change to No";
export const CHANGE = "Change";
/**
 * The standing Yes's own low-emphasis path to changing to No — the
 * wireframe's words, quoted directly: "visually secondary and lightly
 * framed."
 */
export const PLANS_CHANGED = "Plans changed? You can change your answer.";

export const STANDING_YES = "Attending";
export const STANDING_NO = "Not attending";
export const NO_REASON_GIVEN = "No reason given";
export const OUTSTANDING_QUESTIONS = "Additional questions outstanding";

export const REASON_LABEL = "Reason";
export const REASON_PLACEHOLDER = "Academic conflict";
export const REASON_PROMPT =
  "The club plans numbers, transport and coaching from these responses. Tell the club why if you can.";
export const SAVE_REASON = "Give a reason and continue";

export const QUESTIONS_HEADING = "A couple of questions for this event";
export const SAVE_QUESTIONS = "Save answers";

export const CLOSE_DETAIL = "Done";
