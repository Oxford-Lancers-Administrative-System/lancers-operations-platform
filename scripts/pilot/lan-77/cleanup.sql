-- LAN-77 audience confirmation and approval — CLEANUP.
--
-- Removes this scenario's rows and nothing else, in dependency-safe order.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- TWO KINDS OF ROW, AND TWO SHAPES OF DELETE
--
--   * Rows **setup.sql** created carry a deterministic primary key, and are
--     deleted one id at a time — `id = '…'` — with a second conjunct proving
--     the sentinel. That is the ordinary shape every earlier scenario uses.
--
--   * Rows the **application** created when Brian approved the event —
--     audience members, invitations, notification jobs, audit rows — have keys
--     PostgreSQL generated, so no script can name them. They are deleted by
--     their scenario event, and every such statement carries BOTH halves of the
--     marker as two independent conjuncts: the event's deterministic id, and
--     the event's sentinel. A row survives unless its event satisfies both.
--
--     That is the second shape in docs/pilot-data-runbook.md § The ownership
--     marker, and using it is an owner decision — see
--     `## Ownership marker: sentinel only` in README.md, and this scenario's
--     entry in `SENTINEL_ONLY_DELETES` in tests/pilot-data-contract.test.ts.
--
-- WHAT IT DELIBERATELY LEAVES
--   * The season. It is the permanent pilot foundation's, never this scenario's.
--   * Every durable pilot identity, operator account, role assignment and
--     access grant. Nothing here touches `auth`, `operator_accounts` or
--     `role_assignments`.
--   * Every audit row that is not about a scenario event — including the ones
--     recording what Brian did elsewhere while the scenario was installed.
--
-- SAFE TO RUN TWICE, and safe to run before setup has ever run: every statement
-- is a `delete … where`, so a second run removes nothing and reports zero.
--
-- SAFE TO RUN AT ANY POINT IN THE MATRIX. The approval scenario may be a draft,
-- may be approved with invitations and jobs, or may be half-tested; all three
-- clean up identically, because the deletes are driven by what exists rather
-- than by what the matrix expected.
--
-- ORDER MATTERS, and the schema enforces it:
--   delivery_results → notification_jobs → responses → invitations
--   → event_audience_members → audit → events
--   → status events → memberships → contact points → people
-- `notification_jobs.invitation_id` and `invitations.audience_member_id` are
-- both `on delete restrict`, so any other order fails rather than cascading —
-- which is the schema protecting the audit trail, not an obstacle.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight: make the target reviewable BEFORE anything is deleted
-- ---------------------------------------------------------------------------
select
  'LAN-77 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77') as scenario_people,
  (select count(*) from public.events where name like '%PILOT-LAN-77%') as scenario_events,
  (
    select count(*) from public.event_audience_members
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')
  ) as scenario_audience_rows,
  (
    select count(*) from public.invitations
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')
  ) as scenario_invitations,
  (
    select count(*) from public.notification_jobs
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')
  ) as scenario_jobs,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.events) as event_rows_before;

-- ---------------------------------------------------------------------------
-- Refuse to run against rows that are not this scenario's
-- ---------------------------------------------------------------------------
-- The ids below are deleted by id. If one of them belongs to something that is
-- not this scenario, the id block has collided with real club data and deleting
-- it would destroy a real record. Abort rather than guess.
do $preflight$
declare
  scenario_events constant uuid[] := array[
    '00770077-0077-4077-8077-000000000050',
    '00770077-0077-4077-8077-000000000051'
  ]::uuid[];
  scenario_people constant uuid[] := array[
    '00770077-0077-4077-8077-000000000010',
    '00770077-0077-4077-8077-000000000011',
    '00770077-0077-4077-8077-000000000012'
  ]::uuid[];
  scenario_memberships constant uuid[] := array[
    '00770077-0077-4077-8077-000000000020',
    '00770077-0077-4077-8077-000000000021',
    '00770077-0077-4077-8077-000000000022'
  ]::uuid[];
  stray text;
