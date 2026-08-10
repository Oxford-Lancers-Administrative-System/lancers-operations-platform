-- Domain baseline, part 12b of 12: derived current-state and exception views.
--
-- Ticket step 5: "Prefer one authoritative fact with a clearly derived current
-- view." Every view here is derivation over the authoritative rows — none of
-- them is materialised, so there is no cache and nothing to drift.
--
-- Register D9: exceptions are DETECTED by query and materialised only when a
-- human owns them (as a public.follow_up_actions row). These views are that
-- detection.
--
-- All views are declared `security_invoker = true`. Without it a view runs with
-- its owner's rights, which for a Supabase migration means postgres — and
-- postgres bypasses RLS. A security-definer view over an RLS-protected table is
-- a hole in the backstop, so this is not optional. See ADR 0010.

-- ---------------------------------------------------------------------------
-- Current state, derived from append-only history
-- ---------------------------------------------------------------------------

create view public.current_availability with (security_invoker = true) as
select distinct on (a.season_membership_id)
  a.season_membership_id,
  m.person_id,
  m.season_id,
  a.id as availability_status_id,
  a.level,
  a.effective_from,
  a.review_on,
  a.reported_by_person_id,
  a.confirmed_by_person_id,
  a.recorded_at
from public.availability_statuses a
join public.season_memberships m on m.id = a.season_membership_id
order by a.season_membership_id, a.effective_from desc, a.recorded_at desc;

comment on view public.current_availability is
  'The current Green/Orange/Red per season membership, derived from the append-only history (invariant A1). Never stored.';

create view public.current_rsvp with (security_invoker = true) as
select distinct on (r.invitation_id)
  r.invitation_id,
  r.id as rsvp_response_id,
  r.response,
  r.reason,
  r.raw_capture,
  r.source,
  r.responded_at,
  r.recorded_at
from public.rsvp_responses r
order by r.invitation_id, r.responded_at desc, r.recorded_at desc;

comment on view public.current_rsvp is
  'The standing answer per invitation. Each response supersedes the previous; all are retained (model §2.5).';

-- ---------------------------------------------------------------------------
-- Invariant P7 — the response state of every invitation
-- ---------------------------------------------------------------------------

-- P7 partitions an invitee's state into: never-invited, awaiting-response,
-- expired-without-response, responded-yes, responded-no. "Never invited" is the
-- ABSENCE of a row here, which is why it has no value below.
--
-- Invariant E6: invitations to non-soliciting events are excluded from this
-- view entirely, so an informational event can never pollute the stream.
--
-- Register D5: a cancelled event preserves its responses, so an answer given
-- before cancellation still reports as the answer. `cancelled` is therefore
-- only reached by an invitation that was never answered.
create view public.invitation_response_state with (security_invoker = true) as
select
  i.id as invitation_id,
  i.event_id,
  i.season_id,
  i.capacity,
  i.season_membership_id,
  i.person_id,
  i.status as invitation_status,
  i.expires_at,
  case
    when r.response = 'yes' then 'responded_yes'
    when r.response = 'no' then 'responded_no'
    when i.status = 'cancelled' then 'cancelled'
    when i.status = 'expired' then 'expired_without_response'
    else 'awaiting_response'
  end as response_state,
  r.responded_at,
  r.reason,
  r.raw_capture
from public.invitations i
left join public.current_rsvp r on r.invitation_id = i.id
where i.solicits_response;

-- ---------------------------------------------------------------------------
-- Exception views — the Monday review's inputs
-- ---------------------------------------------------------------------------

-- Requirement 6. Register D9 confirmed RSVP nonresponse as the ONLY actively
-- automated exception stream; everything below it is a view the weekly review
-- consumes.
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

-- Requirement 7: mismatches between RSVP and attendance are FLAGGED, never
-- silently reconciled. This computes them; it does not resolve them.
create view public.rsvp_attendance_mismatches with (security_invoker = true) as
select
  e.id as event_id,
  e.season_id,
  e.name as event_name,
  e.scheduled_on,
  coalesce(i.season_membership_id, a.season_membership_id) as season_membership_id,
  coalesce(i.person_id, a.person_id) as person_id,
  coalesce(i.capacity, a.capacity) as capacity,
  r.response as rsvp_response,
  a.presence,
  case
    when a.id is null and r.response = 'yes' then 'said_yes_no_attendance_recorded'
    when a.presence in ('absent') and r.response = 'yes' then 'said_yes_marked_absent'
    when a.presence in ('present', 'late') and r.response = 'no' then 'said_no_but_attended'
    when a.id is not null and i.id is null then 'attended_without_invitation'
  end as mismatch
from public.events e
left join public.invitations i on i.event_id = e.id
left join public.attendance_records a
  on a.event_id = e.id
 and (
   (a.season_membership_id is not null and a.season_membership_id = i.season_membership_id)
   or (a.person_id is not null and a.person_id = i.person_id)
   or i.id is null
 )
left join public.current_rsvp r on r.invitation_id = i.id
where e.status = 'occurred'
  and (
    (a.id is null and r.response = 'yes')
    or (a.presence = 'absent' and r.response = 'yes')
    or (a.presence in ('present', 'late') and r.response = 'no')
    or (a.id is not null and i.id is null)
  );

