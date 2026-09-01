-- LAN-203 — WP-recruitment-messaging, mission M-RECRUITMENT, epoch E-2.
--
-- The mission's second migration-owning package, per LAN-203 Amendment 2
-- (2026-09-01). LAN-201 scoped itself to the mission's only migration and
-- stopped short of two things this package needs — its own header says so,
-- in words: "the cycle itself is WP-recruitment-messaging's."
--
-- Two gaps, verified against the live catalogue (not the migration files) on
-- 2026-09-01 and re-verified by the Lead the same day.
--
-- ## Gap 1 — `event_messaging_plans` carries no recruit fields
--
-- That table is the plan an approval freezes, and it has seventeen columns,
-- every one of them the player ladder. `REQ-approval-shows-both-ladders`
-- needs the recruits' rungs frozen on that same row, not recomputed from
-- `messaging_schedules` at render time — that table exists precisely so an
-- operator shortening the cadence on Tuesday cannot retroactively change what
-- Monday's already-approved event does (`REQ-schedule-not-retroactive`). Six
-- columns below carry the recruit ladder's own anchor, cadence and resolved
-- instants, on the exact "copy, not a reference" idiom the player columns
-- already use.
--
-- ## Gap 2 — the recruitment cycle has nowhere to live
--
-- `messaging_schedules` is exactly seven rows keyed by `event_type`, and the
-- cycle's steps fire on capture, not on an event, so they do not fit a row
-- keyed that way. Packet amendment 1 (Brian, 2026-08-31) withdrew
-- `recruit_details_ask` — the welcome now carries the sign-up form and is
-- itself the ask — so the cycle W10's own table describes collapses from five
-- steps to four: welcome, one reminder to finish the form, the
-- football-background ask, and its one reminder (off by default). Each is
-- individually switchable, on the same "complete, no default arm" idiom
-- `messaging_schedules` already uses — a Freshers' push and a mid-season push
-- are the same machine configured differently (W10), not two stored cycles.
--
-- ## What this migration deliberately does NOT add
--
-- No fifth `notification_job_type` value, and no `prospect_id` column on
-- `notification_jobs`. The frozen model's job-type vocabulary is closed
-- (invariant M4's sibling rule for job types), and `notification_jobs`
-- already accepts a `person_id`-only row with no `invitation_id` or
-- `event_id` — exactly the shape `job_type = 'escalation'` already uses. A
-- capture-triggered send is that same shape, discriminated by
-- `template_variables`, which is why no schema change is needed to declare
-- one. Wiring the scheduler's claim/dispatch path to send them, and the
-- capture-flow trigger that calls it, are separable work with no caller in
-- `main` today (LAN-205/LAN-206) and are not part of this migration.
--
-- No recruit escalation. `REQ-two-ladders` and `REQ-never-harsh` are explicit
-- that recruits are never escalated to the President, so there is no
-- `recruit_escalation_hours` or `recruit_escalation_at` column to add.
--
-- No second `messaging_schedules` row for recruitment. LAN-201 already added
-- `recruit_invitation_lead_days` and `recruit_follow_up_cadence_hours` to
-- that table's Recruitment row (`DEC-split-on-the-schedule`); this migration
-- only adds the frozen-copy columns those two feed at approval.

begin;

-- ---------------------------------------------------------------------------
-- Part 1 — the recruit ladder joins the frozen plan
-- ---------------------------------------------------------------------------

-- `REQ-approval-shows-both-ladders`, `REQ-schedule-not-retroactive`. The same
-- "copy, not a reference" idiom the player columns already use: these are
-- resolved once, at approval, from `messaging_schedules.recruit_*` and the
-- event's own start, and never recomputed.
--
-- All six are nullable together, because most approved events carry no
-- recruit audience at all — `event_messaging_plans` has one row per
-- *approved event*, not per Recruitment-typed event, and a practice or a game
-- has nothing to put here. `recruit_invitation_at` is the discriminator: null
-- means "this event's plan carries no recruit ladder", exactly as
-- `escalation_at` already means "this event will never escalate" on the
-- player side.
alter table public.event_messaging_plans
  add column recruit_invitation_lead_days smallint,
  add column recruit_follow_up_cadence_hours smallint,
  add column recruit_invitation_at timestamptz,
  add column recruit_dispatches_immediately boolean,
  -- Null when the runway between the recruit invitation and the event's
  -- shared response deadline could not carry even one follow-up — the same
  -- "available" arithmetic the player ladder already uses, at a cap of one
  -- rung rather than the policy's whatsapp/email counts. Recruits are never
  -- escalated, so there is no equivalent of `late_approval` here: a runway
  -- too short for the follow-up simply omits it, exactly as `REQ-never-harsh`
  -- asks — there is nothing left to compress into WhatsApp-only, because the
  -- recruit ladder was WhatsApp-only from the start.
  add column recruit_follow_up_at timestamptz;

alter table public.event_messaging_plans
  add constraint event_messaging_plans_recruit_ladder_is_coherent check (
    (recruit_invitation_at is null) = (recruit_invitation_lead_days is null)
    and (recruit_invitation_at is null) = (recruit_follow_up_cadence_hours is null)
    and (recruit_invitation_at is null) = (recruit_dispatches_immediately is null)
    -- A follow-up can only exist once there is an invitation for it to follow.
    and (recruit_follow_up_at is null or recruit_invitation_at is not null)
  );

comment on column public.event_messaging_plans.recruit_invitation_at is
  'REQ-approval-shows-both-ladders. Null means this event''s plan carries no recruit ladder — most approved events do not. Never recomputed from messaging_schedules (REQ-schedule-not-retroactive).';
comment on column public.event_messaging_plans.recruit_follow_up_at is
  'The recruit ladder''s one permitted follow-up (REQ-two-ladders, REQ-never-harsh — no escalation, no second reminder). Null when the shared response deadline left no runway for it, or when there is no recruit ladder at all.';

-- ---------------------------------------------------------------------------
-- Part 2 — the recruitment cycle
-- ---------------------------------------------------------------------------

-- `REQ-recruitment-cycle`. Four steps, fixed and closed — a new step is a
-- product decision, not a row an operator adds — on the same "complete over
-- the enum, no default arm" idiom `messaging_schedules` already uses for the
-- seven event types. Named for what the recruit actually receives rather than
-- for the withdrawn `recruit_details_ask`, since packet amendment 1 (Brian,
-- 2026-08-31) means the welcome is now that ask and nothing separate fires a
-- day after capture to be a reminder *of*.
create type public.recruitment_cycle_step as enum (
  'welcome',
  'details_reminder',
  'interest_ask',
  'interest_reminder'
);

comment on type public.recruitment_cycle_step is
  'REQ-recruitment-cycle, packet amendment 1. The four capture-triggered sends left once recruit_details_ask was withdrawn: recruit_welcome (carries the sign-up form and is itself the ask), one reminder to finish it, the football-background ask, and its one reminder (off by default).';

create table public.recruitment_cycle_steps (
  step public.recruitment_cycle_step primary key,

  -- `REQ-recruitment-cycle`: "each of which can be turned off, per cycle."
  -- `welcome` fires only on the walk-up and operator-add doors (never QR,
  -- W10's own table) — that door check is the service layer's, because it
  -- depends on how a recruit was captured rather than on anything this row
  -- carries; this toggle is the operator's own further "off" on top of that.
  enabled boolean not null,

  -- Whole hours after capture. Hours rather than days, matching
  -- `reminder_cadence_hours` and the two recruit columns LAN-201 already put
  -- on `messaging_schedules` — a cycle step is a single fixed offset, not a
  -- day count measured from an event's own start, so there is no separate
  -- "lead" and "cadence" pair to keep apart here.
  offset_hours smallint not null,

  updated_at timestamptz not null default now(),
  updated_by_person_id uuid references public.people (id) on delete restrict,

  constraint recruitment_cycle_steps_offset_is_sane check (offset_hours between 0 and 2160)
);

comment on table public.recruitment_cycle_steps is
  'REQ-recruitment-cycle. Exactly four rows, seeded below and never inserted or deleted by the application — the same complete-over-the-enum, no-default-arm idiom messaging_schedules already uses. Administered on /operate/admin/messaging as its own section (W10, "the same page, not a new one").';
comment on column public.recruitment_cycle_steps.offset_hours is
  'Whole hours after capture. welcome is 0 (immediate, walk-up and operator-add doors only); the other three are the seeded defaults below and are editable here — this table exists so an operator can change them without a deploy.';

-- Seeded defaults, in the club's own words: the welcome fires on capture; the
-- reminder to finish the form fires where the withdrawn recruit_details_ask
-- and its own 3-day reminder together used to land (1 + 3 = 4 days), since
-- the ask itself no longer sends but the reminder that followed it still
-- should; the football-background ask keeps W10's own "3 days after capture"
-- unchanged; its reminder keeps W10's own "3 days later" measured from the
-- ask, i.e. 6 days after capture. All four are ordinary data from here on —
-- an operator changes any of them on the messaging schedule page with no
-- deploy, exactly as the seven event types already are.
insert into public.recruitment_cycle_steps (step, enabled, offset_hours) values
  ('welcome', true, 0),
  ('details_reminder', true, 96),
  ('interest_ask', true, 72),
  ('interest_reminder', false, 144);

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, unchanged and no weaker: RLS on, zero policies, nothing
-- granted to a browser-facing role, only the narrow server need to
-- `service_role`.

alter table public.recruitment_cycle_steps enable row level security;

revoke all on table public.recruitment_cycle_steps from anon, authenticated, service_role;

-- Update only, on the same idiom `messaging_schedules` already carries:
-- every row exists from this migration, so the application only ever changes
-- one, never creates or deletes one.
grant select, update on table public.recruitment_cycle_steps to service_role;

commit;
