-- LAN-182 — WP-person-schema. The person record's substrate.
--
-- One forward-only migration in three parts, because they cannot be separated:
-- the status enum is rebuilt, `people.known_as` is dropped, and both changes
-- land in `public.person_standing`, which therefore has to be recreated once
-- for two reasons rather than twice for one.
--
-- Authority: LAN-182, `missions/packets/M-PEOPLE-AND-ROSTER/packet.json`
-- (REQ-person-record, REQ-status-ladder, REQ-supersede, REQ-board-substrate,
-- REQ-restricted-fields) and `missions/intake/M-PEOPLE-AND-ROSTER/
-- field-inventory.md`, approved by Brian on 2026-08-26.
--
-- ## What is dropped and recreated, measured rather than assumed
--
-- LAN-182 lists twelve views that "touch membership status" and says to ask the
-- catalogue for the real list instead of trusting it. Asked, at `b284aca`:
--
--   select ... from pg_depend d
--    where d.refclassid = 'pg_type'::regclass
--      and d.refobjid = 'public.membership_status'::regtype;
--
-- plus the transitive closure over `pg_rewrite` for views reading
-- `season_memberships.status`, both columns of
-- `season_membership_status_events`, or `people.known_as`. Three views depend on
-- any of them — `constitutional_membership`, `person_standing` and
-- `transition_ledger` — and three check constraints on `season_memberships` do.
-- The other six views in `public` (`current_availability`, `current_rsvp`,
-- `invitation_response_state`, `nonresponse_queue`, `uninvited_audience_members`,
-- `rsvp_attendance_mismatches`) reach `season_memberships` only through its id,
-- never through its status, so they are left alone. Recreating a view nothing
-- required would risk silently reverting the definition a later migration gave
-- it — `rsvp_attendance_mismatches` alone has been redefined twice.
--
-- ## Historical rows are never rewritten
--
-- Brian, 2026-08-27: "Everything in production is going to be migrated after
-- this… I'm not worried about what's in there." The `using` clause below
-- converts every row in the same statement and there is no cleanup pass. The
-- consequence is deliberate and load-bearing: a status event that read
-- `carried_forward → confirmed` now reads `onboarding → onboarding`, because
-- both struck values map to `onboarding` and the transition it records really
-- did happen. Two check constraints are therefore re-added `not valid`; see the
-- note above each one.

begin;

-- ---------------------------------------------------------------------------
-- Part 0 — take down what depends on the vocabulary
-- ---------------------------------------------------------------------------

drop view if exists public.transition_ledger;
drop view if exists public.person_standing;
drop view if exists public.constitutional_membership;

-- These three carry `membership_status` literals bound to the type's current
-- OID. `alter column … type` re-parses them against the new type and fails on
-- the comparison, so they come off first and go back on afterwards — except
-- `withdrawal_never_activated`, whose subject no longer exists.
alter table public.season_memberships
  drop constraint season_memberships_activation_is_dated,
  drop constraint season_memberships_departure_is_dated,
  drop constraint season_memberships_withdrawal_never_activated;

alter table public.season_membership_status_events
  drop constraint season_membership_status_events_is_a_change;

-- ---------------------------------------------------------------------------
-- Part 1 — eight status values become five
-- ---------------------------------------------------------------------------
--
-- Approved 2026-08-26. `carried_forward` "doesn't mean anything to anyone" —
-- `season_memberships.entry` already carries new-versus-returning. `confirmed`
-- is the act of saying "yes, we want him", not a state anybody rests in.
-- `withdrawn` described a committed recruit who never activated; under the
-- rebuilt ladder that person is `declined` on their prospect record and never
-- holds a membership at all.
--
-- `recruit` is deliberately NOT one of the stored values. The ladder the
-- operator sees has six rungs assembled from two records: Recruit comes from
-- `recruitment_prospects`, and the five below come from the membership.
--
-- This supersedes OD-3 (2026-08-18, single-inactive offboarding) by dated owner
-- decision: `inactive` now means "may come back" and `departed` means "gone",
-- and the two are no longer interchangeable.

