-- Domain baseline, part 12a of 12: the legacy import staging area.
--
-- Architecture cheat sheet §1: "Import legacy spreadsheets into staging,
-- validate them, then promote clean records."
--
-- This schema exists so that the historical vocabulary the club's files
-- actually contain — `Unsure`, `Yes?`, `No?`, a reversed TLD, a phone number
-- one digit short — has somewhere to live while it is being normalised or
-- rejected, WITHOUT any of it becoming an authoritative value. The normalised
-- output column is typed `public.rsvp_value`, so `Unsure` is structurally
-- incapable of surviving normalisation as an RSVP answer.
--
-- `staging` is NOT in `[api] schemas` in supabase/config.toml, so PostgREST
-- does not serve it at all. RLS is enabled anyway: an unexposed schema is a
-- configuration fact, and configuration facts get reversed by accident.
--
-- No real roster or personal data is loaded here, by this ticket or any other,
-- until the pre-pilot gate in docs/migration-runbook.md has been passed.

create schema if not exists staging;

create table staging.legacy_roster_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch text not null,
  source_file text,
  source_row_number integer,

  -- Every column is text. The point of staging is to accept the file as it is.
  raw_name text,
  raw_email text,
  raw_phone text,
  raw_offence_position text,
  raw_defence_position text,
  raw_jersey_blue text,
  raw_jersey_white text,
  raw_status text,
  raw_extra jsonb not null default '{}'::jsonb,

  normalisation_status text not null default 'pending',
  rejection_reason text,
  matched_person_id uuid references public.people (id) on delete set null,
  imported_at timestamptz not null default now(),

  constraint legacy_roster_rows_batch_not_blank check (btrim(import_batch) <> ''),
  constraint legacy_roster_rows_normalisation_status_valid check (
    normalisation_status in ('pending', 'normalised', 'rejected', 'needs_review')),
  constraint legacy_roster_rows_rejection_is_explained check (
    normalisation_status <> 'rejected' or btrim(coalesce(rejection_reason, '')) <> ''),
  constraint legacy_roster_rows_match_only_when_normalised check (
    matched_person_id is null or normalisation_status = 'normalised'),
  constraint legacy_roster_rows_extra_is_object check (jsonb_typeof(raw_extra) = 'object')
);

create index legacy_roster_rows_batch_idx on staging.legacy_roster_rows (import_batch, normalisation_status);

create table staging.legacy_rsvp_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch text not null,
  source_file text,
  source_row_number integer,

  raw_person text,
  raw_event text,
  -- Holds `Yes`, `No`, `Unsure`, `Yes?`, `No?` and anything else the files
  -- contain. This is the ONLY place in the database those values may appear.
  raw_response text,
  raw_reason text,

  normalisation_status text not null default 'pending',
  -- Typed to the binary domain value. There is no representation here for a
  -- third answer, so a historical `Unsure` can only ever be normalised to `no`
  -- or rejected — never promoted (ticket step 7).
  normalised_response public.rsvp_value,
  normalised_reason text,
  rejection_reason text,
  imported_at timestamptz not null default now(),

  constraint legacy_rsvp_rows_batch_not_blank check (btrim(import_batch) <> ''),
  constraint legacy_rsvp_rows_normalisation_status_valid check (
    normalisation_status in ('pending', 'normalised', 'rejected', 'needs_review')),
  constraint legacy_rsvp_rows_normalised_has_a_value check (
    normalisation_status <> 'normalised' or normalised_response is not null),
  constraint legacy_rsvp_rows_value_only_when_normalised check (
    normalised_response is null or normalisation_status = 'normalised'),
  -- The reason requirement travels with the value: a normalised non-acceptance
  -- cannot be promoted into public.rsvp_responses without one (invariant P3).
  constraint legacy_rsvp_rows_no_requires_a_reason check (
    normalised_response is distinct from 'no'
    or btrim(coalesce(normalised_reason, '')) <> ''),
  constraint legacy_rsvp_rows_rejection_is_explained check (
    normalisation_status <> 'rejected' or btrim(coalesce(rejection_reason, '')) <> '')
);

create index legacy_rsvp_rows_batch_idx on staging.legacy_rsvp_rows (import_batch, normalisation_status);

-- Term-card cells exactly as they were read. Source Data Analysis §11.2 lists
-- the string shapes that break naive parsers: a reversed field order, no
-- delimiters at all, a comma inside the location, a start time with no end
-- time, and a title carrying the wrong year. They are parser fixtures — they
-- must never be promoted into public.events without a human resolving them.
create table staging.legacy_event_rows (
  id uuid primary key default gen_random_uuid(),
  import_batch text not null,
  source_file text,
  source_sheet text,
  source_cell text,

  raw_cell text not null,
  raw_week text,
  raw_weekday text,
  raw_colour text,

  normalisation_status text not null default 'pending',
  normalised_event_id uuid references public.events (id) on delete set null,
  rejection_reason text,
  imported_at timestamptz not null default now(),

  constraint legacy_event_rows_batch_not_blank check (btrim(import_batch) <> ''),
  constraint legacy_event_rows_raw_cell_not_blank check (btrim(raw_cell) <> ''),
  constraint legacy_event_rows_normalisation_status_valid check (
    normalisation_status in ('pending', 'normalised', 'rejected', 'needs_review')),
  constraint legacy_event_rows_link_only_when_normalised check (
    normalised_event_id is null or normalisation_status = 'normalised'),
  constraint legacy_event_rows_rejection_is_explained check (
    normalisation_status <> 'rejected' or btrim(coalesce(rejection_reason, '')) <> '')
);

create index legacy_event_rows_batch_idx on staging.legacy_event_rows (import_batch, normalisation_status);

alter table staging.legacy_event_rows enable row level security;

alter table staging.legacy_roster_rows enable row level security;
alter table staging.legacy_rsvp_rows enable row level security;

-- Reachable only by the privileged server path, and only through a direct
-- database connection: the schema is not exposed to the Data API.
revoke all on table staging.legacy_roster_rows, staging.legacy_rsvp_rows,
     staging.legacy_event_rows
  from anon, authenticated, service_role;
grant usage on schema staging to service_role;
grant select, insert, update, delete
  on table staging.legacy_roster_rows, staging.legacy_rsvp_rows, staging.legacy_event_rows
  to service_role;
