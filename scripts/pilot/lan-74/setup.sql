-- LAN-74 returner intake — SETUP.
--
-- Creates the duplicate-candidate scenario that makes LAN-74's deduplication
-- testable by hand against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   Two clearly synthetic people who both answer to the same given name, one of
--   them recorded with a first name and nothing else. That pair is the whole
--   point: 26% of the club's real records are first-name-only (Source Data
--   Analysis §11.1), and the duplicate check exists because of them. One of the
--   two already holds a membership in the open season, so the "this person is
--   already a member" refusal is reachable; the other holds none, so selecting
--   an existing person can be seen to succeed.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No season. The open season is the permanent pilot foundation's, and this
--     script ASSERTS it rather than creating one — `resolveOpenSeason()` in the
--     service layer refuses when two seasons are open at once, so a scenario
--     that created its own would break the very feature it exists to test.
--   * No auth user, operator account, role assignment or audit row. Durable
--     pilot identities are provisioned by the procedure in
--     docs/pilot-data-runbook.md and are never created by a scenario script.
--   * No event, invitation or notification. Nothing here can message anybody.
--
-- OWNERSHIP MARKER — both halves, on every row:
--   * a deterministic primary key from the block 00740074-0074-4074-8074-…
--   * the sentinel string PILOT-LAN-74 in a text column — `known_as` on a
--     person, `source` on a contact point, `actor_label` on a status event
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
  'LAN-74 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.contact_points) as contact_rows_before,
  (select count(*) from public.season_memberships) as membership_rows_before,
  (
    select count(*)
    from public.seasons
    where status in ('open', 'active')
  ) as open_seasons,
  (
    select string_agg(label, ', ')
    from public.seasons
    where status in ('open', 'active')
  ) as open_season_label,
  (
    select count(*)
    from public.people
    where id in (
      '00740074-0074-4074-8074-000000000001',
      '00740074-0074-4074-8074-000000000003'
    )
  ) as scenario_people_already_present;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_migration constant text := '20260811090000';
  sentinel constant text := 'PILOT-LAN-74';
  person_a constant uuid := '00740074-0074-4074-8074-000000000001';
  person_b constant uuid := '00740074-0074-4074-8074-000000000003';
  open_seasons integer;
  missing text;
