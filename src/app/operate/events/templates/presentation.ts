import { describeQuestionCount } from "@/lib/services/event-questions-input";
import { describeDuration, TEMPLATE_DURATION_OPTIONS } from "@/lib/services/event-template-input";
import { DELIVERY_MODE_LABELS, labelFor } from "../presentation";

// How an event-type template reads on screen — W8-01..W8-04. Presentation only, pure.

export { describeDuration, describeQuestionCount, TEMPLATE_DURATION_OPTIONS };

export const TEMPLATES_HEADLINE = "Event templates";

/** LAN-265 reversed the old "cannot be added or removed" text — see relocations.md. */
export const TEMPLATES_DELETE_RULE =
  "A template can be deleted while no event has been created from it. Renaming one is always safe: the new name reaches every event, past and future.";

export const NEW_TEMPLATE_ACTION = "New template";

export const NEW_TEMPLATE_HEADLINE = "New template";

export const TEMPLATE_NAME_HEADLINE = "What it is called";

/** Brian, 2026-09-09: renames are retroactive, stated before typing, not discovered after. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export const TEMPLATE_NAME_HELP =
  "Every event of this kind reads this name, including ones already in the past.";

export const TEMPLATE_CREATE_ACTION = "Create template";

export const TEMPLATE_DELETE_ACTION = "Delete template";

export const TEMPLATE_DELETE_TITLE = "Delete this template?";

export function templateDeleteQuestion(name: string): string {
  return `No event has been created from ${name}, so deleting it changes nothing else. Its messaging schedule goes with it.`;
}

export const TEMPLATE_COLUMN_LABELS = Object.freeze({
  type: "Template",
  audience: "Invites by default",
  where: "Where",
  questions: "Questions",
});

export function describeTemplateAudience(groupLabels: readonly string[]): string {
  return groupLabels.length === 0 ? "Not set" : groupLabels.join(", ");
}

export function describeTemplateWhere(deliveryMode: string | null, venue: string | null): string {
  if (deliveryMode === null && venue === null) return "Not set";
  const mode = deliveryMode === null ? null : labelFor(DELIVERY_MODE_LABELS, deliveryMode);
  return [mode, venue].filter(Boolean).join(" · ");
}

/** LAN-276 round 1, Brian 2026-09-10: colour is a fact the template carries, not a calendar setting. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md. */
export const TEMPLATE_COLOUR_HEADLINE = "Colour";

export const TEMPLATE_COLOUR_HELP =
  "Shown on the calendar and every event list, so two templates never have to look alike.";

export const TEMPLATE_AUDIENCE_HEADLINE = "Who it invites";

export const TEMPLATE_EVENT_HEADLINE = "The event itself";

export const TEMPLATE_QUESTIONS_HEADLINE = "Questions every event of this kind asks";

export const TEMPLATE_SAVE_ACTION = "Save…";

export const TEMPLATE_DISCARD_ACTION = "Discard";

export const TEMPLATE_DURATION_LABEL = "Default length";

export const TEMPLATE_CONFIRM_TITLE = "Save this template?";

const TEMPLATE_TAKING_HEADLINE = "will take this change";

const TEMPLATE_HOLDING_HEADLINE = "will not";

export const TEMPLATE_UNTOUCHED_HEADLINE = "Nothing else changes";

export function draftsTaking(count: number): string {
  return `${count} ${count === 1 ? "draft" : "drafts"} ${TEMPLATE_TAKING_HEADLINE}`;
}

export function draftsHolding(count: number): string {
  return `${count} ${count === 1 ? "draft" : "drafts"} ${TEMPLATE_HOLDING_HEADLINE}`;
}

// Two sentences: told vs. history. `null` where none. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
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

// W8-04's edge: about the change's reach, never about whether drafts exist
// (a hand-edited draft holds its own, D41). Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
export function changeTouchesNothing(eventTypeLabel: string): string {
  return `No draft takes this change. It applies to ${eventTypeLabel.toLowerCase()} events created from now on.`;
}

// Per field: a partly-edited draft is named in BOTH panels. Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
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

export function confirmSaveAction(count: number): string {
  return count === 0
    ? "Save template"
    : `Save and update ${count} ${count === 1 ? "draft" : "drafts"}`;
}

export const TEMPLATE_CONFIRM_BACK = "Back";
