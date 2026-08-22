-- LAN-151 — the Events & Calendar target-state schema.
--
-- Work package WP-event-model of mission M-EVENTS-CALENDAR-TARGET-STATE. This
-- is deliberately ONE migration rather than four: the mission's later work
-- packages read this storage but add none of their own, so Brian applies one
-- migration to hosted Supabase by hand instead of four.
--
-- What it does, in the order it does it:
--
--   1. lists every `other`-typed event by name and date, for Brian's one-time
--      reassignment (Brian, 2026-08-22, mission question Q-2);
--   2. drops the objects that depend on the two enums;
--   3. applies the owner-approved legacy mapping to the data;
--   4. narrows `event_status` from eight values to three and `event_type` from
--      ten to seven;
--   5. rebuilds the event record around the approved fields;
--   6. adds the storage the rest of the mission reads;
--   7. rebuilds the four exception views.
--
-- The approved decisions this implements, so a reader does not have to hold the
-- brief open: three stored statuses `draft` · `approved` · `cancelled`, and
-- `occurred` derived rather than asserted (D30); seven event types (D12); no
-- opponent field (D14); required equipment as its own field (D17); description
-- as a field (D18); in-person-or-online as a property with the venue field
-- taking an address or a destination accordingly (D20, D21); "Response
-- requested" removed (D23); the online event's joining URL never public
-- (REQ-no-joining-url); per-type templates with a default audience and default
-- questions (D40-D42, D47); a hold on unsent messages when an amendment is
-- saved (REQ-amend-hold); the club link as a signed, hashed token (D2, D81);
-- and the per-type chase thresholds stored here for Mission 4 to consume
-- (D75, D77).
--
-- Invariant E3 -- at most one event per alternative group reaching approval --
-- is retired with its index; the mission carries no alternative-group
-- machinery. Invariant E5 -- occurrence is an assertion somebody makes -- is
-- retired entirely, with its constraint and both of its columns. Invariant E6
-- goes with `solicits_response`.

-- ---------------------------------------------------------------------------
-- 1. The `other`-typed rows, listed for Brian
-- ---------------------------------------------------------------------------

-- These rows have no correct destination. `other` was a catch-all and the
-- approved seven-type model has no equivalent, so they land on `meeting` and a
-- human reassigns each one afterwards. Listing them here -- during migration
-- verification -- is the whole mechanism: there is no actor journey for this
-- and it happens exactly once. See `docs/migration-runbook.md`.
do $$
declare
  listed record;
  total integer;
begin
  select count(*) into total from public.events where event_type = 'other';

  if total = 0 then
    raise notice 'LAN-151: no events are typed `other`; nothing to reassign.';
  else
    raise notice '=== LAN-151: % event(s) typed `other` become `meeting`. Reassign each by hand. ===', total;
    for listed in
      select name, scheduled_on, status
        from public.events
       where event_type = 'other'
       order by scheduled_on nulls last, name
    loop
      raise notice 'LAN-151 reassign: % | % | %',
        coalesce(listed.scheduled_on::text, 'no date'), listed.status, listed.name;
    end loop;
    raise notice '=== LAN-151: end of the `other` reassignment list. ===';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Drop everything that depends on the two enums
-- ---------------------------------------------------------------------------

-- The views are dropped dependents-first. They are rebuilt in section 7 against
-- the new vocabulary, because every one of them is written in terms of a status
-- that is about to stop existing.
drop view if exists public.nonresponse_queue;
drop view if exists public.uninvited_audience_members;
drop view if exists public.rsvp_attendance_mismatches;
drop view if exists public.invitation_response_state;

-- The composite foreign keys that denormalise the event's status onto
-- invitations and attendance. They are re-added in section 5 against the
-- narrowed vocabulary; dropping them first is also what lets the three copies
-- of the status be remapped independently in section 3.
alter table public.invitations
  drop constraint invitations_event_state_is_current,
  drop constraint invitations_require_an_approved_event,
  drop constraint invitations_expire_only_when_asked;

alter table public.attendance_records
  drop constraint attendance_records_event_state_is_current,
  drop constraint attendance_records_require_an_occurred_event;

alter table public.events
  drop constraint events_id_status_key,
  drop constraint events_id_status_solicitation_key,
  drop constraint events_approval_requires_date_and_audience,
  drop constraint events_outcome_is_asserted,
  drop constraint events_no_obligation_without_solicitation,
  drop constraint events_negative_decisions_are_explained,
  drop constraint events_fixture_side_needs_a_fixture,
  drop constraint events_week_number_valid,
  -- Not retired -- rebuilt in section 5. A check constraint naming an enum
  -- value binds to the type it was written against, so it has to be dropped
  -- before the type is rebuilt and re-added against the new one.
  drop constraint events_headcount_is_recruitment_only;

