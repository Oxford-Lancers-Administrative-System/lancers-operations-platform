# 0010 — Domain tables are unreachable from the browser, twice over

**Status:** Accepted · **Date:** 2026-08-10 · **Extends:** [0002](0002-rls-posture.md)

## Context

ADR 0002 decided the posture before there was anything to protect: RLS on every
table in the exposed schema, deny-by-default, secret key bypassing, service
layer as the primary authorization boundary. The domain schema now exists and
holds the data that posture was written for — roughly 250 people's personal
details, plus restricted availability status.

Implementing it surfaced two things ADR 0002 could not have known.

**First**, this Supabase CLI version no longer auto-grants new tables to the
Data API roles: a freshly created table has no `select` for `anon`,
`authenticated` or `service_role`. Deny-by-default is therefore available at the
grant level as well as the policy level — and, less comfortably, the privileged
server path does _not_ work until it is granted explicitly.

**Second**, the default privileges do still leave `truncate`, `trigger` and
`references` granted to all three roles. `truncate` on an append-only history
table would defeat the append-only guarantee entirely.

## Decision

- **RLS enabled on all 34 domain tables, with zero policies.** No direct-browser
  surface has been approved, so none exists.
- **Every migration revokes all privileges from `anon`, `authenticated` and
  `service_role` on the tables it creates, then grants back exactly what is
  needed.** The revoke is per-table, not schema-wide, so a later migration
  cannot strip an earlier one's grants.
- **`service_role` gets `select, insert, update, delete`** on mutable tables,
  **`select, insert` only** on the seven append-only history tables, and
  **`select`** on the eight views.
- **Every view is `security_invoker = true`.** A view created by a migration is
  owned by `postgres`, which bypasses RLS; without this, every view would be a
  hole straight through the backstop.
- **RLS is enabled on the unexposed `staging` schema as well.** It is not in
  `[api] schemas`, but that is a configuration fact, and configuration facts get
  reversed by accident.

## Consequences

- A browser-facing role must clear two independent gates to reach a domain
  table: it has no policy _and_ no grant. Exposing one takes two mistakes in two
  places.
- The first client-side surface — a signed-link RSVP form is the likely
  candidate — needs a grant _and_ a policy _and_ a superseding ADR. All three
  being required is deliberate.
- `tests/schema-security.test.ts` asserts this from the catalogue and
  `tests/rls-posture.test.ts` asserts it through PostgREST as a browser would.
  `npm run check:rls` keeps enforcing the migration-level habit.
