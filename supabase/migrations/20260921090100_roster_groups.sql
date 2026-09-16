-- LAN-387, part 2 of 2 — the roster's seven-plus-one column groups.
--
-- Source: the Brian–Stewart call of 2026-09-16 and Stewart's assignments
-- sheet, Coaching Assignments tab. The board and the membership record stop
-- being Person / Onboarding / Season and become Person, Onboarding,
-- Membership, Coaching assignments, Offensive assignments, Defensive
-- assignments, Special teams assignments and Kit. Only the storage the new
-- columns need is here; the grouping itself is presentation and lives in
-- `src/app/operate/roster/board-columns.ts`.
--
-- Four things:
--
--   1. Backup positions become writable. Part 1 added the two slots; this
--      widens the slot/side check so a row may carry them. Both halves of the
--      pair draw on the season's own vocabulary through the same composite
--      foreign keys (invariant S3), and the existing per-slot exclusion keeps
--      at most one current primary and one current backup a side (S1/S4).
--      Nothing says a primary and a backup must differ — Stewart's sheet has
--      players listed the same both times and that is a real answer.
--
--   2. The coaching group becomes a multi-select. It is already free text on
--      `coach_group_assignments`, one row per membership; the only thing
--      standing in the way of several is the one-per-membership unique
--      constraint, so that is replaced by one-per-(membership, group). A new
--      table would have left `coach_group_assignments` behind as a second
--      home for the same fact, so this widens the table that already holds it.
--      The three values are closed here for the first time (Offense, Defense,
--      Special Teams — the sheet's own spellings), and the rows written under
--      the old British spellings are rewritten to them.
--
--   3. Offensive and defensive position groups are new facts, several per
--      player, so they get their own table keyed (membership, side, group).
--      They reuse `public.position_side` rather than minting a parallel enum;
--      a group is never a special-teams thing, and the check says so.
--
--   4. The single "Special teams" position column is dropped with its values
--      (Brian, 2026-09-16). It held one of KO/KR/PUNT/FG per player, which the
--      Special Teams Assignments tab replaces wholesale with six squads of
--      four slots each (LAN-374). The vocabulary rows stay — a position
--      vocabulary is versioned reference data and an archived season's
--      assignments must keep resolving — but no current-season assignment
--      survives, because none of them means anything under the new sheet.
--
-- Stewart's sheet also adds positions to the current vocabulary; those inserts
-- are at the end, idempotent and confined to the vocabularies live seasons
-- actually use. An archived season's taxonomy is never rewritten (invariant
-- S3's whole point).

-- ---------------------------------------------------------------------------
-- 1. Backup position slots may be stored
-- ---------------------------------------------------------------------------

alter table public.position_assignments
  drop constraint position_assignments_slot_matches_side;

alter table public.position_assignments
  add constraint position_assignments_slot_matches_side check (
    (slot in ('offence', 'offence_backup') and side = 'offence')
    or (slot in ('defence', 'defence_backup') and side = 'defence')
    or (slot in ('kickoff', 'kick_return', 'punt', 'field_goal') and side = 'special_teams'));

comment on column public.position_assignments.slot is
  'Which of the player''s position slots this assignment fills. `offence`/`defence` are the primary pair and `offence_backup`/`defence_backup` the backup pair (LAN-387); the four special-teams slots are historical and no longer written (LAN-374).';

-- ---------------------------------------------------------------------------
-- 2. The coaching group, several per player
-- ---------------------------------------------------------------------------

-- The board wrote "Offense", "Defense" and "Special teams"; the showcase plan
-- wrote "Offence" and "Defence". One vocabulary now, the sheet's.
update public.coach_group_assignments
   set coach_group = case lower(btrim(coach_group))
         when 'offence' then 'Offense'
         when 'offense' then 'Offense'
         when 'defence' then 'Defense'
         when 'defense' then 'Defense'
         when 'special teams' then 'Special Teams'
         else coach_group
       end;

-- A membership that somehow holds two rows for the same group after that
-- rewrite keeps one; the unique constraint below would otherwise refuse.
delete from public.coach_group_assignments a
 using public.coach_group_assignments b
 where a.season_membership_id = b.season_membership_id
   and a.coach_group = b.coach_group
   and a.id > b.id;

alter table public.coach_group_assignments
  drop constraint coach_group_assignments_one_per_membership;

alter table public.coach_group_assignments
  add constraint coach_group_assignments_one_per_group
    unique (season_membership_id, coach_group);

-- Anything outside the sheet's three values is not a coaching group.
delete from public.coach_group_assignments
 where coach_group not in ('Offense', 'Defense', 'Special Teams');

alter table public.coach_group_assignments
  add constraint coach_group_assignments_group_in_vocabulary
    check (coach_group in ('Offense', 'Defense', 'Special Teams'));

comment on table public.coach_group_assignments is
  'Which coaching groups a player trains with this season — Offense, Defense, Special Teams, any combination, uncapped (LAN-387, Stewart''s Coaching Assignments tab). One row per group held.';

-- ---------------------------------------------------------------------------
-- 3. Offensive and defensive position groups
-- ---------------------------------------------------------------------------

create table public.membership_position_groups (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  -- Which half of the sheet this group belongs to. Never `special_teams`:
  -- special teams is squads and slots (LAN-374), not position groups.
  side public.position_side not null,
  position_group text not null,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint membership_position_groups_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint membership_position_groups_one_per_group
    unique (season_membership_id, side, position_group),
  constraint membership_position_groups_group_in_vocabulary check (
    (side = 'offence'
      and position_group in
        ('Offensive Line', 'Quarterbacks', 'Runningbacks', 'Wide Receivers'))
    or (side = 'defence'
      and position_group in
        ('Defensive Line', 'Linebackers', 'Defensive Backs')))
);

create index membership_position_groups_membership_idx
  on public.membership_position_groups (season_membership_id);
create index membership_position_groups_season_idx
  on public.membership_position_groups (season_id, side, position_group);

comment on table public.membership_position_groups is
  'Which position groups a player is assigned to, per side — Stewart''s Coaching Assignments tab (LAN-387). Several per side, uncapped; blank is no row.';

-- ---------------------------------------------------------------------------
-- 4. The single special-teams position column is dropped with its values
-- ---------------------------------------------------------------------------

delete from public.position_assignments where side = 'special_teams';

-- ---------------------------------------------------------------------------
-- 5. Stewart's position additions, merged into the live vocabulary
-- ---------------------------------------------------------------------------

insert into public.positions (vocabulary_id, code, label, side, sort_order)
select vocabularies.id,
       addition.code,
       addition.label,
       addition.side::public.position_side,
       coalesce(
         (select max(p.sort_order) from public.positions p where p.vocabulary_id = vocabularies.id),
         0) + addition.offset_order
  from (
    select distinct s.position_vocabulary_id as id
      from public.seasons s
     where s.status <> 'archived'
  ) as vocabularies
  cross join (
    values
      ('HB', 'Half Back', 'offence', 1),
      ('OL', 'Offensive Line', 'offence', 2),
      ('N', 'Nickel', 'defence', 3),
      ('DL', 'Defensive Line', 'defence', 4),
      ('OLB', 'Outside Line Backer', 'defence', 5),
      ('ILB', 'Inside Line Backer', 'defence', 6),
      ('E', 'Edge', 'defence', 7)
  ) as addition (code, label, side, offset_order)
on conflict on constraint positions_unique_in_vocabulary do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.membership_position_groups enable row level security;

revoke all on table public.membership_position_groups
  from anon, authenticated, service_role;

grant select, insert, delete
  on table public.membership_position_groups
  to service_role;
