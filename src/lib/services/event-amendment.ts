import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "./audit";
import { actorRequirement } from "./actor";
import { deriveTermCoordinate, type EventDraftInput } from "./event-input";
import { lockEventIn, readEventIn, type EventDetail } from "./events";
import {
  cancellationSilenceNeedsConfirmation,
  chaseThresholdOn,
  diffAmendment,
  isFutureEvent,
  isTerminal,
  silenceNeedsConfirmation,
  type AmendableEvent,
  type AmendmentChange,
} from "./event-amendment-rules";

/**
 * Amending, re-notifying and cancelling an approved event — W5 and W6, LAN-156.
 *
 * ## The one thing this module exists to protect
 *
 * An approved event with thirty-seven invitations and twenty-five answers is
 * the only record in the application where somebody changes something people
 * have already acted on. Every write below is therefore additive to the
 * invitations and the responses: nothing here deletes an invitation, deletes a
 * response, or re-opens one. The acceptance evidence asks for that by **count
 * and identity**, and `event-amendment.test.ts` asserts it that way.
 *
 * ## The event never leaves `approved` (REQ-amend-in-place)
 *
 * D49 makes `approved → draft` a real transition and this workflow does not use
 * it, because D4 was decided separately and makes drafts publicly visible: an
 * event with thirty-seven invitations would appear on the public calendar as a
 * draft for the length of an edit, and indefinitely if the operator were
 * interrupted. `amendApprovedEvent` therefore never writes `status` at all, and
 * guards every update on `status = 'approved'` so that a concurrent
 * cancellation cannot be overtaken by an amendment that thinks it is still
 * live.
 *
 * Holding the change until Save is the **screen's** job and not this module's,
 * and that is the design rather than an omission: a pending amendment that was
 * stored would be a fourth state of the event that somebody could leave behind.
 * `amendApprovedEvent` is called once, with everything, at the moment the
 * operator presses Save — so abandoning an amendment writes nothing anywhere,
 * which is what "leaves no trace" has to mean.
 *
 * ## One notify decision, and where the record of it lives
 *
 * The operator makes exactly one decision per amendment (D54, D55, as W5
 * reframed them), and it is recorded in two places that are written together:
 *
 *   * **`public.schedule_changes`** — invariant E2's typed schedule history,
 *     which LAN-151 extended with `previous_ends_at`, `new_ends_at`,
 *     `previous_name`, `new_name` and `notified` for exactly this. One row per
 *     amendment that moved a **schedule-shaped** field.
 *   * **`public.audit_events`** — one row per amendment, always, naming the
 *     actor, every field that moved, and the notify choice.
 *
 * ### Why both, and what that says about `schedule_changes`' fitness
 *
 * `schedule_changes` was the natural home and it is the right home for what it
 * can hold, but it cannot hold an amendment on its own. Its
 * `schedule_changes_something_actually_changed` constraint enumerates the
 * columns it has — date, start, end, venue, name, opponent — so an amendment
 * that changed only the description, only the required equipment, or only
 * mandatory-versus-optional is a change the table **structurally refuses**.
 * Those are precisely the amendments D55 calls the ordinary case. A history
 * built on `schedule_changes` alone would therefore be silent about the
 * commonest kind of amendment there is, which is the opposite of §4.13's
 * requirement that the change be retained and queryable.
 *
 * So the split is: the schedule row is the typed record of the **schedule**,
 * and the audit row is the record of the **amendment**. They are written in one
 * transaction and linked — the audit context carries the `scheduleChangeId`
 * where there is one — so the two cannot disagree about whether an amendment
 * happened. `readEventChangeHistory` reads the audit stream, because it is the
 * only one of the two that sees every amendment.
 *
 * Making `schedule_changes` able to hold a description change is a migration,
 * and this work package owns no migration.
 *
 * ## The hold, and the seam it sits on (REQ-amend-hold)
 *
 * Saving an amendment sets `held_at` on every not-yet-sent message for the
 * event. A **hold**, not a cancellation: the obligation survives and Mission 4
 * decides whether each job resumes as it was, resumes carrying the corrected
 * details, or is replaced. `claimJobIn` in `./delivery` refuses to claim a held
 * job, which is what makes the hold a fact about delivery rather than a column
 * nobody consults — the failure it prevents is an invitation queued on Monday
 * arriving on Wednesday describing a venue that changed on Tuesday.
 *
 * A **cancellation** is the other case and takes the other action: W6 says
 * queued messages are cancelled with the event, and there is nothing for them
 * to resume into, because the event is terminal.
 *
 * ## What is owed, and what is sent
 *
 * When an amendment or a cancellation notifies, this module writes one
 * `notification_jobs` row per invitation, of type `schedule_change_notice` or
 * `cancellation_notice`. That row is the **obligation**: somebody is owed a
 * message about this event. It carries no channel and no `scheduled_for`,
 * because when it goes, over what, in which words, and what happens when it
 * fails are Mission 4's questions — the packet's own test is whether the answer
 * would change if the club moved from WhatsApp to email tomorrow, and every one
 * of those does.
 *
 * `template_variables` is left empty for a reason that is asserted by test
 * rather than described here: **the internal cancellation reason never enters a
 * recipient-facing payload** (D59, D76).
 *
 * ## Nothing here formats a sentence for a person
 *
 * The audience is the whole invited list, decliners included (OD-1/Q9), and a
 * yes stands — nobody is asked to answer twice (D51, D52). That is expressed by
 * selecting every invitation and touching no response row, not by a flag.
 */

