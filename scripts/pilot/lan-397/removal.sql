-- LAN-397 — step 2: remove the test records Brian marked in the inventory.
--
-- Brian runs this by hand in the hosted project's SQL editor, after a backup
-- point noted by time. No agent runs it there. Read
-- scripts/pilot/lan-397/README.md first.
--
-- Deletion, not anonymisation: these are not real people. Everything keyed to
-- a marked person or event goes with it — invitations, audience rows, RSVPs,
-- attendance, questions and answers, queued and sent messages with their
-- attempts and results, tokens, follow-ups — found by walking the foreign keys
-- the database itself declares (pg_constraint), never a hand-written list.
-- Deleted in the order that same catalogue gives: children before parents.
--
-- It refuses, and changes nothing, if the walk would reach anything that is
-- not the marked test data:
--   * a person or event marked keep;
--   * a person or event that is not marked (no walk reaches one silently);
--   * an operator account that is active, or a seat that is current;
--   * a row that names a marked person as the one who did something
--     (recorded_by, approved_by, author, owner, actor …) and is not itself
--     being removed — that includes audit_events, which are never deleted
--     (invariant M2), so a person with audit history stays;
--   * a membership or recruit record belonging to an unmarked person;
--   * a recruitment sign-up code: the printed QR code must keep resolving.
--
-- Idempotent: an id already gone is counted as such and skipped, so a second
-- run with the same lists removes nothing and says so.
--
-- Transactional, with a dry run first. With dry_run = true (as shipped) it does
-- the whole removal inside the transaction, then raises an error carrying the
-- per-table counts, which rolls everything back. With dry_run = false it
-- commits and the last result is the same counts, plus the Auth users to
-- delete from the dashboard (Authentication → Users) afterwards. This file
-- never writes to auth.users; the README says why.

begin;

-- ---------------------------------------------------------------------------
-- The marks. Paste ids from the inventory between the braces, comma-separated:
--   '{<uuid>,<uuid>}'
-- ---------------------------------------------------------------------------
drop table if exists pg_temp.lan397_input;
create temporary table lan397_input as
select
  -- Section 1 rows marked delete: the person and everything keyed to them.
  '{}'::uuid[] as delete_people,
  -- Section 1 rows whose operator account and invitation go, person stays.
  '{}'::uuid[] as delete_operator_account_of,
  -- Section 3 rows marked delete: the event and everything keyed to it.
  '{}'::uuid[] as delete_events,
  -- Everything marked keep, people and events alike. Never touched.
  '{}'::uuid[] as keep,
  -- true: rehearse and roll back. false: remove and commit.
  true as dry_run;

-- ---------------------------------------------------------------------------
-- Preflight: where this is running
-- ---------------------------------------------------------------------------
select current_database() as database, current_user as run_as, now() as started_at;

do $preflight$
begin
  if to_regclass('public.recruitment_signup_codes') is null
     or to_regclass('public.messaging_safety_scopes') is null then
    raise exception 'LAN-397: this is not the Lancers schema; stopping.';
  end if;
  if exists (
    select 1 from lan397_input i
     where i.delete_people && i.keep
        or i.delete_events && i.keep
        or i.delete_operator_account_of && i.keep
  ) then
    raise exception 'LAN-397: an id is marked both delete and keep; fix the lists.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The foreign-key graph, read from the catalogue
-- ---------------------------------------------------------------------------
-- One row per (child column -> parent id) pair inside public. Composite keys
-- appear through their id component. An "actor" edge names who did something
-- rather than whose row it is; those are never followed, only checked.
drop table if exists pg_temp.lan397_edges;
create temporary table lan397_edges as
select con.conrelid::regclass as child,
       ca.attname::text as child_column,
       con.confrelid::regclass as parent,
       con.confdeltype as on_delete,
       (ca.attname ~ '_by_person_id$'
        or ca.attname in ('actor_person_id', 'author_person_id', 'owner_person_id',
                          'responsible_coach_person_id', 'safety_person_id',
                          'merged_into_person_id')) as actor
  from pg_constraint con
  join pg_class cc on cc.oid = con.conrelid
  join pg_class pc on pc.oid = con.confrelid
  join lateral unnest(con.conkey, con.confkey) as k(child_att, parent_att) on true
  join pg_attribute ca on ca.attrelid = con.conrelid and ca.attnum = k.child_att
  join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = k.parent_att
 where con.contype = 'f'
   and cc.relnamespace = 'public'::regnamespace
   and pc.relnamespace = 'public'::regnamespace
   and pa.attname = 'id';