alter type public.membership_status rename to membership_status__superseded;

create type public.membership_status as enum (
  'onboarding',
  'active',
  'inactive',
  'departed',
  'archived'
);

comment on type public.membership_status is
  'Model §2.1 as rebuilt 2026-08-26. Five values; Recruit is not one of them and lives on recruitment_prospects.';

-- The total mapping, written once and applied to all three columns.
alter table public.season_memberships
  alter column status type public.membership_status
  using (
    case status::text
      when 'carried_forward' then 'onboarding'
      when 'confirmed' then 'onboarding'
      when 'withdrawn' then 'departed'
      else status::text
    end
  )::public.membership_status;

alter table public.season_membership_status_events
  alter column from_status type public.membership_status
  using (
    case from_status::text
      when 'carried_forward' then 'onboarding'
      when 'confirmed' then 'onboarding'
      when 'withdrawn' then 'departed'
      else from_status::text
    end
  )::public.membership_status,
  alter column to_status type public.membership_status
  using (
    case to_status::text
      when 'carried_forward' then 'onboarding'
      when 'confirmed' then 'onboarding'
      when 'withdrawn' then 'departed'
      else to_status::text
    end
  )::public.membership_status;

drop type public.membership_status__superseded;

-- Unchanged in meaning, re-added against the new type.
alter table public.season_memberships
  add constraint season_memberships_activation_is_dated check (
    status <> 'active' or activated_on is not null);

-- `not valid` on purpose, and only for the rows that already exist. A
-- membership that was `withdrawn` has no `departed_on` — withdrawal was
-- terminal without a departure — and inventing one would be exactly the cleanup
-- pass this migration is forbidden to write. Every insert and update from here
-- on is checked normally, which is what the invariant is for.
alter table public.season_memberships
  add constraint season_memberships_departure_is_dated check (
    status <> 'departed' or departed_on is not null) not valid;

-- `not valid` for the same reason and with more force: the mapping turns
-- `carried_forward → confirmed` and `confirmed → onboarding` into
-- `onboarding → onboarding`, which is a truthful record of a transition that
-- happened under the old vocabulary. Those rows stay exactly as they are. A new
-- event still has to be a real change.
alter table public.season_membership_status_events
  add constraint season_membership_status_events_is_a_change check (
    from_status is distinct from to_status) not valid;

comment on constraint season_membership_status_events_is_a_change
  on public.season_membership_status_events is
  'Not validated against pre-LAN-182 rows: the 2026-08-26 mapping collapses carried_forward and confirmed onto onboarding, so history legitimately contains onboarding → onboarding.';

-- ---------------------------------------------------------------------------
-- Part 2a — known-as collapses into alias
-- ---------------------------------------------------------------------------
--
-- One concept, not two. An alias may now be flagged as the display name, which
-- is what `known_as` was doing badly: it was a single slot, so a person could
-- hold a preferred name or an alias history but never both, and an import that
-- matched on aliases could not see the name the club actually used.

alter table public.person_aliases
  add column is_display_name boolean not null default false;

comment on column public.person_aliases.is_display_name is
  'The one alias shown instead of the given name. Replaces people.known_as (LAN-182).';

-- Carried across rather than discarded, and only where it says something: a
-- `known_as` that merely repeats the given name is not a name form.
insert into public.person_aliases (person_id, alias, source, is_display_name)
select p.id, btrim(p.known_as), 'known_as (LAN-182 migration)', true
from public.people p
where p.known_as is not null
  and btrim(p.known_as) <> ''
  and lower(btrim(p.known_as)) is distinct from lower(btrim(p.given_name))
on conflict (person_id, alias) do update set is_display_name = true;

-- After the backfill, so a person carrying both a `known_as` and an identical
-- alias row does not trip it mid-insert.
create unique index person_aliases_one_display_name_per_person
  on public.person_aliases (person_id)
  where is_display_name;

