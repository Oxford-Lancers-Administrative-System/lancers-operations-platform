# Architecture

Operations platform for the Oxford Lancers. The repository holds the
infrastructure and the **domain schema baseline** — the frozen conceptual domain
model implemented as migrations. No application workflow is built on it yet.

The physical data model, the conceptual-to-relational map and the invariant
enforcement matrix are in [`architecture/data-model.md`](architecture/data-model.md).
How a schema change reaches production is in
[`migration-runbook.md`](migration-runbook.md).

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
    operate/              the operator shell — the protected area (LAN-73)
    dashboard/            LAN-71's session-protected wiring proof, superseded by operate/
    api/health/route.ts   dependency-free health endpoint
    layout.tsx            MUI providers + CssBaseline
  lib/auth/
    operator.ts           session → club Person and currently-effective role codes
    capabilities.ts       privileged action → permitted role codes. The policy.
    guards.ts             requireOperator / requireRole / requireCapability
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
  migrations/             the domain schema baseline plus one correction migration
  seed.sql                intentionally empty — see scripts/seed-local.mjs
scripts/
  seed-local.mjs          deterministic synthetic dataset (local only)
  lib/local-db.mjs        local-database access + the non-local guard
  …                       type generation, RLS gate, test user, GCP bootstrap
tests/                    integration, schema, and security tests
docs/architecture/        the physical data model
docs/adr/                 architecture decision records
```

## Data layer

Thirty-four tables, eight derived views and thirty-one enum types in `public`,
plus three staging tables in an unexposed `staging` schema.

| Area          | Tables                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity      | `people`, `person_aliases`, `contact_points`                                                                                                           |
| Cycles        | `seasons`, `terms`, `committee_years`                                                                                                                  |
| Membership    | `season_memberships`, `season_membership_status_events`, `recruitment_prospects`                                                                       |
| Squad         | `position_vocabularies`, `positions`, `position_assignments`, `jersey_assignments`, `onboarding_item_types`, `onboarding_items`, `eligibility_records` |
| Roles         | `roles`, `role_aliases`, `role_assignments`                                                                                                            |
| Availability  | `availability_statuses`                                                                                                                                |
| Events        | `event_series`, `alternative_groups`, `events`, `schedule_changes`, `event_questions`, `event_audience_members`                                        |
| Participation | `invitations`, `rsvp_responses`, `question_responses`, `attendance_records`                                                                            |
| Machinery     | `notification_jobs`, `delivery_results`                                                                                                                |
| Reporting     | `weekly_reports`, `follow_up_actions`, `audit_events`                                                                                                  |

Durable relational integrity lives in PostgreSQL; changeable workflow behaviour
lives in the TypeScript service layer. Which rule sits where, and why, is the
[invariant enforcement matrix](architecture/data-model.md#invariant-enforcement-matrix).

`src/proxy.ts` — Next.js 16 renamed the `middleware` convention to `proxy`. Same
semantics, different filename and export name.

## Request path

```
Browser
  │
  ├─▶ src/proxy.ts          refresh Supabase session, write rotated cookies,
  │                          redirect anonymous requests for a PROTECTED_PREFIXES
  │                          path — /dashboard, /operate — to /login, keeping the
  │                          requested path in ?redirectTo
  │
  ├─▶ Server Component      createClient() from lib/supabase/server.ts
  │                          publishable key → RLS applies
  │                          a protected page also calls a guard from lib/auth
  │
  └─▶ Server Action         sign in / sign out; sets auth cookies
                             a privileged action calls requireCapability() first
