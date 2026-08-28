-- LAN-74 returner intake — CLEANUP.
--
-- Removes the duplicate-candidate scenario setup.sql creates, and the returner
-- created through the interface while testing it. Nothing else.
--
-- Run by a human, and — per the retention policy in
-- docs/pilot-data-runbook.md — normally NOT immediately after the feature test:
-- pilot data is allowed to accumulate so later features can be exercised
-- against earlier ones. This script is retained for the cutover, or run early
-- when the data is conflicting or misleading.
--
-- Safe to run twice: every delete is keyed on rows that are gone after the
-- first run, so a second removes nothing and raises nothing.
--
-- Safe to run never: leaving the scenario in place breaks nothing.
--
-- ---------------------------------------------------------------------------
-- TWO KINDS OF ROW, AND WHY THE SECOND IS DIFFERENT
-- ---------------------------------------------------------------------------
-- **Scenario rows** are the ones setup.sql wrote. Each is deleted by its
-- deterministic primary key AND the PILOT-LAN-74 sentinel, exactly as
-- docs/pilot-data-runbook.md § "The ownership marker" requires. Both halves,
-- every time.
--
-- **The returner created through the interface** cannot be. The application
-- mints `people.id` with `gen_random_uuid()`, so no script can know it in
-- advance — and LAN-74 requires this cleanup to remove it anyway, which is why
-- the test instructions in README.md tell the tester to type the sentinel into
-- the **Last name** field and to use an `example.invalid` address.
--
-- It was the "Known as" field until the intake form stopped collecting a
-- nickname. A sweep keyed on a column the application never writes matches
-- nothing — and silently: the preflight counter, the verification query at the
-- foot of this file and README's "what was left behind" query would all have
-- reported clean while the rows stayed in production. The marker has to live in
-- a field the form actually has.
--
-- The same argument applies to how it is spelled, which is why every comparison
-- here is `upper(btrim(…))`. A tester who types `pilot-lan-74`, or leaves a
-- trailing space, would otherwise leave rows behind that every count in this
-- file reports as absent.
--
-- Both homes are still recognised. Scenario rows carry the sentinel as their
-- display alias, because setup.sql can write one and person …0001 is
-- deliberately first-name-only so it has no family name to carry one. Rows the
-- interface creates carry it in `family_name`. The predicate reads either,
-- forgives case and surrounding spaces, and puts no disjunction inside a
-- delete.
--
-- It used to read `known_as`. LAN-182 struck that column and moved the name a
-- person is shown under into `person_aliases`, so the alias-flagged row is
-- where the sentinel now lives — the same rows are in scope, found through the
-- table that now holds the fact.
--
-- Five of the deletes below are therefore keyed on the sentinel alone. That is
-- the second ownership shape, governed by ADR 0019 — LAN-76 uses it too, so
-- this is not the only such delete in the repository, and each of these five is
-- pinned by value in SENTINEL_ONLY_DELETES in tests/pilot-data-contract.test.ts.
-- They are fenced by refusing outright if the
-- person it would remove has become anything other than scenario data: an
-- operator account, a role assignment, an actor in the audit trail, an alias,
-- or a membership in a season this scenario has nothing to do with. Each of
-- those refusals is exercised by a test. A sweep that is narrow because it is
-- guarded is honest; a sweep that is narrow because nobody has tried to widen
-- it is not.
--
-- WHAT THIS SCRIPT WILL NOT DO
--   * It never deletes from auth.users, public.operator_accounts,
--     public.role_assignments, public.roles or public.audit_events. The audit
--     rows LAN-74 writes survive by design — `audit_events` is deliberately not
--     foreign-keyed to its subject precisely so history outlives the row it
--     describes (invariant M2, review F13).
--   * It never deletes a season. The open season belongs to the permanent pilot
--     foundation, and this scenario only borrows it.
--   * It never widens. Where a foreign row hangs off one of the scenario's
--     rows, the preflight aborts rather than removing it — including the cases
--     PostgreSQL would otherwise cascade or null out, enumerated below.
--
-- Anything the preflight does not anticipate is caught by the schema's
-- `on delete restrict` foreign keys: the delete fails, the transaction rolls
-- back, and the scenario is left exactly as it was. Establish actual state with
-- the verification query in README.md before deciding what to do next; never
-- "fix" it by deleting the blocking row.

