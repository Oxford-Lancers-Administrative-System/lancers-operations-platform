/** The helpers and refusals `amend.ts`, `cancel.ts` and `read.ts` share. LAN-300 split of `event-amendment.ts`; see `index.ts`. */
import { ConstraintViolated, InvalidTransition, type Tx } from "@/lib/db";
import { actorRequirement } from "../actor";
import { isTerminal } from "../event-amendment-rules";
import type { EventDetail } from "../events";

export const AMEND_REQUIRES_APPROVED_MESSAGE = "Only an approved event can be amended.";
export const AMEND_REQUIRES_APPROVED_RULE = "event_amendment_requires_approved";

const EVENT_IS_CANCELLED_MESSAGE = "This event is cancelled. Nothing further can change it."; // D60
export const EVENT_IS_CANCELLED_RULE = "event_cancellation_is_terminal";

export const SILENCE_NEEDS_CONFIRMATION_MESSAGE =
  "Confirm that this change goes out to nobody before saving it.";
export const SILENCE_NEEDS_CONFIRMATION_RULE = "event_change_silence_unconfirmed";

// D60 in one place; every write path asks this first — cannot be returned to any other status.
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

// So two re-notifies of one event don't collide in the idempotency key (fallback for jobs with no schedule_changes row).
export function randomNoticeKey(): string {
  return crypto.randomUUID();
}

// One obligation per invitation, decliners included (OD-1/Q9). channel/scheduled_for left null on purpose — a known limitation (see relocations.md).
export async function recordNoticesOwedIn(
  tx: Tx,
  args: {
    eventId: string;
    jobType: "schedule_change_notice" | "cancellation_notice";
    noticeKey: string; // distinguishes one notice batch from the next in the idempotency key
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

// D75/D77's threshold, per template since LAN-265. A missing row is a schema fault, still defended against so a silent zero can't read as "chase on the day".
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
