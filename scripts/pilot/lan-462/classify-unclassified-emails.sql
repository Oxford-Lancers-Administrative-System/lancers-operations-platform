-- LAN-462 — classify every email stored without a classification.
--
-- Brian runs this by hand, once, against the hosted database. No agent runs it
-- there. Read scripts/pilot/lan-462/README.md first.
--
-- It holds no name, address or identifier: it classifies by rule, the same rule
-- the application applies since LAN-462
-- (src/lib/services/person-email-classification.ts):
--
--   * an address the Oxford rule accepts (`isOxfordCollegeEmail`: it ends in
--     ox.ac.uk, or in .edu with an optional two-letter country code) becomes a
--     college email; any other address a personal email;
--   * when the person already has a preferred email of that scope, that one
--     stays preferred and the newly classified one is kept as a second,
--     non-preferred address;
--   * when the person already holds the same address classified, the
--     unclassified copy is removed; when they hold the same address twice
--     unclassified, one copy is kept (the preferred one, else the oldest).
--
-- It writes contact_points.scope and contact_points.is_preferred, and deletes
-- only unclassified duplicate rows. It creates nothing, touches no other table
-- and needs no cleanup. Every row it changes or removes is listed by the
-- preview select below, before any write, so the output is the record of what
-- happened.

begin;

-- ---------------------------------------------------------------------------
-- Preflight: where this is running, and what it is about to do
-- ---------------------------------------------------------------------------
select current_database() as database, current_user as run_as, now() as started_at;

do $preflight$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'contact_points' and column_name = 'scope'
  ) then
    raise exception 'LAN-462: public.contact_points has no scope column; wrong database, stopping.';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public' and indexname = 'contact_points_one_preferred_per_kind'
  ) then
    raise exception 'LAN-462: contact_points_one_preferred_per_kind is missing; wrong database, stopping.';
  end if;
end
$preflight$;

-- The classification of one address, written once and used by every statement
-- below. A temporary function, gone at the end of the session.
create or replace function pg_temp.lan462_scope(address text) returns public.contact_point_scope
language sql immutable as $fn$
  select case
    when lower(btrim(address)) ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@]+)+$'
     and (
       lower(btrim(address)) ~ '@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)*ox\.ac\.uk$'
       or lower(btrim(address)) ~ '@([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+edu(\.[a-z]{2})?$'
     )
    then 'college'::public.contact_point_scope
    else 'personal'::public.contact_point_scope
  end
$fn$;

-- Preview: every unclassified email and what will happen to it.
select x.id as contact_point_id,
       x.person_id,
       case when x.valid_until is null then 'current' else 'superseded' end as currency,
       x.is_preferred as preferred_before,
       pg_temp.lan462_scope(x.raw_value) as becomes,
       case
         when x.valid_until is null and exists (
           select 1 from public.contact_points c
            where c.person_id = x.person_id and c.kind = 'email' and c.scope is not null
              and c.valid_until is null
              and lower(btrim(c.raw_value)) = lower(btrim(x.raw_value))
         ) then 'removed: the person already holds this address classified'
         when x.valid_until is null and exists (
           select 1 from public.contact_points c
            where c.person_id = x.person_id and c.kind = 'email' and c.scope is null
              and c.valid_until is null and c.id <> x.id
              and lower(btrim(c.raw_value)) = lower(btrim(x.raw_value))
              and (c.is_preferred, x.created_at, x.id) > (x.is_preferred, c.created_at, c.id)
         ) then 'removed: a second unclassified copy of the same address'
         when x.is_preferred and exists (
           select 1 from public.contact_points c
            where c.person_id = x.person_id and c.kind = 'email' and c.is_preferred
              and c.scope = pg_temp.lan462_scope(x.raw_value)
         ) then 'classified, kept as a second non-preferred address'
         else 'classified'
       end as outcome
  from public.contact_points x
 where x.kind = 'email' and x.scope is null
 order by x.person_id, x.created_at;

-- ---------------------------------------------------------------------------
-- 1. An unclassified copy of an address the person already holds classified
-- ---------------------------------------------------------------------------
delete from public.contact_points x
 where x.kind = 'email' and x.scope is null and x.valid_until is null
   and exists (
     select 1 from public.contact_points c
      where c.person_id = x.person_id and c.kind = 'email' and c.scope is not null
        and c.valid_until is null
        and lower(btrim(c.raw_value)) = lower(btrim(x.raw_value))
   );

-- ---------------------------------------------------------------------------
-- 2. The same address held twice unclassified: keep the preferred, else the oldest
-- ---------------------------------------------------------------------------
delete from public.contact_points
 where id in (
   select id
     from (
       select id,
              row_number() over (
                partition by person_id, lower(btrim(raw_value))
                order by is_preferred desc, created_at, id
              ) as copy
         from public.contact_points
        where kind = 'email' and scope is null and valid_until is null
     ) ranked
    where ranked.copy > 1
 );

-- ---------------------------------------------------------------------------
-- 3. Classify what is left, current and superseded alike
-- ---------------------------------------------------------------------------
-- A preferred row stays preferred only when its scope's preferred slot is
-- free. The subquery reads the rows as they were before this statement, and a
-- person has at most one preferred unclassified email (the unique index), so
-- two rows can never both claim the same slot here.
update public.contact_points x
   set scope = pg_temp.lan462_scope(x.raw_value),
       is_preferred = x.is_preferred and not exists (
         select 1 from public.contact_points c
          where c.person_id = x.person_id and c.kind = 'email' and c.is_preferred
            and c.scope = pg_temp.lan462_scope(x.raw_value)
       )
 where x.kind = 'email' and x.scope is null;

-- ---------------------------------------------------------------------------
-- Verification: nothing is left unclassified
-- ---------------------------------------------------------------------------
do $verify$
begin
  if exists (select 1 from public.contact_points where kind = 'email' and scope is null) then
    raise exception 'LAN-462: an email is still unclassified; rolling back.';
  end if;
end
$verify$;

select scope, is_preferred, count(*) as emails
  from public.contact_points
 where kind = 'email'
 group by scope, is_preferred
 order by scope, is_preferred;

commit;
