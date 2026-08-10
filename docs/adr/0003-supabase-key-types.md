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

## The hosted project

Verified 2026-08-10 against the club project `fggbgeraiadetyiyjlvb`
(`https://fggbgeraiadetyiyjlvb.supabase.co`, London / EU West 2):

- It issues the **current** scheme. The publishable key carries the
  `sb_publishable_` prefix, so `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the
  variable in use and the `NEXT_PUBLIC_SUPABASE_ANON_KEY` fallback is unused in
  production. The fallback stays in the code: the local stack still emits both,
  and removing it would buy nothing.
- Unauthenticated requests to `/rest/v1/`, `/auth/v1/health`, and
  `/auth/v1/settings` all return `401 No API key found`. Nothing is readable
  without a key.

Key placement:

| Value           | Where it lives                             | Why                                                                                |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| API URL         | GitHub repository variable                 | Public. Build-time, inlined into the bundle.                                       |
| Publishable key | GitHub repository variable                 | Public by design, RLS-constrained. Build-time.                                     |
| Secret key      | GCP Secret Manager (`supabase-secret-key`) | Bypasses RLS. Injected into Cloud Run at runtime, never into an image or the repo. |

A dedicated secret key named `cloud-run` is used rather than a default or the
legacy `service_role` JWT, so it can be revoked and rotated on its own without
affecting any other consumer. There is no equivalent argument for the
publishable key — it is already public, so segmenting it buys nothing.
