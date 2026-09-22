-- Production baseline: the 2026–27 season, calendar, position vocabulary and
-- committee year — LAN-350.
--
-- This is real reference data, not a pilot scenario: the club's own 18-position
-- vocabulary (docs/architecture/data-model.md, transcribed from
-- scripts/production/showcase/plan/reference.mjs `POSITIONS`) and the real
-- Oxford term boundaries for 2026–27. It carries no `PILOT-` sentinel and is
-- never cleaned up — see scripts/production/README.md § baseline/season-2026-27.sql.
--
-- Run whole, by Brian, in the Supabase SQL editor, against production. Paste
-- the entire file including `begin;` and `commit;`; do not paste fragments.
-- Re-running is always safe: every insert is keyed on a natural unique
-- constraint with `on conflict … do nothing`, never `do update`, so nothing
-- already there is rewritten. That is also what makes this file the way to
-- restore the baseline after a rollback: run it again and the missing rows
-- come back, the present ones are untouched.
--
-- Order: migrations (this depends on the schema, in particular the role
-- catalogue) → this file → bootstrap-founding-operators.mjs, which refuses to
-- run without exactly one open committee year.

begin;

-- ---------------------------------------------------------------------------
-- Preflight: fail closed rather than run against a database that is not
-- ready, or that already disagrees with what this file is about to assert.
-- ---------------------------------------------------------------------------

do $preflight$
declare
  v_role_count int;
  v_operator_count int;
  v_conflicting_active_seasons int;
begin
  -- The role catalogue is migration-owned (20260819090000/20260819090100). An
  -- empty roles table means those migrations have not been applied yet, and
  -- nothing here should run ahead of them.
  select count(*) into v_role_count from public.roles;
  if v_role_count = 0 then
    raise exception
      'LAN-350 production baseline refused: public.roles is empty. The role-'
      'catalogue migrations (20260819090000_role_catalogue_structure.sql, '
      '20260819090100_role_catalogue.sql) have not been applied — see '
      'docs/migration-runbook.md. Apply them first, then re-run this file.';
  end if;

  -- The season this file opens needs an opener: model §1.1 records who opened
  -- a season, and the value has to come from somewhere. `opened_by_person_id`
  -- below is set to the person_id of the earliest-created active
  -- `operator_accounts` row — deterministic, and carries no personal data in
  -- this file. On the night this ran in production there was exactly one such
  -- row, so it names whoever is recorded as production's first operator; if
  -- several ever exist when this runs, the earliest-created wins and that is
  -- worth knowing before you run it, not after.
  select count(*) into v_operator_count from public.operator_accounts;
  if v_operator_count = 0 then
    raise exception
      'LAN-350 production baseline refused: public.operator_accounts is '
      'empty. The season this file opens needs an opener, recorded as the '
      'person_id of the earliest-created ACTIVE operator_accounts row — seat '
      'the founding operator(s) first (scripts/production/bootstrap-founding-'
      'operators.mjs or scripts/production/baseline/founding-seats.sql), then '
      're-run this file.';
  end if;

  -- `seasons_label_key` makes the insert below idempotent by label, but it
  -- cannot know whether a DIFFERENT active season already exists — inserting
  -- a second one would leave the club with two, which model §1.1 never
  -- allows in practice even though nothing in the schema forbids it outright.
  select count(*) into v_conflicting_active_seasons
    from public.seasons
   where status = 'active'
     and label <> '2026–27';
  if v_conflicting_active_seasons > 0 then
    raise exception
      'LAN-350 production baseline refused: an active season already exists '
      'whose label is not "2026–27". Resolve which season is actually active '
      'before running this file — it never closes or supersedes one for you.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Position vocabulary — the club's own, from the position dropdown databank.
-- ---------------------------------------------------------------------------

insert into public.position_vocabularies (code, label, adopted_on)
values ('oulafc_2026', 'OULAFC position vocabulary', date '2026-06-01')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Positions — the 24-slot vocabulary, `POSITIONS` in
-- scripts/production/showcase/plan/reference.mjs, sort_order = list index.
-- Includes the four special-teams slots (LAN-261) and Stewart's corrections
-- and additions (LAN-401): `NT` rather than `N/T`, `E` labelled Edge rather
-- than End, and the six sided line codes at the end.
-- ---------------------------------------------------------------------------

