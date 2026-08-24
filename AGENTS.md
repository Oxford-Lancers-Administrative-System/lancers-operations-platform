# Lancers Operations Platform — working agreement

Repository-wide instructions for humans and coding agents. `CLAUDE.md` imports
this file; shared rules belong here once.

## Product boundary

This is the Oxford Lancers operations platform. Release one covers the eight
approved workflows and the first running vertical slice described in
`docs/operating-the-slice.md`. Before changing that slice, read that walkthrough
or `tests/slice-walkthrough.test.ts`.

The frozen conceptual model v1.2 is implemented by PostgreSQL migrations.
Before touching `supabase/migrations/`, read
`docs/architecture/data-model.md`; every entity and invariant must map there.

Do not add or reinterpret club concepts, import real roster/member data, or add
tidy fixtures. New concepts, vocabulary changes, relaxed invariants, and release
scope require Brian's decision. Hosted data is limited to Brian-approved pilot
identities and synthetic scenarios under `docs/pilot-data-runbook.md`.

## Sources of truth

| Need                        | Read                              |
| --------------------------- | --------------------------------- |
| Running behavior            | `docs/operating-the-slice.md`     |
| Architecture and security   | `docs/architecture.md`            |
| Tables and invariants       | `docs/architecture/data-model.md` |
| Local setup and commands    | `docs/local-development.md`       |
| Schema release and recovery | `docs/migration-runbook.md`       |
| Hosted pilot procedure      | `docs/pilot-data-runbook.md`      |
| Hosted non-schema manifest  | `docs/pilot-data-manifest.md`     |
| Deploy and rollback         | `docs/deployment.md`              |
| Mission operation           | `docs/mission-harness.md`         |
| Decisions                   | `docs/adr/README.md`              |

The more specific document wins; correct this file when it drifts.

## Framework rules

This is Next.js 16. Read the relevant installed guide under
`node_modules/next/dist/docs/` before writing Next.js code.

- Use `src/proxy.ts` and export `proxy`; never create `middleware.ts`.
- Await `cookies()`, `headers()`, `params`, and `searchParams`.
- Turbopack is the default. `npm run typecheck` generates route types first.
- From Server Components, use MUI `href` or a client adapter instead of
  passing `component={Link}` into a client component.
- Material UI v9 is the component baseline. Put system styling in `sx`.
  Tailwind is allowed for layout and one-offs; never style one element with both.

## Local commands

Use Node ≥20.9, npm ≥10, Git, and a running Docker-compatible runtime.

```bash
npm ci
npm run dev
npm run build
npm run typecheck
npm run test
npm run verify

npm run db:acquire -- LAN-###
npm run db:start
npm run db:status
npm run db:reset
npm run db:heartbeat
npm run db:review-ready
npm run db:release

npm run types:generate
npm run types:check
npm run check:rls
```

`npm run verify` is exactly format check, lint, typecheck, tests, and build.
Report a pass only after observing it. Database-backed test files must be listed
in `DATABASE_TEST_SUITES`; the test guard explains omissions.

## Code placement

- Routes: `src/app/`; handlers: `src/app/api/`.
- Business rules and data access: services under `src/lib/`, never components
  or route handlers.
- Supabase clients and generated types: `src/lib/supabase/`.
- Forward-only schema changes: `supabase/migrations/`.
- Cross-cutting integration tests: `tests/`; otherwise colocate `*.test.ts`.
- Owner-run production procedures: `scripts/production/`.
- Human-run hosted pilot SQL: `scripts/pilot/<issue>/`.

Never hand-edit `src/lib/supabase/database.types.ts`. Commit regenerated types
with their migration. A schema change also updates
`docs/architecture/data-model.md`.

## Change workflow

Every change traces to an issue. Never commit to `main`; branch from current
`main` with `feat/`, `fix/`, `docs/`, or `chore/`. Preserve unrelated
work in a dirty tree.

For user-facing work, read the complete Linear issue and comments,
`docs/ux/slice-ux.md`, its `docs/ux/tickets/` contract, and all desktop and
375px wireframes. Stop for conflicting authority or an unrecorded product or
security decision. PRs include UX conformance and applicable screenshots.

Commits use an imperative subject under about 72 characters and a body explaining
why. Open draft PRs only. State the change, verification, external configuration,
and limitations. Fill every line in the Production handoff block, including
explicit `No` and `None`.

Run `npm run verify` before a normal PR. When migrations change, also run:

```bash
npm run db:reset
npm run db:seed
npm run types:generate
npm run check:rls
```

Fast-lane eligibility and its fixed reduced verification come only from
`.github/fast-lane-rules.json` and `docs/fast-lane.md`. The classifier
re-derives eligibility from `main...head`; unclassified, deleted, renamed,
mixed, application, schema, dependency, infrastructure, workflow, configuration,
ADR, or protected-governance changes use the normal lane. Agents never merge;
the eligible workflow may. Neither lane deploys.

## The fast lane

Only documentation and qualifying cross-cutting tests are eligible; the
agent-instruction class is empty today. Application/schema/migration,
dependency, deployment/workflow, changes that weaken valid coverage, deletion/rename, and mixed
changes are ineligible regardless of how small they are. A tiny application fix
stays draft-only in the normal lane, runs `npm run verify`, and never
auto-merges.

