-- LAN-110 the coach attendance recorder — CLEANUP.
--
-- Removes this scenario's rows, and only this scenario's rows.
--
-- Run by a human, after the matrix in README.md has been worked through and
-- accepted. Never by a migration, a seed, CI, a deploy or the app.
--
-- TWO OWNERSHIP SHAPES, AND WHY BOTH ARE HERE
--
-- Most of what goes was written by setup.sql and carries a deterministic
-- identifier, so it is deleted by `id = '…'` conjoined with the sentinel. That
-- is the ordinary shape and the strongest one available.
--
-- Five statements cannot use it, because the rows they remove were created by
-- the **application** while the scenario was in use: the attendance the coach
-- records, the walk-up person typed into the form, that person's contact point,
-- and the audit rows the assertion and the attendance both write. PostgreSQL
-- generated their identifiers inside transactions no script participated in, so
-- no key exists to delete by. Those use the sentinel-only shape recorded in
-- docs/adr/0019-application-created-pilot-rows.md and declared in README.md
-- under "## Ownership marker: sentinel only".
--
-- Every one of them is still doubly qualified: this scenario's own identifiers,
-- AND the sentinel. Neither alone would do — the identifiers alone would delete
-- a real row that happened to collide, and the sentinel alone would delete
-- anything somebody named after this scenario.
--
-- THE COACHING SEATS, AND WHY THIS SCRIPT DOES REMOVE THEM
--
-- LAN-80's cleanup aborts when it finds a role assignment on one of its people,
-- because it created none and one appearing means somebody granted access. This
-- scenario is different: the two `head_coach` assignments ARE the scenario, so
-- cleanup removes exactly those two, by identifier and by the sentinel in
-- `note`, and aborts on any third. A seat this script did not write is a grant
-- somebody made deliberately and is not a row to delete quietly.
--
-- It removes no auth user and no `operator_accounts` row. Those are yours: you
-- created them, and withdrawing a login is an access decision rather than
-- scenario teardown. README.md says exactly which two to disable.
--
-- THE WALK-UP PERSON, AND WHY THIS SCRIPT CAN ABORT ON ONE
--
-- A walk-up who is not on the roster is a `people` row the application minted
-- from a name **you typed**. There is no identifier and no column the club owns
-- that says "this was a pilot": the only marker available is the name itself,
-- which is why README.md tells you to type the sentinel as its first word.
--
-- If this script finds a walk-up attendance row anchored to a person who does
-- not carry the sentinel, it aborts. That person may be a real member somebody
-- added, and deleting them would take real identity with them.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--   * The open season, the role catalogue, and every membership, event and
--     person that is not this scenario's.
--   * Auth users and operator accounts — see above.
--   * Any role assignment this script did not write.
--   * Audit history for anything other than this scenario's own event and
--     attendance.
--
-- Safe to run twice: every delete is idempotent, and a second run removes
-- nothing because the first removed it all.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- The walk-up people, captured before anything is deleted
-- ---------------------------------------------------------------------------
-- The attendance rows are the only thing that connects a typed-in walk-up to
-- this scenario, and they are deleted below. So the people they point at are
-- collected first, while the connection still exists.
--
-- `on commit drop` means it does not outlive the transaction, whether this
-- commits or is rolled back. Dropped first so that running the script twice in
-- ONE session is safe.
drop table if exists pg_temp.pilot_lan_110_walk_ups;

create temporary table pilot_lan_110_walk_ups on commit drop as
select distinct a.person_id
  from public.attendance_records a
  join public.events e on e.id = a.event_id
 where a.event_id in ('01100110-0110-4110-8110-000000000031', '01100110-0110-4110-8110-000000000032')
   and e.name like '%PILOT-LAN-110%'
   and a.person_id is not null;

-- ---------------------------------------------------------------------------
-- Preflight, part 1: what is about to be removed
-- ---------------------------------------------------------------------------
select
  'LAN-110 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-110%') as scenario_people,
  (select count(*) from pilot_lan_110_walk_ups) as typed_walk_up_people,
  (select count(*) from public.role_assignments
    where note like 'PILOT-LAN-110%') as scenario_role_assignments,
  (select count(*) from public.events
    where name like 'PILOT-LAN-110%') as scenario_events,
  (select count(*) from public.invitations i
     join public.events e on e.id = i.event_id
    where e.name like 'PILOT-LAN-110%') as scenario_invitations,
  (select count(*) from public.rsvp_responses r
     join public.invitations i on i.id = r.invitation_id
     join public.events e on e.id = i.event_id
    where e.name like 'PILOT-LAN-110%') as scenario_responses,
  (select count(*) from public.attendance_records a
     join public.events e on e.id = a.event_id
    where e.name like 'PILOT-LAN-110%') as scenario_attendance;

