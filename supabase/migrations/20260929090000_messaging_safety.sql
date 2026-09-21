-- LAN-394 — messaging safety controls.
--
-- Brian, 17 September 2026. The club can already send a message to every
-- person it holds a number for, from seven different code paths, with nothing
-- between a mistake and the provider. This migration adds the durable state one
-- shared admission guard needs, and nothing else.
--
-- It adds no club concept. A safety scope is not a Person, a Season, an Event
-- or a Message; it is a switch and a counter for the machinery that sends. The
-- counting itself is done over rows that already exist -- `delivery_attempts`
-- is the record of "the club asked a provider to send something" and is
-- therefore already the honest denominator -- so there is no second ledger to
-- reconcile with it, and three nullable columns are the whole of the
-- accounting.
--
-- The thresholds are NOT here. They are named constants in
-- `src/lib/services/messaging-safety/policy.ts`, each carrying the decision
-- line, and the page shows them read-only. A number in a table is a number
-- somebody can change without a decision; a number in code with a decision
-- beside it is not.

-- ---------------------------------------------------------------------------
-- What a scope can be
-- ---------------------------------------------------------------------------

-- Four kinds, and there is no fifth waiting to be invented. `global` is the
-- whole application's outbound; `provider` is one of the two transports;
-- `person` and `destination` are the two independent ways one recipient is
-- counted (Brian, 17 September 2026: per-destination counting stays, and a
-- genuinely shared number may therefore need a manual resume). The global and
-- provider rows are created below and are permanent. A person or destination
-- row exists only while something is held against it: it is written when a hold
-- is recorded, and the retention sweep deletes it eight days after it stopped
-- holding anything, so this table never becomes a list of everybody the club
-- has messaged.
create type public.messaging_safety_scope_kind as enum (
  'global',
  'provider',
  'person',
  'destination'
);

