-- Domain baseline, part 5 of 12: seasonal membership, its lifecycle history,
-- and recruitment intake.
--
-- Model §1.2: Season Membership is the load-bearing entity — one Person's
-- participation in one Season. Requirement 3 verbatim: "a person is durable;
-- membership is per-season with its own states. Rollover works without data
-- surgery."

create table public.season_memberships (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,

  -- Model §2.1. This is operational participation and readiness. Constitutional
  -- membership (admitted AND paid, Fourth Edition §3) is derived separately —
  -- see the view public.constitutional_membership (invariant I5).
  status public.membership_status not null,
  entry public.membership_entry not null,

  -- Rollover seeds next season's carried-forward set from this season's
  -- classification. It links memberships, never duplicating the Person
  -- (model §3). The composite foreign key proves both rows are the same human.
  carried_forward_from_id uuid,

  confirmed_on date,
  activated_on date,
  departed_on date,
  expected_return_on date,
  departure_reason text,

  -- Register D1: `active` ⇄ `inactive` flips freely within one membership. This
  -- optional, non-medical label is where a reason for a flip lives if the club
  -- ever wants one; why someone cannot play is availability's job, not this.
  inactivity_label text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Invariant I2: at most one membership per person per season. Register D1
  -- settled the November-quit / February-return case as one membership whose
  -- status history carries the gap.
  constraint season_memberships_one_per_person_per_season unique (person_id, season_id),

  -- Composite-foreign-key targets used throughout the rest of the schema to
  -- prove a child record belongs to the same season, or the same person.
  constraint season_memberships_id_season_key unique (id, season_id),
  constraint season_memberships_id_person_key unique (id, person_id),

  constraint season_memberships_carried_forward_same_person
    foreign key (carried_forward_from_id, person_id)
    references public.season_memberships (id, person_id) on update cascade,
  constraint season_memberships_carried_forward_not_self check (
    carried_forward_from_id is null or carried_forward_from_id <> id),

  constraint season_memberships_activation_is_dated check (
    status <> 'active' or activated_on is not null),
  constraint season_memberships_departure_is_dated check (
    status <> 'departed' or departed_on is not null),
  -- Review F06: `withdrawn` is a truthful terminal exit for a committed recruit
  -- who never activated. It must never look like a departed player.
  constraint season_memberships_withdrawal_never_activated check (
    status <> 'withdrawn' or activated_on is null)
);

create index season_memberships_season_status_idx
  on public.season_memberships (season_id, status);
create index season_memberships_person_idx
  on public.season_memberships (person_id);
create index season_memberships_carried_forward_idx
  on public.season_memberships (carried_forward_from_id)
  where carried_forward_from_id is not null;

comment on table public.season_memberships is
  'One Person''s participation in one Season. Status is operational readiness, not constitutional membership (invariant I5).';

-- ---------------------------------------------------------------------------
-- Lifecycle history
-- ---------------------------------------------------------------------------

-- Register D1 makes this load-bearing: per-stint reporting ("he was out from
-- November to February") is derived from status history, so the history needs a
-- typed, queryable home rather than a polymorphic audit row.
--
-- There is no duplicated current-state cache here. `season_memberships.status`
-- is the single authoritative current fact; this table is the immutable record
-- of the transitions that produced it, written in the same transaction. It is
-- append-only at the privilege level (see the grants at the foot of this file),
-- so a status change can never rewrite the history that led to it.
create table public.season_membership_status_events (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null references public.season_memberships (id) on delete restrict,
  from_status public.membership_status,
  to_status public.membership_status not null,
  occurred_at timestamptz not null default now(),
  actor_person_id uuid references public.people (id) on delete restrict,
  actor_label text,
  reason text,

  constraint season_membership_status_events_is_a_change check (
    from_status is distinct from to_status),
  -- Invariant M2: every transition names who caused it, whether a person or a
  -- named process ("season-open process", "system").
  constraint season_membership_status_events_has_an_actor check (
    actor_person_id is not null or btrim(coalesce(actor_label, '')) <> '')
);

create index season_membership_status_events_membership_idx
  on public.season_membership_status_events (season_membership_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- Recruitment
-- ---------------------------------------------------------------------------

-- Model §1.2 / §2.2: modelling recruits as provisional memberships would
-- pollute the roster with people who never commit. A separate funnel record
-- keeps the roster meaning "people on the team".
create table public.recruitment_prospects (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  status public.prospect_status not null default 'identified',
  source text,
  first_contact_on date,
  committed_on date,

  -- Conversion is the only way a prospect becomes a member. Both composite
  -- foreign keys fire together: the membership must be the same person AND the
  -- same season as the prospect record.
  converted_membership_id uuid,

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint recruitment_prospects_one_per_person_per_season unique (person_id, season_id),
  constraint recruitment_prospects_conversion_same_person
    foreign key (converted_membership_id, person_id)
    references public.season_memberships (id, person_id) on update cascade,
  constraint recruitment_prospects_conversion_same_season
    foreign key (converted_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint recruitment_prospects_conversion_matches_status check (
    (status = 'converted') = (converted_membership_id is not null)),
  constraint recruitment_prospects_commitment_is_dated check (
    status not in ('committed', 'converted') or committed_on is not null)
);

create index recruitment_prospects_season_status_idx
  on public.recruitment_prospects (season_id, status);

comment on column public.recruitment_prospects.notes is
  'Operator judgement recorded as prose. The behavioural commitment signals described on 8/5 are deliberately not scored fields.';

alter table public.season_memberships enable row level security;
alter table public.season_membership_status_events enable row level security;
alter table public.recruitment_prospects enable row level security;

revoke all on table public.season_memberships, public.season_membership_status_events,
     public.recruitment_prospects
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.season_memberships, public.recruitment_prospects
  to service_role;

-- Append-only, enforced by privilege rather than by convention or a trigger:
-- the only client role that can reach this table cannot update or delete a row.
grant select, insert on table public.season_membership_status_events to service_role;
