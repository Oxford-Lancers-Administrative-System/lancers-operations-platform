-- LAN-169: the club's messaging schedule, the plan an approval freezes, the
-- player's durable credential, and the nonresponse flag.
--
-- Mission M-AUTOMATED-COMMUNICATIONS-REMINDERS-RECOVERY, work package
-- WP-messaging-foundation. This is the mission's only migration.
--
-- ## What already exists, so that nothing here duplicates it
--
-- `notification_jobs`, `delivery_results`, `delivery_attempts`,
-- `delivery_callbacks` and `rsvp_access_tokens` all ship on `main` and are
-- unchanged in substance. A working claim-execute-record cycle runs on every
-- event approval. What has never existed is anything that reads
-- `notification_jobs.scheduled_for` — so a job left pending sat until a human
-- pressed Retry, and there was no reminder ladder, no dispatch anchor and no
-- escalation at all.
--
-- Four tables and three columns are what that absence needs:
--
--   * `messaging_schedules`     — the club's policy, per event type. One row
--                                 per type, complete, with no default arm.
--   * `event_messaging_plans`   — that policy frozen onto one event at the
--                                 moment of approval, because a schedule change
--                                 is never retroactive.
--   * `person_access_tokens`    — the player's durable, season-scoped, per-person
--                                 revocable credential, stored as a digest.
--   * `nonresponse_flags`       — one flag per invitation per threshold, raised
--                                 idempotently and cleared only by resolution.
--
-- ## What this migration deliberately does NOT add
--
-- No table for the President's office. `public.roles` already holds the
-- constitutional offices and `public.role_assignments` binds the current holder
-- under invariant I3's GiST exclusion constraint, so escalation resolves the
-- office through the tables that already own it (mission decision Q-6).
--
-- No seventh `notification_job_status`. Invariant M4 locks the vocabulary at
-- six, exactly as LAN-156's amendment hold did when it added `held_at` rather
-- than a status.
--
-- No second copy of delivery truth. `delivery_results` stays authoritative.

-- ---------------------------------------------------------------------------
-- 1. The nonresponse threshold vocabulary
-- ---------------------------------------------------------------------------

-- One value today, and a type rather than a text column for the reason ADR 0009
-- gives: a threshold is a closed vocabulary the flag's uniqueness is keyed on,
-- and a free-text key would let two spellings of "escalation" raise two flags
-- for one invitation — which is precisely what `REQ-one-flag-per-threshold`
-- forbids.
--
-- It is a type rather than a hard-coded literal because W5 names the flag's
-- surfaces in the plural and Mission 9's Monday report is owed the same
-- population; a second threshold arrives as a value here and changes no
-- constraint.
create type public.nonresponse_threshold as enum ('escalation');

comment on type public.nonresponse_threshold is
  'Which chase threshold an invitation crossed. One flag per invitation per value (REQ-one-flag-per-threshold).';

-- ---------------------------------------------------------------------------
-- 2. The club's messaging schedule
-- ---------------------------------------------------------------------------

