-- LAN-75 roster and activation — CLEANUP.
--
-- Removes the scenario setup.sql creates, the onboarding items it caused the
-- application to generate, and the returner created through the interface.
-- Nothing else.
--
-- Run by a human, and — per the retention policy in
-- docs/pilot-data-runbook.md — once the scenario is no longer needed.
--
-- Safe to run twice: every delete is keyed on rows that are gone after the
-- first run, so the second removes nothing and reports the same zeros.
--
-- Safe to run never: leaving the scenario in place breaks nothing, but see the
-- warning about item types below — it is the one part of this scenario that
-- reaches memberships other than its own.
--
-- ---------------------------------------------------------------------------
-- AUDIT HISTORY IS KEPT, DELIBERATELY
-- ---------------------------------------------------------------------------
-- This script deletes no `audit_events` row. `entity_id` is not a foreign key
-- precisely so that an audit row outlives its subject, and the activation this
-- scenario exists to exercise is a real thing an operator really did. Removing
-- the record of it would be rewriting history to tidy up a test — which is why
-- LAN-74's and LAN-76's cleanups keep theirs too.
--
-- What is removed is the synthetic person, membership, contacts, onboarding and
-- status history. What stays is the fact that somebody activated something, and
-- who.
--
-- ---------------------------------------------------------------------------
-- TWO KINDS OF ROW, AND WHY THE SECOND IS DIFFERENT
-- ---------------------------------------------------------------------------
-- **Rows setup.sql wrote** carry both halves of the marker — a deterministic
-- identifier and the PILOT-LAN-75 sentinel in a text column. The three
-- `onboarding_item_types` are deleted that way: `id = '…' and label like
-- '%PILOT-LAN-75%'`.
--
-- **Everything hanging off a person** cannot be. The returner the tester
-- creates through the interface has no identifier this script could know,
-- because PostgreSQL generates it when they press Save; and the status events
-- the application writes against the scenario membership have none either.
-- Those are removed by the sentinel-only shape in
-- docs/pilot-data-runbook.md § The ownership marker, and every one of those
-- deletes conjoins **two independent narrowings**: membership of the target set
-- this script's own preflight built, AND the sentinel itself. Neither alone
-- would be enough, and there is no `or` anywhere in this file.
--
-- The intake form collects First name, Last name, Email and Phone and nothing
-- else — it deliberately stopped asking for a nickname — so the surname is the
-- only field a tester can put a sentinel in. `known_as` is matched as well,
-- because that is where setup.sql's own person carries it: a script insert is
-- not limited to the form's fields. Both are matched with `in (…)` rather than
-- `or`, so the predicate cannot widen by accident.
--
-- ## Ownership marker: sentinel only
--
-- This scenario uses that shape, and `tests/pilot-data-contract.test.ts` pins
-- every table and every predicate it may use it for.
--
-- ---------------------------------------------------------------------------
-- THE ITEM TYPES REACH FURTHER THAN THIS SCENARIO — READ THIS
-- ---------------------------------------------------------------------------
-- setup.sql adds three onboarding item types to the OPEN SEASON, not to one
-- membership, because that is where the schema puts them. So while the scenario
-- is installed, every membership confirmed through the application receives
-- those three items — including any that are not scenario data.
--
-- That is the point (it is how item generation is tested), and it is why the
-- `onboarding_items` delete below is keyed on the item TYPE rather than on a
-- person: those rows are pilot rows wherever they landed. Nothing else about
-- the membership they were attached to is touched — the membership, its person,
-- its status history and its audit trail all survive, and only the three pilot
-- items disappear from it.
--
-- If you would rather that never happened, run cleanup as soon as the scenario
-- has served its purpose. The retention policy in the runbook says the same.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS SCRIPT WILL NOT DO
-- ---------------------------------------------------------------------------
--   * It will not remove an auth user, an operator account, a role assignment
--     or any durable pilot identity. The preflight refuses outright.
--   * It will not remove a person who is an actor in any history, because
--     invariant M2 requires an actor to stay resolvable.
--   * It will not remove an onboarding item type the club configured itself, a
--     season, a role, an audit row, or any reference data.
--
-- Paired with setup.sql in this directory. Read README.md there first.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target and the intended deletion reviewable
-- ---------------------------------------------------------------------------
select
  'LAN-75 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (
    select count(*) from public.onboarding_item_types
     where label like '%PILOT-LAN-75%'
  ) as scenario_item_types,
  (
    select count(*) from public.onboarding_items i
     where i.item_type_id in (
       select id from public.onboarding_item_types where label like '%PILOT-LAN-75%')
  ) as items_pointing_at_them,
  (
    select count(distinct i.season_membership_id) from public.onboarding_items i
     where i.item_type_id in (
       select id from public.onboarding_item_types where label like '%PILOT-LAN-75%')
  ) as memberships_affected,
  (
    select count(*) from public.people
     where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))
  ) as pilot_people,
  -- Printed so the operator can see they do not change.
  (select count(*) from public.operator_accounts) as operator_accounts_untouched,
  (select count(*) from public.roles) as roles_untouched,
  (select count(*) from public.seasons) as seasons_untouched,
  (select count(*) from public.audit_events) as audit_rows_kept;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: build the target set, then refuse rather than widen
