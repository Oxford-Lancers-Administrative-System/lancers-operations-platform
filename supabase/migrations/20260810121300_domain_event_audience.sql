-- Domain baseline, part 13: the resolved event audience, and two lineage
-- corrections.
--
-- Added by the bounded correction pass following the independent verification
-- of PR #5 (2026-08-10). Parts 1–12 are the original baseline set; this file is
-- forward-only and edits none of them.
--
-- It corrects two findings:
--
--   1. (Blocker) The frozen model gives an Event an *audience definition*, and
--      invariant P7 requires `never-invited` to be reportable. The baseline
--      stored only `audience_confirmed_at` and `audience_confirmed_by_person_id`
--      — confirmation metadata, not the audience. With no record of who was
--      confirmed, the database could not tell "outside the audience" from
--      "in the audience and accidentally not invited", and P7's five-way
--      partition had only four derivable states.
--
--   2. (Medium) `weekly_reports.supersedes_id` was an unconstrained self
--      reference, so a report could supersede one from a different season or a
--      different reporting date.

-- ---------------------------------------------------------------------------
-- 1. The resolved audience
-- ---------------------------------------------------------------------------

-- Model §2.3: approval "resolves the audience into Invitations". This table is
-- that audience — the population the approver confirmed. It is deliberately a
-- separate concept from the four that follow it: the audience says who was
-- meant to be asked, an invitation says who was asked, an RSVP says what they
-- answered, and attendance says who turned up. Each can disagree with the next,
-- and that disagreement is what the exception views exist to surface.
--
-- The audience is populated BEFORE approval, because it is the thing the
-- approver is confirming. There is therefore no event-status constraint here:
-- a draft may carry a proposed audience, which is what makes the approval
-- decision reviewable. Drafts still carry no invitations, responses or
-- attendance (model §2.3), and that remains enforced.
create table public.event_audience_members (
  id uuid primary key default gen_random_uuid(),

  event_id uuid not null references public.events (id) on delete cascade,
  season_id uuid not null,

  -- Same anchor rule as invitations and attendance (review F05 / invariant P8):
  -- player capacity anchors to the season membership, every other capacity to
  -- the durable Person via their role.
  capacity public.invitation_capacity not null,
  season_membership_id uuid,
  person_id uuid references public.people (id) on delete restrict,

  -- Exactly one of the two anchors, as a single column. This exists so that an
  -- invitation can be tied to its audience member AND to the same participant
  -- in one foreign key; a composite key over the two nullable anchor columns
  -- would be skipped entirely whenever either was null (MATCH SIMPLE).
  participant_id uuid generated always as (coalesce(season_membership_id, person_id)) stored,

  added_at timestamptz not null default now(),
  added_by_person_id uuid references public.people (id) on delete restrict,

  constraint event_audience_members_event_same_season
    foreign key (event_id, season_id)
    references public.events (id, season_id) on update cascade,
  constraint event_audience_members_membership_same_season
    foreign key (season_membership_id, season_id)
    references public.season_memberships (id, season_id) on update cascade,

  constraint event_audience_members_anchor_matches_capacity check (
    (capacity = 'player' and season_membership_id is not null and person_id is null)
    or (capacity <> 'player' and season_membership_id is null and person_id is not null)),

  -- Composite-foreign-key target: an invitation must name an audience member of
  -- the same event, in the same capacity, for the same participant.
  constraint event_audience_members_participant_key
    unique (id, event_id, capacity, participant_id)
);

-- No duplicate membership of an event's resolved audience, under either anchor.
create unique index event_audience_members_one_per_player_per_event
  on public.event_audience_members (event_id, season_membership_id)
  where season_membership_id is not null;
create unique index event_audience_members_one_per_person_per_event
  on public.event_audience_members (event_id, person_id)
  where person_id is not null;

create index event_audience_members_event_idx on public.event_audience_members (event_id);
create index event_audience_members_membership_idx
  on public.event_audience_members (season_membership_id)
  where season_membership_id is not null;

comment on table public.event_audience_members is
  'The audience an approver confirmed for an event (invariant E1). Distinct from invitations: this is who was meant to be asked. An audience member with no invitation is invariant P7''s `never-invited` state.';
comment on column public.event_audience_members.participant_id is
  'Generated: whichever anchor applies. Exists so an invitation can be bound to its audience member and participant in one foreign key.';

-- ---------------------------------------------------------------------------
-- 2. Bind invitations to the audience they were resolved from
-- ---------------------------------------------------------------------------

alter table public.invitations
  add column audience_member_id uuid,
  add column participant_id uuid
    generated always as (coalesce(season_membership_id, person_id)) stored;

-- Backfill. Written so this migration is correct against a database that
-- already holds invitations, not only against an empty rebuild: every existing
-- invitation implies an audience member, because an invitation could only ever
-- have been created for an approved event.
insert into public.event_audience_members
  (event_id, season_id, capacity, season_membership_id, person_id, added_at, added_by_person_id)