begin
  -- (a) An id from the block that is not this scenario's.
  select string_agg(id::text, ', ') into stray
  from public.events
  where id = any(scenario_events) and name not like '%PILOT-LAN-77%';

  if stray is not null then
    raise exception
      'LAN-77 cleanup: event(s) % carry this scenario''s id but not its sentinel. Refusing to delete anything.',
      stray;
  end if;

  select string_agg(id::text, ', ') into stray
  from public.people
  where id = any(scenario_people) and coalesce((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1), '') <> 'PILOT-LAN-77';

  if stray is not null then
    raise exception
      'LAN-77 cleanup: person/people % carry this scenario''s id but not its sentinel. Refusing to delete anything.',
      stray;
  end if;

  -- (b) The scenario people must not have acquired anything this script does
  -- not know how to remove. A membership in another season, attendance, or an
  -- invitation to a real event would mean somebody used them for something
  -- else, and a blind delete would either fail on a foreign key or destroy it.
  if exists (
    select 1 from public.season_memberships m
    where m.person_id = any(scenario_people)
      and not (m.id = any(scenario_memberships))
  ) then
    raise exception
      'LAN-77 cleanup: a scenario person holds a membership this script did not create. Resolve it by hand.';
  end if;

  if exists (
    select 1 from public.attendance_records a
    where a.person_id = any(scenario_people)
       or a.season_membership_id = any(scenario_memberships)
  ) then
    raise exception
      'LAN-77 cleanup: a scenario person has attendance recorded. That is beyond this scenario; resolve it by hand.';
  end if;

  if exists (
    select 1 from public.invitations i
    where (i.person_id = any(scenario_people)
           or i.season_membership_id = any(scenario_memberships))
      and not (i.event_id = any(scenario_events))
  ) then
    raise exception
      'LAN-77 cleanup: a scenario person is invited to an event outside this scenario. Resolve it by hand.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Delivery results, then notification jobs
