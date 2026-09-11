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

export interface EventTemplateSummary {
  id: string;
  name: string;
  colourKey: string; // LAN-276 R1: a key into TEMPLATE_COLOUR_PALETTE
  eventType: string;
  audienceGroups: AudienceGroupKey[];
  defaultVenue: string | null;
  defaultDeliveryMode: EventDeliveryMode | null;
  questionCount: number;
  eventCount: number; // how many events ever created from this template — decides whether Delete is offered (see relocations.md)
}

// By name, not public.event_type's declared order (LAN-265: several templates may share a class). lower() avoids case splitting neighbourhoods.
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

export interface EventTemplateOption {
  id: string;
  name: string;
}

// Deliberately not listEventTemplates (which also counts questions/events and resolves audience
// groups) — the two list filters, including the public calendar, need only a name and an id.
export async function listEventTemplateOptions(): Promise<EventTemplateOption[]> {
  return withTransaction(async (tx) => {
    const result = await tx.query<EventTemplateOption>(
      "select id, name from public.event_templates order by lower(name)",
    );
    return result.rows;
  });
}

// The number Delete is offered or withheld on — its own read, not a field on EventTemplate.
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

export async function readEventTemplate(templateId: string): Promise<EventTemplate> {
  return withTransaction(async (tx) => readEventTemplateIn(tx, templateId));
}

export interface NewEventInheritance {
  eventType: string; // the class the event takes from its template, never chosen itself
  defaults: TemplateDefaults;
  questions: EventQuestionInput[];
  audienceGroups: AudienceGroupKey[];
}

// Read inside the caller's transaction — createEventDraft writes the event, questions and audience
// together, and a template edited between reads would assemble an event from two different templates.
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

// All templates at once, not one — the form's Template control changes which template applies
// while typing, and D41's touched-field rule has to run in the browser without a round trip per
// change. Keyed by template id; each entry carries its own name (LAN-265: the id prints nothing).
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

// D47's whole point: resolved to an explicit list of people at creation time — a group selects people, not a live query.
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