// ---------------------------------------------------------------------------
// Vocabulary and refusals
// ---------------------------------------------------------------------------

export const AMEND_REQUIRES_APPROVED_MESSAGE = "Only an approved event can be amended.";
export const AMEND_REQUIRES_APPROVED_RULE = "event_amendment_requires_approved";

export const CANCEL_REQUIRES_APPROVED_MESSAGE = "Only an approved event can be cancelled.";
export const CANCEL_REQUIRES_APPROVED_RULE = "event_cancellation_requires_approved";

/** D60. The sentence a cancelled event answers every write with. */
export const EVENT_IS_CANCELLED_MESSAGE = "This event is cancelled. Nothing further can change it.";
export const EVENT_IS_CANCELLED_RULE = "event_cancellation_is_terminal";

export const NOTHING_CHANGED_MESSAGE = "Nothing has changed, so there is nothing to save.";
export const NOTHING_CHANGED_RULE = "event_amendment_is_empty";

export const AMENDMENT_NEEDS_A_DATE_MESSAGE =
  "An approved event has to have a date. Put one back before saving.";
export const AMENDMENT_NEEDS_A_DATE_RULE = "event_amendment_requires_a_date";

export const SILENCE_NEEDS_CONFIRMATION_MESSAGE =
  "Confirm that this change goes out to nobody before saving it.";
export const SILENCE_NEEDS_CONFIRMATION_RULE = "event_change_silence_unconfirmed";

export const CANCELLATION_NEEDS_A_REASON_MESSAGE = "Say why this event is off, for the record.";
export const CANCELLATION_NEEDS_A_REASON_RULE = "event_cancellation_requires_a_reason";

export const NOBODY_TO_NOTIFY_MESSAGE =
  "Nobody was invited to this event, so there is nobody to tell.";
export const NOBODY_TO_NOTIFY_RULE = "event_renotify_requires_an_audience";

export const NOTHING_TO_RENOTIFY_MESSAGE =
  "Nothing has changed about this event since it was approved.";
export const NOTHING_TO_RENOTIFY_RULE = "event_renotify_requires_a_change";

/** Recorded on a job the amendment held, so Mission 4 knows what it is holding. */
function holdReason(changes: readonly AmendmentChange[]): string {
  return `Event amended: ${changes.map((change) => change.label).join(", ")}.`;
}

/**
 * Recorded on a job the cancellation called off.
 *
 * D59 in the one place it is easiest to break: this string is written to the
 * job, and the job is the thing a delivery surface reads. It says the event was
 * cancelled and nothing else — the operator's internal reason is in
 * `events.decision_reason` and in the audit record, and goes nowhere near here.
 */
