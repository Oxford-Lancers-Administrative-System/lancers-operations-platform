-- LAN-79 the no-login RSVP page — CLEANUP.
--
-- Removes this scenario's rows, and only this scenario's rows.
--
-- Run by a human, after the matrix in README.md has been worked through and
-- accepted. Never by a migration, a seed, CI, a deploy or the app.
--
-- TWO OWNERSHIP SHAPES, AND WHY BOTH ARE HERE
--
-- Almost everything that goes was written by setup.sql and carries a
-- deterministic identifier, so it is deleted by `id = '…'` conjoined with the
-- sentinel. That is the ordinary shape and the strongest one available, and it
-- is used for all twenty-three of those rows.
--
-- Three statements cannot use it, because the rows they remove were created by
-- the **application** while the scenario was in use: the RSVP responses a
-- tester gives through the page, the audit rows those responses write, and any
-- notification job the response path cancelled. PostgreSQL generated their
-- identifiers inside a transaction no script participated in, so no key exists
-- to delete by. Those three use the sentinel-only shape recorded in
-- docs/adr/0019-application-created-pilot-rows.md, are pinned literally in
-- tests/pilot-data-contract.test.ts, and are declared in README.md under
-- "## Ownership marker: sentinel only".
--
-- Every one of them is still doubly qualified: the scenario's own event
-- identifiers, AND the sentinel in `events.name`. Neither alone would do — the
-- identifiers alone would delete a real event that happened to collide, and the
-- sentinel alone would delete anything somebody named after this scenario.
--
-- WHY THE RESPONSES GO, WHEN LAN-78's CLEANUP REFUSES TO REMOVE ONE
--
-- LAN-78's scenario has no business acquiring an RSVP response, so a response
-- found there is real history and its cleanup aborts rather than delete it.
-- Here a response is the entire point of the exercise: it is the thing the
-- tester creates, it belongs to a synthetic invitation of a synthetic person,
-- and leaving it behind would leave the scenario half-installed forever. The
-- two scripts differ because the scenarios differ, not because the rule moved.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--   * The open season, and every membership, event and person that is not this
--     scenario's.
--   * Auth users, operator accounts, role assignments and roles — the durable
--     pilot foundation, which outlives every scenario.
--   * Audit history for anything other than this scenario's own invitations.
--
-- Safe to run twice: every delete is idempotent, and a second run removes
-- nothing because the first removed it all.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1: what is about to be removed
-- ---------------------------------------------------------------------------
select
  'LAN-79 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-79%') as scenario_people,
  (select count(*) from public.events
    where name like 'PILOT-LAN-79%') as scenario_events,
  (select count(*) from public.invitations i
     join public.events e on e.id = i.event_id
    where e.name like 'PILOT-LAN-79%') as scenario_invitations,
  (select count(*) from public.rsvp_access_tokens t
     join public.invitations i on i.id = t.invitation_id
     join public.events e on e.id = i.event_id
    where e.name like 'PILOT-LAN-79%') as scenario_tokens,
  (select count(*) from public.rsvp_responses r
     join public.invitations i on i.id = r.invitation_id
     join public.events e on e.id = i.event_id
    where e.name like 'PILOT-LAN-79%') as scenario_responses;

-- ---------------------------------------------------------------------------
-- Preflight, part 2: refuse rather than widen
-- ---------------------------------------------------------------------------
-- If the scenario has acquired rows this script has no business deleting, it
-- stops. Those are either real history or evidence that something outside this
-- scenario touched its rows, and a cleanup that quietly removed them to get
-- itself unstuck would be worse than one that aborts.
do $preflight$
declare
  scenario_events constant uuid[] := array[
    '00790079-0079-4079-8079-000000000021'::uuid,
    '00790079-0079-4079-8079-000000000022'::uuid,
    '00790079-0079-4079-8079-000000000023'::uuid
  ];
  offending integer;
