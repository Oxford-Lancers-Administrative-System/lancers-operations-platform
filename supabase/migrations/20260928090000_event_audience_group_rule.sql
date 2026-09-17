-- The audience groups an approved event keeps, and the people the approver
-- deliberately left out of them — LAN-392.
--
-- Clint on WhatsApp, 2026-09-17: "If I make an event with an audience and I
-- want to add more people to the audience (which happens a lot during
-- recruitment) I can't do that right now." Brian the same morning: "if the
-- status of somebody changes (for example, when a recruit gets added), they
-- should automatically be added to the recruitment event."
--
-- ## What was missing, exactly
--
-- The picker expands a group button into a flat list of selection keys the
-- instant it is pressed (`toggleGroup` in `audience-selection.ts`), the builder
-- holds only that set of keys, `saveEventAudience` receives only that set, and
-- approval freezes the people it resolves to. Nothing anywhere records *that a
-- group was chosen*, so an approved recruitment event has no rule for a recruit
-- added the following morning to fall into. `summariseAudienceGroups` looks
-- like such a record and is not: it is a post-hoc inference that reports a
-- group only when every person that group would invite today is selected, so
-- unticking one name makes the group vanish from it entirely. That is also why
-- "deselected on purpose" and "not in the group at the time" are today
-- indistinguishable, in both directions.
--
-- Two tables, therefore, and one column.
--
-- ## The freeze that ADR 0022 recorded is amended, not abandoned
--
-- ADR 0022: "Both write paths guard on status = 'draft'. The audience is
-- therefore frozen the instant the event is approved — structurally, not by
-- omitting a button." That sentence now means *the approver's list is never
-- reduced and never re-resolved*, rather than *the audience never grows*. A
-- person only ever arrives; nobody is ever removed by a rule, no confirmed row
-- is ever rewritten, and the group rule cannot reach anyone the approver
-- unticked. ADR 0022 carries a dated amendment note saying so.
--
-- ## Why the rule is stored per event rather than read off the template
--
-- `event_template_audience_groups` is the template's *default* — what the
-- picker pre-ticks. What the approver actually confirmed is the event's own
-- audience, and the two are different facts: an operator who presses "All
-- active players" and then unticks two people has confirmed a group and two
-- exclusions, which no template row can express. `event_audience_groups` is the
-- per-event analogue of that template table, keyed the same way and carrying
-- the same recruits-are-recruitment-only guard.

-- ---------------------------------------------------------------------------
-- 1. The composite key the recruits guard needs
-- ---------------------------------------------------------------------------
--
-- `event_template_audience_groups` proves its own `event_type` column against
-- `event_templates (id, event_type)` and checks `recruits` against it. The
-- per-event table does the same thing against `events`, and needs the same
-- composite key to make its copy provably equal rather than conventionally
-- equal. `events` already publishes `(id, status)` for exactly this reason.

alter table public.events
  add constraint events_id_and_class unique (id, event_type);

-- ---------------------------------------------------------------------------
-- 2. The groups an event was built from
-- ---------------------------------------------------------------------------

create table public.event_audience_groups (
  event_id uuid not null,
  event_type public.event_type not null,
  audience_group public.audience_group not null,
  chosen_at timestamptz not null default now(),
  chosen_by_person_id uuid references public.people (id),
  constraint event_audience_groups_key primary key (event_id, audience_group),
  constraint event_audience_groups_event_fkey
    foreign key (event_id, event_type)
    references public.events (id, event_type) on delete cascade,
  -- D46/LAN-295 at the event, exactly as
  -- `event_template_audience_groups_recruits_are_recruitment_only` states it at
  -- the template: recruits are not in a non-recruitment event's catalogue at
  -- all, so a `recruits` rule on one could only ever be a mistake.
  constraint event_audience_groups_recruits_are_recruitment_only check (
    audience_group <> 'recruits' or event_type = 'recruitment')
);

comment on table public.event_audience_groups is
  'LAN-392. The derived audience groups this event was built from, kept alive past approval: a person who joins one of these groups later is added to the audience and invited under the event''s own plan. Written by saveEventAudience beside the audience itself, so the groups and the people are one proposal; a group only acts once the event is approved and while it has not started.';
comment on column public.event_audience_groups.event_type is
  'The event''s own class, copied so the recruits check can read it, and held equal to the source by the composite foreign key.';
comment on column public.event_audience_groups.chosen_by_person_id is
  'The operator whose save recorded this group. Nullable because the migration backfills events approved before this rule existed, where there is no such operator.';

