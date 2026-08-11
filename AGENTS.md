# Lancers Operations Platform — working agreement

Canonical repository-wide guidance for coding agents and humans. `CLAUDE.md`
imports this file; do not duplicate anything from here into it.

## Purpose and current boundary

Operations platform for the **Oxford Lancers**, a contact football club. Release
one covers the club's eight approved operational workflows.

The repository holds the infrastructure scaffold **and the domain schema
baseline**: the frozen conceptual domain model v1.2 implemented as PostgreSQL
migrations, with a deterministic synthetic seed and the tests that prove the
invariants. No application workflow is built on it yet.

Read [`docs/architecture/data-model.md`](docs/architecture/data-model.md) before
touching `supabase/migrations/`. It maps every conceptual entity and every
invariant to its physical treatment; a table with no entry there is a defect.

Still out of bounds, and still needing a decision from Brian rather than a
migration:

- **New club concepts.** The frozen model's "deliberately absent" list is
  binding: no kit-inventory ledger, no finance beyond subscription status, no
  game-day logistics entity, no statistics, no media, no second team. Adding one
  is a release-scope change.
- **Reinterpreting the frozen model.** Renaming a state, widening a closed
  vocabulary, or relaxing an invariant changes the approved domain model.
- **Real-data imports.** No roster data and no member records, in any
  environment, until the pre-pilot gate in
  [`docs/migration-runbook.md`](docs/migration-runbook.md) is passed. The one
  narrow exception — approved pilot identities for the leadership testers, and
  clearly synthetic feature scenarios, in hosted, placed there by Brian — is
  defined and bounded by
  [`docs/pilot-data-runbook.md`](docs/pilot-data-runbook.md). It is not a route
  to the real roster or to real club operations.
- **Tidy fixtures.** Seed data mirrors the real shape of club data — that is
  what `scripts/seed-local.mjs` and the synthetic data specification are for.
  Invented tidy fixtures hide the problems real data causes.

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
| What each table means, and where each invariant lives | `docs/architecture/data-model.md`           |
| Clean machine → running app; every script; migrations | `docs/local-development.md`                 |
| How a schema change reaches production, and recovery  | `docs/migration-runbook.md`                 |
| Testing a feature against **hosted** Supabase         | `docs/pilot-data-runbook.md`                |
| What is in hosted that is not schema                  | `docs/pilot-data-manifest.md`               |
| Cloud Run deploy, secrets, cost controls, rollback    | `docs/deployment.md`                        |
| How supervised parallel agent work is run             | `.claude/skills/supervise-batch/SKILL.md`   |
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
npm run db:seed            # load the deterministic synthetic dataset (local only)
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
npm run db:seed              # synthetic domain data
npm run db:seed-user         # the one local auth user
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
.claude/                 the approved agent roles, and their deny rules
src/app/                 routes (App Router)
src/app/api/             route handlers
src/lib/supabase/        client (browser) · server (per-request) · admin (privileged)
                         env.ts · database.types.ts (GENERATED — never hand-edit)
