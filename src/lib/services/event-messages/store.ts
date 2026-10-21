import "server-only";

import {
  ConstraintViolated,
  InvalidTransition,
  NotFound,
  withTransaction,
  type Tx,
} from "@/lib/db";
import { recordAudit } from "../audit";
import { actorRequirement } from "../actor";
import { UUID_PATTERN } from "../event-input";
import { eventMessageChanged, type EventMessageInput } from "../event-messages-input";
import { createEventMessageSendIn } from "./declare";
import {
  EVENT_MESSAGE_SELECT,
  toStoredEventMessage,
  type EventMessageRow,
  type StoredEventMessage,
} from "./shared";

/**
 * Reading and writing the messages an event or a template carries — LAN-508.
 *
 * A draft's messages are rewritten whole on every save, like its questions:
 * nothing can point at them yet. An approved event's are updated in place,
 * because a sent message has history hanging off it — and a change to one
 * that has already gone is saved only together with sending it again
 * (Brian, 21 October: there is no save without sending). The server refuses
 * that save without the confirmation; the dialog is a courtesy.
 */

const requireActor = actorRequirement(
  "An event message change has to name the operator who made it.",
);

/** The rule a save of a sent message without its resend is refused under. */
export const EVENT_MESSAGE_RESEND_REQUIRED_RULE = "event_message_resend_required";
export const EVENT_MESSAGE_RESEND_REQUIRED_MESSAGE =
  "This event message has already been sent. Saving a change to it sends it again, so it has to be saved with Save and send again.";

const SENT_REMOVAL_MESSAGE = "An event message that has been sent cannot be removed.";
const NOT_THIS_EVENT_MESSAGE = "That event message does not belong to this event.";
const STARTED_RESEND_MESSAGE =
  "This event has started, so a sent event message cannot be sent again.";

async function readEventMessagesIn(tx: Tx, eventId: string): Promise<StoredEventMessage[]> {
  const result = await tx.query<EventMessageRow>(
    `${EVENT_MESSAGE_SELECT}
      where m.event_id = $1
      order by m.sort_order, m.created_at, m.id`,
    [eventId],
  );
  return result.rows.map(toStoredEventMessage);
}

export async function readEventMessages(eventId: string): Promise<StoredEventMessage[]> {
  if (!UUID_PATTERN.test(eventId)) return [];
  return withTransaction((tx) => readEventMessagesIn(tx, eventId));
}

/**
 * The brief one message's preview shows, and the event that decides who may
 * see it: as last sent, or as it stands while it has not gone.
 */
export async function readEventMessageBrief(
  messageId: string,
): Promise<{ eventId: string; body: string } | null> {
  if (!UUID_PATTERN.test(messageId)) return null;
  return withTransaction(async (tx) => {
    const result = await tx.query<EventMessageRow & { event_id: string }>(
      `${EVENT_MESSAGE_SELECT.replace("select m.id,", "select m.event_id, m.id,")}
        where m.id = $1`,
      [messageId],
    );
    const row = result.rows[0];
    if (!row) return null;
    const message = toStoredEventMessage(row);
    return { eventId: row.event_id, body: message.lastSend?.body ?? message.body };
  });
}

async function insertEventMessageIn(
  tx: Tx,
  eventId: string,
  message: EventMessageInput,
  sortOrder: number,
): Promise<void> {
  await tx.query(
    `insert into public.event_messages
       (event_id, sort_order, hours_before, channel, recipients, body, from_template)
     values ($1, $2, $3, $4::public.event_message_channel,
             $5::public.event_message_recipients, $6, $7)`,
    [
      eventId,
      sortOrder,
      message.hoursBefore,
      message.channel,
      message.recipients,
      message.body,
      message.fromTemplate,
    ],
  );
}

/**
 * A draft's messages, replaced by what the form posted. The caller holds the
 * draft guard: a draft has no sends, so nothing can refuse the delete.
 */
export async function writeDraftEventMessagesIn(
  tx: Tx,
  eventId: string,
  messages: readonly EventMessageInput[],
): Promise<void> {
  await tx.query("delete from public.event_messages where event_id = $1", [eventId]);
  for (const [index, message] of messages.entries()) {
    await insertEventMessageIn(tx, eventId, message, index);
  }
}

/** What a save of an approved event's messages did. */
export interface ApprovedEventMessagesSave {
  readonly changed: boolean;
  readonly resent: number;
}

