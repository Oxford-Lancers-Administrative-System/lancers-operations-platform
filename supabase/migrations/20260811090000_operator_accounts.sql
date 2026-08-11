-- Operator accounts: the join between a Supabase auth user and a Person.
--
-- LAN-71. Every write in the operational slice names an actor
-- (`audit_events.actor_person_id` for invariant M2, and the `*_by_person_id`
-- columns on events, RSVPs, attendance, reports and delivery results). There
-- was previously no way to obtain that person id from a session: the synthetic
-- seed creates people and no auth users, and `scripts/create-test-user.mjs`
-- creates one auth user and no person.
--
-- This is an identity join, not a new club concept. It adds nothing to the
-- frozen conceptual domain model — see docs/architecture/data-model.md
-- § Supporting structures that were not conceptual entities.
--
-- Two shape decisions, both deliberate:
--
--   * Not a column on `people`. An auth account is an operational fact about
--     how somebody signs in, not a durable club fact about who they are. A
--     Person who never logs in is normal; a Person whose account is revoked
--     still has to stay resolvable from history.
--
--   * No role column. Authorization reads `role_assignments`, so a committee
--     handover changes who can do what without touching authentication at all.

create table public.operator_accounts (
  id uuid primary key default gen_random_uuid(),

  -- One auth user, one person, in both directions. `on delete restrict` on both
  -- sides: an actor referenced by history must remain resolvable, so neither
  -- the identity nor the login may be deleted out from under an audit trail
  -- (invariant M2).
  auth_user_id uuid not null references auth.users (id) on delete restrict,
  person_id uuid not null references public.people (id) on delete restrict,

  -- Rows are deactivated, never deleted. `service_role` holds no `delete` on
  -- this table precisely so that "revoke an operator" cannot be implemented as
  -- a delete by a future maintainer taking the quick route.
  is_active boolean not null default true,
  disabled_at timestamptz,
  disabled_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint operator_accounts_auth_user_key unique (auth_user_id),
  constraint operator_accounts_person_key unique (person_id),

  -- A deactivation that does not say when it happened is not a record of
  -- anything. The converse is not constrained: `is_active = true` with a
  -- `disabled_at` set is a reinstatement, and keeping the previous date is
  -- more informative than erasing it.
  constraint operator_accounts_disabled_is_dated check (is_active or disabled_at is not null),

  constraint operator_accounts_disabled_reason_not_blank check (
    disabled_reason is null or btrim(disabled_reason) <> '')
);

comment on table public.operator_accounts is
  'Identity join: one Supabase auth user to one Person. Carries no role — authorization reads role_assignments. Not a conceptual entity.';
comment on column public.operator_accounts.is_active is
  'Revocation is a deactivation, never a delete: an actor referenced by history must stay resolvable (invariant M2).';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------
-- ADR 0002 / ADR 0010, unchanged: RLS on, zero policies, and no grant to any
-- browser-facing role. This table maps a login to a real person, so exposing it
-- through the Data API would hand an authenticated browser the club's operator
-- roster. Only the server path, holding the secret key, reaches it.

alter table public.operator_accounts enable row level security;

-- Revoke first, and from every client role including service_role: Supabase's
-- default privileges leave a new table with TRUNCATE, TRIGGER and REFERENCES
-- granted. Then grant back exactly what the server path needs — and `delete`
-- is deliberately not in that list.
revoke all on table public.operator_accounts from anon, authenticated, service_role;

grant select, insert, update on table public.operator_accounts to service_role;