-- `people_known_as_not_blank` goes with it.
alter table public.people
  drop column known_as;

-- ---------------------------------------------------------------------------
-- Part 2b — the durable person facts that had no columns
-- ---------------------------------------------------------------------------
--
-- Field inventory rows 9–13, approved 2026-08-26. `family_name` stays nullable:
-- 26% of the club's real records are first-name-only, and the missing-data queue
-- is how they get filled, not a NOT NULL constraint that would refuse the club's
-- own data.

alter table public.people
  add column college text,
  add column matriculation_year smallint,
  add column expected_graduation_year smallint,
  add column degree_field text,
  add column date_of_birth date;

alter table public.people
  add constraint people_college_not_blank check (
    college is null or btrim(college) <> ''),
  add constraint people_degree_field_not_blank check (
    degree_field is null or btrim(degree_field) <> ''),
  -- A range, not a guess at the club's founding: it exists to catch a typed
  -- 202 or 20244, not to encode club history.
  add constraint people_matriculation_year_plausible check (
    matriculation_year is null or matriculation_year between 1900 and 2200),
  add constraint people_expected_graduation_year_plausible check (
    expected_graduation_year is null or expected_graduation_year between 1900 and 2200),
  add constraint people_graduation_after_matriculation check (
    matriculation_year is null
    or expected_graduation_year is null
    or expected_graduation_year >= matriculation_year),
  add constraint people_date_of_birth_in_the_past check (
    date_of_birth is null or date_of_birth < current_date);

comment on column public.people.expected_graduation_year is
  'A year, as W2 captures it ("2027"). Drives BUCS-eligibility timing.';
comment on column public.people.date_of_birth is
  'Four-role only. REQ-restricted-fields: never on a list, board or queue — the derived under-18 flag on person_standing is what those surfaces may read.';

-- ---------------------------------------------------------------------------
-- Part 2c — college email and personal email become distinguishable
-- ---------------------------------------------------------------------------
--
-- REQ-person-record holds college email and personal email as two separate
-- durable facts, and the field inventory records why: a college address is
-- era-scoped and expires around graduation, a personal address is the durable
-- alumni channel. `contact_point_kind` could not tell them apart.
--
-- Added as a nullable scope rather than by re-keying the existing `email` kind,
-- because nothing in the database knows which of the two an already-recorded
-- address is. Guessing from its domain would be inventing data about real
-- people. Null means "not classified yet", which is the truth, and the
-- missing-data queue is what fills it in.

create type public.contact_point_scope as enum ('college', 'personal');

alter table public.contact_points
  add column scope public.contact_point_scope;

alter table public.contact_points
  add constraint contact_points_scope_is_for_email check (
    scope is null or kind = 'email');

comment on column public.contact_points.scope is
  'Which email this is. Null on every phone, and on an email recorded before LAN-182 whose kind nobody has yet stated.';

-- REQ-supersede: one preferred value per kind, and an email''s scope is part of
-- what kind it is — a person legitimately holds a preferred college address and
-- a preferred personal one at the same time. Replaces the per-kind index.
drop index public.contact_points_one_preferred_per_kind;

-- `nulls not distinct` because an unclassified preferred email is still one
-- preferred email: two of them for the same person would be exactly the
-- duplicate the old index prevented.
create unique index contact_points_one_preferred_per_kind
  on public.contact_points (person_id, kind, scope) nulls not distinct
  where is_preferred;

-- ---------------------------------------------------------------------------
-- Part 2d — the emergency contact, locked down structurally
-- ---------------------------------------------------------------------------
--
-- REQ-restricted-fields, verbatim: "third-party personal data about somebody who
-- never agreed to be in this system". The lockdown is structural rather than by
-- convention, which is what this table is for:
--
--   * it is not a `people` row, so nothing that walks people reaches it;
--   * it is not a `contact_point`, so no audience, messaging or delivery query
--     can select it — those all read `contact_points` by design;
--   * it joins to exactly one person and to nothing else, so there is no path
--     into it from an event, a season or a report;
--   * it appears in no view, so leadership exports built from views cannot
--     carry it by accident.
--
-- `tests/schema-restricted-fields.test.ts` asserts the first three of those
-- against the source rather than trusting this comment.
--
-- Nothing here is required beyond a name. The five fields arrive over time
-- through W2, and a partially filled contact is chased by the missing-data
-- queue, not refused at the door.

