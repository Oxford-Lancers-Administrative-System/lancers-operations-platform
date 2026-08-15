-- Correct public.rsvp_attendance_mismatches so that it can actually emit
-- `attended_without_invitation`.
--
-- LAN-80 discovered the defect and, on Brian's decision of 14 August 2026,
-- reported it rather than authoring this migration; LAN-81 fixes it, because
-- LAN-81 is the issue that reads the view.
--
-- ---------------------------------------------------------------------------
-- The defect
-- ---------------------------------------------------------------------------
--
-- The baseline view names four mismatch classifications and can produce only
-- three. It joined attendance to invitations and admitted an unmatched
-- attendance row through a single disjunct:
--
--     left join public.attendance_records a
--       on a.event_id = e.id
--      and ( ... or i.id is null )
--
-- `i.id` is null only when the event has NO invitations at all — and every
-- approved event has invitations, because approval is what creates them. So a
-- walk-up paired with nothing and was never returned. It is real rather than
-- theoretical: the synthetic seed contains two walk-ups and the view reported
-- the classification zero times.
--
-- Requirement 7 says mismatches are computed, surfaced as exceptions and never
-- silently reconciled. A classification that cannot fire is not a reconciled
-- mismatch, but it is an under-count with the same effect: every walk-up
-- recorded at the pitch was invisible to the Monday report.
--
-- ---------------------------------------------------------------------------
-- The correction
-- ---------------------------------------------------------------------------
--
-- "Was asked" and "was observed" are two populations, and a mismatch is
-- somebody who appears in one and not the other — which is a `full outer join`,
-- not a left join with a disjunct standing in for one. This is the same
-- construction `readAttendanceBoard` already uses in the service layer, and for
-- the same reason: it is the shape of the question.
--
-- Each side computes the one anchor invariant P8 guarantees it has —
-- `coalesce(season_membership_id, person_id)` — because PostgreSQL will not
-- accept a disjunction of two equalities as a full-join condition, needing one
-- that is merge- or hash-joinable.
--
-- Nothing else changes. The output columns, the three classifications that did
-- work, the `occurred`-only population and the deliberate absence of any
-- resolution or suppression are all exactly as they were.
--
-- Forward-only: the baseline migration is untouched and this replaces the view.
-- Applying it to hosted Supabase is a human action — see
-- docs/migration-runbook.md.

drop view if exists public.rsvp_attendance_mismatches;

create view public.rsvp_attendance_mismatches with (security_invoker = true) as
with occurred_events as (
  select e.id, e.season_id, e.name, e.scheduled_on
    from public.events e
   where e.status = 'occurred'
),
invited as (
  select i.event_id,
         i.id as invitation_id,
         i.capacity,
         i.season_membership_id,
         i.person_id,
         coalesce(i.season_membership_id, i.person_id) as anchor_id
    from public.invitations i
    join occurred_events e on e.id = i.event_id
),
recorded as (
  select a.event_id,
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
    when rec.attendance_id is not null and inv.invitation_id is null then 'attended_without_invitation'
  end as mismatch
from invited inv
full outer join recorded rec
  on rec.event_id = inv.event_id
 and rec.anchor_id = inv.anchor_id
join occurred_events e on e.id = coalesce(inv.event_id, rec.event_id)
left join public.current_rsvp r on r.invitation_id = inv.invitation_id
where (rec.attendance_id is null and r.response = 'yes')
   or (rec.presence = 'absent' and r.response = 'yes')
   or (rec.presence in ('present', 'late') and r.response = 'no')
   or (rec.attendance_id is not null and inv.invitation_id is null);

comment on view public.rsvp_attendance_mismatches is
  'Requirement 7''s flagged mismatches between intent and reality, computed over the '
  'full outer join of an occurred event''s invitations and its attendance records so '
  'that a walk-up — attendance with no invitation — is returned rather than lost. '
  'Computed, never resolved: nothing writes, hides or reconciles a row here.';

-- Dropping the view dropped its privileges with it. Same posture as before:
-- nothing reaches a browser-facing role, and the privileged server path reads.
revoke all on public.rsvp_attendance_mismatches from anon, authenticated, service_role;
grant select on public.rsvp_attendance_mismatches to service_role;
