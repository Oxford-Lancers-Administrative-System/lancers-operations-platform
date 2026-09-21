-- LAN-401 — Stewart's position-vocabulary corrections, and the Warmup
-- assignments group.
--
-- Source: Stewart's list, via Brian, 2026-09-21. Decisions (Brian, the same
-- day): rename in place on `main` wherever the code lives; keep the generic
-- `G` and `T` beside the sided ones; Warmup assignments is its own group.
--
-- Two halves, in one migration because they are one instruction from one
-- conversation:
--
--   1. The vocabulary edits. `N/T` becomes `NT`, `E` is relabelled `Edge`
--      rather than `End`, and six codes are added: `DT`, `DE` on defence and
--      `LG`, `RG`, `LT`, `RT` on offence. Nothing is deleted and nothing is
--      re-keyed: a `positions` row's `id` is what `position_assignments`
--      holds, so changing its `code` in place carries every assignment with
--      it, which is the whole reason Brian asked for a rename rather than a
--      new row beside the old one.
--
--   2. The Warmup assignments group: eight small-group names as reference
--      data, and one value per season membership checked against them.
--      LAN-374's shape exactly — a list the database owns, and a child table
--      whose value is proved by a foreign key onto it rather than by a check
--      constraint the next name would have to edit.
--
-- Which vocabularies each half touches is not the same question, and the two
-- answers differ deliberately. The rename and the relabel are corrections to
-- a name the club already uses, so they run over every vocabulary present
-- (Brian, 2026-09-21): a 2022 archive that recorded a nose tackle recorded the
-- same position this sheet calls `NT`, and leaving it spelled `N/T` would put
-- two spellings of one position in one database. The six additions are new
-- slots the club is adopting now, so they follow LAN-387's precedent and go
-- only to the vocabularies live seasons use — an archived season's taxonomy is
-- never widened after the fact (invariant S3).

-- ===========================================================================
-- LAN-401 VOCABULARY EDITS — BEGIN
--
-- Everything between this marker and its END is written to be re-runnable:
-- `tests/schema-roster-vocabulary.test.ts` replays exactly this block against
-- a vocabulary it builds with the old spellings, which is the only way to
-- prove "the assignment carries across the rename" on a database where the
-- migration has already run. Do not put non-idempotent DDL inside it.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. `N/T` becomes `NT`
--
-- Two paths, because a vocabulary may already hold `NT` — the local seed's
-- 2026 vocabulary does, and the production baseline's does not. Where both
-- codes exist the same position is in the table twice, so the assignments move
-- onto `NT` and the `N/T` row goes; where only `N/T` exists the row is renamed
-- where it stands and its `id`, and so every assignment, is untouched.
--
-- Re-pointing cannot collide with `position_assignments_one_per_slot`: it
-- changes which position an existing row names, never how many rows a slot
-- has. Both composite foreign keys still hold — the survivor is in the same
-- vocabulary and on the same side as the row it replaces.
-- ---------------------------------------------------------------------------

update public.position_assignments a
   set position_id = survivor.id
  from public.positions duplicate
  join public.positions survivor
    on survivor.vocabulary_id = duplicate.vocabulary_id
   and survivor.code = 'NT'
   and survivor.side = duplicate.side
 where a.position_id = duplicate.id
   and duplicate.code = 'N/T';

delete from public.positions as duplicate
 where duplicate.code = 'N/T'
   and exists (
     select 1 from public.positions survivor
      where survivor.vocabulary_id = duplicate.vocabulary_id
        and survivor.code = 'NT');

update public.positions
   set code = 'NT', label = 'Nose Tackle'
 where code = 'N/T';

-- ---------------------------------------------------------------------------
-- 2. `E` is `Edge`, not `End`
--
-- The baseline seats `E — End`; Stewart's sheet says the same slot is the
-- Edge. LAN-387 tried to insert `E — Edge` as an addition and its
-- `on conflict on constraint positions_unique_in_vocabulary do nothing` meant
-- that on any vocabulary already holding an `E` the insert was silently
-- skipped, so the label never changed. This is the relabel that was missed.
--
-- The collapse below is for a vocabulary that ended up holding an `End` row
-- and an `Edge` row under two different codes — the shape LAN-387 would have
-- produced had it used a different code for the Edge. No vocabulary in this
-- repository is in that state, and the statement is still here because the
-- requirement names it and because a hand-loaded database might be.
-- ---------------------------------------------------------------------------

update public.position_assignments a
   set position_id = survivor.id
  from public.positions duplicate
  join public.positions survivor
    on survivor.vocabulary_id = duplicate.vocabulary_id
   and survivor.code = 'E'
   and survivor.side = duplicate.side
 where a.position_id = duplicate.id
   and duplicate.code <> 'E'
   and btrim(duplicate.label) = 'Edge'
   and exists (
     select 1 from public.positions e_row
      where e_row.vocabulary_id = duplicate.vocabulary_id
        and e_row.code = 'E'
        and btrim(e_row.label) in ('End', 'Edge'));

