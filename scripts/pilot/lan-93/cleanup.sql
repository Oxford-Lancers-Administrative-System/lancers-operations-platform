-- LAN-93 worked example — CLEANUP.
--
-- Removes exactly the rows setup.sql creates, and nothing else. Run by a human,
-- and — per the retention policy in docs/pilot-data-runbook.md — normally NOT
-- immediately after the feature test: pilot data is allowed to accumulate so
-- later features can be exercised against earlier ones. This script is retained
-- for the cutover, or run early only when the data is sensitive, conflicting,
-- misleading or harmful to later testing.
--
-- Safe to run twice: every delete is by primary key, so a second run removes
-- nothing and raises nothing.
--
-- Safe to run never: leaving the scenario in place breaks nothing.
--
-- WHAT THIS SCRIPT WILL NOT DO
--   * It never deletes from auth.users, public.operator_accounts,
--     public.role_assignments, public.roles or public.audit_events. The durable
--     pilot foundation and the audit history that makes it resolvable
--     (invariant M2) survive every cleanup, by construction.
--   * It never deletes a row it cannot prove it owns: every delete is keyed on
--     a deterministic identifier AND qualified by the PILOT-LAN-93 sentinel.
--   * It never widens. Where a foreign row hangs off one of the scenario's
--     rows, the preflight aborts with a message rather than removing it —
--     including the cases PostgreSQL would otherwise silently cascade or null
--     out, which are enumerated explicitly below.
--
-- Anything the preflight does not anticipate is caught by the schema's
-- `on delete restrict` foreign keys: the delete fails, the transaction rolls
-- back, and the scenario is left exactly as it was. That is the intended
-- failure mode. Establish actual state with the verification query in
-- README.md before deciding what to do next; never "fix" it by deleting the
-- blocking row.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target and the intended deletion reviewable
-- ---------------------------------------------------------------------------
select
  'LAN-93 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (
    select count(*) from public.people
     where id = '00930093-0093-4093-8093-000000000004'
  ) as scenario_person_rows,
  (
    select count(*) from public.events
     where id = '00930093-0093-4093-8093-000000000006'
  ) as scenario_event_rows,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.audit_events) as audit_rows_before,
  (select count(*) from public.operator_accounts) as operator_account_rows_before;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: refuse rather than widen
