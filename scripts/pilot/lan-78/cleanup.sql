-- LAN-78 secure RSVP links and automated delivery — CLEANUP.
--
-- Removes this scenario's rows, and only this scenario's rows.
--
-- Run by a human, after the delivery matrix in README.md has been worked
-- through and accepted. Never by a migration, a seed, CI, a deploy or the app.
--
-- TWO OWNERSHIP SHAPES, AND WHY BOTH ARE HERE
--
-- Most of what goes was written by setup.sql and carries a deterministic
-- identifier, so it is deleted by `id = '…'` conjoined with the sentinel. That
-- is the ordinary shape, and the strongest one available.
--
-- Six statements cannot use it, because the rows they remove were created by
-- the **application** while the scenario was in use: the RSVP access tokens a
-- retry mints, the further delivery attempts and results a retry produces, the
-- callbacks Meta sends, and the audit rows both write. PostgreSQL generated
-- their identifiers inside a transaction no script participated in, so no key
-- exists to delete by. Those six use the sentinel-only shape recorded in
-- docs/adr/0019-application-created-pilot-rows.md, are pinned literally in
-- tests/pilot-data-contract.test.ts, and are declared in README.md under
-- "## Ownership marker: sentinel only".
--
-- Every one of them is still doubly qualified: the scenario's own event
-- identifier, AND the sentinel in `events.name`. Neither alone would do — the
-- identifier alone would delete a real event that happened to collide, and the
-- sentinel alone would delete anything somebody named after this scenario.
--
-- WHAT IT DELIBERATELY DOES NOT TOUCH
--   * The open season, and every membership, event and person that is not this
--     scenario's.
--   * Auth users, operator accounts, role assignments and roles — the durable
--     pilot foundation, which outlives every scenario.
--   * Audit history for anything other than this scenario's own jobs and
--     invitations.
--
-- WHAT IT REFUSES RATHER THAN WIDENS
--   If the scenario has acquired rows this script has no business deleting — an
--   RSVP response, an attendance record, a schedule change — it aborts and says
--   so. Those are real history, and a cleanup that quietly removed them to get
--   itself unstuck would be worse than one that stops.
--
-- Safe to run twice: every delete is idempotent, and a second run removes
-- nothing because the first removed it all.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: what is about to be removed
-- ---------------------------------------------------------------------------
select
  'LAN-78 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-78%') as scenario_people,
  (select count(*) from public.events
    where id = '00780078-0078-4078-8078-000000000050'
      and name like '%PILOT-LAN-78%') as scenario_events,
  (select count(*) from public.notification_jobs
    where event_id = '00780078-0078-4078-8078-000000000050') as scenario_jobs,
  (select count(*) from public.delivery_attempts
    where notification_job_id in
      (select id from public.notification_jobs
        where event_id = '00780078-0078-4078-8078-000000000050')) as scenario_attempts,
  (select count(*) from public.rsvp_access_tokens
    where invitation_id in
      (select id from public.invitations
        where event_id = '00780078-0078-4078-8078-000000000050')) as tokens_the_app_issued,
  (select count(*) from public.delivery_callbacks
    where delivery_attempt_id in
      (select id from public.delivery_attempts where notification_job_id in
        (select id from public.notification_jobs
          where event_id = '00780078-0078-4078-8078-000000000050'))) as callbacks_received,
  -- Untouched by this script, and reported so their survival is visible rather
  -- than assumed.
  (select count(*) from public.people
    where known_as is distinct from 'PILOT-LAN-78 Delivery') as people_that_stay,
  (select count(*) from public.operator_accounts) as operator_accounts_that_stay,
  (select count(*) from public.role_assignments) as role_assignments_that_stay,
  (select count(*) from public.audit_events) as audit_rows_before;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: refuse rather than widen
-- ---------------------------------------------------------------------------
-- Each guard below covers a foreign key PostgreSQL would otherwise follow into
-- rows this script has no mandate to remove. Every one aborts.
do $preflight$
declare
  scenario_event constant uuid := '00780078-0078-4078-8078-000000000050';
  offending integer;
