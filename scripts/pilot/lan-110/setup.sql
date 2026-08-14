-- LAN-110 the coach attendance recorder — SETUP.
--
-- Creates the coaching identities and the practice that make
-- `/operate/events/[id]/attendance` testable by hand, as a coach, against the
-- deployed application — and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   * Two clearly synthetic coaching people, and a role assignment for each:
--       - "PILOT-LAN-110 Authorized head coach" — a `head_coach` assignment
--         effective from yesterday with no end date. This is the account that
--         must reach the narrow attendance surface, and nothing else.
--       - "PILOT-LAN-110 Coach out of post" — a `head_coach` assignment that
--         ENDED yesterday. This is the unauthorized coach: a real coaching seat
--         that is no longer in effect, which is what an unauthorized coach
--         actually looks like in this schema. The catalogue has no
--         assistant-coach seat and LAN-108 forbids inferring permission from a
--         broad "coach" label, so there is no other honest way to model one.
--   * Three synthetic players and three `active` memberships in the open
--     season. No contact points: this scenario sends nothing, and a phone
--     number it does not need is a phone number that could be dialled.
--   * One event, "PILOT-LAN-110 Coach attendance scenario", `approved`, with a
--     start time already in the past, three invitations and two contrasting
--     RSVP answers.
--
-- WHY THE EVENT ARRIVES `approved` AND NOT `occurred`
--   Because the gate is the point. Invariant E5 makes occurrence a human
--   assertion, and LAN-110's fixed boundary is that a coach may not make it. So
--   the scenario starts closed:
--       1. as the coach, the event is absent from the eligible list and its
--          attendance URL shows "Attendance is not open" (UX-90);
--       2. as an authorized operator, you mark it occurred;
--       3. as the coach, it appears and the register opens (UX-91).
--   A script that inserted `occurred` would be fabricating somebody's assertion
--   and would skip the half of the boundary worth testing.
--
-- THE WALK-UP, AND THE ONE THING YOU HAVE TO TYPE
--   The walk-up who is not on the roster is a name typed into the form on the
--   day, so only you can create it. **Type the sentinel as the first word** —
--   for example `PILOT-LAN-110 Devon Skye`. Cleanup finds that person by the
--   sentinel and by the attendance row hanging off this scenario's own event,
--   and it ABORTS rather than guess if it meets a walk-up without it.
--   README.md says this again, in the matrix.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No auth user, and no `operator_accounts` row. Creating or inviting a
--     login is a supported Supabase Auth administrator action and is yours
--     alone; README.md gives the exact steps and says which person each login
--     must be linked to.
--   * No role, and no `roles` row. The role catalogue is reference data. This
--     script ASSERTS that `head_coach` exists and aborts if it does not, rather
--     than inventing the club's own vocabulary — see README.md, which makes
--     seeding the catalogue an explicit prerequisite.
--   * No attendance record, and no occurrence assertion. Both are what LAN-110
--     exists to have a human perform.
--   * No season. The open season belongs to the permanent pilot foundation and
--     this script asserts it rather than creating one.
--   * No notification job, delivery result or RSVP access token. This scenario
--     reaches attendance through the operator shell, never through a link.
--   * No audit row. The application writes its own when you assert and record.
--
-- WHAT IT CAN CAUSE TO BE SENT
--   Nothing, ever. It creates no notification job and no delivery work of any
--   kind, and the people it creates have no contact point to send to.
--
-- OWNERSHIP MARKER — both halves, on every row this script writes:
--   * a deterministic primary key from the block 01100110-0110-4110-8110-…
--   * the sentinel string PILOT-LAN-110 in a text column — `known_as` on a
--     person, `name` on the event, `note` on a role assignment, `reason` on the
--     one negative RSVP answer.
--   `season_memberships`, `event_audience_members` and `invitations` are the
--   exceptions, for the reason LAN-78 recorded: none has a free text column
--   that is not load-bearing. Each carries the deterministic id AND hangs off
--   this scenario's own people or event, which is a chain no unrelated row
--   satisfies.
--
--   Rows the APPLICATION creates while the scenario is in use — the attendance
--   you record, the walk-up person you type, the audit rows both write — have
--   no identifier any script can know, and cleanup removes them by the
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
  'LAN-110 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.role_assignments) as role_assignment_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (select count(*) from public.attendance_records) as attendance_rows_before,
  (
    select count(*) from public.seasons where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ') from public.seasons where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*) from public.roles where code = 'head_coach'
  ) as head_coach_role_present,
  (
    select count(*) from public.events where name like '%PILOT-LAN-110%'
  ) as scenario_events_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  -- The roles and role assignments this scenario stands on. LAN-110 adds no
  -- migration of its own.
  roles_migration constant text := '20260810120300';
  participation_migration constant text := '20260810120800';
  scenario_event constant uuid := '01100110-0110-4110-8110-000000000031'::uuid;
  open_seasons integer;
  offending integer;
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = roles_migration
  ) then
    raise exception
      'LAN-110 pilot setup: migration % has not been applied to this database. The role-assignment table does not exist yet, so the coaching seats cannot be created.',
      roles_migration;
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = participation_migration
  ) then
    raise exception
      'LAN-110 pilot setup: migration % has not been applied to this database. The attendance table does not exist yet, so this scenario cannot be recorded against.',
      participation_migration;
  end if;

  -- The role catalogue is reference data, and inserting reference data is an
  -- owner action rather than a scenario's. LAN-73's production handoff recorded
  -- that hosted has no `roles` rows at all, so this is the likely stop on a
  -- first run and the message has to say what to do about it.
  if not exists (select 1 from public.roles where code = 'head_coach') then
    raise exception
      'LAN-110 pilot setup: no role with code head_coach exists in this database. The role catalogue is reference data and this scenario will not create it — seed the club''s roles first. See README.md, "Before you run anything".';
  end if;

  if not exists (
    select 1 from public.roles where code = 'head_coach' and scope = 'season'
  ) then
    raise exception
      'LAN-110 pilot setup: the head_coach role is not season-scoped in this database. Coaching hangs off the season (register D8); a committee-scoped head_coach would need a different assignment shape and this scenario refuses to guess at it.';
  end if;

  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-110 pilot setup: no open season exists. The permanent pilot foundation (LAN-93) provides it; this scenario will not create one.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-110 pilot setup: % seasons are open at once. The service layer refuses that, so a scenario built against it would not be testable.',
      open_seasons;
  end if;

  -- An event carrying the sentinel that is not this scenario's own means
  -- somebody named an unrelated event after it. Cleanup would refuse to guess
  -- at it, so setup refuses to build on top of it.
  select count(*) into offending
    from public.events
   where name like '%PILOT-LAN-110%'
     and id <> scenario_event;
  if offending > 0 then
    raise exception
      'LAN-110 pilot setup: % event(s) already carry the PILOT-LAN-110 sentinel but are not this scenario''s. Resolve that before installing the scenario.',
      offending;
  end if;

  -- Attendance already against this event means a previous run was left
  -- half-cleaned. Re-running setup on top of it would produce a board that
  -- disagrees with the matrix in README.md.
  select count(*) into offending
    from public.attendance_records
   where event_id = scenario_event;
  if offending > 0 then
    raise exception
      'LAN-110 pilot setup: % attendance record(s) already exist against this scenario''s event. Run cleanup.sql first, then install the scenario again.',
      offending;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