-- Invariant E3, retired. "At most one event in an alternative group may ever
-- reach approval" was machinery for candidate slots the club no longer models:
-- an unconfirmed event is a draft, and there is no alternative-group behaviour
-- anywhere in the approved target state.
drop index if exists public.events_one_approved_per_alternative_group;

drop index if exists public.events_status_idx;

-- ---------------------------------------------------------------------------
-- 3. What has to be said before the old vocabulary stops existing
-- ---------------------------------------------------------------------------

-- `events_negative_decisions_are_explained` survives for `cancelled`, and every
-- row arriving there from `not_held` carries no reason at all -- the old
-- constraint never asked one of it. Supply the only honest one: the migration
-- did this, and here is the state it came from. Rows that already explain
-- themselves keep their own words.
--
-- This has to happen while `not_held` is still a value, which is why it is here
-- rather than beside the constraint it satisfies.
update public.events
   set decision_reason =
         'Recorded as not held before the occurrence assertion was retired (LAN-151). '
         || 'No cancellation notice was sent.'
 where status = 'not_held'
   and btrim(coalesce(decision_reason, '')) = '';

-- ---------------------------------------------------------------------------
-- 4. Narrow the two enums, applying the owner-approved legacy mapping
-- ---------------------------------------------------------------------------

-- PostgreSQL cannot remove a value from an enum, so each type is rebuilt beside
-- its predecessor and every column moved across. The mapping rides on the cast
-- rather than running as an `update` first, for two reasons: the new values do
-- not exist in the old type, so an `update` could not name them; and a `case`
-- inside the cast is total by construction -- a retired value nobody mapped
-- fails the cast rather than arriving silently in the new world.
--
-- The mapping, approved 2026-08-18. Every clause is a decision, not a
-- convenience:
--
--   * `pending_approval`, `withdrawn`, `rejected` -> `draft`. None of the three
--     survived contact with the club. Nothing was ever submitted for approval
--     (Brian removed that step on 2026-08-12); "withdrawn" means it never
--     became an event, which is what a deleted draft now means; and a rejected
--     candidate is an event that did not happen, which is a draft.
--   * `occurred` -> `approved`. The event is exactly what it always was; only
--     the assertion about it is gone, and the passage of its date now says the
--     same thing without anybody typing it.
--   * `not_held` -> `cancelled`, silently. "Silently" is about people, not
--     rows: nobody is notified, because the migration is not the club calling
--     an event off.

alter type public.event_status rename to event_status_retired;

create type public.event_status as enum ('draft', 'approved', 'cancelled');

alter table public.events alter column status drop default;
alter table public.events
  alter column status type public.event_status
  using (case status::text
           when 'pending_approval' then 'draft'
           when 'withdrawn' then 'draft'
           when 'rejected' then 'draft'
           when 'occurred' then 'approved'
           when 'not_held' then 'cancelled'
           else status::text
         end)::public.event_status;
alter table public.events alter column status set default 'draft';

-- The denormalised copies, by the same rule. Both can only ever have held
-- post-approval statuses, so the two arms they need are the two that apply.
alter table public.invitations
  alter column event_status type public.event_status
  using (case event_status::text
           when 'occurred' then 'approved'
           when 'not_held' then 'cancelled'
           else event_status::text
         end)::public.event_status;
alter table public.attendance_records
  alter column event_status type public.event_status
  using (case event_status::text
           when 'occurred' then 'approved'
           else event_status::text
         end)::public.event_status;

drop type public.event_status_retired;

alter type public.event_type rename to event_type_retired;

-- D12, in the brief's own order. `game` replaces `fixture` and `varsity`: the
-- club plays a game, and who it is against is in the name (D14).
create type public.event_type as enum (
  'practice',
  'strength_and_conditioning',
  'chalk',
  'game',
  'social',
  'recruitment',
  'meeting'
);

-- `camp` -> practice; `fixture` and `varsity` -> game; `other` -> meeting.
-- A camp is a practice that runs for longer, a varsity match is a game, and
-- `other` had no meaning to preserve -- section 1 listed those rows so a human
-- can put each one where it belongs.
alter table public.events
  alter column event_type type public.event_type
  using (case event_type::text
           when 'camp' then 'practice'
           when 'fixture' then 'game'
           when 'varsity' then 'game'
           when 'other' then 'meeting'
           else event_type::text
         end)::public.event_type;
