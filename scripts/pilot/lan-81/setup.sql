-- LAN-81 the Monday exception and action report — SETUP.
--
-- Creates one coherent synthetic reporting week — the events, invitees,
-- answers, attendance and approval defect that make every section of
-- `/operate/report` testable by hand against the deployed application — and
-- creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- THE REPORTING DATE, AND WHY IT IS FOUR WEEKS BACK
--   The report's window is the seven days ending the day before the reporting
--   date. This scenario places its events in a week four weeks ago and asks you
--   to report on `current_date - 28`. **Both result sets below print that date;
--   use the one they print rather than working it out.**
--
--   Four weeks back rather than the week just gone, because the window has to
--   belong to this scenario alone and the recent past is where real operational
--   events actually are. The preflight refuses to install if any event that is
--   not this scenario's already sits in the window. Two reasons, and the second
--   is the important one: a real event would make the numbers in README.md
--   wrong, and cleanup identifies the generated snapshots by the sentinel
--   inside their stored content — which is only unambiguous while everything in
--   the window is this scenario's.
--
-- WHAT IT ADDS
--   * Six clearly synthetic people and six `active` memberships in the open
--     season. No contact points: this scenario sends nothing, and a phone
--     number it does not need is a phone number that could be dialled.
--   * Three events, all carrying the sentinel in `name`, all inside the
--     reporting window:
--       - "PILOT-LAN-81 Reporting week practice"  — `current_date - 32`.
--         The one that produces most of the report.
--       - "PILOT-LAN-81 Empty register session"   — `current_date - 31`,
--         deliberately with no attendance at all.
--       - "PILOT-LAN-81 Committee briefing"       — `current_date - 34`.
--     All three are `approved` and all three are in the past, which since
--     LAN-151 is what makes them events that have occurred (D30).
--   * An audience for each, invitations for everybody in it except one person,
--     and answers that between them produce every section:
--       1. Answered Attending, marked Absent      → an RSVP/attendance mismatch
--       2. Answered Not attending, with a reason  → the Not attending section
--       3. Answered nothing at all                → the nonresponse queue
--       4. Confirmed in the audience, never asked → the approval defect
--       5. Turned up with no invitation           → the walk-up mismatch
--       6. In the briefing's audience only        → proves E6 excludes them
--     The reason on answer 2 is synthetic and deliberately dull. It is the most
--     sensitive thing the report displays, and it is here so you can confirm
--     that it appears to an authorized operator and nowhere else.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No weekly report. Generating one is the thing under test; a row inserted
--     here would test this script instead of the application.
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script ASSERTS it rather than creating one.
--   * No notification job, no delivery result, no RSVP access token. This
--     scenario is read through the operator shell, not through a link.
--   * No auth user, operator account, role assignment or access grant. You sign
--     in as yourself; the durable pilot foundation gave you the roles, and
--     LAN-81 requires one of President, Vice-President, Secretary or General
--     Manager.
--   * No onboarding item. The report's onboarding section reads whatever the
--     open season already has, and inventing an exception here would tell you
--     nothing about the club's own data.
--   * No audit row. The application writes its own when you generate.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, ever. It creates no notification job and no delivery work of any
--   kind, and the people it creates have no contact point to send to.
--
-- OWNERSHIP MARKER — both halves, on every row this script writes:
--   * a deterministic primary key from the block 00810081-0081-4081-8081-…
--   * the sentinel string PILOT-LAN-81 in a text column — `known_as` on a
--     person, `name` on an event, `reason` on the one negative RSVP answer.
--   `season_memberships`, `event_audience_members`, `invitations` and
--   `attendance_records` are the exceptions, for the reason LAN-78 recorded:
--   none has a free text column that is not load-bearing. Each carries the
--   deterministic id AND hangs off this scenario's own people or events, which
--   is a chain no unrelated row satisfies.
--
--   The weekly reports you generate are created by the APPLICATION and have no
--   identifier any script can know. Cleanup removes them by the
--   sentinel-qualified shape recorded in
--   docs/adr/0019-application-created-pilot-rows.md and declared in README.md.
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
select
  'LAN-81 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (current_date - 28) as reporting_date_to_use,
  (current_date - 35) as window_from,
  (current_date - 29) as window_to,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.weekly_reports) as weekly_report_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.events where name like '%PILOT-LAN-81%'
  ) as scenario_events_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- The reporting and participation relations. LAN-81 adds one migration of its
  -- own — the corrected mismatch view — and this is the version that carries it.
  required_migration constant text := '20260814200000';
  scenario_events constant uuid[] := array[
    '00810081-0081-4081-8081-000000000021'::uuid,
    '00810081-0081-4081-8081-000000000022'::uuid,
    '00810081-0081-4081-8081-000000000023'::uuid
  ];
  open_seasons integer;
  offending integer;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-81 pilot setup: migration % has not been applied to this database. The corrected rsvp_attendance_mismatches view is not there yet, so the walk-up mismatch in README.md would be missing from the report.',
      required_migration;
  end if;

  if to_regclass('public.weekly_reports') is null then
    raise exception
      'LAN-81 pilot setup: public.weekly_reports is missing. Apply the reporting migration before running this scenario.';
  end if;

  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-81 pilot setup: no open season exists. The permanent pilot foundation (LAN-93) provides it; this scenario will not create one.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-81 pilot setup: % seasons are open at once. The service layer refuses that, so a scenario built against it would not be testable.',
      open_seasons;
  end if;

  -- An event carrying the sentinel that is not one of this scenario's three
  -- means somebody named an unrelated event after it. Cleanup would refuse to
  -- guess at it, so setup refuses to build on top of it.
  select count(*) into offending
    from public.events
   where name like '%PILOT-LAN-81%'
     and id <> all (scenario_events);
  if offending > 0 then
    raise exception
      'LAN-81 pilot setup: % event(s) already carry the PILOT-LAN-81 sentinel but are not this scenario''s three. Resolve that before installing the scenario.',
      offending;
  end if;

  -- The window has to be this scenario's alone. See the note at the top: it is
  -- what makes README.md's numbers right, and it is what makes cleanup's
  -- identification of the generated snapshots unambiguous.
  select count(*) into offending
    from public.events
   where scheduled_on between current_date - 35 and current_date - 29
     and id <> all (scenario_events);
  if offending > 0 then
    raise exception
      'LAN-81 pilot setup: % event(s) that are not this scenario''s already sit in the reporting window (% to %). Install this scenario in a week that is otherwise empty, or remove them first.',
      offending, current_date - 35, current_date - 29;
  end if;

  -- A weekly report already filed for today means a previous run was left
  -- half-cleaned. Generating on top of it would start at version 2 and the
  -- matrix in README.md would not match what you see.
  select count(*) into offending
    from public.weekly_reports
   where report_on = current_date - 28;
  if offending > 0 then
    raise exception
      'LAN-81 pilot setup: % weekly report(s) are already filed for this scenario''s reporting date. Run cleanup.sql first, then install the scenario again.',
      offending;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
