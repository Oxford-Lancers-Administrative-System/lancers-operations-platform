import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "../audit";
import { lockEventIn, readEventIn, type EventDetail } from "../events";
import { cancellationSilenceNeedsConfirmation, isFutureEvent } from "../event-amendment-rules";
import { readEventChangeHistoryIn, readNotifyAudienceIn } from "./read";
import {
  AMEND_REQUIRES_APPROVED_MESSAGE,
  AMEND_REQUIRES_APPROVED_RULE,
  assertNotTerminal,
  describeStatus,
  randomNoticeKey,
  recordNoticesOwedIn,
  requireActor,
  SILENCE_NEEDS_CONFIRMATION_MESSAGE,
  SILENCE_NEEDS_CONFIRMATION_RULE,
} from "./shared";

/**
 * Cancelling an approved event (W6, D56, D61) and re-notifying its last
 * silent change (D54, W5-04). LAN-300 split of `event-amendment.ts`; see
 * `./index`.
 */

export const CANCEL_REQUIRES_APPROVED_MESSAGE = "Only an approved event can be cancelled.";
export const CANCEL_REQUIRES_APPROVED_RULE = "event_cancellation_requires_approved";

const CANCELLATION_NEEDS_A_REASON_MESSAGE = "Say why this event is off, for the record.";
export const CANCELLATION_NEEDS_A_REASON_RULE = "event_cancellation_requires_a_reason";

const NOBODY_TO_NOTIFY_MESSAGE = "Nobody was invited to this event, so there is nobody to tell.";
const NOBODY_TO_NOTIFY_RULE = "event_renotify_requires_an_audience";

const NOTHING_TO_RENOTIFY_MESSAGE = "Nothing has changed about this event since it was approved.";
export const NOTHING_TO_RENOTIFY_RULE = "event_renotify_requires_a_change";

// R156-A5: enforced here, not only in page.tsx's button visibility, so a caller reaching
// renotifyEvent directly can't double-send a notice everyone already got. See relocations.md.
const RENOTIFY_ALREADY_SENT_MESSAGE =
  "The last change to this event has already been sent to everyone invited.";
export const RENOTIFY_ALREADY_SENT_RULE = "event_renotify_requires_a_silent_change";

const JOB_CANCELLED_BY_CANCELLATION = "The event was cancelled."; // D59: the job's own text says only this, never the internal reason

export interface RenotifyOutcome {
  event: EventDetail;
  recipients: number;
  noticesOwed: number;
}

// Sends the change notification to the same audience and changes nothing else — the event row is
// not written at all, not even updated_at, and no response is touched (Brian: a missed
// notification is otherwise permanent). See relocations.md.
export async function renotifyEvent(
  actorPersonId: string,
  eventId: string,
): Promise<RenotifyOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const event = await lockEventIn(tx, eventId);
    assertNotTerminal(event);
    if (event.status !== "approved") {
      throw new InvalidTransition(
        `${AMEND_REQUIRES_APPROVED_MESSAGE} ${describeStatus(event.status)}`,
        { rule: AMEND_REQUIRES_APPROVED_RULE },
      );
    }

    const history = await readEventChangeHistoryIn(tx, eventId);
    const lastAmendment = history.find((entry) => entry.kind === "amended") ?? null;
    if (lastAmendment === null) {
      throw new ConstraintViolated(NOTHING_TO_RENOTIFY_MESSAGE, {
        rule: NOTHING_TO_RENOTIFY_RULE,
      });
    }
    if (lastAmendment.notified !== false) {
      throw new ConstraintViolated(RENOTIFY_ALREADY_SENT_MESSAGE, {
        rule: RENOTIFY_ALREADY_SENT_RULE,
      });
    }

    const audience = await readNotifyAudienceIn(tx, eventId);
    if (audience.invited === 0) {
      throw new ConstraintViolated(NOBODY_TO_NOTIFY_MESSAGE, { rule: NOBODY_TO_NOTIFY_RULE });
    }

    const noticesOwed = await recordNoticesOwedIn(tx, {
      eventId,
      jobType: "schedule_change_notice",
      noticeKey: `renotify:${randomNoticeKey()}`,
    });

    await recordAudit(tx, {
      actorPersonId,
      action: "event.renotified",
      entityTable: "events",
      entityId: eventId,
      context: { notified: true, recipients: audience.invited, noticesOwed, changes: [] },
    });

    return { event, recipients: audience.invited, noticesOwed };
  });
}