create table public.messaging_safety_scopes (
  id uuid primary key default gen_random_uuid(),

  scope_kind public.messaging_safety_scope_kind not null,

  -- What this scope is about, inside its kind. `global` for the single global
  -- row, `whatsapp`/`email` for a provider, the Person's id for a person, and
  -- the channel-namespaced destination fingerprint for a destination.
  --
  -- Deliberately text and deliberately not a foreign key, even for `person`.
  -- A scope row is machinery state about sending, not a fact about the human,
  -- and a foreign key here would make a merge or an erasure choose between
  -- breaking a hold and re-pointing one onto a survivor who never earned it.
  -- `src/lib/services/person-merge/write.ts` combines these explicitly instead,
  -- and `src/lib/services/person-erasure/anonymise.ts` removes them.
  scope_key text not null,

  -- ## Pause and latch are two different things, and one never overwrites the
  -- other
  --
  -- `paused_at` is a person deciding. `latched_at` is a threshold tripping.
  -- Keeping them apart is what stops a manual resume quietly clearing an
  -- emergency stop nobody has looked at, and what stops an emergency stop
  -- erasing the reason an operator gave for pausing an hour earlier.
  paused_at timestamptz,
  paused_by_person_id uuid references public.people (id),
  paused_reason text,

  latched_at timestamptz,
  -- A safe code from a fixed list, never free text and never a provider
  -- sentence: this value reaches the count-only monitoring log.
  latch_reason_code text,

  resumed_at timestamptz,
  resumed_by_person_id uuid references public.people (id),
  resume_reason text,

  -- ## Provider circuit state -- meaningful only on a `provider` scope
  --
  -- A streak of provider-wide faults, the window it started in, and where the
  -- backoff has got to. A bad number, a rejected template or a per-recipient
  -- rate limit never reaches these columns (Brian, 17 September 2026): the
  -- adapter classifies its own fault scope and only `provider` counts.
  consecutive_faults integer not null default 0,
  first_fault_at timestamptz,
  cooldown_until timestamptz,
  -- 0 = healthy, 1 = the first 5-minute cooldown, then 10, 20, 30 and 30 again.
  cooldown_stage integer not null default 0,
  -- Incremented when a probe is let through, so an outcome from an older probe
  -- cannot close a newer incident.
  probe_generation integer not null default 0,

  -- ## What the independent alert route has already said
  --
  -- The monitoring route is one-way — structured, count-only log lines that a
  -- Cloud Monitoring log-based alert reads — so "have I already reported this"
  -- has nowhere else to live. An open incident is re-reported at most once an
  -- hour while it stays open, and the recovery line is emitted exactly when the
  -- condition clears, which both need the last-emitted instant to be durable
  -- across a restart and across two Cloud Run instances.
  --
  -- `incident_alert_at` belongs to whatever this scope latched or cooled down
  -- for. The other two are conditions rather than latches and are recorded on
  -- the global row only.
  incident_alert_at timestamptz,
  capacity_alert_at timestamptz,
  queue_alert_at timestamptz,

  -- The policy revision the running code enforces, recorded on the global row.
  -- A revision whose constants disagree with this value refuses to send rather
  -- than each enforcing a different limit.
  policy_version text,

  -- Optimistic concurrency for the operator's controls: a browser that has been
  -- open since before an incident cannot undo it by posting a stale form.
  version integer not null default 1,

  created_at timestamptz not null default now(),
  -- Maintained by the service layer, not a trigger -- Conventions.
  updated_at timestamptz not null default now(),

  constraint messaging_safety_scopes_one_per_key unique (scope_kind, scope_key),

  -- The global row is a singleton by construction: its key is fixed, and the
  -- unique constraint above then admits exactly one of it.
  constraint messaging_safety_scopes_global_key
    check (scope_kind <> 'global' or scope_key = 'global'),

  -- Only a provider scope may carry circuit state. Without this a person hold
  -- could acquire a cooldown nothing would ever clear.
  constraint messaging_safety_scopes_circuit_is_provider_only
    check (
      scope_kind = 'provider'
      or (consecutive_faults = 0
          and first_fault_at is null
          and cooldown_until is null
          and cooldown_stage = 0
          and probe_generation = 0)
    ),

  -- Only the global row records the policy revision and the two condition
  -- alerts.
  constraint messaging_safety_scopes_policy_version_is_global_only
    check (scope_kind = 'global' or policy_version is null),

  constraint messaging_safety_scopes_condition_alerts_are_global_only
    check (scope_kind = 'global' or (capacity_alert_at is null and queue_alert_at is null)),

  -- A pause has an author and a reason, or it is not a pause. Brian, 17
  -- September 2026: pause and resume each require a reason.
  constraint messaging_safety_scopes_pause_is_attributed
    check (
      paused_at is null
      or (paused_by_person_id is not null and paused_reason is not null and paused_reason <> '')
    ),

  constraint messaging_safety_scopes_resume_is_attributed
    check (
      resumed_at is null
      or (resumed_by_person_id is not null and resume_reason is not null and resume_reason <> '')
    ),

  -- A latch says why in a code, always.
  constraint messaging_safety_scopes_latch_has_a_code
    check (latched_at is null or (latch_reason_code is not null and latch_reason_code <> ''))
);

comment on table public.messaging_safety_scopes is
  'LAN-394. Durable safety state for outbound application messaging: one global row, one per provider, and one per person or destination that has been held. A person or destination row is written only when a hold is recorded against it -- an ordinary admission reads an absent row as "no hold" and creates nothing -- and the scheduler sweep removes it again once it has held nothing for eight days. Machinery, not a club concept -- it records switches and circuit state, never a fact about a human. Thresholds live in code (src/lib/services/messaging-safety/policy.ts), not here.';

comment on column public.messaging_safety_scopes.scope_key is
  'What this scope is about inside its kind: `global`, a provider name, a Person id, or a channel-namespaced destination fingerprint. Deliberately not a foreign key -- merge combines these explicitly and erasure removes them.';

comment on column public.messaging_safety_scopes.paused_at is
  'When a person paused this scope. Separate from `latched_at` so a manual resume can never quietly clear an automatic emergency stop.';

comment on column public.messaging_safety_scopes.latched_at is
  'When a threshold tripped on this scope. Survives a restart and the rolling window ageing out; only an operator resume clears it.';

comment on column public.messaging_safety_scopes.cooldown_until is
  'Provider scopes only. While this is in the future the provider is cooling down; when it passes, exactly one probe is admitted.';

comment on column public.messaging_safety_scopes.version is
  'Optimistic concurrency for the operator controls. A stale browser posts an old version and is refused rather than undoing a newer incident.';

-- The single global row, created here so that "no safety row" is a fault
-- condition the service can refuse on rather than a state it has to invent.
insert into public.messaging_safety_scopes (scope_kind, scope_key, policy_version)
values ('global', 'global', 'lan-394-v1');

-- The two provider rows, for the same reason.
insert into public.messaging_safety_scopes (scope_kind, scope_key)
values ('provider', 'whatsapp'), ('provider', 'email');

