-- Audiences by category, and recruits on every event type — LAN-414, LAN-416.
--
-- ## The decision
--
-- State of the App call, 2026-09-22. Stewart defined the club's audiences from
-- the roster board and Clint confirmed the names: the assignment columns the
-- roster already keeps — coaching group, offensive position group, defensive
-- position group, warmup small group, and the six special-teams squads —
-- become audiences an event can be built from, under category headers, beside
-- the baseline groups that exist today. Brian: "those four columns turned into
-- events groups."
--
-- The same call amended D46/LAN-295. A recruit could only be invited to a
-- Recruitment event, and between the pure recruiting events and the first team
-- practices there is a run of mixed events a good recruit had no way onto.
-- Clint: "the type of an event pertains to what's actually going to happen at
-- the event, not who's invited." Brian's rule, accepted by both: a recruit can
-- be invited to any event, and the only door is the Recruits category itself —
-- "no one on the recruit list is ever going to be \[included\] if you click all
-- onboarding and all \[active\]."
--
-- ## Storage: category and value, not more enum values
--
-- LAN-414 leaves the representation to the implementer and names the two
-- candidates: add values to `public.audience_group`, or store a category and a
-- value on the audience row. This migration stores the pair, for one reason.
--
-- The sub-groups are *values of roster vocabularies that the club edits*.
-- LAN-401 renamed position groups on Stewart's say-so; LAN-409 renamed the
-- braces; the warmup small groups are reference data in a table precisely so
-- the list can move. An enum value per vocabulary value would make every such
-- rename a schema migration, and would couple two closed lists that are edited
-- by different decisions and different people. `value text` is also what the
-- roster itself stores those facts as (`coach_group text`,
-- `position_group text`, `small_group text`), so the audience row and the
-- assignment row it matches speak the same vocabulary in the same type.
--
-- `public.audience_group` therefore stays exactly as it is and keeps carrying
-- the General category, which is genuinely a closed list of system-derived
-- groups (D43). Exactly one of the two representations is set per row, and a
-- check constraint says so rather than a convention.
--
-- ## The recruits enum value is retired in place
--
-- `recruits` was a General group offered on Recruitment events alone. LAN-416
-- replaces it with a Recruits *category* of four pills — all active recruits,
-- and one per open status. The single old value is therefore not dropped from
-- the enum (values cannot be dropped, and rows hold it) but converted: every
-- stored `recruits` row becomes `category = 'recruits', value = 'all'`, which
-- is the same audience under the new representation, and the check below
-- refuses it as a General group from here on so the two cannot both be true.

-- ---------------------------------------------------------------------------
-- 1. The categories
-- ---------------------------------------------------------------------------

-- Closed, and closed for the same reason `audience_group` is: a category is a
-- structural fact about where an audience comes from, not a club vocabulary
-- anybody edits. The order is the order the picker shows them in.
create type public.audience_group_category as enum (
  'general',
  'coaching',
  'warmup',
  'special_teams',
  'recruits'
);

comment on type public.audience_group_category is
  'LAN-414. Which family a chosen audience group belongs to. `general` rows carry a `public.audience_group`; every other category carries a `value` drawn from the roster vocabulary the category names (a coaching or position group, a warmup small group, a special-teams squad) or, for `recruits`, one of `all`, `identified`, `engaged`, `committed`.';

-- ---------------------------------------------------------------------------
-- 2. The groups an event was built from
-- ---------------------------------------------------------------------------

alter table public.event_audience_groups
  add column category public.audience_group_category not null default 'general',
  add column value text;

alter table public.event_audience_groups
  alter column audience_group drop not null;

-- The one conversion. A stored `recruits` rule is the same audience as the new
-- "All active recruits" pill, so it is rewritten rather than dropped: an
-- approved recruitment event keeps its LAN-392 rule across this migration.
update public.event_audience_groups
   set category = 'recruits', value = 'all', audience_group = null
 where audience_group = 'recruits';

alter table public.event_audience_groups
  drop constraint event_audience_groups_key,
  -- LAN-416: recruits are offered on every event type now, by explicit pick.
  -- The guard that made a `recruits` rule on a practice impossible is the very
  -- thing the issue removes, and without dropping it saving an Engaged-recruits
  -- audience on a Training event is refused by the database.
  drop constraint event_audience_groups_recruits_are_recruitment_only;

-- `nulls not distinct` is load-bearing. Postgres treats two nulls as different
-- values in a unique constraint by default, so with `audience_group` nullable
-- the ordinary form would let the same (event, coaching, 'Quarterbacks') row be
-- written twice — the duplicate the old `(event_id, audience_group)` key
-- existed to prevent.
alter table public.event_audience_groups
  add constraint event_audience_groups_key
    unique nulls not distinct (event_id, category, audience_group, value),
  add constraint event_audience_groups_representation check (
    (category = 'general'
       and audience_group is not null
       and audience_group <> 'recruits'
       and value is null)
    or (category <> 'general'
       and audience_group is null
       and value is not null
       and btrim(value) <> ''));

