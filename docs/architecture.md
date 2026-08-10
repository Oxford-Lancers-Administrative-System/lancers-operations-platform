# Architecture

Infrastructure scaffold for the Oxford Lancers operations platform. It contains
no club domain functionality — see [ADR 0007](adr/0007-zero-domain-code-boundary.md).

## Stack

| Layer           | Choice                                               | Notes                                                                             |
| --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Framework       | Next.js 16 (App Router), React 19, TypeScript strict | Turbopack is the default builder in 16.                                           |
| UI              | Material UI v9 + `src/theme.ts`                      | Tailwind is also installed but unused — [ADR 0004](adr/0004-styling-baseline.md). |
| Database & auth | Supabase (PostgreSQL, London / EU West 2)            | One production project; local stack for everything else.                          |
| Hosting         | Google Cloud Run (`europe-west2`)                    | Container from `Dockerfile`, standalone Next.js output.                           |
| Registry        | Artifact Registry                                    | Images tagged with the commit SHA.                                                |
| Secrets         | GCP Secret Manager                                   | Injected at runtime, never baked into the image.                                  |
| CI/CD           | GitHub Actions                                       | OIDC + Workload Identity Federation, no stored GCP key.                           |

Approved 2026-08-07. GitHub is the technical ownership boundary.

## Layout

```
src/
  app/
    page.tsx              trivial public page
    login/                email/password sign-in (Server Action)
    dashboard/            the one session-protected page
    api/health/route.ts   dependency-free health endpoint
    layout.tsx            MUI providers + CssBaseline
  lib/supabase/
    env.ts                env resolution; the NEXT_PUBLIC_ boundary
    client.ts             browser client (publishable key, RLS applies)
    server.ts             per-request server client (publishable key, RLS applies)
    admin.ts              privileged client (secret key, bypasses RLS, server-only)
    database.types.ts     GENERATED — do not edit
  proxy.ts                session refresh + route protection
  theme.ts                MUI baseline theme
supabase/
  config.toml             local stack + auth configuration
  migrations/             one intentionally empty init migration
  seed.sql                intentionally empty
scripts/                  type generation, RLS gate, test user, GCP bootstrap
tests/                    integration + boundary tests
docs/adr/                 architecture decision records
```

`src/proxy.ts` — Next.js 16 renamed the `middleware` convention to `proxy`. Same
semantics, different filename and export name.

## Request path

```
Browser
  │
  ├─▶ src/proxy.ts          refresh Supabase session, write rotated cookies,
  │                          redirect anonymous requests for /dashboard to /login
  │
  ├─▶ Server Component      createClient() from lib/supabase/server.ts
  │                          publishable key → RLS applies
  │
  └─▶ Server Action         sign in / sign out; sets auth cookies
```

Route protection in `proxy.ts` is convenience, not the authorization boundary.
`/dashboard` re-checks the session itself, because a proxy matcher can be changed
or bypassed and Server Actions are not separate routes in the matcher chain.

## Security model

Three tiers of configuration, and the boundary between them is the thing to get
right:

| Tier         | Example                                | Reaches the browser?      | Bypasses RLS? |
| ------------ | -------------------------------------- | ------------------------- | ------------- |
| Local        | CLI-generated keys in `.env.local`     | n/a                       | n/a           |
| Browser-safe | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Yes**, inlined at build | No            |
| Server-only  | `SUPABASE_SECRET_KEY`                  | Never                     | **Yes**       |

- Anything prefixed `NEXT_PUBLIC_` is public. Assume the internet reads it.
- `admin.ts` imports `server-only`, so importing it from a Client Component is a
  build error rather than a leak.
- RLS is deny-by-default on every exposed table — [ADR 0002](adr/0002-rls-posture.md).
- The service layer is the primary authorization boundary; RLS is the backstop.
- Development and CI never touch production — [ADR 0001](adr/0001-local-supabase-only.md).

## Authentication scope

Deliberately minimal: email/password only, one manually pre-provisioned user,
public self-registration disabled, one trivial session-protected page. No
application roles, profile tables, invitations, onboarding, or domain-specific
authorization exist.

Google OAuth is deferred — it needs an approved redirect domain and a club
administrator able to create OAuth credentials, both open club-side items.

## Guardrails that run in CI

| Gate                                   | Mechanism                      |
| -------------------------------------- | ------------------------------ |
| Formatting, lint, types, tests, build  | `npm run verify`               |
| Migrations apply cleanly from empty    | `supabase db reset` in CI      |
| Generated types match the schema       | `npm run types:check`          |
| Every new table enables RLS            | `npm run check:rls`            |
| A browser-safe key reads nothing       | `tests/rls-posture.test.ts`    |
| Sign-in works, public sign-up does not | `tests/auth-flow.test.ts`      |
| No domain schema exists                | `tests/no-domain-code.test.ts` |
| The container builds and serves        | `container` job in `ci.yml`    |