alter table public.event_series
  alter column event_type type public.event_type
  using (case event_type::text
           when 'camp' then 'practice'
           when 'fixture' then 'game'
           when 'varsity' then 'game'
           when 'other' then 'meeting'
           else event_type::text
         end)::public.event_type;

drop type public.event_type_retired;

-- `fixture_side` went with the opponent field it described. Dropped after the
-- column that used it, in section 5.

-- ---------------------------------------------------------------------------
-- 5. The event record, as REQ-event-record fixes it
-- ---------------------------------------------------------------------------

-- In person or online, as a property of the event (D20). The venue field then
-- takes an address or a destination accordingly (D21) -- one column, because
-- an event is one or the other and two columns would let it be both.
create type public.event_delivery_mode as enum ('in_person', 'online');

alter table public.events
  -- D18: free text, absorbing everything that has no home of its own.
  add column description text,
  -- D17: its own field, so "bring a gumshield" is not buried in a paragraph.
  add column required_equipment text,
  add column delivery_mode public.event_delivery_mode not null default 'in_person',
  -- REQ-no-joining-url: never public, never in a feed, never in a payload
  -- behind one. The column is here; keeping it out of the public projections is
  -- the service layer's job and the feed's, and both are later work packages.
  add column joining_url text;

alter table public.events
  -- D14. There is no opponent field, and there never was a real second one:
  -- the club writes "vs Bath" in the name, and a name change is not material.
  drop column opponent,
  drop column side,
  -- D23. "Response requested" is not a real concept -- mandatory or optional
  -- already carries it, and everyone sent an event is expected to answer. With
  -- it goes invariant E6, which existed only to keep it coherent.
  drop column solicits_response,
  -- Invariant E5, retired with the assertion it recorded. The audit log keeps
  -- the history: `event.marked_occurred` and `event.marked_not_held` rows in
  -- `audit_events` still name who asserted what, and when.
  drop column outcome_recorded_at,
  drop column outcome_recorded_by_person_id;

drop type public.fixture_side;

alter table public.invitations drop column solicits_response;

