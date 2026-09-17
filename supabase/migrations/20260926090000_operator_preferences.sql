-- LAN-387 — where an operator's own view settings live.
--
-- Brian, 2026-09-17, from his visual pass over the roster board: "which groups
-- are open or closed is saved on the operator's account so it follows them
-- between devices". Nothing in the schema could hold that. Local storage would
-- have kept it on one browser, which is the opposite of what was asked for.
--
-- This is not a new club concept. A preference is a fact about an *operator's
-- screen*, never about a person, a membership or a season, and nothing in the
-- domain reads it: no audience, no message, no report, no export. It is the
-- operator-account analogue of `operator_accounts` — a physical necessity for
-- the application, keyed to the Person a session already resolves to (M2).
--
-- One row per person -- `operator_preferences_person_id_key` -- and one `jsonb`
-- object in it, rather than a column per setting. Two reasons. A preference has no invariant to enforce — there is no
-- state of this column that could make the club's records wrong — so a typed
-- column would buy nothing a check constraint does not, and would cost a
-- migration every time a screen remembers one more thing. And the whole object
-- is read and written together by one screen, so there is nothing to key
-- separately. The one rule that *is* enforced is that the value is an object:
-- a bare `3` or `"kit"` stored here would make every reader's shape a guess.
--
-- Erasure (LAN-361) never reaches it, and does not need to. An erasure
-- anonymises a `people` row rather than deleting it, so nothing here is touched
-- by one; and there would be nothing for it to clear if it were, because this
-- row holds no fact about the human at all — only which columns their own
-- browser had folded away.
--
-- `on delete restrict`, exactly as `operator_accounts.person_id` is, and
-- deliberately not `cascade`. The four keys that cascade off a `people` row
-- are the person's own attributes — their contacts, aliases and emergency
-- contact — and a delete is meant to take those with it. This is not one of
-- them, and a hand-run script that deletes a Person who still has a login's
-- settings should stop and be looked at rather than quietly widen
-- (`tests/pilot-scenario-lan-74.test.ts` is the standing check on that).

create table public.operator_preferences (
  -- A surrogate key, and the one-per-person rule as a unique constraint, the
  -- way every other table here is shaped. `person_id` alone as the primary key
  -- would have been narrower and is what this table wanted, but the owner-run
  -- showcase rollback walks foreign keys and deletes by `id`, and refuses by
  -- name any table that has not got one. Being the single exception is not
  -- worth a special case in a tool that runs against the hosted database.
  id uuid primary key default gen_random_uuid(),

  -- The Person, not the auth user: the same actor id every audited write
  -- records, so a re-created login keeps the settings of whoever it belongs to.
  person_id uuid not null unique references public.people (id) on delete restrict,

  -- Screen settings, by key. `{}` is a real answer and means "this operator has
  -- changed nothing"; an absent key means the screen's own default stands.
  preferences jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  -- Maintained by the service layer, not a trigger — Conventions.
  updated_at timestamptz not null default now(),

  constraint operator_preferences_is_object check (jsonb_typeof(preferences) = 'object')
);

comment on table public.operator_preferences is
  'One operator''s own screen settings, keyed to their Person (LAN-387). Not a club concept and read by nothing in the domain: no audience, message, report or export reaches it. One jsonb object per person; an absent key means the screen''s own default.';

comment on column public.operator_preferences.preferences is
  'Screen settings by key — currently `rosterCollapsedGroups`, the roster board and membership record''s folded-up column groups. Always an object (`operator_preferences_is_object`).';

-- ---------------------------------------------------------------------------
-- Row Level Security and Data API exposure
-- ---------------------------------------------------------------------------

alter table public.operator_preferences enable row level security;

revoke all on table public.operator_preferences from anon, authenticated, service_role;

-- The narrow server need and nothing wider: one upsert and one read, both for
-- the person the session resolved to. No delete — a preference is replaced,
-- never removed, and the row goes with the person.
grant select, insert, update on table public.operator_preferences to service_role;
