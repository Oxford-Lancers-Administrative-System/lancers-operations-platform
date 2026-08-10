# Lancers Operations Platform — working agreement

Canonical repository-wide guidance for coding agents and humans. `CLAUDE.md`
imports this file; do not duplicate anything from here into it.

## Purpose and current boundary

Operations platform for the **Oxford Lancers**, a contact football club. Release
one covers the club's eight approved operational workflows.

**None of them exist yet.** This repository is currently an infrastructure
scaffold whose only job is to prove the development, CI, and deployment loop.
Until the ticket that legitimately introduces the domain model:

- **No domain tables, entities, or migrations** — no players, rosters, events,
  RSVPs, attendance, injuries, or communications.
- **No real-data imports.** No roster data, no member records.
- **No application workflows.** None of the eight.
- **No fixtures.** Seed data must mirror the real shape of club data, which is
  what the synthetic data specification exists for. Tidy invented fixtures hide
  the problems real data causes.

`tests/no-domain-code.test.ts` enforces this and fails the build. The ticket
that crosses the boundary deletes that test; nothing else may.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

The differences that bite most often here:

- The `middleware` convention is **renamed to `proxy`**. This project has
  `src/proxy.ts` exporting `proxy`. Do not create `middleware.ts`.
- `cookies()`, `headers()`, `params`, and `searchParams` are **async** — await them.
- Turbopack is the default for `next dev` and `next build`.
- Route types (`PageProps<"/login">`, `LayoutProps<"/">`) are generated and do
  not exist in a fresh clone. `npm run typecheck` runs `next typegen` first.
- Passing `component={Link}` from a Server Component into a MUI Client Component
  is a build error. Use MUI's `href`, or a small client-side adapter.

Material UI is **v9**: system props such as `alignItems` are no longer accepted
directly on components — use `sx`.

## Authoritative documentation

| Question                                              | Source of truth                             |
| ----------------------------------------------------- | ------------------------------------------- |
| Stack, layout, request path, security model           | `docs/architecture.md`                      |
| Clean machine → running app; every script; migrations | `docs/local-development.md`                 |
| Cloud Run deploy, secrets, cost controls, rollback    | `docs/deployment.md`                        |
| Why a decision was made                               | `docs/adr/` (index in `docs/adr/README.md`) |

If this file and a `docs/` page disagree, `docs/` is more specific and wins —
then fix this file.

## Required local tooling

| Tool                            | Version                 | Notes                                                                                          |
| ------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| Node.js                         | ≥ 20.9 (22 recommended) | Next.js 16 minimum; CI and the container use 22                                                |
| npm                             | 10+                     | ships with Node                                                                                |
| **A Docker-compatible runtime** | running                 | **Required** — the Supabase CLI starts containers. Docker Desktop, OrbStack, Colima, or Podman |
| Git                             | any                     |                                                                                                |

The Supabase CLI is a dev dependency — `npm install` provides it. No separate
install needed.

## Commands

These are the real commands; they exist exactly as written.

```bash
# Install
npm install                # development
npm ci                     # reproducible, from the lockfile (CI uses this)

# Develop
npm run dev                # http://localhost:3000
npm run build              # production build
npm run start              # serve the production build

# Database (local Supabase only)
npm run db:start           # start the stack; first run pulls images
npm run db:stop
npm run db:status          # prints URL and keys
npm run db:reset           # drop and re-apply every migration from empty
npm run db:seed-user       # create/update the one local test user
npx supabase migration new <name>

# Types
npm run types:generate     # regenerate src/lib/supabase/database.types.ts
npm run types:check        # fail if those types drifted from the schema

# Quality
npm run format             # Prettier, write
npm run format:check       # Prettier, check only
npm run lint               # ESLint
npm run lint:fix
npm run typecheck          # next typegen && tsc --noEmit
npm run test               # Vitest, single run
npm run test:watch
npm run check:rls          # fail if a migration creates a table without RLS

# Verification — this is exactly what CI runs
npm run verify             # format:check → lint → typecheck → test → build
```

First run on a new machine:

```bash
npm install
npm run db:start
cp .env.example .env.local   # fill from `npm run db:status`
npm run db:seed-user
npm run dev
```

## Deployment

- **Pull request → CI only.** Nothing deploys.
- **Merge to `main` → deploy.** Builds the image, pushes to Artifact Registry,
  deploys a Cloud Run revision, and smoke-tests `/api/health`. The deploy fails
  itself unless the response reports `status: ok` and `secretsLoaded: true`.
- **Rollback:** `gh workflow run deploy.yml -f image_tag=<previous-commit-sha>`.
  Every image is tagged with its commit SHA. Full runbook, including the faster
  traffic-shifting route, is in `docs/deployment.md`.
- **Migrations are never run by the pipeline.** Applying one to the single
  production database is a deliberate human action.

Infrastructure bootstrap lives in `scripts/gcp-bootstrap.sh` and is idempotent.