comment on column public.event_audience_groups.category is
  'LAN-414. Which family this chosen group belongs to. `general` rows carry `audience_group`; every other category carries `value`, and `event_audience_groups_representation` holds exactly one of the two true.';
comment on column public.event_audience_groups.value is
  'LAN-414. The roster value this sub-group is, verbatim as the roster stores it — a coaching or position group name, a warmup small group name, a `public.special_teams_squad` token — or, for the recruits category, one of `all`, `identified`, `engaged`, `committed`. Null for a General group.';

create index event_audience_groups_category_idx
  on public.event_audience_groups (category, value, event_id);

-- ---------------------------------------------------------------------------
-- 3. The same pair on a template's default audience
-- ---------------------------------------------------------------------------
--
-- A template default has always been stored in the same vocabulary as an
-- event's own groups, and LAN-414 keeps that: the template editor offers the
-- categories the event form offers. The table's natural key was its primary
-- key, and a primary key's columns cannot be nullable, so it gains the
-- surrogate `id` the per-event table already carries and the natural key
-- becomes a unique constraint — the shape `event_audience_groups` has, for the
-- same reason.

alter table public.event_template_audience_groups
  add column id uuid not null default gen_random_uuid(),
  add column category public.audience_group_category not null default 'general',
  add column value text;

alter table public.event_template_audience_groups
  drop constraint event_template_audience_groups_key,
  drop constraint event_template_audience_groups_recruits_are_recruitment_only;

alter table public.event_template_audience_groups
  alter column audience_group drop not null;

update public.event_template_audience_groups
   set category = 'recruits', value = 'all', audience_group = null
 where audience_group = 'recruits';

alter table public.event_template_audience_groups
  add constraint event_template_audience_groups_pkey primary key (id),
  add constraint event_template_audience_groups_key
    unique nulls not distinct (template_id, category, audience_group, value),
  add constraint event_template_audience_groups_representation check (
    (category = 'general'
       and audience_group is not null
       and audience_group <> 'recruits'
       and value is null)
    or (category <> 'general'
       and audience_group is null
       and value is not null
       and btrim(value) <> ''));

comment on column public.event_template_audience_groups.category is
  'LAN-414. As `event_audience_groups.category`: the family this default group belongs to.';
comment on column public.event_template_audience_groups.value is
  'LAN-414. As `event_audience_groups.value`: the roster value or recruit status this default sub-group is. Null for a General group.';

-- ---------------------------------------------------------------------------
-- 4. Which group rule added a row after approval
-- ---------------------------------------------------------------------------
--
-- `added_by_group` records the stored group that pulled a person into an
-- approved event's audience after the fact (LAN-392). Three things read it:
-- the audit, the five-an-hour cap and the retraction, and all three ask only
-- whether it is set. It still has to be able to *say* which group, though, and
-- a sub-group cannot be said in the enum — so it gains the same pair, and the
-- "was this a rule add" predicate moves to the category, which is set for
-- every rule add whatever its category.

alter table public.event_audience_members
  add column added_by_group_category public.audience_group_category,
  add column added_by_group_value text;

update public.event_audience_members
   set added_by_group_category = 'general'
 where added_by_group is not null;

update public.event_audience_members
   set added_by_group_category = 'recruits',
       added_by_group_value = 'all',
       added_by_group = null
 where added_by_group = 'recruits';

alter table public.event_audience_members
  add constraint event_audience_members_added_by_group_representation check (
    (added_by_group_category is null
       and added_by_group is null
       and added_by_group_value is null)
    or (added_by_group_category = 'general'
       and added_by_group is not null
       and added_by_group <> 'recruits'
       and added_by_group_value is null)
    or (added_by_group_category <> 'general'
       and added_by_group is null
       and added_by_group_value is not null
       and btrim(added_by_group_value) <> ''));

comment on column public.event_audience_members.added_by_group_category is
  'LAN-414. Set exactly when this row was added by the LAN-392 group rule after approval, whatever category the group belongs to — so it, and not `added_by_group`, is the "the rule put this here" predicate. Null where the approver confirmed the row or an operator added it by hand.';
comment on column public.event_audience_members.added_by_group_value is
  'LAN-414. The sub-group value that pulled this person in, for a non-General category. Null for a General group, which names itself in `added_by_group`.';

comment on column public.event_audience_members.added_by_group is
  'LAN-392, amended by LAN-414. The General group rule that added this row after approval. Null for a sub-group add, which is named by `added_by_group_category` and `added_by_group_value`, and null where the approver confirmed the row or an operator added it by hand. Read `added_by_group_category is not null` to ask whether the rule added this row at all.';

drop index if exists public.event_audience_members_added_by_group_idx;

create index event_audience_members_added_by_group_idx
  on public.event_audience_members (invitee_person_id)
  where added_by_group_category is not null;
