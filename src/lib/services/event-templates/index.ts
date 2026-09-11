/**
 * Event-type templates — what each kind of event starts as. LAN-154, W8, LAN-265.
 * Decision history: missions/intake/M-EVENTS-CALENDAR-TARGET-STATE/decision-history.md.
 */

export {
  DEFAULT_TEMPLATE_CLASS,
  validateEventTemplate,
  type EventTemplateInput,
  type EventTypeFormDefaults,
} from "../event-template-input";

export type { EventTemplate } from "./shared";

export {
  countEventsFromTemplate,
  listEventTemplateOptions,
  listEventTemplates,
  readEventFormDefaults,
  readEventTemplate,
  readTemplateInheritanceIn,
  templateAudienceKeys,
} from "./read";
export type { EventTemplateOption, EventTemplateSummary, NewEventInheritance } from "./read";

export { planEventTemplateChange, saveEventTemplate } from "./change-plan";
export type { TemplateChangePlan } from "./change-plan";

export { createEventTemplate, DEFAULT_CHASE_THRESHOLD_DAYS, deleteEventTemplate } from "./write";
