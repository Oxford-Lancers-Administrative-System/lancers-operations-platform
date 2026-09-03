-- LAN-214 — WP-onboarding-substrate, mission M-ONBOARDING-AND-INFORMATION-
-- COMPLETION, execution epoch E-1. This package's only migration; it is the
-- mission's migration owner, so everything the mission's four surface
-- packages (E-2, E-3) will need from the schema is here, forward-only.
--
-- Seven pieces, each named in the approved packet:
--
--   1. `claimed` joins `onboarding_item_status` (`REQ-item-states`).
--   2. `onboarding_items_waiver_is_justified` is unwound — the author stays
--      mandatory, the reason stops being (`REQ-reason-free-waive`).
--   3. `onboarding_item_types.verification_class` — R2-V's "a property of the
--      item, not a configuration knob" needs somewhere to live.
--   4. `onboarding_item_history` — append-only per-item history
--      (`REQ-item-history`).
--   5. `onboarding_activity_log` — the sectioned per-player log, one row per
--      ask and per answer (`REQ-activity-log`).
--   6. `onboarding_agreement_versions` / `onboarding_agreements` — the
--      versioned-agreement mechanism for the Code of Conduct and the photo
--      release. No object storage; the application has none.
--   7. `onboarding_chase_settings` — the three chase values W11 configures.
--      The escalation office is deliberately not a column here: it is read
--      from `public.roles` / `public.role_assignments`, exactly as W9 and
--      W11's own decisions require, and `messaging-scheduler.ts` already
--      resolves it (`currentPresidentIn`) — nothing to duplicate.
--   8. `bps_selections` — the BPS yes/no roster attribute (item-and-ask-
--      inventory.md, "Item 5 — BPS — leaves the checklist"; Brian settled
--      2026-09-01 that this mission adds it to the roster, not the checklist).
--   9. `person_fact_disputes` — the disputed-fact raise-and-resolve pair
--      `REQ-no-silent-overwrite` needs and Mission 5 deliberately did not
--      build (`REQ-no-disputed`, `person-record.ts`'s own module note).
--
-- ## What this migration deliberately does NOT do
--
-- It does not touch `person_access_token_purpose` or either index
-- `20260902090000_recruitment_forms_open_request.sql` added — whether
-- onboarding takes a purpose value is an open owner question (Q-1) and is not
-- this package's to settle. It does not touch `/a/[token]`, `person-
-- required.ts`'s tiers, or `person-record.ts`'s derived provenance — all three
-- are read, not written, by what follows. It does not seed the full twelve-
-- item, fifteen-ask inventory onto `onboarding_item_types`: that population is
-- product content a later, visual package writes once it builds the screens
-- that ask for it; this migration gives it a place — `verification_class` — to
-- say how each item behaves once it exists.
--
-- ## Enum values added to an existing type
--
-- `alter type ... add value` cannot be used in the same transaction as a
-- statement that uses the new value (docs/migration-runbook.md's own note).
-- It is therefore the very first statement below, standalone, and nothing
-- later in this file writes a `'claimed'` row.

alter type public.onboarding_item_status add value if not exists 'claimed';

-- ---------------------------------------------------------------------------
-- 1. Unwind onboarding_items_waiver_is_justified — REQ-reason-free-waive
-- ---------------------------------------------------------------------------
--
-- W6's own acceptance record: "the author stays mandatory while the reason
-- stops being." The shipped constraint demanded both; this keeps exactly the
-- author half.

alter table public.onboarding_items
  drop constraint onboarding_items_waiver_is_justified;

alter table public.onboarding_items
  add constraint onboarding_items_waiver_author_required check (
    status <> 'waived' or waived_by_person_id is not null);

comment on constraint onboarding_items_waiver_author_required on public.onboarding_items is
  'REQ-reason-free-waive. Supersedes onboarding_items_waiver_is_justified: the author is still required, the reason is not.';

-- ---------------------------------------------------------------------------
-- 2. Verification class — a property of the item, not a configuration knob
-- ---------------------------------------------------------------------------
--
-- R2-V / REQ-item-states: "a trust-class item completes on the player's word
-- carrying player-claimed provenance; a verify-class item shows claimed until
-- a named human confirms it." `direct` is every item that is not that —
-- completes in one step, by whoever's column of the item-and-ask inventory
-- names them (operator, player or derived). Closed at two values because the
-- inventory itself is frozen (`REQ-checklist-fixed`): a third verification
-- behaviour is a product decision, not data an operator enters.

create type public.onboarding_item_verification_class as enum ('direct', 'trust');

comment on type public.onboarding_item_verification_class is
  'REQ-item-states / R2-V. `trust`: the player''s word moves the item to claimed, awaiting a named human''s confirmation. `direct`: whoever completes it (operator, player or derived) moves it straight to complete. A property of the item type, never configured per season.';

alter table public.onboarding_item_types
  add column verification_class public.onboarding_item_verification_class not null default 'direct';

comment on column public.onboarding_item_types.verification_class is
  'REQ-item-states. Fixed per item, not a season setting — see the type comment.';

-- ---------------------------------------------------------------------------
-- 3. Per-item history — append-only, REQ-item-history
-- ---------------------------------------------------------------------------
--
-- `onboarding_items` carries current state only (W6's own grounding: "The
-- record can say an item is complete; it cannot say it was complete, reopened
-- in November and completed again"). This is the typed home that answers that.
--
-- Append-only is enforced twice: `from_status` is never rewritten because
-- nothing here is ever updated, and the grant below carries `insert` and
-- `select` only — no `update`, no `delete`. A caller that tried either would
-- be refused by the database itself, not by a service-layer convention that a
-- later bug could route around.
create type public.onboarding_actor_kind as enum ('operator', 'player', 'system');

comment on type public.onboarding_actor_kind is
  'Who moved an onboarding item or wrote an activity-log entry. `system` is the club''s own machinery (the welcome emitter, the scheduled chase) and never carries a person id.';

create table public.onboarding_item_history (
  id uuid primary key default gen_random_uuid(),
  onboarding_item_id uuid not null references public.onboarding_items (id) on delete restrict,
  season_membership_id uuid not null,

  from_status public.onboarding_item_status,
  to_status public.onboarding_item_status not null,

  actor_kind public.onboarding_actor_kind not null,
  actor_person_id uuid references public.people (id) on delete restrict,

  -- Free text, four-role visible only where the caller already restricts that
  -- — this table carries no restriction of its own, the same posture
  -- `season_membership_status_events.reason` already takes.
  reason text,

  occurred_at timestamptz not null default now(),

  constraint onboarding_item_history_membership_season
    foreign key (season_membership_id)
    references public.season_memberships (id) on update cascade,
  constraint onboarding_item_history_system_has_no_person check (
    actor_kind <> 'system' or actor_person_id is null),
  constraint onboarding_item_history_named_actor_has_a_person check (
    actor_kind = 'system' or actor_person_id is not null),
  -- A superseded value is retained, never overwritten — but a row that claims
  -- nothing changed is not a transition. `from_status is null` is the item's
  -- very first row, written at `generateOnboardingItems` time or the first
  -- real move; every later row's `from_status` must differ from its `to_status`.
  constraint onboarding_item_history_is_a_real_change check (
    from_status is null or from_status <> to_status)
);

create index onboarding_item_history_item_idx
  on public.onboarding_item_history (onboarding_item_id, occurred_at);
create index onboarding_item_history_membership_idx
  on public.onboarding_item_history (season_membership_id, occurred_at);

comment on table public.onboarding_item_history is
  'REQ-item-history. Append-only: every transition an item makes, who made it, when, and the state pair. Never updated or deleted — service_role holds insert and select only.';

-- ---------------------------------------------------------------------------
-- 4. The sectioned activity log — REQ-activity-log
-- ---------------------------------------------------------------------------
--
-- One row per ask, one row per answer — never a count (`OD7-log-by-section`,
-- and Brian's 2026-09-02 rejection of the counted draft: "I want to see the
-- individual items that come underneath, when it was asked versus when it was
-- received"). `section` is free text rather than a foreign key to
-- `onboarding_item_types`, because not every entry is about one item — the
-- welcome and the season's own consent ask are sections with no single item
-- behind them, and the checklist stays exactly the approved inventory
-- (`REQ-checklist-fixed`) with nothing here able to invent a new one by
-- inserting an unrecognised code.
--
-- Append-only for the same reason `onboarding_item_history` is: the grant
-- carries insert and select only.
create type public.onboarding_activity_kind as enum ('ask', 'answer');

comment on type public.onboarding_activity_kind is
  'REQ-activity-log. An ask the club sent, or an answer a player gave. Never a third kind — a resolution belongs to onboarding_item_history, not here.';

create table public.onboarding_activity_log (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,

  -- Groups the log the way the record reads it (`OD7-log-by-section`) — an
  -- item's own code where the entry is about one item, or a fixed word for an
  -- entry that is not ("welcome", "consent").
  section text not null,

  kind public.onboarding_activity_kind not null,

  -- "How" — free text rather than notification_channel, because an answer's
  -- "how" is the player's own link, not a channel this application sends on.
  -- Never blank: this is the one column REQ-activity-log names by name.
  channel text not null,

  -- "Who" — a person id where one exists (the operator who nudged, the
  -- player who answered); `actor_label` carries the club's own words where it
  -- does not (an automated chase has no person behind it). At least one of the
  -- two is required for an `answer` — a player always answered as themselves —
  -- and both may be absent for a system-originated `ask`.
  actor_person_id uuid references public.people (id) on delete restrict,
  actor_label text,

  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint onboarding_activity_log_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,
  constraint onboarding_activity_log_section_not_blank check (btrim(section) <> ''),
  constraint onboarding_activity_log_channel_not_blank check (btrim(channel) <> ''),
  constraint onboarding_activity_log_answer_names_someone check (
    kind <> 'answer'
    or actor_person_id is not null
    or btrim(coalesce(actor_label, '')) <> '')
);

create index onboarding_activity_log_membership_idx
  on public.onboarding_activity_log (season_membership_id, occurred_at);
create index onboarding_activity_log_section_idx
  on public.onboarding_activity_log (season_membership_id, section, occurred_at);

comment on table public.onboarding_activity_log is
  'REQ-activity-log. One row per ask and per answer, grouped by section — never a count. Append-only: service_role holds insert and select only.';
comment on column public.onboarding_activity_log.section is
  'Groups the log the way the record reads it — an item''s own code, or a fixed word ("welcome", "consent") for an entry with no single item behind it. Free text: this table cannot invent a checklist item (REQ-checklist-fixed).';

-- ---------------------------------------------------------------------------
-- 5. Versioned agreements — the Code of Conduct and the photo release
-- ---------------------------------------------------------------------------
--
-- `nonblocking_unknowns`: "Build and walk every screen with labelled
-- placeholder text in a real versioned slot. Do not invent club policy." No
-- object storage — the application has none, and none is needed: an agreement
-- is "I read version N and confirmed", dated, never a signature image.
create type public.onboarding_agreement_type as enum ('code_of_conduct', 'photo_release');

comment on type public.onboarding_agreement_type is
  'The two documents the item-and-ask inventory names as read-then-agree pages. Closed: a third document is a product decision, not data.';

create table public.onboarding_agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_type public.onboarding_agreement_type not null,
  version_label text not null,
  -- Labelled placeholder text in a real versioned slot — LAN-213 is the
  -- owner gate that replaces this with Clint's actual wording. Never invented
  -- club policy in the meantime.
  body text not null,
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint onboarding_agreement_versions_one_label_per_type
    unique (agreement_type, version_label),
  constraint onboarding_agreement_versions_label_not_blank check (btrim(version_label) <> ''),
  constraint onboarding_agreement_versions_body_not_blank check (btrim(body) <> '')
);

create index onboarding_agreement_versions_type_idx
  on public.onboarding_agreement_versions (agreement_type, effective_from desc);

comment on table public.onboarding_agreement_versions is
  'The versioned slot LAN-213''s real wording drops into. Seeded below with a labelled placeholder per type — never invented club policy.';

-- Ahead of onboarding_agreements below, which composite-references it: a
-- version's own foreign key target has to exist before the table that points
-- at it is created.
alter table public.onboarding_agreement_versions
  add constraint onboarding_agreement_versions_id_type_key unique (id, agreement_type);

create table public.onboarding_agreements (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,
  season_id uuid not null references public.seasons (id) on delete restrict,
  agreement_type public.onboarding_agreement_type not null,
  agreement_version_id uuid not null references public.onboarding_agreement_versions (id) on delete restrict,
  agreed_at timestamptz not null default now(),

  -- Seasonal — asked of everyone every season (item-and-ask-inventory.md,
  -- item 11). One agreement per person per season per document; a fresh
  -- season is a fresh row, never an update to this one.
  constraint onboarding_agreements_one_per_person_season_type
    unique (person_id, season_id, agreement_type),
  constraint onboarding_agreements_version_is_the_right_type
    foreign key (agreement_version_id, agreement_type)
    references public.onboarding_agreement_versions (id, agreement_type) on update cascade
);

create index onboarding_agreements_person_idx on public.onboarding_agreements (person_id, season_id);

comment on table public.onboarding_agreements is
  'Version, moment and person — the whole of what "agreed" means here. Never updated: agreeing again in a later season is a new row, not a changed date.';

-- One placeholder version per document, so the mechanism is real from the
-- first season it is used in rather than waiting on a first insert nobody
-- owns yet.
insert into public.onboarding_agreement_versions (agreement_type, version_label, body) values
  ('code_of_conduct', 'placeholder-v1',
   'Placeholder — the Code of Conduct''s real wording is Clint''s, tracked as LAN-213. This is a labelled placeholder in a real versioned slot, not club policy.'),
  ('photo_release', 'placeholder-v1',
   'Placeholder — the photo release''s real wording is Clint''s, tracked as LAN-213. This is a labelled placeholder in a real versioned slot, not club policy.');

-- ---------------------------------------------------------------------------
-- 6. Onboarding's chase configuration — W11
-- ---------------------------------------------------------------------------
--
-- The three values W11 configures, and only those three: how long after
-- joining the first chase goes, how many times it asks, and how far apart.
-- There is deliberately no "give up after" column (`OD7-cadence-is-the-
-- config`: "'Give up after' is not a good number" — it is count × interval)
-- and no quiet-hours column (Brian, 2026-09-02, superseding that half of
-- `T11-suppression`) and no per-item owner and no escalation-office column —
-- see this file's header.
--
-- A singleton, on the `messaging_schedules` idiom this table is a smaller
-- copy of: the row exists from this migration, and the application only ever
-- updates it — no insert, no delete, and `id boolean` with `check (id)` makes
-- a second row structurally impossible rather than merely unwritten.
create table public.onboarding_chase_settings (
  id boolean primary key default true,

  -- Hours from the membership joining onboarding. Long enough that the
  -- welcome carrying the link lands first.
  first_chase_after_hours smallint not null,

  -- Spent only on delivery (`T11-cap-delivered`) — never on a failure. Zero is
  -- legal and means no automated chase at all (delegated to the Mission Lead,
  -- settled `true`): the welcome still goes, and every later ask is a human
  -- nudge from the queue.
  chase_count smallint not null,

  -- Whole days between one chase and the next.
  chase_interval_days smallint not null,

  updated_at timestamptz not null default now(),

  constraint onboarding_chase_settings_singleton check (id),
  constraint onboarding_chase_settings_first_chase_is_sane check (
    first_chase_after_hours between 0 and 2160),
  constraint onboarding_chase_settings_count_is_sane check (chase_count between 0 and 50),
  constraint onboarding_chase_settings_interval_is_sane check (
    chase_interval_days between 1 and 90)
);

comment on table public.onboarding_chase_settings is
  'W11. Exactly one row, seeded below. How many times, how often, and the first delay — nothing else. The escalation office is read from public.roles / public.role_assignments (messaging-scheduler.ts''s currentPresidentIn), never a column here; there is no "give up after" column by design (OD7-cadence-is-the-config).';
comment on column public.onboarding_chase_settings.chase_count is
  'A cap of zero is legal (delegated to the Mission Lead, settled): no automated chase at all. Spent only on delivered messages, never a failure (T11-cap-delivered).';

insert into public.onboarding_chase_settings
  (id, first_chase_after_hours, chase_count, chase_interval_days)
values (true, 48, 4, 3);

-- ---------------------------------------------------------------------------
-- 7. BPS — a plain yes/no roster attribute, not a checklist item
-- ---------------------------------------------------------------------------
--
-- item-and-ask-inventory.md, "Item 5 — BPS — leaves the checklist": a
-- coaching selection decision that would show outstanding against players
-- never in the scheme on a checklist that regenerates for everyone every
-- season. Brian, 2026-09-01: "it's not a fucking mission change. We are going
-- to add it here into the roster for the BPS column." One row per membership
-- per season — the same seasonal-attribute idiom `blues_awards` and
-- `formalwear_records` already use (`20260828120000_person_substrate.sql`).
create table public.bps_selections (
  id uuid primary key default gen_random_uuid(),
  season_membership_id uuid not null,
  season_id uuid not null,
  is_selected boolean not null default false,

  recorded_by_person_id uuid references public.people (id) on delete restrict,
  updated_at timestamptz not null default now(),

  constraint bps_selections_one_per_membership unique (season_membership_id),
  constraint bps_selections_membership_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade
);

create index bps_selections_season_idx on public.bps_selections (season_id);

comment on table public.bps_selections is
  'Item 5 of the item-and-ask inventory. A roster attribute, not a checklist item — Brian, 2026-09-01. Rotated on attendance by coaching selection; never gates and is never chased.';

-- ---------------------------------------------------------------------------
-- 8. Disputed facts — the raise-and-resolve pair, REQ-no-silent-overwrite
-- ---------------------------------------------------------------------------
--
-- Mission 5 shipped none of this on purpose (`person-record.ts`'s own module
-- note, `REQ-no-disputed`/`REQ-no-verification-mark`): "There is no
-- contested-value field, no verification-mark field and no confidence class
-- anywhere below — not struck out, never added." W5 raises what W7 settles,
-- and this is the seam that fills.
--
-- Scoped to exactly the seven `people` columns `person-write.ts`'s
-- `updatePersonField` already overwrites in place — `given_name`,
-- `family_name`, `college`, `matriculation_year`, `expected_graduation_year`,
-- `degree_field`, `date_of_birth`. Contact values are deliberately excluded:
-- `supersedeContactPoint` already dates the old value and inserts a new one
-- rather than overwriting, so `REQ-no-silent-overwrite`'s problem does not
-- exist there — a dispute table over a field that never silently overwrites
-- would be solving nothing.
create type public.person_fact_dispute_status as enum (
  'open',
  'resolved_kept_club',
  'resolved_took_player'
);

comment on type public.person_fact_dispute_status is
  'REQ-no-silent-overwrite. open: raised, awaiting a four-role decision. The two resolved values name which value stood; the other is retained on this same row, never deleted.';

create table public.person_fact_disputes (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete restrict,

  -- One of person-write.ts's PersonFieldUpdate['field'] values. Not an enum:
  -- that union is TypeScript's to own, and a schema copy of it would be a
  -- second place the set could drift from the one `updatePersonField` actually
  -- accepts.
  field text not null,

  -- Both values are kept — the losing one is retained, never deleted
  -- (W7's own locked decision). `club_value` is a snapshot taken when the
  -- dispute was raised, not a live read: what the club believed at the moment
  -- of conflict is what an operator is choosing between.
  club_value text,
  player_value text not null,

  raised_by_person_id uuid references public.people (id) on delete restrict,
  raised_at timestamptz not null default now(),

  status public.person_fact_dispute_status not null default 'open',

  -- Four-role only, never in a report verbatim — the same posture
  -- `onboarding_items.waived_reason` and `season_membership_status_events.reason`
  -- already take. Enforced by the caller, same as those two; this table
  -- carries no restriction of its own.
  resolution_note text,
  resolved_by_person_id uuid references public.people (id) on delete restrict,
  resolved_at timestamptz,

  constraint person_fact_disputes_field_not_blank check (btrim(field) <> ''),
  constraint person_fact_disputes_player_value_not_blank check (btrim(player_value) <> ''),
  constraint person_fact_disputes_resolution_is_dated check (
    (status = 'open') = (resolved_at is null)),
  constraint person_fact_disputes_resolution_names_resolver check (
    status = 'open' or resolved_by_person_id is not null)
);

-- "The newer answer supersedes the waiting one; never more than one pending
-- answer" — W7's own exceptions-and-recovery note. Enforced structurally: a
-- second open dispute on the same (person, field) cannot exist, so raising one
-- while another is open has to update the open row rather than insert beside
-- it.
create unique index person_fact_disputes_one_open_per_field
  on public.person_fact_disputes (person_id, field) where status = 'open';

create index person_fact_disputes_person_idx on public.person_fact_disputes (person_id);

comment on table public.person_fact_disputes is
  'REQ-no-silent-overwrite. Raised by W5 when a player''s answer differs from an operator-recorded value; settled by W7. The losing value is retained on this row, never deleted.';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, unchanged and no weaker: RLS on, zero policies, nothing
-- granted to a browser-facing role, only the narrow server need to
-- `service_role`.

alter table public.onboarding_item_history enable row level security;
alter table public.onboarding_activity_log enable row level security;
alter table public.onboarding_agreement_versions enable row level security;
alter table public.onboarding_agreements enable row level security;
alter table public.onboarding_chase_settings enable row level security;
alter table public.bps_selections enable row level security;
alter table public.person_fact_disputes enable row level security;

revoke all on table
  public.onboarding_item_history,
  public.onboarding_activity_log,
  public.onboarding_agreement_versions,
  public.onboarding_agreements,
  public.onboarding_chase_settings,
  public.bps_selections,
  public.person_fact_disputes
  from anon, authenticated, service_role;

-- Append-only: insert and select, never update or delete. The database
-- refuses the second pair outright — REQ-item-history's own acceptance
-- criterion is proved by attempting one and observing the refusal.
grant select, insert on table public.onboarding_item_history to service_role;
grant select, insert on table public.onboarding_activity_log to service_role;

-- Versions are added, never edited — the same "reference data added, never
-- edited" idiom `recruitment_cycle_steps` uses for enabled/offset_hours, one
-- step further: not even updated, because a version that could change under
-- an agreement already recorded against it would not be a version. Agreements
-- are written once per (person, season, type) and never corrected in place —
-- a mistaken agreement is a matter for `resolution_note`-shaped human
-- process, not a schema update path.
grant select, insert on table public.onboarding_agreement_versions to service_role;
grant select, insert on table public.onboarding_agreements to service_role;

-- The row exists from this migration; the application only ever updates it.
grant select, update on table public.onboarding_chase_settings to service_role;

-- One row per membership, corrected in place as the season goes on. No
-- `delete`: a player never in the scheme this season is `is_selected = false`,
-- never an absent row — the same "correct in place, never remove" posture
-- `blues_awards` and `formalwear_records` take, narrowed by one privilege
-- because nothing here ever needs to un-record a row rather than update it.
grant select, insert, update on table public.bps_selections to service_role;

-- Raised, then resolved in place — a dispute's row is updated once, from
-- `open` to one of the two resolved values, and never deleted: the losing
-- value has to stay readable on the very row that decided against it.
grant select, insert, update on table public.person_fact_disputes to service_role;