const JOB_CANCELLED_BY_CANCELLATION = "The event was cancelled.";

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

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
    const days = await readChaseThresholdDaysIn(tx, event.eventType);
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

/**
 * D75 and D77's per-type threshold, as stored.
 *
 * `event_type_settings` has one row for every one of the seven types, created
 * by LAN-151's migration and never created or deleted by an operator, so a
 * missing row is a schema fault rather than a state. It is still defended
 * against here, because returning a silent zero would make the recomputed
 * threshold read as "chase on the day", which is a plausible-looking wrong
 * answer rather than an obvious one.
 */
async function readChaseThresholdDaysIn(tx: Tx, eventType: string): Promise<number> {
  const result = await tx.query<{ days: number }>(
    `select chase_threshold_days as days
       from public.event_type_settings
      where event_type = $1::public.event_type`,
    [eventType],
  );
  const row = result.rows[0];
  if (!row) {
    throw new ConstraintViolated(
      "This kind of event has no chase threshold recorded, so a reschedule cannot be worked out.",
      { rule: "event_type_settings_missing" },
    );
  }
  return row.days;
}

// ---------------------------------------------------------------------------
// The change history — §4.13, and W5-05
// ---------------------------------------------------------------------------

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

async function readEventChangeHistoryIn(tx: Tx, eventId: string): Promise<EventChangeEntry[]> {
  const result = await tx.query<{
    id: string;
    action: string;
    occurred_at: Date;
    actor_name: string | null;
    context: Record<string, unknown> | null;
  }>(
    `select a.id, a.action, a.occurred_at,
            case
              when p.id is null then null
              when p.family_name is null then coalesce(nullif(btrim(p.known_as), ''), p.given_name)
              else coalesce(nullif(btrim(p.known_as), ''), p.given_name) || ' ' || p.family_name
            end as actor_name,
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

// ---------------------------------------------------------------------------
// Amend
// ---------------------------------------------------------------------------

export interface AmendmentOptions {
  /** The one decision, for the whole amendment. */
  notify: boolean;
  /**
   * Set only by a caller that has shown the operator the confirmation naming
   * how many people were told and what they were told. Ignored where no
   * confirmation is required.
   */
  silenceConfirmed?: boolean;
}

export interface AmendmentOutcome {
  event: EventDetail;
  changes: readonly AmendmentChange[];
  notified: boolean;
  /** Everyone invited, decliners included (OD-1/Q9). */
  recipients: number;
  /** Unsent messages this save put on hold (REQ-amend-hold). */
  messagesHeld: number;
  /** Change notifications this save made owing. Zero when it was silent. */
  noticesOwed: number;
  /** OD-1/Q6 — where the chase lands against the new date. */
  chaseThresholdOn: string | null;
}

/**
 * Amends an approved event in place. It does not leave `approved` at any point.
 *
 * Everything commits together, because every partial state is a specific
 * operational failure: an event carrying the new venue with its queued
 * invitations un-held is the exact defect REQ-amend-hold exists to prevent, and
 * a notice owed for a change that rolled back is a message about something that
 * did not happen.
 */
export async function amendApprovedEvent(
  actorPersonId: string,
  eventId: string,
  input: EventDraftInput,
  options: AmendmentOptions,
): Promise<AmendmentOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    // The lock first, before anything is read that a decision is made from —
    // `lockEventIn` documents why. It is what makes the guarded update below a
    // guard rather than a second opinion.
    const before = await lockEventIn(tx, eventId);
    assertNotTerminal(before);
    if (before.status !== "approved") {
      throw new InvalidTransition(
        `${AMEND_REQUIRES_APPROVED_MESSAGE} ${describeStatus(before.status)}`,
        { rule: AMEND_REQUIRES_APPROVED_RULE },
      );
    }

    // Invariant E1a. An approved event has a date, so an amendment that would
    // take it away is refused rather than allowed to reach an integrity error.
    if (input.scheduledOn === null) {
      throw new ConstraintViolated(AMENDMENT_NEEDS_A_DATE_MESSAGE, {
        rule: AMENDMENT_NEEDS_A_DATE_RULE,
      });
    }

    const changes = diffAmendment(snapshotOf(before), snapshotOfInput(input));
    if (changes.length === 0) {
      throw new ConstraintViolated(NOTHING_CHANGED_MESSAGE, { rule: NOTHING_CHANGED_RULE });
    }

    // Future in either arrangement. An event being moved *out* of the past
    // strands people exactly as much as one moved within the future, and an
    // amendment to a past event that puts it in the future is a reschedule
    // people have to hear about.
    const today = todayInClubZone();
    const isFuture =
      isFutureEvent(before, today) || isFutureEvent({ scheduledOn: input.scheduledOn }, today);

    if (!options.notify && silenceNeedsConfirmation(changes, { isFuture })) {
      if (options.silenceConfirmed !== true) {
        throw new ConstraintViolated(SILENCE_NEEDS_CONFIRMATION_MESSAGE, {
          rule: SILENCE_NEEDS_CONFIRMATION_RULE,
        });
      }
    }

    const term = deriveTermCoordinate(input.scheduledOn, await listTermWindowsIn(tx));

    // `status` is deliberately absent from the set list, and `where status =
    // 'approved'` is deliberately present. The first is REQ-amend-in-place; the
    // second refuses an amendment that raced a cancellation, rather than
    // resurrecting a cancelled event by writing its fields.
    const updated = await tx.query<{ id: string }>(
      `update public.events
          set name = $2, event_type = $3::public.event_type,
              scheduled_on = $4, starts_at = $5::time, ends_at = $6::time,
              delivery_mode = $7::public.event_delivery_mode, venue = $8,
              description = $9, required_equipment = $10, joining_url = $11,
              term_id = $12, week_number = $13, is_mandatory = $14,
              updated_at = now()
        where id = $1 and status = 'approved'
       returning id`,
      [
        eventId,
        input.name,
        input.eventType,
        input.scheduledOn,
        input.startsAt,
        input.endsAt,
        input.deliveryMode,
        input.venue,
        input.description,
        input.requiredEquipment,
        input.joiningUrl,
        term.termId,
        term.weekNumber,
        input.isMandatory,
      ],
    );

    if (updated.rowCount === 0) {
      throw new InvalidTransition(
        `${AMEND_REQUIRES_APPROVED_MESSAGE} ${describeStatus(before.status)}`,
        { rule: AMEND_REQUIRES_APPROVED_RULE },
      );
    }

    const scheduleChangeId = await recordScheduleChangeIn(tx, {
      actorPersonId,
      eventId,
      before,
      input,
      notified: options.notify,
    });

    const messagesHeld = await holdUnsentMessagesIn(tx, {
      eventId,
      actorPersonId,
      reason: holdReason(changes),
    });

    const audience = await readNotifyAudienceIn(tx, eventId);
    const noticesOwed = options.notify
      ? await recordNoticesOwedIn(tx, {
          eventId,
          jobType: "schedule_change_notice",
          noticeKey: `change:${scheduleChangeId ?? randomNoticeKey()}`,
        })
      : 0;

    const thresholdDays = await readChaseThresholdDaysIn(tx, input.eventType);
    const threshold = chaseThresholdOn(input.scheduledOn, thresholdDays);

    await recordAudit(tx, {
      actorPersonId,
      action: "event.amended",
      entityTable: "events",
      entityId: eventId,
      fromState: "approved",
      toState: "approved",
      context: {
        changes,
        notified: options.notify,
        recipients: audience.invited,
        silenceConfirmed: options.notify ? false : options.silenceConfirmed === true,
        messagesHeld,
        noticesOwed,
        scheduleChangeId,
        // OD-1/Q6, recorded rather than merely computed, so that "the chase was
        // recomputed against the new date" is a fact somebody can read back
        // three weeks later rather than an assertion about code.
        chaseThresholdDays: thresholdDays,
        chaseThresholdOn: threshold,
        rescheduled: changes.some((change) => change.field === "scheduledOn"),
      },
    });

    return {
      event: await readEventIn(tx, eventId),
      changes,
      notified: options.notify,
      recipients: audience.invited,
      messagesHeld,
      noticesOwed,
      chaseThresholdOn: threshold,
    };
  });
}