begin
  -- (a) The schema this scenario was written against must actually be applied.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'LAN-74 pilot setup refused: no supabase_migrations.schema_migrations. This does not look like a Supabase-managed database.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-74 pilot setup refused: migration % is not applied. Apply the merged migrations first (docs/migration-runbook.md), then re-run.',
      required_migration;
  end if;

  -- (b) Every table this scenario writes to must exist.
  select string_agg(t, ', ')
    into missing
    from unnest(array[
      'public.people',
      'public.contact_points',
      'public.seasons',
      'public.season_memberships',
      'public.season_membership_status_events'
    ]) as t
   where to_regclass(t) is null;

  if missing is not null then
    raise exception 'LAN-74 pilot setup refused: missing table(s) %.', missing;
  end if;

  -- (c) The open season, which this script asserts and never creates.
  --
  --     Both directions abort. With none, the membership below cannot be
  --     created and the feature itself would refuse every submission. With
  --     more than one, `resolveOpenSeason()` raises a Conflict on every
  --     submission — so the scenario would look installed while the screen it
  --     exists to exercise refused to work, which is the worst of both.
  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-74 pilot setup refused: no season is open or active. The permanent pilot foundation must provide one before returner intake can be tested.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-74 pilot setup refused: % seasons are open or active at once. Returner intake refuses an ambiguous season, so fix this before installing the scenario.',
      open_seasons;
  end if;

  -- (d) Each deterministic identifier is either free, or already carries this
  --     scenario's sentinel. Anything else means the identifier is occupied by
  --     a row this script does not own.
  if exists (
    select 1 from public.people
     where id = person_a and known_as is distinct from sentinel
  ) then
    raise exception 'LAN-74 pilot setup refused: people …0001 exists and is not this scenario''s row. Never adopt a person record.';
  end if;

  if exists (
    select 1 from public.people
     where id = person_b and known_as is distinct from sentinel
  ) then
    raise exception 'LAN-74 pilot setup refused: people …0003 exists and is not this scenario''s row. Never adopt a person record.';
  end if;

  if exists (
    select 1 from public.contact_points
     where id in (
       '00740074-0074-4074-8074-000000000002',
       '00740074-0074-4074-8074-000000000004',
       '00740074-0074-4074-8074-000000000005'
     )
       and source is distinct from sentinel
  ) then
    raise exception 'LAN-74 pilot setup refused: a contact_points row in this scenario''s identifier block exists and is not this scenario''s.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = '00740074-0074-4074-8074-000000000006'
       and person_id <> person_a
  ) then
    raise exception 'LAN-74 pilot setup refused: season_memberships …0006 exists and belongs to somebody else.';
  end if;

  if exists (
    select 1 from public.season_membership_status_events
     where id in (
       '00740074-0074-4074-8074-000000000007',
       '00740074-0074-4074-8074-000000000008'
     )
       and actor_label is distinct from 'PILOT-LAN-74 setup script'
  ) then
    raise exception 'LAN-74 pilot setup refused: a season_membership_status_events row in this scenario''s identifier block is not this scenario''s.';
  end if;

  -- (e) Never adopt an identifier that has become a durable identity. A person
  --     with an operator account is somebody who can sign in, and this script
  --     must not treat one as scenario data it may rewrite or later remove.
  if exists (
    select 1 from public.operator_accounts where person_id in (person_a, person_b)
  ) then
    raise exception 'LAN-74 pilot setup refused: a scenario identifier is linked to an operator account. That is a durable identity, not scenario data.';
  end if;

  -- (f) Invariant I2: one membership per person per season. If the scenario's
  --     person already holds a membership in the open season under some other
  --     id, this script must not create a second.
  if exists (
    select 1
      from public.season_memberships m
      join public.seasons s on s.id = m.season_id
     where m.person_id = person_a
       and s.status in ('open', 'active')
       and m.id <> '00740074-0074-4074-8074-000000000006'
  ) then
    raise exception 'LAN-74 pilot setup refused: the scenario person already holds a different membership in the open season.';
  end if;

  -- (g) The second candidate must have NO membership in the open season — that
  --     is the whole reason it is in the scenario. If one appeared, selecting
  --     it through the interface would be refused and the happy path could not
  --     be demonstrated at all.
  if exists (
    select 1
      from public.season_memberships m
      join public.seasons s on s.id = m.season_id
     where m.person_id = person_b
       and s.status in ('open', 'active')
  ) then
    raise exception 'LAN-74 pilot setup refused: the second candidate already holds a membership in the open season, so the existing-person path cannot be demonstrated.';
  end if;

  raise notice 'LAN-74 pilot setup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The scenario
-- ---------------------------------------------------------------------------
-- Insert order is dependency order: people → contact points → membership →
-- status history. cleanup.sql runs it backwards.

-- 1. The first-name-only candidate. This is the 26% case, and the row the
--    duplicate check has to surface from a given name alone. No family name by
--    design — `people.family_name` is nullable for exactly this reason.
insert into public.people (id, given_name, family_name, known_as)
values (
  '00740074-0074-4074-8074-000000000001',
  'Fenwold',
  null,
  'PILOT-LAN-74'
)
on conflict (id) do nothing;

-- 2. Its email, so the contact-point half of the duplicate check is reachable
--    too. `example.invalid` is reserved by RFC 2606 and can never be delivered.
insert into public.contact_points (id, person_id, kind, raw_value, is_preferred, source)
values (
  '00740074-0074-4074-8074-000000000002',
  '00740074-0074-4074-8074-000000000001',
  'email',
  'fenwold.pilot@example.invalid',
  true,
  'PILOT-LAN-74'
)
on conflict (id) do nothing;

