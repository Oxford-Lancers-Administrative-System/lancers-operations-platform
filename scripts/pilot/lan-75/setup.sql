-- LAN-75 roster and activation — SETUP.
--
-- Creates the one scenario that makes LAN-75's activation path testable by hand
-- against the deployed application, and creates nothing else.
--
-- Run by a human. Never by a migration, a seed, CI, a deploy or the app.
--
-- WHAT IT ADDS
--   * Three onboarding item types on the open season — two required, one the
--     season's subscription item. Hosted carries no onboarding configuration at
--     all, so without these there is nothing for the application to generate,
--     nothing to waive, and no way to see that an unpaid subscription does not
--     block activation. They are the "onboarding prerequisites" LAN-75's locked
--     production-handoff classification asks this script for.
--   * One clearly synthetic person, their contact points, and one `confirmed`
--     membership in the open season carrying its three onboarding items, all
--     `pending`. That is the state UX-21 shows and the state activation starts
--     from, so waiver, override and activation are all reachable from it.
--
-- WHAT IT DELIBERATELY DOES NOT ADD
--   * No season. The open season is the permanent pilot foundation's, and this
--     script ASSERTS it rather than creating one — the service layer refuses
--     when two seasons are open at once, so a scenario that created its own
--     would break the very feature it exists to test.
--   * No auth user, operator account, role assignment or audit row. Durable
--     pilot identities are provisioned by the procedure in
--     docs/pilot-data-runbook.md and are never created by a scenario script.
--     Activation needs an Exec/GM operator; that is Brian's to arrange, and
--     this script asserts one exists rather than granting anything.
--   * No event, invitation or notification. Nothing here can message anybody.
--   * No `active` membership. Making one would hand over the result the test is
--     supposed to produce.
--
-- OWNERSHIP MARKER — both halves, on every row:
--   * a deterministic primary key from the block 00750075-0075-4075-8075-…
--   * the sentinel string PILOT-LAN-75 in a text column — `label` on an item
--     type, `known_as` on a person, `source` on a contact point, `actor_label`
--     on a status event
--   The three `onboarding_items` rows are the one exception, because the table
--   has no text column that is free on a `pending` row. They carry the
--   deterministic id AND belong to this scenario's membership AND point at this
--   scenario's item types — a three-way chain that no unrelated row satisfies.
--   Cleanup checks all three.
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
  'LAN-75 pilot setup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.season_memberships) as membership_rows_before,
  (select count(*) from public.onboarding_item_types) as item_type_rows_before,
  (select count(*) from public.onboarding_items) as item_rows_before,
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
    where id = '00750075-0075-4075-8075-000000000010'
  ) as scenario_person_already_present,
  -- Not a guard: this script grants nothing, and who holds a seat is arranged
  -- through docs/pilot-data-runbook.md. Reported so you can see, before you
  -- commit, whether the activation step is performable yet. Zero is not a
  -- failure — the roster and the authorization refusal are testable regardless.
  (
    select count(*)
    from public.role_assignments ra
    join public.roles r on r.id = ra.role_id
    where r.code in ('president', 'vice_president', 'secretary', 'treasurer', 'general_manager')
      and ra.effective_from <= current_date
      and (ra.effective_to is null or ra.effective_to > current_date)
  ) as exec_or_gm_assignments_available;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: prerequisites, every one of which aborts
-- ---------------------------------------------------------------------------
do $preflight$
declare
  required_migration constant text := '20260811090000';
  sentinel constant text := 'PILOT-LAN-75';
  scenario_person constant uuid := '00750075-0075-4075-8075-000000000010';
  scenario_membership constant uuid := '00750075-0075-4075-8075-000000000020';
  open_seasons integer;
  open_season uuid;
  missing text;
