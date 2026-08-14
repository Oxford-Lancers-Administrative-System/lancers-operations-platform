-- LAN-78 secure RSVP links and automated delivery — SETUP.
--
-- Creates the one scenario that makes the delivery surface testable by hand
-- against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   * Three clearly synthetic people with reserved contact points, and three
--     `active` memberships in the open season.
--   * One `approved` event, "PILOT-LAN-78 Delivery scenario", with its audience
--     and one invitation per member. Approved rather than draft because the
--     delivery screen is only reachable for an event that has released
--     invitations — LAN-77 already covers the approval transaction itself.
--   * Three notification jobs, one in each state an operator has to be able to
--     tell apart:
--       - Queued     — pending, never attempted.
--       - Retryable  — failed once, with a safe reason and attempts remaining.
--       - Failed     — refused terminally, with the attempt ceiling reached.
--     The last two carry the delivery attempt and delivery result that produced
--     them, so the diagnostics screen has real evidence to render rather than
--     an empty table.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script ASSERTS it — the service layer refuses when two seasons are
--     open at once, so a scenario creating its own would break the feature it
--     exists to test.
--   * No RSVP access token. A token exists only as a hash of a secret nobody
--     can recover, so a script cannot create a usable one and must not pretend
--     to: the application mints one when it attempts a delivery. The scenario's
--     three invitations therefore show "Not yet issued" until something is
--     retried, which is the honest state.
--   * No auth user, operator account, role assignment or access grant. The
--     delivery screen needs a President, Vice-President, Secretary or General
--     Manager; that is Brian's to arrange through docs/pilot-data-runbook.md,
--     and this script reports whether one exists rather than granting anything.
--   * No delivery callback. Those arrive from Meta, are refused unless their
--     signature verifies, and cannot be manufactured here.
--   * No audit row. The application writes its own, naming who retried.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, by itself. It creates no deliverable work: the queued job is never
--   dispatched because dispatch happens at approval, and this event is already
--   approved.
--
--   Pressing **Retry delivery** WILL attempt a real send. Two things bound what
--   that can do. The three recipients carry Ofcom's reserved 07700 900xxx drama
--   range, which is never allocated to anybody, so no real person can be
--   reached even by a fully configured deployment. And on a deployment where
--   WhatsApp is not configured, the attempt is recorded as failed with the
--   names of the missing settings and nothing leaves the building — which is
--   itself one of the states worth testing.
--
-- OWNERSHIP MARKER — both halves, on every row this script writes:
--   * a deterministic primary key from the block 00780078-0078-4078-8078-…
--   * the sentinel string PILOT-LAN-78 in a text column — `known_as` on a
--     person, `source` on a contact point, `name` on the event,
--     `idempotency_key` on a job, `provider` on an attempt and `detail` on a
--     result.
--   The three `season_memberships` rows are the one exception: the table has no
--   free text column that is not load-bearing (`inactivity_label` describes an
--   `inactive` membership and these are `active`). They carry the deterministic
--   id AND belong to this scenario's people AND sit in the open season — a
--   three-way chain no unrelated row satisfies.
--
--   Rows the APPLICATION creates while the scenario is in use — tokens, further
--   attempts, results, callbacks and audit rows — have no identifier any script
--   can know, and cleanup removes them by the sentinel-only shape recorded in
--   docs/adr/0019-application-created-pilot-rows.md.
--
-- Safe to run twice: every insert is `on conflict (id) do nothing`. There is no
-- `do update` anywhere in this file, so a row this script did not create is
-- never silently rewritten.
--
-- Paired with cleanup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target reviewable BEFORE anything is written
-- ---------------------------------------------------------------------------
-- Read this result set before you read anything else. If the database or the
-- user is not what you intended, roll back — you are one `commit` from writing
-- to it.
select
  'LAN-78 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.invitations) as invitation_rows_before,
  (select count(*) from public.notification_jobs) as job_rows_before,
  (select count(*) from public.delivery_attempts) as attempt_rows_before,
  (select count(*) from public.rsvp_access_tokens) as token_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.events where name like '%PILOT-LAN-78%'
  ) as scenario_events_already_present,
  -- Not a guard: this script grants nothing, and who holds a seat is arranged
  -- through docs/pilot-data-runbook.md. Reported so you can see, before you
  -- commit, whether the delivery screen is reachable yet. Zero is not a
  -- failure — the rows are still created and still correct.
  (
    select count(*)
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    where r.code in ('president', 'vice_president', 'secretary', 'general_manager')
      and ra.effective_from <= current_date
      and (ra.effective_to is null or ra.effective_to > current_date)
  ) as delivery_operator_assignments_available;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
