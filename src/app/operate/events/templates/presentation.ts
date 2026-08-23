import { describeQuestionCount } from "@/lib/services/event-questions-input";
import { describeDuration } from "@/lib/services/event-template-input";
import { DELIVERY_MODE_LABELS, labelFor, TYPE_LABELS } from "../presentation";

/**
 * How an event-type template reads on screen — W8-01 through W8-04.
 *
 * Presentation only, and pure. It is a separate module for the same reason the
 * events' own is: the list and the editor both print "what a Chalk starts as",
 * and a phrase that differs between them is a defect an operator finds before a
 * test does.
 */

export { describeDuration, describeQuestionCount, labelFor, TYPE_LABELS };

export const TEMPLATES_HEADLINE = "Event templates";

/** What the list says under its heading. What it is, not why it is. */
export const TEMPLATES_DETAIL = "What each kind of event starts as. Seven types, seven templates.";

/**
 * The one sentence on this surface that states a rule, and it earns its place.
 *
 * W8 asks for it explicitly: the place an operator would look for **Add a type**
 * is the place to say that there is no such act. Saying nothing would leave them
 * hunting for a control that does not exist, which is `docs/ux/standards.md`
 * rule 4's problem in its widest form.
 */
export const TEMPLATES_ARE_FIXED =
  "There are seven because there are seven kinds of event. Templates cannot be added or removed.";

/** The columns of W8-01, so the list and the phone cards name them the same. */
export const TEMPLATE_COLUMN_LABELS = Object.freeze({
  type: "Type",
  audience: "Invites by default",
  where: "Where",
  questions: "Questions",
});

/** What a template says it invites, in the club's words. */
export function describeTemplateAudience(groupLabels: readonly string[]): string {
  return groupLabels.length === 0 ? "Not set" : groupLabels.join(", ");
}

/** "In person · Iffley Road Astro" — the Where column. */
export function describeTemplateWhere(deliveryMode: string | null, venue: string | null): string {
  if (deliveryMode === null && venue === null) return "Not set";
  const mode = deliveryMode === null ? null : labelFor(DELIVERY_MODE_LABELS, deliveryMode);
  return [mode, venue].filter(Boolean).join(" · ");
}

/** The editor's heading and the sentence under it. */
export function templateEditorDetail(eventTypeLabel: string): string {
  return `What a new ${eventTypeLabel.toLowerCase()} starts as. Leave anything undecided.`;
}

export const TEMPLATE_AUDIENCE_HEADLINE = "Who it invites";

/**
 * The one thing about the default audience an operator cannot see for themselves.
 *
 * A template holds groups, and the people are worked out when an event is
 * created from it — so a template that says "all active players" today invites
 * whoever the active players are then. That is a fact about what this screen
 * stores, not a policy being explained.
 */
export const TEMPLATE_AUDIENCE_DETAIL = "Groups, never people.";

export const TEMPLATE_EVENT_HEADLINE = "The event itself";

export const TEMPLATE_QUESTIONS_HEADLINE = "Questions every event of this type asks";

export const TEMPLATE_QUESTIONS_DETAIL =
  "They arrive on every new one. Any of them can be removed on a single event.";

export const TEMPLATE_SAVE_ACTION = "Save…";

export const TEMPLATE_DISCARD_ACTION = "Discard";

/** The default-length field, which is a duration and never a start time. */
export const TEMPLATE_DURATION_LABEL = "Default length";

export const TEMPLATE_DURATION_HELP =
  "In minutes. Entering a start on an event fills the end in from this.";

// ---------------------------------------------------------------------------
// W8-03 — what the change will touch, before it touches it
// ---------------------------------------------------------------------------

export const TEMPLATE_CONFIRM_TITLE = "Save this template?";

export const TEMPLATE_TAKING_HEADLINE = "will take this change";

export const TEMPLATE_HOLDING_HEADLINE = "will not";

export const TEMPLATE_UNTOUCHED_HEADLINE = "Nothing else changes";

/** "3 drafts will take this change" — the count and the noun agreeing. */
export function draftsTaking(count: number): string {
  return `${count} ${count === 1 ? "draft" : "drafts"} ${TEMPLATE_TAKING_HEADLINE}`;
}

export function draftsHolding(count: number): string {
  return `${count} ${count === 1 ? "draft" : "drafts"} ${TEMPLATE_HOLDING_HEADLINE}`;
}

/**
 * What will not move, whatever the change is.
 *
 * Two sentences rather than one, because they are two different reasons: an
 * approved event keeps what it was approved with because people were told, and a
 * past event is history. `null` where there are none — a club with no approved
 * practices should not read "0 approved practices keep what they were approved
 * with".
 */
export function untouchedApproved(count: number, eventTypeLabel: string): string | null {
  if (count === 0) return null;
  const noun = `${eventTypeLabel.toLowerCase()}${count === 1 ? "" : "s"}`;
  return `${count} approved ${noun} keep what they were approved with.`;
}

export function untouchedPast(count: number, eventTypeLabel: string): string | null {
  if (count === 0) return null;
  const noun = `${eventTypeLabel.toLowerCase()}${count === 1 ? "" : "s"}`;
  return `${count} past ${noun} ${count === 1 ? "is" : "are"} untouched.`;
}

/** W8-04's first edge: a change that reaches no draft at all says so. */
export function changeTouchesNothing(eventTypeLabel: string): string {
  return `No drafts of this type are waiting. The change applies to ${eventTypeLabel.toLowerCase()} events created from now on.`;
}

/** The button that says what it will do. */
export function confirmSaveAction(count: number): string {
  return count === 0
    ? "Save template"
    : `Save and update ${count} ${count === 1 ? "draft" : "drafts"}`;
}

export const TEMPLATE_CONFIRM_BACK = "Back";

/** The outcome banner, after the save. */
export function templateSaved(count: number): string {
  if (count === 0) return "Template saved.";
  return `Template saved, and ${count} ${count === 1 ? "draft was" : "drafts were"} updated.`;
}
