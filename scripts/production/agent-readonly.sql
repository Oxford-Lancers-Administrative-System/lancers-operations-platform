-- The read-only diagnostic identity agents use to inspect production — LAN-435.
--
-- Owner-run. Brian pastes this whole file into the Supabase SQL editor for the
-- production project. No agent runs it, and no workflow, migration or npm script
-- references it (tests/production-smoke-contract.test.ts enforces that).
--
-- It is not a migration: it creates no schema object. It creates one database
-- login, `agent_readonly`, and grants it SELECT on the columns of `public` that
-- are not on the hidden list below. Everything else is refused by PostgreSQL:
--
--   * writes of any kind — the role holds no INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES or TRIGGER privilege, owns nothing, and cannot create roles;
--   * hidden columns — a query naming one, or `select *` on a table that has one,
--     fails with "permission denied";
--   * every schema but `public` — no USAGE on `auth`, `storage`, `staging`,
--     `internal` or anything else.
--
-- `bypassrls` is what lets the role see rows at all: every domain table has RLS
-- enabled with zero policies (ADR 0002), so without it the club reads as empty.
-- It widens what the role can read, never what it can write. ADR 0040 records
-- the decision and the alternatives.
--
-- Re-runnable. Each run recomputes the grants from the current schema, so run it
-- again after a migration adds a table or column agents should see. New tables
-- and columns stay invisible until then. A password is generated only the first
-- time; to rotate it, see scripts/production/README.md.
--
-- Expected result: one row. `agent_readonly_password` holds the new password on
-- the first run (put it in .env.local as AGENT_READONLY_PASSWORD, never in chat)
-- and reads "unchanged" afterwards; the four counts must all be 0.

-- ---------------------------------------------------------------------------
-- The hidden list. Contact details, identity numbers, and bearer secrets.
-- A column is hidden when it is named here OR its name matches the pattern
-- below, so an obviously sensitive column a later migration adds is hidden on
-- the next run even if nobody remembered to list it.
-- ---------------------------------------------------------------------------

create temporary table if not exists agent_readonly_hidden (
  table_name text not null,
  column_name text not null
);
truncate agent_readonly_hidden;

insert into agent_readonly_hidden (table_name, column_name) values
  -- Identity numbers and date of birth.
  ('people', 'date_of_birth'),
  ('people', 'student_number'),
  ('people', 'bafa_registration_number'),
  -- Email addresses and phone numbers. `kind`, `scope` and `is_preferred` stay
  -- visible, so an agent can tell that someone has a WhatsApp number on file.
  ('contact_points', 'raw_value'),
  ('contact_points', 'normalised_value'),
  ('operator_accounts', 'login_email'),
  ('person_emergency_contacts', 'given_name'),
  ('person_emergency_contacts', 'family_name'),
  ('person_emergency_contacts', 'phone'),
  ('person_emergency_contacts', 'email'),
  -- What a player typed on a signed agreement form.
  ('onboarding_agreements', 'printed_name'),
  ('onboarding_agreements', 'form_name'),
  ('onboarding_agreements', 'form_address'),
  ('onboarding_agreements', 'form_postcode'),
  ('onboarding_agreements', 'form_tel'),
  ('onboarding_agreements', 'form_email'),
  -- A disputed fact can be any of the above.
  ('person_fact_disputes', 'club_value'),
  ('person_fact_disputes', 'player_value'),
  -- Bearer secrets and their fingerprints. `template_variables` carries the
  -- personal links a message was sent with; anyone holding one can act as that
  -- person through the application, which would be a write path.
  ('person_access_tokens', 'token_hash'),
  ('rsvp_access_tokens', 'token_hash'),
  ('club_link_tokens', 'token_hash'),
  ('recruitment_signup_codes', 'code'),
  ('notification_jobs', 'template_variables'),
  ('delivery_attempts', 'safety_destination_key');

begin;

-- ---------------------------------------------------------------------------
-- The role. Created once; its attributes are reasserted on every run.
-- ---------------------------------------------------------------------------

select set_config('lancers.agent_readonly_new', 'no', false);