select
  i.event_id, i.season_id, i.capacity, i.season_membership_id, i.person_id,
  coalesce(e.audience_confirmed_at, i.created_at), e.audience_confirmed_by_person_id
from public.invitations i
join public.events e on e.id = i.event_id;

update public.invitations i
   set audience_member_id = a.id
  from public.event_audience_members a
 where a.event_id = i.event_id
   and a.capacity = i.capacity
   and a.participant_id = coalesce(i.season_membership_id, i.person_id);

alter table public.invitations
  alter column audience_member_id set not null;

-- An invitation must belong to its event's resolved audience, for the same
-- participant in the same capacity. This is what makes P7 a genuine partition:
-- every invitation has an audience row, so starting the report from the
-- audience cannot lose anybody.
--
-- `on update cascade` is unavailable on a foreign key containing a generated
-- column, and is unnecessary: neither an audience member's id nor a
-- participant's identity is ever updated in place.
alter table public.invitations
  add constraint invitations_belong_to_the_resolved_audience
  foreign key (audience_member_id, event_id, capacity, participant_id)
  references public.event_audience_members (id, event_id, capacity, participant_id);

create index invitations_audience_member_idx on public.invitations (audience_member_id);

comment on column public.invitations.audience_member_id is
  'The confirmed audience member this invitation was resolved from (model §2.3). Adding a late invitee means adding them to the audience and inviting them in one transaction.';

-- ---------------------------------------------------------------------------
-- 3. Rebuild the P7 reporting view from the audience
-- ---------------------------------------------------------------------------

-- The column list changes, so these are dropped and recreated rather than
-- replaced. `nonresponse_queue` is dropped first because it reads the other.
drop view if exists public.nonresponse_queue;
drop view if exists public.invitation_response_state;

-- Invariant P7: for any member of a response-soliciting event's audience,
-- exactly one of {never-invited, awaiting-response, expired-without-response,
-- responded-yes, responded-no} is true and reportable.
--
-- The population is now the RESOLVED AUDIENCE, left-joined to invitations, so
-- `never-invited` is derivable rather than being an absence nobody can query.
-- Someone outside the audience has no row here at all — which is the point:
-- the database can now distinguish "not our concern" from "we meant to ask
-- them and never did".
--
-- Invariant E6: invitations to non-soliciting events are excluded entirely, so
-- an informational event never pollutes the stream.
--
-- Register D5: a cancelled event preserves its responses, so an answer given
-- before cancellation still reports as the answer; `cancelled` is only reached
-- by an invitation that was never answered.
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
left join public.current_rsvp r on r.invitation_id = i.id
where e.solicits_response;

-- Requirement 6. Unchanged in meaning: this is the nonresponse escalation
-- stream, and an audience member who was never invited is a different
-- exception — an approval defect, not a nonresponse — so it is deliberately
-- not swept in here. It surfaces in public.uninvited_audience_members below.
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
  and e.status in ('approved', 'occurred');

-- The exception the audience relation makes visible for the first time:
-- somebody the approver confirmed, who was never actually asked.
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
  and e.status in ('approved', 'occurred', 'not_held');

-- ---------------------------------------------------------------------------
-- 4. Weekly-report supersession lineage
-- ---------------------------------------------------------------------------

-- A regenerated report must supersede an earlier version OF THE SAME REPORT:
-- same season, same reporting date. The baseline's plain self-reference allowed
-- one season's report to supersede an unrelated one.
--
-- With MATCH SIMPLE, a null `supersedes_id` skips the constraint entirely,
-- which is exactly right for a version 1 row — and version 1 is already
-- required to supersede nothing.
alter table public.weekly_reports
  add constraint weekly_reports_series_key unique (id, season_id, report_on);

alter table public.weekly_reports
  drop constraint if exists weekly_reports_supersedes_id_fkey;

alter table public.weekly_reports
  add constraint weekly_reports_supersedes_the_same_report
  foreign key (supersedes_id, season_id, report_on)
  references public.weekly_reports (id, season_id, report_on);

comment on constraint weekly_reports_supersedes_the_same_report on public.weekly_reports is
  'A regeneration supersedes an earlier version of the same season and reporting date. Sequential version allocation is a service-layer responsibility — see docs/architecture/data-model.md.';

-- ---------------------------------------------------------------------------
-- 5. Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- Same posture as every other domain table (ADR 0002, ADR 0010): RLS on, no
-- policy, and revoke from all three client roles before granting back — the
-- default privileges leave `truncate` behind otherwise.

alter table public.event_audience_members enable row level security;

revoke all on table public.event_audience_members from anon, authenticated, service_role;
grant select, insert, update, delete on table public.event_audience_members to service_role;

revoke all on
  public.invitation_response_state,
  public.nonresponse_queue,
  public.uninvited_audience_members
  from anon, authenticated, service_role;

grant select on
  public.invitation_response_state,
  public.nonresponse_queue,
  public.uninvited_audience_members
  to service_role;
