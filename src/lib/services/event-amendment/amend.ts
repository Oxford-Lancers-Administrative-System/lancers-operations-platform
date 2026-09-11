import "server-only";

import { ConstraintViolated, InvalidTransition, withTransaction, type Tx } from "@/lib/db";
import { todayInClubZone } from "@/lib/club-time";
import { recordAudit } from "../audit";
import { deriveTermCoordinate, type EventDraftInput } from "../event-input";
import { lockEventIn, readEventIn, type EventDetail } from "../events";
import { freezeMessagingPlanIn, resolveMessagingPlanIn } from "../messaging-schedule";
import { scheduleEventLadderIn } from "../messaging-scheduler";
import {
  chaseThresholdOn,
  diffAmendment,
  isFutureEvent,
  mergeAmendment,
  silenceNeedsConfirmation,
  type AmendableEvent,
  type AmendmentChange,
} from "../event-amendment-rules";
import { readNotifyAudienceIn } from "./read";
import {
  AMEND_REQUIRES_APPROVED_MESSAGE,
  AMEND_REQUIRES_APPROVED_RULE,
  assertNotTerminal,
  describeStatus,
  randomNoticeKey,
  readChaseThresholdDaysIn,
  recordNoticesOwedIn,
  requireActor,
  SILENCE_NEEDS_CONFIRMATION_MESSAGE,
  SILENCE_NEEDS_CONFIRMATION_RULE,
} from "./shared";

/**
 * Amending an approved event in place (REQ-amend-in-place, W5) and the
 * reschedule recompute (W8, `REQ-reschedule-recomputes`) only this path
 * needs. LAN-300 split of `event-amendment.ts`; see `./index`.
 */

const NOTHING_CHANGED_MESSAGE = "Nothing has changed, so there is nothing to save.";
export const NOTHING_CHANGED_RULE = "event_amendment_is_empty";

const AMENDMENT_NEEDS_A_DATE_MESSAGE =
  "An approved event has to have a date. Put one back before saving.";
export const AMENDMENT_NEEDS_A_DATE_RULE = "event_amendment_requires_a_date";

/** Recorded on a job the amendment held, so Mission 4 knows what it is holding. */
function holdReason(changes: readonly AmendmentChange[]): string {
  return `Event amended: ${changes.map((change) => change.label).join(", ")}.`;
}

/**
 * Recorded on a rung a reschedule's shortened runway no longer has room for.
 *
 * W8, `REQ-reschedule-recomputes`. Not a failure — the runway shrank the same
 * way a late approval's does, and `REQ-late-approval`'s own rule applies: the
 * ladder loses its email rung first, then its later WhatsApp reminders, before
 * it loses the invitation. A job cancelled for this reason must never appear
 * as a delivery failure, exactly as a cancellation's own jobs must not.
 */
const JOB_CANCELLED_BY_RESCHEDULE = "The rescheduled runway no longer has room for this reminder.";

export interface AmendmentOptions {
  /** The one decision, for the whole amendment. */
  notify: boolean;
  /**
   * Set only by a caller that has shown the operator the confirmation naming
   * how many people were told and what they were told. Ignored where no
   * confirmation is required.
   */
  silenceConfirmed?: boolean;
  /**
   * The event as the form that is submitting loaded it — LAN-244.
   *
   * Given it, this call amends only the fields that differ from it, and every
   * other field keeps whatever the row holds now. Omitted, `input` is applied
   * whole, which is the behaviour that let a stale second tab revert a field it
   * never touched and record the reversion as somebody's amendment. Every
   * screen passes it; it is optional only so that a service-level test may
   * state an amendment as one complete intention.
   */
  baseline?: AmendableEvent;
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
  /** W8, `REQ-reschedule-recomputes`. True when this amendment moved the date or start. */
  rescheduled: boolean;
  /** The recomputed response deadline, where `rescheduled` is true — else `null`. */
  recomputedDeadlineAt: Date | null;
  /** Held jobs this save released — resumed as they were, or onto a recomputed schedule. */
  messagesResumed: number;
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

    // LAN-244. What this form actually asks to change, against the row as it
    // stands under the lock — not the whole snapshot it happens to be carrying.
    // `mergeAmendment` explains why a form that never touched a field must not
    // be able to revert it, and the history entry below is built from `applied`
    // for the same reason: it must describe the amendment that happened.
    const applied = options.baseline
      ? mergeAmendment(snapshotOf(before), options.baseline, snapshotOfInput(input))
      : snapshotOfInput(input);

    // Invariant E1a. An approved event has a date, so an amendment that would
    // take it away is refused rather than allowed to reach an integrity error.
    if (applied.scheduledOn === null) {
      throw new ConstraintViolated(AMENDMENT_NEEDS_A_DATE_MESSAGE, {
        rule: AMENDMENT_NEEDS_A_DATE_RULE,
      });
    }

