-- LAN-374 — special teams assignments: six squads, a starting position and
-- three backups each.
--
-- Source: Stewart's assignments sheet, Special Teams Assignments tab, values
-- verbatim. Per player, per squad, four cells — Starting Position, Backup
-- Position 1, Backup Position 2, Backup Position 3. Twenty-four cells. Each is
-- one pick from that squad's own list, or blank.
--
-- This is not a depth chart. There is no rule tying the four cells of a squad
-- to each other, no rule across squads, and nothing derived from any of it:
-- the sheet is a record of what a player can be asked to do, and the club
-- reads it as such. So there is no cross-cell constraint here, deliberately.
--
-- Shape: one child table keyed (season membership, squad, slot), never
-- twenty-four columns. Which values a squad allows is reference data with a
-- composite foreign key onto it, so "Kicker on the punt squad" is refused by
-- the database rather than by a comment. `DEF ON FIELD` is a plain value
-- today, on the two squads whose sheet carries it, and means nothing to the
-- schema beyond being a value those squads allow.
--
-- The single "Special teams" position column this replaces was dropped with
-- its values by LAN-387 (Brian, 2026-09-16).

create type public.special_teams_squad as enum (
  'kick_return',
  'kickoff',
  'punt',
  'punt_return',
  'field_goal',
  'field_goal_block'
);

create type public.special_teams_slot as enum (
  'starting',
  'backup_1',
  'backup_2',
  'backup_3'
);

-- ---------------------------------------------------------------------------
-- What each squad allows (reference data)
-- ---------------------------------------------------------------------------

create table public.special_teams_squad_positions (
  squad public.special_teams_squad not null,
  position_name text not null,
  sort_order smallint not null,

  constraint special_teams_squad_positions_pkey primary key (squad, position_name),
  constraint special_teams_squad_positions_name_not_blank check (btrim(position_name) <> '')
);

comment on table public.special_teams_squad_positions is
  'Which positions each special-teams squad allows — Stewart''s Special Teams Assignments tab, LAN-374, values verbatim. Reference data: the sheet''s own words, in the sheet''s own order.';

insert into public.special_teams_squad_positions (squad, position_name, sort_order) values
  ('kick_return', 'Left Tackle', 1),
  ('kick_return', 'Right Tackle', 2),
  ('kick_return', 'Left Guard', 3),
  ('kick_return', 'Right Guard', 4),
  ('kick_return', 'Center', 5),
  ('kick_return', 'Left Upback', 6),
  ('kick_return', 'Middle Upback', 7),
  ('kick_return', 'Right Upback', 8),
  ('kick_return', 'Left Returner', 9),
  ('kick_return', 'Middle Returner', 10),
  ('kick_return', 'Right Returner', 11),
  ('kickoff', '1 Gunner', 1),
  ('kickoff', '2 Gunner', 2),
  ('kickoff', '3 Heavy', 3),
  ('kickoff', '4 Heavy', 4),
  ('kickoff', '5 Heavy', 5),
  ('kickoff', '6 Attacker', 6),
  ('kickoff', '7 Attacker', 7),
  ('kickoff', '8 Linebacker', 8),
  ('kickoff', '9 Gunner', 9),
  ('kickoff', '10 Linebacker', 10),
  ('kickoff', 'Kicker', 11),
  ('punt', 'Left Tackle', 1),
  ('punt', 'Right Tackle', 2),
  ('punt', 'Left Guard', 3),
  ('punt', 'Right Guard', 4),
  ('punt', 'Longsnapper', 5),
  ('punt', 'Left Wing', 6),
  ('punt', 'Right Wing', 7),
  ('punt', 'Left Wall', 8),
  ('punt', 'Right Wall', 9),
  ('punt', 'Middle Wall', 10),
  ('punt', 'Punter', 11),
  ('punt_return', 'Returner', 1),
  ('punt_return', 'DEF ON FIELD', 2),
  ('field_goal', 'Left Tackle', 1),
  ('field_goal', 'Right Tackle', 2),
  ('field_goal', 'Left Guard', 3),
  ('field_goal', 'Right Guard', 4),
  ('field_goal', 'Longsnapper', 5),
  ('field_goal', 'Left TE', 6),
  ('field_goal', 'Right TE', 7),
  ('field_goal', 'Left Wing', 8),
  ('field_goal', 'Right Wing', 9),
  ('field_goal', 'Holder', 10),
  ('field_goal', 'Kicker', 11),
  ('field_goal_block', 'DEF ON FIELD', 1);

-- ---------------------------------------------------------------------------
-- The assignments themselves
-- ---------------------------------------------------------------------------

create table public.special_teams_assignments (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  squad public.special_teams_squad not null,
  slot public.special_teams_slot not null,
  position_name text not null,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint special_teams_assignments_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  -- One pick per cell. Blank is the absence of a row, never a row holding ''.
  constraint special_teams_assignments_one_per_slot
    unique (season_membership_id, squad, slot),
  -- The value has to be one this squad allows. Not a check constraint: the
  -- list is data, and a foreign key is how the database proves it.
  constraint special_teams_assignments_value_in_squad
    foreign key (squad, position_name)
    references public.special_teams_squad_positions (squad, position_name) on update cascade
);

create index special_teams_assignments_membership_idx
  on public.special_teams_assignments (season_membership_id);
create index special_teams_assignments_season_idx
  on public.special_teams_assignments (season_id, squad, slot);

comment on table public.special_teams_assignments is
  'One player''s pick for one (squad, slot) cell of the special-teams sheet — LAN-374. No depth-chart rule ties the cells together; a player may hold the same position in several slots and several squads.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.special_teams_squad_positions enable row level security;
alter table public.special_teams_assignments enable row level security;

revoke all on table public.special_teams_squad_positions, public.special_teams_assignments
  from anon, authenticated, service_role;

-- The squad lists are read, never written by the application: a change to what
-- a squad allows is a migration, exactly as a position vocabulary is.
grant select on table public.special_teams_squad_positions to service_role;
grant select, insert, update, delete
  on table public.special_teams_assignments to service_role;