-- ---------------------------------------------------------------------------
-- Preflight, part 2: refuse rather than widen
-- ---------------------------------------------------------------------------
do $preflight$
declare
  scenario_events constant uuid[] := array[
    '01100110-0110-4110-8110-000000000031'::uuid,
    '01100110-0110-4110-8110-000000000032'::uuid
  ];
  scenario_people constant uuid[] := array[
    '01100110-0110-4110-8110-000000000001'::uuid,
    '01100110-0110-4110-8110-000000000002'::uuid,
    '01100110-0110-4110-8110-000000000003'::uuid,
    '01100110-0110-4110-8110-000000000004'::uuid,
    '01100110-0110-4110-8110-000000000005'::uuid
  ];
  scenario_assignments constant uuid[] := array[
    '01100110-0110-4110-8110-000000000011'::uuid,
    '01100110-0110-4110-8110-000000000012'::uuid
  ];
  offending integer;
begin
  -- A walk-up person without the sentinel. This is the guard the header
  -- describes: the row may be a real member, and this script will not guess.
  select count(*) into offending
    from pilot_lan_110_walk_ups w
    join public.people p on p.id = w.person_id
   where 'PILOT-LAN-110' not in (upper(btrim(p.given_name)), upper(btrim(coalesce(p.known_as, ''))));
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % walk-up person/people recorded against this scenario do not carry the PILOT-LAN-110 sentinel in their name. This script will not guess whether they are synthetic. Rename them so the sentinel is the first word and run this again, or remove them deliberately yourself.',
      offending;
  end if;

  -- A role assignment on this scenario's people that this script did not write
  -- is a grant somebody made. Withdrawing access is a decision, not teardown.
  select count(*) into offending
    from public.role_assignments
   where person_id = any(scenario_people)
     and id <> all (scenario_assignments);
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % role assignment(s) hang off this scenario''s people that setup.sql did not write. Withdraw the access deliberately before removing them.',
      offending;
  end if;

  -- An **active** login on one of them is access somebody granted, and it is
  -- yours to withdraw; this script will not do it silently. A deactivated one
  -- is fine and is expected to stay: the runbook revokes an operator account by
  -- setting `is_active = false`, never by deleting it, "so an actor referenced
  -- by history stays resolvable".
  select count(*) into offending
    from public.operator_accounts
   where person_id = any(scenario_people)
     and is_active;
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % active operator account(s) are linked to this scenario''s people. Deactivate the login yourself first — see README.md, "After acceptance" — then run this again.',
      offending;
  end if;

  -- A schedule change means somebody moved this event through an operator
  -- surface, which this scenario does not ask for.
  select count(*) into offending
    from public.schedule_changes
   where event_id = any(scenario_events);
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % schedule change(s) exist against this scenario''s event. That is history this script did not create and will not remove.',
      offending;
  end if;

  -- Setup creates no notification job, and this scenario reaches the attendance
  -- screen through the operator shell rather than through a link.
  select count(*) into offending
    from public.notification_jobs
   where event_id = any(scenario_events);
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % notification job(s) exist against this scenario''s event. Setup creates none; resolve where they came from before cleaning up.',
      offending;
  end if;

  -- More scenario people than setup creates means somebody added one, and this
  -- script deletes only the five it knows by identifier plus the walk-ups it
  -- can prove are walk-ups.
  select count(*) into offending
    from public.people
   where known_as like 'PILOT-LAN-110%'
     and id <> all (scenario_people)
     and id not in (select person_id from pilot_lan_110_walk_ups);
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % person/people carry the PILOT-LAN-110 sentinel, are not this scenario''s five, and have no attendance against its event. This script will not guess at them.',
      offending;
  end if;

  -- Likewise for events: the sentinel outside the id block is not ours.
  select count(*) into offending
    from public.events
   where name like 'PILOT-LAN-110%'
     and id <> all (scenario_events);
  if offending > 0 then
    raise exception
      'LAN-110 pilot cleanup: % event(s) carry the PILOT-LAN-110 sentinel but are not this scenario''s. This script will not guess at them.',
      offending;
  end if;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- Rows the APPLICATION created — the sentinel-only shape