alter table public.events
  -- Restored: the composite-foreign-key target invitations and attendance hang
  -- off. The three-column variant went with `solicits_response`.
  add constraint events_id_status_key unique (id, status),

  -- Invariant E1, restated over three statuses. `draft` is the only status that
  -- may be incomplete; `approved` and `cancelled` both require the date, the
  -- approver and the confirmed audience, because a cancelled event is one that
  -- was approved and then called off (D29 -- an abandoned draft is deleted, not
  -- cancelled).
  add constraint events_approval_requires_date_and_audience check (
    status = 'draft'
    or (
      scheduled_on is not null
      and approved_at is not null
      and approved_by_person_id is not null
      and audience_confirmed_at is not null
      and audience_confirmed_by_person_id is not null
    )),

  -- D76: a cancellation captures an internal reason for the audit record. D59:
  -- recipients never see it. `cancelled` is now the only status that has to
  -- explain itself, because it is the only negative one left.
  add constraint events_negative_decisions_are_explained check (
    status <> 'cancelled' or btrim(coalesce(decision_reason, '')) <> ''),

  -- REQ-migration's reconciliation of `events_week_number_valid` with D85's
  -- named vacation segments.
  --
  -- The delegated decision (Mission Lead delegation: "whether vacation
  -- coordinates are stored or derived, and whether week_number's check
  -- constraint widens") is answered here: vacation coordinates are DERIVED and
  -- `week_number` does NOT widen.
  --
  -- D85 says a vacation belongs to neither adjacent term. `public.terms`
  -- already stores every term's real dates, so the vacations are exactly the
  -- gaps between them and their week numbers are arithmetic -- storing them
  -- would be a second coordinate system that can disagree with the first, and
  -- REQ-three-arrangements forbids two answers to "when is this event".
  --
  -- So `week_number` stays what it always was, a TERM coordinate in -1..8, and
  -- the constraint now says so: a row carrying a week must name the term the
  -- week belongs to. An event in a vacation carries neither, exactly as an
  -- out-of-term event does today.
  add constraint events_week_number_valid check (
    week_number is null
    or (term_id is not null and week_number between -1 and 8)),

  -- REQ-no-joining-url's other half: an in-person event has no joining URL to
  -- leak, and the database is where that stays true.
  add constraint events_joining_url_is_for_online_events check (
    joining_url is null or delivery_mode = 'online'),

  -- Register D3, unchanged and rewritten only because the enum it names was
  -- rebuilt: unregistered turnout is countable at a recruitment event without
  -- fabricating person records, and nowhere else.
  add constraint events_headcount_is_recruitment_only check (
    aggregate_headcount is null or event_type = 'recruitment');

create index events_status_idx on public.events (status);
-- The derived-occurrence read path: "approved events whose date has passed".
create index events_status_date_idx on public.events (status, scheduled_on);

comment on column public.events.status is
  'Three stored statuses and no others (D12, D30). `occurred` is DERIVED -- the date passed and the event was not cancelled -- and is never stored, never asserted and never written here.';
comment on column public.events.delivery_mode is
  'D20. In person or online. `venue` holds an address when in person and a destination when online (D21); `joining_url` is the online event''s link and is never public.';
comment on column public.events.joining_url is
  'REQ-no-joining-url: never appears on a public surface, in a subscription feed, or in any payload behind one. How an invited person receives it is deliberately unsolved.';
comment on column public.events.venue is
  'An address when `delivery_mode` is `in_person`, a destination when it is `online` (D21). `TBD` stays a legitimate value on a draft.';
comment on column public.events.week_number is
  'A TERM coordinate, -1..8, and null outside term. Vacation segments (D85) are derived from `public.terms` rather than stored, so there is one answer to when an event is.';
comment on column public.events.required_equipment is 'D17.';
comment on column public.events.description is 'D18.';

alter table public.invitations
  add constraint invitations_event_state_is_current
    foreign key (event_id, event_status)
    references public.events (id, status) on update cascade,
  -- Invariant P1, over the narrowed vocabulary: an invitation still requires an
  -- approved event, and still survives the event being called off (P4, D57).
  add constraint invitations_require_an_approved_event check (
    event_status in ('approved', 'cancelled'));

alter table public.attendance_records
  add constraint attendance_records_event_state_is_current
    foreign key (event_id, event_status)
    references public.events (id, status) on update cascade,
  -- Invariant P5, restated. Attendance requires an APPROVED event: a draft was
  -- never held and a cancelled one did not happen.
  --
  -- The other half of P5 -- that the event's date has passed -- cannot be a
  -- check constraint, because a check cannot read the clock. It is a service
  -- rule, stated once as the derived-occurrence rule and enforced there.
  add constraint attendance_records_require_an_approved_event check (
    event_status = 'approved');

comment on table public.attendance_records is
  'Invariant P6: attendance may exist without an invitation or an RSVP -- walk-ups happen. There is deliberately no foreign key to either, and an RSVP never creates an attendance record. The event must be approved; whether its date has passed is a service rule, because a check constraint cannot read the clock.';

-- D42, D66: a question that arrived from the type's template is marked as such,
-- so the form can say where it came from and let an operator remove it for this
-- one event without touching the template.
alter table public.event_questions
  add column from_template boolean not null default false;

comment on column public.event_questions.from_template is
  'D42. True when this question arrived from the event type''s template. Removable per event; removing it here never touches the template.';

-- ---------------------------------------------------------------------------
-- 6. The storage the rest of the mission reads
-- ---------------------------------------------------------------------------
--
-- Every table below is storage only. This work package establishes it; the
-- behaviour that reads and writes it belongs to the mission's later packages,
-- and none of it is wired to a surface here.

-- --- Per-type configuration -------------------------------------------------

-- D75 and D77's chase thresholds, as event-type configuration.
--
-- The seam is precise and both sides of it are recorded. Mission 2 STORES these
-- values; Mission 4 owns the chase itself -- when a reminder goes, what
-- escalation consists of, and recomputing the threshold when an event moves
-- (OD-1/Q6). They are deliberately NOT on the template: W8 removed them from it
-- on 2026-08-21, because a template is what an event arrives looking like and a
-- chase threshold is not part of what an event is.
create table public.event_type_settings (
  event_type public.event_type primary key,

  -- Days before the event at which an unanswered invitation becomes an
  -- exception the club chases. Never a cutoff -- a player may answer late and
  -- may change their answer until the event starts.
  chase_threshold_days smallint not null,

  updated_at timestamptz not null default now(),

  constraint event_type_settings_threshold_is_sane check (
    chase_threshold_days between 0 and 60)
);

-- D75, D77: two days for the routine events, seven for a game, five for a
-- social. Every one of the seven types has a row, so a type can never be
-- missing a threshold.
insert into public.event_type_settings (event_type, chase_threshold_days) values
  ('practice', 2),
  ('strength_and_conditioning', 2),
  ('chalk', 2),
  ('game', 7),
  ('social', 5),
  ('recruitment', 2),
  ('meeting', 2);

comment on table public.event_type_settings is
  'Per-type configuration this mission stores and Mission 4 consumes (D75, D77). One row per event type, created here and never created or deleted by an operator. Who changed a value is in `audit_events`, which is the club''s audit trail for every entity -- a denormalised actor column here would be a weaker second copy of it.';
comment on column public.event_type_settings.chase_threshold_days is
  'D75, D77. When an unanswered invitation becomes an exception the club chases. Mission 4 owns the chasing; this is only where the number lives.';

-- --- Event-type templates ---------------------------------------------------

-- The five standing groups an audience may be built from: the four derived
-- groups LAN-77 shipped (D43), plus the recruits group that exists on the
-- Recruitment type alone (D46). A closed vocabulary, because D43 is explicit
-- that there is no further roster-derived group and no saved custom group.
create type public.audience_group as enum (
  'everyone_active',
  'active_players',
  'active_coaches',
  'active_committee',
  'recruits'
);

-- D40: one template per type, seven types, none created and none deleted.
-- Every field is optional -- "the template does not mean that everything needs
-- to be changed ... You can have some details not decided" (Brian, 2026-08-21)
-- -- so every column is nullable and a null simply arrives empty on a new
-- event.
--
-- There is deliberately no default name, no default date and no default start
-- time. A type recurs; a particular Wednesday does not. What a type can
-- usefully say about time is how long it runs (D78), which is
-- `default_duration_minutes`.
create table public.event_templates (
  event_type public.event_type primary key,

  default_venue text,
  default_delivery_mode public.event_delivery_mode,
  default_duration_minutes smallint,
  default_description text,
  default_required_equipment text,
  -- Tri-state on purpose: null is "the template does not say", which is not the
  -- same as "optional".
  default_is_mandatory boolean,

  updated_at timestamptz not null default now(),

  constraint event_templates_duration_is_sane check (
    default_duration_minutes is null
    or default_duration_minutes between 5 and 1440),
  constraint event_templates_duration_is_five_minute check (
    default_duration_minutes is null or default_duration_minutes % 5 = 0)
);

-- The seven rows exist from the start, every field undecided. An operator edits
-- one; nobody creates or deletes one.
insert into public.event_templates (event_type)
select unnest(enum_range(null::public.event_type));

comment on table public.event_templates is
  'D40-D42, D47. One template per event type, seven of them, created here and never created or deleted by an operator. Every field is optional. Template values flow into a draft field by field and only into fields nobody has edited; approval freezes them (D41, refined 2026-08-21).';
comment on column public.event_templates.default_duration_minutes is
  'D78. A duration, not a start time -- entering a start on the event fills the end from it. A type recurs; a particular Wednesday does not.';

-- D42, D47: the template's default questions, arriving with any event created
-- from it and removable per event. Same shape as `event_questions`, because a
-- default question becomes an event question unchanged.
create table public.event_template_questions (
  id uuid primary key default gen_random_uuid(),
  event_type public.event_type not null
    references public.event_templates (event_type) on delete cascade,

  prompt text not null,
  answer_type public.question_answer_type not null default 'text',
  choices text[],
  applies_to_capacities public.invitation_capacity[] not null
    default '{player,coach,committee,guest,recruit}'::public.invitation_capacity[],
  is_required boolean not null default false,
  sort_order smallint not null default 0,

  created_at timestamptz not null default now(),

  constraint event_template_questions_unique_per_type unique (event_type, prompt),
  constraint event_template_questions_prompt_not_blank check (btrim(prompt) <> ''),
  constraint event_template_questions_choices_match_type check (
    (answer_type = 'choice' and choices is not null and cardinality(choices) > 1)
    or (answer_type <> 'choice' and choices is null)),
  constraint event_template_questions_applies_to_someone check (
    cardinality(applies_to_capacities) > 0)
);

create index event_template_questions_type_idx
  on public.event_template_questions (event_type, sort_order);

comment on table public.event_template_questions is
  'D42. The questions a type''s template attaches to every event created from it. Copied onto the event at creation and marked `from_template`, so removing one from an event never touches the template.';

-- D47: a type's template supplies a DEFAULT AUDIENCE, which arrives with the
-- event already set, visible and editable, so the approver checks rather than
-- builds. This reverses LAN-77's shipped "audience begins empty", which the
-- Events brief records as a correction in its section 6.
--
-- Stored as the groups, not as people. A group is a way of selecting people,
-- and the resolved list is `event_audience_members` -- which is still the
-- explicit list the approver confirms, and still what an approved event holds.
create table public.event_template_audience_groups (
  event_type public.event_type not null
    references public.event_templates (event_type) on delete cascade,
  audience_group public.audience_group not null,

  constraint event_template_audience_groups_key primary key (event_type, audience_group),

  -- D46: the recruits group exists on the Recruitment type alone.
  constraint event_template_audience_groups_recruits_are_recruitment_only check (
    audience_group <> 'recruits' or event_type = 'recruitment')
);

comment on table public.event_template_audience_groups is
  'D47, D43, D46. The default audience a type''s template supplies, as groups. It arrives with a new event already set and is editable; the audience an approver confirms is still stored as the explicit resolved list in `event_audience_members`.';

-- --- The club link ----------------------------------------------------------

-- D2, D81. An operator issues a club link and shares it; anyone holding it sees
-- the participation table without the delivery column. Coaches hold no operator
-- account, which is why the tier exists at all.
--
-- A separate table from `rsvp_access_tokens` on purpose. That token is bound to
-- ONE invitation and answers "who are you"; this one is bound to one EVENT and
-- answers "may you see this event's participation". They differ in subject, in
-- lifetime and in what they permit, and one table holding both would be a
-- single bug away from an RSVP link reading a squad list.
--
-- Not privacy-blocking (D81) -- participation is ordinary team information --
-- but signed rather than guessable, and stored only as a digest, exactly as
-- `rsvp_access_tokens` is. Q2, the club link's expiry, rotation and revocation,
-- is a nonblocking unknown Brian chose to settle by testing; `revoked_at` is
-- here so that settling it later is additive.
create table public.club_link_tokens (
  id uuid primary key default gen_random_uuid(),

  -- `restrict` rather than `cascade`, exactly as `rsvp_access_tokens` takes it
  -- and for the same reason: a token vanishing quietly with its event would
  -- erase the record that a link was ever issued. Only a draft may be deleted
  -- (D29) and a draft has no participation table to share, so this refuses
  -- nothing the club actually does.
  event_id uuid not null references public.events (id) on delete restrict,

  token_hash text not null,

  issued_at timestamptz not null default now(),
  issued_by_person_id uuid references public.people (id) on delete restrict,

  revoked_at timestamptz,
  revoked_reason text,

  last_used_at timestamptz,
  use_count integer not null default 0,

  constraint club_link_tokens_hash_unique unique (token_hash),
  -- The same shape check `rsvp_access_tokens` carries, for the same reason: a
  -- bug that stored the token itself is refused by the database rather than
  -- discovered by reading rows.
  constraint club_link_tokens_hash_is_a_sha256_digest check (
    token_hash ~ '^[0-9a-f]{64}$'),
  constraint club_link_tokens_use_count_non_negative check (use_count >= 0),
  constraint club_link_tokens_use_is_dated check (
    (use_count = 0) = (last_used_at is null)),
  constraint club_link_tokens_revocation_is_explained check (
    revoked_at is null or btrim(coalesce(revoked_reason, '')) <> '')
);

-- At most one live link per event: sharing offers the link, not a choice of
-- links, and two live links would make revocation ambiguous.
create unique index club_link_tokens_one_live_per_event
  on public.club_link_tokens (event_id)
  where revoked_at is null;

create index club_link_tokens_event_idx on public.club_link_tokens (event_id);

comment on table public.club_link_tokens is
  'D2, D81. The signed club link for one event''s participation table. The plaintext token is never stored -- only its SHA-256 digest -- and the tier it opens excludes the delivery column, which stays operator-only (D3, D65).';

-- --- The amendment hold -----------------------------------------------------

-- REQ-amend-hold. Saving an amendment HOLDS the event's not-yet-sent messages
-- until the change has been taken into account. Brian, 2026-08-21: "the
-- notification process should pause. It should see what changed, and then it
-- should continue if it's worth notifying them."
--
-- A hold, deliberately, and not a cancellation. The failure it prevents is an
-- invitation queued on Monday arriving on Wednesday describing a venue that
-- changed on Tuesday; cancelling the job would also throw away the obligation
-- to send it, which nobody decided to do.
--
-- It is a timestamp rather than a seventh job status, because invariant M4
-- locks `notification_job_status` to exactly six values. A held job keeps
-- whatever status it had, and Mission 4 decides whether it resumes as it was,
-- resumes carrying the corrected details, or is replaced.
alter table public.notification_jobs
  add column held_at timestamptz,
  add column held_reason text,
  add column held_by_person_id uuid references public.people (id) on delete restrict;

alter table public.notification_jobs
  -- A hold nobody can account for is a message that stopped for no reason.
  add constraint notification_jobs_hold_is_attributed check (
    held_at is null or (held_by_person_id is not null
                        and btrim(coalesce(held_reason, '')) <> '')),
  add constraint notification_jobs_hold_is_not_a_release check (
    held_at is not null or (held_reason is null and held_by_person_id is null));

-- Mission 4's read path: everything held, oldest first.
create index notification_jobs_held_idx on public.notification_jobs (event_id, held_at)
  where held_at is not null;

comment on column public.notification_jobs.held_at is
  'REQ-amend-hold. Set when an amendment to this job''s event is saved, so nothing unsent goes out describing a superseded value. A HOLD, not a cancellation: the obligation survives, and Mission 4 decides what resumes. Clearing it is Mission 4''s.';

-- --- The amendment audit ----------------------------------------------------

-- `schedule_changes` is invariant E2's queryable schedule history and is the
-- natural home for the amendment audit REQ-amend-in-place needs -- the actor,
-- the change, and the notify choice (§4.13, D54). Three facts it could not
-- record are added rather than a second history table being invented.
--
-- The opponent columns stay. `events.opponent` is gone, but a history row that
-- recorded an opponent moving is evidence of something that happened, and an
-- append-only history that deletes its own past is not one.
alter table public.schedule_changes
  add column previous_ends_at time,
  add column new_ends_at time,
  add column previous_name text,
  add column new_name text,
  -- D54, D55: one notify decision per amendment, recorded against the change it
  -- belongs to, so a silently-sent change is visible afterwards.
  add column notified boolean;

alter table public.schedule_changes
  drop constraint schedule_changes_something_actually_changed;

alter table public.schedule_changes
  add constraint schedule_changes_something_actually_changed check (
    previous_scheduled_on is distinct from new_scheduled_on
    or previous_starts_at is distinct from new_starts_at
    or previous_ends_at is distinct from new_ends_at
    or previous_venue is distinct from new_venue
    or previous_name is distinct from new_name
    or previous_opponent is distinct from new_opponent);

comment on column public.schedule_changes.notified is
  'D54. The operator''s one notify decision for this amendment. Null on a history row written before the decision existed.';

-- --- RLS, and the access posture --------------------------------------------

alter table public.event_type_settings enable row level security;
alter table public.event_templates enable row level security;
alter table public.event_template_questions enable row level security;
alter table public.event_template_audience_groups enable row level security;
alter table public.club_link_tokens enable row level security;

revoke all on table public.event_type_settings, public.event_templates,
     public.event_template_questions, public.event_template_audience_groups,
     public.club_link_tokens
  from anon, authenticated, service_role;

-- The seven type rows and the seven template rows are created by this migration
-- and are never created or deleted by an operator (D40), so neither table is
-- granted `insert` or `delete`.
grant select, update on table public.event_type_settings to service_role;
grant select, update on table public.event_templates to service_role;

-- A template's questions and its default audience are edited freely.
grant select, insert, update, delete
  on table public.event_template_questions, public.event_template_audience_groups
  to service_role;

-- A club link is issued, used and revoked. It is never deleted: the record that
-- a link was issued is what makes a revocation reviewable.
grant select, insert, update on table public.club_link_tokens to service_role;

-- ---------------------------------------------------------------------------
-- 7. The exception views, rebuilt
-- ---------------------------------------------------------------------------

-- Invariant P7, unchanged in substance. The `where e.solicits_response` filter
-- is gone with the column: every audience member of every event is now in the
-- population, which is what D23 means by "everyone sent an event is expected to
-- answer".
create view public.invitation_response_state with (security_invoker = true) as
select
  a.id as audience_member_id,
  a.event_id,
  a.season_id,
  a.capacity,
  a.season_membership_id,
  a.person_id,
  i.id as invitation_id,
  i.status as invitation_status,
  i.expires_at,
  case
    when i.id is null then 'never_invited'
    when r.response = 'yes' then 'responded_yes'
    when r.response = 'no' then 'responded_no'
    when i.status = 'cancelled' then 'cancelled'
    when i.status = 'expired' then 'expired_without_response'
    else 'awaiting_response'
  end as response_state,
  r.responded_at,
  r.reason,
  r.raw_capture
from public.event_audience_members a
join public.events e on e.id = a.event_id
left join public.invitations i on i.audience_member_id = a.id
left join public.current_rsvp r on r.invitation_id = i.id;

create view public.nonresponse_queue with (security_invoker = true) as
select
  s.invitation_id,
  s.event_id,
  s.season_id,
  s.capacity,
  s.season_membership_id,
  s.person_id,
  s.invitation_status,
  s.expires_at,
  e.name as event_name,
  e.scheduled_on,
  e.event_type,
  e.is_mandatory
from public.invitation_response_state s
join public.events e on e.id = s.event_id
where s.response_state in ('awaiting_response', 'expired_without_response')
  and e.status = 'approved';

create view public.uninvited_audience_members with (security_invoker = true) as
select
  s.audience_member_id,
  s.event_id,
  s.season_id,
  s.capacity,
  s.season_membership_id,
  s.person_id,
  e.name as event_name,
  e.scheduled_on,
  e.event_type,
  e.status as event_status
from public.invitation_response_state s
join public.events e on e.id = s.event_id
where s.response_state = 'never_invited'
  and e.status in ('approved', 'cancelled');

-- D30, expressed once in SQL: an event has occurred when its date has passed
-- and it was not cancelled. Nothing asserts it and nothing stores it.
--
-- The club is in Oxford and every event time is Europe/London (DEC-timezone),
-- so "today" is today there, not wherever the database happens to think it is.
create view public.rsvp_attendance_mismatches with (security_invoker = true) as
with occurred_events as (
  select e.id, e.season_id, e.name, e.scheduled_on
    from public.events e
   where e.status = 'approved'
     and e.scheduled_on is not null
     and e.scheduled_on < (now() at time zone 'Europe/London')::date
),
invited as (
  select
    i.event_id,
    i.id as invitation_id,
    i.capacity,
    i.season_membership_id,
    i.person_id,
    coalesce(i.season_membership_id, i.person_id) as anchor_id
  from public.invitations i
  join occurred_events e on e.id = i.event_id
),
recorded as (
  select
    a.event_id,
    a.id as attendance_id,
    a.capacity,
    a.season_membership_id,
    a.person_id,
    coalesce(a.season_membership_id, a.person_id) as anchor_id,
    a.presence
  from public.attendance_records a
  join occurred_events e on e.id = a.event_id
)
select
  e.id as event_id,
  e.season_id,
  e.name as event_name,
  e.scheduled_on,
  coalesce(inv.season_membership_id, rec.season_membership_id) as season_membership_id,
  coalesce(inv.person_id, rec.person_id) as person_id,
  coalesce(inv.capacity, rec.capacity) as capacity,
  r.response as rsvp_response,
  rec.presence,
  case
    when rec.attendance_id is null and r.response = 'yes' then 'said_yes_no_attendance_recorded'
    when rec.presence = 'absent' and r.response = 'yes' then 'said_yes_marked_absent'
    when rec.presence in ('present', 'late') and r.response = 'no' then 'said_no_but_attended'
    when rec.attendance_id is not null and inv.invitation_id is null
      then 'attended_without_invitation'
  end as mismatch
from invited inv
full join recorded rec on rec.event_id = inv.event_id and rec.anchor_id = inv.anchor_id
join occurred_events e on e.id = coalesce(inv.event_id, rec.event_id)
left join public.current_rsvp r on r.invitation_id = inv.invitation_id
where (rec.attendance_id is null and r.response = 'yes')
   or (rec.presence = 'absent' and r.response = 'yes')
   or (rec.presence in ('present', 'late') and r.response = 'no')
   or (rec.attendance_id is not null and inv.invitation_id is null);

comment on view public.rsvp_attendance_mismatches is
  'Full outer join of an occurred event''s invitations and its attendance records so a walk-up appears. Occurrence is DERIVED here (D30): the event is approved and its date has passed in Europe/London. Nothing asserts it.';

revoke all on
  public.invitation_response_state,
  public.nonresponse_queue,
  public.uninvited_audience_members,
  public.rsvp_attendance_mismatches
  from anon, authenticated, service_role;

grant select on
  public.invitation_response_state,
  public.nonresponse_queue,
  public.uninvited_audience_members,
  public.rsvp_attendance_mismatches
  to service_role;