-- W7, and the reversal of ADR 0021's third rule.
--
-- ADR 0021 put the response deadlines in `src/lib/services/response-deadline.ts`
-- as a frozen TypeScript table and said, in terms, that Release One would carry
-- no configuration-administration surface. Brian reversed that on 2026-08-25
-- ("Okay, we're building it… Yes, it's a superseding ADR"), which is recorded in
-- docs/adr/0036-messaging-schedule-configuration.md.
--
-- Three of ADR 0021's rules survive intact and are enforced here rather than
-- merely restated:
--
--   * **The table is complete and has no default arm.** Every value of
--     `public.event_type` is seeded below, and the service layer refuses an
--     event type with no row rather than inheriting one. Widening
--     `public.event_type` therefore forces the decision to be made.
--   * **A past deadline is clamped at approval**, not moved. That is service-layer
--     arithmetic; see `resolveResponseDeadlineIn`.
--   * **There is no per-event override.** The primary key is the event type. There
--     is no event column here and no table beside this one keyed on an event —
--     `event_messaging_plans` below is a frozen copy of what was decided, never
--     a place to decide something different.
--
-- What ADR 0021 *changes* is the anchor: the day counts survive, the fixed 18:00
-- wall clock does not. `REQ-deadline-from-event-start` measures every deadline
-- from the event's own start, resolved in the club's timezone so both British
-- Summer Time transitions inside a season stay correct.
create table public.messaging_schedules (
  event_type public.event_type primary key,

  -- "Player RSVP by": whole days before the event's own start instant. ADR
  -- 0021's day counts, unchanged.
  rsvp_by_days smallint not null,

  -- "First invitation sent": whole days before the event's own start. Editable
  -- rather than derived, per W7 — announcing a game three weeks out is a real
  -- thing a club does — and the approval panel warns when the last reminder
  -- would land well before the deadline.
  invitation_lead_days smallint not null,

  -- The ladder is a cadence, not per-rung offsets. Brian, 2026-08-25: "The first
  -- message gets sent out at the thing, then it waits 24 hours, then sends the
  -- next one." Reminders count FORWARD from the invitation
  -- (`REQ-count-forward`), never backwards from the deadline.
  reminder_cadence_hours smallint not null default 24,

  -- The ladder ORDER is fixed and is deliberately not represented here: WhatsApp,
  -- WhatsApp again, email, then the President (`REQ-ladder-order`). Only the
  -- counts and the spacing are configurable, so these two columns are counts of
  -- rungs on a sequence whose shape is code, not data.
  whatsapp_reminder_count smallint not null default 2,
  email_reminder_count smallint not null default 1,

  -- `REQ-escalation-threshold`: hours after the RSVP deadline before the
  -- President is told. Zero is permitted and means "as the deadline passes".
  escalation_hours smallint not null default 12,

  -- W7 requires every change to be attributed, and it is — in `audit_events`,
  -- which is the club's audit trail for every entity.
  --
  -- There is deliberately **no `updated_by_person_id` column here**, and the
  -- reason is not tidiness. `public.event_type_settings` reached the same
  -- conclusion for the same stated reason ("a denormalised actor column here
  -- would be a weaker second copy of it"), and this table has a second,
  -- sharper one: reference data must not carry a foreign key to
  -- `public.people`. The synthetic seed truncates `public.people ... cascade`,
  -- and `TRUNCATE CASCADE` empties every table holding a reference to what it
  -- truncates — so an actor column here would silently delete the club's entire
  -- messaging policy on every `npm run db:seed`, leaving seven event types with
  -- no schedule and an application that refuses every approval. That was
  -- observed, not theorised: the first draft of this table carried the column
  -- and came back empty from the very first seed.
  --
  -- The settings page answers "who last changed this" from `audit_events`,
  -- exactly as `/operate/admin/operators` and `/operate/admin/roles` already do.
  updated_at timestamptz not null default now(),

  constraint messaging_schedules_rsvp_by_is_sane check (rsvp_by_days between 0 and 60),
  constraint messaging_schedules_invitation_lead_is_sane check (
    invitation_lead_days between 0 and 120),

  -- The invitation cannot be scheduled after the deadline it is chasing. A lead
  -- shorter than the deadline would invite people to answer by a date that had
  -- already passed when they were asked.
  constraint messaging_schedules_invitation_precedes_the_deadline check (
    invitation_lead_days >= rsvp_by_days),

  -- A cadence of zero would put every rung at the same instant, which is the
  -- burst W7 rejected. One hour is the floor the schema enforces; policy sets 24.
  constraint messaging_schedules_cadence_is_positive check (
    reminder_cadence_hours between 1 and 720),

  -- Zero is permitted for either count: W7 makes the counts tunable and the
  -- order fixed, and a club that wants no email rung is expressing policy
  -- rather than breaking the ladder. `REQ-late-approval`'s "at least one
  -- WhatsApp always goes out" is not at risk from a zero here, because the
  -- message it guarantees is the **invitation**, which every plan schedules
  -- unconditionally as rung 0 and which is itself a WhatsApp.
  constraint messaging_schedules_whatsapp_reminders_are_sane check (
    whatsapp_reminder_count between 0 and 10),
  constraint messaging_schedules_email_reminders_are_sane check (
    email_reminder_count between 0 and 10),

  constraint messaging_schedules_escalation_is_sane check (
    escalation_hours between 0 and 720)
);

-- Complete over `public.event_type`. Seven types, seven rows, and the service
-- layer refuses an eighth rather than defaulting it.
--
-- `rsvp_by_days` is ADR 0021's owner-decided table, unchanged: two days for the
-- routine events, seven for a game, five for a social.
--
-- `invitation_lead_days` follows arithmetically from counting forward. Three
-- reminders at a 24-hour cadence occupy three days, so an invitation at
-- `rsvp_by_days + 3` lands its last reminder on the deadline itself rather than
-- days before it.
insert into public.messaging_schedules
  (event_type, rsvp_by_days, invitation_lead_days,
   reminder_cadence_hours, whatsapp_reminder_count, email_reminder_count, escalation_hours)
values
  ('practice',                  2,  5, 24, 2, 1, 12),
  ('strength_and_conditioning', 2,  5, 24, 2, 1, 12),
  ('chalk',                     2,  5, 24, 2, 1, 12),
  ('game',                      7, 10, 24, 2, 1, 12),
  ('social',                    5,  8, 24, 2, 1, 12),
  ('recruitment',               2,  5, 24, 2, 1, 12),
  ('meeting',                   2,  5, 24, 2, 1, 12);

comment on table public.messaging_schedules is
  'The club''s messaging policy, per event type (W7). Complete over public.event_type with no default arm; an unconfigured type is a refusal, never an inherited default. Supersedes ADR 0021''s TypeScript table — see docs/adr/0036-messaging-schedule-configuration.md.';
comment on column public.messaging_schedules.rsvp_by_days is
  'Whole days before the event''s own start instant. ADR 0021''s day counts; the fixed 18:00 clock is retired (REQ-deadline-from-event-start).';
comment on column public.messaging_schedules.invitation_lead_days is
  'Whole days before the event''s own start at which the invitation dispatches. An event closer than its lead dispatches immediately and never into the past.';
comment on column public.messaging_schedules.escalation_hours is
  'Hours after the RSVP deadline before the President is told. Zero is permitted (REQ-escalation-threshold).';

-- ---------------------------------------------------------------------------
-- 3. The plan an approval freezes
-- ---------------------------------------------------------------------------

-- `REQ-schedule-not-retroactive`, stated by W7 as "events already approved keep
-- the schedule they were approved with".
--
-- The reason it is a table rather than a recomputation is that the schedule is
-- now editable at runtime. Recomputing a chase from `messaging_schedules` would
-- mean an operator who shortens the cadence on Tuesday retroactively changes
-- when Monday's already-approved event chases forty people — and, worse, that
-- the plan the approver read before committing stops being the plan that runs.
--
-- One row per event. Not per invitation: every invitee of one event is on the
-- same ladder, and a per-invitation copy would be forty rows saying one thing.
create table public.event_messaging_plans (
  -- A surrogate key, and `event_id` unique beside it rather than as the primary
  -- key. The natural key really is the event — one plan per event, enforced
  -- below — but the production showcase rollback walks foreign keys and deletes
  -- what it finds **by `id`**, and refuses by name any table it can reach that
  -- has none. LAN-151 discovered that the hard way, from a `column "id" does
  -- not exist` in the middle of a rollback, and this table is reachable from
  -- `public.events` exactly as that one was.
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events (id) on delete restrict,

  -- The policy, copied verbatim at approval. Deliberately a copy and not a
  -- foreign key to `messaging_schedules`: the point is that a later edit does
  -- not reach this row.
  rsvp_by_days smallint not null,
  invitation_lead_days smallint not null,
  reminder_cadence_hours smallint not null,
  whatsapp_reminder_count smallint not null,
  email_reminder_count smallint not null,
  escalation_hours smallint not null,

  -- The resolved instants. Computed once, in PostgreSQL, in the club's zone.
  --
  -- `response_deadline_at` is the same value written to
  -- `events.response_deadline_at` and to every `invitations.expires_at` of this
  -- event. It is stored again here because this row is the whole plan, and a
  -- plan that cannot be read without joining to two other tables is not a plan
  -- the approval panel can render.
  response_deadline_at timestamptz not null,

  -- When the invitation rung dispatches. `max(now, event_start - lead)` — the
  -- rule never sends into the past and never holds back an event that is
  -- already close.
  invitation_at timestamptz not null,

  -- Null when this event will never escalate, which is exactly the
  -- late-approval case (`REQ-late-approval`: "No on the president").
  escalation_at timestamptz,

  -- `REQ-dispatch-anchor`: the approver is told, before committing, that this
  -- event goes now rather than on a stated date. Stored rather than derived so
  -- the confirmation restates what the approval actually decided.
  dispatches_immediately boolean not null,

  -- A late approval is one whose runway was too short to run the ordinary
  -- ladder. It sends immediately, fills the remaining time with WhatsApp
  -- reminders on the normal cadence, guarantees at least one WhatsApp, sends no
  -- email, and never escalates. Brian, 2026-08-25, replacing compression
  -- entirely.
  late_approval boolean not null,

  -- How many rungs this plan actually scheduled, after the late-approval runway
  -- has had its say. The approval panel quotes it and the scheduler never
  -- invents a rung that is not counted here.
  whatsapp_reminders_scheduled smallint not null,
  email_reminders_scheduled smallint not null,

  frozen_at timestamptz not null default now(),
  frozen_by_person_id uuid references public.people (id) on delete restrict,

  -- One plan per event, which is what the primary key used to say. Keeping it
  -- as a unique constraint is what lets `freezeMessagingPlanIn` write
  -- `on conflict (event_id) do update` and what stops a second approval — which
  -- the status guard already refuses — ever producing a second plan.
  constraint event_messaging_plans_one_per_event unique (event_id),

  constraint event_messaging_plans_counts_are_sane check (
    whatsapp_reminder_count >= 0 and email_reminder_count >= 0
    and whatsapp_reminders_scheduled >= 0 and email_reminders_scheduled >= 0),

  -- A plan may schedule fewer rungs than the policy asks for — that is what a
  -- short runway does — but never more.
  constraint event_messaging_plans_schedules_no_more_than_policy check (
    whatsapp_reminders_scheduled <= whatsapp_reminder_count
    and email_reminders_scheduled <= email_reminder_count),

  -- `REQ-late-approval`, as a constraint rather than as a convention: a late
  -- approval is WhatsApp only and never escalates.
  --
  -- The third half of that requirement — "always sends at least one WhatsApp" —
  -- is deliberately NOT a constraint on `whatsapp_reminders_scheduled`, and the
  -- distinction is the one that decides whether the guarantee is real. The
  -- message it guarantees is the **invitation**: rung 0, always scheduled,
  -- always WhatsApp, and represented here by `invitation_at`, which is `not
  -- null` on every row. Writing the guarantee against the reminder count
  -- instead would have forced a plan with a zero-length runway to invent a
  -- reminder after its own deadline in order to satisfy a check — a message
  -- sent to make a constraint pass.
  constraint event_messaging_plans_late_approval_is_whatsapp_only check (
    not late_approval or email_reminders_scheduled = 0),
  constraint event_messaging_plans_late_approval_never_escalates check (
    not late_approval or escalation_at is null),

  -- The invitation cannot be scheduled after the escalation it precedes.
  constraint event_messaging_plans_escalation_follows_the_invitation check (
    escalation_at is null or escalation_at >= invitation_at)
);

comment on table public.event_messaging_plans is
  'The messaging schedule frozen onto one event at approval (REQ-schedule-not-retroactive). A later edit to public.messaging_schedules never reaches an approved event: this row is a copy, deliberately, not a reference.';
comment on column public.event_messaging_plans.late_approval is
  'The runway was too short for the ordinary ladder. Sends immediately, WhatsApp only, at least one WhatsApp, and never escalates (REQ-late-approval, Brian 2026-08-25).';
comment on column public.event_messaging_plans.escalation_at is
  'When the President is told. Null means this event will never escalate, which is the late-approval case and nothing else.';

-- ---------------------------------------------------------------------------
-- 4. The player's durable credential
-- ---------------------------------------------------------------------------

-- `REQ-person-token`. Built on the `club_link_tokens` pattern, and deliberately
-- NOT on `rsvp_access_tokens`, because the three differ in what they open and
-- how long they live:
--
--   * `rsvp_access_tokens` — one invitation, minted per delivery attempt,
--     superseded by the next, dead when the event starts.
--   * `club_link_tokens`   — one event's participation table, shared with a
--     squad, no person in it at all.
--   * `person_access_tokens` (this) — one person's own page for a whole season.
--     It outlives every event in that season and dies with the season.
--
-- Three properties LAN-169 names, and where each one is enforced:
--
--   * **Digest only.** The shape check below refuses anything that is not 64
--     lowercase hex characters, so a bug that stored the token itself is
--     rejected by the database rather than found later by reading rows. Same
--     guarantee `rsvp_access_tokens` carries, for the same reason.
--   * **Season-scoped.** `season_id` is mandatory and the resolver requires the
--     season to be unclosed. A credential cannot outlive the season it belongs
--     to, and the check is a live read of `seasons`, never a stamped expiry that
--     an early close would leave stale.
--   * **Revocable per person without waiting for a season close.** `revoked_at`
--     with an explained reason, and the partial unique index below means
--     revoking is what makes room for a reissue.
--
-- What it does NOT do is answer an invitation. The one-time answer token, its
-- side-effect-free GET and its cookie-gated POST are `WP-player-answer`'s
-- contract (mission decision Q-11); this table is the durable credential that
-- reaches the page, and `single_use_at` below is where a one-time token records
-- its consumption.
create table public.person_access_tokens (
  id uuid primary key default gen_random_uuid(),

  -- `restrict` throughout, exactly as every other token table takes it: a token
  -- vanishing quietly with its subject would erase the record that a credential
  -- was ever issued.
  person_id uuid not null references public.people (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,

  token_hash text not null,

  -- A durable page credential, or a token good for exactly one answer. Both
  -- live here because they are the same secret material with the same storage
  -- rule, and separating them would be two tables with one check constraint
  -- between them.
  single_use boolean not null default false,

  -- When a single-use token was consumed. The POST that records an answer
  -- stamps it, and the partial unique index below stops a consumed token being
  -- the live one. Always null for a durable credential.
  single_use_at timestamptz,

  issued_at timestamptz not null default now(),
  issued_by_person_id uuid references public.people (id) on delete restrict,

  revoked_at timestamptz,
  revoked_reason text,

  last_used_at timestamptz,
  use_count integer not null default 0,

  created_at timestamptz not null default now(),

  constraint person_access_tokens_hash_unique unique (token_hash),

  -- 64 lowercase hex characters, and nothing else, can be stored here.
  constraint person_access_tokens_hash_is_a_sha256_digest check (
    token_hash ~ '^[0-9a-f]{64}$'),

  constraint person_access_tokens_use_count_non_negative check (use_count >= 0),
  constraint person_access_tokens_use_is_dated check (
    (use_count = 0) = (last_used_at is null)),

  -- A withdrawn credential is a decision somebody took, and an unexplained one
  -- is a decision nobody can review later.
  constraint person_access_tokens_revocation_is_explained check (
    revoked_at is null or btrim(coalesce(revoked_reason, '')) <> ''),

  -- Only a single-use token can be consumed, and consuming a durable one would
  -- be a bug that silently locked a player out of their own page for a season.
  constraint person_access_tokens_consumption_is_single_use check (
    single_use_at is null or single_use)
);

-- At most one live durable credential per person per season.
--
-- Partial on both `single_use` and the revocation, because a reissue is a
-- revoke-then-insert and because a person legitimately holds many one-time
-- answer tokens at once — one per invitation they have been sent.
create unique index person_access_tokens_one_live_per_person_season
  on public.person_access_tokens (person_id, season_id)
  where not single_use and revoked_at is null;

-- The resolver's path: one digest lookup on every visit to the player's page.
create index person_access_tokens_person_idx
  on public.person_access_tokens (person_id, season_id);

comment on table public.person_access_tokens is
  'REQ-person-token. The player''s season-scoped credential, stored only as a SHA-256 digest. Stops resolving when its season closes, and is revocable per person without waiting for one.';
comment on column public.person_access_tokens.token_hash is
  'SHA-256 of the URL-safe token, lowercase hex. Never the token.';
comment on column public.person_access_tokens.season_id is
  'The season this credential belongs to. Resolution reads the season live rather than stamping an expiry, so closing a season early really does close its credentials.';
comment on column public.person_access_tokens.single_use_at is
  'When a one-time answer token was consumed. WP-player-answer''s POST stamps it; a durable credential is never consumed.';

-- ---------------------------------------------------------------------------
-- 5. The nonresponse flag
-- ---------------------------------------------------------------------------

-- `REQ-one-flag-per-threshold`, restated by W5 and enforced here rather than in
-- the scheduler:
--
--   * **One flag per invitation per threshold** — the unique constraint.
--   * **Idempotent under reruns** — `on conflict do nothing` against that
--     constraint is what makes running the scheduler twice raise one flag and
--     send one escalation. A check-then-insert could not, because two scheduler
--     instances can cross the threshold concurrently and only the database can
--     adjudicate that.
--   * **Cleared by resolution, never by time** — there is no expiry column here
--     and nothing sweeps this table. An answer, a recorded answer, or an
--     operator actioning it writes `resolved_at`.
--   * **Readable in history once cleared** — resolution is an update, not a
--     delete, and `service_role` holds no `delete` on this table.
create table public.nonresponse_flags (
  id uuid primary key default gen_random_uuid(),

  invitation_id uuid not null references public.invitations (id) on delete restrict,
  threshold public.nonresponse_threshold not null,

  raised_at timestamptz not null default now(),

  -- The escalation this flag caused, where it caused one. Null when the
  -- President's office is vacant: W5 requires the escalation to be held and
  -- visibly unsent rather than dropped or sent to a stale holder, and a flag
  -- with no job is exactly that visible held state.
  escalation_job_id uuid references public.notification_jobs (id) on delete restrict,

  resolved_at timestamptz,
  -- What resolved it, in the club's own words. An unexplained resolution is a
  -- flag somebody cleared for a reason nobody can review.
  resolution text,
  resolved_by_person_id uuid references public.people (id) on delete restrict,

  created_at timestamptz not null default now(),

  constraint nonresponse_flags_one_per_invitation_threshold unique (invitation_id, threshold),
  constraint nonresponse_flags_resolution_is_explained check (
    resolved_at is null or btrim(coalesce(resolution, '')) <> ''),
  constraint nonresponse_flags_resolution_is_dated check (
    resolution is null or resolved_at is not null)
);

-- The chase queue reads open flags across every approved event.
create index nonresponse_flags_open_idx on public.nonresponse_flags (raised_at desc)
  where resolved_at is null;
create index nonresponse_flags_invitation_idx on public.nonresponse_flags (invitation_id);

comment on table public.nonresponse_flags is
  'REQ-one-flag-per-threshold. One row per invitation per crossed threshold, raised idempotently by the scheduler. Cleared only by real resolution, never by time, and readable in history once cleared — resolution is an update and service_role holds no delete.';
comment on column public.nonresponse_flags.escalation_job_id is
  'The escalation this flag sent, or null where the President''s office was vacant and the escalation is held and visibly unsent (W5).';

-- ---------------------------------------------------------------------------
-- 6. What the scheduler needs on a job
-- ---------------------------------------------------------------------------

-- Three columns, no seventh status. Invariant M4 locks
-- `notification_job_status` at six values, so everything the sweep needs is
-- expressed as data on the row — exactly as LAN-156's amendment hold added
-- `held_at` rather than a `held` status.
alter table public.notification_jobs
  -- Time-based backoff. `MAX_ATTEMPTS` and the retryable/terminal split on 429
  -- and 5xx already exist; what has never existed is a moment at which an
  -- automatic re-attempt becomes due. Null means "no automatic attempt is
  -- pending" — either it has never been attempted, or its last attempt was
  -- terminal.
  --
  -- Separate from `scheduled_for`, which is the rung's own place on the ladder.
  -- Collapsing the two would make a failed invitation's backoff look like a
  -- reminder that had moved, and would lose the rung's real time the moment it
  -- failed once.
  add column next_attempt_at timestamptz,

  -- Where this job sits on the chase ladder: 0 is the invitation, then the
  -- WhatsApp reminders, then the email. Null for anything that is not a rung —
  -- an escalation, a cancellation notice, a schedule-change notice.
  --
  -- Stored rather than derived from `created_at` order because the ladder's
  -- order is fixed policy (`REQ-ladder-order`) and reading it back from
  -- insertion order would make it an accident of how the planner happened to
  -- loop.
  add column ladder_rung smallint,

  -- `REQ-retries-have-no-actor`: the delivery surface shows the attempt and the
  -- next due time and offers nothing to press. This is the count that surface
  -- reads for "attempt 2 of 5" without having to join to `delivery_attempts`
  -- and take a max.
  add column automatic_attempts integer not null default 0;

alter table public.notification_jobs
  add constraint notification_jobs_ladder_rung_non_negative check (
    ladder_rung is null or ladder_rung >= 0),
  add constraint notification_jobs_automatic_attempts_non_negative check (
    automatic_attempts >= 0),
  -- A job cannot have been retried automatically more often than it has been
  -- attempted at all.
  add constraint notification_jobs_automatic_attempts_are_attempts check (
    automatic_attempts <= attempt_count);

comment on column public.notification_jobs.next_attempt_at is
  'When an automatic re-attempt becomes due, for time-based backoff. Null means no automatic attempt is pending. Distinct from scheduled_for, which is the rung''s own place on the ladder.';
comment on column public.notification_jobs.ladder_rung is
  'Position on the fixed chase ladder — 0 the invitation, then WhatsApp, then email (REQ-ladder-order). Null for a job that is not a rung.';

-- The sweep's own index. `scheduled_for` alone was never enough: a due job is
-- one whose rung has arrived AND whose backoff has elapsed, and the existing
-- `notification_jobs_due_idx` covers neither `failed` nor `next_attempt_at`.
--
-- `held_at is null` is in the predicate because a held job is never due —
-- `claimJobIn` refuses it and counting it would report an attempt against a
-- message nothing tried to send.
create index notification_jobs_sweep_idx
  on public.notification_jobs (scheduled_for, next_attempt_at)
  where status in ('pending', 'ready', 'failed') and held_at is null;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, unchanged and no weaker. RLS on, zero policies, nothing
-- granted to a browser-facing role, and only the narrow server need granted to
-- `service_role`.
--
-- `person_access_tokens` is the most sensitive of the four by some distance — a
-- read of it is a read of who the club is asking to what — and it takes exactly
-- the posture `rsvp_access_tokens` and `club_link_tokens` already take.

alter table public.messaging_schedules enable row level security;
alter table public.event_messaging_plans enable row level security;
alter table public.person_access_tokens enable row level security;
alter table public.nonresponse_flags enable row level security;

revoke all on table
  public.messaging_schedules,
  public.event_messaging_plans,
  public.person_access_tokens,
  public.nonresponse_flags
  from anon, authenticated, service_role;

-- Policy is edited, never created or deleted by an operator: the seven rows
-- exist from this migration and a type without a row is a refusal, not an
-- invitation to insert one. No `insert`, and no `delete`.
grant select, update on table public.messaging_schedules to service_role;

-- A plan is frozen once, at approval. It is updated when W8 recomputes a
-- rescheduled event's thresholds — the one legitimate reason a frozen plan
-- moves — and never deleted, because the record of what an approval committed
-- to outlives the event.
grant select, insert, update on table public.event_messaging_plans to service_role;

-- Issued, used, consumed and revoked. Never deleted: the record that a
-- credential existed outlives the credential.
grant select, insert, update on table public.person_access_tokens to service_role;

-- Raised and resolved. Never deleted — `REQ-one-flag-per-threshold` requires a
-- cleared flag to remain readable in history, and withholding `delete` is what
-- makes that a property of the grant rather than of the service layer being
-- careful.
grant select, insert, update on table public.nonresponse_flags to service_role;