// ---------------------------------------------------------------------------
// Re-notify — D54, and W5's recovery path
// ---------------------------------------------------------------------------

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
    if (!history.some((entry) => entry.kind === "amended")) {
      throw new ConstraintViolated(NOTHING_TO_RENOTIFY_MESSAGE, {
        rule: NOTHING_TO_RENOTIFY_RULE,
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

// ---------------------------------------------------------------------------
// Cancel — W6
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// The writes the three actions share
// ---------------------------------------------------------------------------

/**
 * D60, in one place. Every write path asks this first.
 *
 * The acceptance evidence asks for the negative guarantee — "cannot be returned
 * to any other status by any route, including a direct service call" — so it is
 * a refusal at the top of each exported write rather than a shape each one
 * happens to have. The guarded `where status = 'approved'` behind it is the
 * concurrency half of the same rule.
 */
function assertNotTerminal(event: EventDetail): void {
  if (isTerminal(event.status)) {
    throw new InvalidTransition(EVENT_IS_CANCELLED_MESSAGE, { rule: EVENT_IS_CANCELLED_RULE });
  }
}

/**
 * REQ-amend-hold. Sets the hold on everything for this event that has not gone.
 *
 * `pending` and `ready` are waiting to go. `failed` is here too, and
 * deliberately: a failed job carries a Retry on the delivery screen, and a
 * retry after an amendment would send the superseded details as surely as a
 * first attempt would. `processing` is in flight and cannot be recalled;
 * `completed` has arrived, and nothing recalls that either.
 *
 * `held_at is null` keeps a second amendment from overwriting the first hold's
 * attribution — the hold is already on, and who put it there is the person who
 * first stopped the message.
 */
async function holdUnsentMessagesIn(
  tx: Tx,
  args: { eventId: string; actorPersonId: string; reason: string },
): Promise<number> {
  const held = await tx.query<{ id: string }>(
    `update public.notification_jobs
        set held_at = now(), held_reason = $2, held_by_person_id = $3, updated_at = now()
      where event_id = $1
        and held_at is null
        and status in ('pending', 'ready', 'failed')
     returning id`,
    [args.eventId, args.reason, args.actorPersonId],
  );
  return held.rowCount ?? 0;
}

/**
 * One obligation per invitation — the whole invited audience, decliners
 * included (OD-1/Q9).
 *
 * Selected from `invitations` rather than built from a list, so "everyone
 * invited" is a property of the statement. A yes-responder gets one and their
 * answer is not touched; a decliner gets one because a venue change might
 * reverse their answer; a non-responder's doubles as an ordinary prompt (D53).
 * None of that is a flag here, because none of it changes what this mission
 * writes — it changes what Mission 4 says, which is Mission 4's.
 *
 * `channel` and `scheduled_for` are left null on purpose. Which channel, and
 * when, are the two questions whose answers would change if the club moved to
 * email tomorrow.
 */
async function recordNoticesOwedIn(
  tx: Tx,
  args: {
    eventId: string;
    jobType: "schedule_change_notice" | "cancellation_notice";
    /** Distinguishes one notice batch from the next in the idempotency key. */
    noticeKey: string;
  },
): Promise<number> {
  const created = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        template_variables)
     select 'event:' || i.event_id::text || ':' || $2::text || ':invitation:' || i.id::text,
            $3::public.notification_job_type, 'pending', i.id, i.event_id,
            coalesce(i.person_id, m.person_id),
            '{}'::jsonb
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.event_id = $1
     on conflict (idempotency_key) do nothing
     returning id`,
    [args.eventId, args.noticeKey, args.jobType],
  );
  return created.rowCount ?? 0;
}

/**
 * Invariant E2's typed schedule history, where the amendment moved something it
 * can hold.
 *
 * Returns `null` — and writes nothing — for an amendment that moved only the
 * description, the equipment, the type, the joining link or
 * mandatory-versus-optional, because `schedule_changes_something_actually_changed`
 * refuses a row in which none of its own columns differ. That is the table
 * saying what it is for, not a gap to work around; the audit row records the
 * amendment either way, and the module header explains the split.
 *
 * `source` is `club`: an operator moved the club's own event. The other five
 * values describe a schedule the club did not set.
 *
 * `reason` is left null. OD-1/Q7 removed the amendment reason — the required
 * description carries any explanation, and it is what people will actually
 * read.
 */
async function recordScheduleChangeIn(
  tx: Tx,
  args: {
    actorPersonId: string;
    eventId: string;
    before: EventDetail;
    input: EventDraftInput;
    notified: boolean;
  },
): Promise<string | null> {
  const { before, input } = args;
  const moved =
    before.scheduledOn !== input.scheduledOn ||
    before.startsAt !== input.startsAt ||
    before.endsAt !== input.endsAt ||
    before.venue !== input.venue ||
    before.name !== input.name;

  if (!moved) return null;

  const inserted = await tx.query<{ id: string }>(
    `insert into public.schedule_changes
       (event_id, source, previous_scheduled_on, new_scheduled_on,
        previous_starts_at, new_starts_at, previous_ends_at, new_ends_at,
        previous_venue, new_venue, previous_name, new_name,
        notified, recorded_by_person_id)
     values ($1, 'club', $2, $3, $4::time, $5::time, $6::time, $7::time,
             $8, $9, $10, $11, $12, $13)
     returning id`,
    [
      args.eventId,
      before.scheduledOn,
      input.scheduledOn,
      before.startsAt,
      input.startsAt,
      before.endsAt,
      input.endsAt,
      before.venue,
      input.venue,
      before.name,
      input.name,
      args.notified,
      args.actorPersonId,
    ],
  );

  return inserted.rows[0].id;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function snapshotOf(event: EventDetail): AmendableEvent {
  return {
    name: event.name,
    eventType: event.eventType,
    scheduledOn: event.scheduledOn,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    deliveryMode: event.deliveryMode,
    venue: event.venue,
    description: event.description,
    requiredEquipment: event.requiredEquipment,
    joiningUrl: event.joiningUrl,
    isMandatory: event.isMandatory,
  };
}

function snapshotOfInput(input: EventDraftInput): AmendableEvent {
  return {
    name: input.name,
    eventType: input.eventType,
    scheduledOn: input.scheduledOn,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    deliveryMode: input.deliveryMode,
    venue: input.venue,
    description: input.description,
    requiredEquipment: input.requiredEquipment,
    joiningUrl: input.joiningUrl,
    isMandatory: input.isMandatory,
  };
}

/**
 * A batch identifier for a notice nothing else names.
 *
 * The idempotency key has to differ between two re-notifies of one event, or
 * the second would be swallowed by `on conflict do nothing` and the operator
 * would press a button that did nothing. An amendment uses its
 * `schedule_changes` row id where it has one, which is stable; this is the
 * fallback for the amendments and re-notifies that do not.
 */
function randomNoticeKey(): string {
  return crypto.randomUUID();
}

async function listTermWindowsIn(tx: Tx) {
  const result = await tx.query<{
    id: string;
    name: string;
    academic_year: string;
    starts_on: Date | string;
    ends_on: Date | string;
    first_week: number;
    last_week: number;
  }>(
    `select id, name::text as name, academic_year, starts_on, ends_on, first_week, last_week
       from public.terms
      order by starts_on desc`,
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    academicYear: row.academic_year,
    startsOn: asDay(row.starts_on),
    endsOn: asDay(row.ends_on),
    firstWeek: row.first_week,
    lastWeek: row.last_week,
  }));
}

function asDay(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  draft: "This event is a draft.",
  approved: "This event is approved.",
  cancelled: "This event is cancelled.",
});

function describeStatus(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? `This event is ${status}.`;
}

const requireActor = actorRequirement(
  "A change to an approved event has to name the operator who made it.",
);

export {
  chaseThresholdOn,
  cancellationDefaultNotify,
  defaultNotify,
  diffAmendment,
  hasMaterialChange,
  isFutureEvent,
  silenceNeedsConfirmation,
  cancellationSilenceNeedsConfirmation,
  type AmendableEvent,
  type AmendmentChange,
} from "./event-amendment-rules";