## Directory conventions

```
src/app/                 routes (App Router)
src/app/api/             route handlers
src/lib/supabase/        client (browser) · server (per-request) · admin (privileged)
                         env.ts · database.types.ts (GENERATED — never hand-edit)
src/proxy.ts             session refresh + route protection
src/theme.ts             MUI baseline theme
supabase/migrations/     SQL migrations
scripts/                 type generation, RLS gate, test user, GCP bootstrap
tests/                   integration and boundary tests
docs/ · docs/adr/        documentation and decision records
```

**Where future domain work belongs:** schema in `supabase/migrations/`; data
access and business rules in a service layer under `src/lib/` — not in
components, and not in route handlers; routes in `src/app/`. Colocate tests with
what they cover (`*.test.ts` beside the source) and keep cross-cutting
integration tests in `tests/`.

## Styling

Material UI is the component baseline — anything MUI provides (buttons, inputs,
dialogs, tables, navigation) is MUI, themed through `src/theme.ts`. Tailwind is
also installed and may be used for layout and one-off utility styling. Never
style the same element with both. See `docs/adr/0004-styling-baseline.md`.

## Workflow

**Branches.** Never commit to `main`; it is protected and rejects direct and
force pushes, including for administrators. Branch from `main` using
`feat/…`, `fix/…`, `docs/…`, or `chore/…`.

**Issues.** Work traces back to a ticket. Reference it in the pull request.

**Commits.** Imperative subject under ~72 characters, blank line, then a body
explaining _why_ rather than restating the diff. Commit generated types
(`database.types.ts`) together with the migration that changed them — CI fails
if they disagree.

**Pull requests.** Describe what changed, how it was verified, any external
configuration performed, and remaining limitations. CI must be green. Required
human approvals are **zero** — Brian may merge his own pull requests — but CI is
a hard gate. See `docs/adr/0006-solo-developer-branch-protection.md`.

**Verification before opening a pull request:**

```bash
npm run verify
# and, if migrations changed:
npm run db:reset && npm run types:generate && npm run check:rls
```

## Definition of done for a repository change

1. `npm run verify` passes locally.
2. Migrations apply cleanly from empty, and generated types are regenerated and
   committed alongside them.
3. Every new table in an exposed schema enables RLS in the same migration.
4. Documentation updated where behaviour or commands changed; a new constraint
   on future work is recorded as an ADR.
5. No secret value, real member data, or domain schema was introduced.
6. CI green on the pull request.

Reporting something as done means it was run and observed to pass — not that it
should pass.

## Hard rules

**Local Supabase only.** All development, tests, migrations, type generation,
and agent execution run against the local stack. There is one production project
and no staging. Never point local work, a test, or an agent at production; never
apply a migration to production as part of ordinary work. Scripts and tests that
touch Supabase refuse to run against a non-local URL by design — do not weaken
those guards. See `docs/adr/0001-local-supabase-only.md`.

**Never expose a secret.** No secret value may appear in the repository, in
Notion, in a prompt, in logs, in fixtures, in a commit message, or in a client
bundle. Secrets live in GCP Secret Manager and, only where unavoidable, scoped
GitHub environment secrets. `.env.example` holds placeholders only; `.env.local`
is git-ignored. Anything prefixed `NEXT_PUBLIC_` is compiled into the browser
bundle — treat it as public. The privileged Supabase key bypasses RLS, is
server-only, and must never reach a development machine pointed at production.
If a real value is needed, ask Brian to set it himself and give him the exact
command. Do not print a secret to verify it; verify its presence instead.

**RLS on every table, deny-by-default.** Any `create table` in an exposed schema
must be followed by `alter table … enable row level security;` in the same
migration. `npm run check:rls` enforces it in CI. The service layer is the
primary authorization boundary; RLS is the backstop.
See `docs/adr/0002-rls-posture.md`.

**This repository is public.** Treat every committed byte as published.

## Stop and ask Brian

Stop and ask before any change that would alter:

- **The approved domain model** — including introducing any part of it.
- **Security or privacy posture** — RLS, authentication, authorization,
  what data is exposed, how secrets are handled, IAM.
- **Infrastructure cost** — new cloud resources or services, raising
  `max-instances`, anything that spends money.
- **The ownership boundary** — GitHub organization, GCP project, Supabase
  project, domains, billing, or who has access to any of them.
- **Release scope** — adding or removing functionality relative to release one.

Also stop for anything needing a credential, an external account, or an
authorization you do not have, and for reversing a decision recorded in
`docs/adr/` — write a superseding ADR and get agreement rather than quietly
changing course.

Everything else — application code, tests, scripts, documentation, workflow
steps, dependencies, theme contents — proceed and explain in the pull request.

## Agent tooling

Deliberately minimal. Do **not** add custom subagents, skills, hooks, slash
commands, or an agent hierarchy. If repeated development work demonstrates a
concrete recurring need, raise a ticket for it rather than building one here.
