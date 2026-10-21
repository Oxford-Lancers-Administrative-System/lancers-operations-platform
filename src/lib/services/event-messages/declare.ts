import "server-only";

import type { Tx } from "@/lib/db";
import { recordAudit } from "../audit";
import type { EventMessageChannel, EventMessageRecipients } from "../event-messages-input";
import { hasGrantedSeasonMessagingConsentIn } from "../messaging-consent";
import { isLightsOut, lightsOutNow } from "../messaging-schedule/lights-out";
import { EVENT_START_SQL } from "../attendance-sheet-email";
import { eventMessageJobKey } from "./shared";

/**
 * Sending an event message — LAN-508. Two doors, one path:
 *
 *   * **The schedule.** {@link declareDueEventMessagesIn} runs at the top of
 *     every sweep tick. A message goes when its moment has come — the event
 *     start less its hours — on an approved event that has not started, and
 *     has not gone before. Its moment is never stored, so a moved event moves
 *     it and a cancelled one never reaches it. Recipients are read at that
 *     tick: everyone invited, or those whose current answer is Yes.
 *   * **Save and send again.** `saveApprovedEventMessages` (`./store.ts`)
 *     sends a changed message again, to exactly the people the previous send
 *     went to, named in `event_message_send_recipients`.
 *
 * Both write one `event_message_sends` row (the version, as it went), one
 * recipient row per person, and one `notification_jobs` row per person per
 * channel, due now. The sweep dispatches the jobs on the same tick
 * (`dispatchEventMessageJob`), through the safety guard and the delivery
 * records like any other message.
 *
 * ## Lights-out
 *
 * A moment between 22:00 and 07:00 waits for 07:00 (LAN-433). Nothing is
 * declared while the window is on, so the 07:00 tick declares it, and "those
 * who said Yes" is read then, when it actually goes. The jobs themselves are
 * not exempt either, so a resend saved at night is held to 07:00 too.
 *
 * ## The channel, per person
 *
 * WhatsApp needs the person's current-season messaging consent. Without it
 * they get the email, whatever the message's channel says (Brian's spec on
 * the ticket). With it: WhatsApp, email or both, as chosen.
 */

/** Who acted, when no person did. */
const EVENT_MESSAGE_SWEEP_ACTOR = "event-message-sweep";

/** The channels one person's copy goes on. */
function channelsFor(
  channel: EventMessageChannel,
  hasWhatsAppConsent: boolean,
): ("whatsapp" | "email")[] {
  if (!hasWhatsAppConsent) return ["email"];
  if (channel === "both") return ["whatsapp", "email"];
  return [channel];
}

/**
 * Everybody one event message goes to now: every person with a live
 * invitation to the event, or only those whose current answer is Yes. One row
 * per person. An erased or merged-away record is never a recipient.
 */
async function resolveEventMessageRecipientsIn(
  tx: Tx,
  eventId: string,
  recipients: EventMessageRecipients,
): Promise<string[]> {
  const result = await tx.query<{ person_id: string }>(
    `select distinct p.id as person_id
       from public.invitations i
       left join public.season_memberships sm on sm.id = i.season_membership_id
       join public.people p on p.id = coalesce(i.person_id, sm.person_id)
       left join public.current_rsvp r on r.invitation_id = i.id
      where i.event_id = $1
        and i.status <> 'cancelled'
        and p.erased_at is null
        and p.merged_into_person_id is null
        and ($2::text = 'everyone' or r.response = 'yes')
      order by p.id`,
    [eventId, recipients],
  );
  return result.rows.map((row) => row.person_id);
}

interface SendSpec {
  readonly messageId: string;
  readonly eventId: string;
  readonly seasonId: string;
  readonly version: number;
  readonly hoursBefore: number;
  readonly channel: EventMessageChannel;
  readonly recipients: EventMessageRecipients;
  readonly body: string;
  readonly people: readonly string[];
  /** The operator who pressed Save and send again; `null` for the schedule. */
  readonly resentByPersonId: string | null;
}

