# 0026 — The hosted runtime connects as a least-privilege login, through the shared transaction pooler

**Status:** Accepted · **Date:** 2026-08-15 · **Decides what**
[0014](0014-transactional-data-access.md) **deferred** · **Extends:**
[0010](0010-domain-table-access-posture.md), [0002](0002-rls-posture.md) ·
**Narrows:** [0001](0001-local-supabase-only.md)

Recommended by implementation and approved by Brian on 2026-08-15, against the
two facts he read out of the project's own dashboard: the shared pooler's host,
and that the hosted `postgres` role holds `BYPASSRLS` and `CREATEROLE`.

## Context

ADR 0014 gave the service layer a direct PostgreSQL connection, because
`supabase-js` has no transaction and "the audience was inserted but the event was
never approved" is a state the frozen model has no name for. It then declined,
explicitly, to choose the hosted credential — the role, the grants, the RLS
treatment, the connection mode — and routed all of it to a later issue.

Three things have since made that deferral untenable. The service layer became
the **only** path to domain data: `createAdminClient()` appears in no service
module, so every read and every write in the application goes through this
connection. Features that perform real transactions have shipped. And LAN-93
made hosted testing part of the workflow, so the deployed container now needs a
database it is currently forbidden to open.

The local answer is not a proposal. Locally the connection is `postgres`, which
owns every table and holds admin privileges; copying that shape to production
would hand the deployed container a database administrator.

## Decision

### The role: `app_runtime`, a login that owns nothing

A dedicated PostgreSQL login, created by hand in the hosted project. It is not a
superuser, holds neither `CREATEROLE` nor `CREATEDB`, and owns no table. It
therefore cannot drop, truncate or alter anything in the schema — in PostgreSQL
those require ownership — and cannot grant itself more than it has.

### The grants: inherited from `service_role`, not restated

`grant service_role to app_runtime`.

ADR 0010 already curates, table by table, exactly what the server path may do:
`revoke all` first, then back only what is needed, and only `select, insert` on
append-only history. That list is version-controlled in the migrations and it
took deliberate thought.

Writing a second list for `app_runtime` would mean two lists to keep in step,
and the day a migration updates one and not the other, the failure appears in
production and nowhere else — because locally the connection owns the tables and
never consults a grant at all. Inheritance means there is one list, and a future
migration cannot leave this role behind.

It also settles a question ADR 0014 raised and could not answer: this credential
is now **exactly as broad as `SUPABASE_SECRET_KEY`**, rather than broader. There
are still two privileged paths into the database, but they have one blast radius
to reason about instead of two.

### The RLS treatment: `BYPASSRLS`, and the reason on the record

Every domain table has RLS enabled with **zero policies**. A login that neither
owns the tables nor carries `BYPASSRLS` reads **zero rows** while holding a full
`select` grant — no error, no warning; the club simply appears not to exist, and
writes fail with a permission error that names nothing useful.

So the attribute is not a convenience. Without it the application cannot
function at all, and the three ways to make it function are: own the tables
(that is the administrator we are avoiding), carry `BYPASSRLS`, or write
permissive policies for this role on every domain table.

Policies were rejected. A policy reading `using (true)` is `BYPASSRLS` with more
moving parts and a production migration attached, and it would reverse ADR 0002's
deny-by-default zero-policy posture — replacing a stance that is easy to audit
("no table has a policy") with one that has to be re-audited table by table.

**The security boundary was never RLS.** ADR 0002 says it in as many words: the
service layer is the primary authorization boundary and RLS is the backstop. For
a server-side credential that reaches the database outside PostgREST, the
backstop was never load-bearing. What limits the blast radius is the grant list
above, who may read the secret, and the change controls on production.

`tests/hosted-role-posture.test.ts` builds this exact role in the local database
and proves both halves: with the attribute, the application's reads and writes
work and every refusal holds; without it, the same role with the same grants
reads zero rows. The negative control is there so this decision is evidence
rather than habit.

### The connection mode: shared pooler, transaction mode, port 6543

Supabase offers three, and two are unusable here.

The **direct connection** and the **dedicated pooler** both answer on IPv6 only
unless the paid IPv4 add-on is enabled on the project instance — the dashboard
says so on the page that offers them. Cloud Run egresses over IPv4. Choosing
either means buying an add-on to reach a database the shared pooler reaches for
nothing.

The **shared pooler** (Supavisor) is IPv4-compatible, and its transaction mode is
documented for exactly this shape: stateless instances where each interaction is
brief and isolated, which is what scale-to-zero Cloud Run is.

