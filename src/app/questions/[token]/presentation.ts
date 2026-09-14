/**
 * Every word the nudge's own page says — LAN-343.
 *
 * The nudge is not a chase: the player has already said Yes, and what is left
 * is the event's own questions (`REQ-one-flag-per-threshold`'s sibling rule —
 * "a Yes with unanswered questions is answered"). So the copy here is the
 * copy the focused panel already used for exactly these fields, imported
 * rather than rewritten: one heading and one button for one form, wherever
 * the player reaches it from.
 */

export { QUESTIONS_HEADING, SAVE_QUESTIONS } from "@/app/events/[token]/presentation";

export { formatEventDate, formatEventTime } from "@/app/rsvp/[token]/presentation";

/** Shown once, after this visit's own save. */
export const SAVED_NOTICE = "Answers saved";

/** Nothing is outstanding — the player answered on another surface, or the operator removed the questions. */
export const NOTHING_OUTSTANDING_HEADING = "Nothing left to answer";
export const NOTHING_OUTSTANDING_NOTE = "The club has everything it needs for this event.";

export const BUSY_ERROR = "busy";
export const BUSY_MESSAGE = "That did not go through. Try again in a moment.";
