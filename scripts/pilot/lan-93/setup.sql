-- LAN-93 worked example — SETUP.
--
-- A harmless, entirely synthetic scenario whose only job is to demonstrate the
-- pilot-data script conventions in docs/pilot-data-runbook.md. It exercises the
-- real schema (a position vocabulary, a position, a season, a person, a season
-- membership and a draft event) and creates nothing a club member would
-- recognise, nothing anybody can log in as, and nothing another feature reads.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- OWNERSHIP MARKER — both halves, on every row:
--   * a deterministic primary key from the block 00930093-0093-4093-8093-…
--   * the sentinel string PILOT-LAN-93 in a text column
-- Cleanup deletes only rows matching BOTH, which is why a row that merely
-- happens to occupy one of these identifiers is refused rather than adopted.
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
  'LAN-93 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.seasons) as season_rows_before,
  (select count(*) from public.events) as event_rows_before,
  (
    select count(*)
    from public.people
    where id = '00930093-0093-4093-8093-000000000004'
  ) as scenario_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
-- Every check below raises. None of them warns and continues: a scenario that
-- half-exists in the hosted database is worse than one that does not exist.
do $preflight$
declare
  required_migration constant text := '20260811090000';
  missing text;
begin
  -- (a) The schema this scenario was written against must actually be applied.
  --     Without this the inserts below fail with column-level errors that read
  --     like a bug in the script rather than "you are on the wrong schema".
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'LAN-93 pilot setup refused: no supabase_migrations.schema_migrations. This does not look like a Supabase-managed database.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-93 pilot setup refused: migration % is not applied. Apply the merged migrations first (docs/migration-runbook.md), then re-run.',
      required_migration;
  end if;

  -- (b) Every table this scenario writes to must exist.
  select string_agg(t, ', ')
    into missing
    from unnest(array[
      'public.position_vocabularies',
      'public.positions',
      'public.seasons',
      'public.people',
      'public.season_memberships',
      'public.events'
    ]) as t
   where to_regclass(t) is null;

  if missing is not null then
    raise exception 'LAN-93 pilot setup refused: missing table(s) %.', missing;
  end if;

  -- (c) Each deterministic identifier is either free, or already carries this
  --     scenario's sentinel. Anything else means the identifier is occupied by
  --     a row this script does not own, and adopting it would be exactly the
  --     silent mutation the conventions forbid.
  if exists (
    select 1 from public.position_vocabularies
     where id = '00930093-0093-4093-8093-000000000001' and code <> 'pilot-lan-93'
  ) then
    raise exception 'LAN-93 pilot setup refused: position_vocabularies …0001 exists and is not this scenario''s row.';
  end if;

  if exists (
    select 1 from public.positions
     where id = '00930093-0093-4093-8093-000000000002' and label not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot setup refused: positions …0002 exists and is not this scenario''s row.';
  end if;

  if exists (
    select 1 from public.seasons
     where id = '00930093-0093-4093-8093-000000000003' and label not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot setup refused: seasons …0003 exists and is not this scenario''s row.';
  end if;

  if exists (
    select 1 from public.people
     where id = '00930093-0093-4093-8093-000000000004'
       and known_as is distinct from 'PILOT-LAN-93'
  ) then
    raise exception 'LAN-93 pilot setup refused: people …0004 exists and is not this scenario''s row. Never adopt a person record.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = '00930093-0093-4093-8093-000000000005'
       and (person_id <> '00930093-0093-4093-8093-000000000004'
            or season_id <> '00930093-0093-4093-8093-000000000003')
  ) then
    raise exception 'LAN-93 pilot setup refused: season_memberships …0005 exists and is not this scenario''s row.';
  end if;

  if exists (
    select 1 from public.events
     where id = '00930093-0093-4093-8093-000000000006' and name not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot setup refused: events …0006 exists and is not this scenario''s row.';
  end if;

  -- (d) The natural keys this scenario uses must not be held by some OTHER row.
  --     Without this the inserts below fail on a unique constraint with no
  --     explanation of which pre-existing row is in the way.
  if exists (
    select 1 from public.position_vocabularies
     where code = 'pilot-lan-93' and id <> '00930093-0093-4093-8093-000000000001'
  ) then
    raise exception 'LAN-93 pilot setup refused: another position_vocabularies row already uses code pilot-lan-93.';
  end if;

  if exists (
    select 1 from public.seasons
     where label = 'PILOT-LAN-93 scenario season'
       and id <> '00930093-0093-4093-8093-000000000003'
  ) then
    raise exception 'LAN-93 pilot setup refused: another seasons row already uses the label PILOT-LAN-93 scenario season.';
  end if;

  -- (e) Invariant I2: one membership per person per season. If the scenario's
  --     person already has a membership in the scenario's season under some
  --     other id, this script must not create a second.
  if exists (
    select 1 from public.season_memberships
     where person_id = '00930093-0093-4093-8093-000000000004'
       and season_id = '00930093-0093-4093-8093-000000000003'
       and id <> '00930093-0093-4093-8093-000000000005'
  ) then
    raise exception 'LAN-93 pilot setup refused: the scenario person already holds a different membership in the scenario season.';
  end if;

  raise notice 'LAN-93 pilot setup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The scenario
-- ---------------------------------------------------------------------------
-- Insert order is dependency order: vocabulary → position → season → person →
-- membership → event. cleanup.sql runs it backwards.

-- 1. A position vocabulary of its own, so the scenario never has to reference,
--    reuse or mutate the club's real taxonomy.
insert into public.position_vocabularies (id, code, label, adopted_on)
values (
  '00930093-0093-4093-8093-000000000001',
  'pilot-lan-93',
  'PILOT-LAN-93 scenario vocabulary',
  date '2026-08-11'
)
on conflict (id) do nothing;

-- 2. One position inside it. Present so cleanup has a genuine dependency to
--    unwind in the right order rather than a flat list of unrelated rows.
insert into public.positions (id, vocabulary_id, code, label, side, sort_order)
values (
  '00930093-0093-4093-8093-000000000002',
  '00930093-0093-4093-8093-000000000001',
  'PILOT-WR',
  'PILOT-LAN-93 Wide Receiver',
  'offence',
  0
)
on conflict (id) do nothing;

-- 3. A season in `planning`. Deliberately not `open` or `active`: a pilot
--    scenario must never be mistaken for the season the club is actually
--    running, and `planning` needs no recorded opener (constraint
--    seasons_opening_is_recorded).
insert into public.seasons (id, label, status, position_vocabulary_id, starts_on)
values (
  '00930093-0093-4093-8093-000000000003',
  'PILOT-LAN-93 scenario season',
  'planning',
  '00930093-0093-4093-8093-000000000001',
  date '2026-09-27'
)
on conflict (id) do nothing;

-- 4. A synthetic person. Not an operator, not a login, no contact point, and
--    `known_as` carries the sentinel so the row is identifiable in any listing.
--    This is scenario data, NOT a durable pilot identity — durable identities
--    are provisioned by the procedure in docs/pilot-data-runbook.md and are
--    never created or removed by a scenario script.
insert into public.people (id, given_name, family_name, known_as)
values (
  '00930093-0093-4093-8093-000000000004',
  'Pilot',
  'Scenario',
  'PILOT-LAN-93'
)
on conflict (id) do nothing;

-- 5. The membership that ties the two together. `confirmed` rather than
--    `active`: nothing about this scenario should read as a player on a roster.
insert into public.season_memberships (
  id, person_id, season_id, status, entry, confirmed_on
)
values (
  '00930093-0093-4093-8093-000000000005',
  '00930093-0093-4093-8093-000000000004',
  '00930093-0093-4093-8093-000000000003',
  'confirmed',
  'new',
  date '2026-08-11'
)
on conflict (id) do nothing;

-- 6. A draft event. Draft, so it can never be approved, never resolve an
--    audience, and never issue an invitation or a notification to anybody.
insert into public.events (id, season_id, name, event_type, status)
values (
  '00930093-0093-4093-8093-000000000006',
  '00930093-0093-4093-8093-000000000003',
  'PILOT-LAN-93 scenario practice',
  'practice',
  'draft'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect exactly six rows, one per table, each `present`. The same query is in
-- README.md so it can be re-run at any time afterwards.
select
  'position_vocabularies' as table_name,
  count(*) filter (where id = '00930093-0093-4093-8093-000000000001') as scenario_rows
  from public.position_vocabularies
union all
select 'positions', count(*) filter (where id = '00930093-0093-4093-8093-000000000002')
  from public.positions
union all
select 'seasons', count(*) filter (where id = '00930093-0093-4093-8093-000000000003')
  from public.seasons
union all
select 'people', count(*) filter (where id = '00930093-0093-4093-8093-000000000004')
  from public.people
union all
select 'season_memberships', count(*) filter (where id = '00930093-0093-4093-8093-000000000005')
  from public.season_memberships
union all
select 'events', count(*) filter (where id = '00930093-0093-4093-8093-000000000006')
  from public.events;

commit;