-- 3. The second candidate: same given name, with a surname. Two people who
--    share a first name is what makes the operator's choice a real one rather
--    than a formality.
insert into public.people (id, given_name, family_name, known_as)
values (
  '00740074-0074-4074-8074-000000000003',
  'Fenwold',
  'Pilotworth',
  'PILOT-LAN-74'
)
on conflict (id) do nothing;

insert into public.contact_points (id, person_id, kind, raw_value, is_preferred, source)
values (
  '00740074-0074-4074-8074-000000000004',
  '00740074-0074-4074-8074-000000000003',
  'email',
  'fenwold.pilotworth@example.invalid',
  true,
  'PILOT-LAN-74'
)
on conflict (id) do nothing;

-- 5. A phone in Ofcom's reserved drama range (07700 900xxx), which is never
--    allocated to a real subscriber.
insert into public.contact_points (id, person_id, kind, raw_value, is_preferred, source)
values (
  '00740074-0074-4074-8074-000000000005',
  '00740074-0074-4074-8074-000000000003',
  'phone',
  '+44 7700 900174',
  true,
  'PILOT-LAN-74'
)
on conflict (id) do nothing;

-- 6. The membership that makes the "already a member this season" refusal
--    reachable. It goes in whichever season is open — the foundation's, looked
--    up rather than created. `confirmed` rather than `active`: nothing in this
--    scenario should read as a player on the club's actual roster.
insert into public.season_memberships (
  id, person_id, season_id, status, entry, confirmed_on
)
select
  '00740074-0074-4074-8074-000000000006',
  '00740074-0074-4074-8074-000000000001',
  s.id,
  'confirmed',
  'returning',
  current_date
  from public.seasons s
 where s.status in ('open', 'active')
on conflict (id) do nothing;

-- 7 & 8. The lifecycle history that membership would have if the application
--    had created it, so the scenario mirrors the real shape of the data rather
--    than a tidier version of it. `actor_label` names the mechanism honestly
--    instead of attributing the rows to a person who did not do it.
insert into public.season_membership_status_events (
  id, season_membership_id, from_status, to_status, actor_label, reason
)
values (
  '00740074-0074-4074-8074-000000000007',
  '00740074-0074-4074-8074-000000000006',
  null,
  'carried_forward',
  'PILOT-LAN-74 setup script',
  'Scenario data for LAN-74 duplicate-candidate testing.'
)
on conflict (id) do nothing;

insert into public.season_membership_status_events (
  id, season_membership_id, from_status, to_status, actor_label, reason
)
values (
  '00740074-0074-4074-8074-000000000008',
  '00740074-0074-4074-8074-000000000006',
  'carried_forward',
  'confirmed',
  'PILOT-LAN-74 setup script',
  'Scenario data for LAN-74 duplicate-candidate testing.'
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect five rows: 2 people, 3 contact points, 1 membership, 2 status events,
-- and exactly 1 open season. The same query is in README.md so it can be re-run
-- at any time afterwards.
select
  'people' as table_name,
  count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000001',
      '00740074-0074-4074-8074-000000000003'
    )
  ) as scenario_rows
  from public.people
union all
select 'contact_points', count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000002',
      '00740074-0074-4074-8074-000000000004',
      '00740074-0074-4074-8074-000000000005'
    )
  )
  from public.contact_points
union all
select 'season_memberships', count(*) filter (
    where id = '00740074-0074-4074-8074-000000000006'
  )
  from public.season_memberships
union all
select 'season_membership_status_events', count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000007',
      '00740074-0074-4074-8074-000000000008'
    )
  )
  from public.season_membership_status_events
union all
select 'seasons open or active', count(*) filter (where status in ('open', 'active'))
  from public.seasons;

commit;
