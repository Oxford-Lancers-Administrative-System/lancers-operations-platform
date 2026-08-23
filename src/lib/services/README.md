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
  administration-events.ts  the administration event vocabulary (pure)
  administration-audit.ts   recordAdministrationEvent, and the two projections
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

## What is built, and what is not

`roster.ts`, `events.ts` and `seasons.ts` are the first aggregates.

`roster.ts` is LAN-74's returner intake, and it is worth reading as the pattern
for a workflow that must not act on a guess: the duplicate check is a separate,
read-only call; the write takes an explicit operator and an explicit decision
about who the person is; everything commits in one transaction; and the
membership's two status transitions go to `season_membership_status_events`
rather than being duplicated into `audit_events` (register D9). `events.ts`
implements rules `docs/architecture/data-model.md` § _Rules deliberately left to
TypeScript_ names, and implements them the way that section describes:

- **Writing the audit record** (M2) — every write calls `recordAudit` with the
  same `Tx` as the change it records.
- **What an event looks like now** — `derivedEventState` in `event-input.ts`.
  Since LAN-151 nothing asserts occurrence (D30): an event has occurred once its
  date has passed and it was not cancelled.

There **is no transition table any more**. `events.ts` held one, as a whitelist
of `{ from, to }` pairs, and LAN-151 removed it along with the five statuses it
moved between — `pending_approval`, `rejected`, `withdrawn`, `occurred` and
`not_held` all left `public.event_status`, which holds three values. Approval is
`event-approval.ts`; a status a caller cannot reach is one the enum does not
have, which is a stronger guarantee than a rule about it.

`administration-events.ts` and `administration-audit.ts` are LAN-130's half of
the operator-administration mission, and they are the pattern for **one event
read two ways**. The vocabulary module is pure — a closed set of administration
actions, the rules each one carries, and the versioned envelope stored under
`audit_events.context.administration`. The audit module writes exactly one row
per change through `recordAudit`, and reads it back as _Operator audit history_
(keyed on the envelope's target Person) or _Holder history_ (keyed on its role,
restricted to the role-related subset).

Three things about it are load-bearing rather than stylistic:

- **Nothing is written twice.** Both projections are filters over the same
  stream, so a role assignment appears in both from one stored row. A second
  copy shaped for the second screen is the reconciliation problem register D9
  refuses, and `administration-audit.test.ts` proves the absence of one by
  counting committed rows rather than by inspecting what came back.
- **The reads are guarded here**, including the `…In(tx)` variants, because
  administration history says who did what to whom. There is deliberately no
  exported read without a capability check on it.
- **There is no update or delete path**, and there is no term in the vocabulary
  for amending an event. A correction is a new event.
- **A row this version cannot read is marked, not dropped.** `occurred_at`
  defaults to transaction time, so two events written atomically share a
  timestamp and are separated by a causal position declared on the vocabulary
  (`instantOrder`) rather than by an arbitrary identifier; and an entry whose
  stored envelope is from a later version comes back with `unreadable` set
  instead of being filtered out. For an audit surface, a history that looks
  complete and is not is worse than one with a visible gap.

Still **not implemented**, each with its own issue: the non-empty confirmed
audience (E1b), sequential report-version allocation (M5), atomic job claiming
(M1), material-change detection (E2) and archived-season immutability (M3).
Nothing in the application enforces those today.