export interface CancellationOptions {
  reason: string; // D76, internal for the club's record — never shown to a recipient (D59)
  notify: boolean; // D58: defaults on for a future event, off for a past one
  silenceConfirmed?: boolean; // set only by a caller that has shown the confirmation naming who's affected
}

export interface CancellationOutcome {
  event: EventDetail;
  notified: boolean;
  recipients: number;
  noticesOwed: number;
  messagesCancelled: number; // unsent messages this cancellation called off; nothing delivered is recalled
}

// approved -> cancelled, in one action, one operator, no approval gate (D56, D61) — structural, not
// invented: events_approval_requires_date_and_audience requires a cancelled row to carry what a
// draft has none of (D29 covers an abandoned draft: deleted, not cancelled, W4's path). Nothing is
// deleted (D57) — the record that the club planned the game and called it off must survive.
export async function cancelEvent(
  actorPersonId: string,
  eventId: string,
  options: CancellationOptions,
): Promise<CancellationOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId);
    assertNotTerminal(before);
    if (before.status !== "approved") {
      throw new InvalidTransition(
        `${CANCEL_REQUIRES_APPROVED_MESSAGE} ${describeStatus(before.status)}`,
        { rule: CANCEL_REQUIRES_APPROVED_RULE },
      );
    }

    const reason = options.reason.trim(); // D76 / events_negative_decisions_are_explained, said as a sentence rather than a constraint error
    if (reason === "") {
      throw new ConstraintViolated(CANCELLATION_NEEDS_A_REASON_MESSAGE, {
        rule: CANCELLATION_NEEDS_A_REASON_RULE,
      });
    }

    const isFuture = isFutureEvent(before, todayInClubZone());
    if (!options.notify && cancellationSilenceNeedsConfirmation({ isFuture })) {
      if (options.silenceConfirmed !== true) {
        throw new ConstraintViolated(SILENCE_NEEDS_CONFIRMATION_MESSAGE, {
          rule: SILENCE_NEEDS_CONFIRMATION_RULE,
        });
      }
    }

    const audience = await readNotifyAudienceIn(tx, eventId);

    const updated = await tx.query<{ id: string }>(
      `update public.events
          set status = 'cancelled', decision_reason = $2, updated_at = now()
        where id = $1 and status = 'approved'
       returning id`,
      [eventId, reason],
    );

    if (updated.rowCount === 0) {
      throw new InvalidTransition(
        `${CANCEL_REQUIRES_APPROVED_MESSAGE} ${describeStatus(before.status)}`,
        { rule: CANCEL_REQUIRES_APPROVED_RULE },
      );
    }

    // W6: queued messages are cancelled with the event, nothing delivered is recalled. Run before
    // the notices are written, so it cannot reach the cancellation notices about to be created.
    const cancelledJobs = await tx.query<{ id: string }>(
      `update public.notification_jobs
          set status = 'cancelled', cancelled_reason = $2,
              claimed_at = null, claimed_by = null, updated_at = now()
        where event_id = $1 and status in ('pending', 'ready', 'failed')
       returning id`,
      [eventId, JOB_CANCELLED_BY_CANCELLATION],
    );

    // LAN-169, W5: cancellation stops outstanding chase work. A raised flag is cleared only by
    // resolution, never by time (REQ-one-flag-per-threshold), so it is resolved here, not deleted
    // — a cleared flag stays readable in history as evidence the club escalated. See relocations.md.
    await tx.query(
      `update public.nonresponse_flags f
          set resolved_at = now(),
              resolution = $2,
              resolved_by_person_id = $3
         from public.invitations i
        where i.id = f.invitation_id
          and i.event_id = $1
          and f.resolved_at is null`,
      [eventId, "The event was cancelled, so there is nothing left to chase.", actorPersonId],
    );

    const noticesOwed = options.notify
      ? await recordNoticesOwedIn(tx, {
          eventId,
          jobType: "cancellation_notice",
          noticeKey: "cancellation",
        })
      : 0;

    await recordAudit(tx, {
      actorPersonId,
      action: "event.cancelled",
      entityTable: "events",
      entityId: eventId,
      fromState: "approved",
      toState: "cancelled",
      reason,
      context: {
        notified: options.notify,
        recipients: audience.invited,
        silenceConfirmed: options.notify ? false : options.silenceConfirmed === true,
        messagesCancelled: cancelledJobs.rowCount ?? 0,
        noticesOwed,
        wasFuture: isFuture,
        changes: [],
      },
    });

    return {
      event: await readEventIn(tx, eventId),
      notified: options.notify,
      recipients: audience.invited,
      noticesOwed,
      messagesCancelled: cancelledJobs.rowCount ?? 0,
    };
  });
}
