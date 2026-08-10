-- Domain baseline, part 6 of 12: squad structure — positions, jersey numbers,
-- onboarding checklists and competition eligibility.

-- ---------------------------------------------------------------------------
-- Position assignments
-- ---------------------------------------------------------------------------

-- Invariant S1: every player may hold an offence position AND a defence
-- position simultaneously, plus special-teams slots; at most one current
-- assignment per slot. ~83% of the club's records carry both (SDA §11.1), so
-- this is the normal case, not an edge case.
create table public.position_assignments (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,

  -- Denormalised so invariant S3 is a foreign key rather than a convention.
  season_id uuid not null,
  position_vocabulary_id uuid not null,
  position_id uuid not null,
  side public.position_side not null,

  slot public.position_slot not null,
  effective_from date not null,
  effective_to date,
  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint position_assignments_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,

  -- S3, both halves: the vocabulary must be the season's …
  constraint position_assignments_vocabulary_is_the_seasons
    foreign key (season_id, position_vocabulary_id)
    references public.seasons (id, position_vocabulary_id) on update cascade,
  -- … and the position must belong to that vocabulary.
  constraint position_assignments_position_in_vocabulary
    foreign key (position_id, position_vocabulary_id)
    references public.positions (id, vocabulary_id) on update cascade,

  constraint position_assignments_side_is_the_positions
    foreign key (position_id, side)
    references public.positions (id, side) on update cascade,

  constraint position_assignments_slot_matches_side check (
    (slot = 'offence' and side = 'offence')
    or (slot = 'defence' and side = 'defence')
    or (slot in ('kickoff', 'kick_return', 'punt', 'field_goal') and side = 'special_teams')),

  constraint position_assignments_period_ordered check (
    effective_to is null or effective_to > effective_from),

  -- S1: at most one current assignment per slot, with history preserved by
  -- effective dating rather than overwriting (invariant S4).
  constraint position_assignments_one_per_slot
    exclude using gist (
      season_membership_id with =,
      slot with =,
      daterange(effective_from, effective_to, '[)') with &&
    )
);

create index position_assignments_membership_idx
  on public.position_assignments (season_membership_id);
create index position_assignments_position_idx
  on public.position_assignments (position_id);

-- ---------------------------------------------------------------------------
-- Jersey assignments
-- ---------------------------------------------------------------------------

create table public.jersey_assignments (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,
  kit public.kit not null,
  number smallint not null,
  is_predominant boolean not null default false,

  -- Invariant S2: historical imports may violate uniqueness. They are flagged,
  -- not blocked — the club's own files contain collisions and refusing to load
  -- them would lose the record. A flagged row is excluded from the constraint.
  is_import_conflict boolean not null default false,

  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),

  constraint jersey_assignments_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint jersey_assignments_number_range check (number between 1 and 99),
  constraint jersey_assignments_period_ordered check (
    effective_to is null or effective_to > effective_from),

  -- S2: unique within (season, kit) among concurrent assignments — not
  -- globally. A person may legitimately hold more than one number.
  constraint jersey_assignments_unique_within_season_and_kit
    exclude using gist (
      season_id with =,
      kit with =,
      number with =,
      daterange(effective_from, effective_to, '[)') with &&
    ) where (not is_import_conflict)
);

-- The derived "predominant" number the club reports against.
create unique index jersey_assignments_one_predominant_per_kit
  on public.jersey_assignments (season_membership_id, kit)
  where is_predominant and effective_to is null;

create index jersey_assignments_membership_idx
  on public.jersey_assignments (season_membership_id);

comment on column public.jersey_assignments.is_import_conflict is
  'Marks a historical row that breaches (season, kit, number) uniqueness. Invariant S2: flagged, not blocked.';

-- ---------------------------------------------------------------------------
-- Onboarding
-- ---------------------------------------------------------------------------

-- Model §1.2: item TYPES are season-configurable so a new club requirement does
-- not need schema surgery. The club's real vocabulary (Yes / Yes* / No /
-- Invited / Unsure) shows these are tracked process states, not booleans.
create table public.onboarding_item_types (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  code text not null,
  label text not null,
  is_required boolean not null default true,

  -- Marks the subscription item. Constitutional membership is derived from
  -- admission plus this item being complete (invariant I5). Register D10: subs
  -- are tracked and waivable, and are never a gate on `active`.
  is_subscription boolean not null default false,

  sort_order smallint not null default 0,

  constraint onboarding_item_types_unique_per_season unique (season_id, code),
  constraint onboarding_item_types_id_season_key unique (id, season_id),
  constraint onboarding_item_types_code_not_blank check (btrim(code) <> '')
);

create unique index onboarding_item_types_one_subscription_per_season
  on public.onboarding_item_types (season_id)
  where is_subscription;

create table public.onboarding_items (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,
  item_type_id uuid not null,
  status public.onboarding_item_status not null default 'pending',
  completed_on date,
  waived_reason text,
  waived_by_person_id uuid references public.people (id) on delete restrict,
  updated_at timestamptz not null default now(),

  constraint onboarding_items_one_per_type unique (season_membership_id, item_type_id),
  constraint onboarding_items_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint onboarding_items_type_same_season
    foreign key (item_type_id, season_id)
    references public.onboarding_item_types (id, season_id) on update cascade,
  constraint onboarding_items_completion_is_dated check (
    status <> 'complete' or completed_on is not null),
  -- A waiver is a conscious operator exception (the socioeconomic subs case),
  -- so it names its author and its reason.
  constraint onboarding_items_waiver_is_justified check (
    status <> 'waived'
    or (waived_by_person_id is not null and btrim(coalesce(waived_reason, '')) <> ''))
);

create index onboarding_items_membership_idx on public.onboarding_items (season_membership_id);

-- ---------------------------------------------------------------------------
-- Competition eligibility
-- ---------------------------------------------------------------------------

-- Review F04 / invariant I4: general readiness never implies competition
-- eligibility. External rulebooks differ per competition and change on their
-- own clock, so a single boolean cannot express any of it.
create table public.eligibility_records (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,
  competition public.competition_scope not null,
  status public.eligibility_status not null default 'pending',

  determining_authority text not null,
  checked_at timestamptz,

  -- An external reference only — a BUCS Play registration id, a form number.
  -- No academic or medical evidence is ever stored (model §1.2).
  evidence_reference text,

  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),

  constraint eligibility_records_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint eligibility_records_authority_not_blank check (btrim(determining_authority) <> ''),
  constraint eligibility_records_period_ordered check (
    effective_to is null or effective_to > effective_from),
  constraint eligibility_records_decision_is_dated check (
    status = 'pending' or checked_at is not null),
  constraint eligibility_records_one_per_competition
    exclude using gist (
      season_membership_id with =,
      competition with =,
      daterange(effective_from, effective_to, '[)') with &&
    )
);

create index eligibility_records_membership_idx on public.eligibility_records (season_membership_id);

comment on column public.eligibility_records.evidence_reference is
  'External reference only (e.g. a BUCS Play registration id). Never evidence content, never medical or academic detail.';

alter table public.position_assignments enable row level security;
alter table public.jersey_assignments enable row level security;
alter table public.onboarding_item_types enable row level security;
alter table public.onboarding_items enable row level security;
alter table public.eligibility_records enable row level security;

revoke all on table public.position_assignments, public.jersey_assignments,
     public.onboarding_item_types, public.onboarding_items, public.eligibility_records
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.position_assignments, public.jersey_assignments,
     public.onboarding_item_types, public.onboarding_items, public.eligibility_records
  to service_role;