/**
 * Which stored messages a submission would change after they have gone. The
 * edit page asks first, so Send again? names the right send.
 */
export function sentMessagesChangedBy(
  stored: readonly StoredEventMessage[],
  submitted: readonly EventMessageInput[],
): StoredEventMessage[] {
  return stored.filter((message) => {
    if (message.lastSend === null) return false;
    const after = submitted.find((candidate) => candidate.id === message.id);
    return after !== undefined && eventMessageChanged(message, after);
  });
}

/**
 * An approved event's messages: unsent ones are inserted, updated and removed
 * freely; a sent one is never removed, and a change to it is saved only with
 * `resend`, which sends the new version to exactly the people the last send
 * went to.
 */
export async function saveApprovedEventMessages(
  actorPersonId: string,
  eventId: string,
  messages: readonly EventMessageInput[],
  options: { resend?: boolean } = {},
): Promise<ApprovedEventMessagesSave> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await tx.query<{ status: string; season_id: string; started: boolean }>(
      `select e.status::text as status, e.season_id,
              coalesce((e.scheduled_on + coalesce(e.starts_at, '00:00'::time))
                         at time zone 'Europe/London' <= now(), false) as started
         from public.events e
        where e.id = $1
        for update`,
      [eventId],
    );
    const row = event.rows[0];
    if (!row) throw new NotFound("That event does not exist.", { rule: "event_not_found" });
    if (row.status !== "approved") {
      throw new InvalidTransition("Only an approved event's messages are changed here.", {
        rule: "event_messages_edit_requires_approved",
      });
    }

    const stored = await readEventMessagesIn(tx, eventId);
    const storedIds = new Set(stored.map((message) => message.id));
    const submittedIds = new Set(
      messages.map((message) => message.id).filter((id): id is string => id !== null),
    );

    for (const id of submittedIds) {
      if (!storedIds.has(id)) {
        throw new ConstraintViolated(NOT_THIS_EVENT_MESSAGE, {
          rule: "event_message_belongs_to_event",
        });
      }
    }
    const removed = stored.filter((message) => !submittedIds.has(message.id));
    if (removed.some((message) => message.lastSend !== null)) {
      throw new ConstraintViolated(SENT_REMOVAL_MESSAGE, {
        rule: "event_message_sent_cannot_be_removed",
      });
    }

    const resending = sentMessagesChangedBy(stored, messages);
    if (resending.length > 0 && options.resend !== true) {
      throw new InvalidTransition(EVENT_MESSAGE_RESEND_REQUIRED_MESSAGE, {
        rule: EVENT_MESSAGE_RESEND_REQUIRED_RULE,
      });
    }
    if (resending.length > 0 && row.started) {
      throw new InvalidTransition(STARTED_RESEND_MESSAGE, {
        rule: "event_message_resend_after_start",
      });
    }

    let changed = removed.length > 0;
    for (const message of removed) {
      await tx.query("delete from public.event_messages where id = $1", [message.id]);
    }

    for (const [index, message] of messages.entries()) {
      if (message.id === null) {
        await insertEventMessageIn(tx, eventId, message, index);
        changed = true;
        continue;
      }
      const before = stored.find((candidate) => candidate.id === message.id);
      if (!before) continue;
      if (!eventMessageChanged(before, message) && before.sortOrder === index) continue;
      await tx.query(
        `update public.event_messages
            set sort_order = $2, hours_before = $3,
                channel = $4::public.event_message_channel,
                recipients = $5::public.event_message_recipients,
                body = $6,
                from_template = from_template and not $7,
                updated_at = now()
          where id = $1`,
        [
          message.id,
          index,
          message.hoursBefore,
          message.channel,
          message.recipients,
          message.body,
          eventMessageChanged(before, message),
        ],
      );
      changed = true;
    }

    // Save and send again: the new version, to the people the last one reached.
    let resent = 0;
    for (const before of resending) {
      const message = messages.find((candidate) => candidate.id === before.id);
      if (!message || !before.lastSend) continue;
      // A person merge leaves the recipient rows where they are, so each is
      // followed to the record it was merged into, through any chain of
      // merges, and the surviving record is the one sent to, once.
      const people = await tx.query<{ person_id: string }>(
        `with recursive resolved (person_id, merged_into, depth) as (
           select p.id, p.merged_into_person_id, 0
             from public.event_message_send_recipients r
             join public.people p on p.id = r.person_id
            where r.send_id = $1
           union all
           select p.id, p.merged_into_person_id, resolved.depth + 1
             from resolved
             join public.people p on p.id = resolved.merged_into
            where resolved.depth < 32
         )
         select distinct resolved.person_id
           from resolved
           join public.people p on p.id = resolved.person_id
          where resolved.merged_into is null and p.erased_at is null
          order by 1`,
        [before.lastSend.id],
      );
      await createEventMessageSendIn(tx, {
        messageId: before.id,
        eventId,
        seasonId: row.season_id,
        version: before.lastSend.version + 1,
        hoursBefore: message.hoursBefore,
        channel: message.channel,
        recipients: message.recipients,
        body: message.body,
        people: people.rows.map((person) => person.person_id),
        resentByPersonId: actorPersonId,
      });
      resent += 1;
    }

    if (changed) {
      await recordAudit(tx, {
        actorPersonId,
        action: "event.messages_updated",
        entityTable: "events",
        entityId: eventId,
        context: {
          messageCount: messages.length,
          removed: removed.length,
          resent,
        },
      });
    }

    return { changed, resent };
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