-- `known_as` carries the sentinel AND is what the application displays, because
-- it is preferred over `given_name`. So the sentinel is inside the name you
-- will actually read on the screen rather than hidden behind it.
insert into public.people (id, given_name, family_name, known_as)
values
  ('01100110-0110-4110-8110-000000000001', 'Coach', 'Authorized',
   'PILOT-LAN-110 Authorized head coach'),
  ('01100110-0110-4110-8110-000000000002', 'Coach', 'Outofpost',
   'PILOT-LAN-110 Coach out of post'),
  ('01100110-0110-4110-8110-000000000003', 'Player', 'Saidyes',
   'PILOT-LAN-110 Said yes'),
  ('01100110-0110-4110-8110-000000000004', 'Player', 'Saidno',
   'PILOT-LAN-110 Said no'),
  ('01100110-0110-4110-8110-000000000005', 'Player', 'Noresponse',
   'PILOT-LAN-110 No response')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The coaching seats
-- ---------------------------------------------------------------------------
-- Two `head_coach` assignments on the open season, one in effect and one over.
--
-- `effective_from` is YESTERDAY on the authorized seat, not today. Both bounds
-- of effective dating are enforced (LAN-95), both columns are dates, and a seat
-- dated to begin today is in effect from midnight — but a seat dated yesterday
-- removes any question about the boundary from a hand test that is trying to
-- prove something else.
--
-- The out-of-post seat ends yesterday, so `effective_to > now()` is false and
-- the code never reaches `roleCodes`. That is the unauthorized coach.
--
-- `appointed_by_person_id` is left null: it is nullable, this scenario has no
-- appointer to name truthfully, and pointing it at a real committee member
-- would put a real person's id on a synthetic record.
--
-- BOTH SEATS ARE TIME-BOUNDED, and the authorized one is bounded even though it
-- is the seat that has to work. `docs/pilot-data-runbook.md`'s rule — enforced
-- by `tests/pilot-data-contract.test.ts` — is that a pilot grant carries an end
-- date at the moment it is made, because `effective_to` is nullable and the
-- database accepts an open-ended grant in silence. Thirty days is longer than
-- this scenario needs and shorter than anybody would forget about; if the
-- review runs past it, run cleanup and install the scenario again rather than
-- extending the seat by hand.
--
-- Two statements rather than one over a `values` list: each is written so that
-- `role_id`, `scope` and `is_constitutional_office` are read from `public.roles`
-- rather than asserted here, which is the other half of the same rule — an
-- authorization record that disagrees with the seat it names is the untruthful
-- grant the rule exists to prevent.
insert into public.role_assignments
  (id, person_id, role_id, scope, is_constitutional_office, season_id,
   effective_from, effective_to, note)
