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

function holdReason(changes: readonly AmendmentChange[]): string {
  return `Event amended: ${changes.map((change) => change.label).join(", ")}.`; // so Mission 4 knows what it is holding
}

// W8: a rung a shortened runway has no room for is cancelled, never a failure (REQ-late-approval).
const JOB_CANCELLED_BY_RESCHEDULE = "The rescheduled runway no longer has room for this reminder.";

export interface AmendmentOptions {
  notify: boolean; // the one decision, for the whole amendment
  silenceConfirmed?: boolean; // set only by a caller that has shown the confirmation; ignored where not required
  baseline?: AmendableEvent; // the event as the submitting form loaded it (LAN-244) — see relocations.md
}

export interface AmendmentOutcome {
  event: EventDetail;
  changes: readonly AmendmentChange[];
  notified: boolean;
  recipients: number; // everyone invited, decliners included (OD-1/Q9)
  messagesHeld: number; // unsent messages this save put on hold (REQ-amend-hold)
  noticesOwed: number; // change notifications this save made owing; zero when silent
  chaseThresholdOn: string | null; // OD-1/Q6 — where the chase lands against the new date
  rescheduled: boolean; // W8, REQ-reschedule-recomputes: true when this amendment moved the date or start
  recomputedDeadlineAt: Date | null; // the recomputed response deadline where rescheduled is true, else null
  messagesResumed: number; // held jobs this save released — resumed as they were, or onto a recomputed schedule
}

// Amends an approved event in place; never leaves `approved`. Commits as one unit (REQ-amend-hold).
export async function amendApprovedEvent(
  actorPersonId: string,
  eventId: string,
  input: EventDraftInput,
  options: AmendmentOptions,
): Promise<AmendmentOutcome> {
  requireActor(actorPersonId);

  return withTransaction(async (tx) => {
    const before = await lockEventIn(tx, eventId); // lock first, before any decision is read from — lockEventIn documents why
    assertNotTerminal(before);
    if (before.status !== "approved") {
      throw new InvalidTransition(
        `${AMEND_REQUIRES_APPROVED_MESSAGE} ${describeStatus(before.status)}`,
        { rule: AMEND_REQUIRES_APPROVED_RULE },
      );
    }

    // LAN-244: what the form actually asks to change, against the row under the lock — not the
    // whole snapshot it happens to be carrying. See relocations.md.
    const applied = options.baseline
      ? mergeAmendment(snapshotOf(before), options.baseline, snapshotOfInput(input))
      : snapshotOfInput(input);

    if (applied.scheduledOn === null) {
      throw new ConstraintViolated(AMENDMENT_NEEDS_A_DATE_MESSAGE, {
        rule: AMENDMENT_NEEDS_A_DATE_RULE,
      }); // invariant E1a: an approved event has a date
    }

    const changes = diffAmendment(snapshotOf(before), applied);
    if (changes.length === 0) {
      throw new ConstraintViolated(NOTHING_CHANGED_MESSAGE, { rule: NOTHING_CHANGED_RULE });
    }

    // future in either arrangement — moving an event out of the past strands people too
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

    // status absent (REQ-amend-in-place); where status='approved' refuses a race with a cancellation.
    const updated = await tx.query<{ id: string }>(
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

    // W8: startsAt counts as much as scheduledOn — the anchor every offset is measured from.
    const rescheduled = changes.some(
      (change) => change.field === "scheduledOn" || change.field === "startsAt",
    );

    // F-A2/F-C3: an approved event with no messaging plan yet needs the identical repair a
    // reschedule does, whether or not this amendment moved the date. See relocations.md.
    const hasMessagingPlan = await tx.query(
      "select 1 from public.event_messaging_plans where event_id = $1",
      [eventId],
    );
    const scheduleNeedsWork = rescheduled || hasMessagingPlan.rowCount === 0;
    const recomputed = scheduleNeedsWork
      ? await recomputeScheduleOnRescheduleIn(tx, eventId, applied)
      : null;

    const messagesResumed = await resumeHeldMessagesIn(tx, eventId); // W8 "held is never a resting state" — unconditional, after the recompute so times are already correct

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
        chaseThresholdDays: thresholdDays, // OD-1/Q6, recorded so the recompute is a fact somebody can read back, not an assertion about code
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

// REQ-amend-hold: holds everything unsent. pending/ready/failed held (Retry would send superseded
// details); processing/completed cannot be recalled. held_at is null keeps a second amendment from overwriting the first hold's attribution.
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

// W8: releases the hold unconditionally — notify decides only whether a notice is owed, never whether jobs resume. Runs after the recompute, so times are already correct.
async function resumeHeldMessagesIn(tx: Tx, eventId: string): Promise<number> {
  // All three columns together — notification_jobs_held_pairing (LAN-151) requires held_reason and
  // held_by_person_id null exactly when held_at is. History lives in the audit row instead.
  const resumed = await tx.query<{ id: string }>(
    `update public.notification_jobs
        set held_at = null, held_reason = null, held_by_person_id = null, updated_at = now()
      where event_id = $1 and held_at is not null
     returning id`,
    [eventId],
  );
  return resumed.rowCount ?? 0;
}

// F-A2/F-C3: backfills the invitation job approveEvent's insert would have created; idempotent.
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

// W8, REQ-reschedule-recomputes, OD-1/Q6 (ADR 0021's deliberate answer): recomputes the response
// deadline and everything counted from it, resolved asOf this amendment's own moment. Also the
// F-A2/F-C3 repair path for an event that has never had a messaging plan at all — see relocations.md
// for both defects and the four things this moves together (deadline/expiry, the frozen plan, the
// ladder, and each held job's own scheduled_for, cancelling any rung the shortened runway drops).
// Called before resumeHeldMessagesIn so a resumed job already carries its correct time.
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

  await freezeMessagingPlanIn(tx, eventId, plan, null); // re-freezes the plan; no actor, since a reschedule is not itself an approval

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

  await tx.query(
    // ladder_rung <> all(kept) is true of everything when kept is empty — a runway with room for
    // nothing but the invitation cancels every reminder.
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

// Invariant E2's typed schedule history, where the amendment moved something it can hold. Returns
// null (writes nothing) for a change to only description/equipment/type/joiningUrl/isMandatory —
// schedule_changes_something_actually_changed refuses a row where none of its own columns differ;
// the audit row still records the amendment. `source` is 'club'; `reason` is null (OD-1/Q7 removed
// it — the required description carries any explanation).
async function recordScheduleChangeIn(
  tx: Tx,
  args: {
    actorPersonId: string;
    eventId: string;
    before: EventDetail;
    applied: AmendableEvent; // LAN-244: what is actually being written, not what the form posted
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