-- `known_as` carries the sentinel AND is what the report displays, because the
-- display name prefers it over `given_name`. So the sentinel is inside the name
-- you will actually read on the screen rather than hidden behind it.
insert into public.people (id, given_name, family_name, known_as)
values
  ('00810081-0081-4081-8081-000000000001', 'Report', 'Yesabsent',
   'PILOT-LAN-81 Said yes, marked absent'),
  ('00810081-0081-4081-8081-000000000002', 'Report', 'Noreason',
   'PILOT-LAN-81 Said no, with a reason'),
  ('00810081-0081-4081-8081-000000000003', 'Report', 'Noresponse',
   'PILOT-LAN-81 Never answered'),
  ('00810081-0081-4081-8081-000000000004', 'Report', 'Uninvited',
   'PILOT-LAN-81 Confirmed but never invited'),
  ('00810081-0081-4081-8081-000000000005', 'Report', 'Walkup',
   'PILOT-LAN-81 Turned up uninvited'),
  ('00810081-0081-4081-8081-000000000006', 'Report', 'Briefing',
   'PILOT-LAN-81 Briefing audience only')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
insert into public.season_memberships
  (id, person_id, season_id, status, entry, confirmed_on, activated_on)
select
  member.id::uuid,
  member.person_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'active',
  'returning',
  current_date - 30,
  current_date - 30