-- ---------------------------------------------------------------------------
do $preflight$
declare
  sentinel constant text := 'PILOT-LAN-75';
  scenario_person constant uuid := '00750075-0075-4075-8075-000000000010';
  scenario_membership constant uuid := '00750075-0075-4075-8075-000000000020';
  offender text;
begin
  -- (a) Every scenario identifier still present must carry the sentinel. If one
  --     does not, somebody else's row is sitting on it and this script must not
  --     delete it.
  if exists (
    select 1 from public.people
     where id = scenario_person and (select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1) is distinct from sentinel
  ) then
    raise exception 'LAN-75 pilot cleanup refused: people …0010 is not this scenario''s row. Refusing to delete somebody else''s person.';
  end if;

  select string_agg(t.id::text, ', ') into offender
    from public.onboarding_item_types t
   where t.id in (
     '00750075-0075-4075-8075-000000000001',
     '00750075-0075-4075-8075-000000000002',
     '00750075-0075-4075-8075-000000000003'
   )
     and position(sentinel in t.label) = 0;

  if offender is not null then
    raise exception 'LAN-75 pilot cleanup refused: onboarding_item_types % do not carry the % sentinel.', offender, sentinel;
  end if;

  select string_agg(c.id::text, ', ') into offender
    from public.contact_points c
   where c.id in (
     '00750075-0075-4075-8075-000000000011',
     '00750075-0075-4075-8075-000000000012'
   )
     and c.source is distinct from sentinel;

  if offender is not null then
    raise exception 'LAN-75 pilot cleanup refused: contact_points % do not carry the % sentinel.', offender, sentinel;
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = scenario_membership and person_id is distinct from scenario_person
  ) then
    raise exception 'LAN-75 pilot cleanup refused: season_memberships …0020 belongs to somebody else.';
  end if;

  -- (b) The target set: every person this script may delete. Built once, here,
  --     so the deletes below and the refusals below agree about who they mean.
  --
  --     A temporary table rather than a schema object — it lives with the
  --     session and adds no concept to the database. Dropped first as well as
  --     `on commit drop`, because the latter only fires at COMMIT: running this
  --     script twice inside one editor session, or inside a test's own
  --     transaction, would otherwise collide on the second run.
  --     `pg_temp.`-qualified deliberately: unqualified, the name resolves
  --     through `search_path`, which on the first run of a session is `public`.
  drop table if exists pg_temp.pilot_lan_75_targets;
  create temporary table pilot_lan_75_targets on commit drop as
  select p.id as person_id
    from public.people p
   where sentinel in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = p.id and da.is_display_name limit 1))), upper(btrim(p.family_name)));

  -- (c) The durable foundation. A scenario cleanup never removes an identity
  --     that has become one — and `on delete restrict` would stop it anyway;
  --     these exist so the operator gets a sentence instead of a foreign-key
  --     error, and so the rule is visible in the file rather than implied.
  if exists (
    select 1 from public.operator_accounts
     where person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete is linked to an operator account. Durable identities are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.role_assignments
     where person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete holds a role assignment. Access records are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.role_assignments
     where appointed_by_person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete granted a role assignment. Access records are never removed by a scenario cleanup.';
  end if;

  -- (d) Invariant M2: an actor named in history must stay resolvable. The
  --     scenario's own rows name a script rather than a person, so this fires
  --     only if something unexpected happened.
  if exists (
    select 1 from public.audit_events
     where actor_person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete is an actor in audit_events. History must stay resolvable (invariant M2).';
  end if;

  if exists (
    select 1 from public.season_membership_status_events
     where actor_person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete is the recorded actor on a membership transition. History must stay resolvable (invariant M2).';
  end if;

  if exists (
    select 1 from public.onboarding_items
     where waived_by_person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete granted an onboarding waiver. History must stay resolvable (invariant M2).';
  end if;

  -- (e) Invariant I6, both directions. A merge is an audited operation that
  --     preserves both source identities, so neither side of one is a row a
  --     scenario cleanup may quietly remove.
  if exists (
    select 1 from public.people
     where id in (select person_id from pilot_lan_75_targets)
       and merged_into_person_id is not null
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a person this script would delete has been merged into another record. Resolve the merge by hand (invariant I6).';
  end if;

  if exists (
    select 1 from public.people
     where merged_into_person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: another record has been merged into a person this script would delete. Resolve the merge by hand (invariant I6).';
  end if;

  -- (f) The deletes below do not cover these tables, so a target that has
  --     acquired one is refused rather than half-removed.
  if exists (
    select 1
      from public.invitations i
      join public.season_memberships m on m.id = i.season_membership_id
     where m.person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a scenario person has an event invitation. This scenario creates none, so something else did — resolve it by hand.';
  end if;

  if exists (
    select 1
      from public.eligibility_records e
      join public.season_memberships m on m.id = e.season_membership_id
     where m.person_id in (select person_id from pilot_lan_75_targets)
  ) then
    raise exception 'LAN-75 pilot cleanup refused: a scenario person has an eligibility record. This scenario creates none, so something else did — resolve it by hand.';
  end if;

  raise notice 'LAN-75 pilot cleanup: preflight passed on database %.', current_database();
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The deletion, in reverse dependency order
-- ---------------------------------------------------------------------------
-- Every statement conjoins two independent narrowings, and none contains an
-- `or`. The keyed ones name a deterministic identifier and the sentinel; the
-- sentinel-only ones name the target set this script's own preflight built and
-- the sentinel, and are pinned table-by-table and predicate-by-predicate in
-- `tests/pilot-data-contract.test.ts`.

-- 1. Onboarding items — every row pointing at a pilot item type, wherever it
--    landed. Keyed on the type rather than on a person, because while the
--    scenario is installed the application attaches these to every membership
--    it confirms. See the warning at the head of this file.
delete from public.onboarding_items
 where item_type_id in (select id from public.onboarding_item_types where id in ('00750075-0075-4075-8075-000000000001', '00750075-0075-4075-8075-000000000002', '00750075-0075-4075-8075-000000000003'))
   and item_type_id in (select id from public.onboarding_item_types where label like '%PILOT-LAN-75%');

-- 1b. Every OTHER onboarding item on a membership this script is about to
--     delete — the ones generated from the club's own item types rather than
--     this scenario's.
--
--     `generateOnboardingItems` inserts one row for **every** type configured
--     on the season, not just the pilot's three. So a returner created through
--     the interface while the scenario is installed carries the club's items
--     too, statement 1 above does not reach them, and deleting their membership
--     at statement 3 hit `onboarding_items_membership_season` — a foreign key
--     with no `on delete` clause — and aborted the whole script with a raw
--     integrity error.
--
--     Independent review found this by running the real generation predicate
--     rather than the one the scenario test had been hand-rolling. It fails
--     closed (one transaction, nothing deleted) and cannot fire on a hosted
--     project with no item types of its own — but setup.sql explicitly permits
--     the club to have some, which makes it reachable, and the scenario would
--     then be uncleanable by its own script.
--
--     Scoped to the target memberships, so it cannot reach an item belonging to
--     anybody this script is not already removing entirely.
delete from public.onboarding_items
 where season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_75_targets))
   and season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))));

-- 2. Status history — the scenario's own two rows, everything the application
--    wrote against the scenario membership while it was exercised, and the
--    history of the returner created through the interface. All three are one
--    set: memberships belonging to a person in the target set.
delete from public.season_membership_status_events
 where season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_75_targets))
   and season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))));

