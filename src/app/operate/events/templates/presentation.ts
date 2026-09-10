import { describeQuestionCount } from "@/lib/services/event-questions-input";
import { describeDuration, TEMPLATE_DURATION_OPTIONS } from "@/lib/services/event-template-input";
import { DELIVERY_MODE_LABELS, labelFor } from "../presentation";

/**
 * How an event-type template reads on screen — W8-01 through W8-04.
 *
 * Presentation only, and pure. It is a separate module for the same reason the
 * events' own is: the list and the editor both print "what a Chalk starts as",
 * and a phrase that differs between them is a defect an operator finds before a
 * test does.
 */

export { describeDuration, describeQuestionCount, labelFor, TEMPLATE_DURATION_OPTIONS };

export const TEMPLATES_HEADLINE = "Event templates";

/** What the list says under its heading. What it is, not why it is. */
export const TEMPLATES_DETAIL = "What each kind of event starts as.";

/**
 * The one sentence on this surface that states a rule, and it earns its place.
 *
 * It used to say the opposite — "there are seven because there are seven kinds
 * of event; templates cannot be added or removed" — which W8 asked for because
 * the place an operator looks for **Add a type** is the place to say there is no
 * such act. LAN-265 makes it an act, and the sentence that earns its place now
 * is the other half of the same courtesy: a template the club has used cannot be
 * deleted, so the place somebody looks for **Delete** and does not find it is
 * where to say why.
 */
export const TEMPLATES_DELETE_RULE =
  "A template can be deleted while no event has been created from it. Renaming one is always safe: the new name reaches every event, past and future.";

/** The control that starts a new one — W8-01, reopened by LAN-265. */
export const NEW_TEMPLATE_ACTION = "New template";

export const NEW_TEMPLATE_HEADLINE = "New template";

/** The Name field's own section, and the consequence stated beside it. */
export const TEMPLATE_NAME_HEADLINE = "What it is called";

/**
 * Said on the editor rather than left to be discovered.
 *
 * Brian, 2026-09-09, on renaming: "Renames are retroactive: rename 'Chalk' to
 * 'Film Review' and every past chalk event reads 'Film Review', the same way a
 * venue rename would." That is the behaviour operators expect and it is still
 * the kind of thing somebody should be told before they type, not after.
 */
export const TEMPLATE_NAME_HELP =
  "Every event of this kind reads this name, including ones already in the past.";

/** The primary control on the new-template form. It creates; it does not save. */
export const TEMPLATE_CREATE_ACTION = "Create template";

export const TEMPLATE_DELETE_ACTION = "Delete template";

export const TEMPLATE_DELETE_TITLE = "Delete this template?";

export function templateDeleteQuestion(name: string): string {
  return `No event has been created from ${name}, so deleting it changes nothing else. Its messaging schedule goes with it.`;
}

export function templateDeleted(name: string): string {
  return `${name} deleted.`;
}

/** The columns of W8-01, so the list and the phone cards name them the same. */
export const TEMPLATE_COLUMN_LABELS = Object.freeze({
  type: "Template",
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

/** The same sentence, for a template that does not exist yet. */
export const NEW_TEMPLATE_DETAIL =
  "What a new event of this kind starts as. Leave anything undecided.";

/**
 * LAN-276 correction round 1. Brian, 2026-09-10: "In the template, swatch
 * color should be something that gets chosen, so it gets added as part of
 * the template." The heading treats it as exactly that — a fact the template
 * carries, alongside its name — rather than a setting about the calendar.
 */
export const TEMPLATE_COLOUR_HEADLINE = "Colour";

export const TEMPLATE_COLOUR_HELP =
  "Shown on the calendar and every event list, so two templates never have to look alike.";

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

export const TEMPLATE_QUESTIONS_HEADLINE = "Questions every event of this kind asks";

export const TEMPLATE_QUESTIONS_DETAIL =
  "They arrive on every new one. Any of them can be removed on a single event.";

export const TEMPLATE_SAVE_ACTION = "Save…";

export const TEMPLATE_DISCARD_ACTION = "Discard";

/** The default-length field, which is a duration and never a start time. */
export const TEMPLATE_DURATION_LABEL = "Default length";

export const TEMPLATE_DURATION_HELP = "Entering a start on an event fills the end in from this.";

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

/**
 * W8-04's first edge: a change that reaches no draft at all says so.
 *
 * It says it about the change's reach, which is what the condition behind it
 * measures, and never about whether drafts exist. The two are different facts:
 * drafts can be waiting and still take nothing, because a draft that edited the
 * changed field by hand holds its own (D41). Stating existence here put a false
 * sentence directly above "3 drafts will not" — the very case W8 was written
 * for, a template description corrected after every draft's was hand-edited.
 */
export function changeTouchesNothing(eventTypeLabel: string): string {
  return `No draft takes this change. It applies to ${eventTypeLabel.toLowerCase()} events created from now on.`;
}

/**
 * What one draft in the "will take this change" panel actually takes.
 *
 * Inheritance is per field, so a partly-edited draft is named in **both**
 * panels: the fields nobody touched move, the ones edited by hand hold. With
 * only a name under each heading that reads as two different drafts, and for
 * the draft named twice it says nothing about what will happen to it — on the
 * one screen whose whole job is showing that editing a template is safe.
 *
 * The holding panel already gives one sentence per held field. This is its
 * mirror, and a draft only reaches the taking list when at least one of the
 * three is true, so the list is never empty in practice.
 */
export function draftTakes(draft: {
  fields: readonly string[];
  audience: boolean;
  questions: boolean;
}): string[] {
  const takes = draft.fields.map((label) => `Its ${label.toLowerCase()} takes the new value.`);
  if (draft.audience) takes.push("Its audience takes the new default.");
  if (draft.questions) takes.push("Its questions take the change.");
  return takes;
}

/** The button that says what it will do. */
export function confirmSaveAction(count: number): string {
  return count === 0
    ? "Save template"
    : `Save and update ${count} ${count === 1 ? "draft" : "drafts"}`;
}

export const TEMPLATE_CONFIRM_BACK = "Back";
