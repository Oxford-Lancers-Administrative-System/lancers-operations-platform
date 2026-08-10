-- Domain baseline, part 11 of 12: the Monday review as data, and the audit
-- ledger.

-- ---------------------------------------------------------------------------
-- Weekly report
-- ---------------------------------------------------------------------------

-- Invariant M5 / review F09: a published report is an IMMUTABLE snapshot, so
-- "what leadership saw on 12 October" is answerable later. Regeneration
-- produces a new version, never a rewrite.
--
-- There is deliberately no `status` column. "Superseded" is derived — a report
-- is superseded exactly when a later row points at it — which is what allows
-- this table to be strictly insert-only. A status column would have required an
-- UPDATE and quietly broken the immutability it was documenting.
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  report_on date not null,
  version integer not null default 1,
  supersedes_id uuid references public.weekly_reports (id) on delete restrict,

  -- The metric definitions the numbers were computed under. The sixteen
  -- recovered from the Master Table (SDA §4) are the starting content; when a
  -- definition changes, old snapshots stay readable because they say which
  -- version they used.
  metric_definition_version text not null,
  data_as_of timestamptz not null,
  generated_at timestamptz not null default now(),
  generated_by_person_id uuid references public.people (id) on delete restrict,

  -- The rendered snapshot. JSONB is correct here precisely because the shape is
  -- whatever the metric definitions of that version produced, and nothing joins
  -- to it — it is evidence, not operational state.
  content jsonb not null,

  constraint weekly_reports_one_per_version unique (season_id, report_on, version),
  constraint weekly_reports_version_positive check (version >= 1),
  constraint weekly_reports_first_version_supersedes_nothing check (
    (version = 1) = (supersedes_id is null)),
  constraint weekly_reports_content_is_object check (jsonb_typeof(content) = 'object'),
  constraint weekly_reports_metric_version_not_blank check (btrim(metric_definition_version) <> '')
);

create index weekly_reports_season_idx on public.weekly_reports (season_id, report_on desc, version desc);
create unique index weekly_reports_one_superseding_row on public.weekly_reports (supersedes_id)
  where supersedes_id is not null;

-- ---------------------------------------------------------------------------
-- Follow-up action
-- ---------------------------------------------------------------------------

-- Register D9: exceptions are DETECTED by query and materialised only when
-- owned. Nonresponse, mismatch, unpaid subs and availability flags are derived
-- views over live state — always current, nothing to sync. A row appears here
-- only when the Monday review or an operator takes ownership.
--
-- Unlike the snapshots above, these are living and mutable by design.
create table public.follow_up_actions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete restrict,
  weekly_report_id uuid references public.weekly_reports (id) on delete restrict,
  category public.follow_up_category not null,
  description text not null,
  status public.follow_up_status not null default 'open',
  owner_person_id uuid references public.people (id) on delete restrict,

  subject_person_id uuid references public.people (id) on delete restrict,
  subject_season_membership_id uuid references public.season_memberships (id) on delete restrict,
  subject_event_id uuid references public.events (id) on delete restrict,

  due_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,

  constraint follow_up_actions_description_not_blank check (btrim(description) <> ''),
  constraint follow_up_actions_closure_is_explained check (
    status not in ('resolved', 'cancelled')
    or (resolved_at is not null and btrim(coalesce(resolution_note, '')) <> ''))
);

-- Relentless resurfacing of unresolved actions is intended behaviour, confirmed
-- in the owner walkthrough. This index is what makes it cheap.
create index follow_up_actions_open_idx on public.follow_up_actions (season_id, due_on)
  where status in ('open', 'in_progress');
create index follow_up_actions_report_idx on public.follow_up_actions (weekly_report_id)
  where weekly_report_id is not null;

-- ---------------------------------------------------------------------------
-- Audit ledger
-- ---------------------------------------------------------------------------

-- Invariant M2: every transition named in model §2 writes an immutable record
-- with actor, timestamp and — for corrections — a reason.
--
-- Where the model gives a transition a typed first-class home (membership
-- lifecycle, RSVP, availability, schedule change, delivery result), that table
-- IS the record and this one is not written as well; duplicating them would
-- create exactly the reconciliation problem register D9 refuses. Everything
-- else lands here. public.transition_ledger presents both as one stream.
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_person_id uuid references public.people (id) on delete restrict,
  actor_label text,
  action text not null,

  -- Deliberately polymorphic and NOT a foreign key: an audit row must outlive
  -- and out-scope the thing it describes, including rows removed by the
  -- redaction path (review F13).
  entity_table text not null,
  entity_id uuid not null,

  from_state text,
  to_state text,
  reason text,
  context jsonb not null default '{}'::jsonb,

  constraint audit_events_action_not_blank check (btrim(action) <> ''),
  constraint audit_events_entity_table_not_blank check (btrim(entity_table) <> ''),
  constraint audit_events_has_an_actor check (
    actor_person_id is not null or btrim(coalesce(actor_label, '')) <> ''),
  constraint audit_events_context_is_object check (jsonb_typeof(context) = 'object')
);

create index audit_events_entity_idx on public.audit_events (entity_table, entity_id, occurred_at desc);
create index audit_events_occurred_idx on public.audit_events (occurred_at desc);

alter table public.weekly_reports enable row level security;
alter table public.follow_up_actions enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.weekly_reports, public.follow_up_actions, public.audit_events
  from anon, authenticated, service_role;

grant select, insert, update, delete on table public.follow_up_actions to service_role;

-- Append-only. Invariant M5 for reports; invariant M2 for the ledger.
grant select, insert on table public.weekly_reports to service_role;
grant select, insert on table public.audit_events to service_role;