begin
  -- Attendance is a separate authoritative record (locked Requirement 7) and
  -- nothing in this scenario should ever create one.
  select count(*) into offending
    from public.attendance_records
   where event_id = any(scenario_events);
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % attendance record(s) exist against this scenario''s events. Attendance is real history and this script will not delete it. Remove it deliberately, or leave the scenario in place.',
      offending;
  end if;

  -- A schedule change means somebody moved one of these events through the
  -- operator surface, which this scenario does not ask for.
  select count(*) into offending
    from public.schedule_changes
   where event_id = any(scenario_events);
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % schedule change(s) exist against this scenario''s events. That is history this script did not create and will not remove.',
      offending;
  end if;

  -- Setup creates no contact point. One appearing means a person here was
  -- edited through the roster, and deleting them would take real edits with it.
  select count(*) into offending
    from public.contact_points
   where person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % contact point(s) hang off this scenario''s people. Setup creates none, so something else wrote them; resolve that before cleaning up.',
      offending;
  end if;

  -- A role assignment would mean one of these synthetic people was granted
  -- access. That is a decision to unwind deliberately, not a row to delete.
  select count(*) into offending
    from public.role_assignments
   where person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % role assignment(s) hang off this scenario''s people. Withdraw the access deliberately before removing them.',
      offending;
  end if;

  -- More scenario people than setup creates means somebody added one, and this
  -- script deletes only the five it knows by identifier.
  select count(*) into offending
    from public.people
   where known_as like 'PILOT-LAN-79%'
     and id <> all (array[
       '00790079-0079-4079-8079-000000000001'::uuid,
       '00790079-0079-4079-8079-000000000002'::uuid,
       '00790079-0079-4079-8079-000000000003'::uuid,
       '00790079-0079-4079-8079-000000000004'::uuid,
       '00790079-0079-4079-8079-000000000005'::uuid
     ]);
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % person/people carry the PILOT-LAN-79 sentinel but are not this scenario''s five. This script will not guess at them.',
      offending;
  end if;

  -- Likewise for events: the sentinel outside the id block is not ours.
  select count(*) into offending
    from public.events
   where name like 'PILOT-LAN-79%'
     and id <> all (scenario_events);
  if offending > 0 then
    raise exception
      'LAN-79 pilot cleanup: % event(s) carry the PILOT-LAN-79 sentinel but are not this scenario''s three. This script will not guess at them.',
      offending;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- Rows the APPLICATION created — the sentinel-only shape
-- ---------------------------------------------------------------------------

-- The audit rows the response path wrote. Removed first: they reference the
-- invitations by id, though not by foreign key.
-- `entity_id` is polymorphic, so the table it refers to is named too: without
-- that conjunct a colliding identifier in another table would be in scope.
delete from public.audit_events
 where entity_table = 'invitations'
   and entity_id in (select id from public.invitations where event_id in ('00790079-0079-4079-8079-000000000021', '00790079-0079-4079-8079-000000000022', '00790079-0079-4079-8079-000000000023'))
   and entity_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-79%'));

-- The answers a tester gave through the page.
delete from public.rsvp_responses
 where invitation_id in (select id from public.invitations where event_id in ('00790079-0079-4079-8079-000000000021', '00790079-0079-4079-8079-000000000022', '00790079-0079-4079-8079-000000000023'))
   and invitation_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-79%'));

-- Any notification job the response path cancelled. Setup creates none, so this
-- is normally a no-op; it is here because a future reminder surface would put
-- one here and a cleanup that missed it would block the invitation delete.
delete from public.notification_jobs
 where invitation_id in (select id from public.invitations where event_id in ('00790079-0079-4079-8079-000000000021', '00790079-0079-4079-8079-000000000022', '00790079-0079-4079-8079-000000000023'))
   and invitation_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-79%'));

-- ---------------------------------------------------------------------------
-- The RSVP links
-- ---------------------------------------------------------------------------
delete from public.rsvp_access_tokens
 where id = '00790079-0079-4079-8079-000000000051'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-79%');