```

Route protection in `proxy.ts` is convenience, not the authorization boundary.
Every protected page re-checks for itself, because a proxy matcher can be changed
or bypassed and Server Actions are not separate routes in the matcher chain. Under
`/operate` the layout and the page each resolve independently, and a privileged
Server Action guards itself a third time — see **Authorization** below.

### Reaching club data

Club data is never read or written from a component, a Server Action or a route
handler directly. Everything goes through a **service module** under
`src/lib/services/`, and there are two ways out of it into the database:

```
Server Component / Server Action / route handler
  │
  └─▶ src/lib/services/*        one module per aggregate; every function takes
      │                          an explicit actor (personId from resolveOperator)
      │
      ├─▶ createAdminClient()   Data API · secret key → PostgREST connects as
      │                          `authenticator`, switches to `service_role`
      │                          Reads that need no transaction.
      │
      └─▶ withTransaction()     src/lib/db · DIRECT PostgreSQL connection, a
                                 SEPARATE credential and a SECOND access path.
                                 Real begin/commit. Nested calls join the outer
                                 transaction — an inner failure rolls the whole
                                 thing back. Every multi-statement write, and
                                 recordAudit(tx, …) alongside the change it
                                 describes (invariant M2).
```

Both paths are privileged and server-only. They are **not the same principal**:
the second authenticates as a PostgreSQL login in its own right — locally
`postgres`, which owns every table and has admin privileges. See
[ADR 0014](adr/0014-transactional-data-access.md), and
`src/lib/services/README.md` for the conventions a service module follows.

Hosted, that second path connects as `app_runtime` — a least-privilege login
that owns no table and inherits its grants through membership of `service_role`,
over the shared pooler in transaction mode. See
[ADR 0026](adr/0026-hosted-runtime-database-connection.md).

## Security model

Three tiers of configuration, and the boundary between them is the thing to get
right:

| Tier         | Example                                | Reaches the browser?      | Bypasses RLS? |
| ------------ | -------------------------------------- | ------------------------- | ------------- |
| Local        | CLI-generated keys in `.env.local`     | n/a                       | n/a           |
| Browser-safe | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Yes**, inlined at build | No            |
| Server-only  | `SUPABASE_SECRET_KEY`                  | Never                     | **Yes**       |
| Server-only  | `DATABASE_URL`                         | Never                     | **Yes**       |

**There are two privileged credentials, not one, and they are different
principals.** `SUPABASE_SECRET_KEY` is presented to the Data API; PostgREST
connects as `authenticator` and switches to `service_role`, which bypasses RLS
via `BYPASSRLS`. `DATABASE_URL` is a direct PostgreSQL connection authenticating
as a PostgreSQL login in its own right, with that login's own attributes and
grants — locally `postgres`, which owns every table and has admin privileges.
It reaches the database by a route PostgREST's grants do not mediate.
[ADR 0010](adr/0010-domain-table-access-posture.md)'s posture is extended by it,
not preserved unchanged — see
[ADR 0014](adr/0014-transactional-data-access.md).

Hosted, `DATABASE_URL` names `app_runtime`: a login that owns no table, holds
neither `CREATEROLE` nor `CREATEDB`, and takes its privileges from membership of
`service_role` — so it reaches **exactly as far as the secret key, and no
further**. It carries `BYPASSRLS`, because every domain table has RLS enabled
with zero policies and a role that neither owns them nor bypasses reads zero
rows. [ADR 0026](adr/0026-hosted-runtime-database-connection.md) records the
grants, the connection mode and why the alternatives were rejected.

**Two guards, deliberately separate.** `src/lib/db/url.ts` refuses any
non-loopback host unconditionally, and governs every local tool, seed command,
test and CI job — the approved production target included.
`src/lib/db/runtime-target.ts` is the only thing that may accept a hosted
target, only when Cloud Run's own `K_SERVICE` identifies the deployed service,
and only for the one target pinned in its source. No environment variable
widens either. That guard prevents accidental targeting; the security boundary
is the credential's grants, who may read the secret, and production change
control.

- Anything prefixed `NEXT_PUBLIC_` is public. Assume the internet reads it.
- `admin.ts` and `src/lib/db/` import `server-only`, so importing either from a
  Client Component is a build error rather than a leak.
- A database rejection reaching an operator is mapped to a typed error carrying
  only `code`, `constraint` and `table`. PostgreSQL's `detail`, `hint` and
  `where` quote the offending row — for this schema, a real person's details —
  and are never copied out.
- RLS is deny-by-default on every exposed table — [ADR 0002](adr/0002-rls-posture.md).
- Domain tables are also unreachable at the **grant** level: `anon` and
  `authenticated` hold no privilege on any of them, and every view is
  `security_invoker` — [ADR 0010](adr/0010-domain-table-access-posture.md).
- Availability data is restricted to the privileged server path, and no column
  anywhere can hold a diagnosis or treatment (Requirement 8, enforced
  structurally and asserted by test).
- The service layer is the primary authorization boundary; RLS is the backstop.
  The layer now exists — `src/lib/db/` and `src/lib/services/` — but it carries
  **no authorization rule yet**. `requireRole()` arrives in LAN-73. Until then a
  service function takes an actor and records it; it does not check it.
- Development and CI never touch production — [ADR 0001](adr/0001-local-supabase-only.md).

## Authentication scope

Still deliberately minimal on the sign-in side: email/password only, one
manually pre-provisioned user, public self-registration disabled.

**Authentication now resolves to a person.** `public.operator_accounts` joins a
Supabase auth user to exactly one `people` row (LAN-71). `resolveOperator()` in
`src/lib/auth/operator.ts` reads the _verified_ user from
`supabase.auth.getUser()` — never a raw cookie claim — and returns that person
together with their currently-effective role codes, or `null` when there is no
session, no link, or the link has been deactivated. `operator_accounts` is
reachable only through the privileged server client: RLS on, zero policies, no
grant to `anon` or `authenticated`, and no `delete` for `service_role`, because
revocation is a dated deactivation and an actor named by history must stay
resolvable.

`role_assignments` is readable as **the authorization input** — the club's
committee and coaching seats, expressed as role codes a decision can be made
against. Since LAN-73 those codes are **enforced**, and how is the next section.

### Authorization

**The service layer is the authorization boundary; RLS is the backstop**
(ADR 0010). Concretely, since LAN-73:

```
src/lib/auth/capabilities.ts   the policy, as frozen data: each privileged action
                               → the role codes permitted to perform it
src/lib/auth/guards.ts         the decision: assertRole / assertCapability (pure,
                               take an actor) and requireOperator / requireRole /
                               requireCapability (take the actor from the verified
                               session and nowhere else)
```

Four properties this arrangement is built to have, and which tests hold it to:

- **One place decides.** No page, Server Action or service module carries its own
  list of role codes; each names a capability and reads it from the map. A test
  scans `src/` and fails on a role code in a string literal anywhere else.
- **An undecided grant refuses everybody.** A capability with an empty role list
  is refused to every operator including the President — absence of a decision is
  never permission. Three capabilities are in that state today, each naming the
  issue that owes the answer.
- **Enforcement is in the action, not the route.** A Server Action is a POST
  endpoint that anyone with a session can call whether or not a screen offered it,
  so every privileged action calls `requireCapability()` itself. Actions take no
  actor argument, because a browser would then supply it. Navigation visibility
  neither grants nor revokes anything.
- **A refusal names the requirement, never the holdings.** `NotPermitted` says
  what the action requires; it never lists the roles the caller holds, and never
  says who does hold the missing one.

An operator with no currently-effective seat is still a legitimate operator: they
open the shell, and are refused each privileged action individually.

**One actor is narrowed rather than granted** (LAN-110). An operator whose only
capability-bearing seat is a coaching one — Head Coach, Offensive Coordinator,
Defensive Coordinator — receives the occurred-event attendance surface and
nothing else, per `docs/ux/slice-ux.md` § 3. That cannot be expressed as a
capability, because the surfaces being withheld (Roster, the event detail) are
open to any linked operator and so have no capability to fail. It is derived
instead, in the same module: `isNarrowAttendanceRecorder()` is true when the
operator holds `attendance_recorder` and holds no capability outside the
attendance pair. Three consequences worth knowing:

- It only ever **removes** surfaces, and only from that one actor. Somebody who
  coaches _and_ holds a committee seat keeps the operator's board, deliberately —
  narrowing a coach's surface is not a licence to withdraw authority a recorded
  decision granted.
- The `/operate` gate **fails closed**: a page says nothing and is closed to a
  coach, and the three that are open say so explicitly. A page added later
  inherits the refusal by doing nothing at all.
- Two actions that are correctly open to any linked operator — roster intake and
  onboarding resolution — sit on `requireGeneralOperator()`, the same floor with
  that one actor removed. Hiding the roster from the coach's navigation would not
  have been enough: a Server Action is reachable whether or not a screen offered
  it.

**The role catalogue is seeded, not migrated.** `public.roles` is populated only
by `scripts/seed-local.mjs`; no migration defines it, so a hosted database has no
role rows until somebody creates them, and every capability keys on codes that do
not exist there yet. Recorded on LAN-73 as an owner action.

Google OAuth is deferred — it needs an approved redirect domain and a club
administrator able to create OAuth credentials, both open club-side items.

## Guardrails that run in CI

| Gate                                              | Mechanism                                     |
| ------------------------------------------------- | --------------------------------------------- |
| Formatting, lint, types, tests, build             | `npm run verify`                              |
| Migrations apply cleanly from empty               | `supabase db reset` in CI                     |
| The seed loads after a clean reset                | `npm run db:seed` in `ci.yml`                 |
| Generated types match the schema                  | `npm run types:check`                         |
| Every new table enables RLS                       | `npm run check:rls`                           |
| A browser-safe key reads nothing                  | `tests/rls-posture.test.ts`                   |
| Sign-in works, public sign-up does not            | `tests/auth-flow.test.ts`                     |
| Frozen invariants are really enforced             | `tests/schema-invariants.test.ts`             |
| Valid messy data is still accepted                | `tests/schema-accepts.test.ts`                |
| The audience relation and P7's five states        | `tests/schema-event-audience.test.ts`         |
| RLS, grants and view rights hold                  | `tests/schema-security.test.ts`               |
| The operator join is unreachable and undeletable  | `tests/schema-operator-accounts.test.ts`      |
| Capability grants are exactly what was decided    | `src/lib/auth/capabilities.test.ts`           |
| Guards refuse, and disclose nothing doing it      | `src/lib/auth/guards.test.ts`                 |
| Privileged actions enforce, not their pages       | `src/app/operate/actions.test.ts`             |
| Only the capability map names a role code         | `tests/capability-map-single-source.test.ts`  |
| Every capability's role codes exist in the schema | `tests/operator-capability-catalogue.test.ts` |
| `/operate` is unreachable without a session       | `tests/operate-route-protection.test.ts`      |
| The local operator link script stays local        | `tests/link-test-operator.test.ts`            |
| The synthetic dataset stays messy                 | `tests/synthetic-seed.test.ts`                |
| The container builds and serves                   | `container` job in `ci.yml`                   |
