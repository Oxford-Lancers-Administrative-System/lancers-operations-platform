-- Domain baseline, part 3 of 12: the four clocks, and the position vocabulary.
--
-- Model §1.1, the single most consequential structural fact: the club runs on
-- overlapping annual cycles with NO shared boundary. Each is its own record and
-- none is derived from another. There is deliberately no foreign key from a
-- term to a season — a term is a scheduling coordinate, and coupling them would
-- silently assert a boundary the club does not have.

-- ---------------------------------------------------------------------------
-- Term
-- ---------------------------------------------------------------------------

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  name public.term_name not null,
  academic_year text not null,
  starts_on date not null,
  ends_on date not null,

  -- Michaelmas runs from week −1; Hilary and Trinity from 0th. Weeks run
  -- Sunday–Saturday (Source Data Analysis §5.4).
  first_week smallint not null,
  last_week smallint not null default 8,
  created_at timestamptz not null default now(),

  constraint terms_unique_instance unique (name, academic_year),
  constraint terms_academic_year_not_blank check (btrim(academic_year) <> ''),
  constraint terms_dates_ordered check (ends_on > starts_on),
  constraint terms_first_week_valid check (first_week in (-1, 0)),
  constraint terms_last_week_valid check (last_week between 1 and 8)
);

comment on table public.terms is
  'Oxford term instances with real dates. Intentionally not linked to a season: model §1.1 keeps the cycles independent.';

-- ---------------------------------------------------------------------------
-- Committee year
-- ---------------------------------------------------------------------------

create table public.committee_years (
  id uuid primary key default gen_random_uuid(),
  label text not null,

  -- The constitution says Hilary Full Term; documented practice drifted from
  -- early March (2016–20) to June (2025). The actual date is stored so nothing
  -- downstream hard-codes a boundary (model §1.1, LAN-43).
  agm_held_on date,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),

  constraint committee_years_label_key unique (label),
  constraint committee_years_dates_ordered check (ends_on is null or ends_on > starts_on),
  constraint committee_years_do_not_overlap
    exclude using gist (daterange(starts_on, ends_on, '[)') with &&)
);

-- ---------------------------------------------------------------------------
-- Position vocabulary (versioned reference data)
-- ---------------------------------------------------------------------------

-- The club used two incompatible position taxonomies three years apart (Source
-- Data Analysis §9.1.4), so the vocabulary is versioned data rather than an
-- enum. Invariant S3 — position values come from the season's vocabulary
-- version — is enforced by composite foreign key, not by convention.

create table public.position_vocabularies (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  label text not null,
  adopted_on date not null,
  created_at timestamptz not null default now(),

  constraint position_vocabularies_code_key unique (code),
  constraint position_vocabularies_code_not_blank check (btrim(code) <> '')
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  vocabulary_id uuid not null references public.position_vocabularies (id) on delete restrict,
  code text not null,
  label text not null,
  side public.position_side not null,
  sort_order smallint not null default 0,

  constraint positions_unique_in_vocabulary unique (vocabulary_id, code),
  -- Composite-foreign-key targets. These let position_assignments prove, in the
  -- database, that a position belongs to the season's vocabulary and sits in a
  -- compatible slot.
  constraint positions_id_vocabulary_key unique (id, vocabulary_id),
  constraint positions_id_side_key unique (id, side),
  constraint positions_code_not_blank check (btrim(code) <> '')
);

-- ---------------------------------------------------------------------------
-- Season
-- ---------------------------------------------------------------------------

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  status public.season_status not null default 'planning',

  -- Which position taxonomy this season's assignments must draw from (S3).
  position_vocabulary_id uuid not null references public.position_vocabularies (id) on delete restrict,

  starts_on date,
  ends_on date,

  -- Model §1.1: season boundaries are operator actions, not derived dates.
  -- Opened and closed only by the President or Secretary; who and when is data.
  opened_at timestamptz,
  opened_by_person_id uuid references public.people (id) on delete restrict,
  closed_at timestamptz,
  closed_by_person_id uuid references public.people (id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint seasons_label_key unique (label),
  constraint seasons_id_vocabulary_key unique (id, position_vocabulary_id),
  constraint seasons_dates_ordered check (
    starts_on is null or ends_on is null or ends_on > starts_on),
  constraint seasons_opening_is_recorded check (
    status = 'planning' or (opened_at is not null and opened_by_person_id is not null)),
  constraint seasons_closing_is_recorded check (
    status <> 'archived' or (closed_at is not null and closed_by_person_id is not null))
);

comment on column public.seasons.position_vocabulary_id is
  'The taxonomy version this season''s position assignments must use (invariant S3).';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.terms enable row level security;
alter table public.committee_years enable row level security;
alter table public.position_vocabularies enable row level security;
alter table public.positions enable row level security;
alter table public.seasons enable row level security;

revoke all on table public.terms, public.committee_years, public.position_vocabularies,
     public.positions, public.seasons
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.terms, public.committee_years, public.position_vocabularies,
     public.positions, public.seasons
  to service_role;
