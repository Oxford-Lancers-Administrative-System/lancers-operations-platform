# Lancers Operations Platform

Operations platform for the **Oxford Lancers**.

> **Current state: infrastructure plus the domain schema baseline.** The
> approved conceptual domain model is implemented as PostgreSQL migrations, with
> a deterministic synthetic dataset and tests that prove its invariants are
> enforced by the database rather than merely documented. Independently verified
> on 2026-08-10, with two findings corrected in a forward-only migration. **No application
> workflow is built on it yet** — no screens, no API routes, no notification
> delivery, and no real roster data anywhere.
> See [docs/architecture/data-model.md](docs/architecture/data-model.md).

|                 |                                                                         |
| --------------- | ----------------------------------------------------------------------- |
| **Stack**       | Next.js 16 (App Router) · React 19 · TypeScript strict · Material UI 9  |
| **Data & auth** | Supabase (PostgreSQL, London / EU West 2)                               |
| **Hosting**     | Google Cloud Run (`europe-west2`), Cloud Run default URL                |
| **CI/CD**       | GitHub Actions, OIDC + Workload Identity Federation (no stored GCP key) |

## Quick start

Requires Node ≥ 20.9, npm, and a running Docker daemon.

```bash
npm install
npm run db:start            # local Supabase; first run pulls images
cp .env.example .env.local  # fill from `npm run db:status`
npm run db:seed             # synthetic domain data (local only)
npm run db:seed-user        # the one pre-provisioned test user
npm run dev                 # http://localhost:3000
```

Full walkthrough and troubleshooting: **[docs/local-development.md](docs/local-development.md)**.

## Documentation

| Document                                                           | What it covers                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [docs/local-development.md](docs/local-development.md)             | Clean machine → running app; every npm script; migrations                                        |
| [docs/architecture.md](docs/architecture.md)                       | Stack, layout, request path, security model                                                      |
| [docs/architecture/data-model.md](docs/architecture/data-model.md) | **Every table, every invariant, and where each rule is enforced**                                |
| [docs/migration-runbook.md](docs/migration-runbook.md)             | How a schema change reaches production, and how to recover                                       |
| [docs/pilot-data-runbook.md](docs/pilot-data-runbook.md)           | **Testing a feature against hosted Supabase** — pilot identities, synthetic scenarios, retention |
| [docs/pilot-data-manifest.md](docs/pilot-data-manifest.md)         | What is currently in the hosted database that is not schema                                      |
| [docs/deployment.md](docs/deployment.md)                           | Cloud Run deploy, secrets, cost controls, **rollback**                                           |
| [docs/adr/](docs/adr/)                                             | Architecture decision records                                                                    |
| [AGENTS.md](AGENTS.md)                                             | **Canonical working agreement** — commands, conventions, hard rules                              |
| [CLAUDE.md](CLAUDE.md)                                             | Claude Code entry point; imports `AGENTS.md`                                                     |

## Scripts

`npm run verify` runs what CI runs: `format:check` → `lint` → `typecheck` →
`test` → `build`. Run it before opening a pull request. The full table of
scripts is in [docs/local-development.md](docs/local-development.md#everyday-commands).

## Contributing

`main` is protected. Direct pushes and force-pushes are rejected — including for
administrators. All changes go through a pull request with CI green.

> **Provisional approval rule.** The club has never named a production approver
> and Brian is currently the only durable administrator, so **required approving
> reviews is zero**: CI is the gate, and Brian may merge his own pull requests.
> This is provisional and will be revisited when a second club administrator with
> GitHub organization access exists.
> See [ADR 0006](docs/adr/0006-solo-developer-branch-protection.md).

## Security

- Development, tests, and CI run against **local Supabase only**. The production
  project is never a development target. ([ADR 0001](docs/adr/0001-local-supabase-only.md))
- Row Level Security is enabled on every exposed table, deny-by-default, and
  enforced in CI. ([ADR 0002](docs/adr/0002-rls-posture.md))
- Domain tables are unreachable from the browser twice over: no RLS policy
  **and** no grant to any browser-facing role.
  ([ADR 0010](docs/adr/0010-domain-table-access-posture.md))
- The synthetic dataset contains no real person, contact detail or club record.
  Every email domain is under the reserved `.example` TLD and every phone number
  is in a range reserved for fiction, asserted by test.
- Secrets live in GCP Secret Manager and are read at runtime. Nothing secret is
  committed, and `.env.example` contains placeholders only.
- The repository is public. Treat every committed byte as public.

## Licence

This repository carries **no licence file**, which under default copyright means
all rights are reserved: the code is publicly _readable_ because the repository
is public, but nobody is granted permission to use, copy, modify, or redistribute
it. That is the status quo, recorded here so it is a known position rather than
an oversight — the ticket's "licence if applicable" item was left open.

Adding an explicit licence is a club decision about ownership, not a development
choice, and belongs with the GitHub organisation owners. Until they make one,
assume all rights reserved.

## Known limitations

- **No custom domain** — `app.oxfordlancers.com` is blocked on a GoDaddy
  transfer. The Cloud Run default URL is used.
- **No staging environment** — one production Supabase project plus local. A
  staging environment and a rehearsed backup restore are both mandatory gates
  before real roster data enters the system.
  ([docs/migration-runbook.md](docs/migration-runbook.md#pre-pilot-gate))
- **Controlled leadership pilot only, and no real club data** — until those
  gates close, the hosted database may hold the schema, approved pilot
  identities for the leadership testers, and clearly synthetic feature
  scenarios. **The real roster and real club operations — events, RSVPs,
  attendance, availability, subscriptions, contact details — remain prohibited
  in every environment.** Pilot data is put there by hand, by Brian, never by an
  agent, CI or a deploy.
  ([docs/pilot-data-runbook.md](docs/pilot-data-runbook.md) ·
  [ADR 0016](docs/adr/0016-controlled-production-pilot-data.md))
- **No second administrator** — locked Requirement 14 is unsatisfied, so schema
  promotion currently has a single point of failure.
- **Google OAuth deferred** — needs an approved redirect domain and a club
  administrator who can create OAuth credentials. Email/password is the
  sanctioned fallback.
- **Two styling systems** — Material UI is the component baseline; Tailwind is
  also available for layout and utility styling. Never style one element with
  both. ([ADR 0004](docs/adr/0004-styling-baseline.md))
