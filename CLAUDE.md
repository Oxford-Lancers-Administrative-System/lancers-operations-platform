@AGENTS.md

# Lancers Operations Platform — agent guide

Operations platform for the Oxford Lancers. **Right now this repository is
infrastructure scaffold only.** It proves the development, CI, and deployment
loop. It contains no club domain functionality, and that is deliberate.

Read `docs/architecture.md` for the full picture and `docs/adr/` for why things
are the way they are. This file is the short version plus the rules.

---

## Hard rules

**1. Never touch production Supabase.** Development, tests, migrations, and type
generation run against the **local** Supabase stack only. There is one production
project and no staging. A production secret key must never exist on a development
machine, in this repository, in GitHub, in Notion, or in a prompt.
→ [ADR 0001](docs/adr/0001-local-supabase-only.md)

**2. Never write a secret anywhere.** Not into a file, a commit, a test fixture,
a ticket, a chat message, or a prompt. Secrets live in GCP Secret Manager and, if
unavoidable, scoped GitHub environment secrets. `.env.example` holds placeholders
only. If you need a real value, ask Brian to set it himself and tell him the
exact command.

**3. Do not add domain code.** No player, roster, event, RSVP, attendance,
injury, communications, or other club entity — no tables, no migrations, no
models, no fixtures. `tests/no-domain-code.test.ts` enforces this and will fail
the build. The ticket that legitimately introduces the domain model deletes that
test; nothing else may.
→ [ADR 0007](docs/adr/0007-zero-domain-code-boundary.md)

**4. Every table enables RLS in the same migration that creates it.**
Deny-by-default. `npm run check:rls` enforces it in CI.
→ [ADR 0002](docs/adr/0002-rls-posture.md)

**5. Never commit directly to `main`.** It is protected; pushes are rejected even
for administrators. Work on a branch, open a pull request, let CI pass, merge.
Zero human approvals are required — Brian may merge his own.
→ [ADR 0006](docs/adr/0006-solo-developer-branch-protection.md)

**6. Material UI is the component baseline.** Anything MUI provides — buttons,
inputs, dialogs, tables, navigation — is MUI, themed through `src/theme.ts`.
Tailwind is also installed and may be used for layout and one-off utility
styling, but never style the same element with both.
→ [ADR 0004](docs/adr/0004-styling-baseline.md)

---

## Getting a working loop

```bash
npm install
npm run db:start            # needs Docker running; first run pulls images
cp .env.example .env.local  # fill from `npm run db:status`
npm run db:seed-user
npm run dev                 # http://localhost:3000
```

Full detail, including troubleshooting: `docs/local-development.md`.

## Before you claim you are done

```bash
npm run verify   # format:check → lint → typecheck → test → build
```

That is exactly what CI runs. If you changed migrations, also:

```bash
npm run db:reset && npm run types:generate && npm run check:rls
```

Commit the migration and the regenerated types together — CI fails if they
disagree. Never hand-edit `src/lib/supabase/database.types.ts`.

## This is Next.js 16

Different from most training data. Read `node_modules/next/dist/docs/` before
writing framework code. In particular:

- The `middleware` convention is **renamed to `proxy`**. This project has
  `src/proxy.ts` exporting `proxy`. Do not create `middleware.ts`.
- `cookies()`, `headers()`, `params`, and `searchParams` are **async** — await them.
- Turbopack is the default for `next dev` and `next build`.
- Route types (`PageProps<"/login">`, `LayoutProps<"/">`) are generated, not
  hand-written, and do not exist in a fresh clone until something generates
  them. That is why `npm run typecheck` runs `next typegen` first. If TypeScript
  cannot find `PageProps`/`LayoutProps`, or rejects a route string for a page
  you just added, run `npm run typecheck`.
- Passing `component={Link}` from a Server Component into a MUI Client Component
  is a build error. Use MUI's `href` prop, or add a small client-side adapter.

Material UI is **v9**: system props such as `alignItems` are no longer accepted
directly on components — use `sx`.

## Where things live

| You want to…                               | Go to                                        |
| ------------------------------------------ | -------------------------------------------- |
| Add a page                                 | `src/app/`                                   |
| Read Supabase from a Server Component      | `src/lib/supabase/server.ts`                 |
| Read Supabase from the browser             | `src/lib/supabase/client.ts`                 |
| Use the privileged key (rare, server-only) | `src/lib/supabase/admin.ts`                  |
| Change auth/session behaviour              | `src/proxy.ts`                               |
| Change the theme                           | `src/theme.ts`                               |
| Add a migration                            | `npx supabase migration new <name>`          |
| Change local Supabase behaviour            | `supabase/config.toml`                       |
| Change CI                                  | `.github/workflows/ci.yml`                   |
| Change the deploy                          | `.github/workflows/deploy.yml`, `Dockerfile` |
| Understand a past decision                 | `docs/adr/`                                  |

## What you may change freely, and what needs Brian

**Freely:** application code under `src/`, tests, scripts, docs, workflow steps,
dependencies, the theme's contents.

**Ask Brian first:**

- Anything that spends money or creates cloud resources (GCP projects, billing,
  raising `max-instances`, new paid services).
- Anything needing a credential, an external account, or an authorization.
- Changing a decision recorded in `docs/adr/` — write a superseding ADR and get
  agreement; do not quietly reverse one.
- Applying anything to the production Supabase project.
- Introducing the domain model.

## Recording decisions

New constraint on future work? Add an ADR in `docs/adr/`, numbered, and add a row
to `docs/adr/README.md`. ADRs are immutable once accepted — supersede, never edit.

## Known open items

- **Hosted Supabase project** — public self-registration is still **enabled** on
  the production project (`disable_signup: false`). It must be turned off; local
  is already correct. Key scheme is verified. ([ADR 0003](docs/adr/0003-supabase-key-types.md))
- **GCP project** — not yet created; `scripts/gcp-bootstrap.sh` is ready to run.
  The deploy workflow skips cleanly until it is configured.
- **Custom domain** — blocked on a GoDaddy transfer. Cloud Run default URL only.
- **Google OAuth** — deferred; email/password is the sanctioned fallback.