do $role$
begin
  if not exists (select 1 from pg_roles where rolname = 'agent_readonly') then
    create role agent_readonly;
    perform set_config('lancers.agent_readonly_new', 'yes', false);
  end if;
end
$role$;

-- `nosuperuser` and `noreplication` are the defaults `create role` gives and
-- cannot be restated here: Supabase's `postgres` is not a superuser, and
-- PostgreSQL refuses to let a non-superuser name either attribute. The
-- verification below checks both instead.
alter role agent_readonly with
  login nocreatedb nocreaterole noinherit bypassrls connection limit 2;

-- Defence in depth, not the boundary: a client can override these for its own
-- session. The missing write grants are what make writes impossible.
alter role agent_readonly set default_transaction_read_only = on;
alter role agent_readonly set statement_timeout = '15s';
alter role agent_readonly set idle_in_transaction_session_timeout = '30s';

-- ---------------------------------------------------------------------------
-- The grants, recomputed from nothing.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from agent_readonly;
revoke all on all sequences in schema public from agent_readonly;
revoke all on all functions in schema public from agent_readonly;
grant usage on schema public to agent_readonly;

do $grants$
declare
  relation record;
  visible text;
begin
  for relation in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
     order by c.relname
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
      into visible
      from pg_attribute a
     where a.attrelid = format('public.%I', relation.relname)::regclass
       and a.attnum > 0
       and not a.attisdropped
       and not exists (
         select 1 from agent_readonly_hidden h
          where h.table_name = relation.relname and h.column_name = a.attname)
       and a.attname !~* '(email|phone|postcode|address|password|secret|_hash$|date_of_birth|student_number)';

    if visible is not null then
      execute format('grant select (%s) on public.%I to agent_readonly', visible, relation.relname);
    end if;
  end loop;
end
$grants$;

-- The password: generated server-side on the first run only, so re-running to
-- pick up new columns does not break the key already in .env.local.
do $password$
begin
  if current_setting('lancers.agent_readonly_new') = 'yes' then
    perform set_config(
      'lancers.agent_readonly_password',
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      false);
    execute format('alter role agent_readonly password %L',
      current_setting('lancers.agent_readonly_password'));
  else
    perform set_config('lancers.agent_readonly_password', 'unchanged', false);
  end if;
end
$password$;

commit;

-- ---------------------------------------------------------------------------
-- Verification. All four counts must be 0.
-- ---------------------------------------------------------------------------

select
  current_setting('lancers.agent_readonly_password') as agent_readonly_password,
  -- Any administrative attribute, or membership of another role.
  (select count(*)
     from pg_roles
    where rolname = 'agent_readonly'
      and (rolsuper or rolcreaterole or rolcreatedb or rolreplication or rolinherit))
    +
  (select count(*)
     from pg_auth_members m
     join pg_roles r on r.oid = m.member
    where r.rolname = 'agent_readonly')
    as unsafe_attributes,
  -- Any privilege but SELECT, anywhere in `public`.
  (select count(*)
     from information_schema.role_table_grants
    where grantee = 'agent_readonly' and privilege_type <> 'SELECT')
    +
  (select count(*)
     from information_schema.column_privileges
    where grantee = 'agent_readonly' and privilege_type <> 'SELECT')
    as write_privileges,
  -- A hidden column the role can still read.
  (select count(*)
     from agent_readonly_hidden h
     join information_schema.columns c
       on c.table_schema = 'public' and c.table_name = h.table_name and c.column_name = h.column_name
    where has_column_privilege('agent_readonly',
            format('public.%I', h.table_name), h.column_name, 'SELECT'))
    as hidden_columns_readable,
  -- A SECURITY DEFINER function it could call, which would run with its owner's
  -- privileges and is the one way a read-only role could still write.
  (select count(*)
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where p.prosecdef
      and n.nspname not in ('pg_catalog', 'information_schema')
      and has_schema_privilege('agent_readonly', n.oid, 'USAGE')
      and has_function_privilege('agent_readonly', p.oid, 'EXECUTE'))
    as definer_functions_callable;