Transaction mode forbids prepared statements. That constrains nothing here:
`Tx.query` takes `(sql, params)` and gives no caller a way to name a statement,
so the application structurally cannot issue one.

### Pool limits: 5 per instance

Five connections per instance, against `--max-instances=3`, is 15 client
connections — matched to the project's own 15-connection pool size and well
inside its 200-client cap, both read from the project's pooler settings, and
inside the role's own `connection limit 20`. Idle and connect timeouts stay at
10s and 5s.

**`DATABASE_POOL_MAX=5` is set on the revision by `.github/workflows/deploy.yml`,
not merely written down here.** The code default is 10, which across three
instances is 30 — over the pooler's pool size and over the role's connection
limit, failing only under concurrency and only in production. An earlier draft
of this ADR asserted the value without anything setting it; independent review
caught that, and the workflow flag is what makes the sentence above true.

### The secret: Secret Manager, injected at runtime

A new secret, `database-url`, holding the whole connection string. Injected into
the revision by `--set-secrets`, readable only by the Cloud Run runtime service
account, never in the image, the repository, the workflow environment, or a
developer's machine. Rotation is: reset the role's password in Supabase, add a
new secret version, redeploy. The old version stays until it is disabled, so a
rotation is reversible.

## The guard is accident prevention; the credential is the boundary

`src/lib/db/url.ts` refused every non-loopback host, unconditionally. That could
not simply be relaxed: the same guard is what stops `npm run db:seed` and the
schema tests reaching production.

**So the hosted branch was not added to it.** It went into a third function, in
`src/lib/db/runtime-target.ts`, which calls the unchanged guard for everything
that is not the deployed service:

- **Off the deployed service** — every developer machine, every CI job, every
  test, every seed command — loopback only, unconditionally, exactly as before.
  The approved production target is refused _here too_, which is what makes
  pinning it in public source a control rather than a liability.
- **On the deployed service** — identified by Cloud Run's own `K_SERVICE`, which
  the platform sets and this repository does not — `DATABASE_URL` must be present
  and must match the one approved target on host, port, database and role. Every
  other remote target is refused, including the same project reached three other
  documented ways.

There is no bypass variable and no production-mode switch. `NODE_ENV=production`,
`CI=1`, `ALLOW_REMOTE_DATABASE=1` and a `DATABASE_TARGET=hosted` all change
nothing, and `tests/local-only-guard-source.test.ts` reads the policy as text so
a conjunct spliced into it is a red test rather than a discovery.

A missing `DATABASE_URL` in the deployed runtime **throws**. It does not inherit
the local default, because a revision quietly trying to reach a database inside
its own container reports a connection error rather than a missing secret.

**None of this is the security boundary, and the documents must not pretend
otherwise.** It checks the target asked for, not the database reached; a loopback
port forwarded to a hosted database defeats it completely, exactly as ADR 0014
records. What actually limits harm is that the credential is least-privileged,
that its grants are curated, that only the runtime service account can read the
secret, and that production changes go through a human.

## Consequences

- **A second Secret Manager entry to provision and rotate.** It must exist
  _before_ this change merges: the deploy gate now fails a revision without it,
  and the service layer is already live on `main`.
- **The deploy gate reads a new health field.** `/api/health` reports
  `databaseConfigured`, a boolean, and stays dependency-free — it never connects,
  and publishes no host, port, mode, role or error. Presence is all it can prove.
- **Presence is not correctness, so there is a separate proof.**
  `scripts/production/connection-smoke-test.mjs` is an owner-run procedure that
  demonstrates a commit persists, a forced rollback leaves nothing, reads return
  rows, and refused access is refused. It names the production project on the
  command line, refuses inside CI or a test runner, and is referenced by no
  workflow, migration or npm script.
- **`scripts/production/` is a new category**: procedures that legitimately touch
  production, kept deliberately awkward and outside the local-tool prohibition,
  rather than added as a flag to a tool used every day.
- **Local tests now prove something about hosted.** ADR 0014 says the local suite
  "proves nothing whatsoever about the hosted posture" because everything runs as
  the table owner. That is no longer true of the two files that build the runtime
  role deliberately — though it remains true of every other test, and of the
  hosted database's actual configuration, which only the smoke test can confirm.
- **Widening the policy is a commit.** The approved target is a literal in
  checked-in source. Changing project, region, role or connection mode is a pull
  request, not an environment variable.
