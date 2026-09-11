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

/** Who is owed a message, counted the way the confirmation screens name them. */
export interface NotifyAudience {
  /** Rows in `invitations` — everyone who was told about this event. */
  invited: number;
  saidYes: number;
  saidNo: number;
  /** Invited and carrying no standing answer. */
  noAnswer: number;
}

/**
 * The counts the confirmations state in people rather than in fields.
 *
 * `invited` and `saidYes` answer the same questions as the event page's
 * headline numbers, and `event-amendment.test.ts` pins the two readers to each
 * other — `docs/ux/standards.md` rule 7 — because a confirmation saying "37
 * people were told" above a page saying 36 invited would be two answers to one
 * question on two surfaces.
 */
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

/** Everything the amendment screen needs before anything is typed. */
export interface AmendmentContext {
  event: EventDetail;
  audience: NotifyAudience;
  /**
   * Invitations for this event that have not gone out and would be held by a
   * save — the same population the delivery screen reports, so the two screens
   * cannot describe one event differently. See the query for why it is scoped.
   */
  unsentMessages: number;
  /** D75, D77 — this event type's threshold, in days. */
  chaseThresholdDays: number;
  /** Where the chase lands against the date the event has now. */
  chaseThresholdOn: string | null;
  /** Whether the event is still ahead of the club, in the club's zone. */
  isFuture: boolean;
  /** The last amendment, if there has been one — W5-04's recovery path. */
  lastAmendment: EventChangeEntry | null;
}

export async function readAmendmentContext(eventId: string): Promise<AmendmentContext> {
  return withTransaction(async (tx) => {
    const event = await readEventIn(tx, eventId);
    const audience = await readNotifyAudienceIn(tx, eventId);
    // LAN-156, corrected at the visual gate. Scoped to `invitation` jobs, and
    // the scope is the point rather than a detail: this number is shown to the
    // operator as "N queued messages are held", and the screen they go to in
    // order to see those messages is `/operate/events/<id>/delivery`, which
    // reports on invitation jobs and nothing else.
    //
    // Counting every job type made the two screens contradict each other. An
    // event amended once carries a `schedule_change_notice` per invitee; on the
    // next visit to this form those were counted back at the operator as
    // messages awaiting delivery, while the delivery screen — correctly, for
    // its own scope — showed nothing at all. Brian saw 47 here and 0 there for
    // one event, and neither number was wrong on its own terms.
    //
    // The hold that `amendApprovedEvent` places is deliberately NOT narrowed to
    // match: REQ-amend-hold holds every unsent job for the event, notices
    // included, and narrowing that would let a stale change notice go out. What
    // is narrowed is only the number the operator is shown, to the population
    // the operator can go and look at.
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

/** One row of the change history, in the words W5-05's table uses. */
export interface EventChangeEntry {
  id: string;
  kind: EventChangeKind;
  occurredAt: Date;
  /** Who did it. `null` only where the actor was not a person. */
  actorName: string | null;
  /** The fields that moved, empty for anything that moved none. */
  changes: readonly AmendmentChange[];
  /**
   * The notify choice for this entry. `null` where the entry is not one
   * somebody decided about — an approval, or a history row written before the
   * decision existed.
   */
  notified: boolean | null;
  /** How many people the entry's message was owed to. */
  recipients: number | null;
}

const HISTORY_ACTIONS: Readonly<Record<string, EventChangeKind>> = Object.freeze({
  "event.approved": "approved",
  "event.amended": "amended",
  "event.renotified": "renotified",
  "event.cancelled": "cancelled",
});

/**
 * The queryable history §4.13 asks for: actor, change, notify choice.
 *
 * Read from `audit_events` rather than from `schedule_changes` because it is
 * the only one of the two that sees a description-only amendment — see the
 * module header. Newest first, which is the order the committee reads it in
 * three weeks later.
 */
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
