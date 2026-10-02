-- LAN-464 — the recruit event reminder (Brian, 2 October 2026).
--
-- A recruit who answers Yes to a recruitment event hears nothing further from
-- the app. Players can be told to check the calendar; recruits cannot, so they
-- get one WhatsApp reminder before the event (`recruit_event_reminder_v1`).
--
-- The reminder is the recruit cadence's third control, beside the two LAN-201
-- put on the Recruitment row (`recruit_invitation_lead_days`,
-- `recruit_follow_up_cadence_hours`): how many whole hours before the event it
-- goes. On by default at one hour; zero turns it off. It follows those two in
-- everything — recruitment-only on `messaging_schedules`, frozen onto
-- `event_messaging_plans` at approval and re-frozen by a reschedule
-- (`REQ-schedule-not-retroactive`).
--
-- No new job type and no column on `notification_jobs`: the reminder is a
-- `job_type = 'other'` row keyed `recruit-event-reminder:<event>:<invitation>`,
-- declared by the sweep at the reminder moment (`recruit-event-reminder.ts`),
-- on the attendance sheet's idiom.

begin;

-- ---------------------------------------------------------------------------
-- The setting, on the Recruitment row
-- ---------------------------------------------------------------------------

alter table public.messaging_schedules
  add column recruit_event_reminder_hours smallint;

-- Populated before the constraints, so they validate a table that already
-- satisfies them. One hour is Brian's default.
update public.messaging_schedules
   set recruit_event_reminder_hours = 1
 where event_type = 'recruitment';

alter table public.messaging_schedules
  add constraint messaging_schedules_recruit_event_reminder_is_recruitment_only check (
    (event_type = 'recruitment') = (recruit_event_reminder_hours is not null)),
  -- Zero is off. A week is the outer bound: a "reminder" further out than the
  -- invitation lead itself would no longer be one.
  add constraint messaging_schedules_recruit_event_reminder_is_sane check (
    recruit_event_reminder_hours is null or recruit_event_reminder_hours between 0 and 168);

comment on column public.messaging_schedules.recruit_event_reminder_hours is
  'LAN-464. Whole hours before a recruitment event at which recruits whose answer is Yes get one WhatsApp reminder. Zero is off. Null for every event type but recruitment.';

-- ---------------------------------------------------------------------------
-- The frozen copy, on the plan
-- ---------------------------------------------------------------------------

alter table public.event_messaging_plans
  add column recruit_event_reminder_hours smallint,
  add column recruit_event_reminder_at timestamptz;

-- Plans frozen before this migration carry a recruit ladder but no reminder
-- setting. They keep the schedule they were approved with, which had no
-- reminder: zero, off. A reschedule re-freezes from the live schedule.
update public.event_messaging_plans
   set recruit_event_reminder_hours = 0
 where recruit_invitation_at is not null;

-- The LAN-203 coherence rule, extended: the reminder setting is present
-- exactly when the recruit ladder is, and a reminder instant exists only where
-- the setting is on.
alter table public.event_messaging_plans
  drop constraint event_messaging_plans_recruit_ladder_is_coherent,
  add constraint event_messaging_plans_recruit_ladder_is_coherent check (
    (recruit_invitation_at is null) = (recruit_invitation_lead_days is null)
    and (recruit_invitation_at is null) = (recruit_follow_up_cadence_hours is null)
    and (recruit_invitation_at is null) = (recruit_dispatches_immediately is null)
    and (recruit_follow_up_at is null or recruit_invitation_at is not null)
    and (recruit_invitation_at is null) = (recruit_event_reminder_hours is null)
    and (recruit_event_reminder_at is null
         or (recruit_invitation_at is not null and recruit_event_reminder_hours > 0))
  );

comment on column public.event_messaging_plans.recruit_event_reminder_hours is
  'LAN-464. The frozen copy of messaging_schedules.recruit_event_reminder_hours. Zero is off. Null exactly when the plan carries no recruit ladder.';
comment on column public.event_messaging_plans.recruit_event_reminder_at is
  'LAN-464. When recruits whose answer is Yes are reminded: the event start less recruit_event_reminder_hours. Null when the reminder is off, or its moment had already passed when the plan was frozen.';

commit;