-- ---------------------------------------------------------------------------
-- Invariant I5 — constitutional membership, derived and reported distinctly
-- ---------------------------------------------------------------------------

-- Constitution (Fourth Edition 24.04.22) §3: a member is someone admitted AND
-- having paid the relevant subscription. Register D10 / review F02: that is a
-- DERIVED status, reported alongside operational readiness and never conflated
-- with it. Subs are not a gate on `active`; a waived subscription is shown as
-- its own fact rather than being quietly counted as payment, because the club
-- waiving a fee and a member having paid it are different statements.
create view public.constitutional_membership with (security_invoker = true) as
select
  m.id as season_membership_id,
  m.person_id,
  m.season_id,
  m.status as operational_status,
  m.status in ('active', 'inactive') as is_operationally_ready,
  m.status in ('confirmed', 'onboarding', 'active', 'inactive', 'departed', 'archived') as is_admitted,
  coalesce(oi.status, 'pending') as subscription_status,
  coalesce(oi.status = 'complete', false) as subscription_paid,
  coalesce(oi.status = 'waived', false) as subscription_waived,
  m.status in ('confirmed', 'onboarding', 'active', 'inactive', 'departed', 'archived')
    and coalesce(oi.status = 'complete', false) as is_constitutional_member
from public.season_memberships m
left join public.onboarding_item_types t
  on t.season_id = m.season_id and t.is_subscription
left join public.onboarding_items oi
  on oi.season_membership_id = m.id and oi.item_type_id = t.id;

-- ---------------------------------------------------------------------------
-- Alumni standing, derived (model §3)
-- ---------------------------------------------------------------------------

create view public.person_standing with (security_invoker = true) as
select
  p.id as person_id,
  p.given_name,
  p.family_name,
  p.known_as,
  count(m.id) filter (where m.status in ('active', 'inactive', 'onboarding', 'confirmed', 'carried_forward'))
    as live_membership_count,
  count(m.id) as total_membership_count,
  max(s.label) filter (where m.id is not null) as most_recent_season_label,
  coalesce(
    p.past_member_override,
    count(m.id) > 0
      and count(m.id) filter (
        where m.status in ('active', 'inactive', 'onboarding', 'confirmed', 'carried_forward')
      ) = 0
  ) as is_past_member,
  p.past_member_override is not null as standing_is_overridden,
  p.merged_into_person_id
from public.people p
left join public.season_memberships m on m.person_id = p.id
left join public.seasons s on s.id = m.season_id
group by p.id;

comment on view public.person_standing is
  'Alumnus status is derived from a person''s memberships and operator-overridable (model §3): a graduate who stays on as a coach is not "gone".';

-- ---------------------------------------------------------------------------
-- Invariant M2 — one transition stream over several typed homes
-- ---------------------------------------------------------------------------

-- Where the model gives a transition a typed table, that table is the audit
-- record and no duplicate audit_events row is written. This view is how the
-- ledger is read as a single stream without that duplication.
create view public.transition_ledger with (security_invoker = true) as
select
  a.occurred_at,
  a.actor_person_id,
  a.actor_label,
  'audit_events'::text as recorded_in,
  a.entity_table,
  a.entity_id,
  a.action,
  a.from_state,
  a.to_state,
  a.reason
from public.audit_events a
union all
select
  h.occurred_at,
  h.actor_person_id,
  h.actor_label,
  'season_membership_status_events'::text,
  'season_memberships'::text,
  h.season_membership_id,
  'membership_status_changed'::text,
  h.from_status::text,
  h.to_status::text,
  h.reason
from public.season_membership_status_events h
union all
select
  c.changed_at,
  c.recorded_by_person_id,
  null::text,
  'schedule_changes'::text,
  'events'::text,
  c.event_id,
  'schedule_changed'::text,
  null::text,
  c.source::text,
  c.reason
from public.schedule_changes c
union all
select
  av.recorded_at,
  av.reported_by_person_id,
  null::text,
  'availability_statuses'::text,
  'season_memberships'::text,
  av.season_membership_id,
  'availability_recorded'::text,
  null::text,
  av.level::text,
  null::text
from public.availability_statuses av
union all
select
  r.recorded_at,
  r.recorded_by_person_id,
  r.source::text,
  'rsvp_responses'::text,
  'invitations'::text,
  r.invitation_id,
  'rsvp_recorded'::text,
  null::text,
  r.response::text,
  r.reason
from public.rsvp_responses r
union all
select
  d.occurred_at,
  d.actor_person_id,
  d.channel::text,
  'delivery_results'::text,
  'notification_jobs'::text,
  d.notification_job_id,
  'delivery_attempted'::text,
  null::text,
  d.outcome::text,
  d.detail
from public.delivery_results d;

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------
-- Same posture as the tables: nothing reaches a browser-facing role.

revoke all on
  public.current_availability,
  public.current_rsvp,
  public.invitation_response_state,
  public.nonresponse_queue,
  public.rsvp_attendance_mismatches,
  public.constitutional_membership,
  public.person_standing,
  public.transition_ledger
  from anon, authenticated, service_role;

grant select on
  public.current_availability,
  public.current_rsvp,
  public.invitation_response_state,
  public.nonresponse_queue,
  public.rsvp_attendance_mismatches,
  public.constitutional_membership,
  public.person_standing,
  public.transition_ledger
  to service_role;