create table public.person_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,

  given_name text not null,
  family_name text,
  relationship text,
  phone text,
  email text,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One per person (field inventory row 14).
  constraint person_emergency_contacts_one_per_person unique (person_id),
  constraint person_emergency_contacts_given_name_not_blank check (btrim(given_name) <> ''),
  constraint person_emergency_contacts_family_name_not_blank check (
    family_name is null or btrim(family_name) <> ''),
  constraint person_emergency_contacts_relationship_not_blank check (
    relationship is null or btrim(relationship) <> ''),
  constraint person_emergency_contacts_phone_not_blank check (
    phone is null or btrim(phone) <> ''),
  constraint person_emergency_contacts_email_not_blank check (
    email is null or btrim(email) <> '')
);

comment on table public.person_emergency_contacts is
  'Third-party personal data. Four-role only, never a contact point, never reachable by audience or messaging machinery, out of leadership exports by default (REQ-restricted-fields).';

-- ---------------------------------------------------------------------------
-- Part 3 — the season storage that is genuinely absent
-- ---------------------------------------------------------------------------
--
-- Measured against `main` rather than assumed. `position_assignments`,
-- `jersey_assignments`, `eligibility_records` and `availability_statuses`
-- already exist and are wired, not rebuilt — jersey storage in particular
-- already carries two kits, several numbers per player and non-unique numbers,
-- which is what the club's own data does.
--
-- What follows is what has nowhere to live: coach group, formalwear and Blues.
-- All three are seasonal by decision (2026-08-26): formalwear is reasked every
-- season rather than carried, and an award happens in a season. Each is one row
-- per membership per season, so the season dimension is the history and there is
-- no effective dating to keep in step.
--
-- Mission 9 owns what these mean. This is storage.

create type public.formalwear_item as enum ('tie', 'bowtie', 'socks');

comment on type public.formalwear_item is
  'The three items the club reasks each season. Measured ownership: tie 79%, bowtie 31%, socks 93%.';

create table public.coach_group_assignments (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  -- Free text. The club's groups are Mission 9's to name, and closing this
  -- vocabulary here would freeze a set nobody has written down.
  coach_group text not null,
  responsible_coach_person_id uuid references public.people (id) on delete restrict,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint coach_group_assignments_one_per_membership unique (season_membership_id),
  constraint coach_group_assignments_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint coach_group_assignments_group_not_blank check (btrim(coach_group) <> '')
);

create index coach_group_assignments_season_idx
  on public.coach_group_assignments (season_id, coach_group);

comment on table public.coach_group_assignments is
  'Which coaching group a player trains with this season. Storage only — Mission 9 owns the vocabulary and the semantics.';

create table public.formalwear_records (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,
  item public.formalwear_item not null,

  -- Text, not a boolean, and that is the whole point. The club's own answer set
  -- includes "Yes (paid)" — owned, and paid for — which a boolean destroys, and
  -- the subs invoice prices against it.
  ownership text not null,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint formalwear_records_one_per_item unique (season_membership_id, item),
  constraint formalwear_records_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint formalwear_records_ownership_not_blank check (btrim(ownership) <> '')
);

create index formalwear_records_season_idx
  on public.formalwear_records (season_id, item);

comment on column public.formalwear_records.ownership is
  'Free text by decision. "Yes (paid)" is a real answer the club records and a boolean cannot hold it.';

create table public.blues_awards (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  -- Two flags on the season record. The running total the club looks at is
  -- derived across seasons — see public.person_blues_totals — never stored.
  half_blue_awarded boolean not null default false,
  full_blue_awarded boolean not null default false,
  awarded_on date,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint blues_awards_one_per_membership unique (season_membership_id),
  constraint blues_awards_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade
);

