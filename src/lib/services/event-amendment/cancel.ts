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

/**
 * R156-A5. The rule W5-04 states — re-notify exists for a change that "went
 * out to nobody" — used to live only in `page.tsx`, as the condition that
 * decided whether to render the button. A second caller reaching
 * `renotifyEvent` directly skipped it entirely and could send a duplicate
 * notice for a change everyone had already been told about. The service is
 * now where this is enforced; the page's own check becomes the courtesy of
 * not offering a control that would refuse.
 */
const RENOTIFY_ALREADY_SENT_MESSAGE =
  "The last change to this event has already been sent to everyone invited.";
export const RENOTIFY_ALREADY_SENT_RULE = "event_renotify_requires_a_silent_change";

/**
 * Recorded on a job the cancellation called off.
 *
 * D59 in the one place it is easiest to break: this string is written to the
 * job, and the job is the thing a delivery surface reads. It says the event was
 * cancelled and nothing else — the operator's internal reason is in
 * `events.decision_reason` and in the audit record, and goes nowhere near here.
 */
const JOB_CANCELLED_BY_CANCELLATION = "The event was cancelled.";

export interface RenotifyOutcome {
  event: EventDetail;
  recipients: number;
  noticesOwed: number;
}

/**
 * Sends the change notification to the same audience, and changes nothing else.
 *
 * "Turning the notification off is one tick, and it is easy to get wrong at
 * half past seven on a Monday evening. Without this, a missed notification is
 * permanent and the only fix is WhatsApp."
 *
 * The event row is not written at all — not even `updated_at` — and no response
 * is touched, which is what "alters neither the event nor its responses" has to
 * mean if it is to be assertable. What it produces is one obligation per
 * invitation, exactly as an amendment that notified would have.
 */
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
    // R156-A5. `page.tsx` only ever renders the Re-notify control where the
    // most recent amendment went out silently — a second, later amendment
    // that *did* notify makes the button disappear again. Refused here too,
    // so a caller that reaches this function some other way cannot double-
    // notify a change everybody was already told about.
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
  /** D76. Internal, for the club's record. Never shown to a recipient (D59). */
  reason: string;
  /** D58. Defaults on for a future event and off for a past one. */
  notify: boolean;
  /** Set only by a caller that has shown the confirmation naming the people affected. */
  silenceConfirmed?: boolean;
}

export interface CancellationOutcome {
  event: EventDetail;
  notified: boolean;
  recipients: number;
  noticesOwed: number;
  /** Unsent messages this cancellation called off. Nothing delivered is recalled. */
  messagesCancelled: number;
}

/**
 * `approved → cancelled`, in one action, by one operator, with no approval gate
 * (D56, D61).
 *
 * Only an approved event can be cancelled, and that is structural rather than a
 * policy this function invented: `events_approval_requires_date_and_audience`
 * requires a `cancelled` row to carry the date, the approver and the confirmed
 * audience, which a draft has none of. D29 is the other half — an abandoned
 * draft is deleted rather than cancelled, and that path is W4's.
 *
 * The event, its invitations, its responses and any attendance records all stay
 * exactly where they are (D57). Nothing is deleted, because deleting it would
 * erase the fact that the club planned the game and called it off.
 */
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

    // D76, and `events_negative_decisions_are_explained` in the database. Said
    // here as a sentence so the operator gets one rather than an integrity
    // error naming a constraint.
    const reason = options.reason.trim();
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

    // W6: queued messages are cancelled with the event. Unlike an amendment's
    // hold there is nothing for them to resume into — the event is terminal, so
    // an invitation still waiting to go out is an invitation to something that
    // is not happening. Nothing already delivered is recalled; that remains
    // impossible and remains true.
    //
    // Cancelled before the notices are written, so this statement cannot reach
    // the cancellation notices it is about to create.
    const cancelledJobs = await tx.query<{ id: string }>(
      `update public.notification_jobs
          set status = 'cancelled', cancelled_reason = $2,
              claimed_at = null, claimed_by = null, updated_at = now()
        where event_id = $1 and status in ('pending', 'ready', 'failed')
       returning id`,
      [eventId, JOB_CANCELLED_BY_CANCELLATION],
    );

    // LAN-169. W5: "The event is cancelled — outstanding chase work stops; the
    // queue drops the event." Half of that is free, because `nonresponse_queue`
    // only reads approved events. The other half is not: a raised flag survives
    // its event's cancellation, and a flag is cleared **only by resolution and
    // never by time** (`REQ-one-flag-per-threshold`), so nothing else would ever
    // close it and the follow-up queue would carry a permanent row about an
    // event that is not happening.
    //
    // Resolved rather than deleted, for the same requirement's other half: a
    // cleared flag stays readable in history, because the record that the club
    // escalated is evidence.
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
      // The internal reason belongs in the record, which is what this is.
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
