-- Domain baseline, part 4 of 12: roles and effective-dated role assignments.
--
-- Model §1.2: role is a relationship, not a person type. Coaches are invitees;
-- the President is also a player. Review F07: an assignment is scoped to
-- exactly one cycle — a committee year or a season, never both, never neither.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,

  -- Register D8: committee seats hang off the committee year; coaching staff
  -- hang off the season, because coaches are appointed around seasons and do
  -- not turn over at the AGM.
  scope public.role_scope not null,

  -- The four constitutional Offices (President, VP, Secretary, Treasurer).
  -- Constitution ¶19 constrains only these; every other seat may have multiple
  -- concurrent holders and one person may hold several.
  is_constitutional_office boolean not null default false,
  constitution_edition text,
  constitution_reference text,
  created_at timestamptz not null default now(),

  constraint roles_code_key unique (code),
  constraint roles_code_not_blank check (btrim(code) <> ''),
  -- Composite-foreign-key target: an assignment carries the two facts its own
  -- constraints need, and cannot disagree with the role about either.
  constraint roles_id_scope_office_key unique (id, scope, is_constitutional_office),
  constraint roles_offices_are_committee_seats check (
    not is_constitutional_office or scope = 'committee_year')
);

-- The Gameday seat alone has at least five names across a decade (LAN-42).
-- Aliases keep a historical document resolvable to the enduring seat.
create table public.role_aliases (
  id uuid primary key default gen_random_uuid(),
  role_id uuid not null references public.roles (id) on delete cascade,
  alias text not null,
  source text,

  constraint role_aliases_unique_per_role unique (role_id, alias),
  constraint role_aliases_alias_not_blank check (btrim(alias) <> '')
);

create table public.role_assignments (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  role_id uuid not null references public.roles (id) on delete restrict,

  -- Denormalised from `roles` so the scope and office rules below are
  -- expressible as declarative constraints. The composite foreign key makes
  -- disagreement with the role impossible.
  scope public.role_scope not null,
  is_constitutional_office boolean not null,

  committee_year_id uuid references public.committee_years (id) on delete restrict,
  season_id uuid references public.seasons (id) on delete restrict,

  -- Register D11: a mid-year role change end-dates the old assignment and
  -- creates a new one. History is the point of the entity (invariant S4).
  effective_from date not null,
  effective_to date,

  appointed_by_person_id uuid references public.people (id) on delete restrict,
  note text,
  created_at timestamptz not null default now(),

  constraint role_assignments_agree_with_role
    foreign key (role_id, scope, is_constitutional_office)
    references public.roles (id, scope, is_constitutional_office) on update cascade,

  -- Review F07, both halves: exactly one scope …
  constraint role_assignments_exactly_one_scope check (
    (committee_year_id is not null) <> (season_id is not null)),
  -- … and it must be the one the role declares.
  constraint role_assignments_scope_matches_cycle check (
    (scope = 'committee_year' and committee_year_id is not null)
    or (scope = 'season' and season_id is not null)),

  constraint role_assignments_period_ordered check (
    effective_to is null or effective_to > effective_from),

  -- Invariant I3, first half: a constitutional Office has exactly one holder at
  -- a time. Non-Office seats are unconstrained — Social Sec ×2 and Gameday ×2
  -- are both in the 2025 AGM record.
  constraint role_assignments_one_holder_per_office
    exclude using gist (
      role_id with =,
      daterange(effective_from, effective_to, '[)') with &&
    ) where (is_constitutional_office),

  -- Invariant I3, second half: no person holds two Offices at once
  -- (Constitution ¶19). Holding an Office plus non-Office seats is legal and
  -- real, and is deliberately not constrained here.
  constraint role_assignments_one_office_per_person
    exclude using gist (
      person_id with =,
      daterange(effective_from, effective_to, '[)') with &&
    ) where (is_constitutional_office)
);

create index role_assignments_person_idx on public.role_assignments (person_id, effective_from desc);
create index role_assignments_role_idx on public.role_assignments (role_id, effective_from desc);
create index role_assignments_committee_year_idx on public.role_assignments (committee_year_id)
  where committee_year_id is not null;
create index role_assignments_season_idx on public.role_assignments (season_id)
  where season_id is not null;

comment on table public.role_assignments is
  'Effective-dated binding of a Person to a Role within exactly one cycle. Season close reduces access by end-dating these (model §3).';

alter table public.roles enable row level security;
alter table public.role_aliases enable row level security;
alter table public.role_assignments enable row level security;

revoke all on table public.roles, public.role_aliases, public.role_assignments
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.roles, public.role_aliases, public.role_assignments
  to service_role;
