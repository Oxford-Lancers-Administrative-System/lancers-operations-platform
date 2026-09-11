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

/**
 * Creates a template, and the messaging cadence that makes it usable.
 *
 * Brian, 2026-09-09: "Creating a template also creates its messaging cadence,
 * which starts from a default cadence and can then be edited on the Messaging
 * schedule screen like the seven existing ones."
 *
 * All three rows in one transaction, and that is the whole design. A template
 * without a `messaging_schedules` row could be picked on the create form and
 * would then refuse at approval, naming a table no operator has heard of — the
 * failure would land on whoever approved next Wednesday's session rather than on
 * whoever created the template, days later and on a different screen. The
 * primary key and the cascading foreign key added by
 * `20260916090000_event_templates.sql` make the pairing structural; this
 * function is what keeps it true at the moment of creation.
 *
 * The new template arrives empty of defaults. Nothing is copied from another
 * template: "Kicking Clinic" is not a variant of Practice, and pre-filling it
 * with Practice's venue and questions would put words in the operator's mouth on
 * a screen whose whole purpose is that they get to choose.
 */
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

/**
 * D75, D77's chase threshold for a template the club has just invented.
 *
 * Two days, which is what six of the seven shipped rows say and what the
 * migration calls "the routine events". A game's seven and a social's five are
 * decisions about a game and a social, not about an unnamed new kind of event.
 */
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

/**
 * Deletes a template nothing was ever created from.
 *
 * "Delete when unused" is the whole rule, and the reason is what a name is for
 * after LAN-265: an event's label is read from its template, so a deleted
 * template would leave its events with nothing to be called. The refusal names
 * the alternative, because renaming is exactly what somebody trying to delete a
 * template they no longer use probably wants — and unlike deleting, it is free
 * and reaches everything.
 *
 * The count and the delete are one statement's apart inside one transaction, and
 * `events_template_fkey`'s `on delete restrict` is the backstop underneath: an
 * event created between the check and the delete makes the delete fail rather
 * than orphan it.
 */
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

    // The questions, the default audience, the messaging schedule and the
    // settings row all carry `on delete cascade`, so this one statement takes
    // the whole template with it. Written as one delete rather than five, so
    // that a table added to the template later cannot be forgotten here.
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