-- 3. Memberships.
delete from public.season_memberships
 where person_id in (select person_id from pilot_lan_75_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))));

-- 4. Contact points and aliases.
delete from public.contact_points
 where person_id in (select person_id from pilot_lan_75_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))));

-- Display aliases are deliberately left to the cascade. Since LAN-182 the alias
-- flagged as a person's display name is what carries this scenario's sentinel,
-- so it is the ownership marker the `people` delete below pairs against;
-- removing it here would leave every one of those statements matching nothing.
-- Every other alias on a swept person is removed here, explicitly.
delete from public.person_aliases
 where person_id in (select person_id from pilot_lan_75_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))))
   and not is_display_name;

-- 5. The people themselves.
delete from public.people
 where id in (select person_id from pilot_lan_75_targets)
   and 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)));

-- 6. The season's pilot onboarding configuration, last — nothing may point at
--    it by now, and if anything still does the foreign key will say so rather
--    than let this script leave a dangling reference. One statement each, so a
--    single identifier can never widen into a prefix match.
delete from public.onboarding_item_types
 where id = '00750075-0075-4075-8075-000000000001' and label like '%PILOT-LAN-75%';

delete from public.onboarding_item_types
 where id = '00750075-0075-4075-8075-000000000002' and label like '%PILOT-LAN-75%';

