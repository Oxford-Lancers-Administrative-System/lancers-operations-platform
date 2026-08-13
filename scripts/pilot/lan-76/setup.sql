-- LAN-76 pilot scenario — SETUP.
--
-- This one writes NOTHING. It is a prerequisite check.
--
-- LAN-76 adds event drafting to the operator shell, and the feature test is an
-- operator creating, editing, submitting and withdrawing an event through the
-- deployed application. The rows that test produces are therefore created by
-- the application, by a human, through a browser — not by this file. What a
-- human needs before starting is an answer to "is hosted actually in a state
-- where that test means anything?", and that is all this script provides.
--
-- Manufacturing a season, a person or an event here would be worse than
-- useless: it would put club data in production that no feature reads, and it
-- would prove the application works against rows a script arranged rather than
-- against the ones hosted really has.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- OWNERSHIP MARKER — the scenario's rows are the events Brian creates through
-- the application, and they are owned by the sentinel `PILOT-LAN-76` in
-- `events.name`. There is no deterministic-identifier half, because the
-- application generates the identifier: see README.md in this directory, and
-- the `Ownership marker: sentinel only` declaration in it.
--
-- Safe to run twice, and a hundred times: it contains no `insert`, `update`,
-- `delete`, `create` or `alter` of any kind. The transaction exists so that a
-- refusal leaves nothing behind, not because there is anything to roll back.
--
-- Paired with cleanup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target reviewable BEFORE anything is read
-- ---------------------------------------------------------------------------
-- Read this result set before you read anything else. If the database or the
-- user is not what you intended, roll back and reconnect.
select
  'LAN-76 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.seasons) as season_rows,
  (select count(*) from public.events) as event_rows,
  (
    select count(*) from public.events
     where name like '%PILOT-LAN-76%'
  ) as scenario_events_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
-- Every check below raises. None of them warns and continues: the point of
-- this file is to stop a test that could not have meant anything, before a
-- human spends an afternoon on it.
do $preflight$
declare
  required_migration constant text := '20260810120700';
  operating_seasons integer;
begin
  -- (a) The schema this feature was written against must actually be applied.
  --     Without this, every check below fails with column-level errors that
  --     read like a bug in the script rather than "you are on the wrong
  --     schema".
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'LAN-76 pilot setup refused: no supabase_migrations.schema_migrations. This does not look like a Supabase-managed database.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-76 pilot setup refused: migration % is not applied. The events table this feature writes to does not exist yet.',
      required_migration;
  end if;

  -- (b) The application records an event against the season the club is
  --     operating, and refuses when there is none. A test run against a
  --     database with no open season proves only that the refusal works.
  select count(*) into operating_seasons
    from public.seasons
   where status in ('open', 'active', 'closing');

  if operating_seasons = 0 then
    raise exception
      'LAN-76 pilot setup refused: no season is open, active or closing. Open a season before testing event drafting.';
  end if;

  -- (c) Two operating seasons is not an error the application refuses — it
  --     takes the most recent — but it does make "which season did my test
  --     event land in?" ambiguous to a human reading the result afterwards.
  --     Resolve it before testing, not after.
  if operating_seasons > 1 then
    raise exception
      'LAN-76 pilot setup refused: % seasons are open, active or closing. Close the one that is over, so the season a test event lands in is unambiguous.',
      operating_seasons;
  end if;

  -- (d) Somebody has to be able to sign in and press the buttons.
  if not exists (
    select 1
      from public.operator_accounts a
      join public.people p on p.id = a.person_id
     where a.is_active
  ) then
    raise exception
      'LAN-76 pilot setup refused: no active operator account is linked to a person. Provision a pilot identity first — docs/pilot-data-runbook.md § Provisioning a durable pilot identity.';
  end if;

  -- (e) And that somebody has to hold one of the four seats that manage the
  --     club calendar. Brian's LAN-76 clarification: the calendar is the
  --     President's, Vice-President's, Secretary's and General Manager's, and
  --     nobody else's. An active operator without one of those seats can open
  --     the events list and will be refused every action on it, so a test run
  --     as one would prove only that the refusal works.
  --
  --     Effective-dating is applied here exactly as the application applies it:
  --     a seat recorded to begin later is not held yet, and one whose last day
  --     has passed is over.
  if not exists (
    select 1
      from public.operator_accounts a
      join public.role_assignments ra on ra.person_id = a.person_id
      join public.roles r on r.id = ra.role_id
     where a.is_active
       and r.code in ('president', 'vice_president', 'secretary', 'general_manager')
       and ra.effective_from <= current_date
       and (ra.effective_to is null or ra.effective_to > current_date)
  ) then
    raise exception
      'LAN-76 pilot setup refused: no active operator currently holds President, Vice-President, Secretary or General Manager. Those four roles manage the club calendar; without one of them, nothing on these screens can be exercised.';
  end if;

  raise notice 'LAN-76 pilot setup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect exactly one season row, at least one operator, and — on a first run —
-- zero scenario events. A non-zero scenario-event count means an earlier
-- LAN-76 test has not been cleaned up, which is allowed by the retention
-- policy and is worth knowing before you create more.
select
  'LAN-76 pilot setup — prerequisites' as check,
  (
    select label from public.seasons
     where status in ('open', 'active', 'closing')
     order by starts_on desc nulls last
     limit 1
  ) as operating_season,
  (
    select status::text from public.seasons
     where status in ('open', 'active', 'closing')
     order by starts_on desc nulls last
     limit 1
  ) as season_status,
  (
    select count(*) from public.operator_accounts where is_active
  ) as active_operator_accounts,
  (
    select count(distinct a.person_id)
      from public.operator_accounts a
      join public.role_assignments ra on ra.person_id = a.person_id
      join public.roles r on r.id = ra.role_id
     where a.is_active
       and r.code in ('president', 'vice_president', 'secretary', 'general_manager')
       and ra.effective_from <= current_date
       and (ra.effective_to is null or ra.effective_to > current_date)
  ) as calendar_operators,
  (
    select count(*) from public.events where name like '%PILOT-LAN-76%'
  ) as scenario_events_present;

commit;
