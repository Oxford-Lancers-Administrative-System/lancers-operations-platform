-- LAN-81 the Monday exception and action report — CLEANUP.
--
-- Removes this scenario's rows, and only this scenario's rows.
--
-- Run by a human, after the matrix in README.md has been worked through and
-- accepted. Never by a migration, a seed, CI, a deploy or the app.
--
-- TWO OWNERSHIP SHAPES, AND WHY BOTH ARE HERE
--
-- Most of what goes was written by setup.sql and carries a deterministic
-- identifier, so it is deleted by `id = '…'` conjoined with the sentinel — one
-- statement per row. That is the ordinary shape and the strongest available.
--
-- Three statements cannot use it, because the rows they remove were created by
-- the **application** while the scenario was in use: the weekly reports you
-- generated through the interface, the audit rows the application wrote when it
-- generated them, and the audit rows this scenario's events collected.
-- PostgreSQL generated their identifiers inside transactions no script
-- participated in, so no key exists to delete by. All three use the
-- sentinel-only shape recorded in
-- docs/adr/0019-application-created-pilot-rows.md, are pinned literally in
-- tests/pilot-data-contract.test.ts, and are declared in README.md under
-- "## Ownership marker: sentinel only".
--
-- Each is still doubly qualified. For the reports that is the open season AND
-- the sentinel inside the report's own stored content. That the sentinel really
-- is in there is not an assumption: every section names this scenario's events
-- and people, all of which carry it, and setup.sql refuses to install unless the
-- reporting window is this scenario's alone. A report of a week containing
-- nothing but this scenario is a report of this scenario.
--
-- WHY A WEEKLY REPORT CAN BE DELETED AT ALL
--
-- Invariant M5 makes a published report immutable, and nothing in the
-- application can rewrite or remove one — deliberately, and this script does not
-- weaken it. Immutable is not the same as permanent: a snapshot of a synthetic
-- rehearsal week is evidence of the rehearsal, and removing it whole is what the
-- pilot-data runbook requires of scenario data. What must never happen is a
-- report being *changed*, and no statement here does that.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--   * The open season, and every membership, event and person that is not this
--     scenario's.
--   * Auth users, operator accounts, role assignments and roles — the durable
--     pilot foundation, which outlives every scenario.
--   * Any weekly report whose stored content does not carry the sentinel. If a
--     real one exists it stays, and the guard below aborts rather than guess.
--   * Audit history for anything other than this scenario's own events and
--     reports.
--
-- Safe to run twice: every delete is idempotent, and a second run removes
-- nothing because the first removed it all.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- What is here before anything is removed
-- ---------------------------------------------------------------------------
select
  'LAN-81 pilot cleanup — before' as check,
  current_database() as database,
  current_user as connected_as,
  (select count(*) from public.people where known_as like 'PILOT-LAN-81%') as scenario_people,
  (select count(*) from public.events where name like '%PILOT-LAN-81%') as scenario_events,
  (
    select count(*) from public.weekly_reports where content::text like '%PILOT-LAN-81%'
  ) as scenario_reports,
  (select count(*) from public.weekly_reports) as all_reports;

-- ---------------------------------------------------------------------------
-- Refuse rather than guess
-- ---------------------------------------------------------------------------
-- A weekly report filed in this scenario's date range whose content does NOT
-- carry the sentinel is somebody else's row. It may be real leadership history,
-- and the whole point of the ownership rule is that a script never decides that
-- for itself.
do $preflight$
declare
  ambiguous integer;
begin
  select count(*) into ambiguous
    from public.weekly_reports w
   where w.report_on between current_date - 7 and current_date
     and w.content::text not like '%PILOT-LAN-81%';

  if ambiguous > 0 then
    raise exception
      'LAN-81 pilot cleanup: % weekly report(s) filed in this scenario''s date range do not carry the PILOT-LAN-81 sentinel in their stored content. They may be real leadership history. Remove them deliberately yourself, or re-check which date you generated for, then run this again.',
      ambiguous;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The audit rows the application wrote when you generated — sentinel only