    const changes = diffAmendment(snapshotOf(before), applied);
    if (changes.length === 0) {
      throw new ConstraintViolated(NOTHING_CHANGED_MESSAGE, { rule: NOTHING_CHANGED_RULE });
    }

    // Future in either arrangement. An event being moved *out* of the past
    // strands people exactly as much as one moved within the future, and an
    // amendment to a past event that puts it in the future is a reschedule
    // people have to hear about.
    const today = todayInClubZone();
    const isFuture =
      isFutureEvent(before, today) || isFutureEvent({ scheduledOn: applied.scheduledOn }, today);

    if (!options.notify && silenceNeedsConfirmation(changes, { isFuture })) {
      if (options.silenceConfirmed !== true) {
        throw new ConstraintViolated(SILENCE_NEEDS_CONFIRMATION_MESSAGE, {
          rule: SILENCE_NEEDS_CONFIRMATION_RULE,
        });
      }
    }

    const term = deriveTermCoordinate(applied.scheduledOn, await listTermWindowsIn(tx));

    // `status` is deliberately absent from the set list, and `where status =
    // 'approved'` is deliberately present. The first is REQ-amend-in-place; the
    // second refuses an amendment that raced a cancellation, rather than
    // resurrecting a cancelled event by writing its fields.
    const updated = await tx.query<{ id: string }>(
      // Neither `template_id` nor `event_type` is in the set list, since
      // LAN-265: an amendment cannot change what kind of event this is (see
      // `AMENDABLE_FIELDS`), and the two columns are held equal to the
      // template's own row by `events_template_fkey`.
      `update public.events
          set name = $2,
              scheduled_on = $3, starts_at = $4::time, ends_at = $5::time,
              delivery_mode = $6::public.event_delivery_mode, venue = $7,
              description = $8, required_equipment = $9, joining_url = $10,
              term_id = $11, week_number = $12, is_mandatory = $13,
              updated_at = now()
        where id = $1 and status = 'approved'
       returning id`,
      [
        eventId,
        applied.name,
        applied.scheduledOn,
        applied.startsAt,
        applied.endsAt,
        applied.deliveryMode,
        applied.venue,
        applied.description,
        applied.requiredEquipment,
        applied.joiningUrl,
        term.termId,
        term.weekNumber,
        applied.isMandatory,
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
      applied,
      notified: options.notify,
    });

    const messagesHeld = await holdUnsentMessagesIn(tx, {
      eventId,
      actorPersonId,
      reason: holdReason(changes),
    });

    // W8, REQ-reschedule-recomputes. `startsAt` is here as well as
    // `scheduledOn` because the anchor every offset is measured from is the
    // event's start instant, not its date alone — moving the start two hours
    // later without moving the date is exactly as much a reschedule as moving
    // the date is. `endsAt` is not: nothing in the messaging plan reads it.
    const rescheduled = changes.some(
      (change) => change.field === "scheduledOn" || change.field === "startsAt",
    );

    // F-A2/F-C3. `rescheduled` alone used to decide whether this ran, which
    // is why amending one of the 97 approved-but-plan-less events into a new
    // venue, still on the same date, froze `event_messaging_plans` from
    // nowhere and created nothing (F-C3), and an event whose date an operator
    // never touches had no route back to a working ladder at all (F-A2). An
    // approved event that has never been given a plan needs the identical
    // repair a reschedule already does — resolve one against its own current
    // schedule, freeze it, and create the jobs it promises — whether or not
    // this particular amendment moved the date.
    const hasMessagingPlan = await tx.query(
      "select 1 from public.event_messaging_plans where event_id = $1",
      [eventId],
    );
    const scheduleNeedsWork = rescheduled || hasMessagingPlan.rowCount === 0;
    const recomputed = scheduleNeedsWork
      ? await recomputeScheduleOnRescheduleIn(tx, eventId, applied)
      : null;

    // W8, "Held is never a resting state". Unconditional, and after the
    // recompute above so a resumed job already carries its correct time.
    const messagesResumed = await resumeHeldMessagesIn(tx, eventId);

    const audience = await readNotifyAudienceIn(tx, eventId);
    const noticesOwed = options.notify
      ? await recordNoticesOwedIn(tx, {
          eventId,
          jobType: "schedule_change_notice",
          noticeKey: `change:${scheduleChangeId ?? randomNoticeKey()}`,
        })
      : 0;

