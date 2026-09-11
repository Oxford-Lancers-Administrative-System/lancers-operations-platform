import "server-only";

import { ConstraintViolated, withTransaction, type Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import { DEFAULT_TEMPLATE_CLASS, type EventTemplateInput } from "../event-template-input";
import { createMessagingScheduleIn, DEFAULT_MESSAGING_SCHEDULE } from "../messaging-schedule";
import type { EventQuestionInput } from "../event-questions";
import { orderedGroups, readEventTemplateIn, requireActor, type EventTemplate } from "./shared";

/**
 * Creating and deleting a template — LAN-265. LAN-300 split of
 * `event-templates.ts`; see `./index`.
 */

const TEMPLATE_CREATED_ACTION = "event_template.created";
const TEMPLATE_DELETED_ACTION = "event_template.deleted";

const TEMPLATE_IN_USE_RULE = "event_template_in_use";

// Creates a template plus its messaging cadence and chase settings, all in one transaction (Brian,
// 2026-09-09) — a template without those rows would refuse at approval, naming a table no operator
// created it knows. Arrives empty of defaults; nothing is copied from another template. See relocations.md.
export async function createEventTemplate(
  actorPersonId: string,
  input: EventTemplateInput,
  questions: readonly EventQuestionInput[] = [],
): Promise<EventTemplate> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const eventType = DEFAULT_TEMPLATE_CLASS;

    const inserted = await tx.query<{ id: string }>(
      `insert into public.event_templates
           (name, colour_key, event_type, default_venue, default_delivery_mode,
            default_duration_minutes, default_description, default_required_equipment,
            default_is_mandatory)
         values ($1, $2, $3::public.event_type, $4, $5::public.event_delivery_mode, $6, $7, $8, $9)
         returning id`,
      [
        input.name,
        input.colourKey,
        eventType,
        input.defaultVenue,
        input.defaultDeliveryMode,
        input.defaultDurationMinutes,
        input.defaultDescription,
        input.defaultRequiredEquipment,
        input.defaultIsMandatory,
      ],
    );

    const templateId = inserted.rows[0].id;

    const audienceGroups = orderedGroups(eventType, input.audienceGroups);
    if (audienceGroups.length !== input.audienceGroups.length) {
      throw new ConstraintViolated("One of those groups is not offered for this kind of event.", {
        rule: "event_template_audience_group_not_offered",
      });
    }
    for (const group of audienceGroups) {
      await tx.query(
        `insert into public.event_template_audience_groups (template_id, event_type, audience_group)
         values ($1::uuid, $2::public.event_type, $3::public.audience_group)`,
        [templateId, eventType, group],
      );
    }

    for (const [index, question] of questions.entries()) {
      await tx.query(
        `insert into public.event_template_questions
           (template_id, event_type, prompt, answer_type, choices, is_required, sort_order)
         values ($1::uuid, $2::public.event_type, $3, $4::public.question_answer_type, $5::text[],
                 $6, $7::smallint)`,
        [
          templateId,
          eventType,
          question.prompt,
          question.answerType,
          question.answerType === "choice" ? question.choices : null,
          question.isRequired,
          index,
        ],
      );
    }

    await createMessagingScheduleIn(tx, templateId, eventType);
    await createEventTypeSettingsIn(tx, templateId, eventType);

    await recordAudit(tx, {
      actorPersonId,
      action: TEMPLATE_CREATED_ACTION,
      entityTable: "event_templates",
      entityId: templateId,
      context: {
        name: input.name,
        colourKey: input.colourKey,
        eventType,
        audienceGroups,
        questionCount: questions.length,
        messagingSchedule: DEFAULT_MESSAGING_SCHEDULE,
        chaseThresholdDays: DEFAULT_CHASE_THRESHOLD_DAYS,
      },
    });

    return readEventTemplateIn(tx, templateId);
  });
}

// D75/D77's chase threshold for a new template — two days, what six of the seven shipped rows say (see relocations.md).
export const DEFAULT_CHASE_THRESHOLD_DAYS = 2;

async function createEventTypeSettingsIn(
  tx: Tx,
  templateId: string,
  eventType: string,
): Promise<void> {
  await tx.query(
    `insert into public.event_type_settings (template_id, event_type, chase_threshold_days)
     values ($1::uuid, $2::public.event_type, $3)`,
    [templateId, eventType, DEFAULT_CHASE_THRESHOLD_DAYS],
  );
}

const TEMPLATE_DELETE_REFUSAL =
  "Events have already been created from this template, so it cannot be deleted. " +
  "Rename it instead — the new name reaches every one of them.";

// Deletes a template nothing was ever created from — LAN-265's rule: a deleted template would
// leave its events with no name to be called. Count and delete are one transaction apart;
// events_template_fkey's on-delete-restrict is the backstop against a race.
export async function deleteEventTemplate(
  actorPersonId: string,
  templateId: string,
): Promise<EventTemplate> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const template = await readEventTemplateIn(tx, templateId);

    const used = await tx.query<{ count: string }>(
      "select count(*)::text as count from public.events where template_id = $1::uuid",
      [templateId],
    );
    if (Number(used.rows[0].count) > 0) {
      throw new ConstraintViolated(TEMPLATE_DELETE_REFUSAL, { rule: TEMPLATE_IN_USE_RULE });
    }

    // questions/audience/schedule/settings all carry on-delete-cascade, so one delete removes them
    // all — written as one statement so a table added later cannot be forgotten here.
    await tx.query("delete from public.event_templates where id = $1::uuid", [templateId]);

    await recordAudit(tx, {
      actorPersonId,
      action: TEMPLATE_DELETED_ACTION,
      entityTable: "event_templates",
      entityId: templateId,
      context: {
        name: template.name,
        eventType: template.eventType,
        questionCount: template.questions.length,
        audienceGroups: template.audienceGroups,
      },
    });

    return template;
  });
}