src/proxy.ts             session refresh + route protection
src/theme.ts             MUI baseline theme
supabase/migrations/     SQL migrations — the domain schema baseline
scripts/                 type generation, RLS gate, seed, test user, GCP bootstrap
scripts/lib/             shared local-database access, with the non-local guard
scripts/pilot/<issue>/   hosted pilot-data setup.sql / cleanup.sql — RUN BY HAND
tests/                   integration, schema, and security tests
docs/architecture/       the physical data model
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
npm run db:reset && npm run db:seed && npm run types:generate && npm run check:rls
```

Applying a migration to hosted Supabase is a separate, explicitly authorized
human action that no agent performs — see
[`docs/migration-runbook.md`](docs/migration-runbook.md).

## Pilot data and the production handoff

There is one production database, no staging, and one person who may write to
it. **Every pull request states what Brian has to do**, in the **Production
handoff** block of `.github/PULL_REQUEST_TEMPLATE.md` — six lines, answered even
when every answer is "No" or "None": schema migration and filenames;
compatibility and deployment order; pilot setup required; pilot cleanup
required; other Brian action; verification after Brian acts.

**Does this pull request need pilot-data artifacts?** `docs/pilot-data-runbook.md`
decides, and it is the source of truth for everything below. In short: it needs
them when the change cannot be honestly proved against the local stack and has
to be exercised by a human against hosted Auth and the deployed container, and
when the rows that exercise it are not already there. Then the pull request
ships `scripts/pilot/<issue-id>/setup.sql`, `cleanup.sql` and `README.md`, plus
an automated test proving — against **local** Supabase — that setup is
repeatable, that cleanup removes only its own rows and is repeatable, and that
the durable pilot identities, access records and audit history survive it. If
the answer is genuinely "no artifacts needed", say that in the pull request
rather than leaving the section blank.

**The timing rule.** Tell Brian **as soon as you discover** an owner action is
required — a migration, a pilot script, a secret, an Auth user, a dashboard
step. Repeat it in the pull request description. Repeat it again in the final
handoff. Leaving him to infer an action from a changed migration or SQL file is
a defect in the pull request, not a detail he will spot.

**What an agent never does here.** Run a pilot script against hosted Supabase.
Create or invite a hosted Auth user. Grant, end-date or otherwise change hosted
access. Decide retention. Insert reference data into hosted. Add a database
concept to label test data — the ownership marker is a deterministic identifier
plus a `PILOT-<ISSUE-ID>` sentinel, never a new column and never a new table.
And nothing under `supabase/migrations/`, `supabase/seed.sql`,
`scripts/seed-local.mjs`, `.github/workflows/`, the `Dockerfile` or any `src/`
startup path may reference `scripts/pilot/` — a pilot script reaches a database
because a human chose to run it. Running one against the disposable **local**
stack inside a test is verification, and is fine.

Real roster data and real club operations stay prohibited in every environment
until the pre-pilot gate closes. See
`docs/adr/0016-controlled-production-pilot-data.md`.

## Definition of done for a repository change

1. `npm run verify` passes locally.
2. Migrations apply cleanly from empty, and generated types are regenerated and
   committed alongside them.
3. Every new table in an exposed schema enables RLS in the same migration.
4. Documentation updated where behaviour or commands changed; a new constraint
   on future work is recorded as an ADR.
5. No secret value and no real member data was introduced, and no new club
   concept was added to the domain model without Brian's decision.
6. A change to `supabase/migrations/` updates `docs/architecture/data-model.md`
   in the same commit — the map and the schema must not drift.
7. CI green on the pull request.
8. The pull request's **Production handoff** block is filled in — every line,
   including the "No" and "None" answers — and any pilot-data artifacts the
   change needs are supplied and proved by test.

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

**Grant nothing to a browser-facing role.** Every migration revokes all
privileges from `anon`, `authenticated` and `service_role` on the tables it
creates, then grants back only what the server path needs — and only
`select, insert` on an append-only history table. Views must be declared
`security_invoker = true`, or they run as their owner and bypass RLS entirely.
See `docs/adr/0010-domain-table-access-posture.md`.

**Migrations are forward-only once shared.** Never edit or reorder a migration
that has been applied anywhere but your own machine; correct it with a new one.
No agent applies a migration to hosted Supabase. See `docs/migration-runbook.md`.

**This repository is public.** Treat every committed byte as published.

## Stop and ask Brian

Stop and ask before any change that would alter:

- **The approved domain model** — renaming a state, widening a closed
  vocabulary, relaxing an invariant, or adding a club concept the frozen model
  deliberately excludes.
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

Still deliberately minimal, but no longer absent. Exactly three roles are
approved, and they live under `.claude/`:

| Role                               | File                                  | What it does                                                                  |
| ---------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- |
| Lead workflow (`/supervise-batch`) | `.claude/skills/supervise-batch/`     | Selects at most two independent issues, briefs workers, verifies, hands back. |
| Issue implementer                  | `.claude/agents/issue-implementer.md` | One issue, one worktree, one branch, one **draft** pull request.              |
| Code reviewer                      | `.claude/agents/code-reviewer.md`     | Fresh context, read-only, reviews the diff — never repairs its own findings.  |

The operating model, in one paragraph: a top-level session acts as lead. It
reads the Linear dependency graph, picks work whose dependencies are actually
**merged** and whose human gates have been passed, **writes a test matrix for
each issue before any implementation starts**, runs at most **two**
worktree-isolated implementers on genuinely independent issues, checks each
result against the repository and the Actions logs rather than against the
worker's report, routes every draft pull request through the independent
reviewer at **review level 2 and above**, and leaves durable Linear evidence
before and after the wave. Work
that could collide is serialised, not parallelised. The local Supabase stack is
one shared set of containers, so one wave-wide lock covers implementers and
reviewers; at most one agent may use database-backed tests or destructive
database commands at a time.

These rules follow from that and are worth stating on their own:

- **The implementer writes the tests; it does not certify them.** The reviewer
  judges adequacy independently against the matrix, and challenges every
  critical rule by injecting a plausible defect and confirming a test fails. A
  green CI run is not approval.
- **Ambiguity escalates, it does not get resolved by an agent.** An issue that
  is ambiguous, internally inconsistent, or missing a material acceptance
  criterion stops the wave. Product decisions are Brian's.
- **Human gates outrank the graph.** No user-facing implementation before the
  LAN-90 UX approval is recorded. **Automated WhatsApp delivery is a locked
  requirement** — manual posting or manual distribution is never an MVP, pilot,
  fallback, or separate acceptable path, and no agent may implement or assume
  one. **LAN-92 is the open decision gate**: it owns the provider, recipient
  pattern, prerequisites, and failure behaviour, no agent closes it, and LAN-78
  stays blocked until it closes and LAN-78 is amended with the selected
  approach. LAN-82 is blocked transitively.
- **One database lock, every agent.** Worktree isolation isolates files, not the
  local Supabase stack — one set of containers shared by every worktree.
  Implementers and reviewers alike hold the lock one at a time.
- **Review is graded, and the grade is set before implementation.** Four levels —
  **0** none, **1** lead verification, **2** full independent review, **3**
  multi-round — keyed on **reachability and blast radius, never on diff size**,
  and assigned with the test matrix rather than from the diff that comes back.
  **Level 2 is the default, and an unspecified level resolves to level 2** rather
  than to "no review": the default fails safe, upward. A **mandatory level-2
  floor** overrides the lead's discretion however small the change is —
  `supabase/migrations/`, any grant, policy or RLS surface, `src/lib/auth/`,
  `src/lib/db/`, secrets or `.env.example`, any dependency change
  (`package.json`, `package-lock.json`), `.claude/`, `.github/workflows/`, and
  `AGENTS.md`. The lead may assign level 0 or 1 on its
  own authority **only** with the justification recorded in both the wave record
  and the run report. **One correction cycle at every level**, and the
  defect-injection standard at levels 2 and 3 is untouched. See
  [`docs/adr/0015-graded-review-levels.md`](docs/adr/0015-graded-review-levels.md).

**No agent merges, un-drafts a pull request, deploys, migrates hosted Supabase,
or writes to production.** Brian merges. `.claude/settings.json` blocks
bypass-permissions mode and denies the common direct command forms; protected
`main`, draft-only workflow, review, and CI remain the authoritative controls.
The settings file narrows risk but is not described as an exhaustive shell
sandbox. `tests/agent-harness.test.ts` fails if the checked-in guards drift.

Do **not** add a fourth role, a hook, or an agent framework. Concurrency stays
at two. Both are decisions for Brian, and
[`docs/adr/0013-supervised-agent-development.md`](docs/adr/0013-supervised-agent-development.md)
records the reasoning and the evidence that would justify changing either.