delete from public.positions as duplicate
 where duplicate.code <> 'E'
   and btrim(duplicate.label) = 'Edge'
   and exists (
     select 1 from public.positions e_row
      where e_row.vocabulary_id = duplicate.vocabulary_id
        and e_row.code = 'E'
        and btrim(e_row.label) in ('End', 'Edge'));

update public.positions
   set label = 'Edge'
 where code = 'E';

-- ---------------------------------------------------------------------------
-- 3. The six additions
--
-- `DT` and `DE` on defence, `LG`, `RG`, `LT` and `RT` on offence. `G — Guard`
-- and `T — Tackle` stay exactly where they are (Brian, 2026-09-21): a coach
-- who means "a guard, either side" still has a word for it.
--
-- Sort order appends each new code to the end of its own side, in the order
-- Stewart listed them, by counting from the vocabulary's own maximum rather
-- than from a fixed number — LAN-387's idiom, for the same reason, which is
-- that two vocabularies never hold the same number of rows. Ordering within a
-- side is what the board reads (`order by side, sort_order, code`), so a value
-- past every existing row's is "last on this side" whichever side it is.
-- ---------------------------------------------------------------------------

insert into public.positions (vocabulary_id, code, label, side, sort_order)
select vocabularies.id,
       addition.code,
       addition.label,
       addition.side::public.position_side,
       coalesce(
         (select max(p.sort_order) from public.positions p
           where p.vocabulary_id = vocabularies.id),
         0) + addition.offset_order
  from (
    select distinct s.position_vocabulary_id as id
      from public.seasons s
     where s.status <> 'archived'
  ) as vocabularies
  cross join (
    values
      ('DT', 'Defensive Tackle', 'defence', 1),
      ('DE', 'Defensive End',    'defence', 2),
      ('LG', 'Left Guard',       'offence', 3),
      ('RG', 'Right Guard',      'offence', 4),
      ('LT', 'Left Tackle',      'offence', 5),
      ('RT', 'Right Tackle',     'offence', 6)
  ) as addition (code, label, side, offset_order)
on conflict on constraint positions_unique_in_vocabulary do nothing;

-- ===========================================================================
-- LAN-401 VOCABULARY EDITS — END
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 4. Warmup assignments — the eight small groups (reference data)
--
-- Stewart's own words, in his own order. Reference data on LAN-374's model:
-- read and never written by the application, so a ninth group is a migration
-- exactly as a position vocabulary version is, and the assignment table proves
-- its value against this one by foreign key rather than by a check constraint.
-- ---------------------------------------------------------------------------

create table public.warmup_small_groups (
  name text not null,
  sort_order smallint not null,

  constraint warmup_small_groups_pkey primary key (name),
  constraint warmup_small_groups_name_not_blank check (btrim(name) <> ''),
  constraint warmup_small_groups_order_unique unique (sort_order)
);

comment on table public.warmup_small_groups is
  'The warmup small groups a player may be assigned to — Stewart''s list, LAN-401, names and order verbatim. Reference data: a new group is a migration.';

insert into public.warmup_small_groups (name, sort_order) values
  ('Kings', 1),
  ('Raider', 2),
  ('Bear', 3),
  ('Phoenix', 4),
  ('Cavalier', 5),
  ('Blue', 6),
  ('Gold', 7),
  ('Lancer', 8);

-- ---------------------------------------------------------------------------
-- 5. Warmup assignments — one small group per player
--
-- One column on the sheet, so one row per membership at most: `unique
-- (season_membership_id)` rather than LAN-374's `(membership, squad, slot)`.
-- Blank is the absence of a row, never a row holding an empty string.
--
-- Nothing is derived from this and no rule ties it to a position, a coaching
-- group or a special-teams squad. A warmup small group is where a player warms
-- up; it says nothing about what they play.
-- ---------------------------------------------------------------------------

create table public.warmup_group_assignments (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  small_group text not null,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint warmup_group_assignments_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  -- One cell, so one row.
  constraint warmup_group_assignments_one_per_membership
    unique (season_membership_id),
  -- The value has to be one of the eight. Not a check constraint: the list is
  -- data, and a foreign key is how the database proves it.
  constraint warmup_group_assignments_value_in_vocabulary
    foreign key (small_group)
    references public.warmup_small_groups (name) on update cascade
);

create index warmup_group_assignments_season_idx
  on public.warmup_group_assignments (season_id, small_group);

comment on table public.warmup_group_assignments is
  'Which warmup small group a player is assigned to this season — LAN-401, Stewart''s list. At most one per membership; blank is the absence of a row.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.warmup_small_groups enable row level security;
alter table public.warmup_group_assignments enable row level security;

revoke all on table public.warmup_small_groups, public.warmup_group_assignments
  from anon, authenticated, service_role;

grant select on table public.warmup_small_groups to service_role;
grant select, insert, update, delete
  on table public.warmup_group_assignments to service_role;