begin
  if not exists (
    select 1 from public.events
     where id = scenario_event and name like '%PILOT-LAN-78%'
  ) and exists (select 1 from public.events where id = scenario_event) then
    raise exception
      'LAN-78 pilot cleanup: an event with this scenario''s identifier exists but does not carry the PILOT-LAN-78 sentinel. Refusing to touch it.';
  end if;

  select count(*) into offending
    from public.rsvp_responses
   where invitation_id in (select id from public.invitations where event_id = scenario_event);
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % RSVP response(s) exist for this scenario. Those are real answers and this script will not delete them — remove them deliberately, or leave the scenario in place.',
      offending;
  end if;

  select count(*) into offending
    from public.question_responses
   where invitation_id in (select id from public.invitations where event_id = scenario_event);
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % question response(s) exist for this scenario. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.attendance_records where event_id = scenario_event;
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % attendance record(s) exist for this scenario''s event. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.schedule_changes where event_id = scenario_event;
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % schedule change(s) exist for this scenario''s event. Those are history; refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.event_questions where event_id = scenario_event;
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % event question(s) exist for this scenario''s event. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.season_membership_status_events
   where season_membership_id in (
     select id from public.season_memberships
      where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%'));
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % membership status event(s) exist for this scenario''s people. Refusing to delete membership history.',
      offending;
  end if;

  select count(*) into offending
    from public.onboarding_items
   where season_membership_id in (
     select id from public.season_memberships
      where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%'));
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % onboarding item(s) hang off this scenario''s memberships. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.availability_statuses
   where season_membership_id in (
     select id from public.season_memberships
      where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%'));
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % availability status(es) exist for this scenario''s memberships. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.position_assignments
   where season_membership_id in (
     select id from public.season_memberships
      where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%'));
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % position assignment(s) exist for this scenario''s memberships. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.jersey_assignments
   where season_membership_id in (
     select id from public.season_memberships
      where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%'));
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % jersey assignment(s) exist for this scenario''s memberships. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.person_aliases
   where person_id in (select id from public.people where known_as like 'PILOT-LAN-78%');
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: % person alias(es) exist for this scenario''s people. Refusing to delete them.',
      offending;
  end if;

  select count(*) into offending
    from public.audit_events
   where actor_person_id in (select id from public.people where known_as like 'PILOT-LAN-78%');
  if offending > 0 then
    raise exception
      'LAN-78 pilot cleanup: this scenario''s people are named as the actor on % audit row(s). They cannot be deleted without destroying audit history — leave the scenario in place.',
      offending;
  end if;

  raise notice 'LAN-78 pilot cleanup: preflight passed.';
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- The application's own rows — sentinel-only, and pinned
-- ---------------------------------------------------------------------------

delete from public.delivery_callbacks
 where delivery_attempt_id in (select id from public.delivery_attempts where notification_job_id in (select id from public.notification_jobs where event_id in ('00780078-0078-4078-8078-000000000050')))
   and delivery_attempt_id in (select id from public.delivery_attempts where notification_job_id in (select id from public.notification_jobs where event_id in (select id from public.events where name like '%PILOT-LAN-78%')));

delete from public.delivery_results
 where notification_job_id in (select id from public.notification_jobs where event_id in ('00780078-0078-4078-8078-000000000050'))
   and notification_job_id in (select id from public.notification_jobs where event_id in (select id from public.events where name like '%PILOT-LAN-78%'));

delete from public.delivery_attempts
 where notification_job_id in (select id from public.notification_jobs where event_id in ('00780078-0078-4078-8078-000000000050'))
   and notification_job_id in (select id from public.notification_jobs where event_id in (select id from public.events where name like '%PILOT-LAN-78%'));

delete from public.rsvp_access_tokens
 where invitation_id in (select id from public.invitations where event_id in ('00780078-0078-4078-8078-000000000050'))
   and invitation_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-78%'));

-- `entity_table` is named explicitly. Without it these two deletes are safe
-- only *incidentally* — because a v4 identifier does not collide across tables —
-- and safety by coincidence is the thing this file exists not to rely on.
delete from public.audit_events
 where entity_table = 'notification_jobs'
   and entity_id in (select id from public.notification_jobs where event_id in ('00780078-0078-4078-8078-000000000050'))
   and entity_id in (select id from public.notification_jobs where event_id in (select id from public.events where name like '%PILOT-LAN-78%'));

delete from public.audit_events
 where entity_table = 'invitations'
   and entity_id in (select id from public.invitations where event_id in ('00780078-0078-4078-8078-000000000050'))
   and entity_id in (select id from public.invitations where event_id in (select id from public.events where name like '%PILOT-LAN-78%'));

-- ---------------------------------------------------------------------------
-- Everything setup.sql wrote — by key, conjoined with the sentinel
-- ---------------------------------------------------------------------------
-- Dependency order: jobs reference invitations, invitations reference the
-- audience through the composite key that binds them to it, and the audience
-- references the event.

delete from public.notification_jobs
 where id = '00780078-0078-4078-8078-000000000081'
   and idempotency_key like 'PILOT-LAN-78:%';

delete from public.notification_jobs
 where id = '00780078-0078-4078-8078-000000000082'
   and idempotency_key like 'PILOT-LAN-78:%';

delete from public.notification_jobs
 where id = '00780078-0078-4078-8078-000000000083'
   and idempotency_key like 'PILOT-LAN-78:%';

delete from public.invitations
 where id = '00780078-0078-4078-8078-000000000071'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.invitations
 where id = '00780078-0078-4078-8078-000000000072'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.invitations
 where id = '00780078-0078-4078-8078-000000000073'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.event_audience_members
 where id = '00780078-0078-4078-8078-000000000061'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.event_audience_members
 where id = '00780078-0078-4078-8078-000000000062'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.event_audience_members
 where id = '00780078-0078-4078-8078-000000000063'
   and event_id = '00780078-0078-4078-8078-000000000050';

delete from public.events
 where id = '00780078-0078-4078-8078-000000000050'
   and name like '%PILOT-LAN-78%';

delete from public.season_memberships
 where id = '00780078-0078-4078-8078-000000000021'
   and person_id = '00780078-0078-4078-8078-000000000001';

delete from public.season_memberships
 where id = '00780078-0078-4078-8078-000000000022'
   and person_id = '00780078-0078-4078-8078-000000000002';

delete from public.season_memberships
 where id = '00780078-0078-4078-8078-000000000023'
   and person_id = '00780078-0078-4078-8078-000000000003';

delete from public.contact_points
 where id = '00780078-0078-4078-8078-000000000011'
   and source = 'PILOT-LAN-78';

delete from public.contact_points
 where id = '00780078-0078-4078-8078-000000000012'
   and source = 'PILOT-LAN-78';

delete from public.contact_points
 where id = '00780078-0078-4078-8078-000000000013'
   and source = 'PILOT-LAN-78';

delete from public.people
 where id = '00780078-0078-4078-8078-000000000001'
   and known_as like 'PILOT-LAN-78%';

delete from public.people
 where id = '00780078-0078-4078-8078-000000000002'
   and known_as like 'PILOT-LAN-78%';

delete from public.people
 where id = '00780078-0078-4078-8078-000000000003'
   and known_as like 'PILOT-LAN-78%';

-- ---------------------------------------------------------------------------
-- What is left
-- ---------------------------------------------------------------------------
-- Every scenario count should be zero, and every foundation count unchanged
-- from the preflight above. Read this before committing.
select
  'LAN-78 pilot cleanup — remaining' as check,
  (select count(*) from public.people
    where known_as like 'PILOT-LAN-78%') as scenario_people,
  (select count(*) from public.contact_points
    where source = 'PILOT-LAN-78') as scenario_contact_points,
  (select count(*) from public.events
    where name like '%PILOT-LAN-78%') as scenario_events,
  (select count(*) from public.invitations
    where event_id = '00780078-0078-4078-8078-000000000050') as scenario_invitations,
  (select count(*) from public.notification_jobs
    where event_id = '00780078-0078-4078-8078-000000000050') as scenario_jobs,
  (select count(*) from public.rsvp_access_tokens
    where invitation_id in (select id from public.invitations
      where event_id = '00780078-0078-4078-8078-000000000050')) as scenario_tokens,
  (select count(*) from public.operator_accounts) as operator_accounts_that_stayed,
  (select count(*) from public.role_assignments) as role_assignments_that_stayed,
  (select count(*) from public.audit_events) as audit_rows_after;

commit;