-- ---------------------------------------------------------------------------
-- Sentinel-only shape: both conjuncts, and both required. There will be no
-- delivery results until LAN-78 dispatches anything; the statement is here so
-- this file does not silently stop working the day that lands.
delete from public.delivery_results
where notification_job_id in (select id from public.notification_jobs where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051'))
  and notification_job_id in (select id from public.notification_jobs where event_id in (select id from public.events where name like '%PILOT-LAN-77%'));

-- Removes both the blocker setup.sql planted and every job the approval
-- transaction created, in one statement, because both hang off the same events.
delete from public.notification_jobs
where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051')
  and event_id in (select id from public.events where name like '%PILOT-LAN-77%');

-- ---------------------------------------------------------------------------
-- 2. Responses, then invitations
-- ---------------------------------------------------------------------------
-- Nothing in LAN-77 creates a response — the RSVP link is LAN-79 — but an
-- invitation carrying one cannot be deleted while it exists, and the scenario
-- may still be installed when that issue is being tested.
delete from public.question_responses
where invitation_id in (select id from public.invitations where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051'))
  and invitation_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-77%'));

delete from public.rsvp_responses
where invitation_id in (select id from public.invitations where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051'))
  and invitation_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-77%'));

delete from public.invitations
where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051')
  and event_id in (select id from public.events where name like '%PILOT-LAN-77%');

-- ---------------------------------------------------------------------------
-- 3. The resolved audience
-- ---------------------------------------------------------------------------
delete from public.event_audience_members
where event_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051')
  and event_id in (select id from public.events where name like '%PILOT-LAN-77%');

-- ---------------------------------------------------------------------------
-- 4. Audit rows about the scenario events
-- ---------------------------------------------------------------------------
-- Bounded by entity, so the approval's own audit rows go and nothing else does.
-- Audit history for every other entity — including whatever else Brian did
-- while this scenario was installed — is untouched.
delete from public.audit_events
where entity_id in ('00770077-0077-4077-8077-000000000050', '00770077-0077-4077-8077-000000000051')
  and entity_id in (select id from public.events where name like '%PILOT-LAN-77%');

-- ---------------------------------------------------------------------------
-- 5. The events
-- ---------------------------------------------------------------------------
-- Keyed, one id at a time, each with the sentinel as its second conjunct.
delete from public.events
where id = '00770077-0077-4077-8077-000000000050'
  and name like '%PILOT-LAN-77%';

delete from public.events
where id = '00770077-0077-4077-8077-000000000051'
  and name like '%PILOT-LAN-77%';

-- ---------------------------------------------------------------------------
-- 6. Membership history
-- ---------------------------------------------------------------------------
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000040'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000041'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000042'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000043'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000044'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000045'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000046'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000047'
  and actor_label = 'PILOT-LAN-77 setup script';
delete from public.season_membership_status_events
where id = '00770077-0077-4077-8077-000000000048'
  and actor_label = 'PILOT-LAN-77 setup script';

-- ---------------------------------------------------------------------------
-- 7. The memberships
-- ---------------------------------------------------------------------------
-- Second conjunct: the membership must belong to a person carrying the
-- sentinel. `season_memberships` has no free text column of its own, which is
-- why the marker's second half is proved through the person.
delete from public.season_memberships
where id = '00770077-0077-4077-8077-000000000020'
  and person_id in (select id from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77');
delete from public.season_memberships
where id = '00770077-0077-4077-8077-000000000021'
  and person_id in (select id from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77');
delete from public.season_memberships
where id = '00770077-0077-4077-8077-000000000022'
  and person_id in (select id from public.people where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77');

-- ---------------------------------------------------------------------------
-- 8. Contact points
-- ---------------------------------------------------------------------------
-- `contact_points` cascades from `people`, so these are belt and braces.
delete from public.contact_points
where id = '00770077-0077-4077-8077-000000000030'
  and source = 'PILOT-LAN-77 setup script';
delete from public.contact_points
where id = '00770077-0077-4077-8077-000000000031'
  and source = 'PILOT-LAN-77 setup script';
delete from public.contact_points
where id = '00770077-0077-4077-8077-000000000032'
  and source = 'PILOT-LAN-77 setup script';
delete from public.contact_points
where id = '00770077-0077-4077-8077-000000000033'
  and source = 'PILOT-LAN-77 setup script';

-- ---------------------------------------------------------------------------
-- 9. The people
-- ---------------------------------------------------------------------------
delete from public.people
where id = '00770077-0077-4077-8077-000000000010'
  and (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77';
delete from public.people
where id = '00770077-0077-4077-8077-000000000011'
  and (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77';
delete from public.people
where id = '00770077-0077-4077-8077-000000000012'
  and (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77';

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Every count must be zero except the last two, which are what must SURVIVE.
select
  'LAN-77 pilot cleanup — removed' as check,
  (select count(*) from public.people
    where (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) = 'PILOT-LAN-77') as scenario_people_remaining,
  (select count(*) from public.contact_points
    where source = 'PILOT-LAN-77 setup script') as scenario_contact_points_remaining,
  (select count(*) from public.season_memberships
    where id in ('00770077-0077-4077-8077-000000000020',
                 '00770077-0077-4077-8077-000000000021',
                 '00770077-0077-4077-8077-000000000022')) as scenario_memberships_remaining,
  (select count(*) from public.season_membership_status_events
    where actor_label = 'PILOT-LAN-77 setup script') as scenario_status_events_remaining,
  (select count(*) from public.events
    where name like '%PILOT-LAN-77%') as scenario_events_remaining,
  (select count(*) from public.event_audience_members
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')) as scenario_audience_remaining,
  (select count(*) from public.invitations
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')) as scenario_invitations_remaining,
  (select count(*) from public.notification_jobs
    where event_id in ('00770077-0077-4077-8077-000000000050',
                       '00770077-0077-4077-8077-000000000051')) as scenario_jobs_remaining,
  -- Not zero. These prove the script left the foundation alone.
  (select count(*) from public.seasons
    where status in ('open', 'active')) as open_seasons_surviving,
  (select count(*) from public.people
    where coalesce((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1), '') <> 'PILOT-LAN-77') as other_people_surviving;

commit;