-- ---------------------------------------------------------------------------
-- Before the reports themselves, because the subquery that identifies them
-- reads those reports. `entity_table` is a conjunct because `entity_id` is
-- polymorphic: without it a colliding identifier in another table would be in
-- scope.
delete from public.audit_events
 where entity_table = 'weekly_reports'
   and entity_id in (select id from public.weekly_reports where content::text like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The weekly reports you generated — sentinel only
-- ---------------------------------------------------------------------------
-- Every version in one statement. The composite foreign key binding a
-- supersession to its own report is `no action`, which is checked at the end of
-- the statement rather than per row, so a whole version chain goes together and
-- no ordering is needed.
delete from public.weekly_reports
 where season_id in (select id from public.seasons where status in ('open', 'active'))
   and content::text like '%PILOT-LAN-81%';

-- ---------------------------------------------------------------------------
-- The audit rows this scenario's events collected — sentinel only
-- ---------------------------------------------------------------------------
delete from public.audit_events
 where entity_table = 'events'
   and entity_id in ('00810081-0081-4081-8081-000000000021', '00810081-0081-4081-8081-000000000022', '00810081-0081-4081-8081-000000000023')
   and entity_id in (select id from public.events where name like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The attendance
-- ---------------------------------------------------------------------------
delete from public.attendance_records
 where id = '00810081-0081-4081-8081-000000000061'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.attendance_records
 where id = '00810081-0081-4081-8081-000000000062'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The answers
-- ---------------------------------------------------------------------------
delete from public.rsvp_responses
 where id = '00810081-0081-4081-8081-000000000051'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-81%');
delete from public.rsvp_responses
 where id = '00810081-0081-4081-8081-000000000052'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
delete from public.invitations
 where id = '00810081-0081-4081-8081-000000000041'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.invitations
 where id = '00810081-0081-4081-8081-000000000042'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.invitations
 where id = '00810081-0081-4081-8081-000000000043'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.invitations
 where id = '00810081-0081-4081-8081-000000000044'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.invitations
 where id = '00810081-0081-4081-8081-000000000045'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The confirmed audience
-- ---------------------------------------------------------------------------
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000031'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000032'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000033'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000034'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000035'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');
delete from public.event_audience_members
 where id = '00810081-0081-4081-8081-000000000036'
   and event_id in (select id from public.events where name like '%PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
delete from public.events
 where id = '00810081-0081-4081-8081-000000000021'
   and name like '%PILOT-LAN-81%';
delete from public.events
 where id = '00810081-0081-4081-8081-000000000022'
   and name like '%PILOT-LAN-81%';
delete from public.events
 where id = '00810081-0081-4081-8081-000000000023'
   and name like '%PILOT-LAN-81%';

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000011'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000012'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000013'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000014'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000015'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');
delete from public.season_memberships
 where id = '00810081-0081-4081-8081-000000000016'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-81%');

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
delete from public.people
 where id = '00810081-0081-4081-8081-000000000001'
   and known_as like 'PILOT-LAN-81%';
delete from public.people
 where id = '00810081-0081-4081-8081-000000000002'
   and known_as like 'PILOT-LAN-81%';
delete from public.people
 where id = '00810081-0081-4081-8081-000000000003'
   and known_as like 'PILOT-LAN-81%';
delete from public.people
 where id = '00810081-0081-4081-8081-000000000004'
   and known_as like 'PILOT-LAN-81%';
delete from public.people
 where id = '00810081-0081-4081-8081-000000000005'
   and known_as like 'PILOT-LAN-81%';
delete from public.people
 where id = '00810081-0081-4081-8081-000000000006'
   and known_as like 'PILOT-LAN-81%';

-- ---------------------------------------------------------------------------
-- Read this before you commit
-- ---------------------------------------------------------------------------
select
  'LAN-81 pilot cleanup — remaining' as check,
  (select count(*) from public.people where known_as like 'PILOT-LAN-81%') as people,
  (select count(*) from public.events where name like '%PILOT-LAN-81%') as events,
  (select count(*) from public.weekly_reports where content::text like '%PILOT-LAN-81%') as reports,
  (select count(*) from public.seasons where status in ('open', 'active')) as open_seasons_untouched;

commit;