delete from public.onboarding_item_types
 where id = '00750075-0075-4075-8075-000000000003' and label like '%PILOT-LAN-75%';

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect every `remaining` to be zero, and the durable counts to be unchanged
-- from the first result set. `audit_rows_kept` is expected to be unchanged too:
-- this script removes no history.
select
  'LAN-75 pilot cleanup — result' as check,
  (
    select count(*) from public.onboarding_item_types where label like '%PILOT-LAN-75%'
  ) as item_types_remaining,
  (
    select count(*) from public.onboarding_items i
     where i.item_type_id in (
       select id from public.onboarding_item_types where label like '%PILOT-LAN-75%')
  ) as items_remaining,
  (
    select count(*) from public.people
     where 'PILOT-LAN-75' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))
  ) as people_remaining,
  (
    select count(*) from public.contact_points where source = 'PILOT-LAN-75'
  ) as contacts_remaining,
  (
    select count(*) from public.season_memberships
     where id = '00750075-0075-4075-8075-000000000020'
  ) as memberships_remaining,
  (
    select count(*) from public.season_membership_status_events
     where season_membership_id = '00750075-0075-4075-8075-000000000020'
  ) as status_events_remaining,
  -- Unchanged. If any of these moved, roll back.
  (select count(*) from public.operator_accounts) as operator_accounts_untouched,
  (select count(*) from public.roles) as roles_untouched,
  (select count(*) from public.seasons) as seasons_untouched,
  (select count(*) from public.audit_events) as audit_rows_kept;

commit;
