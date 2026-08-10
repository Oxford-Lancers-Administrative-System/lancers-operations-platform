# 0003 — Support both Supabase key naming schemes

**Status:** Accepted · **Date:** 2026-08-10

## Context

Supabase is mid-migration between two key schemes:

| Role                          | Legacy                 | Current                            |
| ----------------------------- | ---------------------- | ---------------------------------- |
| Browser-safe, RLS-constrained | `anon` (a JWT)         | `publishable` (`sb_publishable_…`) |
| Privileged, bypasses RLS      | `service_role` (a JWT) | `secret` (`sb_secret_…`)           |

Verified against the local stack on 2026-08-10 with Supabase CLI 2.113.0:
`supabase status` emits **all four** — `PUBLISHABLE_KEY`, `SECRET_KEY`,
`ANON_KEY`, `SERVICE_ROLE_KEY`. A hosted project may issue either scheme
depending on when it was created and whether the new keys have been enabled.

## Decision

`src/lib/supabase/env.ts` accepts either name for each role and prefers the
current one:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, falling back to
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`

Missing values throw with an actionable message rather than defaulting to an
empty string, because an empty key produces confusing 401s rather than an
obvious configuration error.

The `NEXT_PUBLIC_` prefix is the boundary that matters, not the key's name: any
`NEXT_PUBLIC_` value is inlined into the client bundle at build time. The
privileged key must never carry that prefix, and `src/lib/supabase/admin.ts`
imports `server-only` so that importing it from a Client Component is a build
error rather than a leak.

## Outstanding

Which scheme the **hosted** club project issues has not been verified — the
project reference has not been provided. Until then the hosted configuration is
documented as "whichever scheme `supabase status` / the dashboard reports", and
the code path is already correct for both.