from (values
  ('00810081-0081-4081-8081-000000000011', '00810081-0081-4081-8081-000000000001'),
  ('00810081-0081-4081-8081-000000000012', '00810081-0081-4081-8081-000000000002'),
  ('00810081-0081-4081-8081-000000000013', '00810081-0081-4081-8081-000000000003'),
  ('00810081-0081-4081-8081-000000000014', '00810081-0081-4081-8081-000000000004'),
  ('00810081-0081-4081-8081-000000000015', '00810081-0081-4081-8081-000000000005'),
  ('00810081-0081-4081-8081-000000000016', '00810081-0081-4081-8081-000000000006')
) as member(id, person_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
-- All three are `approved` and dated in the past, because this scenario is
-- about the week AFTER the week happened. Nothing records that they happened:
-- LAN-151 retired the occurrence assertion, and the date is the whole of it.
--
-- The approver is the person the scenario itself created, so that no real pilot
-- identity is written into a synthetic event's audit trail.
insert into public.events
  (id, season_id, name, event_type, status, scheduled_on, starts_at, ends_at, venue,
   is_mandatory,
   audience_confirmed_at, audience_confirmed_by_person_id,
   approved_at, approved_by_person_id,
   response_deadline_at)
select
  event.id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  event.name,
  event.event_type::public.event_type,
  event.status::public.event_status,
  event.scheduled_on::date,
  '19:00'::time,
  '21:00'::time,
  'PILOT-LAN-81 synthetic venue',
  false,
  now(),
  '00810081-0081-4081-8081-000000000001',
  now(),
  '00810081-0081-4081-8081-000000000001',
  event.deadline_at::timestamptz
from (values
  ('00810081-0081-4081-8081-000000000021',
   'PILOT-LAN-81 Reporting week practice',
   'practice', 'approved', (current_date - 32)::text,
   (((current_date - 34) + '18:00'::time) at time zone 'Europe/London')::text),
  ('00810081-0081-4081-8081-000000000022',
   'PILOT-LAN-81 Empty register session',
   'practice', 'approved', (current_date - 31)::text,
   (((current_date - 33) + '18:00'::time) at time zone 'Europe/London')::text),
  -- A third past event, so the report has a meeting in its week as well as two
  -- practices. Since D23 removed "Response requested" it asks for an answer
  -- like everything else.
  ('00810081-0081-4081-8081-000000000023',
   'PILOT-LAN-81 Committee briefing',
   'meeting', 'approved', (current_date - 34)::text,
   (((current_date - 36) + '18:00'::time) at time zone 'Europe/London')::text)
) as event(id, name, event_type, status, scheduled_on, deadline_at)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The confirmed audience
-- ---------------------------------------------------------------------------
-- Invariant P7 computes outward from here, which is what makes "confirmed and
-- never invited" a reportable exception rather than an absence nobody can
-- query. Person 4 is in the practice's audience below and has no invitation.
insert into public.event_audience_members
  (id, event_id, season_id, capacity, season_membership_id, added_by_person_id)
select
  member.id::uuid,
  member.event_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  member.membership_id::uuid,
  '00810081-0081-4081-8081-000000000001'
from (values
  -- The practice: four confirmed, three invited.
  ('00810081-0081-4081-8081-000000000031', '00810081-0081-4081-8081-000000000021',
   '00810081-0081-4081-8081-000000000011'),
  ('00810081-0081-4081-8081-000000000032', '00810081-0081-4081-8081-000000000021',
   '00810081-0081-4081-8081-000000000012'),
  ('00810081-0081-4081-8081-000000000033', '00810081-0081-4081-8081-000000000021',
   '00810081-0081-4081-8081-000000000013'),
  ('00810081-0081-4081-8081-000000000034', '00810081-0081-4081-8081-000000000021',
   '00810081-0081-4081-8081-000000000014'),
  -- The empty-register session: one confirmed and invited, and nobody marked.
  ('00810081-0081-4081-8081-000000000035', '00810081-0081-4081-8081-000000000022',
   '00810081-0081-4081-8081-000000000011'),
  -- The briefing: one confirmed and invited, and excluded by E6 regardless.
  ('00810081-0081-4081-8081-000000000036', '00810081-0081-4081-8081-000000000023',
   '00810081-0081-4081-8081-000000000016')
) as member(id, event_id, membership_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
-- `event_status` is carried on the row and bound to the event by a cascading
-- composite foreign key, so it has to agree with the event as inserted above.
-- That is invariant P1 as a declarative constraint rather than as a rule
-- somebody remembers.
insert into public.invitations
  (id, event_id, event_status, season_id, capacity,
   season_membership_id, audience_member_id, status, issued_at, expires_at)
select
  invitation.id::uuid,
  invitation.event_id::uuid,
  invitation.event_status::public.event_status,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  invitation.membership_id::uuid,
  invitation.audience_member_id::uuid,
  invitation.status::public.invitation_status,
  (current_date - 36)::timestamptz,
  invitation.expires_at::timestamptz
from (values
  -- Answered Attending, and marked Absent below.
  ('00810081-0081-4081-8081-000000000041', '00810081-0081-4081-8081-000000000021',
   'approved', '00810081-0081-4081-8081-000000000011',
   '00810081-0081-4081-8081-000000000031', 'responded',
   (((current_date - 33) + '18:00'::time) at time zone 'Europe/London')::text),
  -- Answered Not attending, with the reason.
  ('00810081-0081-4081-8081-000000000042', '00810081-0081-4081-8081-000000000021',
   'approved', '00810081-0081-4081-8081-000000000012',
   '00810081-0081-4081-8081-000000000032', 'responded',
   (((current_date - 33) + '18:00'::time) at time zone 'Europe/London')::text),
  -- Asked, never answered, and the deadline has passed. The nonresponse queue.
  ('00810081-0081-4081-8081-000000000043', '00810081-0081-4081-8081-000000000021',
   'approved', '00810081-0081-4081-8081-000000000013',
   '00810081-0081-4081-8081-000000000033', 'expired',
   (((current_date - 33) + '18:00'::time) at time zone 'Europe/London')::text),
  -- The empty-register session's one invitee, who also never answered.
  ('00810081-0081-4081-8081-000000000044', '00810081-0081-4081-8081-000000000022',
   'approved', '00810081-0081-4081-8081-000000000011',
   '00810081-0081-4081-8081-000000000035', 'expired',
   (((current_date - 32) + '18:00'::time) at time zone 'Europe/London')::text),
  -- The briefing's one invitee, who never answered either.
  ('00810081-0081-4081-8081-000000000045', '00810081-0081-4081-8081-000000000023',
   'approved', '00810081-0081-4081-8081-000000000016',
   '00810081-0081-4081-8081-000000000036', 'issued', null)
) as invitation(id, event_id, event_status, membership_id,
                audience_member_id, status, expires_at)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The answers
-- ---------------------------------------------------------------------------
-- `source = 'operator'` because nobody opened a link here: this scenario is
-- read through the operator shell, and LAN-79 is where the signed link is
-- rehearsed. The reason is synthetic, dull, and the most sensitive thing the
-- report shows.
insert into public.rsvp_responses
  (id, invitation_id, response, reason, source, responded_at, recorded_at)
values
  ('00810081-0081-4081-8081-000000000051', '00810081-0081-4081-8081-000000000041',
   'yes', null, 'operator',
   (current_date - 34)::timestamptz, (current_date - 34)::timestamptz),
  ('00810081-0081-4081-8081-000000000052', '00810081-0081-4081-8081-000000000042',
   'no', 'PILOT-LAN-81 synthetic reason — coursework deadline.', 'operator',
   (current_date - 34)::timestamptz, (current_date - 34)::timestamptz)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The attendance
-- ---------------------------------------------------------------------------
-- Two rows against the practice, and none at all against the empty-register
-- session — which is the whole reason that second event exists.
--
-- Person 1 said Attending and is Absent: the mismatch the club cares most about.
-- Person 5 has no invitation at all: the walk-up, and the classification the
-- view could not emit until LAN-81's migration corrected it.
insert into public.attendance_records
  (id, event_id, event_status, season_id, capacity, season_membership_id, presence,
   recorded_at, recorded_by_person_id)
select
  record.id::uuid,
  '00810081-0081-4081-8081-000000000021',
  'approved',
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  record.membership_id::uuid,
  record.presence::public.attendance_presence,
  ((current_date - 32) + '22:00'::time)::timestamptz,
  '00810081-0081-4081-8081-000000000001'
from (values
  ('00810081-0081-4081-8081-000000000061', '00810081-0081-4081-8081-000000000011', 'absent'),
  ('00810081-0081-4081-8081-000000000062', '00810081-0081-4081-8081-000000000015', 'present')
) as record(id, membership_id, presence)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Read this before you commit
-- ---------------------------------------------------------------------------
-- What the report should say when you generate it for today. README.md repeats
-- these numbers in its matrix; if this result set disagrees with that one,
-- something in the window is not this scenario's and you should roll back.
select
  'LAN-81 pilot setup — installed' as check,
  (current_date - 28) as reporting_date,
  (current_date - 35) as window_from,
  (current_date - 29) as window_to,
  (select count(*) from public.events where name like '%PILOT-LAN-81%') as scenario_events,
  (
    select count(*) from public.nonresponse_queue
     where scheduled_on between current_date - 35 and current_date - 29
  ) as expect_nonresponses,
  (
    select count(*) from public.invitation_response_state s
     join public.events e on e.id = s.event_id
    where e.scheduled_on between current_date - 35 and current_date - 29
      and s.response_state = 'responded_no'
  ) as expect_not_attending,
  (
    select count(*) from public.rsvp_attendance_mismatches
     where scheduled_on between current_date - 35 and current_date - 29
  ) as expect_mismatches,
  (
    select count(*) from public.uninvited_audience_members
     where scheduled_on between current_date - 35 and current_date - 29
  ) as expect_approval_defects,
  (
    select count(*) from public.invitation_response_state s
     join public.events e on e.id = s.event_id
    where e.id = '00810081-0081-4081-8081-000000000023'
  ) as expect_zero_for_the_briefing;

commit;