begin
  -- (a) The schema this scenario was written against must actually be applied.
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception
      'LAN-75 pilot setup refused: no supabase_migrations.schema_migrations. This does not look like a Supabase-managed database.';
  end if;

  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = required_migration
  ) then
    raise exception
      'LAN-75 pilot setup refused: migration % is not applied. Apply the merged migrations first (docs/migration-runbook.md), then re-run.',
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
      'public.season_membership_status_events',
      'public.onboarding_item_types',
      'public.onboarding_items',
      'public.operator_accounts'
    ]) as t
   where to_regclass(t) is null;

  if missing is not null then
    raise exception 'LAN-75 pilot setup refused: missing table(s) %.', missing;
  end if;

  -- (c) The open season, which this script asserts and never creates.
  --
  --     Both directions abort. With none, the membership below cannot be
  --     created at all. With more than one, the service layer raises on every
  --     read — so the scenario would look installed while the screens it exists
  --     to exercise refused to work, which is the worst of both.
  select count(*) into open_seasons
    from public.seasons where status in ('open', 'active');

  if open_seasons = 0 then
    raise exception
      'LAN-75 pilot setup refused: no season is open or active. The permanent pilot foundation must provide one before the roster can be tested.';
  end if;

  if open_seasons > 1 then
    raise exception
      'LAN-75 pilot setup refused: % seasons are open or active at once. The roster refuses an ambiguous season, so fix this before installing the scenario.',
      open_seasons;
  end if;

  select id into open_season
    from public.seasons where status in ('open', 'active');

  -- (d) Each deterministic identifier is either free, or already carries this
  --     scenario's sentinel. Anything else means the identifier is occupied by
  --     a row this script does not own.
  if exists (
    select 1 from public.people
     where id = scenario_person and known_as is distinct from sentinel
  ) then
    raise exception 'LAN-75 pilot setup refused: people …0010 exists and is not this scenario''s row. Never adopt a person record.';
  end if;

  if exists (
    select 1 from public.onboarding_item_types
     where id in (
       '00750075-0075-4075-8075-000000000001',
       '00750075-0075-4075-8075-000000000002',
       '00750075-0075-4075-8075-000000000003'
     )
       and position(sentinel in label) = 0
  ) then
    raise exception 'LAN-75 pilot setup refused: an onboarding_item_types row in this scenario''s identifier block is not this scenario''s.';
  end if;

  if exists (
    select 1 from public.contact_points
     where id in (
       '00750075-0075-4075-8075-000000000011',
       '00750075-0075-4075-8075-000000000012'
     )
       and source is distinct from sentinel
  ) then
    raise exception 'LAN-75 pilot setup refused: a contact_points row in this scenario''s identifier block is not this scenario''s.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = scenario_membership and person_id <> scenario_person
  ) then
    raise exception 'LAN-75 pilot setup refused: season_memberships …0020 exists and belongs to somebody else.';
  end if;

  if exists (
    select 1 from public.season_membership_status_events
     where id in (
       '00750075-0075-4075-8075-000000000021',
       '00750075-0075-4075-8075-000000000022'
     )
       and actor_label is distinct from 'PILOT-LAN-75 setup script'
  ) then
    raise exception 'LAN-75 pilot setup refused: a season_membership_status_events row in this scenario''s identifier block is not this scenario''s.';
  end if;

  -- (e) Never adopt an identifier that has become a durable identity. A person
  --     with an operator account is somebody who can sign in, and this script
  --     must not treat one as scenario data it may rewrite or later remove.
  if exists (select 1 from public.operator_accounts oa where oa.person_id = scenario_person) then
    raise exception 'LAN-75 pilot setup refused: the scenario identifier is linked to an operator account. That is a durable identity, not scenario data.';
  end if;

  -- (f) Invariant I2: one membership per person per season. If the scenario's
  --     person already holds a membership in the open season under some other
  --     id, this script must not create a second.
  if exists (
    select 1
      from public.season_memberships m
      join public.seasons s on s.id = m.season_id
     where m.person_id = scenario_person
       and s.status in ('open', 'active')
       and m.id <> scenario_membership
  ) then
    raise exception 'LAN-75 pilot setup refused: the scenario person already holds a different membership in the open season.';
  end if;

  raise notice 'LAN-75 pilot setup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The scenario
-- ---------------------------------------------------------------------------
-- Insert order is dependency order: item types → person → contact points →
-- membership → status history → onboarding items. cleanup.sql runs it
-- backwards.

