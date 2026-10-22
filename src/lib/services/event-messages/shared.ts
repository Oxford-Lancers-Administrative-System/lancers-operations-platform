import "server-only";

import type {
  EventMessageChannel,
  EventMessageInput,
  EventMessageRecipients,
} from "../event-messages-input";

/**
 * Event messages — LAN-508. The shapes every half of the module shares.
 * See `./index.ts` for what the module is.
 */

/** The `notification_jobs.idempotency_key` prefix every recipient's copy carries. */
export const EVENT_MESSAGE_KEY_PREFIX = "event-message:";

/** One recipient's copy of one send, on one channel. */
export function eventMessageJobKey(
  sendId: string,
  personId: string,
  channel: "whatsapp" | "email",
): string {
  return `${EVENT_MESSAGE_KEY_PREFIX}${sendId}:${personId}:${channel}`;
}

/** The send a job belongs to, read back out of its key. */
export function sendIdFromJobKey(key: string): string | null {
  if (!key.startsWith(EVENT_MESSAGE_KEY_PREFIX)) return null;
  const sendId = key.slice(EVENT_MESSAGE_KEY_PREFIX.length).split(":")[0];
  return sendId === undefined || sendId === "" ? null : sendId;
}

/** One version that went. */
interface EventMessageSend {
  readonly id: string;
  readonly version: number;
  readonly hoursBefore: number;
  readonly channel: EventMessageChannel;
  readonly recipients: EventMessageRecipients;
  readonly body: string;
  readonly sentAt: Date;
}

/** A message as stored, with the last version that went, if one has. */
export interface StoredEventMessage extends EventMessageInput {
  readonly id: string;
  readonly sortOrder: number;
  readonly lastSend: EventMessageSend | null;
}

export interface EventMessageRow {
  id: string;
  sort_order: number;
  hours_before: number;
  channel: EventMessageChannel;
  recipients: EventMessageRecipients;
  body: string;
  from_template: boolean;
  send_id: string | null;
  send_version: number | null;
  send_hours_before: number | null;
  send_channel: EventMessageChannel | null;
  send_recipients: EventMessageRecipients | null;
  send_body: string | null;
  sent_at: Date | null;
}

/** The select list `toStoredEventMessage` reads, joined to each message's latest send. */
export const EVENT_MESSAGE_SELECT = `
  select m.id, m.sort_order, m.hours_before, m.channel::text as channel,
         m.recipients::text as recipients, m.body, m.from_template,
         s.id as send_id, s.version as send_version, s.hours_before as send_hours_before,
         s.channel::text as send_channel, s.recipients::text as send_recipients,
         s.body as send_body, s.sent_at
    from public.event_messages m
    left join lateral (
      select * from public.event_message_sends s
       where s.event_message_id = m.id
       order by s.version desc
       limit 1
    ) s on true`;

export function toStoredEventMessage(row: EventMessageRow): StoredEventMessage {
  return {
    id: row.id,
    sortOrder: row.sort_order,
    hoursBefore: row.hours_before,
    channel: row.channel,
    recipients: row.recipients,
    body: row.body,
    fromTemplate: row.from_template,
    lastSend:
      row.send_id === null
        ? null
        : {
            id: row.send_id,
            version: row.send_version ?? 1,
            hoursBefore: row.send_hours_before ?? row.hours_before,
            channel: row.send_channel ?? row.channel,
            recipients: row.send_recipients ?? row.recipients,
            body: row.send_body ?? row.body,
            sentAt: row.sent_at ?? new Date(0),
          },
  };
}
