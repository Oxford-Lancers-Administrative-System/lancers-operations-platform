# 0014 — Transactional writes use a direct PostgreSQL connection, which is a second privileged credential

**Status:** Accepted · **Date:** 2026-08-11 · **Extends:**
[0010](0010-domain-table-access-posture.md), [0002](0002-rls-posture.md) ·
**Constrained by:** [0001](0001-local-supabase-only.md)

## Context

The service layer has to make changes that span several tables. Approving an
event inserts the confirmed audience, flips the event's status, creates the
invitations and writes the audit rows — and if any part of that fails, none of
it may have happened. "The audience was inserted but the event was never
approved" is not a cosmetic bug: it is a state the frozen model has no name for,
and the interface would have to guess what it means.

`supabase-js` cannot express that. It issues one PostgREST request per call and
has no transaction. Two options were considered.

- **PostgreSQL functions.** Rejected. `docs/architecture.md` and ADR 0011 put
  durable relational integrity in the database and changeable workflow
  behaviour in TypeScript. Encoding the approval transaction as a stored
  procedure makes the schema the workflow engine, and puts a migration — a
  forward-only, manually applied, production-touching migration — in the path of
  every policy change the club makes.
- **A direct PostgreSQL connection from the server, with real `begin`/`commit`.**
  Chosen. `pg` was already in the repository, used by the schema tests through
  `scripts/lib/local-db.mjs`.

## Decision

**Multi-statement writes go through `withTransaction` in `src/lib/db/`, over a
pooled direct PostgreSQL connection.** Reads that need no transaction may keep
going through `createAdminClient()` and the Data API.

Four consequences of that are decided here rather than left to each caller.

- **Nesting joins; it does not nest.** A `withTransaction` called inside another
  runs against the same transaction, on the same connection, with **no
  savepoint**. An inner failure therefore rolls the outer transaction back too.
  A savepoint would make an inner failure recoverable while the outer scope
  committed anyway, which is precisely the partial commit this layer exists to
  prevent. The cost is real and is accepted: there is no attempt-and-recover
  inside a transaction. Adding one later needs savepoint support built
  deliberately, with its own tests.
- **`recordAudit` is the single writer for `audit_events`, and it takes the
  caller's transaction as an argument.** Invariant M2 is only true if an audit
  row cannot outlive the change it describes. Requiring the transaction handle
  makes that structural rather than a rule people remember.
- **Database rejections become typed errors at the query boundary.** The schema
  names its constraints deliberately; `src/lib/db/errors.ts` turns a named
  constraint into a sentence an operator can act on. Nothing above this layer
  reads a constraint name.
- **Driver text never escapes.** A mapped error carries `code`, `constraint` and
  `table` and nothing else. PostgreSQL's `detail`, `hint`, `where` and
  `internalQuery` routinely quote the offending row, which for this schema means
  a real person's name and contact details; none of them is copied, and the
  original driver error is not attached as a `cause` either.

## This introduces a second privileged credential, and a second access path

**The posture of ADR 0010 is extended by this decision, not preserved unchanged.
Anyone reading this repository should understand there are now two ways into the
same database.**

An earlier draft of the issue behind this ADR claimed that a PostgreSQL
connection "connects as the same privileged role the secret key maps to, so the
ADR 0010 posture is unchanged". That is wrong, and building on it would have
produced a false security record. Per Supabase's own documentation, consulted
2026-08-10:

|                           | The Data API path                                                                                                                             | The connection-string path                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| What authenticates        | A secret (or legacy `service_role`) key presented to PostgREST                                                                                | A PostgreSQL username and password                                                      |
| Which role runs the query | PostgREST connects as `authenticator` and switches to the role named in the JWT — `service_role`, documented as bypassing RLS via `BYPASSRLS` | Whatever PostgreSQL login the string names, with that login's own attributes and grants |
| Locally                   | `service_role`                                                                                                                                | `postgres` — "the default Postgres role. This has admin privileges."                    |
| Governed by               | ADR 0003, ADR 0010's grant posture                                                                                                            | This ADR, and — for hosted — ADR 0026                                                   |

So a connection string is **a broader credential than `service_role`, not an
equivalent one**, and it reaches the database by a route PostgREST's grants do
not mediate. The revoke-then-grant discipline ADR 0010 established still governs
the Data API path exactly as before. It does not, on its own, constrain this one.