-- ---------------------------------------------------------------------------
-- The walk: the marked rows, then every row keyed to them, to a fixpoint
-- ---------------------------------------------------------------------------
drop table if exists pg_temp.lan397_doomed;
create temporary table lan397_doomed (
  tbl regclass not null,
  id text not null,
  primary key (tbl, id)
);

insert into lan397_doomed (tbl, id)
select 'public.people'::regclass, p.id::text
  from lan397_input i, public.people p where p.id = any(i.delete_people)
union
select 'public.events'::regclass, e.id::text
  from lan397_input i, public.events e where e.id = any(i.delete_events)
union
select 'public.operator_accounts'::regclass, o.id::text
  from lan397_input i, public.operator_accounts o
 where o.person_id = any(i.delete_operator_account_of);

do $walk$
declare
  edge record;
  added bigint;
  total bigint;
  passes int := 0;
begin
  loop
    total := 0;
    passes := passes + 1;
    for edge in
      select e.child, e.child_column, e.parent from lan397_edges e
       where not e.actor
         and e.on_delete not in ('n', 'd')
         and exists (select 1 from lan397_doomed d where d.tbl = e.parent)
    loop
      if not exists (
        select 1 from pg_attribute a
         where a.attrelid = edge.child and a.attname = 'id' and not a.attisdropped
      ) then
        execute format(
          'select count(*) from %s c where c.%I::text in (select id from lan397_doomed where tbl = %L::regclass)',
          edge.child, edge.child_column, edge.parent) into added;
        if added > 0 then
          raise exception 'LAN-397: %.% reaches a removed row and % has no id column; stopping.',
            edge.child, edge.child_column, edge.child;
        end if;
        continue;
      end if;
      execute format(
        'insert into lan397_doomed (tbl, id)
         select %L::regclass, c.id::text from %s c
          where c.%I::text in (select id from lan397_doomed where tbl = %L::regclass)
         on conflict do nothing',
        edge.child, edge.child, edge.child_column, edge.parent);
      get diagnostics added = row_count;
      total := total + added;
    end loop;
    exit when total = 0;
    if passes > 50 then
      raise exception 'LAN-397: the walk did not settle after 50 passes; stopping.';
    end if;
  end loop;
end
$walk$;

-- ---------------------------------------------------------------------------
-- Refusals: anything the walk reached that is not test data stops the run
-- ---------------------------------------------------------------------------
do $refuse$
declare
  edge record;
  found bigint;
  problems text := '';
