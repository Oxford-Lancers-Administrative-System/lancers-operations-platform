-- LAN-80 the occurrence assertion and attendance — SETUP.
--
-- Creates the past approved events, their invitees and their contrasting RSVP
-- answers that make `/operate/events/[id]` and `/operate/events/[id]/attendance`
-- testable by hand against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   * Five clearly synthetic people and five `active` memberships in the open
--     season. No contact points: this scenario sends nothing, and a phone
--     number it does not need is a phone number that could be dialled.
--   * Two events, both carrying the sentinel in `name`, both `approved`, and
--     both with a start time already in the past — because the two assertions
--     are about events that have already been and gone:
--       - "PILOT-LAN-80 Occurrence scenario" — three days ago. This is the one
--         you mark **occurred** and then take attendance for.
--       - "PILOT-LAN-80 Not-held scenario"   — four days ago. This is the one
--         you mark **not held**, and whose attendance screen must stay closed
--         forever afterwards.
--   * Five invitations: four on the occurrence event, one on the not-held one.
--   * Three RSVP answers on the occurrence event, deliberately contrasting, so
--     that every mismatch the club cares about is one attendance press away:
--       1. Attending      — mark them **Absent** → said_yes_marked_absent
--       2. Not attending  — mark them **Present** → said_no_but_attended
--       3. Attending      — mark them **nothing** → said_yes_no_attendance_recorded
--       4. No response    — free to mark however you like
--     The reason on answer 2 is synthetic and is deliberately dull: it is
--     displayed on no screen this issue builds, and it is here to prove that.
--
-- THE WALK-UP, AND THE ONE THING YOU HAVE TO TYPE
--   Person 5 is invited to the **not-held** event and to nothing else, so on the
--   occurrence event they are uninvited and appear under **Possible roster
--   match**. Choosing them records attendance against their membership and
--   creates no invitation — invariant P6, with the anchor the club wants.
--
--   The other walk-up is the one who is not on the roster at all, and only you
--   can create that: it is a name typed into the form on the day. **Type the
--   sentinel as the first word** — for example `PILOT-LAN-80 Devon Skye`.
--   Cleanup finds that person by the sentinel and by the attendance row that
--   hangs off this scenario's own event, and it **aborts** rather than guess if
--   it meets a walk-up without it. README.md says this again, in the matrix.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No attendance record. Attendance is the thing under test; a row inserted
--     here would test this script instead of the application.
--   * No occurrence assertion. `status` stays `approved` and
--     `outcome_recorded_at` stays null, because the human assertion is exactly
--     what LAN-80 exists to make somebody perform.
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script ASSERTS it rather than creating one — the service layer
--     refuses when two seasons are open at once.
--   * No notification job, no delivery result, no RSVP access token. This
--     scenario reaches the attendance screen through the operator shell, not
--     through a link, so none of them is needed and none is created.
--   * No auth user, operator account, role assignment or access grant. You sign
--     in as yourself; the durable pilot foundation already gave you the roles.
--   * No audit row. The application writes its own when you assert and record.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, ever. It creates no notification job and no delivery work of any
--   kind, and the people it creates have no contact point to send to.
--
-- OWNERSHIP MARKER — both halves, on every row this script writes:
--   * a deterministic primary key from the block 00800080-0080-4080-8080-…
--   * the sentinel string PILOT-LAN-80 in a text column — `known_as` on a
--     person, `name` on an event, `reason` on the one negative RSVP answer.
--   `season_memberships`, `event_audience_members` and `invitations` are the
--   exceptions, for the reason LAN-78 recorded: none has a free text column
--   that is not load-bearing. Each carries the deterministic id AND hangs off
--   this scenario's own people or events, which is a chain no unrelated row
--   satisfies.
--
--   Rows the APPLICATION creates while the scenario is in use — the attendance
--   you record, the walk-up person you type, the audit rows both write — have no
--   identifier any script can know, and cleanup removes them by the
--   sentinel-qualified shape recorded in
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
  'LAN-80 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.invitations) as invitation_rows_before,
  (select count(*) from public.attendance_records) as attendance_rows_before,
  (select count(*) from public.rsvp_responses) as response_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.events where name like '%PILOT-LAN-80%'
  ) as scenario_events_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- The participation relations — invitations, RSVP responses and attendance.
  -- LAN-80 adds no migration of its own; this is the one it stands on.
  required_migration constant text := '20260810120800';
  scenario_events constant uuid[] := array[
    '00800080-0080-4080-8080-000000000021'::uuid,
    '00800080-0080-4080-8080-000000000022'::uuid
  ];
  open_seasons integer;
  offending integer;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-80 pilot setup: migration % has not been applied to this database. The attendance table does not exist yet, so this scenario cannot be created.',
      required_migration;
  end if;

  if to_regclass('public.attendance_records') is null then
    raise exception
      'LAN-80 pilot setup: public.attendance_records is missing. Apply the participation migration before running this scenario.';
  end if;

  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-80 pilot setup: no open season exists. The permanent pilot foundation (LAN-93) provides it; this scenario will not create one.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-80 pilot setup: % seasons are open at once. The service layer refuses that, so a scenario built against it would not be testable.',
      open_seasons;
  end if;

  -- An event carrying the sentinel that is not one of this scenario's two means
  -- somebody named an unrelated event after it. Cleanup would refuse to guess
  -- at it, so setup refuses to build on top of it.
  select count(*) into offending
    from public.events
   where name like '%PILOT-LAN-80%'
     and id <> all (scenario_events);
  if offending > 0 then
    raise exception
      'LAN-80 pilot setup: % event(s) already carry the PILOT-LAN-80 sentinel but are not this scenario''s two. Resolve that before installing the scenario.',
      offending;
  end if;

  -- Attendance already against these events means a previous run of this
  -- scenario was left half-cleaned. Re-running setup on top of it would produce
  -- a board that disagrees with the matrix in README.md.
  select count(*) into offending
    from public.attendance_records
   where event_id = any(scenario_events);
  if offending > 0 then
    raise exception
      'LAN-80 pilot setup: % attendance record(s) already exist against this scenario''s events. Run cleanup.sql first, then install the scenario again.',
      offending;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
