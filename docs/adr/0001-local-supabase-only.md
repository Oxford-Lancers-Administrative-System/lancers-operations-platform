# 0001 — Development and CI run against local Supabase only

**Status:** Accepted · **Date:** 2026-08-10

## Context

There is exactly one Supabase project (production, London / EU West 2) and no
paid staging project. A Supabase secret / `service_role` key bypasses RLS
entirely. The worst-case failure for this build is an agent or a developer
holding that key while pointed at production.

## Decision

All development and all CI run against a local Supabase stack started by the
Supabase CLI. The production project is never a target for development, tests,
migrations-in-progress, type generation, or agent activity.

Enforced, not merely documented:

- `scripts/create-test-user.mjs` refuses to run against a non-local URL.
- `tests/rls-posture.test.ts` and `tests/auth-flow.test.ts` throw if pointed at
  a non-local URL.
- CI starts its own Supabase container and uses only its ephemeral credentials.
- No production Supabase credential exists in the repository, in GitHub Actions
  secrets, or in `.env.example`.

## Consequences

- Docker must be running to work on this project. That is an accepted cost.
- Anything that can only be verified against the hosted project (for example,
  which key scheme it issues) is an explicit, tracked manual step rather than
  something CI silently does.
- Applying migrations to production is a deliberate, separate, human-run action.
  It is not part of the deploy pipeline.