-- 1. The season's onboarding configuration.
--
--    Two required, non-subscription items, because activation asks about
--    exactly those: one is left pending so the override path is reachable, and
--    the other is there to be waived so "required item set met OR consciously
--    waived" can be seen to work.
--
--    The third is the subscription item, and it is marked `is_required` as well
--    — deliberately the worst case for register D10. If activation ever starts
--    blocking on subs, this row is what shows it.
insert into public.onboarding_item_types
  (id, season_id, code, label, is_required, is_subscription, sort_order)
select
  '00750075-0075-4075-8075-000000000001',
  s.id,
  'pilot_lan75_kit',
  'Kit sorted (PILOT-LAN-75)',
  true,
  false,
  1
from public.seasons s
where s.status in ('open', 'active')
on conflict (id) do nothing;

insert into public.onboarding_item_types
  (id, season_id, code, label, is_required, is_subscription, sort_order)
select
  '00750075-0075-4075-8075-000000000002',
  s.id,
  'pilot_lan75_conduct',
  'Code of conduct signed (PILOT-LAN-75)',
  true,
  false,
  2
from public.seasons s
where s.status in ('open', 'active')
on conflict (id) do nothing;

-- The subscription item, and the one row this script creates conditionally.
--
-- A season may hold at most one subscription type
-- (`onboarding_item_types_one_subscription_per_season`). Hosted has none, so
-- the scenario supplies one. A club that has configured its own keeps it, and
-- register D10 is exercised against the real thing — which is better evidence
-- than a synthetic copy, and means this script never has to refuse.
--
-- It used to refuse instead, and that refusal had a cost nobody saw coming:
-- the test proving this script had to clear the seeded flag first, which
-- mutated shared season configuration and intermittently raced the returner
-- intake suite. Adopting rather than refusing removed the mutation, the race
-- and a guard, all at once.
insert into public.onboarding_item_types
  (id, season_id, code, label, is_required, is_subscription, sort_order)
select
  '00750075-0075-4075-8075-000000000003',
  s.id,
  'pilot_lan75_subs',
  'Subscription paid (PILOT-LAN-75)',
  true,
  true,
  3
from public.seasons s
where s.status in ('open', 'active')
  and not exists (
    select 1
      from public.onboarding_item_types t
     where t.season_id = s.id
       and t.is_subscription
       and t.id <> '00750075-0075-4075-8075-000000000003')
on conflict (id) do nothing;

-- 2. The synthetic person. `known_as` carries the sentinel, which is also what
--    the roster shows on screen — so anybody looking at hosted can see at a
--    glance that this row is scenario data and not a member of the club.
insert into public.people (id, given_name, family_name, known_as)
values (
  '00750075-0075-4075-8075-000000000010',
  'Thelbrook',
  'Pilotcase',
  'PILOT-LAN-75'
)
on conflict (id) do nothing;

-- 3. Contact points, on `example.invalid` — a reserved TLD that can never
--    resolve, so nothing here can reach a real inbox or handset even by
--    accident. Stored as entered, like every other contact in this system.
insert into public.contact_points
  (id, person_id, kind, raw_value, is_preferred, source)
values
  (
    '00750075-0075-4075-8075-000000000011',
    '00750075-0075-4075-8075-000000000010',
    'email',
    'thelbrook.pilotcase@example.invalid',
    true,
    'PILOT-LAN-75'
  ),
  (
    '00750075-0075-4075-8075-000000000012',
    '00750075-0075-4075-8075-000000000010',
    'phone',
    '+44 7700 900175',
    true,
    'PILOT-LAN-75'
  )
on conflict (id) do nothing;

-- 4. The membership, `confirmed` in the open season. Not `onboarding` and not
--    `active`: `confirmed` is the state UX-21 shows and the state the Activate
--    action starts from, and creating it any further along would hand over the
--    result the test is meant to produce.
insert into public.season_memberships
  (id, person_id, season_id, status, entry, confirmed_on)
select
  '00750075-0075-4075-8075-000000000020',
  '00750075-0075-4075-8075-000000000010',
  s.id,
  'confirmed',
  'returning',
  current_date
from public.seasons s
where s.status in ('open', 'active')
on conflict (id) do nothing;