What is unchanged, and worth stating so the extension is not read as a
relaxation: **no new grant, no RLS policy, and no browser-reachable data path is
introduced by this decision.** `npm run check:rls` and `tests/rls-posture.test.ts`
pass unchanged. The new module imports `server-only`, so reaching it from a
Client Component is a build error, and `src/lib/db/server-only.test.ts` asserts
that rather than trusting it.

## What this ADR deliberately did not decide — now decided in ADR 0026

> **Resolved on 2026-08-15 by
> [ADR 0026](0026-hosted-runtime-database-connection.md).** The hosted runtime
> connects as `app_runtime`, a least-privilege login that owns nothing and
> inherits its grants through membership of `service_role`, carrying `BYPASSRLS`
> for the reason recorded there, over the shared Supavisor pooler in transaction
> mode. The open questions below are kept as written because they are the
> questions ADR 0026 answers, and because each one turned out to matter.
>
> Read the two together: this ADR is why a second privileged credential exists,
> ADR 0026 is what that credential actually is.

**The hosted runtime database credential was not chosen here, and nothing
written before 2026-08-15 should be read as choosing it.** All of the following
had to be resolved and validated before anything hosted ran:

- **the runtime PostgreSQL role, and the minimum grants it actually needs** —
  the local answer (`postgres`, admin) is a local convenience and is not a
  proposal;
- **whether that role bypasses RLS, and the explicit reason either way**;
- **how its secret is provisioned and rotated**;
- **the connection mode** — Supabase documents transaction mode (port 6543) for
  serverless profiles, which is what Cloud Run's scale-to-zero, many-short-lived-
  instances shape is, while direct connections are documented as suiting
  "persistent servers, such as virtual machines (VMs) and long-lasting
  containers";
- **connection limits and pooling behaviour**, given per-pooler client caps;
- **prepared-statement compatibility** — Supabase documents that "transaction
  mode does not support prepared statements", which directly constrains how `pg`
  may be configured. This is why pool size and timeouts are read from the
  environment here rather than hard-coded: hard-coding them would quietly answer
  a question this decision is not entitled to answer.

### The trap that will not show up locally

Every domain table has RLS enabled with **zero** policies. A least-privilege
login that neither owns the tables nor carries `BYPASSRLS` will read **zero
rows**, even holding full `select` grants.

**Locally this is invisible by construction.** Migrations run as `postgres`,
which owns the tables _and_ has admin privileges, so RLS never bites and every
test in this repository passes regardless of what a hosted role would do. **The
local test suite proves nothing whatsoever about the hosted posture**, and must
never be cited as though it does. This had to be resolved deliberately — by
ownership, by `BYPASSRLS`, or by policies — and verified against a real
environment, not discovered in staging.

> **Resolved by [ADR 0026](0026-hosted-runtime-database-connection.md):
> `BYPASSRLS`, with the reasoning on the record.** The paragraph above is still
> true of every test that connects as `postgres`, which is nearly all of them.
> It is no longer true of `tests/hosted-role-posture.test.ts` and
> `tests/production-smoke-contract.test.ts`, which build the approved role in
> the local database on purpose and run as it — including a negative control
> that reproduces the empty-club failure this section describes. Those two files
> are evidence about the posture. They are still not evidence about the hosted
> database's actual configuration; only the owner-run smoke test is that.

## Consequences

- **`pg` becomes a runtime dependency**, not a dev one. It ships in the
  production image. Note that until a route or Server Action actually imports
  the service layer, Next.js's dependency tracing will not pull it into the
  standalone output — declaring it is what makes that work when the first one
  does.
- **`DATABASE_URL` joins the server-only tier**, with a placeholder in
  `.env.example` and an entry in `docs/deployment.md`. It is a second secret to
  provision, rotate and keep out of the repository.
- **`src/lib/db/url.ts` reimplements the local-only guard from
  `scripts/lib/local-db.mjs`** rather than importing it: that module is plain
  JavaScript outside `src/`, described as shared access for seeding and tests,
  and application code that ships in the production container should not depend
  on it. The duplication is the cost, and
  `tests/service-layer-guard-parity.test.ts` runs both implementations over the
  same table of connection strings so a change to one that is not mirrored in
  the other is a red test.
- **The guard checks the host asked for, not the database reached.** A loopback
  port forwarded to a hosted database — an SSH tunnel, `socat` — defeats it
  completely, and nothing at this layer can detect that. Recorded as a residual
  risk rather than papered over; ADR 0001 remains a discipline, not a mechanism.
- **A second privileged path means a second thing to get wrong.** The mitigation
  is that it is narrow: one module, `server-only`, refusing any non-loopback
  host, with the taxonomy stopping driver text from escaping. It is not that the
  risk is small.