    const thresholdDays = await readChaseThresholdDaysIn(tx, applied.templateId);
    const threshold = chaseThresholdOn(applied.scheduledOn, thresholdDays);

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
        messagesResumed,
        noticesOwed,
        scheduleChangeId,
        // OD-1/Q6, recorded rather than merely computed, so that "the chase was
        // recomputed against the new date" is a fact somebody can read back
        // three weeks later rather than an assertion about code.
        chaseThresholdDays: thresholdDays,
        chaseThresholdOn: threshold,
        rescheduled,
        recomputedDeadlineAt: recomputed?.responseDeadlineAt.toISOString() ?? null,
      },
    });

    return {
      event: await readEventIn(tx, eventId),
      changes,
      notified: options.notify,
      recipients: audience.invited,
      messagesHeld,
      messagesResumed,
      noticesOwed,
      chaseThresholdOn: threshold,
      rescheduled,
      recomputedDeadlineAt: recomputed?.responseDeadlineAt ?? null,
    };
  });
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
 * W8, `REQ-resume-follows-notify` and "Held is never a resting state".
 *
 * Releases the hold `holdUnsentMessagesIn` places, unconditionally — the
 * operator's notify choice decides whether a *change notice* is owed
 * (`recordNoticesOwedIn`, `./shared`), never whether the held jobs themselves
 * come back. W8's own workflow document is explicit that both branches resume
 * the same way: "Re-notify chosen — the held messages resume… Re-notify not
 * chosen — the held messages resume unchanged." The difference the notify
 * choice makes is entirely in the extra notice job; this function does not
 * read `options.notify` because there is nothing here for it to decide.
 *
 * Runs after `recomputeScheduleOnRescheduleIn` when this amendment is a
 * reschedule, so a job resumes at its recomputed `scheduled_for` rather than
 * at the one it was queued with before the date moved.
 */
async function resumeHeldMessagesIn(tx: Tx, eventId: string): Promise<number> {
  // All three, together — `notification_jobs_held_pairing`'s own constraint
  // (LAN-151) requires `held_reason` and `held_by_person_id` to be null
  // exactly when `held_at` is, so a resumed job has to read as "never held"
  // by every column at once rather than carrying history the database itself
  // refuses to store half of. The audit trail (`messagesHeld`,
  // `messagesResumed` on the amendment's own audit row) is where that history
  // lives instead.
  const resumed = await tx.query<{ id: string }>(
    `update public.notification_jobs
        set held_at = null, held_reason = null, held_by_person_id = null, updated_at = now()
      where event_id = $1 and held_at is not null
     returning id`,
    [eventId],
  );
  return resumed.rowCount ?? 0;
}

/**
 * F-A2/F-C3. Backfills the one `invitation`-type job `approveEvent`'s own
 * insert would have created, for an event whose approval predates that
 * insert entirely — the oldest shape of "approved before the messaging
 * feature existed" F-A2 names, where `event_messaging_plans` is missing and
 * so is every job, not only the ladder. Identical to `approveEvent`'s own
 * insert (`event-approval.ts`), and idempotent with `on conflict do nothing`
 * for the ordinary case, an event that already has one.
 */
async function backfillInvitationJobsIn(tx: Tx, eventId: string): Promise<number> {
  const created = await tx.query<{ id: string }>(
    `insert into public.notification_jobs
       (idempotency_key, job_type, status, invitation_id, event_id, person_id,
        channel, template_variables)
     select 'event:' || i.event_id::text || ':invitation:' || i.capacity::text
              || ':' || i.participant_id::text,
            'invitation', 'pending', i.id, i.event_id,
            coalesce(i.person_id, m.person_id),
            'whatsapp', '{}'::jsonb
       from public.invitations i
       left join public.season_memberships m on m.id = i.season_membership_id
      where i.event_id = $1
     on conflict (idempotency_key) do nothing
     returning id`,
    [eventId],
  );
  return created.rowCount ?? 0;
}

