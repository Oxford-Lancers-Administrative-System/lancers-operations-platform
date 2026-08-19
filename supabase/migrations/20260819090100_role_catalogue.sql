-- LAN-128 (mission M-OPERATOR-ADMIN-WITHOUT-SQL, WP-schema), part 2 of 2:
-- the approved static twenty-role catalogue itself.
--
-- ## This file is the catalogue. There is no second definition.
--
-- Before this migration the catalogue existed in the local seed script and,
-- copied by hand, in the owner-run showcase loader. Two hand-written copies of
-- the same list is exactly the drift REQ-static-role-catalogue is written
-- against, and neither copy could ever reach hosted: the seed refuses any
-- non-loopback database by design. Both copies are removed in the same commit
-- as this file. Anything that needs a role now reads `public.roles`.
--
-- ## It is idempotent, and that is tested
--
-- Every statement below is an upsert keyed on the natural key — `role_groups.code`,
-- `roles.code`, `(role_id, alias)` — so running the file twice leaves exactly
-- the same twenty rows, and running it against a database that already has some
-- of them adopts those rows rather than duplicating them. That matters for
-- hosted specifically: `roles.id` is referenced by `role_assignments`, so the
-- upsert must never replace an existing seat with a new identifier.
-- `tests/role-catalogue.test.ts` executes this file a second time against the
-- migrated database and asserts nothing changed.
--
-- ## Source
--
-- The mission packet, `missions/packets/M-OPERATOR-ADMIN-WITHOUT-SQL/packet.json`
-- v2, REQ-static-role-catalogue and DEC-coach-catalogue, approved by Brian.
-- The three groups and their order, and the names within them, are quoted from
-- that requirement.

-- ---------------------------------------------------------------------------
-- The three groups, in the approved order
-- ---------------------------------------------------------------------------
insert into public.role_groups (code, label, sort_order)
values
  ('operational_administration', 'Operational Administration', 1),
  ('club_committee', 'Club Committee', 2),
  ('coaching_staff', 'Coaching Staff', 3)
on conflict (code) do update
  set label = excluded.label,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- The twenty roles
-- ---------------------------------------------------------------------------
-- Codes. Seventeen of the twenty are the display name lowercased with every
-- run of non-alphanumeric characters replaced by an underscore, which is the
-- convention the existing catalogue already followed. Three exceptions, all
-- deliberate:
--
--   * `offence_coach` and `defence_coach` keep the codes they have had since
--     the domain baseline even though the packet renames the seats to
--     "Offensive Coordinator" and "Defensive Coordinator". A code is an
--     identifier, not a label: these two are named by
--     `src/lib/auth/capabilities.ts`, by `tests/operator-capability-catalogue.test.ts`
--     and by every seeded and hosted assignment that already exists. Renaming
--     them would be a rename of a key for cosmetic reasons. Their previous
--     display names are recorded as aliases below, which is how the Gameday
--     seat's five historical names are already handled (LAN-42);
--   * `head_coach` was already the code for "Head Coach" and is unchanged.
--
-- Scope. Committee seats hang off the committee year and coaching seats off the
-- season — register D8, unchanged by this migration. General Manager and IT
-- Officer stay `committee_year` for the same reason they always were: that is
-- the cycle their appointment is recorded against. DEC-general-manager-standing
-- makes both seats *standing* across operating years, which is a statement
-- about how an assignment is renewed rather than about which cycle it names,
-- and it belongs to the assignment work package rather than to the catalogue.
with catalogue (
  code, name, scope, group_code, sort_order, is_office, is_single_holder_seat
) as (
  values
    -- Operational Administration
    ('general_manager',      'General Manager',       'committee_year'::public.role_scope, 'operational_administration',  1, false, true),
    ('it_officer',           'IT Officer',            'committee_year'::public.role_scope, 'operational_administration',  2, false, false),
    -- Club Committee. The first four are the constitutional Offices
    -- (Fourth Edition 24.04.22, ¶19); the other four are not.
    ('president',            'President',             'committee_year'::public.role_scope, 'club_committee',              1, true,  false),
    ('vice_president',       'Vice-President',        'committee_year'::public.role_scope, 'club_committee',              2, true,  false),
    ('secretary',            'Secretary',             'committee_year'::public.role_scope, 'club_committee',              3, true,  false),
    ('treasurer',            'Treasurer',             'committee_year'::public.role_scope, 'club_committee',              4, true,  false),
    ('social_secretary',     'Social Secretary',      'committee_year'::public.role_scope, 'club_committee',              5, false, false),
    ('gameday_secretary',    'Gameday Secretary',     'committee_year'::public.role_scope, 'club_committee',              6, false, false),
    ('kit_manager',          'Kit Manager',           'committee_year'::public.role_scope, 'club_committee',              7, false, false),
    ('media_secretary',      'Media Secretary',       'committee_year'::public.role_scope, 'club_committee',              8, false, false),
    -- Coaching Staff
    ('head_coach',           'Head Coach',            'season'::public.role_scope,         'coaching_staff',              1, false, false),
    ('offence_coach',        'Offensive Coordinator', 'season'::public.role_scope,         'coaching_staff',              2, false, false),
    ('defence_coach',        'Defensive Coordinator', 'season'::public.role_scope,         'coaching_staff',              3, false, false),
    ('quarterbacks_coach',   'Quarterbacks Coach',    'season'::public.role_scope,         'coaching_staff',              4, false, false),
    ('offensive_line_coach', 'Offensive Line Coach',  'season'::public.role_scope,         'coaching_staff',              5, false, false),
    ('wide_receivers_coach', 'Wide Receivers Coach',  'season'::public.role_scope,         'coaching_staff',              6, false, false),
    ('defensive_line_coach', 'Defensive Line Coach',  'season'::public.role_scope,         'coaching_staff',              7, false, false),
    ('linebackers_coach',    'Linebackers Coach',     'season'::public.role_scope,         'coaching_staff',              8, false, false),
    ('defensive_backs_coach','Defensive Backs Coach', 'season'::public.role_scope,         'coaching_staff',              9, false, false),
    ('special_teams_coach',  'Special Teams Coach',   'season'::public.role_scope,         'coaching_staff',             10, false, false)
)
insert into public.roles (
  code, name, scope, role_group_id, sort_order,
  is_constitutional_office, is_single_holder_seat,
  constitution_edition, constitution_reference
)
select
  catalogue.code,
  catalogue.name,
  catalogue.scope,
  role_groups.id,
  catalogue.sort_order,
  catalogue.is_office,
  catalogue.is_single_holder_seat,
  case when catalogue.is_office then 'Fourth Edition 24.04.22' end,
  case when catalogue.is_office then '¶19' end
