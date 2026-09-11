import "server-only";

import { withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { personDisplayNameSql } from "../sql-text";
import { readEventIn, type EventDetail } from "../events";
import { chaseThresholdOn, isFutureEvent, type AmendmentChange } from "../event-amendment-rules";
import { readChaseThresholdDaysIn } from "./shared";

/**
 * The amendment context a screen loads before anything is typed, and the
 * change history (§4.13, W5-05). LAN-300 split of `event-amendment.ts`; see
 * `./index`.
 */

export interface NotifyAudience {
  invited: number; // rows in invitations — everyone who was told about this event
  saidYes: number;
  saidNo: number;
  noAnswer: number; // invited and carrying no standing answer
}

// Stated in people, matching the event page's headline numbers (docs/ux/standards.md rule 7).
export async function readNotifyAudienceIn(tx: Tx, eventId: string): Promise<NotifyAudience> {
  const result = await tx.query<{
    invited: string;
    said_yes: string;
    said_no: string;
  }>(
    `select count(*)::text as invited,
            count(*) filter (where r.response = 'yes')::text as said_yes,
            count(*) filter (where r.response = 'no')::text as said_no
       from public.invitations i
       left join public.current_rsvp r on r.invitation_id = i.id
      where i.event_id = $1`,
    [eventId],
  );

  const row = result.rows[0];
  const invited = Number(row.invited);
  const saidYes = Number(row.said_yes);
  const saidNo = Number(row.said_no);

  return { invited, saidYes, saidNo, noAnswer: invited - saidYes - saidNo };
}

export interface AmendmentContext {
  event: EventDetail;
  audience: NotifyAudience;
  unsentMessages: number; // invitations not yet sent, held by a save — see relocations.md
  chaseThresholdDays: number; // D75, D77
  chaseThresholdOn: string | null; // where the chase lands against the event's current date
  isFuture: boolean;
  lastAmendment: EventChangeEntry | null; // W5-04's recovery path
}

export async function readAmendmentContext(eventId: string): Promise<AmendmentContext> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const audience = await readNotifyAudienceIn(tx, eventId);
    // Scoped to `invitation` jobs so this matches /operate/events/<id>/delivery (LAN-156; see
    // relocations.md). amendApprovedEvent's hold stays unnarrowed (REQ-amend-hold).
    const unsent = await tx.query<{ count: string }>(
      `select count(*)::text as count
         from public.notification_jobs
        where event_id = $1
          and job_type = 'invitation'
          and status in ('pending', 'ready', 'failed')`,
      [eventId],
    );
    const days = await readChaseThresholdDaysIn(tx, event.templateId);
    const history = await readEventChangeHistoryIn(tx, eventId);

    return {
      event,
      audience,
      unsentMessages: Number(unsent.rows[0].count),
      chaseThresholdDays: days,
      chaseThresholdOn: chaseThresholdOn(event.scheduledOn, days),
      isFuture: isFutureEvent(event, todayInClubZone()),
      lastAmendment: history.find((entry) => entry.kind === "amended") ?? null,
    };
  });
}

export type EventChangeKind = "approved" | "amended" | "renotified" | "cancelled";

export interface EventChangeEntry {
  id: string;
  kind: EventChangeKind;
  occurredAt: Date;
  actorName: string | null; // null only where the actor was not a person
  changes: readonly AmendmentChange[]; // empty for anything that moved none
  notified: boolean | null; // null where nobody decided — an approval, or a pre-decision row
  recipients: number | null; // how many people the entry's message was owed to
}

const HISTORY_ACTIONS: Readonly<Record<string, EventChangeKind>> = Object.freeze({
  "event.approved": "approved",
  "event.amended": "amended",
  "event.renotified": "renotified",
  "event.cancelled": "cancelled",
});

// Read from audit_events, not schedule_changes — the only one that sees a description-only amendment.
export async function readEventChangeHistory(eventId: string): Promise<EventChangeEntry[]> {
  return withTransaction(async (tx) => readEventChangeHistoryIn(tx, eventId));
}

export async function readEventChangeHistoryIn(
  tx: Tx,
  eventId: string,
): Promise<EventChangeEntry[]> {
  const result = await tx.query<{
    id: string;
    action: string;
    occurred_at: Date;
    actor_name: string | null;
    context: Record<string, unknown> | null;
  }>(
    `select a.id, a.action, a.occurred_at,
            ${personDisplayNameSql("p")} as actor_name,
            a.context
       from public.audit_events a
       left join public.people p on p.id = a.actor_person_id
      where a.entity_table = 'events' and a.entity_id = $1
        and a.action = any($2::text[])
      order by a.occurred_at desc, a.id desc`,
    [eventId, Object.keys(HISTORY_ACTIONS)],
  );

  return result.rows.map((row) => {
    const context = row.context ?? {};
    const rawChanges = Array.isArray(context.changes) ? context.changes : [];
    const notified = typeof context.notified === "boolean" ? context.notified : null;
    const recipients = typeof context.recipients === "number" ? context.recipients : null;

    return {
      id: row.id,
      kind: HISTORY_ACTIONS[row.action],
      occurredAt: row.occurred_at,
      actorName: row.actor_name,
      changes: rawChanges as AmendmentChange[],
      notified,
      recipients,
    };
  });
}
