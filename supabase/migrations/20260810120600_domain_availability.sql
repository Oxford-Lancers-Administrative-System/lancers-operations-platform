-- Domain baseline, part 7 of 12: restricted seasonal availability.
--
-- Locked Requirement 8 and model §2.6. This is an operational status, NOT a
-- medical record. Compliance is structural, not policy: there is no column here
-- capable of holding a diagnosis, a treatment, or a personal narrative
-- (invariant A2), and there is no free-text field at all.
--
-- Review F10 and the ticket both require the pending Oxford / Sports Federation
-- privacy answer to be able to NARROW this without relationship surgery. It
-- currently permits nothing beyond a level and its dates, which is the
-- narrowest possible shape. If that answer later approves a bounded note, it
-- lands as one additional nullable column on this table (or, if the retention
-- rule differs, a single side table keyed by this table's id) and can be
-- dropped again by dropping exactly that one object. No foreign key, no
-- relationship, and no other table depends on its existence.

create table public.availability_statuses (
  id uuid primary key default gen_random_uuid(),

  -- Register D4: availability attaches to the MEMBERSHIP, not the Person. A
  -- three-season-old Red must not leak into a new season, and the record
  -- archives cleanly with its season. The general placement rule the club
  -- adopted: Person holds what changes about once a season; Membership holds
  -- what moves constantly.
  season_membership_id uuid not null references public.season_memberships (id) on delete restrict,

  level public.availability_level not null,
  effective_from date not null,
  review_on date,

  -- Any coach or executive may report a move to orange or red (8/5).
  reported_by_person_id uuid not null references public.people (id) on delete restrict,

  -- Invariant A3 / Requirement 8 verbatim: "return to full availability
  -- requires confirmation". The confirmer is recorded, not assumed.
  confirmed_by_person_id uuid references public.people (id) on delete restrict,

  recorded_at timestamptz not null default now(),

  constraint availability_statuses_green_records_its_confirmer check (
    level <> 'green' or confirmed_by_person_id is not null),
  constraint availability_statuses_review_not_before_effective check (
    review_on is null or review_on >= effective_from)
);

-- Invariant A1: availability history is append-only. There is no current-state
-- cache to drift — the current status is derived by
-- public.current_availability, which takes the latest row per membership.
create index availability_statuses_current_idx
  on public.availability_statuses (season_membership_id, effective_from desc, recorded_at desc);

comment on table public.availability_statuses is
  'Append-only Green/Orange/Red history on a season membership. No diagnosis, treatment or narrative field exists (invariant A2). Access is restricted to the privileged server path only.';

alter table public.availability_statuses enable row level security;

revoke all on table public.availability_statuses from anon, authenticated, service_role;

-- Append-only at the privilege level (invariant A1): the only client role that
-- reaches this table cannot update or delete a row. A correction is a new row,
-- which is also what makes the redaction path (review F13) a bounded delete
-- performed by a database owner rather than an ordinary application write.
grant select, insert on table public.availability_statuses to service_role;
