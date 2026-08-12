# The service layer

Every read and write of club data goes through a module in this directory.
Nothing in `src/app/` talks to the database directly — not a Server Component,
not a Server Action, not a route handler.

That rule is in `AGENTS.md` already. What follows is the shape it takes, written
down once so the ten issues that build on it come out consistent rather than
each inventing its own conventions.

## Directory and naming

```
src/lib/db/                 the data-access substrate — not a service
  url.ts                    connection-string resolution and the local-only guard
  connection.ts             the pooled PostgreSQL connection (server-only)
  transaction.ts            withTransaction, and the Tx interface
  errors.ts                 the typed error taxonomy and the constraint mapper
  index.ts                  what a service module imports

src/lib/services/           one module per aggregate
  audit.ts                  recordAudit — the single writer for audit_events
  <aggregate>.ts            e.g. events.ts, memberships.ts, invitations.ts
  <aggregate>.test.ts       colocated
```

- **One module per aggregate, named for the aggregate, singular concept and
  plural file**: `events.ts`, `memberships.ts`, `invitations.ts`. Not
  `event-service.ts` — the directory already says it is a service.
- **Exported functions are verbs**: `approveEvent`, `confirmAudience`,
  `recordAttendance`. A function named for a table (`getEvents`) is usually a
  sign that a workflow rule is about to leak into a caller.
- **Colocate tests** as `*.test.ts` beside the module. Cross-cutting tests that
  span several services live in `tests/`.

## The rules a service module follows

**1. Every function takes an explicit actor.** The `personId` from
`resolveOperator()`, passed as an argument — never read from a request context
inside the service, never defaulted, never omitted "because it is obvious".
A service function must be callable from a test with an arbitrary actor, and it
must be impossible to write a state change without naming who made it.

**2. No service module imports React, `next/navigation`, `next/headers`, or
anything else from the framework.** A service is plain TypeScript over the
database. If a function needs the request, it needs an argument instead. This is
what keeps services testable without a rendering environment, and what stops
business rules migrating into components.

**3. Multi-statement writes go inside one `withTransaction`.** If a change
touches two tables, it commits together or not at all. Reads that need no
transaction may still go through `createAdminClient()`.

**4. A state change and its audit row are written in the same transaction.**
Call `recordAudit(tx, …)` with the same `tx`. Invariant M2 is only true if the
record cannot outlive a rolled-back change.

**5. Failures are `ServiceError`s.** Throw `NotFound`, `NotPermitted`,
`InvalidTransition`, `ConstraintViolated` or `Conflict` — never a bare `Error`,
and never a string. Callers discriminate on `kind`. Database rejections are
already mapped for you by `tx.query`, so a named constraint arrives as a
specific, operator-readable message; if you add a constraint the interface
should explain in the club's words, add it to `CONSTRAINT_MESSAGES` in
`src/lib/db/errors.ts` rather than catching it at the call site.

**6. Nothing here may weaken the local-only guard.** ADR 0001. The connection
module refuses any non-loopback host, and that is not configurable.

## What lives in the database instead

Durable relational integrity — the invariants a bad deploy must not be able to
break — lives in PostgreSQL. Changeable workflow behaviour lives here. Which
rule sits where, and why, is the invariant enforcement matrix in
[`docs/architecture/data-model.md`](../../../docs/architecture/data-model.md).
Do not re-implement a database constraint here, and do not push a policy
decision into a migration.

## What is built

| Module      | Aggregate                                                      | Issue  |
| ----------- | -------------------------------------------------------------- | ------ |
| `audit.ts`  | `audit_events`                                                 | LAN-72 |
| `roster.ts` | Returner intake — person, contact points and season membership | LAN-74 |

`roster.ts` is the first module to carry a workflow rule, and it is worth
reading as the pattern the rest follow: the duplicate check is a separate
read-only call, the write takes an explicit operator and an explicit decision,
everything commits in one transaction, and the membership's two status
transitions go to `season_membership_status_events` rather than being duplicated
into `audit_events` (register D9).

## What is not built yet

Most of it. The rules `docs/architecture/data-model.md` § _Rules deliberately
left to TypeScript_ names — the non-empty confirmed audience (E1b), sequential
report-version allocation (M5), the remaining state transitions and who may
trigger them, atomic job claiming (M1), material-change detection (E2),
archived-season immutability (M3) — are **not implemented**, and each has its
own issue. Nothing in the application enforces them today.