begin;

-- ---------------------------------------------------------------------------
-- Preflight, part 1 of 2: make the target and the intended deletion reviewable
-- ---------------------------------------------------------------------------
select
  'LAN-74 pilot cleanup — target' as check,
  current_database() as database,
  current_user as connected_as,
  now() as at,
  (
    select count(*) from public.people
     where id in (
       '00740074-0074-4074-8074-000000000001',
       '00740074-0074-4074-8074-000000000003'
     )
  ) as scenario_people,
  (
    select count(*) from public.people
     where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))
       and id not in (
         '00740074-0074-4074-8074-000000000001',
         '00740074-0074-4074-8074-000000000003'
       )
  ) as interface_created_people,
  (select count(*) from public.people) as people_rows_before,
  (select count(*) from public.audit_events) as audit_rows_before,
  (select count(*) from public.operator_accounts) as operator_account_rows_before,
  (select count(*) from public.seasons) as season_rows_before;

-- ---------------------------------------------------------------------------
-- Preflight, part 2 of 2: refuse rather than widen
-- ---------------------------------------------------------------------------
do $preflight$
declare
  sentinel constant text := 'PILOT-LAN-74';
  person_a constant uuid := '00740074-0074-4074-8074-000000000001';
  person_b constant uuid := '00740074-0074-4074-8074-000000000003';
  scenario_people constant uuid[] := array[person_a, person_b];
  swept uuid[];
