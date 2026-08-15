# Lancers Operations Platform — working agreement

Canonical repository-wide guidance for coding agents and humans. `CLAUDE.md`
imports this file; do not duplicate anything from here into it.

## Purpose and current boundary

Operations platform for the **Oxford Lancers**, a contact football club. Release
one covers the club's eight approved operational workflows.

The repository holds the infrastructure scaffold, **the domain schema
baseline** — the frozen conceptual domain model v1.2 implemented as PostgreSQL
migrations, with a deterministic synthetic seed and the tests that prove the
invariants — and **the first operational vertical slice built on it**.

That slice is one complete workflow, and it runs: link an operator to a Person
and their club roles; enter a returning player and activate their membership;
draft a practice; confirm its audience and approve it in one transaction;
deliver the invitations automatically over the official 1:1 WhatsApp Business
Platform; collect answers through signed no-login links; assert that the event
occurred; let an authorized coach take the register from a narrow phone-width
surface; and generate the Monday leadership report as an immutable snapshot.

[`docs/operating-the-slice.md`](docs/operating-the-slice.md) walks it by hand
and lists what is genuinely absent. `tests/slice-walkthrough.test.ts` walks the
same path through the service layer in one run and asserts the hand-offs between
the steps. Read one of them before changing anything the workflow touches.

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
| What the application actually does, walked by hand    | `docs/operating-the-slice.md`               |
| Stack, layout, request path, security model           | `docs/architecture.md`                      |
| What each table means, and where each invariant lives | `docs/architecture/data-model.md`           |
| Clean machine → running app; every script; migrations | `docs/local-development.md`                 |
| How a schema change reaches production, and recovery  | `docs/migration-runbook.md`                 |
| Testing a feature against **hosted** Supabase         | `docs/pilot-data-runbook.md`                |
| What is in hosted that is not schema                  | `docs/pilot-data-manifest.md`               |
| Cloud Run deploy, secrets, cost controls, rollback    | `docs/deployment.md`                        |
| How one issue is implemented and reviewed             | `.claude/skills/start-issue/SKILL.md`       |
| How low-risk work is batched and merged automatically | `docs/fast-lane.md`                         |
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
npm run db:acquire -- LAN-### # claim primary, or overflow when primary is occupied
npm run db:start           # start stack and restore synthetic review state/login
npm run db:stop
npm run db:status          # prints URL and keys
npm run db:reset           # reset, seed, and restore the fixed review login
npm run db:seed            # load the deterministic synthetic dataset (local only)
npm run db:seed-user       # create/update the fixed local review user
npm run db:link-coach      # the second local login: a coaching seat only
npm run db:heartbeat
npm run db:review-ready
npm run db:release
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
npm ci
npm run db:acquire -- LAN-1  # replace with the issue being worked
npm run db:start             # migrations, synthetic data, .env.local, both review logins
npm run dev:slot
```

`db:start` and `db:reset` both seed the dataset, create the fixed review user,
and link the operator and coach logins — so the individual `db:seed`,
`db:seed-user`, `db:link-operator` and `db:link-coach` commands above exist for
repairing one piece, not for first-run setup. Running them after `db:start` is
harmless and unnecessary.

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
scripts/production/      owner-run production procedures — RUN BY HAND, never by
                         a workflow, migration, npm script, test or agent
scripts/fast-lane/       fast-lane classifier and merge gate (governance — protected)
.github/fast-lane-rules.json  the checked-in fast-lane eligibility rules
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

**User-facing implementation.** Before changing a user-facing workflow, read
the assigned Linear issue and all of its comments, then read
[`docs/ux/slice-ux.md`](docs/ux/slice-ux.md), the corresponding contract under
`docs/ux/tickets/`, and every associated desktop and 375px phone wireframe.
Stop when higher-authority sources conflict or an unrecorded product or security
decision is required. The implementation pull request must include a
UX-conformance checklist and screenshots for every applicable presentation.

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

The one scoped exception to the two paragraphs above is the fast lane, below. It
narrows what runs locally for two classes of change and hands the merge to a
workflow. It changes nothing for anything else.

## The fast lane

Documentation, cross-cutting tests, and qualifying agent-instruction work can be
batched into **one** pull request and merged **automatically** by a GitHub Action
once every required check has passed, without Brian approving each one.
Everything else keeps the workflow it already has: a **draft** pull request, the
full `npm run verify` locally, and Brian merges it.

The rules that decide are checked in and machine-readable, and the merge workflow
and its tests both read them:
[`.github/fast-lane-rules.json`](.github/fast-lane-rules.json). The mechanism,
the reasoning and the owner actions are in
[`docs/fast-lane.md`](docs/fast-lane.md); the decision is
[`docs/adr/0017-batched-fast-lane.md`](docs/adr/0017-batched-fast-lane.md).

**Eligibility is re-derived from the diff.** The merge workflow reads the rules
and the classifier from `main` and applies them to `git diff main...head`. It
does not trust the `fast-lane` label, the title, the body, a commit trailer, or
any other artifact the agent wrote. The label is how a pull request **asks**; it
is never the evidence. A labelled pull request whose diff contains an ineligible
path is refused.

**Eligible.**

- `documentation` — `docs/**/*.md`, `README.md`, `scripts/pilot/**/*.md`.
  Operational and production runbooks are included deliberately: such a change
  alters what a human is told, never what a machine does.
- `test` — `tests/**/*.test.ts`, `tests/**/*.test.tsx`, `tests/helpers/**/*.ts`,
  where the change adds coverage, strengthens it, or corrects a demonstrably
  incorrect or flaky test.
- `agent-instruction` — an eligible class with an empty path list today, because
  every agent-instruction file in this repository carries a protected governance
  rule. Widening it is Brian's decision.

Added and modified files only, and several eligible issues should travel as one
combined batch.

**Never eligible.** Application and production code (`src/**`), regardless of how
small the diff is; schema and migrations; `scripts/**` beyond the pilot READMEs;
any dependency change; deployment, infrastructure and workflow files; build,
quality-gate and test-harness configuration; `.env.example`; decision records;
the architecture and data-model documents; any test change that removes or
weakens valid coverage; and any batch that mixes eligible and ineligible work —
which must be split into a fast-lane pull request and a normal one, and is
otherwise refused whole rather than merged in part.

**Protected governance rules.** A change to fast-lane eligibility, to the
required verification for the fast lane, to automatic-merge authority, or to the
protection of these rules uses the normal workflow and needs Brian's approval,
even when the file is Markdown. `.github/**`, `scripts/fast-lane/**`,
`.claude/**`, `AGENTS.md`, `CLAUDE.md`, `docs/adr/**`, `docs/fast-lane.md`,
`tests/agent-harness.test.ts` and `tests/fast-lane-*.test.ts` carry them. These
rules cannot weaken or remove their own protections through the lane.

**It fails closed.** A path no rule classifies is unclassified, and unclassified
is ineligible — absence of a rule is never permission. An empty diff, a deletion,
a rename, a new top-level directory, an unresolved conflict or a check that did
not run all send the pull request back to the normal lane, still a draft, for a
human to read.

**Proportionate verification**, fixed per class so that no agent picks its own:

| Class               | Run locally, and watch it pass                                              |
| ------------------- | --------------------------------------------------------------------------- |
| `documentation`     | `npm run format:check`, `npm run test`                                      |
| `test`              | `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run test` |
| `agent-instruction` | as `test`                                                                   |

`npm run build` is not required locally for these classes — no file Next.js
compiles can be in an eligible batch, and CI builds the application and the
container on every pull request regardless. That is the whole of the narrowing.
Required GitHub CI is the merge gate, runs in full, and is necessary but never
sufficient: a green run cannot make an ineligible change eligible.

**Tiny application-code fixes stay in the normal lane and never auto-merge.**
Their review is proportionate to reachability and blast radius under the graded
model, but they are drafts and Brian merges them.

**No agent merges.** A GitHub Action does, and only after it has recomputed
eligibility itself. Agents still open drafts and still cannot un-draft or merge;
`.claude/settings.json` and `tests/agent-harness.test.ts` are unchanged by the
fast lane.

**A fast-lane merge does not deploy.** A merge performed with `GITHUB_TOKEN` does
not trigger downstream workflows, so `deploy.yml` does not run. Nothing eligible
for this lane needs deploying, but `main` can move without a Cloud Run revision
following it.

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
Where the rows are created by the **application** rather than by the setup
script there is no identifier to use, and the second shape in
`docs/pilot-data-runbook.md` § The ownership marker applies instead — each such
scenario is pinned individually, and adding one is Brian's decision.
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

Item 1 is narrowed for the two eligible fast-lane classes, and for nothing else:
see § **The fast lane** and `.github/fast-lane-rules.json` for exactly what runs
instead. Item 8's Production handoff block is still required — an eligible batch
answers "No" and "None" to every line, which is the point of asking.

Reporting something as done means it was run and observed to pass — not that it
should pass.

## Hard rules

**Local Supabase only.** All development, tests, migrations, type generation,
and agent execution run against the local stack. There is one production project
and no staging. Never point local work, a test, or an agent at production; never
apply a migration to production as part of ordinary work. Scripts and tests that
touch Supabase refuse to run against a non-local URL by design — do not weaken
those guards. See `docs/adr/0001-local-supabase-only.md`.

The **deployed Cloud Run revision** is the one exception, and it is narrow:
since `docs/adr/0026-hosted-runtime-database-connection.md` it opens one approved
hosted target, as a least-privilege login, identified by Cloud Run's own
`K_SERVICE`. That branch lives in `src/lib/db/runtime-target.ts` alone. The
loopback-only guards in `src/lib/db/url.ts` and `scripts/lib/local-db.mjs` are
unchanged and still refuse the approved production target on every developer
machine, in CI, and in every test. Do not add a hosted branch to either, and do
not make the approved target configurable.

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

Exactly one user-invoked workflow and one review subagent are approved:

| Role                                   | File                              | What it does                                                                                                |
| -------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Lead workflow (`/start-issue LAN-###`) | `.claude/skills/start-issue/`     | The top-level session implements one explicit issue in its dedicated worktree through draft PR and handoff. |
| Code reviewer                          | `.claude/agents/code-reviewer.md` | Fresh-context, independently isolated review; reports findings and never repairs them.                      |

The top-level session reads the complete issue, confirms dependencies and human
gates, enters or safely resumes one issue-specific worktree from current
`main`, writes an internal acceptance/test matrix, implements directly, and
classifies the issue as UI-affecting, nonvisual, or mixed. It never launches an
implementation subagent, selects
a second issue, starts a wave, uses the fast lane, merges, un-drafts, deploys,
migrates hosted Supabase, or writes to production.

- **Worktree isolation is mandatory.** One issue has one worktree and one branch.
  The primary checkout remains unchanged and clean. Reviewers use their own
  isolated worktrees.
- **The implementer writes tests but does not certify them.** Normal and Highest
  risk changes receive a fresh-context reviewer that independently reconstructs
  requirements, judges the matrix and challenges critical rules with plausible
  defect injection. Narrow corrections preserve review lineage and receive
  correction-only review; material risk-surface changes reset to full review.
  Review is capped at three automatic invocations, with repeated premises routed
  to requirement adjudication. Green CI is required but is not approval.
- **Review is graded before implementation by reachability and blast radius,
  never diff size.** Low risk is top-level verification only; Normal application
  work receives one independent review; Highest risk includes auth,
  authorization, migrations, grants/RLS, secrets, privileged credentials,
  production-affecting workflows, and the agent harness. An unspecified grade
  resolves to Normal.
- **Visual acceptance precedes final correctness review.** After objective
  verification, UI-affecting work receives agent browser preflight at desktop
  and 375px, then stops with a live protected `review-ready` environment for
  Brian's presentation judgment. Mixed work stops only for that visible portion;
  nonvisual work never introduces a human visual stop. After approval or visual
  corrections, final verification and graded independent review run at the
  current commit. The normal pull request remains draft throughout.
- **Brian's visual handoff is zero-command.** The agent installs dependencies,
  starts and repairs local services, resets and seeds the database, provisions
  the fixed local review login through the real auth flow, starts the app, and
  personally verifies every route/state in a browser. The handoff supplies one
  URL, the fixed login, exact review path, concrete visual judgments and known
  limitations, and explicitly says commands, database/setup actions, and
  production actions for Brian are all `None`.
- **Ambiguity escalates; routine engineering does not.** Stop only for a genuine
  owner decision, irreconcilable authoritative conflict, missing access or
  credential, or an unsafe technical blocker. Resolve ordinary implementation
  choices, test failures, and local-tooling problems directly.
- **Human gates outrank dependencies.** LAN-90 remains the UX gate. Automated
  WhatsApp delivery is locked; manual distribution is never a fallback. LAN-92
  owns the open provider, recipient, prerequisites, and failure decisions.
- **Local database coordination has two fenced slots.** Primary is first;
  overflow is created only when primary is genuinely occupied. A stable
  machine-local registry, short allocator lock, liveness plus heartbeat,
  randomized fencing tokens, complete non-conflicting port sets, and protected
  `review-ready` state prevent one worktree from resetting another's stack.
  Every destructive or mutating database command validates the current token.

Linear recordkeeping is limited to In Progress at start, the draft PR link, and
one final evidence/handoff comment. Use In Review only for genuine human or
visual acceptance. See
[`docs/adr/0020-zero-command-visual-review.md`](docs/adr/0020-zero-command-visual-review.md).

Every issue returns one draft pull request, and Brian merges it. **No agent
merges, un-drafts a pull request, deploys, migrates hosted Supabase, or writes to
production.**

`.claude/settings.json` keeps bypass disabled and denies common direct forms of
merge, un-draft, force push, deploy, hosted Supabase, raw GitHub mutation, and
guardrail editing. Those patterns supplement protected `main`, human merge,
restricted credentials, worktree isolation, independent review, and CI; they do
not replace those controls. `tests/agent-harness.test.ts` fails if this posture
drifts.
