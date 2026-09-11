/**
 * The template row, its shape and the helpers `read.ts`, `change-plan.ts` and
 * `write.ts` all need. LAN-300 split of `event-templates.ts`; see `index.ts`
 * for the module's own header.
 */
import { NotFound, type Tx } from "@/lib/db";
import { actorRequirement } from "../actor";
import { UUID_PATTERN, type EventDeliveryMode } from "../event-input";
import { groupsForEventType, type AudienceGroupKey } from "../audience-selection";
import type { EventQuestion } from "../event-questions";

export interface EventTemplate {
  id: string; // LAN-265: the identity, which survives a rename
  name: string; // the club's own word for this kind of event, the only label ever shown
  colourKey: string; // LAN-276 R1: a key into TEMPLATE_COLOUR_PALETTE
  eventType: string; // behavioural class underneath, never shown to an operator
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDurationMinutes: number | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  defaultIsMandatory: boolean | null; // tri-state: null is "the template does not say"
  audienceGroups: AudienceGroupKey[]; // D47: default audience, as groups, never people
  questions: EventQuestion[]; // D42: arrive with every event of this type, removable per event
}

// The single definition of "what the template gave it" — used by createEventDraft and the change
// plan; two copies would disagree. A null on the template resolves to the event's own not-null
// default (delivery_mode/is_mandatory): in person, attendance not expected.
export interface TemplateDefaults {
  deliveryMode: EventDeliveryMode;
  venue: string | null;
  description: string | null;
  requiredEquipment: string | null;
  isMandatory: boolean;
  durationMinutes: number | null;
}

export function templateDefaults(template: {
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  defaultIsMandatory: boolean | null;
  defaultDurationMinutes: number | null;
}): TemplateDefaults {
  return {
    deliveryMode: template.defaultDeliveryMode ?? "in_person",
    venue: template.defaultVenue,
    description: template.defaultDescription,
    requiredEquipment: template.defaultRequiredEquipment,
    isMandatory: template.defaultIsMandatory ?? false,
    durationMinutes: template.defaultDurationMinutes,
  };
}

export const TEMPLATE_NOT_FOUND_MESSAGE =
  "That template no longer exists. It may have been deleted while this page was open.";

export const TEMPLATE_TYPE_RULE = "event_template_unknown";

export interface TemplateRow {
  id: string;
  name: string;
  colour_key: string;
  event_type: string;
  default_venue: string | null;
  default_delivery_mode: EventDeliveryMode | null;
  default_duration_minutes: number | null;
  default_description: string | null;
  default_required_equipment: string | null;
  default_is_mandatory: boolean | null;
}

// A named function, not a spread at each call site: both readers of event_templates resolve
// defaults through templateDefaults, so a second hand-written mapping can't drop a column.
export function toTemplateShape(row: TemplateRow) {
  return {
    defaultVenue: row.default_venue,
    defaultDeliveryMode: row.default_delivery_mode,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultDescription: row.default_description,
    defaultRequiredEquipment: row.default_required_equipment,
    defaultIsMandatory: row.default_is_mandatory,
  };
}

export const TEMPLATE_COLUMNS = `id, name, colour_key, event_type::text as event_type, default_venue,
        default_delivery_mode::text as default_delivery_mode, default_duration_minutes,
        default_description, default_required_equipment, default_is_mandatory`;

export async function readEventTemplateIn(tx: Tx, templateId: string): Promise<EventTemplate> {
  if (!isUuid(templateId)) {
    throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE }); // checked before a malformed uuid reaches PostgreSQL
  }

  const result = await tx.query<TemplateRow>(
    `select ${TEMPLATE_COLUMNS} from public.event_templates where id = $1::uuid`,
    [templateId],
  );
  const row = result.rows[0];
  if (!row) throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });

  const groups = await tx.query<{ audience_group: AudienceGroupKey }>(
    `select audience_group::text as audience_group
       from public.event_template_audience_groups
      where template_id = $1::uuid`,
    [templateId],
  );

  const questions = await tx.query<{
    id: string;
    prompt: string;
    answer_type: EventQuestion["answerType"];
    choices: string[] | null;
    is_required: boolean;
    sort_order: number;
  }>(
    `select id, prompt, answer_type::text as answer_type, choices, is_required, sort_order
       from public.event_template_questions
      where template_id = $1::uuid
      order by sort_order, prompt`,
    [templateId],
  );

  return {
    id: row.id,
    name: row.name,
    colourKey: row.colour_key,
    eventType: row.event_type,
    defaultVenue: row.default_venue,
    defaultDeliveryMode: row.default_delivery_mode,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultDescription: row.default_description,
    defaultRequiredEquipment: row.default_required_equipment,
    defaultIsMandatory: row.default_is_mandatory,
    audienceGroups: orderedGroups(
      row.event_type,
      groups.rows.map((group) => group.audience_group),
    ),
    questions: questions.rows.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      answerType: question.answer_type,
      choices: question.choices,
      isRequired: question.is_required,
      sortOrder: question.sort_order,
      fromTemplate: false, // a template question is not itself "from a template" — it *is* the template
    })),
  };
}

// The groups in the order the builder shows them; also filters a stored group the vocabulary no
// longer offers for this type, rather than printing it as a raw value.
export function orderedGroups(eventType: string, stored: readonly string[]): AudienceGroupKey[] {
  return groupsForEventType(eventType)
    .filter((group) => stored.includes(group.key))
    .map((group) => group.key);
}

// event-input.ts's own pattern, not a second copy — keeps a hand-typed URL from raising a raw uuid-cast error.
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const requireActor = actorRequirement(
  "A template change has to name the operator who made it.",
);
