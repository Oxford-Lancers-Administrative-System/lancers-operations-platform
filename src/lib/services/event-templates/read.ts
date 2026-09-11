import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import {
  groupSelectionKeys,
  type AudienceCandidate,
  type AudienceGroupKey,
} from "../audience-selection";
import {
  joinQuestionChoices,
  readTemplateQuestionsAsEventInputIn,
  type EventQuestionInput,
} from "../event-questions";
import type { EventTypeFormDefaults } from "../event-template-input";
import type { EventDeliveryMode } from "../event-input";
import {
  isUuid,
  orderedGroups,
  readEventTemplateIn,
  TEMPLATE_COLUMNS,
  templateDefaults,
  toTemplateShape,
  type EventTemplate,
  type TemplateDefaults,
  type TemplateRow,
} from "./shared";

/**
 * Reading templates — the list, one template, and what a new event of a
 * type inherits (W8-01, D47). LAN-300 split of `event-templates.ts`; see
 * `./index`.
 */

/** One row of the template list — W8-01, as LAN-265 reopened it. */
export interface EventTemplateSummary {
  id: string;
  name: string;
  /** LAN-276 correction round 1. A key into `TEMPLATE_COLOUR_PALETTE`. */
  colourKey: string;
  eventType: string;
  audienceGroups: AudienceGroupKey[];
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  questionCount: number;
  /**
   * How many events were ever created from this template.
   *
   * On the list so that **Delete** can be absent rather than present-and-
   * refusing on a template the club has used: a control that is always there and
   * usually says no teaches an operator to ignore it. The number is also the
   * honest answer to "may I get rid of this one", which is the question somebody
   * looking at a list of templates is actually asking.
   */
  eventCount: number;
}

/**
 * Every template, in the club's own alphabetical order.
 *
 * By name, and not by `public.event_type`'s declared order, since LAN-265: the
 * class is no longer the identity, several templates may share one, and an
 * operator scanning a list they wrote themselves is looking for a word. `lower()`
 * so "chalk" and "Chalk" cannot sort into two different neighbourhoods.
 */
export async function listEventTemplates(): Promise<EventTemplateSummary[]> {
  return withTransaction(async (tx) => {
    const templates = await tx.query<TemplateRow>(
      `select ${TEMPLATE_COLUMNS} from public.event_templates order by lower(name)`,
    );
    const groups = await tx.query<{ template_id: string; audience_group: AudienceGroupKey }>(
      `select template_id, audience_group::text as audience_group
         from public.event_template_audience_groups`,
    );
    const counts = await tx.query<{ template_id: string; count: string }>(
      `select template_id, count(*)::text as count
         from public.event_template_questions
        group by template_id`,
    );
    const events = await tx.query<{ template_id: string; count: string }>(
      `select template_id, count(*)::text as count from public.events group by template_id`,
    );

    return templates.rows.map((row) => ({
      id: row.id,
      name: row.name,
      colourKey: row.colour_key,
      eventType: row.event_type,
      audienceGroups: orderedGroups(
        row.event_type,
        groups.rows.filter((group) => group.template_id === row.id).map((g) => g.audience_group),
      ),
      defaultVenue: row.default_venue,
      defaultDeliveryMode: row.default_delivery_mode,
      questionCount: Number(
        counts.rows.find((count) => count.template_id === row.id)?.count ?? "0",
      ),
      eventCount: Number(events.rows.find((count) => count.template_id === row.id)?.count ?? "0"),
    }));
  });
}

/** Just enough of a template to offer it in a control — LAN-265. */
export interface EventTemplateOption {
  id: string;
  name: string;
}

/**
 * Every template as a pickable option, for the two list filters.
 *
 * Deliberately not `listEventTemplates`, which also counts questions and events
 * and resolves each template's audience groups: the operator's Type filter and
 * the public calendar's need a name and an id, and the public calendar in
 * particular is a page `REQ-public-calendar` requires to render without touching
 * anything it does not need.
 */
export async function listEventTemplateOptions(): Promise<EventTemplateOption[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<EventTemplateOption>(
      "select id, name from public.event_templates order by lower(name)",
    );
    return result.rows;
  });
}