insert into public.positions (vocabulary_id, code, label, side, sort_order)
select v.id, p.code, p.label, p.side::public.position_side, p.sort_order
  from public.position_vocabularies v
  cross join (values
    ('QB',   'Quarterback',    'offence',       0),
    ('RB',   'Running Back',   'offence',       1),
    ('WB',   'Wing Back',      'offence',       2),
    ('TE',   'Tight End',      'offence',       3),
    ('WR',   'Wide Receiver',  'offence',       4),
    ('T',    'Tackle',         'offence',       5),
    ('G',    'Guard',          'offence',       6),
    ('C',    'Centre',         'offence',       7),
    ('FB',   'Full Back',      'offence',       8),
    ('E',    'Edge',           'defence',       9),
    ('NT',   'Nose Tackle',    'defence',      10),
    ('S',    'Safety',         'defence',      11),
    ('LB',   'Linebacker',     'defence',      12),
    ('CB',   'Cornerback',     'defence',      13),
    ('KO',   'Kickoff',        'special_teams',14),
    ('KR',   'Kick Return',    'special_teams',15),
    ('PUNT', 'Punt',           'special_teams',16),
    ('FG',   'Field Goal',     'special_teams',17),
    -- LAN-401, Stewart's list. Appended, so every existing code keeps the
    -- sort_order it has and each new one lands at the end of its own side —
    -- the only ordering the roster board reads. These are the same six the
    -- 20261001090000 migration adds to a database that already holds this
    -- vocabulary, at the same sort_order values, so a database built from
    -- this file and a database migrated onto it are identical.
    ('DT',   'Defensive Tackle', 'defence',    18),
    ('DE',   'Defensive End',    'defence',    19),
    ('LG',   'Left Guard',       'offence',    20),
    ('RG',   'Right Guard',      'offence',    21),
    ('LT',   'Left Tackle',      'offence',    22),
    ('RT',   'Right Tackle',     'offence',    23)
  ) as p(code, label, side, sort_order)
 where v.code = 'oulafc_2026'
on conflict (vocabulary_id, code) do nothing;

-- ---------------------------------------------------------------------------
-- Season — 2026–27, active, opened by the earliest-created active operator.
--
-- A `do` block rather than a plain `insert … select`, so a silent zero-row
-- insert can mean only one thing: the season already exists. It can never mean
-- "no opener was found" — the preflight above already refused in that case —
-- and this block re-checks it anyway, because the preflight's count is of
-- ANY operator_accounts row while the opener must be an ACTIVE one, and a
-- database whose only accounts are deactivated would otherwise insert a season
-- with no opener at all.
-- ---------------------------------------------------------------------------

do $season$
declare
  v_opener uuid;
  v_vocabulary uuid;
begin
  select person_id into v_opener
    from public.operator_accounts
   where is_active
   order by created_at asc
   limit 1;

  if v_opener is null then
    raise exception
      'LAN-350 production baseline refused: no ACTIVE public.operator_accounts '
      'row exists. opened_by_person_id is set to the person_id of the '
      'earliest-created active operator account — reinstate or create one, '
      'then re-run this file.';
  end if;

  select id into v_vocabulary
    from public.position_vocabularies
   where code = 'oulafc_2026';

  insert into public.seasons (
    label, status, position_vocabulary_id, starts_on, ends_on,
    opened_at, opened_by_person_id)
  values (
    '2026–27', 'active', v_vocabulary, date '2026-07-01', date '2027-06-30',
    now(), v_opener)
  on conflict (label) do nothing;
end
$season$;

-- ---------------------------------------------------------------------------
-- Terms — the real Oxford 2026–27 boundaries (Michaelmas, Hilary, Trinity).
-- ---------------------------------------------------------------------------

insert into public.terms (name, academic_year, starts_on, ends_on, first_week, last_week)
values
  ('michaelmas', '2026–27', date '2026-09-27', date '2026-12-05', -1, 8),
  ('hilary',     '2026–27', date '2027-01-10', date '2027-03-13',  0, 8),
  ('trinity',    '2026–27', date '2027-04-18', date '2027-06-19',  0, 8)
on conflict (name, academic_year) do nothing;

-- ---------------------------------------------------------------------------
-- Committee year — 2026–27, open (no ends_on).
-- ---------------------------------------------------------------------------

insert into public.committee_years (label, agm_held_on, starts_on, ends_on)
values ('2026–27', date '2026-06-01', date '2026-06-01', null)
on conflict (label) do nothing;