-- Reading one scope by kind and key is the hot path; the unique constraint
-- already indexes it. This one is for the page, which lists every scope that is
-- currently holding something back.
create index messaging_safety_scopes_active
  on public.messaging_safety_scopes (scope_kind, updated_at desc)
  where paused_at is not null or latched_at is not null or cooldown_until is not null;

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.messaging_safety_scopes enable row level security;

revoke all on table public.messaging_safety_scopes from anon, authenticated, service_role;

-- The narrow server need. `delete` is granted, and only for two named paths:
-- erasure removes a destination fingerprint belonging to an erased person, and
-- the retention sweep removes a recipient scope nothing is holding. Neither
-- reaches delivery history, which gets no new delete privilege at all.
grant select, insert, update, delete on table public.messaging_safety_scopes to service_role;

-- ---------------------------------------------------------------------------
-- Counting, on the rows that already record an attempt
-- ---------------------------------------------------------------------------

-- Three nullable columns, set together and only by a real admitted attempt.
-- The placeholder attempts LAN-252 writes for an unconfigured deployment leave
-- all three null and therefore count for nothing, which is correct: no provider
-- was called.
alter table public.delivery_attempts
  add column safety_admitted_at timestamptz,
  add column safety_person_id uuid references public.people (id),
  add column safety_destination_key text;

comment on column public.delivery_attempts.safety_admitted_at is
  'LAN-394. The database instant the safety guard admitted this attempt, set in the same transaction as the claim. Null on a placeholder attempt that never reached a provider. A committed admission counts even if the provider outcome is never learned.';

comment on column public.delivery_attempts.safety_person_id is
  'LAN-394. Who this admitted attempt was addressed to, for the per-person rolling counts. Cleared after eight days by the scheduler sweep, and immediately on erasure (Brian, 17 September 2026).';

comment on column public.delivery_attempts.safety_destination_key is
  'LAN-394. A channel-namespaced SHA-256 fingerprint of the destination actually selected. Sensitive and guessable, never anonymised: server storage only, never a log, an alert label or a browser payload. Cleared with `safety_person_id`.';

-- A recipient field may only exist on an admitted attempt. The reverse is not
-- required: after eight days the retention sweep clears the two identifying
-- fields and leaves `safety_admitted_at` behind, so the global accounting stays
-- conservative for rows whose recipient is no longer recorded.
alter table public.delivery_attempts
  add constraint delivery_attempts_safety_recipient_needs_an_admission
  check (
    safety_admitted_at is not null
    or (safety_person_id is null and safety_destination_key is null)
  );

-- The three rolling-window reads, indexed. Partial on the admission timestamp,
-- because an attempt that was never admitted is never counted.
create index delivery_attempts_safety_admitted_at
  on public.delivery_attempts (safety_admitted_at desc)
  where safety_admitted_at is not null;

create index delivery_attempts_safety_person_window
  on public.delivery_attempts (safety_person_id, safety_admitted_at desc)
  where safety_person_id is not null;

create index delivery_attempts_safety_destination_window
  on public.delivery_attempts (safety_destination_key, safety_admitted_at desc)
  where safety_destination_key is not null;

-- ---------------------------------------------------------------------------
-- What a waiting job carries
-- ---------------------------------------------------------------------------

-- Three columns, deliberately none of them an existing one. `scheduled_for` is
-- when the club intended to send, `next_attempt_at` is a delivery backoff,
-- `last_error` is what a provider said, and `held_at` is an event amendment.
-- A safety deferral is none of those four, and writing it into any of them
-- would make a waiting message read as a failure, a late rung, or a held one.
alter table public.notification_jobs
  add column safety_retry_at timestamptz,
  add column safety_block_scope_id uuid references public.messaging_safety_scopes (id) on delete set null,
  add column safety_reason_code text;

comment on column public.notification_jobs.safety_retry_at is
  'LAN-394. The earliest moment the safety guard is worth asking again about this job. Never a delivery retry: no attempt was made and none was consumed.';

comment on column public.notification_jobs.safety_block_scope_id is
  'LAN-394. Which safety scope is currently holding this job back, so the sweep can skip it cheaply and the page can name the hold.';

comment on column public.notification_jobs.safety_reason_code is
  'LAN-394. A safe code from a fixed list explaining the wait. Never a provider sentence and never free text.';

create index notification_jobs_safety_waiting
  on public.notification_jobs (safety_retry_at)
  where safety_retry_at is not null;