create index blues_awards_season_idx on public.blues_awards (season_id);

comment on table public.blues_awards is
  'A Blue is awarded in a season, so it is recorded on the season (2026-08-26). Deliberately no "at least one flag" constraint: an operator clearing a cell must be able to leave the record saying nothing was awarded rather than having to delete a row.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, and the same posture as every table before these: RLS
-- on, zero policies, revoke from every client role including `service_role`
-- (Supabase leaves TRUNCATE, TRIGGER and REFERENCES granted by default), then
-- grant back exactly the server's need.

alter table public.person_emergency_contacts enable row level security;
alter table public.coach_group_assignments enable row level security;
alter table public.formalwear_records enable row level security;
alter table public.blues_awards enable row level security;

revoke all on table public.person_emergency_contacts, public.coach_group_assignments,
     public.formalwear_records, public.blues_awards
  from anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.person_emergency_contacts, public.coach_group_assignments,
     public.formalwear_records, public.blues_awards
  to service_role;

-- ---------------------------------------------------------------------------
-- The views, recreated
-- ---------------------------------------------------------------------------

-- Constitution (Fourth Edition 24.04.22) §3: a member is someone admitted AND
-- having paid the relevant subscription. Register D10 / review F02: that is a
-- DERIVED status, reported alongside operational readiness and never conflated
-- with it. Subs are not a gate on `active`; a waived subscription is shown as
-- its own fact rather than being quietly counted as payment, because the club
-- waiving a fee and a member having paid it are different statements.
--
-- `is_admitted` now lists all five statuses, and that is the honest consequence
-- of the rebuilt ladder rather than an oversight: holding a membership at all is
-- what admission means, and somebody who never got past the recruitment funnel
-- has a prospect record and no membership. The list is written out rather than
-- collapsed to `true` so a sixth value would have to be admitted deliberately.
create view public.constitutional_membership with (security_invoker = true) as
select
  m.id as season_membership_id,
  m.person_id,
  m.season_id,
  m.status as operational_status,
  m.status in ('active', 'inactive') as is_operationally_ready,
  m.status in ('onboarding', 'active', 'inactive', 'departed', 'archived') as is_admitted,
  coalesce(oi.status, 'pending') as subscription_status,
  coalesce(oi.status = 'complete', false) as subscription_paid,
  coalesce(oi.status = 'waived', false) as subscription_waived,
  m.status in ('onboarding', 'active', 'inactive', 'departed', 'archived')
    and coalesce(oi.status = 'complete', false) as is_constitutional_member
from public.season_memberships m
left join public.onboarding_item_types t
  on t.season_id = m.season_id and t.is_subscription
left join public.onboarding_items oi
  on oi.season_membership_id = m.id and oi.item_type_id = t.id;

-- ---------------------------------------------------------------------------
-- Alumni standing, derived (model §3)
-- ---------------------------------------------------------------------------
--
-- Recreated for two reasons at once: the enum underneath it changed, and
-- `known_as` no longer exists. `display_alias` replaces it and reads from the
-- alias flagged as the display name.
--
-- `is_under_18` is the derivation the field inventory places here. It carries
-- the flag and never the date: REQ-restricted-fields keeps date of birth off
-- every list, board and queue, and a boolean is what those surfaces are allowed
-- to see. Mission 8 owns what the club then does about it.
create view public.person_standing with (security_invoker = true) as
select
  p.id as person_id,
  p.given_name,
  p.family_name,
  (
    select a.alias
    from public.person_aliases a
    where a.person_id = p.id and a.is_display_name
    limit 1
  ) as display_alias,
  count(m.id) filter (where m.status in ('active', 'inactive', 'onboarding'))
    as live_membership_count,
  count(m.id) as total_membership_count,
  max(s.label) filter (where m.id is not null) as most_recent_season_label,
  coalesce(
    p.past_member_override,
    count(m.id) > 0
      and count(m.id) filter (
        where m.status in ('active', 'inactive', 'onboarding')
      ) = 0
  ) as is_past_member,
  p.past_member_override is not null as standing_is_overridden,
  case
    when p.date_of_birth is null then null
    else p.date_of_birth > (current_date - interval '18 years')::date
  end as is_under_18,
  p.merged_into_person_id
