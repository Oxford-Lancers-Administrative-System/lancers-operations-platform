/**
 * The helpers and refusals `amend.ts`, `cancel.ts` (cancel and re-notify) and
 * `read.ts` share. LAN-300 split of `event-amendment.ts`; see `index.ts` for
 * the module's own header.
 */
import { ConstraintViolated, InvalidTransition, type Tx } from "@/lib/db";
import { actorRequirement } from "../actor";
import { isTerminal } from "../event-amendment-rules";
import type { EventDetail } from "../events";

export const AMEND_REQUIRES_APPROVED_MESSAGE = "Only an approved event can be amended.";
export const AMEND_REQUIRES_APPROVED_RULE = "event_amendment_requires_approved";

/** D60. The sentence a cancelled event answers every write with. */
const EVENT_IS_CANCELLED_MESSAGE = "This event is cancelled. Nothing further can change it.";
export const EVENT_IS_CANCELLED_RULE = "event_cancellation_is_terminal";

export const SILENCE_NEEDS_CONFIRMATION_MESSAGE =
  "Confirm that this change goes out to nobody before saving it.";
export const SILENCE_NEEDS_CONFIRMATION_RULE = "event_change_silence_unconfirmed";

/**
 * D60, in one place. Every write path asks this first.
 *
 * The acceptance evidence asks for the negative guarantee — "cannot be returned
 * to any other status by any route, including a direct service call" — so it is
 * a refusal at the top of each exported write rather than a shape each one
 * happens to have. The guarded `where status = 'approved'` behind it is the
 * concurrency half of the same rule.
 */
export function assertNotTerminal(event: EventDetail): void {
  if (isTerminal(event.status)) {
    throw new InvalidTransition(EVENT_IS_CANCELLED_MESSAGE, { rule: EVENT_IS_CANCELLED_RULE });
  }
}

const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  draft: "This event is a draft.",
  approved: "This event is approved.",
  cancelled: "This event is cancelled.",
});

export function describeStatus(status: string): string {
  return STATUS_DESCRIPTIONS[status] ?? `This event is ${status}.`;
}

export const requireActor = actorRequirement(
  "A change to an approved event has to name the operator who made it.",
);

/**
 * A batch identifier for a notice nothing else names.
 *
 * The idempotency key has to differ between two re-notifies of one event, or
 * the second would be swallowed by `on conflict do nothing` and the operator
 * would press a button that did nothing. An amendment uses its
 * `schedule_changes` row id where it has one, which is stable; this is the
 * fallback for the amendments and re-notifies that do not.
 */
export function randomNoticeKey(): string {
  return crypto.randomUUID();
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
 * `channel` and `scheduled_for` are left null on purpose, and — checked while
 * building W8 — that purpose still holds. The obvious next step, giving these
 * a channel and letting the sweep claim them, runs the same `claimJobIn` path
 * every other job takes, and that path unconditionally mints an RSVP token
 * (`issueTokenIn`) before it will send anything. `issueTokenIn` refuses a
 * **cancelled** event exactly as it refuses a started one — so a
 * `cancellation_notice`, whose event is cancelled by definition, would throw
 * on every claim, roll back before `attempt_count` increments, and be
 * reclaimed by the very next tick forever: the identical unbounded-retry
 * failure `readDueJobs`'s own comment documents for a started event's player
 * rungs, reached here by a different door. A notice needs a send path that
 * mints no token — the escalation's `dispatchEscalationJob` is the existing
 * precedent for exactly that shape — and building one is real, undone work
 * this package did not reach; see the PR for the limitation recorded against
 * it rather than a silent implementation here.
 */
export async function recordNoticesOwedIn(
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
 * D75 and D77's threshold, as stored — per template since LAN-265.
 *
 * `event_type_settings` has one row for every template, created with it by
 * `createEventTemplate` and deleted with it by the cascade, so a missing row is
 * a schema fault rather than a state. It is still defended against here, because
 * returning a silent zero would make the recomputed threshold read as "chase on
 * the day", which is a plausible-looking wrong answer rather than an obvious
 * one.
 */
export async function readChaseThresholdDaysIn(tx: Tx, templateId: string): Promise<number> {
  const result = await tx.query<{ days: number }>(
    `select chase_threshold_days as days
       from public.event_type_settings
      where template_id = $1::uuid`,
    [templateId],
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