/**
 * Writes one send: the version, who it went to, and each copy's job. Returns
 * the send's id and how many jobs were queued.
 */
export async function createEventMessageSendIn(
  tx: Tx,
  spec: SendSpec,
): Promise<{ sendId: string; jobs: number }> {
  const inserted = await tx.query<{ id: string }>(
    `insert into public.event_message_sends
       (event_message_id, event_id, version, hours_before, channel, recipients, body,
        resent_by_person_id)
     values ($1, $2, $3, $4, $5::public.event_message_channel,
             $6::public.event_message_recipients, $7, $8)
     returning id`,
    [
      spec.messageId,
      spec.eventId,
      spec.version,
      spec.hoursBefore,
      spec.channel,
      spec.recipients,
      spec.body,
      spec.resentByPersonId,
    ],
  );
  const sendId = inserted.rows[0].id;

  let jobs = 0;
  for (const personId of spec.people) {
    await tx.query(
      `insert into public.event_message_send_recipients (send_id, person_id) values ($1, $2)`,
      [sendId, personId],
    );
    const consent = await hasGrantedSeasonMessagingConsentIn(tx, personId, spec.seasonId);
    for (const channel of channelsFor(spec.channel, consent)) {
      const job = await tx.query(
        `insert into public.notification_jobs
           (idempotency_key, job_type, status, event_id, person_id, channel, scheduled_for,
            template_variables)
         values ($1, 'other', 'pending', $2, $3, $4::public.notification_channel, now(),
                 '{}'::jsonb)
         on conflict (idempotency_key) do nothing`,
        [eventMessageJobKey(sendId, personId, channel), spec.eventId, personId, channel],
      );
      jobs += job.rowCount ?? 0;
    }
  }

  await recordAudit(tx, {
    ...(spec.resentByPersonId === null
      ? { actorLabel: EVENT_MESSAGE_SWEEP_ACTOR }
      : { actorPersonId: spec.resentByPersonId }),
    action: spec.version === 1 ? "event_message.sent" : "event_message.resent",
    entityTable: "events",
    entityId: spec.eventId,
    context: {
      eventMessageId: spec.messageId,
      sendId,
      version: spec.version,
      channel: spec.channel,
      recipients: spec.recipients,
      people: spec.people.length,
      jobs,
    },
  });

  return { sendId, jobs };
}

/**
 * Declares every event message whose moment has come and that has not gone
 * yet — never dispatches; `runMessagingSweep` sends the jobs on the same tick.
 * Nothing at all while lights-out is on. Returns how many messages went.
 */
export async function declareDueEventMessagesIn(tx: Tx): Promise<number> {
  if (isLightsOut(lightsOutNow())) return 0;

  const due = await tx.query<{
    id: string;
    event_id: string;
    season_id: string;
    hours_before: number;
    channel: EventMessageChannel;
    recipients: EventMessageRecipients;
    body: string;
  }>(
    `select m.id, m.event_id, e.season_id, m.hours_before, m.channel::text as channel,
            m.recipients::text as recipients, m.body
       from public.event_messages m
       join public.events e on e.id = m.event_id
      where e.status = 'approved'
        and e.starts_at is not null
        and ${EVENT_START_SQL} > now()
        and ${EVENT_START_SQL} - make_interval(hours => m.hours_before) <= now()
        and not exists (
          select 1 from public.event_message_sends s where s.event_message_id = m.id)
      order by ${EVENT_START_SQL} - make_interval(hours => m.hours_before), m.id
      for update of m skip locked`,
  );

  for (const message of due.rows) {
    await createEventMessageSendIn(tx, {
      messageId: message.id,
      eventId: message.event_id,
      seasonId: message.season_id,
      version: 1,
      hoursBefore: message.hours_before,
      channel: message.channel,
      recipients: message.recipients,
      body: message.body,
      people: await resolveEventMessageRecipientsIn(tx, message.event_id, message.recipients),
      resentByPersonId: null,
    });
  }
  return due.rows.length;
}
