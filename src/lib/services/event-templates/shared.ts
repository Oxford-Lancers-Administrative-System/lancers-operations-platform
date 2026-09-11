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

/** One template, as stored. Every value is optional — the template may not say. */
export interface EventTemplate {
  /** LAN-265. The identity, which survives a rename. */
  id: string;
  /** The club's own word for this kind of event, and the only label ever shown. */
  name: string;
  /** LAN-276 correction round 1. A key into `TEMPLATE_COLOUR_PALETTE`. */
  colourKey: string;
  /** The behavioural class underneath. Never shown to an operator. */
  eventType: string;
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  defaultDurationMinutes: number | null;
  defaultDescription: string | null;
  defaultRequiredEquipment: string | null;
  /** Tri-state: `null` is "the template does not say". */
  defaultIsMandatory: boolean | null;
  /** D47. The default audience, as groups. Never people. */
  audienceGroups: AudienceGroupKey[];
  /** D42. Arrive with every event of this type, and are removable per event. */
  questions: EventQuestion[];
}

/**
 * The concrete values a new event of this type is created with.
 *
 * The single definition of "what the template gave it", used by
 * `createEventDraft` to build a draft and by the change plan to decide whether a
 * field was touched. Two copies of this would eventually disagree, and the
 * disagreement would look exactly like the destruction D41's refinement exists
 * to prevent.
 *
 * A `null` on the template is not passed through as a null: `delivery_mode` and
 * `is_mandatory` are `not null` on the event, so "the template does not say"
 * resolves to what an event with nobody's opinion on it would have been — in
 * person, and attendance not expected.
 */
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

/**
 * One stored row in the camel-cased shape `templateDefaults` reads.
 *
 * A named function rather than a spread at each call site, because both readers
 * of `event_templates` resolve their defaults through `templateDefaults` and a
 * second hand-written mapping is a second chance to drop a column.
 */
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

/** One template, with its questions and its default audience. */
export async function readEventTemplateIn(tx: Tx, templateId: string): Promise<EventTemplate> {
  // Checked before the parameter reaches PostgreSQL. `template_id` is a `uuid`,
  // and a hand-typed route segment that is not one raises an invalid-input error
  // rather than returning no rows — which would surface as "the database could
  // not complete this change" instead of the sentence below.
  if (!isUuid(templateId)) {
    throw new NotFound(TEMPLATE_NOT_FOUND_MESSAGE, { rule: TEMPLATE_TYPE_RULE });
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
      // A template question is not itself "from a template" — it *is* the
      // template. The flag exists on the event copy, and is set there.
      fromTemplate: false,
    })),
  };
}

/**
 * The groups in the order the builder shows them, so every surface agrees.
 *
 * Also the filter that keeps a stored group honest: `recruits` is refused on
 * anything but Recruitment by the database, and a group the vocabulary no longer
 * offers for a type is simply not shown rather than printed as a raw value.
 */
export function orderedGroups(eventType: string, stored: readonly string[]): AudienceGroupKey[] {
  return groupsForEventType(eventType)
    .filter((group) => stored.includes(group.key))
    .map((group) => group.key);
}

/**
 * Whether a route segment can be a `uuid` at all.
 *
 * The pattern is `event-input.ts`'s, not a second copy: the only job here is to
 * keep a hand-typed URL from reaching a `uuid` parameter, where PostgreSQL would
 * raise an invalid-input error that surfaces as "the database could not complete
 * this change" rather than as "that template no longer exists".
 */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export const requireActor = actorRequirement(
  "A template change has to name the operator who made it.",
);
