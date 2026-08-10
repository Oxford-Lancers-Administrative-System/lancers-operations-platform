-- Domain baseline, part 8 of 12: series, alternative groups, events, schedule
-- change history and per-event questions.
--
-- Register D6, decided: there is NO separate proposal object anywhere. An
-- unconfirmed BUCS fixture is a draft event whose date is the club's request.
-- BUCS's answer either confirms it (approve), moves it (approve + a schedule
-- change record) or kills it (reject the draft).

-- ---------------------------------------------------------------------------
-- Series
-- ---------------------------------------------------------------------------

-- Model §1.2: a recurrence rule alone cannot express this schedule, because a
-- Sunday fixture REPLACES the Sunday practice rather than sitting beside it
-- (SDA §5.5). Instances are therefore materialised as events and individually
-- overridable or cancellable; this record is only the template they came from.
create table public.event_series (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  name text not null,
  event_type public.event_type not null,
  default_venue text,
  default_starts_at time,
  default_ends_at time,
  weekday smallint,
  recurrence_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint event_series_unique_per_season unique (season_id, name),
  constraint event_series_id_season_key unique (id, season_id),
  constraint event_series_weekday_valid check (weekday is null or weekday between 0 and 6),
  constraint event_series_times_ordered check (
    default_ends_at is null or default_starts_at is null or default_ends_at > default_starts_at)
);

-- ---------------------------------------------------------------------------
-- Alternative groups
-- ---------------------------------------------------------------------------

-- "Potential Crewdate A" and "Potential Crewdate B" are two candidate slots for
-- one social; a "fixture or practice" cell is two candidate events. At most one
-- member of a group may ever reach approval (invariant E3).
create table public.alternative_groups (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  label text not null,
  note text,
  created_at timestamptz not null default now(),

  constraint alternative_groups_unique_per_season unique (season_id, label),
  constraint alternative_groups_id_season_key unique (id, season_id)
);

-- ---------------------------------------------------------------------------
-- Event
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  series_id uuid,
  alternative_group_id uuid,

  -- Term and week are scheduling coordinates. Both are nullable: an event may
  -- legitimately fall outside term (a summer camp, a pre-season meeting).
  term_id uuid references public.terms (id) on delete restrict,
  week_number smallint,

  name text not null,
  event_type public.event_type not null,
  origin public.event_origin not null default 'club_controlled',
  status public.event_status not null default 'draft',

  -- Every field except the date may be null on a live event: eight of eleven
  -- scheduled fixtures currently have a confirmed date and nothing else
  -- (SDA §5.6). The date itself is required only from approval onward.
  scheduled_on date,
  starts_at time,
  ends_at time,
  venue text,
  opponent text,
  side public.fixture_side,
  competition text,

  is_mandatory boolean not null default false,

  -- Model v1.2 / invariant E6. Distinct from `is_mandatory`, which describes
  -- whether attendance is expected — this decides whether an answer is asked
  -- for at all. An informational or calendar-only event resolves an audience
  -- for visibility and creates no response obligation.
  solicits_response boolean not null default true,

  -- Requirement 6: configurable. Hours before the deadline at which reminders
  -- are due; a typed array rather than JSONB because it is load-bearing.
  response_deadline_at timestamptz,
  reminder_offsets_hours integer[] not null default '{}',

  -- Register D3: recruitment events exist to court people who may have heard
  -- about it from a friend an hour ago. Unregistered turnout is countable
  -- without fabricating person records.
  aggregate_headcount integer,

  owner_person_id uuid references public.people (id) on delete restrict,

  -- Review F11 / invariant E1: approval requires an EXPLICITLY confirmed
  -- audience. A missing audience is an approval error, never a mass send.
  audience_confirmed_at timestamptz,
  audience_confirmed_by_person_id uuid references public.people (id) on delete restrict,

  -- Requirement 4, confirmed as written by Stewart Humble on 2026-08-10:
  -- explicit human approval. An unapproved draft does not go out.
  approved_at timestamptz,
  approved_by_person_id uuid references public.people (id) on delete restrict,

  -- Invariant E5: `occurred` and `not_held` are assertions somebody makes. The
  -- passage of a date never implies either, so both name their author.
  outcome_recorded_at timestamptz,
  outcome_recorded_by_person_id uuid references public.people (id) on delete restrict,

  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint events_id_season_key unique (id, season_id),
  -- Composite-foreign-key targets. These are what let invitations prove they
  -- hang off an approved event (P1) and attendance prove its event occurred
  -- (P5) declaratively, with no trigger and no application trust.
  constraint events_id_status_key unique (id, status),
  constraint events_id_status_solicitation_key unique (id, status, solicits_response),

  constraint events_series_same_season
    foreign key (series_id, season_id)
    references public.event_series (id, season_id) on update cascade,
  constraint events_alternative_group_same_season
    foreign key (alternative_group_id, season_id)
    references public.alternative_groups (id, season_id) on update cascade,

  constraint events_week_number_valid check (week_number is null or week_number between -1 and 8),
  constraint events_times_ordered check (
    ends_at is null or starts_at is null or ends_at > starts_at),

  -- Invariant E1. From approval onward an event must carry a date, a type
  -- (guaranteed by the enum column being NOT NULL), a recorded approver and an
  -- explicitly confirmed audience. Everything else may still be null — the
  -- confirmed-date-only fixture is first-class.
  constraint events_approval_requires_date_and_audience check (
    status in ('draft', 'pending_approval', 'rejected', 'withdrawn')
    or (
      scheduled_on is not null
      and approved_at is not null
      and approved_by_person_id is not null
      and audience_confirmed_at is not null
      and audience_confirmed_by_person_id is not null
    )),

  -- Invariant E5.
  constraint events_outcome_is_asserted check (
    status not in ('occurred', 'not_held')
    or (outcome_recorded_at is not null and outcome_recorded_by_person_id is not null)),

  -- Invariant E6: no solicitation means no deadline and no reminders, so such
  -- an event can never enter the nonresponse escalation stream.
  constraint events_no_obligation_without_solicitation check (
    solicits_response
    or (response_deadline_at is null and cardinality(reminder_offsets_hours) = 0)),

  constraint events_headcount_is_recruitment_only check (
    aggregate_headcount is null or event_type = 'recruitment'),
  constraint events_headcount_non_negative check (
    aggregate_headcount is null or aggregate_headcount >= 0),
  constraint events_fixture_side_needs_a_fixture check (
    side is null or event_type in ('fixture', 'varsity')),
  constraint events_negative_decisions_are_explained check (
    status not in ('rejected', 'cancelled', 'withdrawn')
    or btrim(coalesce(decision_reason, '')) <> ''),
  constraint events_name_not_blank check (btrim(name) <> '')
);

