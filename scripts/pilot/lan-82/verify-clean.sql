-- LAN-82 consolidated pilot cleanup — VERIFICATION.
--
-- Read-only. This file contains no insert, update, delete, truncate or any
-- other statement that changes a row, and `tests/pilot-scenario-lan-82.test.ts`
-- fails if one is added. It is run BY HAND, by Brian, after every scenario
-- cleanup named in README.md has been run in the order given there.
--
-- It answers two questions. It **guards** the first and **reports** the second,
-- and the difference is not laziness:
--
--   1. Is every feature-specific synthetic record gone? A query can decide this
--      by itself, so it does, and it raises rather than reporting.
--   2. Is the durable pilot foundation — the approved Auth users, their Person
--      records, their operator accounts, their access and the audit history
--      that makes them resolvable — still there? The counts are printed, and a
--      human compares them with docs/pilot-data-manifest.md.
--
-- WHY THE SECOND IS NOT A GUARD
--
-- It was one, briefly: "zero operator accounts means a cleanup ate the
-- foundation". CI failed on it, and CI was right. CI's database seeds an Auth
-- user and never links an operator, so it has zero — and so does a freshly
-- migrated hosted project before anyone is provisioned. **A count taken after
-- the fact cannot tell "never provisioned" from "destroyed"**, and every
-- conditional that tries to (are there Auth users? are there audit rows?) is a
-- guess at prior state dressed up as a check.
--
-- What actually protects the foundation is stronger and is asserted elsewhere:
-- no cleanup.sql in this repository contains a delete against auth.users,
-- public.operator_accounts, public.role_assignments or public.roles, and
-- tests/pilot-data-contract.test.ts fails if one appears. That is a property of
-- the scripts, checked before they are ever run, rather than an inference from
-- the wreckage afterwards.
--
-- So the numbers below are evidence for a person holding the manifest, which is
-- the one comparison a script cannot make and a reader can.
--
-- WHY THE SWEEP IS DERIVED RATHER THAN LISTED
--
-- A hand-written list of "the columns a scenario stamps" is correct until the
-- next scenario stamps a new one, and its failure mode is silence: the query
-- reports clean because it never looked. So the sweep below enumerates every
-- character and JSON column in the `public` schema from the catalogue itself
-- and checks all of them. A new scenario, a new table or a new column is
-- covered the day it exists, without this file being edited.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--   * It removes nothing. If it reports a survivor, the answer is to establish
--     what that row is and run the owning scenario's cleanup — never to delete
--     it from here.
--   * It does not decide that a `PILOT-` row is safe to keep. Every match is
--     reported and the run fails.
--   * It does not touch, read out or print any personal value: it counts rows
--     and names tables and columns.
--
-- Paired with README.md in this directory. Read it first.
--
-- Transactional like every other script here, though it writes nothing: the
-- sweep collects its findings in a temporary table, and `on commit drop` needs
-- a transaction to be the thing it commits at. A failed verdict rolls the
-- transaction back, which discards the temporary table and nothing else.

begin;

-- ---------------------------------------------------------------------------
-- Where this is running
-- ---------------------------------------------------------------------------
select
  'LAN-82 consolidated cleanup verification' as check,
  current_database() as database,
  current_user as connected_as,
  now() as ran_at;

-- ---------------------------------------------------------------------------
-- Part 1 — every scenario sentinel, swept from the catalogue
-- ---------------------------------------------------------------------------
-- One row per surviving (table, column, sentinel), with a count. Empty is the
-- passing result, and the `do` block below turns "not empty" into a failure
-- rather than something a reader has to notice.
create temporary table lan82_survivors (
  table_name text,
  column_name text,
  sentinel text,
  rows bigint
) on commit drop;

-- The sweep and the verdict share one anonymous block, which is the convention
-- every script here follows: a second such block could carry a guard that the
-- structural rules in `tests/pilot-data-contract.test.ts` never look at, and a
-- weak guard nothing checks is the failure this whole file exists to avoid.
do $preflight$
declare
  col record;
  sentinel_value text;
  survivors bigint;
  detail text;
  accounts bigint;
begin
  -- Part 1 — every scenario sentinel, in every column that could hold one.
  for col in
    select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public'
       and t.table_type = 'BASE TABLE'
       and c.data_type in ('text', 'character varying', 'character', 'json', 'jsonb')
     order by c.table_name, c.column_name
  loop
    for sentinel_value in
      select unnest(array[
        'PILOT-LAN-74', 'PILOT-LAN-75', 'PILOT-LAN-76', 'PILOT-LAN-77',
        'PILOT-LAN-78', 'PILOT-LAN-79', 'PILOT-LAN-80', 'PILOT-LAN-81',
        'PILOT-LAN-93', 'PILOT-LAN-110'
      ])
    loop
      -- One statement, and no `if`. The `having` is what makes a column with
      -- no match write nothing, so the only `if`s in this block are the guards
      -- below — which is the convention every script here follows, and what
      -- `tests/pilot-data-contract.test.ts` reads this file for.
      execute format(
        'insert into lan82_survivors
           select %L, %L, %L, count(*) from public.%I where %I::text like %L
            having count(*) > 0',
        col.table_name, col.column_name, sentinel_value,
        col.table_name, col.column_name, '%' || sentinel_value || '%'
      );
    end loop;
  end loop;

  -- Part 2 — the verdict, which fails closed in both directions.
  select count(*), coalesce(string_agg(
           format('%s.%s (%s x%s)', table_name, column_name, sentinel, rows), ', '), '')
    into survivors, detail
    from lan82_survivors;

  if survivors > 0 then
    raise exception
      'LAN-82 verification FAILED: synthetic scenario rows survive cleanup — %. '
      'Run the owning scenario''s cleanup.sql. Do not delete these from here.', detail;
  end if;

  select count(*) into accounts from public.operator_accounts;

  raise notice 'LAN-82 preflight passed: no scenario rows survive. % operator account(s) remain — compare that, and the counts below, with docs/pilot-data-manifest.md.', accounts;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The evidence, on a pass
-- ---------------------------------------------------------------------------
-- Empty by definition if the block above did not raise. Selected anyway, so a
-- run leaves a result a human can keep alongside the notice rather than only an
-- absence of errors.
select
  'surviving scenario rows' as check,
  table_name,
  column_name,
  sentinel,
  rows
  from lan82_survivors
 order by table_name, column_name, sentinel;

-- The durable pilot foundation, in counts only. No address, no name, no
-- identifier — the evidence is that these did not go, never who they are.
select
  'durable pilot foundation' as check,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from public.operator_accounts) as operator_accounts,
  (select count(*) from public.operator_accounts where is_active) as active_operator_accounts,
  (select count(*) from public.roles) as roles,
  (select count(*) from public.role_assignments) as role_assignments,
  (
    select count(*) from public.role_assignments
     where effective_from <= current_date
       and (effective_to is null or effective_to > current_date)
  ) as effective_role_assignments,
  (select count(*) from public.audit_events) as audit_events,
  (
    select count(*) from public.people p
     where exists (select 1 from public.operator_accounts a where a.person_id = p.id)
  ) as people_behind_an_operator_account;

commit;
