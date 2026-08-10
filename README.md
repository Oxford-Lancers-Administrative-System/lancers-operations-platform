# Lancers Operations Platform

Operations platform for the **Oxford Lancers**.

> **This repository is currently infrastructure scaffold.** It exists to prove
> the development, CI, and deployment loop end to end before any club domain
> work begins. It deliberately contains **no** players, rosters, events,
> attendance, RSVPs, injuries, or communications — no domain tables at all.
> See [ADR 0007](docs/adr/0007-zero-domain-code-boundary.md).

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
npm run db:seed-user        # the one pre-provisioned test user
npm run dev                 # http://localhost:3000
```

Full walkthrough and troubleshooting: **[docs/local-development.md](docs/local-development.md)**.

## Documentation

| Document                                               | What it covers                                            |
| ------------------------------------------------------ | --------------------------------------------------------- |
| [docs/local-development.md](docs/local-development.md) | Clean machine → running app; every npm script; migrations |
| [docs/architecture.md](docs/architecture.md)           | Stack, layout, request path, security model               |
| [docs/deployment.md](docs/deployment.md)               | Cloud Run deploy, secrets, cost controls, **rollback**    |
| [docs/adr/](docs/adr/)                                 | Architecture decision records                             |
| [CLAUDE.md](CLAUDE.md)                                 | Agent working agreement and hard rules                    |

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
- Secrets live in GCP Secret Manager and are read at runtime. Nothing secret is
  committed, and `.env.example` contains placeholders only.
- The repository is public. Treat every committed byte as public.

## Known limitations

- **No custom domain** — `app.oxfordlancers.com` is blocked on a GoDaddy
  transfer. The Cloud Run default URL is used.
- **No staging environment** — one production Supabase project plus local.
- **Google OAuth deferred** — needs an approved redirect domain and a club
  administrator who can create OAuth credentials. Email/password is the
  sanctioned fallback.
- **Tailwind vs Material UI unresolved** — MUI is the baseline; Tailwind is
  installed but unused pending a decision. ([ADR 0004](docs/adr/0004-styling-baseline.md))