-- Every check below raises. None warns and continues: the point is to stop a
-- test that could not have meant anything, before a human spends an afternoon
-- on it.
do $preflight$
declare
  -- The delivery relations, which are the last migration this scenario needs.
  required_migration constant text := '20260813120000';
  open_seasons integer;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-78 pilot setup: migration % has not been applied to this database. The delivery tables do not exist yet, so this scenario cannot be created.',
      required_migration;
  end if;

  if to_regclass('public.rsvp_access_tokens') is null then
    raise exception
      'LAN-78 pilot setup: public.rsvp_access_tokens is missing. Apply the delivery migration before running this scenario.';
  end if;

  if to_regclass('public.delivery_attempts') is null then
    raise exception
      'LAN-78 pilot setup: public.delivery_attempts is missing. Apply the delivery migration before running this scenario.';
  end if;

  if to_regclass('public.delivery_callbacks') is null then
    raise exception
      'LAN-78 pilot setup: public.delivery_callbacks is missing. Apply the delivery migration before running this scenario.';
  end if;

  select count(*) into open_seasons from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-78 pilot setup: no season is open. The permanent pilot foundation supplies it; this scenario does not create one.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-78 pilot setup: % seasons are open at once. The service layer refuses to resolve a current season in that state, so the scenario would be untestable.',
      open_seasons;
  end if;

  raise notice 'LAN-78 pilot setup: preflight passed.';
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The three invitees
-- ---------------------------------------------------------------------------
-- Names are obviously not club members. `known_as` carries the sentinel so that
-- every one of these rows is identifiable by text as well as by key.

insert into public.people (id, given_name, family_name, known_as)
-- `known_as` carries the sentinel AND is what the screen displays, because both
-- the delivery read model and the dispatcher prefer it over `given_name`. So it
-- has to be the name Brian will actually see in the matrix, with the sentinel
-- inside it rather than instead of it.
values
  ('00780078-0078-4078-8078-000000000001', 'Delivery', 'Queued', 'PILOT-LAN-78 Delivery'),
  ('00780078-0078-4078-8078-000000000002', 'Delivery', 'Retryable', 'PILOT-LAN-78 Delivery'),
  ('00780078-0078-4078-8078-000000000003', 'Delivery', 'Failed', 'PILOT-LAN-78 Delivery')
on conflict (id) do nothing;

-- Ofcom's reserved 07700 900xxx drama range. Never allocated, so a fully
-- configured deployment attempting these reaches nobody.
insert into public.contact_points
  (id, person_id, kind, raw_value, normalised_value, is_preferred, source)
values
  ('00780078-0078-4078-8078-000000000011', '00780078-0078-4078-8078-000000000001',
   'phone', '07700 900781', '07700900781', true, 'PILOT-LAN-78'),
  ('00780078-0078-4078-8078-000000000012', '00780078-0078-4078-8078-000000000002',
   'phone', '07700 900782', '07700900782', true, 'PILOT-LAN-78'),
  ('00780078-0078-4078-8078-000000000013', '00780078-0078-4078-8078-000000000003',
   'phone', '07700 900783', '07700900783', true, 'PILOT-LAN-78')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Three active memberships in the season that is already open
-- ---------------------------------------------------------------------------
insert into public.season_memberships
  (id, person_id, season_id, status, entry, confirmed_on, activated_on)
select
  member.id::uuid,
  member.person_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'active',
  'returning',
  current_date,
  current_date