begin
  -- Kept rows, and people or events nobody marked.
  if exists (select 1 from lan397_doomed d, lan397_input i
              where d.tbl in ('public.people'::regclass, 'public.events'::regclass)
                and d.id::uuid = any(i.keep)) then
    problems := problems || E'\n  a row marked keep would be removed';
  end if;
  select count(*) into found from lan397_doomed d, lan397_input i
   where d.tbl = 'public.people'::regclass and not (d.id::uuid = any(i.delete_people));
  if found > 0 then
    problems := problems || format(E'\n  %s unmarked people would be removed', found);
  end if;
  select count(*) into found from lan397_doomed d, lan397_input i
   where d.tbl = 'public.events'::regclass and not (d.id::uuid = any(i.delete_events));
  if found > 0 then
    problems := problems || format(E'\n  %s unmarked events would be removed', found);
  end if;

  -- Seated or active operators.
  select count(*) into found from lan397_doomed d
    join public.operator_accounts o on o.id::text = d.id
   where d.tbl = 'public.operator_accounts'::regclass and o.is_active;
  if found > 0 then
    problems := problems || format(E'\n  %s active operator accounts would be removed', found);
  end if;
  select count(*) into found from public.role_assignments ra, lan397_input i
   where (ra.person_id = any(i.delete_people) or ra.person_id = any(i.delete_operator_account_of))
     and ra.effective_from <= current_date
     and (ra.effective_to is null or ra.effective_to > current_date);
  if found > 0 then
    problems := problems || format(E'\n  %s current seats are held by a marked person', found);
  end if;

  -- Somebody else's membership or recruit record.
  select count(*) into found from lan397_doomed d
    join public.season_memberships m on m.id::text = d.id, lan397_input i
   where d.tbl = 'public.season_memberships'::regclass
     and not (m.person_id = any(i.delete_people));
  select found + count(*) into found from lan397_doomed d
    join public.recruitment_prospects r on r.id::text = d.id, lan397_input i
   where d.tbl = 'public.recruitment_prospects'::regclass
     and not (r.person_id = any(i.delete_people));
  if found > 0 then
    problems := problems || format(E'\n  %s memberships or recruit records of unmarked people would be removed', found);
  end if;

  -- The printed QR code.
  if exists (select 1 from lan397_doomed where tbl = 'public.recruitment_signup_codes'::regclass) then
    problems := problems || E'\n  a recruitment sign-up code would be removed';
  end if;

  -- Rows that name a removed row as the one who acted, and are staying.
  for edge in
    select e.child, e.child_column, e.parent from lan397_edges e
     where e.actor
       and exists (select 1 from lan397_doomed d where d.tbl = e.parent)
  loop
    if exists (
      select 1 from pg_attribute a
       where a.attrelid = edge.child and a.attname = 'id' and not a.attisdropped
    ) then
      execute format(
        'select count(*) from %s c
          where c.%I::text in (select id from lan397_doomed where tbl = %L::regclass)
            and c.id::text not in (select id from lan397_doomed where tbl = %L::regclass)',
        edge.child, edge.child_column, edge.parent, edge.child) into found;
    else
      execute format(
        'select count(*) from %s c where c.%I::text in (select id from lan397_doomed where tbl = %L::regclass)',
        edge.child, edge.child_column, edge.parent) into found;
    end if;
    if found > 0 then
      problems := problems || format(E'\n  %s rows of %s.%s name a removed row and stay%s',
        found, edge.child, edge.child_column,
        case when edge.child = 'public.audit_events'::regclass
             then ' (audit history is never deleted: leave that person in place)' else '' end);
    end if;
  end loop;

  if problems <> '' then
    raise exception 'LAN-397: refusing; nothing was changed.%', problems;
  end if;
end
$refuse$;

-- ---------------------------------------------------------------------------
-- Messaging safety (LAN-394): the scopes and counters of removed people
-- ---------------------------------------------------------------------------
-- A person scope is keyed by the person id. A destination scope is keyed by a
-- fingerprint of the number or address (sha256 of 'v1:<channel>:<value>', as
-- src/lib/services/messaging-safety/keys.ts computes it), found two ways: the
-- removed attempts that still carry one, and the removed people's own contact
-- points. A destination a kept person also holds keeps its scope.
create or replace function pg_temp.lan397_e164(raw text) returns text
language sql immutable as $fn$
  select case
    when raw is null or btrim(raw) = '' or btrim(raw) !~ '^\+?[0-9\s().-]+$' then null
    else (
      select case when length(d) between 8 and 15 then d end
        from (
          select case
            when btrim(raw) like '+%' then digits
            when digits like '00%' then substr(digits, 3)
            when digits like '0%' then '44' || substr(digits, 2)
            when digits like '44%' then digits
          end as d
            from (select regexp_replace(btrim(raw), '[^0-9]', '', 'g') as digits) s
        ) t
    )
  end
$fn$;

create or replace function pg_temp.lan397_key(channel text, value text) returns text
language sql immutable as $fn$
  select encode(sha256(convert_to('v1:' || channel || ':' || value, 'UTF8')), 'hex')
$fn$;

drop table if exists pg_temp.lan397_destination_keys;
create temporary table lan397_destination_keys as
with removed_people as (
  select id::uuid as id from lan397_doomed where tbl = 'public.people'::regclass
),
contact_keys as (
  select c.person_id, pg_temp.lan397_key('email', lower(btrim(v))) as key
    from public.contact_points c, unnest(array[c.normalised_value, c.raw_value]) v
   where c.kind::text = 'email' and btrim(coalesce(v, '')) <> ''
  union
  select c.person_id, pg_temp.lan397_key('whatsapp', pg_temp.lan397_e164(v))
    from public.contact_points c, unnest(array[c.normalised_value, c.raw_value]) v
   where c.kind::text <> 'email' and pg_temp.lan397_e164(v) is not null
)
select key from (
  select k.key from contact_keys k where k.person_id in (select id from removed_people)
  union
  select a.safety_destination_key from public.delivery_attempts a
   where a.safety_destination_key is not null
     and a.id::text in (select id from lan397_doomed where tbl = 'public.delivery_attempts'::regclass)
) removed
except
select k.key from contact_keys k
 where k.person_id not in (select id from removed_people);