from catalogue
join public.role_groups on role_groups.code = catalogue.group_code
on conflict (code) do update
  set name = excluded.name,
      scope = excluded.scope,
      role_group_id = excluded.role_group_id,
      sort_order = excluded.sort_order,
      is_constitutional_office = excluded.is_constitutional_office,
      is_single_holder_seat = excluded.is_single_holder_seat,
      constitution_edition = excluded.constitution_edition,
      constitution_reference = excluded.constitution_reference;

-- ---------------------------------------------------------------------------
-- Aliases: the names these seats have gone by
-- ---------------------------------------------------------------------------
-- The Gameday seat's five names across a decade are LAN-42's finding, and the
-- reason `role_aliases` exists at all: a handover document that says "Match
-- Secretary" has to resolve to the enduring seat. They lived in the local seed
-- until now, which meant hosted could not resolve any of them.
--
-- The two coordinator entries are this migration's own rename. Anything already
-- written down as "Offence Coach" still resolves.
insert into public.role_aliases (role_id, alias, source)
select roles.id, aliases.alias, aliases.source
from (
  values
    ('gameday_secretary', 'Game Day Coordinator', 'handover corpus'),
    ('gameday_secretary', 'Match Secretary',      'handover corpus'),
    ('gameday_secretary', 'Fixtures Secretary',   'handover corpus'),
    ('gameday_secretary', 'Gameday Lead',         'handover corpus'),
    ('offence_coach',     'Offence Coach',        'catalogue before LAN-128'),
    ('defence_coach',     'Defence Coach',        'catalogue before LAN-128')
) as aliases (code, alias, source)
join public.roles on roles.code = aliases.code
on conflict (role_id, alias) do nothing;

-- ---------------------------------------------------------------------------
-- Now that every role has a group, require one
-- ---------------------------------------------------------------------------
-- Deliberately here rather than in the structure migration: nothing there could
-- have supplied a group for a row that already existed. Both statements are
-- no-ops on a second run, and either one fails loudly if some environment holds
-- a role this catalogue does not name — which is the right outcome, because
-- such a role would be a seat nobody approved.
alter table public.roles alter column role_group_id set not null;
alter table public.roles alter column sort_order set not null;