-- ---------------------------------------------------------------------------
-- Onboarding item types — the approved item-and-ask inventory, eleven items,
-- `src/lib/services/onboarding-item-types.json` (LAN-396).
--
-- Opening a season without these is what happened on 2026-09-17: this file
-- created the season, its terms, its positions and its committee year and no
-- item types, nothing in the application creates them, and every 2026–27
-- membership was therefore generated with no onboarding items
-- (`generateOnboardingItems` selects from the season's own types). Sub
-- invoiced, Sub paid, Comms group and Squad photo could not be edited on the
-- roster board, and a membership record read "This season has no onboarding
-- items configured, so this membership has none." Brian repaired it by hand
-- the same day; this is that repair, in the file that should have carried it.
--
-- `sort_order` is the list index, the order the inventory itself is written
-- in. `verification_class` is 'trust' only for BUCS Play and Hudl — "BUCS Play
-- and Hudl answers record claimed, not complete" (W4's locked decision).
-- ---------------------------------------------------------------------------

insert into public.onboarding_item_types
  (season_id, code, label, is_required, is_subscription, sort_order, verification_class)
select
  s.id, v.code, v.label, v.is_required, v.is_subscription, v.sort_order,
  v.verification_class::public.onboarding_item_verification_class
  from public.seasons s
  cross join (values
    ('subs_invoiced',            'Subscription invoiced',      true,  false, 0,  'direct'),
    ('subs_paid',                'Subscription paid',          false, true,  1,  'direct'),
    ('kit_sorted',               'Kit Distributed',            true,  false, 2,  'direct'),
    ('bucs_play',                'BUCS Play registration',     true,  false, 3,  'trust'),
    ('hudl_access',              'Hudl access',                false, false, 4,  'trust'),
    ('photo',                    'Squad photo',                false, false, 5,  'direct'),
    ('comms_groups',             'Comms groups joined',        true,  false, 6,  'direct'),
    ('contact_academic_details', 'Contact & academic details', true,  false, 7,  'direct'),
    ('code_of_conduct',          'Code of Conduct',            true,  false, 8,  'direct'),
    ('photo_release',            'Photo release',              true,  false, 9,  'direct'),
    ('season_welcome_consent',   'Season welcome & consent',   true,  false, 10, 'direct')
  ) as v (code, label, is_required, is_subscription, sort_order, verification_class)
 where s.label = '2026–27'
on conflict (season_id, code) do nothing;

-- Memberships created before the item types existed have no items, and nothing
-- generates them afterwards. This is the second half of the 2026-09-17 repair:
-- one pending item per (membership, type) for every membership in the season,
-- idempotent through `onboarding_items_one_per_type`.
insert into public.onboarding_items (season_membership_id, season_id, item_type_id, status)
select m.id, t.season_id, t.id, 'pending'::public.onboarding_item_status
  from public.season_memberships m
  join public.onboarding_item_types t on t.season_id = m.season_id
  join public.seasons s on s.id = m.season_id
 where s.label = '2026–27'
on conflict (season_membership_id, item_type_id) do nothing;

-- The gap itself, named rather than left to be found on a board.
do $items$
declare
  v_types integer;
begin
  select count(*) into v_types
    from public.onboarding_item_types t
    join public.seasons s on s.id = t.season_id
   where s.label = '2026–27';

  if v_types <> 11 then
    raise exception
      'LAN-396 production baseline refused: the 2026–27 season carries % onboarding '
      'item types, not 11. Every membership generated for a season with no item types '
      'has no onboarding items at all, which is the 2026-09-17 production defect. The '
      'list is src/lib/services/onboarding-item-types.json.', v_types;
  end if;
end
$items$;

commit;

-- ---------------------------------------------------------------------------
-- Verification — read this before trusting the run.
-- Expected: vocabulary_count = 1, position_count = 18, active_season_count = 1,
-- term_count = 3, open_committee_year_count = 1, onboarding_item_type_count = 11.
-- ---------------------------------------------------------------------------

select
  (select count(*) from public.position_vocabularies where code = 'oulafc_2026')
    as vocabulary_count,
  (select count(*) from public.positions
     where vocabulary_id = (select id from public.position_vocabularies where code = 'oulafc_2026'))
    as position_count,
  (select count(*) from public.seasons where label = '2026–27' and status = 'active')
    as active_season_count,
  (select count(*) from public.terms where academic_year = '2026–27')
    as term_count,
  (select count(*) from public.committee_years where label = '2026–27' and ends_on is null)
    as open_committee_year_count,
  (select count(*) from public.onboarding_item_types t
     join public.seasons s on s.id = t.season_id where s.label = '2026–27')
    as onboarding_item_type_count;