-- The Auth users behind the operator accounts about to go, read before they do.
drop table if exists pg_temp.lan397_auth_candidates;
create temporary table lan397_auth_candidates as
select distinct o.auth_user_id
  from public.operator_accounts o
 where o.id::text in (select id from lan397_doomed where tbl = 'public.operator_accounts'::regclass);

drop table if exists pg_temp.lan397_counts;
create temporary table lan397_counts (step int, tbl text, removed bigint);

with gone as (
  delete from public.messaging_safety_scopes s
   where (s.scope_kind::text = 'person'
          and s.scope_key in (select id from lan397_doomed where tbl = 'public.people'::regclass))
      or (s.scope_kind::text = 'destination'
          and s.scope_key in (select key from lan397_destination_keys))
  returning 1
)
insert into lan397_counts select 0, 'messaging_safety_scopes', count(*) from gone;

-- ---------------------------------------------------------------------------
-- The removal, children before parents, in the catalogue's order
-- ---------------------------------------------------------------------------
do $remove$
declare
  pending regclass[];
  next_table regclass;
  removed bigint;
  step int := 0;
begin
  select array_agg(distinct tbl) into pending from lan397_doomed;
  while pending is not null and cardinality(pending) > 0 loop
    -- A table whose rows no other pending table still points at.
    select t into next_table
      from unnest(pending) t
     where not exists (
       select 1 from lan397_edges e
        where e.parent = t and e.child <> t and e.child = any(pending))
     order by t::text
     limit 1;
    if next_table is null then
      raise exception 'LAN-397: the tables to remove from form a foreign-key cycle: %', pending;
    end if;
    execute format(
      'delete from %s where id::text in (select id from lan397_doomed where tbl = %L::regclass)',
      next_table, next_table);
    get diagnostics removed = row_count;
    step := step + 1;
    insert into lan397_counts values (step, next_table::text, removed);
    pending := array_remove(pending, next_table);
  end loop;
end
$remove$;

-- ---------------------------------------------------------------------------
-- Verification: nothing marked survives, everything kept does, the code lives
-- ---------------------------------------------------------------------------
do $verify$
declare
  t regclass;
  left_over bigint;
begin
  for t in select distinct tbl from lan397_doomed loop
    execute format(
      'select count(*) from %s where id::text in (select id from lan397_doomed where tbl = %L::regclass)',
      t, t) into left_over;
    if left_over > 0 then
      raise exception 'LAN-397: % rows of % survived; rolling back.', left_over, t;
    end if;
  end loop;
  if exists (
    select 1 from lan397_input i, unnest(i.keep) k
     where not exists (select 1 from public.people p where p.id = k)
       and not exists (select 1 from public.events e where e.id = k)
  ) then
    raise exception 'LAN-397: a kept id no longer exists; rolling back.';
  end if;
end
$verify$;

-- The Auth users that belonged to removed operator accounts and to nobody
-- else, for Brian to delete from the dashboard after the commit.
drop table if exists pg_temp.lan397_auth_users;
create temporary table lan397_auth_users as
select a.auth_user_id
  from lan397_auth_candidates a
 where not exists (select 1 from public.operator_accounts o where o.auth_user_id = a.auth_user_id);

-- The dry run stops here, carrying the counts, and rolls everything back.
do $dry_run$
declare
  summary text;
begin
  if (select dry_run from lan397_input) then
    select string_agg(format('%s %s', removed, tbl), E'\n  ' order by step) into summary
      from lan397_counts where removed > 0;
    raise exception 'LAN-397 dry run: nothing was changed. It would remove:%',
      E'\n  ' || coalesce(summary, 'nothing — every marked id is already gone');
  end if;
end
$dry_run$;

commit;

select step, tbl as removed_from, removed from lan397_counts where removed > 0
union all
select null, 'auth user to delete in the dashboard: ' || auth_user_id, null from lan397_auth_users
order by 1 nulls last, 2;