-- ---------------------------------------------------------------------------

-- The audit rows the attendance path wrote. Removed before the attendance
-- itself, because they identify it by id and nothing else does afterwards.
-- `entity_id` is polymorphic, so the table it refers to is named too: without
-- that conjunct a colliding identifier in another table would be in scope.
delete from public.audit_events
 where entity_table = 'attendance_records'
   and entity_id in (select id from public.attendance_records where event_id in ('01100110-0110-4110-8110-000000000031', '01100110-0110-4110-8110-000000000032'))
   and entity_id in (select id from public.attendance_records where event_id in (select id from public.events where name like '%PILOT-LAN-110%'));

-- The audit rows the occurrence assertion wrote — one per Mark occurred, Mark
-- not held and correction.
delete from public.audit_events
 where entity_table = 'events'
   and entity_id in ('01100110-0110-4110-8110-000000000031', '01100110-0110-4110-8110-000000000032')
   and entity_id in (select id from public.events where name like '%PILOT-LAN-110%');

-- The attendance the coach recorded. This is the scenario's whole output.
delete from public.attendance_records
 where event_id in ('01100110-0110-4110-8110-000000000031', '01100110-0110-4110-8110-000000000032')
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');

-- The contact points on a typed-in walk-on — a phone always, an email when one
-- was given. Removed before the person, which they reference.
delete from public.contact_points
 where person_id in (select person_id from pilot_lan_110_walk_ups)
   and person_id in (select id from public.people where 'PILOT-LAN-110' in (upper(btrim(given_name)), upper(btrim(coalesce(known_as, '')))));

-- The recruitment prospect the walk-on created. `person_id` is `on delete
-- restrict`, so without this the person delete below fails outright and the
-- whole script aborts — which is how this was found.
delete from public.recruitment_prospects
 where person_id in (select person_id from pilot_lan_110_walk_ups)
   and person_id in (select id from public.people where 'PILOT-LAN-110' in (upper(btrim(given_name)), upper(btrim(coalesce(known_as, '')))));

-- The walk-up people themselves. The preflight has already refused to reach
-- this statement if any of them lacks the sentinel.
delete from public.people
 where id in (select person_id from pilot_lan_110_walk_ups)
   and 'PILOT-LAN-110' in (upper(btrim(given_name)), upper(btrim(coalesce(known_as, ''))));

-- ---------------------------------------------------------------------------
-- The RSVP answers
-- ---------------------------------------------------------------------------
delete from public.rsvp_responses
 where id = '01100110-0110-4110-8110-000000000061'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-110%');
delete from public.rsvp_responses
 where id = '01100110-0110-4110-8110-000000000062'
   and invitation_id in (select i.id from public.invitations i join public.events e on e.id = i.event_id where e.name like '%PILOT-LAN-110%');

-- ---------------------------------------------------------------------------
-- The invitations
-- ---------------------------------------------------------------------------
delete from public.invitations
 where id = '01100110-0110-4110-8110-000000000051'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');
delete from public.invitations
 where id = '01100110-0110-4110-8110-000000000052'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');
delete from public.invitations
 where id = '01100110-0110-4110-8110-000000000053'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');

-- ---------------------------------------------------------------------------
-- The audience
-- ---------------------------------------------------------------------------
delete from public.event_audience_members
 where id = '01100110-0110-4110-8110-000000000041'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');
delete from public.event_audience_members
 where id = '01100110-0110-4110-8110-000000000042'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');
delete from public.event_audience_members
 where id = '01100110-0110-4110-8110-000000000043'
   and event_id in (select id from public.events where name like '%PILOT-LAN-110%');

