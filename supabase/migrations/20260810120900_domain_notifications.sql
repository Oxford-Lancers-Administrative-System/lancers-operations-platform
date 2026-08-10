-- Domain baseline, part 10 of 12: notification jobs and delivery results.
--
-- Architecture cheat sheet §9, locked as an architectural pattern. This is the
-- seam that lets the entire loop be built with NO delivery channel attached:
-- approving an event creates invitation jobs regardless of what eventually
-- sends them. Nothing in this file knows what WhatsApp is.

create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),

  -- Invariant M1: mandatory at creation. A claimed job processed twice produces
  -- one delivery.
  idempotency_key text not null,

  job_type public.notification_job_type not null,

  -- Invariant M4: exactly the six locked states, no seventh. Terminal failure
  -- is `failed` with the retry policy exhausted — that is what the operator
  -- queue reads (Requirement 15).
  status public.notification_job_status not null default 'pending',

  invitation_id uuid references public.invitations (id) on delete restrict,
  event_id uuid references public.events (id) on delete restrict,
  person_id uuid references public.people (id) on delete restrict,

  channel public.notification_channel,
  scheduled_for timestamptz,

  -- Claiming is atomic in the service layer; these record the claim so a stuck
  -- job is visible rather than invisible.
  claimed_at timestamptz,
  claimed_by text,

  attempt_count integer not null default 0,
  last_error text,

  -- The one genuinely variable, non-load-bearing payload in the schema:
  -- template substitution values. Nothing joins to it and no rule reads it.
  template_variables jsonb not null default '{}'::jsonb,

  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint notification_jobs_idempotency_key_unique unique (idempotency_key),
  constraint notification_jobs_idempotency_key_not_blank check (btrim(idempotency_key) <> ''),
  constraint notification_jobs_attempt_count_non_negative check (attempt_count >= 0),
  constraint notification_jobs_claim_is_recorded check (
    status <> 'processing' or (claimed_at is not null and claimed_by is not null)),
  constraint notification_jobs_ready_is_scheduled check (
    status <> 'ready' or scheduled_for is not null),
  constraint notification_jobs_template_variables_is_object check (
    jsonb_typeof(template_variables) = 'object'),
  constraint notification_jobs_has_a_subject check (
    num_nonnulls(invitation_id, event_id, person_id) >= 1)
);

-- The scheduled processing path: find due work, claim a batch, deliver.
create index notification_jobs_due_idx on public.notification_jobs (status, scheduled_for)
  where status in ('pending', 'ready');
-- Requirement 15: the operator's failed-delivery queue reads jobs, not
-- invitations (review F08).
create index notification_jobs_failed_idx on public.notification_jobs (status, updated_at desc)
  where status = 'failed';
create index notification_jobs_invitation_idx on public.notification_jobs (invitation_id)
  where invitation_id is not null;

comment on column public.notification_jobs.template_variables is
  'Template substitution values only. JSONB is permitted here because the structure is genuinely variable and nothing load-bearing reads it.';

-- ---------------------------------------------------------------------------
-- Delivery results
-- ---------------------------------------------------------------------------

-- Invariant M4, second half: delivery truth lives here alone. Invitation
-- delivery visibility is derived from these rows, never stored on the
-- invitation (review F08). A manual send or manual contact is recorded here
-- with its actor — another completion path, not a different operating model.
create table public.delivery_results (
  id uuid primary key default gen_random_uuid(),
  notification_job_id uuid not null references public.notification_jobs (id) on delete restrict,
  attempt_number integer not null,
  outcome public.delivery_outcome not null,
  channel public.notification_channel not null,
  provider text,
  provider_message_id text,
  actor_person_id uuid references public.people (id) on delete restrict,
  detail text,
  occurred_at timestamptz not null default now(),

  constraint delivery_results_one_per_attempt unique (notification_job_id, attempt_number),
  constraint delivery_results_attempt_number_positive check (attempt_number >= 1),
  constraint delivery_results_manual_names_its_actor check (
    (outcome <> 'manual' and channel <> 'manual') or actor_person_id is not null)
);

create index delivery_results_job_idx on public.delivery_results (notification_job_id, attempt_number);

alter table public.notification_jobs enable row level security;
alter table public.delivery_results enable row level security;

revoke all on table public.notification_jobs, public.delivery_results
  from anon, authenticated, service_role;

grant select, insert, update, delete on table public.notification_jobs to service_role;

-- Append-only: an attempt happened or it did not.
grant select, insert on table public.delivery_results to service_role;