begin
  -- (a) Every table this script deletes from must exist.
  if to_regclass('public.season_membership_status_events') is null
     or to_regclass('public.season_memberships') is null
     or to_regclass('public.contact_points') is null
     or to_regclass('public.person_aliases') is null
     or to_regclass('public.people') is null then
    raise exception 'LAN-74 pilot cleanup refused: the expected schema is not present.';
  end if;

  -- (b) Ownership of the scenario's own rows. If a deterministic identifier is
  --     occupied by a row without this scenario's sentinel, it is somebody
  --     else's row and this script stops.
  if exists (
    select 1 from public.people p
     where p.id = person_a
       and not exists (
         select 1 from public.person_aliases a
          where a.person_id = p.id and a.alias = sentinel)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: people …0001 does not carry the PILOT-LAN-74 sentinel. Refusing to delete a person record this scenario does not own.';
  end if;

  if exists (
    select 1 from public.people p
     where p.id = person_b
       and not exists (
         select 1 from public.person_aliases a
          where a.person_id = p.id and a.alias = sentinel)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: people …0003 does not carry the PILOT-LAN-74 sentinel. Refusing to delete a person record this scenario does not own.';
  end if;

  -- The alias rows are the scenario's own since LAN-182, so their identifiers
  -- are guarded the same way every other identifier in the block is.
  if exists (
    select 1 from public.person_aliases
     where id in (
       '00740074-0074-4074-8074-000000000091',
       '00740074-0074-4074-8074-000000000093'
     )
       and (alias is distinct from sentinel or source is distinct from sentinel)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person_aliases row in this scenario''s identifier block is not this scenario''s.';
  end if;

  if exists (
    select 1 from public.contact_points
     where id in (
       '00740074-0074-4074-8074-000000000002',
       '00740074-0074-4074-8074-000000000004',
       '00740074-0074-4074-8074-000000000005'
     )
       and source is distinct from sentinel
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a contact_points row in this scenario''s identifier block does not carry the sentinel.';
  end if;

  if exists (
    select 1 from public.season_memberships
     where id = '00740074-0074-4074-8074-000000000006'
       and person_id <> person_a
  ) then
    raise exception 'LAN-74 pilot cleanup refused: season_memberships …0006 is not this scenario''s row.';
  end if;

  -- (c) The sweep's membership. Everything the sentinel-only delete would
  --     remove, resolved once and then checked. Resolving it first is what lets
  --     every check below say "and this is why we are not touching it".
  select coalesce(array_agg(id), '{}')
    into swept
    from public.people
   where sentinel in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))
     and id <> all (scenario_people);

  -- Materialised so that the statements which DELETE use exactly the set that
  -- was VALIDATED. The SQL editor runs this transaction at READ COMMITTED, so
  -- each statement takes its own snapshot: re-deriving the sentinel match at
  -- delete time would remove a person created through the interface *after*
  -- these guards ran, having passed none of them. A temporary table is dropped
  -- with the session and adds no schema concept to the database.
  -- Dropped first as well as `on commit drop`: the latter only fires at
  -- COMMIT, so running this script twice inside one editor session — or inside
  -- a test's own transaction — would otherwise collide on the second run.
  -- `pg_temp.`-qualified deliberately. Unqualified, the name resolves through
  -- `search_path`, and on the first run of a session — when no temp table
  -- exists yet — that is `public`. A permanent table of the same name would be
  -- dropped inside a transaction that then commits.
  drop table if exists pg_temp.pilot_lan_74_targets;
  create temporary table pilot_lan_74_targets on commit drop as
  select unnest(scenario_people || swept) as person_id;

  -- (d) The durable foundation. A scenario cleanup never removes an identity
  --     that has become one — and `on delete restrict` would stop it anyway;
  --     these exist so the operator gets a sentence instead of a foreign-key
  --     error, and so the rule is visible in the file rather than implied.
  if exists (
    select 1 from public.operator_accounts
     where person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete is linked to an operator account. Durable identities are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.role_assignments
     where person_id in (select person_id from pilot_lan_74_targets)
        or appointed_by_person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete holds or granted a role assignment. Access records are never removed by a scenario cleanup.';
  end if;

  if exists (
    select 1 from public.audit_events
     where actor_person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete is an actor in audit_events. History must stay resolvable (invariant M2).';
  end if;

  if exists (
    select 1 from public.season_membership_status_events
     where actor_person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete is the recorded actor on a membership transition. History must stay resolvable (invariant M2).';
  end if;

  -- (e) Invariant I6, both directions. A merge is an audited operation that
  --     preserves both source identities, so neither side of one is a row a
  --     scenario cleanup may quietly remove.
  if exists (
    select 1 from public.people
     where id in (select person_id from pilot_lan_74_targets)
       and merged_into_person_id is not null
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete has been merged into another record. Resolve the merge by hand (invariant I6).';
  end if;

  if exists (
    select 1 from public.people
     where merged_into_person_id in (select person_id from pilot_lan_74_targets)
        or merged_by_person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: another person record was merged into, or merged by, one this script would delete. Removing it would orphan that provenance (invariant I6).';
  end if;

  -- (f) Rows PostgreSQL would remove or alter WITHOUT being asked.
  --
  --     Exactly four foreign keys in this schema are `on delete cascade` or
  --     `on delete set null` and point at a table this script deletes from:
  --     `contact_points(person_id)`, `person_aliases(person_id)` and
  --     `person_emergency_contacts(person_id)` cascade from `people`, and
  --     `staging.legacy_roster_rows(matched_person_id)` is nulled. All four are
  --     named here, and a test reads `pg_constraint` to prove the list is still
  --     complete — so a later migration adding a fifth fails a test rather than
  --     silently turning a narrow delete into a wide one.
  --
  --     It said three until LAN-182 added the emergency contact. That is the
  --     mechanism working: the migration did not have to remember this file,
  --     because the test named it.
  --
  --     This script removes contact points and aliases explicitly, in order,
  --     rather than relying on the cascade. A row it does NOT own must still
  --     stop it: the scenario's own contacts carry the sentinel, and the
  --     interface-created returner's carry an `example.invalid` address because
  --     README.md tells the tester to enter one.
  --     UX-10 has a Phone field as well as an Email field, and README step 4
  --     tells the tester what to put in both: an `example.invalid` address and
  --     a number in Ofcom's reserved `07700 900xxx` drama range. Both are
  --     recognised here. A contact that is neither — a real address, a real
  --     number — is not this scenario's, and stops the script rather than
  --     being cascade-deleted with the person.
  --
  --     Both patterns anchor the WHOLE value and are scoped BY KIND, and both
  --     are permits: matching means the guard does not fire.
  --
  --     `raw_value` is deliberately unvalidated free text, so anchoring only
  --     the reserved token is not enough. Anchored at one end alone, a value
  --     carrying a real address and a reserved one together would be permitted
  --     and cascade-deleted with its person; unscoped by kind, the phone
  --     pattern would permit an email that merely began with the drama range.
  --     The value must be the reserved contact and nothing else.
  --
  --     (Deliberately described rather than exemplified: this file is scanned
  --     by tests/pilot-data-contract.test.ts, and a routable example address
  --     written out in a comment is precisely what that scan exists to catch.)
  if exists (
    select 1 from public.contact_points
     where person_id in (select person_id from pilot_lan_74_targets)
       and source is distinct from sentinel
       and not (
         kind = 'email'
         and raw_value ~* '^[[:space:]]*[^[:space:]@]+@([a-z0-9-]+\.)*example\.invalid[[:space:]]*$'
       )
       and not (
         kind = 'phone'
         and raw_value ~ '^[[:space:]]*(\+44[[:space:]]?|0)7700[[:space:]]?900[0-9]{3}[[:space:]]*$'
       )
  ) then
    raise exception 'LAN-74 pilot cleanup refused: contact_points that this scenario did not create hang off a person it would delete, and would be cascade-deleted.';
  end if;

  -- The scenario writes exactly two aliases now — since LAN-182 they ARE the
  -- sentinel — so this refusal narrowed rather than disappeared: any other
  -- alias hanging off a scenario person is a record somebody else made, and it
  -- still stops this script.
  if exists (
    select 1 from public.person_aliases
     where person_id = any (scenario_people)
       and id not in (
         '00740074-0074-4074-8074-000000000091',
         '00740074-0074-4074-8074-000000000093'
       )
  ) then
    raise exception 'LAN-74 pilot cleanup refused: person_aliases rows this scenario did not write hang off a scenario person and would be cascade-deleted.';
  end if;

  -- LAN-182's new table, and the fourth cascade. An emergency contact is
  -- third-party personal data about somebody who never agreed to be in this
  -- system; it must never leave by a side effect of a scenario teardown.
  if exists (
    select 1 from public.person_emergency_contacts
     where person_id in (select person_id from pilot_lan_74_targets)
        or person_id = any (scenario_people)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: person_emergency_contacts rows hang off a person this script would delete and would be cascade-deleted. The scenario creates none.';
  end if;

  -- The staging check is nested rather than combined with `and`: plpgsql plans
  -- each statement when it is first reached, so a nested `if` is genuinely
  -- skipped when the staging schema is absent, while one combined boolean
  -- expression would be planned — and fail — either way.
  if to_regclass('staging.legacy_roster_rows') is not null then
    if exists (
      select 1 from staging.legacy_roster_rows
       where matched_person_id in (select person_id from pilot_lan_74_targets)
    ) then
      raise exception 'LAN-74 pilot cleanup refused: staging.legacy_roster_rows reference a person this script would delete and would be silently nulled.';
    end if;
  end if;

  -- (g) Containment. Nothing outside this scenario may hang off the rows it
  --     removes. Every one of these would be blocked by `on delete restrict`
  --     or a composite foreign key anyway; naming them turns a foreign-key
  --     error into an instruction.
  if exists (
    select 1 from public.recruitment_prospects
     where person_id in (select person_id from pilot_lan_74_targets)
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a recruitment prospect record exists for a person this script would delete.';
  end if;

  -- Checked BEFORE the broader "holds a membership this scenario did not
  -- create" below, because a carried-forward membership satisfies both and this
  -- is the message that tells the operator what actually happened. Ordering
  -- preflight checks from specific to general is what makes a refusal an
  -- instruction rather than a puzzle.
  if exists (
    select 1 from public.season_memberships m
     where m.carried_forward_from_id in (
       select id from public.season_memberships
        where person_id in (select person_id from pilot_lan_74_targets)
     )
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a later membership was carried forward from one this script would delete.';
  end if;

  -- A membership in the OPEN season held by one of these people is expected,
  -- not suspicious: README step 3 tells the tester to select candidate …0003
  -- and create exactly that, and the returner from step 4 has one too. Those
  -- are this scenario's own residue and are removed below.
  --
  -- A membership in any OTHER season is not. Nothing in this scenario or its
  -- test instructions can produce one, so its existence means the identifier
  -- has been reused by something else, and this script stops rather than
  -- deleting a row from a season it never looked at.
  if exists (
    select 1
      from public.season_memberships m
      join public.seasons s on s.id = m.season_id
     where m.person_id in (select person_id from pilot_lan_74_targets)
       and s.status not in ('open', 'active')
  ) then
    raise exception 'LAN-74 pilot cleanup refused: a person this script would delete holds a membership in a season other than the open one. Investigate before deleting anything.';
  end if;

  -- Everything the slice can hang off a membership. A returner created through
  -- the interface has none of these — LAN-74 creates no position, jersey,
  -- onboarding item, eligibility record, availability record, audience entry,
  -- invitation or attendance record — so any that exist were put there by
  -- something else.
  if exists (
    select 1
      from public.season_memberships m
     where m.person_id in (select person_id from pilot_lan_74_targets)
       and (
         exists (select 1 from public.onboarding_items x where x.season_membership_id = m.id)
         or exists (select 1 from public.position_assignments x where x.season_membership_id = m.id)
         or exists (select 1 from public.jersey_assignments x where x.season_membership_id = m.id)
         or exists (select 1 from public.eligibility_records x where x.season_membership_id = m.id)
         or exists (select 1 from public.availability_statuses x where x.season_membership_id = m.id)
         or exists (select 1 from public.event_audience_members x where x.season_membership_id = m.id)
         or exists (select 1 from public.invitations x where x.season_membership_id = m.id)
         or exists (select 1 from public.attendance_records x where x.season_membership_id = m.id)
       )
  ) then
    raise exception 'LAN-74 pilot cleanup refused: squad, onboarding, availability, audience, invitation or attendance records hang off a membership this script would delete.';
  end if;

  raise notice 'LAN-74 pilot cleanup: preflight passed on database %; sweeping % interface-created people.',
    current_database(), coalesce(array_length(swept, 1), 0);
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The deletion, in reverse dependency order
-- ---------------------------------------------------------------------------
-- Order is by dependency, NOT by "scenario rows first". Every person this
-- script removes — the two scenario people and every swept one — must lose
-- their status history, then their memberships, then their contacts and
-- aliases, before any of them can be deleted. Deleting the scenario people
-- earlier would abort on `season_memberships_person_id_fkey`
-- (`on delete restrict`) the moment a tester had followed README step 3, which
-- creates a membership for scenario person …0003 through the interface.
--
-- Two shapes, per ADR 0019. Rows setup.sql wrote are deleted by their own
-- deterministic identifier AND the sentinel — one statement per identifier, so
-- each predicate is exactly the `id = '…'` pair the contract test pins. Rows
-- the APPLICATION wrote have no identifier any script can know, and are deleted
-- by the sentinel alone; those five statements are pinned by value in
-- `SENTINEL_ONLY_DELETES`, and adding them there is Brian's decision.

-- 1. Status history — the scenario's own two rows, one statement each.
delete from public.season_membership_status_events
 where id = '00740074-0074-4074-8074-000000000007'
   and actor_label = 'PILOT-LAN-74 setup script';

delete from public.season_membership_status_events
 where id = '00740074-0074-4074-8074-000000000008'
   and actor_label = 'PILOT-LAN-74 setup script';

-- … then every transition of every membership held by a person this script is
-- removing, including the ones the application wrote.
delete from public.season_membership_status_events
 where season_membership_id in (select id from public.season_memberships where person_id in (select person_id from pilot_lan_74_targets))
   and season_membership_id in (select id from public.season_memberships where person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))));

-- 2. Memberships — the scenario's own row, then the ones created through the
--    interface: README step 3's on scenario person …0003, and step 4's on the
--    new returner.
delete from public.season_memberships
 where id = '00740074-0074-4074-8074-000000000006'
   and person_id = '00740074-0074-4074-8074-000000000001';

delete from public.season_memberships
 where person_id in (select person_id from pilot_lan_74_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))));

-- 3. Contact points — the scenario's own three, one statement each, then
--    anything the interface recorded against these people.
delete from public.contact_points
 where id = '00740074-0074-4074-8074-000000000002'
   and source = 'PILOT-LAN-74';

delete from public.contact_points
 where id = '00740074-0074-4074-8074-000000000004'
   and source = 'PILOT-LAN-74';

delete from public.contact_points
 where id = '00740074-0074-4074-8074-000000000005'
   and source = 'PILOT-LAN-74';

delete from public.contact_points
 where person_id in (select person_id from pilot_lan_74_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))));

-- Aliases. Display aliases are deliberately left to the cascade: since LAN-182
-- the alias flagged as a person's display name is what carries this scenario's
-- sentinel, so it is the ownership marker the `people` deletes below pair
-- against, and removing it here would leave every one of them matching nothing.
-- Every other alias on a swept person is removed here, explicitly.
delete from public.person_aliases
 where person_id in (select person_id from pilot_lan_74_targets)
   and person_id in (select id from public.people where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name))))
   and not is_display_name;

