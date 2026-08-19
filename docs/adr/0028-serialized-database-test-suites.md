# 0028 — Test files that use the database run one at a time, and the rest are forbidden it

**Status:** Accepted · **Date:** 2026-08-19

## Context

There is one local PostgreSQL database, no per-test schema, and no staging
([0001](0001-local-supabase-only.md)). Vitest runs test files in parallel by
default, and `vitest.config.ts` set no isolation at all, so 43 of the
repository's 129 test files were concurrent sessions against the same rows.

That produced failures that looked unrelated to their cause, three of which cost
a CI rerun and an investigation each:

- `src/lib/services/attendance.test.ts` deleted every `attendance_records` row
  in the database in `afterEach`, unscoped, and `tests/slice-walkthrough.test.ts`
  failed on a foreign key.
- `tests/production-smoke-contract.test.ts` asserted a global `count(*)`.
- `tests/pilot-scenario-lan-76.test.ts` wraps every test in
  `begin transaction isolation level repeatable read` and rolls back. PostgreSQL
  is _specified_ to abort such a transaction with SQLSTATE `40001` as soon as a
  concurrent session commits to a row it has read. That is the isolation level's
  contract, not bad luck: it is guaranteed to fire whenever a suite that commits
  runs alongside it — and `src/lib/services/event-approval.test.ts` commits a
  fixture role into `public.roles` precisely so that the code under test, which
  reads through a _different_ connection, can see it.

The third reached CI during LAN-129. Rerunning the identical SHA passed.

Each had been fixed one instance at a time. The instances were symptoms; the
shared database under unrestricted file parallelism was the cause.

## Decision

**The suite is split into two Vitest projects.**

`database` contains the files listed in `DATABASE_TEST_SUITES` in
`vitest.config.ts` and runs them **one at a time**, through
`poolOptions.forks.singleFork`. Vitest 3 treats `fileParallelism` as a root-only
option, so the serialization is expressed as a pool option; `isolate` stays on,
so each file still gets a fresh module registry. Serialized is what these files
are, not how they are written: each keeps whatever isolation it already had, and
`pilot-scenario-lan-76`'s `repeatable read` is left exactly as it was. Retrying
`40001` was considered and rejected — it removes one suite's symptom and leaves
the next instance to arrive by surprise.

`unit` contains everything else, runs in parallel as before, and **is refused a
database connection**. `vitest.setup.ts` replaces `pg.Client#connect`,
`pg.Pool#connect`, and — for the local Supabase origin only — `fetch`, with
functions that throw a message naming the offending file and telling the reader
to add it to `DATABASE_TEST_SUITES`. The two projects run concurrently with each
other; the guard, not a run order, is what makes that safe.

The guard is the point. A list of database suites that nothing enforces is a
list that silently stops being true: a new test file reaches for the database,
runs in parallel, and surfaces weeks later as an unrelated suite's `40001` in
CI. Under this decision it fails immediately, on its own first line of database
access, on the machine of the person who wrote it.

## Consequences

- **A test file that opens a PostgreSQL connection or calls the local Supabase
  Data API must be named in `DATABASE_TEST_SUITES`.** Forgetting is not a
  hazard; it is an immediate, self-explaining failure.
- **`vitest.config.ts` is not fast-lane eligible**, so adding a suite to that
  list travels the normal lane with the test that needs it. That is the intended
  cost: the list decides what is allowed to share a database.
- **The full suite takes roughly 70% longer.** Measured on one machine against a
  freshly seeded local stack: three runs before at 47.1s, 49.5s and 45.1s, of
  which **two failed**, on different files each time; five runs after at 78.7s,
  78.6s, 75.2s, 92.5s and 85.5s, **all green**. The critical path is now the
  serialized `database` project, which takes 57s on its own — the rest is the
  parallel project competing with it for the same cores, which is also why the
  spread widens when the machine is busy. This is a deliberate trade: half a
  minute buys a suite whose failures mean something. It is also why the split is
  a split rather than `--no-file-parallelism`, which would have serialized all
  129 files to solve 43 files' problem.
- **Suites may still commit to shared tables where the code under test requires
  it.** `event-approval.test.ts` must, because `withTransaction` reads through a
  separate connection and cannot see an uncommitted fixture. Serialization is
  what makes that safe, and the guard is what keeps it safe. Suites that need no
  such commit should keep namespacing their fixtures, as
  `tests/helpers/domain-fixture.ts` does.
- **Assertions must still not depend on how fast the machine is.** Removing the
  contention made consecutive writes faster and exposed one assertion in
  `src/lib/services/administration-audit.test.ts` that required two writes to
  land in different milliseconds. It now separates them explicitly.
- `tests/database-suite-isolation.test.ts` asserts the mechanism — the list, the
  split, the pool setting — and proves the guard is live by tripping it.