create index event_audience_groups_group_idx
  on public.event_audience_groups (audience_group, event_id);

-- ---------------------------------------------------------------------------
-- 3. The people the approver took out of a chosen group
-- ---------------------------------------------------------------------------
--
-- Brian, 2026-09-17: "added as a group and you naturally fall into that group,
-- you get it; deselected specifically, you do not." Keyed per (event, person)
-- and not per group: no operator unticking a name is thinking about which group
-- the name came from, and the rule they are expressing is about this event and
-- this person. LAN-393's hand-add is the one door that clears it.

create table public.event_audience_exclusions (
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.people (id),
  excluded_at timestamptz not null default now(),
  excluded_by_person_id uuid references public.people (id),
  constraint event_audience_exclusions_key primary key (event_id, person_id)
);

comment on table public.event_audience_exclusions is
  'LAN-392. People who were in one of this event''s chosen audience groups when it was saved and were not selected — a deliberate deselection. The group rule never adds them to this event, however their standing changes afterwards. Cleared only by an operator adding them by hand (LAN-393).';
comment on column public.event_audience_exclusions.excluded_by_person_id is
  'The operator whose save recorded the deselection. Nullable for the same reason the group''s is.';

create index event_audience_exclusions_person_idx
  on public.event_audience_exclusions (person_id);

-- ---------------------------------------------------------------------------
-- 4. Which rows the rule put there
-- ---------------------------------------------------------------------------
--
-- Three things need to tell a rule-added row from a confirmed one: the audit
-- ("added by the group rule, not by an operator"), the five-an-hour cap, which
-- counts only the invitations this rule declared, and the retraction inside the
-- grace window, which must never be able to delete a row the approver
-- confirmed. `added_by_person_id` is already nullable and is left null on a
-- rule add, so the pair reads as one sentence: no operator, and this group.

alter table public.event_audience_members
  add column added_by_group public.audience_group;

comment on column public.event_audience_members.added_by_group is
  'LAN-392. The stored group rule that added this row after approval, or null where the approver confirmed the row or an operator added it by hand. Null and a null added_by_person_id together mean a row from a seed or a migration, never a rule add.';

create index event_audience_members_added_by_group_idx
  on public.event_audience_members (invitee_person_id)
  where added_by_group is not null;

-- ---------------------------------------------------------------------------
-- 5. Backfill (Brian's decision 10, 2026-09-17, and its known cost)
-- ---------------------------------------------------------------------------
--
-- Events approved before this ships have no stored groups, so without a
-- backfill the rule would do nothing for the events Clint is running right now
-- — which is the complaint. Each is therefore given its template's default
-- audience groups.
--
-- The cost, accepted out loud rather than discovered later: a template default
-- is not the approver's answer. Where an approver pressed a group and then
-- unticked somebody, that untick is not recoverable — no exclusion exists to
-- backfill — so the group rule may later add a person they deliberately left
-- out of one of these older events. It cannot happen to an event approved after
-- this migration, because from then on the exclusions are recorded at the same
-- moment as the groups.
--
-- Every approved event is backfilled, whatever its date, rather than only the
-- future ones: which events are "future" depends on the minute the migration is
-- applied, and a migration whose result differs between this machine and the
-- hosted database is not a migration anybody can reason about. The rule's own
-- predicate — approved, and not yet started — is what keeps a past event inert.
-- Cancelled and draft events get nothing: a draft records its groups when it is
-- next saved, and a cancelled event has no audience to grow.

insert into public.event_audience_groups (event_id, event_type, audience_group, chosen_at)
select e.id, e.event_type, g.audience_group, e.approved_at
  from public.events e
  join public.event_template_audience_groups g on g.template_id = e.template_id
 where e.status = 'approved'
   and (g.audience_group <> 'recruits' or e.event_type = 'recruitment')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 6. RLS, and the access posture
-- ---------------------------------------------------------------------------

alter table public.event_audience_groups enable row level security;
alter table public.event_audience_exclusions enable row level security;

revoke all on table public.event_audience_groups, public.event_audience_exclusions
  from anon, authenticated, service_role;

-- Both are rewritten wholesale every time a draft's audience is saved, and the
-- exclusions are cleared one person at a time by LAN-393's hand-add, so both
-- need delete as well. Nothing reads either table outside the server.
grant select, insert, update, delete
  on table public.event_audience_groups, public.event_audience_exclusions
  to service_role;