-- Invariant E3: at most one event in an alternative group may ever REACH
-- approval. Keying on approved_at rather than on the current status is what
-- makes it hold after the winner has occurred, or been cancelled.
create unique index events_one_approved_per_alternative_group
  on public.events (alternative_group_id)
  where alternative_group_id is not null and approved_at is not null;

-- Invariant E4: two or more events on one date is legal everywhere. There is
-- deliberately no uniqueness on (season_id, scheduled_on). This index is for
-- the calendar read path, and is explicitly non-unique.
create index events_season_date_idx on public.events (season_id, scheduled_on);
create index events_status_idx on public.events (status);
create index events_term_week_idx on public.events (term_id, week_number);
create index events_series_idx on public.events (series_id) where series_id is not null;

comment on column public.events.solicits_response is
  'Invariant E6. False means the event resolves an audience for visibility only: no deadline, no reminders, and its invitations never reach `expired`.';
comment on column public.events.scheduled_on is
  'Nullable on a draft. Required from approval onward (invariant E1). A confirmed date with a null opponent, venue and time is the normal fixture case.';

-- ---------------------------------------------------------------------------
-- Schedule change history
-- ---------------------------------------------------------------------------

-- Invariant E2. "We asked for the 8th and got the 15th" is the normal case with
-- BUCS. Generic audit events record THAT something changed; this makes the
-- schedule's own history a queryable first-class thing that players and reports
-- consume. Append-only.
create table public.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  source public.schedule_change_source not null,
  reason text,

  previous_scheduled_on date,
  new_scheduled_on date,
  previous_starts_at time,
  new_starts_at time,
  previous_venue text,
  new_venue text,
  previous_opponent text,
  new_opponent text,

  changed_at timestamptz not null default now(),
  recorded_by_person_id uuid references public.people (id) on delete restrict,
  approved_by_person_id uuid references public.people (id) on delete restrict,

  constraint schedule_changes_something_actually_changed check (
    previous_scheduled_on is distinct from new_scheduled_on
    or previous_starts_at is distinct from new_starts_at
    or previous_venue is distinct from new_venue
    or previous_opponent is distinct from new_opponent)
);

create index schedule_changes_event_idx on public.schedule_changes (event_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Per-event questions
-- ---------------------------------------------------------------------------

-- Register D7, confirmed and upgraded: operators may define custom questions
-- per event. The dominant real case is transport there/back for away fixtures,
-- historically re-invented with different column names for every single game.
create table public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  prompt text not null,
  answer_type public.question_answer_type not null default 'text',
  choices text[],

  -- Capacity decides which questions apply. Coaches answering only transport
  -- questions while play and availability stay null is the historical norm
  -- (SDA §2.1) — null means "not applicable to this invitee", never "no answer".
  applies_to_capacities public.invitation_capacity[] not null
    default '{player,coach,committee,guest,recruit}'::public.invitation_capacity[],

  is_required boolean not null default false,
  sort_order smallint not null default 0,

  constraint event_questions_unique_per_event unique (event_id, prompt),
  constraint event_questions_id_event_key unique (id, event_id),
  constraint event_questions_prompt_not_blank check (btrim(prompt) <> ''),
  constraint event_questions_choices_match_type check (
    (answer_type = 'choice' and choices is not null and cardinality(choices) > 1)
    or (answer_type <> 'choice' and choices is null)),
  constraint event_questions_applies_to_someone check (
    cardinality(applies_to_capacities) > 0)
);

alter table public.event_series enable row level security;
alter table public.alternative_groups enable row level security;
alter table public.events enable row level security;
alter table public.schedule_changes enable row level security;
alter table public.event_questions enable row level security;

revoke all on table public.event_series, public.alternative_groups, public.events,
     public.schedule_changes, public.event_questions
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.event_series, public.alternative_groups, public.events, public.event_questions
  to service_role;

-- Append-only: schedule history is evidence, and Requirement 4 requires it to
-- survive (invariant E2).
grant select, insert on table public.schedule_changes to service_role;