from public.people p
left join public.season_memberships m on m.person_id = p.id
left join public.seasons s on s.id = m.season_id
group by p.id;

comment on view public.person_standing is
  'Alumnus status is derived from a person''s memberships and operator-overridable (model §3): a graduate who stays on as a coach is not "gone".';
comment on column public.person_standing.is_under_18 is
  'Derived from date of birth, which itself never leaves the person record. Null when no date of birth is held.';

-- ---------------------------------------------------------------------------
-- Blues, totalled across seasons (field inventory, derived)
-- ---------------------------------------------------------------------------
--
-- "The count the club actually looks at, derived rather than stored." A person
-- with no award has no row here and no `blues_awards` row either; a caller
-- coalesces to zero.
create view public.person_blues_totals with (security_invoker = true) as
select
  m.person_id,
  count(*) filter (where b.half_blue_awarded) as half_blue_count,
  count(*) filter (where b.full_blue_awarded) as full_blue_count
from public.blues_awards b
join public.season_memberships m on m.id = b.season_membership_id
group by m.person_id;

-- ---------------------------------------------------------------------------
-- Invariant M2 — one transition stream over several typed homes
-- ---------------------------------------------------------------------------

-- Where the model gives a transition a typed table, that table is the audit
-- record and no duplicate audit_events row is written. This view is how the
-- ledger is read as a single stream without that duplication.
--
-- Unchanged except that it is recreated: it casts both status columns to text,
-- so it depended on the type only through them.
create view public.transition_ledger with (security_invoker = true) as
select
  a.occurred_at,
  a.actor_person_id,
  a.actor_label,
  'audit_events'::text as recorded_in,
  a.entity_table,
  a.entity_id,
  a.action,
  a.from_state,
  a.to_state,
  a.reason
from public.audit_events a
union all
select
  h.occurred_at,
  h.actor_person_id,
  h.actor_label,
  'season_membership_status_events'::text,
  'season_memberships'::text,
  h.season_membership_id,
  'membership_status_changed'::text,
  h.from_status::text,
  h.to_status::text,
  h.reason
from public.season_membership_status_events h
union all
select
  c.changed_at,
  c.recorded_by_person_id,
  null::text,
  'schedule_changes'::text,
  'events'::text,
  c.event_id,
  'schedule_changed'::text,
  null::text,
  c.source::text,
  c.reason
from public.schedule_changes c
union all
select
  av.recorded_at,
  av.reported_by_person_id,
  null::text,
  'availability_statuses'::text,
  'season_memberships'::text,
  av.season_membership_id,
  'availability_recorded'::text,
  null::text,
  av.level::text,
  null::text
from public.availability_statuses av
union all
select
  r.recorded_at,
  r.recorded_by_person_id,
  r.source::text,
  'rsvp_responses'::text,
  'invitations'::text,
  r.invitation_id,
  'rsvp_recorded'::text,
  null::text,
  r.response::text,
  r.reason
from public.rsvp_responses r
union all
select
  d.occurred_at,
  d.actor_person_id,
  d.channel::text,
  'delivery_results'::text,
  'notification_jobs'::text,
  d.notification_job_id,
  'delivery_attempted'::text,
  null::text,
  d.outcome::text,
  d.detail
from public.delivery_results d;

-- Same posture as the tables: nothing reaches a browser-facing role.
revoke all on
  public.constitutional_membership,
  public.person_standing,
  public.person_blues_totals,
  public.transition_ledger
  from anon, authenticated, service_role;

grant select on
  public.constitutional_membership,
  public.person_standing,
  public.person_blues_totals,
  public.transition_ledger
  to service_role;

commit;