select
  '01100110-0110-4110-8110-000000000011'::uuid,
  '01100110-0110-4110-8110-000000000001'::uuid,
  r.id,
  r.scope,
  r.is_constitutional_office,
  s.id,
  current_date - 1,
  current_date + 30,
  'PILOT-LAN-110 authorized coaching seat, in effect'
from public.roles r, public.seasons s
where r.code = 'head_coach' and s.status in ('open', 'active')
on conflict (id) do nothing;

insert into public.role_assignments
  (id, person_id, role_id, scope, is_constitutional_office, season_id,
   effective_from, effective_to, note)
select
  '01100110-0110-4110-8110-000000000012'::uuid,
  '01100110-0110-4110-8110-000000000002'::uuid,
  r.id,
  r.scope,
  r.is_constitutional_office,
  s.id,
  current_date - 30,
  current_date - 1,
  'PILOT-LAN-110 coaching seat that has ended'
from public.roles r, public.seasons s
where r.code = 'head_coach' and s.status in ('open', 'active')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
-- The three players only. A coach is not a member of the playing squad, and
-- giving one a membership here would put them on the roster this scenario is
-- proving the coach cannot administer.
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
  ('01100110-0110-4110-8110-000000000021', '01100110-0110-4110-8110-000000000003'),
  ('01100110-0110-4110-8110-000000000022', '01100110-0110-4110-8110-000000000004'),
  ('01100110-0110-4110-8110-000000000023', '01100110-0110-4110-8110-000000000005')
) as member(id, person_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The event
-- ---------------------------------------------------------------------------
-- In the past, because an event nobody could have attended yet makes a poor
-- rehearsal for one that has been — not because the screen checks. It does not:
-- nothing infers occurrence from the clock.
--
-- It stays `approved` with a null `outcome_recorded_at`, which is the state the
-- exercise begins in. See the header for why.
insert into public.events
  (id, season_id, name, event_type, status, scheduled_on, starts_at, ends_at, venue,
   solicits_response, is_mandatory,
   audience_confirmed_at, audience_confirmed_by_person_id,
   approved_at, approved_by_person_id, response_deadline_at)
select
  '01100110-0110-4110-8110-000000000031'::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'PILOT-LAN-110 Coach attendance scenario',
  'practice',
  'approved',
  (current_date - 2)::date,
  '19:00'::time,
  '21:00'::time,
  'PILOT-LAN-110 synthetic venue',
  true,
  false,
  now(),
  '01100110-0110-4110-8110-000000000003',
  now(),
  '01100110-0110-4110-8110-000000000003',
  (((current_date - 4) + '18:00'::time) at time zone 'Europe/London')::timestamptz
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The audience
-- ---------------------------------------------------------------------------
insert into public.event_audience_members
  (id, event_id, season_id, capacity, season_membership_id, added_at, added_by_person_id)
select
  member.id::uuid,
  '01100110-0110-4110-8110-000000000031'::uuid,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  member.membership_id::uuid,
  now(),
  '01100110-0110-4110-8110-000000000003'
from (values
  ('01100110-0110-4110-8110-000000000041', '01100110-0110-4110-8110-000000000021'),
  ('01100110-0110-4110-8110-000000000042', '01100110-0110-4110-8110-000000000022'),
  ('01100110-0110-4110-8110-000000000043', '01100110-0110-4110-8110-000000000023')
) as member(id, membership_id)
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
  '01100110-0110-4110-8110-000000000031'::uuid,
  'approved',
  true,
  (select id from public.seasons where status in ('open', 'active')),
  'player',
  invitation.membership_id::uuid,
  invitation.status::public.invitation_status,
  now() - interval '10 days',
  (((current_date - 4) + '18:00'::time) at time zone 'Europe/London')::timestamptz,
  invitation.audience_member_id::uuid
from (values
  ('01100110-0110-4110-8110-000000000051', '01100110-0110-4110-8110-000000000021',
   'responded', '01100110-0110-4110-8110-000000000041'),
  ('01100110-0110-4110-8110-000000000052', '01100110-0110-4110-8110-000000000022',
   'responded', '01100110-0110-4110-8110-000000000042'),
  -- Never answered, and its deadline is long gone: the nonresponse case, which
  -- attendance must be recordable against exactly like any other.
  ('01100110-0110-4110-8110-000000000053', '01100110-0110-4110-8110-000000000023',
   'expired', '01100110-0110-4110-8110-000000000043')
) as invitation(id, membership_id, status, audience_member_id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- The responses
-- ---------------------------------------------------------------------------
-- Two, deliberately contrasting, so the coach's board shows a standing "yes"
-- and a standing "no" side by side.
--
-- The reason on the negative answer is synthetic and deliberately dull. It is
-- here to be **looked for and not found**: § 3 withholds RSVP reasons from the
-- coach's surface, and a scenario with no reason in it could not demonstrate
-- that.
insert into public.rsvp_responses
  (id, invitation_id, response, reason, responded_at, source)
values
  ('01100110-0110-4110-8110-000000000061',
   '01100110-0110-4110-8110-000000000051',
   'yes', null, now() - interval '6 days', 'signed_link'),
  ('01100110-0110-4110-8110-000000000062',
   '01100110-0110-4110-8110-000000000052',
   'no', 'PILOT-LAN-110 synthetic reason, must not appear on the coach board',
   now() - interval '6 days', 'signed_link')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
select
  'LAN-110 pilot setup — installed' as check,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-110%') as scenario_people,
  (select count(*) from public.role_assignments
    where note like 'PILOT-LAN-110%') as scenario_role_assignments,
  (select count(*) from public.role_assignments
    where note like 'PILOT-LAN-110%'
      and effective_from <= current_date
      and (effective_to is null or effective_to > current_date)) as seats_in_effect,
  (select count(*) from public.events
    where name like 'PILOT-LAN-110%') as scenario_events,
  (select status from public.events
    where id = '01100110-0110-4110-8110-000000000031') as event_status,
  (select count(*) from public.invitations
    where event_id = '01100110-0110-4110-8110-000000000031') as scenario_invitations,
  (select count(*) from public.attendance_records
    where event_id = '01100110-0110-4110-8110-000000000031') as attendance_rows;

-- Expected: 5 people, 2 role assignments of which 1 is in effect, 1 event whose
-- status is `approved`, 3 invitations, 0 attendance rows.

commit;