-- ---------------------------------------------------------------------------
do $preflight$
begin
  -- (a) Every table this script deletes from must exist. A missing one means
  --     the schema is not what this script was written against.
  if to_regclass('public.season_memberships') is null
     or to_regclass('public.events') is null
     or to_regclass('public.people') is null
     or to_regclass('public.seasons') is null
     or to_regclass('public.positions') is null
     or to_regclass('public.position_vocabularies') is null then
    raise exception 'LAN-93 pilot cleanup refused: the expected schema is not present.';
  end if;

  -- (b) Ownership. If a deterministic identifier is occupied by a row without
  --     this scenario's sentinel, it is somebody else's row and this script
  --     stops. Deleting it would be the worst thing this file could do.
  if exists (
    select 1 from public.people p
     where p.id = '00930093-0093-4093-8093-000000000004'
       and not exists (
         select 1 from public.person_aliases a
          where a.person_id = p.id and a.alias = 'PILOT-LAN-93')
  ) then
    raise exception 'LAN-93 pilot cleanup refused: people …0004 does not carry the PILOT-LAN-93 sentinel. Refusing to delete a person record this scenario does not own.';
  end if;

  if exists (
    select 1 from public.events
     where id = '00930093-0093-4093-8093-000000000006' and name not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: events …0006 does not carry the PILOT-LAN-93 sentinel.';
  end if;

  if exists (
    select 1 from public.seasons
     where id = '00930093-0093-4093-8093-000000000003' and label not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: seasons …0003 does not carry the PILOT-LAN-93 sentinel.';
  end if;

  if exists (
    select 1 from public.positions
     where id = '00930093-0093-4093-8093-000000000002' and label not like 'PILOT-LAN-93%'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: positions …0002 does not carry the PILOT-LAN-93 sentinel.';
  end if;

  if exists (
    select 1 from public.position_vocabularies
     where id = '00930093-0093-4093-8093-000000000001' and code <> 'pilot-lan-93'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: position_vocabularies …0001 does not carry the PILOT-LAN-93 sentinel.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = '00930093-0093-4093-8093-000000000005'
       and (person_id <> '00930093-0093-4093-8093-000000000004'
            or season_id <> '00930093-0093-4093-8093-000000000003')
  ) then
    raise exception 'LAN-93 pilot cleanup refused: season_memberships …0005 is not this scenario''s row.';
  end if;

  -- (c) The durable foundation. If the scenario's person has become a durable
  --     identity — an operator account, a role assignment, or an actor in the
  --     audit trail — then it is no longer scenario data and this script must
  --     not remove it. `on delete restrict` would stop the delete anyway; this
  --     check exists so the operator gets a sentence instead of a foreign-key
  --     error, and so the rule is visible in the file rather than implied.
  if exists (
    select 1 from public.operator_accounts
     where person_id = '00930093-0093-4093-8093-000000000004'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: the scenario person is linked to an operator account. Durable identities are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.role_assignments
     where person_id = '00930093-0093-4093-8093-000000000004'
        or appointed_by_person_id = '00930093-0093-4093-8093-000000000004'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: the scenario person holds or granted a role assignment. Access records are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.audit_events
     where actor_person_id = '00930093-0093-4093-8093-000000000004'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: the scenario person is an actor in audit_events. History must stay resolvable (invariant M2).';
  end if;

  -- (d) Rows PostgreSQL would remove or alter WITHOUT being asked. Every
  --     `on delete cascade` and `on delete set null` foreign key pointing at a
  --     row this script deletes is listed here. This scenario creates exactly
  --     one of them — the display alias that carries its sentinel, since
  --     LAN-182 — so any other belongs to somebody else.
  if exists (
    select 1 from public.person_aliases
     where person_id = '00930093-0093-4093-8093-000000000004'
       and id <> '00930093-0093-4093-8093-000000000094'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: person_aliases rows this scenario did not write hang off the scenario person and would be cascade-deleted.';
  end if;

  -- LAN-182's new table, and a cascade this file did not have to know about
  -- until the test that reads pg_constraint told it. An emergency contact is
  -- third-party personal data; it never leaves by a side effect.
  if exists (
    select 1 from public.person_emergency_contacts
     where person_id = '00930093-0093-4093-8093-000000000004'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: person_emergency_contacts rows hang off the scenario person and would be cascade-deleted. The scenario creates none.';
  end if;

  if exists (
    select 1 from public.contact_points
     where person_id = '00930093-0093-4093-8093-000000000004'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: contact_points rows hang off the scenario person and would be cascade-deleted.';
  end if;

  if exists (
    select 1 from public.event_questions
     where event_id = '00930093-0093-4093-8093-000000000006'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: event_questions rows hang off the scenario event and would be cascade-deleted.';
  end if;

  if exists (
    select 1 from public.event_audience_members
     where event_id = '00930093-0093-4093-8093-000000000006'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: event_audience_members rows hang off the scenario event and would be cascade-deleted.';
  end if;

  if exists (
    select 1 from public.onboarding_item_types
     where season_id = '00930093-0093-4093-8093-000000000003'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: onboarding_item_types rows hang off the scenario season and would be cascade-deleted.';
  end if;

  -- The staging checks are nested rather than combined with `and`: plpgsql
  -- plans each statement when it is first reached, so a nested `if` is genuinely
  -- skipped when the staging schema is absent, while one combined boolean
  -- expression would be planned — and fail — either way.
  if to_regclass('staging.legacy_roster_rows') is not null then
    if exists (
      select 1 from staging.legacy_roster_rows
       where matched_person_id = '00930093-0093-4093-8093-000000000004'
    ) then
      raise exception 'LAN-93 pilot cleanup refused: staging.legacy_roster_rows reference the scenario person and would be silently nulled.';
    end if;
  end if;

  if to_regclass('staging.legacy_event_rows') is not null then
    if exists (
      select 1 from staging.legacy_event_rows
       where normalised_event_id = '00930093-0093-4093-8093-000000000006'
    ) then
      raise exception 'LAN-93 pilot cleanup refused: staging.legacy_event_rows reference the scenario event and would be silently nulled.';
    end if;
  end if;

  -- (e) Containment. Nothing outside the scenario may be hanging off the
  --     scenario's parents. These would be blocked by `on delete restrict`;
  --     naming them turns a foreign-key error into an instruction.
  if exists (
    select 1 from public.events
     where season_id = '00930093-0093-4093-8093-000000000003'
       and id <> '00930093-0093-4093-8093-000000000006'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: another event exists in the scenario season. Investigate before deleting anything.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where season_id = '00930093-0093-4093-8093-000000000003'
       and id <> '00930093-0093-4093-8093-000000000005'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: another season membership exists in the scenario season.';
  end if;

  if exists (
    select 1 from public.seasons
     where position_vocabulary_id = '00930093-0093-4093-8093-000000000001'
       and id <> '00930093-0093-4093-8093-000000000003'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: another season uses the scenario position vocabulary.';
  end if;

  if exists (
    select 1 from public.positions
     where vocabulary_id = '00930093-0093-4093-8093-000000000001'
       and id <> '00930093-0093-4093-8093-000000000002'
  ) then
    raise exception 'LAN-93 pilot cleanup refused: another position belongs to the scenario vocabulary.';
  end if;

  raise notice 'LAN-93 pilot cleanup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The deletion, in reverse dependency order
-- ---------------------------------------------------------------------------
-- Each statement is keyed on the deterministic identifier AND the sentinel. If
-- the sentinel half ever stops matching, the row is not deleted and the parent
-- delete then fails on its foreign key — the transaction aborts rather than
-- half-removing the scenario.

delete from public.events
 where id = '00930093-0093-4093-8093-000000000006'
   and name like 'PILOT-LAN-93%';

delete from public.season_memberships
 where id = '00930093-0093-4093-8093-000000000005'
   and person_id = '00930093-0093-4093-8093-000000000004'
   and season_id = '00930093-0093-4093-8093-000000000003';

-- Paired on the display alias, which is this person's half of the ownership
-- marker since LAN-182 struck `people.known_as`. The alias row goes with them,
-- by the cascade on `person_aliases.person_id` — deleting it first would remove
-- the very evidence this statement pairs the identifier against.
delete from public.people
 where id = '00930093-0093-4093-8093-000000000004'
   and exists (select 1 from public.person_aliases a
                where a.person_id = people.id and a.alias = 'PILOT-LAN-93');

delete from public.seasons
 where id = '00930093-0093-4093-8093-000000000003'
   and label like 'PILOT-LAN-93%';

delete from public.positions
 where id = '00930093-0093-4093-8093-000000000002'
   and label like 'PILOT-LAN-93%';

delete from public.position_vocabularies
 where id = '00930093-0093-4093-8093-000000000001'
   and code = 'pilot-lan-93';

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect six rows, every `scenario_rows` zero. The durable counts are printed
-- alongside so the "nothing else went with it" check needs no second query.
select
  'position_vocabularies' as table_name,
  count(*) filter (where id = '00930093-0093-4093-8093-000000000001') as scenario_rows
  from public.position_vocabularies
union all
select 'positions', count(*) filter (where id = '00930093-0093-4093-8093-000000000002')
  from public.positions
union all
select 'seasons', count(*) filter (where id = '00930093-0093-4093-8093-000000000003')
  from public.seasons
union all
select 'people', count(*) filter (where id = '00930093-0093-4093-8093-000000000004')
  from public.people
union all
select 'season_memberships', count(*) filter (where id = '00930093-0093-4093-8093-000000000005')
  from public.season_memberships
union all
select 'events', count(*) filter (where id = '00930093-0093-4093-8093-000000000006')
  from public.events;

select
  'durable foundation — must be unchanged' as check,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.operator_accounts) as operator_accounts,
  (select count(*) from public.role_assignments) as role_assignments,
  (select count(*) from public.audit_events) as audit_events;

commit;