`.github/fast-lane-rules.json` is the gate and `docs/fast-lane.md` is the
runbook. Eligibility is recomputed from `main...head`; the label asks and is
never evidence. Classification fails closed: absence of a rule is never
permission. Changes to eligibility, required verification, automatic-merge
authority, or protection of these rules are protected and use the normal lane.
Everything else keeps the normal workflow: `npm run verify` passes locally,
the PR remains a draft, and Brian merges it. A fast-lane merge does not deploy.

Pilot artifacts are required only when `docs/pilot-data-runbook.md` says local
proof is insufficient and hosted synthetic rows are absent. Tell Brian as soon
as any owner action is discovered and repeat it in the PR and final handoff.
Agents never run pilot SQL against hosted, create hosted Auth users, grant hosted
access, decide retention, or write production data.

## Security and production

Local Supabase only. Developer commands, tests, migrations, type generation, and
agents never target production. The sole deployed-runtime exception is the
fixed Cloud Run branch in `src/lib/db/runtime-target.ts`; never add it to
`src/lib/db/url.ts` or `scripts/lib/local-db.mjs`, and never make it
configurable.

Never expose a secret in code, prompts, logs, fixtures, commits, Notion, or a
client bundle. `NEXT_PUBLIC_` is public. Real secrets live in GCP Secret
Manager or scoped GitHub environment secrets. Ask Brian to run the exact
owner-side command when a real value is required; verify presence, never value.

Every exposed table enables RLS in its creating migration. Revoke all privileges
from `anon`, `authenticated`, and `service_role`, then grant only the narrow
server need. Views use `security_invoker = true`. The service layer is the
primary authorization boundary; RLS is the backstop.

Shared migrations are forward-only. No agent applies a hosted migration.
Deployment is a deliberate owner action through `gh workflow run deploy.yml`;
merging `main` deploys nothing. Follow `docs/deployment.md` for smoke tests
and rollback.

Stop and ask Brian before changing the approved domain model, security/privacy
posture, infrastructure cost, ownership/access boundary, release scope, a
recorded ADR decision, or anything needing credentials or authority you lack.
Proceed on ordinary application code, tests, scripts, docs, theme, and tooling.

## Harness operating law

Every issue or work package uses one lifecycle:

`planned → approved → dispatched → built → gate-passed → merged → reclaimed`

`walked`, `owner-checked`, and `security-reviewed` are conditional evidence
for `gate-passed`, not competing statuses. Linear's UI states are projections,
not another lifecycle. Skills may name operations and blocked outcomes but may
not redefine these milestones.

Use the minimum and cheapest reliable executor:

1. deterministic script before any model;
2. Haiku-class for bounded reads, scouting, dossiers, summarization, and
   mechanically bounded low-risk implementation;
3. Sonnet-class for complex implementation, correction, every review, and
   workflow walking; and
4. Sonnet- or Opus-class for the Mission Lead, selected by Brian.

Implementation and correction are capped at Sonnet; the Lead may choose Haiku
only for low-risk work with a complete contract and mechanical acceptance.
Review is always Sonnet and capped there. No agent self-escalates above its cap.
A mission runs at most three agents concurrently, including at most two
implementation workers.

Exactly five user-invoked workflows and three subagents are approved:

| Role                     | Contract                                  |
| ------------------------ | ----------------------------------------- |
| `/start-issue LAN-###`   | `.claude/skills/start-issue/SKILL.md`     |
| `/finish-issue LAN-###`  | `.claude/skills/finish-issue/SKILL.md`    |
| `/mission-intake <n>`    | `.claude/skills/mission-intake/SKILL.md`  |
| `/run-mission M-<id>`    | `.claude/skills/run-mission/SKILL.md`     |
| `/finish-mission M-<id>` | `.claude/skills/finish-mission/SKILL.md`  |
| `implementation-worker`  | `.claude/agents/implementation-worker.md` |
| `code-reviewer`          | `.claude/agents/code-reviewer.md`         |
| `scout`                  | `.claude/agents/scout.md`                 |

All workflows are user-invoked. `/start-issue` implements one issue directly;
`/run-mission` is the sole orchestrator and delegates flatly; closeout skills
implement nothing. Workers, reviewers, and scouts spawn nothing.

Mission memory is the append-only journal owned by `npm run mission`.
CLI refusals, leases, collision rules, exact-head evidence, merge classifiers,
and cleanup proofs are authoritative. The Lead follows its executable frontier
and uses scouts instead of loading repository investigation into top-tier
context.

No agent merges, un-drafts a pull request, deploys, migrates hosted Supabase, or
writes to production. No agent weakens local-only guards, changes GitHub
settings, or bypasses a fence. Draft PRs remain drafts until Brian or the
merge workflow merges them. A mission merge does not deploy because
`deploy.yml` is manual-only. LAN-90 and LAN-92 remain binding; manual
distribution is never a fallback.

## Done

A repository change is done only when applicable verification passed; migrations
apply from empty; generated types and the data-model map agree; new tables have
RLS and narrow grants; behavior docs are current; no secret, real member data,
or unauthorized domain concept was added; CI is green; and the PR's Production
handoff is complete. Fast-lane changes use only their fixed class verification.
