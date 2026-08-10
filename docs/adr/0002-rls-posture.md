# 0002 — RLS enabled everywhere, deny-by-default

**Status:** Accepted · **Date:** 2026-08-08 (decided) / 2026-08-10 (recorded here) · **Extended by** [0010](0010-domain-table-access-posture.md)

## Context

The platform holds club member data. Supabase exposes PostgreSQL directly to the
browser through PostgREST using a browser-safe key, so any table reachable in an
exposed schema is reachable by anyone who can read the client bundle unless RLS
says otherwise.

## Decision

- Row Level Security is enabled on **every** table in an exposed schema.
- Deny-by-default: a table with RLS enabled and no policy is unreadable. That is
  the correct starting state; policies are added deliberately, one at a time.
- The secret / `service_role` key bypasses RLS and is server-only.
- The **service layer is the primary authorization boundary.** RLS is the
  backstop that makes a service-layer mistake non-catastrophic, not the place
  where business authorization logic lives.

## Enforcement

- `npm run check:rls` (`scripts/check-rls-migrations.mjs`) statically rejects any
  migration that creates a table in an exposed schema without enabling RLS on it
  in the same migration. It runs in CI on every pull request.
- `tests/rls-posture.test.ts` asserts at runtime that a browser-safe key can read
  nothing from the Data API. With zero domain tables this is trivially true; the
  assertion is written so it starts failing the moment a table is exposed without
  a deliberate policy.

## Consequences

- Adding a table is a two-line habit, permanently. This is intentional friction.
- When the domain model lands, per-table policy tests are added next to the
  existing runtime assertion rather than replacing it. **This happened on
  2026-08-10:** see [ADR 0010](0010-domain-table-access-posture.md), which
  extends this posture with grant-level deny-by-default and `security_invoker`
  views.
