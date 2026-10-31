-- LAN-397 — step 1: the inventory of every candidate test record. Read-only.
--
-- Brian runs this by hand in the hosted project's SQL editor. No agent runs it
-- there. Read scripts/pilot/lan-397/README.md first.
--
-- One statement, one result, so the SQL editor shows all of it. It is a plain
-- SELECT with no data-modifying CTE: it cannot change a row.
--
-- Sections, in order:
--   1 person         every people row: created, the door it came in by, its
--                    standing, how many messages were queued for it, how many
--                    event rows hang off it, and how many audit rows name it
--                    as the actor (a person named by an audit row cannot be
--                    deleted — invariant M2 — so the removal refuses it).
--   2 auth user      every auth.users row, with its operator account and
--                    person, or none.
--   3 event          every event: type, date, status, audience size, messages.
--   4 sign-up code   every recruitment sign-up code. These are never removed.
--
-- Within a section the rows sort by door and date, so test rows sit together.
-- Copy each id to delete into the matching list at the top of removal.sql.

with person_rows as (
  select
    '1 person'::text as section,
    p.id::text as id,
    p.created_at::date as created_on,
    trim(concat_ws(' ', p.given_name, p.family_name)) as name,
    coalesce(
      (select string_agg(distinct r.source::text, ', ') from public.recruitment_prospects r
        where r.person_id = p.id),
      (select string_agg(distinct m.entry::text, ', ') from public.season_memberships m
        where m.person_id = p.id),
      case when exists (select 1 from public.operator_accounts o where o.person_id = p.id)
           then 'operator invitation' end,
      case when exists (select 1 from public.attendance_records a where a.person_id = p.id)
           then 'walk-up' end,
      'none'
    ) as source,
    concat_ws('; ',
      (select 'membership ' || string_agg(m.status::text, ', ') from public.season_memberships m
        where m.person_id = p.id),
      (select 'recruit ' || string_agg(r.status::text, ', ') from public.recruitment_prospects r
        where r.person_id = p.id),
      (select 'operator ' || case when bool_or(o.is_active) then 'active' else 'deactivated' end
         from public.operator_accounts o where o.person_id = p.id having count(*) > 0),
      (select 'current seats ' || count(*) from public.role_assignments ra
        where ra.person_id = p.id
          and ra.effective_from <= current_date
          and (ra.effective_to is null or ra.effective_to > current_date)
       having count(*) > 0),
      case when p.erased_at is not null then 'erased' end,
      case when p.merged_into_person_id is not null then 'merged' end
    ) as standing,
    (select count(*) from public.notification_jobs j where j.person_id = p.id) as messages,
    (select count(*) from public.invitations i where i.person_id = p.id)
      + (select count(*) from public.attendance_records a where a.person_id = p.id)
      + (select count(*) from public.event_audience_members e where e.invitee_person_id = p.id)
      as event_rows,
    (select count(*) from public.audit_events ae where ae.actor_person_id = p.id) as audit_rows,
    null::text as note
  from public.people p
),
auth_rows as (
  select
    '2 auth user'::text,
    u.id::text,
    u.created_at::date,
    coalesce(
      (select trim(concat_ws(' ', p.given_name, p.family_name))
         from public.operator_accounts o join public.people p on p.id = o.person_id
        where o.auth_user_id = u.id limit 1),
      '(no person)'),
    'auth',
    coalesce(
      (select 'operator ' || case when bool_or(o.is_active) then 'active' else 'deactivated' end
         from public.operator_accounts o where o.auth_user_id = u.id having count(*) > 0),
      'no operator account'),
    null::bigint,
    null::bigint,
    null::bigint,
    'last sign-in ' || coalesce(u.last_sign_in_at::date::text, 'never')
  from auth.users u
),
event_rows as (
  select
    '3 event'::text,
    e.id::text,
    e.created_at::date,
    e.name,
    e.event_type::text,
    e.status::text,
    (select count(*) from public.notification_jobs j where j.event_id = e.id),
    (select count(*) from public.event_audience_members m where m.event_id = e.id),
    null::bigint,
    'on ' || coalesce(e.scheduled_on::text || coalesce(' ' || e.starts_at::text, ''), 'no date')
  from public.events e
),
code_rows as (
  select
    '4 sign-up code'::text,
    c.id::text,
    c.created_at::date,
    c.code,
    'sign-up code',
    case when c.deactivated_at is null then 'live' else 'deactivated' end,
    null::bigint,
    null::bigint,
    null::bigint,
    'sign-ins ' || c.sign_in_count || '; never removed'
  from public.recruitment_signup_codes c
)
select * from person_rows
union all select * from auth_rows
union all select * from event_rows
union all select * from code_rows
order by section, source, created_on, name;