-- `known_as` carries the sentinel AND is what the attendance board displays,
-- because the board prefers it over `given_name`. So the sentinel is inside the
-- name you will actually read on the screen rather than hidden behind it.
insert into public.people (id, given_name, family_name, known_as)
values
  ('00800080-0080-4080-8080-000000000001', 'Attend', 'Yesabsent',
   'PILOT-LAN-80 Said yes, mark absent'),
  ('00800080-0080-4080-8080-000000000002', 'Attend', 'Nopresent',
   'PILOT-LAN-80 Said no, mark present'),
  ('00800080-0080-4080-8080-000000000003', 'Attend', 'Yesunmarked',
   'PILOT-LAN-80 Said yes, leave unmarked'),
  ('00800080-0080-4080-8080-000000000004', 'Attend', 'Noresponse',
   'PILOT-LAN-80 No response'),
  ('00800080-0080-4080-8080-000000000005', 'Attend', 'Rostermatch',
   'PILOT-LAN-80 Uninvited roster match')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
-- All five are `active`, because a walk-up roster match is offered from the
-- season's active memberships and person 5 has to appear in it.
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
  ('00800080-0080-4080-8080-000000000011', '00800080-0080-4080-8080-000000000001'),
  ('00800080-0080-4080-8080-000000000012', '00800080-0080-4080-8080-000000000002'),
  ('00800080-0080-4080-8080-000000000013', '00800080-0080-4080-8080-000000000003'),
  ('00800080-0080-4080-8080-000000000014', '00800080-0080-4080-8080-000000000004'),
  ('00800080-0080-4080-8080-000000000015', '00800080-0080-4080-8080-000000000005')
) as member(id, person_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
-- Two, because the assertion is a fork and each branch has to be walkable
-- without undoing the other. Both are in the past: the screen shows "Start time
-- has passed" as a fact, and an event nobody could have attended yet makes a
-- poor rehearsal for one that has been.
--
-- Both stay `approved` with a null `outcome_recorded_at`. That is the state
-- LAN-80 exists to move out of, by hand, which is the whole exercise.
insert into public.events
  (id, season_id, name, event_type, status, scheduled_on, starts_at, ends_at, venue,
   solicits_response, is_mandatory,
   audience_confirmed_at, audience_confirmed_by_person_id,
   approved_at, approved_by_person_id, response_deadline_at)
select
  event.id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  event.name,
  'practice',
  'approved',
  event.scheduled_on::date,
  '19:00'::time,
  '21:00'::time,
  'PILOT-LAN-80 synthetic venue',
  true,
  false,
  now(),
  '00800080-0080-4080-8080-000000000001',
  now(),
  '00800080-0080-4080-8080-000000000001',
  event.deadline_at::timestamptz
from (values
  ('00800080-0080-4080-8080-000000000021',
   'PILOT-LAN-80 Occurrence scenario',
   (current_date - 3)::text,
   (((current_date - 5) + '18:00'::time) at time zone 'Europe/London')::text),
  ('00800080-0080-4080-8080-000000000022',
   'PILOT-LAN-80 Not-held scenario',
   (current_date - 4)::text,
   (((current_date - 6) + '18:00'::time) at time zone 'Europe/London')::text)
) as event(id, name, scheduled_on, deadline_at)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The audience
-- ---------------------------------------------------------------------------
-- Four on the occurrence event and one on the not-held event. Person 5 is
-- deliberately absent from the occurrence event's audience: that absence is
-- what puts them in **Possible roster match** on the walk-up form.
insert into public.event_audience_members
  (id, event_id, season_id, capacity, season_membership_id, added_at, added_by_person_id)
select
  member.id::uuid,
  member.event_id::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  member.membership_id::uuid,
  now(),
  '00800080-0080-4080-8080-000000000001'
from (values
  ('00800080-0080-4080-8080-000000000031', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000011'),
  ('00800080-0080-4080-8080-000000000032', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000012'),
  ('00800080-0080-4080-8080-000000000033', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000013'),
  ('00800080-0080-4080-8080-000000000034', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000014'),
  ('00800080-0080-4080-8080-000000000035', '00800080-0080-4080-8080-000000000022',
   '00800080-0080-4080-8080-000000000015')
) as member(id, event_id, membership_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
-- `event_status` is `approved` and is kept true by the cascading composite
-- foreign key: marking the event occurred rewrites it, which is the mechanism
-- invariant P1 and invariant P5 both stand on.
insert into public.invitations
  (id, event_id, event_status, solicits_response, season_id, capacity,
   season_membership_id, status, issued_at, expires_at, audience_member_id)
select
  invitation.id::uuid,
  invitation.event_id::uuid,
  'approved',
  true,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  invitation.membership_id::uuid,
  invitation.status::public.invitation_status,
  now() - interval '10 days',
  invitation.expires_at::timestamptz,
  invitation.audience_member_id::uuid
from (values
  ('00800080-0080-4080-8080-000000000041', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000011', 'responded',
   (((current_date - 5) + '18:00'::time) at time zone 'Europe/London')::text,
   '00800080-0080-4080-8080-000000000031'),
  ('00800080-0080-4080-8080-000000000042', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000012', 'responded',
   (((current_date - 5) + '18:00'::time) at time zone 'Europe/London')::text,
   '00800080-0080-4080-8080-000000000032'),
  ('00800080-0080-4080-8080-000000000043', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000013', 'responded',
   (((current_date - 5) + '18:00'::time) at time zone 'Europe/London')::text,
   '00800080-0080-4080-8080-000000000033'),
  -- Never answered, and its deadline is long gone: the nonresponse case, which
  -- attendance must be recordable against exactly like any other.
  ('00800080-0080-4080-8080-000000000044', '00800080-0080-4080-8080-000000000021',
   '00800080-0080-4080-8080-000000000014', 'expired',
   (((current_date - 5) + '18:00'::time) at time zone 'Europe/London')::text,
   '00800080-0080-4080-8080-000000000034'),
  ('00800080-0080-4080-8080-000000000045', '00800080-0080-4080-8080-000000000022',
   '00800080-0080-4080-8080-000000000015', 'issued',
   (((current_date - 6) + '18:00'::time) at time zone 'Europe/London')::text,
   '00800080-0080-4080-8080-000000000035')
) as invitation(id, event_id, membership_id, status, expires_at, audience_member_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The RSVP answers
-- ---------------------------------------------------------------------------
-- The contrast is the point. Two people said they were coming and one said they
-- were not, and after you have taken attendance the club's own view will hold
-- three different mismatches — none of which the application will reconcile,
-- which is what locked Requirement 7 asks for.
--
-- The reason on the negative answer carries the sentinel and is also a check on
-- the attendance screen: it appears nowhere on it, and must not.
insert into public.rsvp_responses
  (id, invitation_id, response, reason, source, responded_at, recorded_at)
values
  ('00800080-0080-4080-8080-000000000051', '00800080-0080-4080-8080-000000000041',
   'yes', null, 'signed_link', now() - interval '6 days', now() - interval '6 days'),
  ('00800080-0080-4080-8080-000000000052', '00800080-0080-4080-8080-000000000042',
   'no', 'PILOT-LAN-80 synthetic reason — this must not appear on the attendance screen.',
   'signed_link', now() - interval '6 days', now() - interval '6 days'),
  ('00800080-0080-4080-8080-000000000053', '00800080-0080-4080-8080-000000000043',
   'yes', null, 'signed_link', now() - interval '6 days', now() - interval '6 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
select
  'LAN-80 pilot setup — created' as check,
  (
    select count(*) from public.people where known_as like 'PILOT-LAN-80%'
  ) as scenario_people,
  (
    select count(*) from public.events where name like 'PILOT-LAN-80%'
  ) as scenario_events,
  (
    select count(*) from public.events
     where name like 'PILOT-LAN-80%' and status = 'approved'
  ) as scenario_events_awaiting_assertion,
  (
    select count(*) from public.invitations
     where event_id in (select id from public.events where name like 'PILOT-LAN-80%')
  ) as scenario_invitations,
  (
    select count(*) from public.rsvp_responses
     where invitation_id in (
       select i.id from public.invitations i
        join public.events e on e.id = i.event_id
       where e.name like 'PILOT-LAN-80%'
     )
  ) as scenario_responses,
  (
    select count(*) from public.attendance_records
     where event_id in (select id from public.events where name like 'PILOT-LAN-80%')
  ) as scenario_attendance_so_far;

commit;