/**
 * W8, `REQ-reschedule-recomputes` and `OD-1`/`Q6`. The deliberate answer ADR
 * 0021 left open: a reschedule recomputes the response deadline and
 * everything counted from it, using W7's own rules — `resolveMessagingPlanIn`,
 * the identical arithmetic approval runs, resolved `asOf` the amendment's own
 * moment rather than the original approval's. A game moved three weeks later
 * gets its full runway back rather than inheriting a deadline that has
 * already passed, and one moved to next week gets `REQ-late-approval`'s
 * WhatsApp-only shortened ladder for exactly the reason a late approval does:
 * the runway is what it is, computed from now.
 *
 * ## F-A2/F-C3's second trigger
 *
 * `amendApprovedEvent` also calls this for an amendment that never touched
 * the date at all, whenever the event has no `event_messaging_plans` row yet
 * — an event approved before LAN-169 shipped, or one the seed deliberately
 * left plan-less. Nothing below reads `rescheduled`; every step is exactly as
 * correct starting from "never had a plan" as it is starting from "had one at
 * an earlier time", because a missing plan and jobs behave, to this function,
 * like a plan and jobs that are simply due to move onto the current schedule.
 *
 * Four things move together:
 *
 *   * `events.response_deadline_at` and every `invitations.expires_at` —
 *     the single deadline every invitee's answer is measured against.
 *   * `event_messaging_plans` — re-frozen via `freezeMessagingPlanIn`'s own
 *     `on conflict (event_id) do update`, which exists for exactly this call.
 *     `raiseDueEscalations` reads this row fresh on every sweep tick, so
 *     re-freezing it is the whole of fixing the escalation's own timing going
 *     forward — nothing else references the old one.
 *   * `scheduleEventLadderIn` — F-A2/F-C3. `freezeMessagingPlanIn` only ever
 *     wrote the plan's own description; nothing called this, the function
 *     that actually anchors the invitation job and inserts the reminder rows,
 *     unless the event was being approved for the first time. An event with
 *     no plan therefore has no ladder either, and this is what gives it one:
 *     idempotent by the same `on conflict (idempotency_key) do nothing` a
 *     fresh approval leans on, and guarded (see its own doc comment) against
 *     rewriting an invitation job that has already gone.
 *   * The **held** invitation/reminder jobs' `scheduled_for` (and
 *     `next_attempt_at`, if a backoff was already ticking), moved onto the
 *     new plan's own rung times, matched by `ladder_rung`. A rung the new,
 *     shorter runway no longer schedules is cancelled rather than left to
 *     fire against a ladder that no longer has it — never as a failure
 *     (`JOB_CANCELLED_BY_RESCHEDULE`), for the identical reason a
 *     cancelled event's jobs are not. This is also what re-times the rows
 *     `scheduleEventLadderIn` just inserted for a previously plan-less event,
 *     onto exactly the same rung times it used to create them — a harmless
 *     restatement there, and the only step that matters for a genuine
 *     reschedule's pre-existing rows.
 *
 * Called before `resumeHeldMessagesIn`, so a job resumes already carrying its
 * correct time rather than resuming once and moving again a statement later.
 */
async function recomputeScheduleOnRescheduleIn(
  tx: Tx,
  eventId: string,
  input: AmendableEvent,
): Promise<{ responseDeadlineAt: Date }> {
  const plan = await resolveMessagingPlanIn(
    tx,
    { templateId: input.templateId, scheduledOn: input.scheduledOn, startsAt: input.startsAt },
    new Date(),
  );

  await tx.query(
    `update public.events set response_deadline_at = $2::timestamptz, updated_at = now() where id = $1`,
    [eventId, plan.responseDeadlineAt],
  );
  await tx.query(`update public.invitations set expires_at = $2::timestamptz where event_id = $1`, [
    eventId,
    plan.responseDeadlineAt,
  ]);

  // Re-freezes `event_messaging_plans` and fixes the escalation threshold
  // for every future sweep — no actor to attribute this write to, since a
  // reschedule is not itself an approval.
  await freezeMessagingPlanIn(tx, eventId, plan, null);

  // F-A2/F-C3. See the doc comment above. Both are no-ops (`on conflict do
  // nothing`) for an event that already has its invitation job and every
  // reminder rung; together they are the whole of the repair for one that
  // predates LAN-78's own insert and has neither.
  await backfillInvitationJobsIn(tx, eventId);
  await scheduleEventLadderIn(tx, eventId, plan);

  const keptRungs = plan.rungs.map((rung) => rung.rung);
  for (const rung of plan.rungs) {
    await tx.query(
      `update public.notification_jobs
          set scheduled_for = $3::timestamptz,
              next_attempt_at = case when next_attempt_at is not null then $3::timestamptz
                                      else next_attempt_at end,
              channel = $4::public.notification_channel,
              updated_at = now()
        where event_id = $1 and ladder_rung = $2
          and status in ('pending', 'ready', 'failed')`,
      [eventId, rung.rung, rung.at, rung.channel],
    );
  }

  // A rung the shortened runway dropped entirely — `ladder_rung <> all(kept)`
  // is true of everything when `kept` is empty, which is correct: a runway
  // with room for nothing but the invitation cancels every reminder.
  await tx.query(
    `update public.notification_jobs
        set status = 'cancelled', cancelled_reason = $2, claimed_at = null, claimed_by = null,
            updated_at = now()
      where event_id = $1 and job_type in ('invitation', 'reminder') and ladder_rung is not null
        and ladder_rung <> all($3::smallint[])
        and status in ('pending', 'ready', 'failed')`,
    [eventId, JOB_CANCELLED_BY_RESCHEDULE, keptRungs],
  );

  return { responseDeadlineAt: plan.responseDeadlineAt };
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
    /** LAN-244: what is actually being written, not what the form posted. */
    applied: AmendableEvent;
    notified: boolean;
  },
): Promise<string | null> {
  const { before, applied: input } = args;
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

function snapshotOf(event: EventDetail): AmendableEvent {
  return {
    name: event.name,
    templateId: event.templateId,
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
    templateId: input.templateId,
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