-- 5. The history that produced it. `actor_label` rather than
--    `actor_person_id`, because no person did this — a script did, and
--    invariant M2 requires the record to say which honestly rather than
--    borrowing somebody's name.
insert into public.season_membership_status_events
  (id, season_membership_id, from_status, to_status, actor_label, reason)
values
  (
    '00750075-0075-4075-8075-000000000021',
    '00750075-0075-4075-8075-000000000020',
    null,
    'carried_forward',
    'PILOT-LAN-75 setup script',
    'Synthetic pilot scenario for LAN-75.'
  ),
  (
    '00750075-0075-4075-8075-000000000022',
    '00750075-0075-4075-8075-000000000020',
    'carried_forward',
    'confirmed',
    'PILOT-LAN-75 setup script',
    'Synthetic pilot scenario for LAN-75.'
  )
on conflict (id) do nothing;

-- 6. The onboarding items, all `pending`. The application generates these on
--    confirmation; this membership was written by SQL rather than through the
--    interface, so the script supplies what confirmation would have.
--
--    Generation itself is tested the other way round — by entering a returner
--    through /operate/roster/new and seeing these three types appear on the new
--    membership without this script having touched it.
insert into public.onboarding_items
  (id, season_membership_id, season_id, item_type_id, status)
select
  v.id,
  '00750075-0075-4075-8075-000000000020',
  s.id,
  v.item_type_id,
  'pending'
from public.seasons s
cross join (values
  ('00750075-0075-4075-8075-000000000031'::uuid, '00750075-0075-4075-8075-000000000001'::uuid),
  ('00750075-0075-4075-8075-000000000032'::uuid, '00750075-0075-4075-8075-000000000002'::uuid),
  ('00750075-0075-4075-8075-000000000033'::uuid, '00750075-0075-4075-8075-000000000003'::uuid)
) as v(id, item_type_id)
where s.status in ('open', 'active')
  -- Only for the types this scenario actually created. The subscription type
  -- above is conditional — a club that already has its own keeps it — so
  -- naming all three unconditionally inserted a row pointing at a type that
  -- was never created, and `onboarding_items_type_same_season` refused it.
  and exists (
    select 1
      from public.onboarding_item_types t
     where t.id = v.item_type_id
       and t.season_id = s.id)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Verification — read this before committing
-- ---------------------------------------------------------------------------
-- Expected: installed = true, and every count exactly as named.
select
  'LAN-75 pilot setup — result' as check,
  (
    select count(*) from public.onboarding_item_types
     where label like '%PILOT-LAN-75%'
  ) as item_types,
  (
    select count(*) from public.people
     where id = '00750075-0075-4075-8075-000000000010' and known_as = 'PILOT-LAN-75'
  ) as people,
  (
    select count(*) from public.contact_points
     where person_id = '00750075-0075-4075-8075-000000000010' and source = 'PILOT-LAN-75'
  ) as contact_points,
  (
    select status::text from public.season_memberships
     where id = '00750075-0075-4075-8075-000000000020'
  ) as membership_status,
  (
    select count(*) from public.season_membership_status_events
     where season_membership_id = '00750075-0075-4075-8075-000000000020'
  ) as status_events,
  (
    select count(*) from public.onboarding_items
     where season_membership_id = '00750075-0075-4075-8075-000000000020'
  ) as onboarding_items,
  (
    select count(*) = 3 and bool_and(status = 'pending')
      from public.onboarding_items
     where season_membership_id = '00750075-0075-4075-8075-000000000020'
  ) as all_items_pending,
  (
    select count(*) >= 2
      from public.onboarding_item_types
     where id in (
       '00750075-0075-4075-8075-000000000001',
       '00750075-0075-4075-8075-000000000002'
     )
  ) as installed,
  -- Two when the club already had its own subscription type, three when this
  -- script supplied one. Both are correct; this says which happened.
  (
    select count(*) from public.onboarding_item_types
     where season_id = (select id from public.seasons where status in ('open', 'active'))
       and is_subscription
       and label like '%PILOT-LAN-75%'
  ) as pilot_supplied_the_subscription_item;

-- Read both result sets. If either is not what you expected, `rollback;` before
-- this file's own `commit` runs — or run the statements one at a time rather
-- than the file, which is what the README recommends for a first install.
commit;