/**
 * How many events were ever created from this template — LAN-265.
 *
 * The number **Delete** is offered or withheld on. Its own read rather than a
 * field on `EventTemplate`, because the editor is the one screen that needs it
 * and every other reader of a template would be paying for a count over
 * `public.events` it never looks at.
 */
export async function countEventsFromTemplate(templateId: string): Promise<number> {
  if (!isUuid(templateId)) return 0;
  return withTransaction(async (tx) => {
    const result = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where template_id = $1::uuid",
      [templateId],
    );
    return Number(result.rows[0].count);
  });
}

/** One template, with its questions and its default audience. */
export async function readEventTemplate(templateId: string): Promise<EventTemplate> {
  return withTransaction(async (tx) => readEventTemplateIn(tx, templateId));
}

/**
 * Everything a new draft of `eventType` inherits — the fields, the questions and
 * the default audience.
 *
 * Read inside the caller's transaction, because `createEventDraft` writes the
 * event, its questions and its audience together and a template edited between
 * the reads would produce an event assembled from two different templates.
 */
export interface NewEventInheritance {
  /** The class the event takes from its template, which it never chooses itself. */
  eventType: string;
  defaults: TemplateDefaults;
  questions: EventQuestionInput[];
  audienceGroups: AudienceGroupKey[];
}

export async function readTemplateInheritanceIn(
  tx: Tx,
  templateId: string,
): Promise<NewEventInheritance> {
  const template = await readEventTemplateIn(tx, templateId);
  return {
    eventType: template.eventType,
    defaults: templateDefaults(template),
    questions: await readTemplateQuestionsAsEventInputIn(tx, templateId),
    audienceGroups: template.audienceGroups,
  };
}

/**
 * Every template in the shape the create-and-edit form fills itself from.
 *
 * All of them at once, and not one, because the form's Template control changes
 * which template applies while the operator is typing. D41's rule then has to run
 * in the browser — a field nobody has touched takes the new template's value, a
 * field somebody wrote keeps what they wrote — and it cannot do that with a round
 * trip for every change of a select.
 *
 * Keyed by template id, and each entry carries its own `name`, because after
 * LAN-265 the key is not something a screen can print and the name is the only
 * thing it ever prints.
 */
export async function readEventFormDefaults(): Promise<Record<string, EventTypeFormDefaults>> {
  return withTransaction(async (tx) => {
    const templates = await tx.query<TemplateRow>(
      `select ${TEMPLATE_COLUMNS} from public.event_templates order by lower(name)`,
    );
    const questions = await tx.query<{
      template_id: string;
      prompt: string;
      answer_type: string;
      choices: string[] | null;
      is_required: boolean;
    }>(
      `select template_id, prompt, answer_type::text as answer_type,
              choices, is_required
         from public.event_template_questions
        order by template_id, sort_order, prompt`,
    );

    const defaults: Record<string, EventTypeFormDefaults> = {};
    for (const row of templates.rows) {
      const resolved = templateDefaults(toTemplateShape(row));
      defaults[row.id] = {
        id: row.id,
        name: row.name,
        eventType: row.event_type,
        deliveryMode: resolved.deliveryMode,
        venue: resolved.venue ?? "",
        description: resolved.description ?? "",
        requiredEquipment: resolved.requiredEquipment ?? "",
        attendance: resolved.isMandatory ? "mandatory" : "optional",
        durationMinutes: resolved.durationMinutes,
        questions: questions.rows
          .filter((question) => question.template_id === row.id)
          .map((question) => ({
            prompt: question.prompt,
            answerType: question.answer_type,
            required: question.is_required ? "required" : "optional",
            choices: joinQuestionChoices(question.choices),
            fromTemplate: "true",
          })),
      };
    }
    return defaults;
  });
}

/**
 * The selection keys a template's default audience resolves to for one event.
 *
 * D47's whole point: it arrives with the event already set, so the approver
 * checks rather than builds. It is resolved to an explicit list of people at the
 * moment the event is created, because a group is a way of selecting people and
 * not a live query that changes underneath an event.
 */
export function templateAudienceKeys(
  candidates: readonly AudienceCandidate[],
  audienceGroups: readonly AudienceGroupKey[],
): string[] {
  const keys = new Set<string>();
  for (const group of audienceGroups) {
    for (const key of groupSelectionKeys(candidates, group)) keys.add(key);
  }
  return [...keys];
}
