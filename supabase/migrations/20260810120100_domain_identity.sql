-- Domain baseline, part 2 of 12: durable identity and contact methods.
--
-- Model §1.2 "People and identity". A Person is durable and is never keyed on a
-- natural attribute (invariant I1). Contact points are dated because Oxford
-- college email addresses are era-scoped, not person-scoped, and a single email
-- column would destroy alumni contactability.

-- ---------------------------------------------------------------------------
-- Person
-- ---------------------------------------------------------------------------

create table public.people (
  id uuid primary key default gen_random_uuid(),

  -- 26% of the club's existing records carry a first name and nothing else
  -- (Source Data Analysis §11.1). A required surname would reject a quarter of
  -- the real squad, so `family_name` is nullable by design, not by omission.
  given_name text not null,
  family_name text,
  known_as text,

  -- Alumni standing is derived from the person's memberships (model §3). This
  -- column is the operator override for the cases derivation gets wrong — a
  -- graduate who stays on as a coach is not "gone". Null means "derive".
  past_member_override boolean,

  -- Invariant I6: a merge is an audited operation that preserves both source
  -- identities. The losing row is never deleted; it points at the survivor so
  -- every imported row keeps its provenance.
  merged_into_person_id uuid references public.people (id) on delete restrict,
  merged_at timestamptz,
  merged_by_person_id uuid references public.people (id) on delete restrict,
  merge_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint people_given_name_not_blank check (btrim(given_name) <> ''),
  constraint people_family_name_not_blank check (family_name is null or btrim(family_name) <> ''),
  constraint people_known_as_not_blank check (known_as is null or btrim(known_as) <> ''),
  constraint people_merge_not_self check (merged_into_person_id is null or merged_into_person_id <> id),
  constraint people_merge_is_fully_audited check (
    num_nonnulls(merged_into_person_id, merged_at, merged_by_person_id) = 0
    or (
      merged_into_person_id is not null
      and merged_at is not null
      and merged_by_person_id is not null
      and btrim(coalesce(merge_reason, '')) <> ''
    )
  )
);

create index people_merged_into_idx on public.people (merged_into_person_id)
  where merged_into_person_id is not null;

comment on table public.people is
  'Durable human record. Minted with an internal identifier and never keyed on name, email or phone (invariant I1).';
comment on column public.people.family_name is
  'Nullable: 26% of the club''s existing records are first-name-only (Source Data Analysis §11.1).';

-- ---------------------------------------------------------------------------
-- Known alias forms
-- ---------------------------------------------------------------------------

-- Both club workbooks already fail on display name: the same person appears as
-- "Ben"/"Benjamin", with and without a surname, across files. Aliases are how
-- an import matches a row to a Person without promoting a name to a key.
create table public.person_aliases (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  alias text not null,
  source text,
  noted_at timestamptz not null default now(),

  constraint person_aliases_alias_not_blank check (btrim(alias) <> ''),
  constraint person_aliases_unique_per_person unique (person_id, alias)
);

-- ---------------------------------------------------------------------------
-- Contact points
-- ---------------------------------------------------------------------------

create table public.contact_points (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  kind public.contact_point_kind not null,

  -- Deliberately unvalidated. Intake accepts what the club actually receives:
  -- reversed TLDs, trailing spaces, a missing leading zero, one digit short
  -- (Source Data Analysis §11.1). Rejecting messy input at the door loses the
  -- contact entirely; normalisation is a separate, reversible step.
  raw_value text not null,
  normalised_value text,

  is_preferred boolean not null default false,
  valid_from date not null default current_date,
  valid_until date,
  source text,
  created_at timestamptz not null default now(),

  constraint contact_points_raw_value_not_blank check (btrim(raw_value) <> ''),
  constraint contact_points_period_ordered check (valid_until is null or valid_until >= valid_from),
  constraint contact_points_preferred_must_be_current check (not is_preferred or valid_until is null)
);

-- One preferred contact per person per type at a time; superseded records are
-- retained rather than overwritten (model §1.2).
create unique index contact_points_one_preferred_per_kind
  on public.contact_points (person_id, kind)
  where is_preferred;

create index contact_points_person_idx on public.contact_points (person_id, kind);

comment on column public.contact_points.raw_value is
  'Exactly as supplied. No format constraint by design — see Source Data Analysis §11.1.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010: RLS on, zero policies, and no grant to a browser-facing
-- role. Deny-by-default twice over. Only the Cloud Run server, holding the
-- secret key, reaches these tables.

alter table public.people enable row level security;
alter table public.person_aliases enable row level security;
alter table public.contact_points enable row level security;

-- Revoke first, and from every client role including service_role: Supabase's
-- default privileges leave a new table with TRUNCATE, TRIGGER and REFERENCES
-- granted, which would quietly defeat the append-only tables later in the
-- schema. Then grant back exactly what the server path needs, and nothing else.
revoke all on table public.people, public.person_aliases, public.contact_points
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.people, public.person_aliases, public.contact_points
  to service_role;