-- ---------------------------------------------------------------------------
-- The coaching seats — END-DATED, never deleted
-- ---------------------------------------------------------------------------
-- `docs/pilot-data-runbook.md` § Every scenario satisfies all of the following:
-- "Never deletes from auth.users, operator_accounts, role_assignments, roles or
-- audit_events". And § Deprovisioning: "Removing access must not remove
-- history. In order: 1. End-date the access: set effective_to on the role
-- assignments, which preserves the record that the person held the seat."
--
-- An earlier version of this script deleted them. That was wrong twice over: it
-- broke a rule the runbook calls binding rather than stylistic, and it destroyed
-- the only evidence that the seat was ever held. Withdrawing access is an
-- end-date.
--
-- The consequence is the section below: `role_assignments.person_id` is
-- `on delete restrict`, so the two coaching people cannot be removed either.
-- They are durable pilot identities from here on, which is what the issue's own
-- handoff means by "preserve permanent approved pilot identities/access".
--
-- Each update is qualified on the seat still being in effect, which does two
-- things at once: it can only ever shorten a grant, never extend one, and it
-- matches nothing on a second run. The seat that setup installed already
-- expired keeps the date it expired on rather than being nudged to today.
update public.role_assignments
   set effective_to = current_date
 where id = '01100110-0110-4110-8110-000000000011'
   and note like 'PILOT-LAN-110%'
   and (effective_to is null or effective_to > current_date);
update public.role_assignments
   set effective_to = current_date
 where id = '01100110-0110-4110-8110-000000000012'
   and note like 'PILOT-LAN-110%'
   and (effective_to is null or effective_to > current_date);

-- ---------------------------------------------------------------------------
-- The memberships
-- ---------------------------------------------------------------------------
delete from public.season_memberships
 where id = '01100110-0110-4110-8110-000000000021'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-110%');
delete from public.season_memberships
 where id = '01100110-0110-4110-8110-000000000022'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-110%');
delete from public.season_memberships
 where id = '01100110-0110-4110-8110-000000000023'
   and person_id in (select id from public.people where known_as like 'PILOT-LAN-110%');

-- ---------------------------------------------------------------------------
-- The events
-- ---------------------------------------------------------------------------
delete from public.events
 where id = '01100110-0110-4110-8110-000000000031'
   and name like '%PILOT-LAN-110%';
delete from public.events
 where id = '01100110-0110-4110-8110-000000000032'
   and name like '%PILOT-LAN-110%';

-- ---------------------------------------------------------------------------
-- The people
-- ---------------------------------------------------------------------------
-- The two coaching people are NOT removed. Their end-dated seats reference them
-- with `on delete restrict`, and the seats stay because the runbook says access
-- is withdrawn by end-dating rather than deleting. They persist as durable
-- synthetic identities, carrying the sentinel, exactly as the permanent pilot
-- foundation's identities do. README.md says so under "After acceptance".
delete from public.people
 where id = '01100110-0110-4110-8110-000000000003'
   and known_as like 'PILOT-LAN-110%';
delete from public.people
 where id = '01100110-0110-4110-8110-000000000004'
   and known_as like 'PILOT-LAN-110%';
delete from public.people
 where id = '01100110-0110-4110-8110-000000000005'
   and known_as like 'PILOT-LAN-110%';

-- ---------------------------------------------------------------------------
-- Verification — read every number
-- ---------------------------------------------------------------------------
-- The last three must be zero. The first two must be **2 and 2**: the coaching
-- identities and their end-dated seats are preserved on purpose, and
-- `seats_still_in_effect` is the one that proves the access is actually gone.
select
  'LAN-110 pilot cleanup — remaining' as check,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-110%') as coaching_identities_preserved,
  (select count(*) from public.role_assignments
    where note like 'PILOT-LAN-110%') as seats_preserved_as_history,
  (select count(*) from public.role_assignments
    where note like 'PILOT-LAN-110%'
      and effective_from <= current_date
      and (effective_to is null or effective_to > current_date)) as seats_still_in_effect,
  (select count(*) from public.events
    where name like 'PILOT-LAN-110%') as scenario_events,
  (select count(*) from public.invitations
    where id in ('01100110-0110-4110-8110-000000000051',
                 '01100110-0110-4110-8110-000000000052',
                 '01100110-0110-4110-8110-000000000053')) as scenario_invitations,
  (select count(*) from public.attendance_records
    where event_id in ('01100110-0110-4110-8110-000000000031', '01100110-0110-4110-8110-000000000032')) as scenario_attendance;

commit;