/** A template's skeleton, as the messages a new event made from it starts with. */
export async function readTemplateEventMessagesIn(
  tx: Tx,
  templateId: string,
): Promise<EventMessageInput[]> {
  const result = await tx.query<{
    hours_before: number;
    channel: EventMessageInput["channel"];
    recipients: EventMessageInput["recipients"];
    body: string;
  }>(
    `select hours_before, channel::text as channel, recipients::text as recipients, body
       from public.event_template_messages
      where template_id = $1
      order by sort_order, created_at, id`,
    [templateId],
  );
  return result.rows.map((row) => ({
    id: null,
    hoursBefore: row.hours_before,
    channel: row.channel,
    recipients: row.recipients,
    body: row.body,
    fromTemplate: true,
  }));
}

/** Every template's skeleton at once, for the event form's Type control. */
export async function readAllTemplateEventMessagesIn(
  tx: Tx,
): Promise<Map<string, EventMessageInput[]>> {
  const result = await tx.query<{
    template_id: string;
    hours_before: number;
    channel: EventMessageInput["channel"];
    recipients: EventMessageInput["recipients"];
    body: string;
  }>(
    `select template_id, hours_before, channel::text as channel,
            recipients::text as recipients, body
       from public.event_template_messages
      order by template_id, sort_order, created_at, id`,
  );
  const byTemplate = new Map<string, EventMessageInput[]>();
  for (const row of result.rows) {
    const list = byTemplate.get(row.template_id) ?? [];
    list.push({
      id: null,
      hoursBefore: row.hours_before,
      channel: row.channel,
      recipients: row.recipients,
      body: row.body,
      fromTemplate: true,
    });
    byTemplate.set(row.template_id, list);
  }
  return byTemplate;
}

export async function readTemplateEventMessages(templateId: string): Promise<EventMessageInput[]> {
  if (!UUID_PATTERN.test(templateId)) return [];
  return withTransaction((tx) => readTemplateEventMessagesIn(tx, templateId));
}

/** A template's skeleton, replaced whole. Existing events are never touched. */
async function replaceTemplateEventMessagesIn(
  tx: Tx,
  templateId: string,
  messages: readonly EventMessageInput[],
): Promise<void> {
  await tx.query("delete from public.event_template_messages where template_id = $1", [templateId]);
  for (const [index, message] of messages.entries()) {
    await tx.query(
      `insert into public.event_template_messages
         (template_id, sort_order, hours_before, channel, recipients, body)
       values ($1, $2, $3, $4::public.event_message_channel,
               $5::public.event_message_recipients, $6)`,
      [templateId, index, message.hoursBefore, message.channel, message.recipients, message.body],
    );
  }
}

export async function replaceTemplateEventMessages(
  actorPersonId: string,
  templateId: string,
  messages: readonly EventMessageInput[],
): Promise<void> {
  requireActor(actorPersonId);
  if (!UUID_PATTERN.test(templateId)) {
    throw new NotFound("That template does not exist.", { rule: "event_template_not_found" });
  }
  await withTransaction(async (tx) => {
    await replaceTemplateEventMessagesIn(tx, templateId, messages);
    await recordAudit(tx, {
      actorPersonId,
      action: "event_template.messages_updated",
      entityTable: "event_templates",
      entityId: templateId,
      context: { messageCount: messages.length },
    });
  });
}