-- 4. The people themselves, last — the scenario's two by identifier and
--    sentinel, then the returner created through the interface, whose sentinel
--    is in the last name because that is the field the form has.
delete from public.people
 where id = '00740074-0074-4074-8074-000000000001'
   and exists (select 1 from public.person_aliases a
                where a.person_id = people.id and a.alias = 'PILOT-LAN-74');

delete from public.people
 where id = '00740074-0074-4074-8074-000000000003'
   and exists (select 1 from public.person_aliases a
                where a.person_id = people.id and a.alias = 'PILOT-LAN-74');

delete from public.people
 where id in (select person_id from pilot_lan_74_targets)
   and 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)));

-- ---------------------------------------------------------------------------
-- Verification — read this before you commit
-- ---------------------------------------------------------------------------
-- Expect five rows, every `remaining` zero. The durable counts are printed
-- alongside so the "nothing else went with it" check needs no second query.
select
  'people carrying the sentinel' as check,
  count(*) filter (where 'PILOT-LAN-74' in (upper(btrim((select da.alias from public.person_aliases da where da.person_id = people.id and da.is_display_name limit 1))), upper(btrim(family_name)))) as remaining
  from public.people
union all
select 'scenario contact_points', count(*) filter (where source = 'PILOT-LAN-74')
  from public.contact_points
union all
select 'scenario memberships', count(*) filter (
    where id = '00740074-0074-4074-8074-000000000006'
  )
  from public.season_memberships
union all
select 'scenario status events', count(*) filter (
    where actor_label = 'PILOT-LAN-74 setup script'
  )
  from public.season_membership_status_events
union all
select 'scenario people by identifier', count(*) filter (
    where id in (
      '00740074-0074-4074-8074-000000000001',
      '00740074-0074-4074-8074-000000000003'
    )
  )
  from public.people;

select
  'durable foundation — must be unchanged' as check,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.operator_accounts) as operator_accounts,
  (select count(*) from public.role_assignments) as role_assignments,
  (select count(*) from public.audit_events) as audit_events,
  (select count(*) from public.seasons) as seasons;

commit;
