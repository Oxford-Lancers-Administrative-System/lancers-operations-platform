# `scripts/pilot/` — hosted pilot-data scripts

One directory per Linear issue that needs data in the hosted database to be
tested: `scripts/pilot/<issue-id>/` containing `setup.sql`, `cleanup.sql` and a
`README.md`.

**Read [`docs/pilot-data-runbook.md`](../../docs/pilot-data-runbook.md) before
adding or running anything here.** It owns the rules; this file is the sign on
the door.

## What this directory is

Reviewable SQL that **Brian runs by hand**, against the hosted Supabase project,
to put a clearly synthetic scenario in front of a feature test — and to take it
away again.

## What this directory is never

- **Never run automatically.** Nothing in `supabase/migrations/`,
  `supabase/seed.sql`, `scripts/seed-local.mjs`, `.github/workflows/`, the
  `Dockerfile` or any application startup path references this directory, and
  `tests/pilot-data-contract.test.ts` fails if one starts to. A pilot script
  reaches a database because a human chose to run it, or it does not reach one
  at all.
- **Never a migration.** No `create table`, no `alter table`, no `create type`,
  no grant, no policy. Schema changes are versioned migrations under
  `supabase/migrations/`, applied through
  [`docs/migration-runbook.md`](../../docs/migration-runbook.md). If a scenario
  needs a schema change, the change is a separate migration and the scenario
  waits for it.
- **Never real data.** No real name, email address, phone number, password,
  personal identifier or roster record — in the SQL, in the README, or in the
  results recorded afterwards. This repository is public.
- **Never a way to create a login.** Auth users are created through the
  supported Supabase Auth admin path by Brian, following the durable-identity
  procedure in the pilot-data runbook. No script here writes to `auth.users`.

## The shape every scenario follows

| Requirement                  | How it is met                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Transactional                | The file opens with `begin;` and closes with `commit;`                                        |
| Reviewable target            | A preflight `select` reporting the database, user and current scenario state before any write |
| Fails closed                 | A `do $preflight$` block that `raise exception`s rather than warning and continuing           |
| Repeatable                   | `insert … on conflict (id) do nothing` — never `do update`, so nothing is silently mutated    |
| Owned rows only              | Deterministic primary keys **and** a `PILOT-<issue-id>` sentinel in a text column             |
| Narrow cleanup               | Deletes by deterministic id qualified by the sentinel, in dependency order                    |
| Durable foundation preserved | Cleanup never touches `auth.users`, `operator_accounts`, `role_assignments` or `audit_events` |
| Verifiable                   | A final verification `select` that a human can read, repeated in the scenario README          |

[`lan-93/`](lan-93/) is the worked example. Copy it.