delete from public.rsvp_access_tokens
 where id = '00790079-0079-4079-8079-000000000052'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-79%');
delete from public.rsvp_access_tokens
 where id = '00790079-0079-4079-8079-000000000053'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-79%');
delete from public.rsvp_access_tokens
 where id = '00790079-0079-4079-8079-000000000054'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-79%');
delete from public.rsvp_access_tokens
 where id = '00790079-0079-4079-8079-000000000055'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-79%');

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
delete from public.invitations
 where id = '00790079-0079-4079-8079-000000000041'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.invitations
 where id = '00790079-0079-4079-8079-000000000042'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.invitations
 where id = '00790079-0079-4079-8079-000000000043'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.invitations
 where id = '00790079-0079-4079-8079-000000000044'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.invitations
 where id = '00790079-0079-4079-8079-000000000045'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');

-- ---------------------------------------------------------------------------
-- The audience
-- ---------------------------------------------------------------------------
delete from public.event_audience_members
 where id = '00790079-0079-4079-8079-000000000031'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.event_audience_members
 where id = '00790079-0079-4079-8079-000000000032'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.event_audience_members
 where id = '00790079-0079-4079-8079-000000000033'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.event_audience_members
 where id = '00790079-0079-4079-8079-000000000034'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');
delete from public.event_audience_members
 where id = '00790079-0079-4079-8079-000000000035'
   and event_id in (select id from public.events where name like '%PILOT-LAN-79%');

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
delete from public.season_memberships
 where id = '00790079-0079-4079-8079-000000000011'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
delete from public.season_memberships
 where id = '00790079-0079-4079-8079-000000000012'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
delete from public.season_memberships
 where id = '00790079-0079-4079-8079-000000000013'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
delete from public.season_memberships
 where id = '00790079-0079-4079-8079-000000000014'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');
delete from public.season_memberships
 where id = '00790079-0079-4079-8079-000000000015'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-79%');

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
delete from public.events
 where id = '00790079-0079-4079-8079-000000000021'
   and name like '%PILOT-LAN-79%';
delete from public.events
 where id = '00790079-0079-4079-8079-000000000022'
   and name like '%PILOT-LAN-79%';
delete from public.events
 where id = '00790079-0079-4079-8079-000000000023'
   and name like '%PILOT-LAN-79%';

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
delete from public.people
 where id = '00790079-0079-4079-8079-000000000001'
   and known_as like 'PILOT-LAN-79%';
delete from public.people
 where id = '00790079-0079-4079-8079-000000000002'
   and known_as like 'PILOT-LAN-79%';
delete from public.people
 where id = '00790079-0079-4079-8079-000000000003'
   and known_as like 'PILOT-LAN-79%';
delete from public.people
 where id = '00790079-0079-4079-8079-000000000004'
   and known_as like 'PILOT-LAN-79%';
delete from public.people
 where id = '00790079-0079-4079-8079-000000000005'
   and known_as like 'PILOT-LAN-79%';

-- ---------------------------------------------------------------------------
-- Verification — every count below must be zero
-- ---------------------------------------------------------------------------
select
  'LAN-79 pilot cleanup — remaining' as check,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-79%') as scenario_people,
  (select count(*) from public.events
    where name like 'PILOT-LAN-79%') as scenario_events,
  (select count(*) from public.invitations
    where id in ('00790079-0079-4079-8079-000000000041', '00790079-0079-4079-8079-000000000042',
                 '00790079-0079-4079-8079-000000000043', '00790079-0079-4079-8079-000000000044',
                 '00790079-0079-4079-8079-000000000045')) as scenario_invitations,
  (select count(*) from public.rsvp_access_tokens
    where id in ('00790079-0079-4079-8079-000000000051', '00790079-0079-4079-8079-000000000052',
                 '00790079-0079-4079-8079-000000000053', '00790079-0079-4079-8079-000000000054',
                 '00790079-0079-4079-8079-000000000055')) as scenario_tokens;

commit;