from (values
  ('00780078-0078-4078-8078-000000000021', '00780078-0078-4078-8078-000000000001'),
  ('00780078-0078-4078-8078-000000000022', '00780078-0078-4078-8078-000000000002'),
  ('00780078-0078-4078-8078-000000000023', '00780078-0078-4078-8078-000000000003')
) as member(id, person_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- One approved event, its audience, and its invitations
-- ---------------------------------------------------------------------------
-- Dated a week out so the event has not started: a started event closes every
-- RSVP link and would make the token half of the screen untestable.
insert into public.events
  (id, season_id, name, event_type, status, scheduled_on, starts_at, venue,
   solicits_response, is_mandatory,
   audience_confirmed_at, audience_confirmed_by_person_id,
   approved_at, approved_by_person_id, response_deadline_at)
select
  '00780078-0078-4078-8078-000000000050',
  (select id from public.seasons where status in ('open', 'active')),
  'PILOT-LAN-78 Delivery scenario',
  'practice',
  'approved',
  current_date + 7,
  '19:00',
  'PILOT-LAN-78 synthetic venue',
  true,
  false,
  now(),
  '00780078-0078-4078-8078-000000000001',
  now(),
  '00780078-0078-4078-8078-000000000001',
  ((current_date + 5) + '18:00'::time) at time zone 'Europe/London'
on conflict (id) do nothing;

insert into public.event_audience_members
  (id, event_id, season_id, capacity, season_membership_id, added_at, added_by_person_id)
select
  member.id::uuid,
  '00780078-0078-4078-8078-000000000050',
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  member.membership_id::uuid,
  now(),
  '00780078-0078-4078-8078-000000000001'
from (values
  ('00780078-0078-4078-8078-000000000061', '00780078-0078-4078-8078-000000000021'),
  ('00780078-0078-4078-8078-000000000062', '00780078-0078-4078-8078-000000000022'),
  ('00780078-0078-4078-8078-000000000063', '00780078-0078-4078-8078-000000000023')
) as member(id, membership_id)
on conflict (id) do nothing;

insert into public.invitations
  (id, event_id, event_status, solicits_response, season_id, capacity,
   season_membership_id, status, expires_at, audience_member_id)
select
  invitation.id::uuid,
  '00780078-0078-4078-8078-000000000050',
  'approved',
  true,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  invitation.membership_id::uuid,
  'pending',
  ((current_date + 5) + '18:00'::time) at time zone 'Europe/London',
  invitation.audience_member_id::uuid
from (values
  ('00780078-0078-4078-8078-000000000071', '00780078-0078-4078-8078-000000000021',
   '00780078-0078-4078-8078-000000000061'),
  ('00780078-0078-4078-8078-000000000072', '00780078-0078-4078-8078-000000000022',
   '00780078-0078-4078-8078-000000000062'),
  ('00780078-0078-4078-8078-000000000073', '00780078-0078-4078-8078-000000000023',
   '00780078-0078-4078-8078-000000000063')
) as invitation(id, membership_id, audience_member_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Three delivery states, which is the whole point of the scenario
-- ---------------------------------------------------------------------------
-- The idempotency key follows the shape LAN-77's approval derives — event,
-- capacity, participant — with the sentinel in front, so it can never collide
-- with a real one and is identifiable by text.

insert into public.notification_jobs
  (id, idempotency_key, job_type, status, invitation_id, event_id, person_id,
   channel, attempt_count, last_error)
values
  -- Queued: pending, never attempted. The state every invitation starts in.
  ('00780078-0078-4078-8078-000000000081',
   'PILOT-LAN-78:event:00780078-0078-4078-8078-000000000050:invitation:player:00780078-0078-4078-8078-000000000021',
   'invitation', 'pending',
   '00780078-0078-4078-8078-000000000071',
   '00780078-0078-4078-8078-000000000050',
   '00780078-0078-4078-8078-000000000001',
   'whatsapp', 0, null),

  -- Retryable: one failed attempt, four remaining. The safe reason is the
  -- adapter's own sentence, carrying no provider text and no phone number.
  ('00780078-0078-4078-8078-000000000082',
   'PILOT-LAN-78:event:00780078-0078-4078-8078-000000000050:invitation:player:00780078-0078-4078-8078-000000000022',
   'invitation', 'failed',
   '00780078-0078-4078-8078-000000000072',
   '00780078-0078-4078-8078-000000000050',
   '00780078-0078-4078-8078-000000000002',
   'whatsapp', 1,
   'The provider is rate-limiting the club''s account. This will be retried automatically.'),

  -- Failed: the attempt ceiling reached, and the last result terminal. Nothing
  -- further happens automatically; a human has to fix the cause.
  ('00780078-0078-4078-8078-000000000083',
   'PILOT-LAN-78:event:00780078-0078-4078-8078-000000000050:invitation:player:00780078-0078-4078-8078-000000000023',
   'invitation', 'failed',
   '00780078-0078-4078-8078-000000000073',
   '00780078-0078-4078-8078-000000000050',
   '00780078-0078-4078-8078-000000000003',
   'whatsapp', 5,
   'WhatsApp could not deliver to this number — it may not be a WhatsApp account.')
on conflict (id) do nothing;

-- The evidence behind the two failures. `provider_message_id` is null on both:
-- neither attempt was ever accepted, so neither has an identifier, and the
-- schema refuses an acceptance that names no message.
insert into public.delivery_attempts
  (id, notification_job_id, attempt_number, channel, provider,
   requested_at, concluded_at, failure_reason)
values
  ('00780078-0078-4078-8078-000000000091',
   '00780078-0078-4078-8078-000000000082', 1, 'whatsapp', 'PILOT-LAN-78-provider',
   now() - interval '2 hours', now() - interval '2 hours',
   'The provider is rate-limiting the club''s account. This will be retried automatically.'),
  ('00780078-0078-4078-8078-000000000092',
   '00780078-0078-4078-8078-000000000083', 5, 'whatsapp', 'PILOT-LAN-78-provider',
   now() - interval '1 hour', now() - interval '1 hour',
   'WhatsApp could not deliver to this number — it may not be a WhatsApp account.')
on conflict (id) do nothing;

-- `failed` is transient and `rejected` is terminal. That distinction is what
-- the operator's Retryable/Failed split reads, so the scenario has one of each.
insert into public.delivery_results
  (id, notification_job_id, attempt_number, outcome, channel, provider, detail)
values
  ('00780078-0078-4078-8078-000000000095',
   '00780078-0078-4078-8078-000000000082', 1, 'failed', 'whatsapp', 'PILOT-LAN-78-provider',
   'PILOT-LAN-78 synthetic result: the provider was rate-limiting the account.'),
  ('00780078-0078-4078-8078-000000000096',
   '00780078-0078-4078-8078-000000000083', 5, 'rejected', 'whatsapp', 'PILOT-LAN-78-provider',
   'PILOT-LAN-78 synthetic result: the number is not reachable on WhatsApp.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- What was actually written
-- ---------------------------------------------------------------------------
-- Read this before committing. Every count should be 3, 3, 3, 1, 3, 3, 3, 2, 2
-- on a first run, and identical on a second — the script is idempotent.
select
  'LAN-78 pilot setup — written' as check,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-78%') as people,
  (select count(*) from public.contact_points
    where source = 'PILOT-LAN-78') as contact_points,
  (select count(*) from public.season_memberships
    where person_id in (select id from public.people where known_as = 'PILOT-LAN-78')) as memberships,
  (select count(*) from public.events
    where name like '%PILOT-LAN-78%') as events,
  (select count(*) from public.event_audience_members
    where event_id = '00780078-0078-4078-8078-000000000050') as audience_members,
  (select count(*) from public.invitations
    where event_id = '00780078-0078-4078-8078-000000000050') as invitations,
  (select count(*) from public.notification_jobs
    where event_id = '00780078-0078-4078-8078-000000000050') as jobs,
  (select count(*) from public.delivery_attempts
    where notification_job_id in
      (select id from public.notification_jobs
        where event_id = '00780078-0078-4078-8078-000000000050')) as attempts,
  (select count(*) from public.delivery_results
    where notification_job_id in
      (select id from public.notification_jobs
        where event_id = '00780078-0078-4078-8078-000000000050')) as results,
  (select count(*) from public.rsvp_access_tokens
    where invitation_id in
      (select id from public.invitations
        where event_id = '00780078-0078-4078-8078-000000000050')) as tokens_the_app_has_issued;

commit;
