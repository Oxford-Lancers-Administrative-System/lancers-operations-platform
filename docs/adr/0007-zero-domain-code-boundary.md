# 0007 — This repository contains no club domain schema

**Status:** Accepted · **Date:** 2026-08-10

## Context

The conceptual domain model is approved but deliberately not yet implemented.
The purpose of this repository's first ticket was to prove the infrastructure
path — development loop, CI, migrations, deployment, auth — _before_ domain
migrations begin, so that when domain work starts it is purely domain work.

The failure mode is drift: an agent or developer, mid-task, adds "just a small
`players` table" and the boundary is gone without anyone deciding to remove it.

## Decision

Until the ticket that legitimately introduces the domain model:

- No table, view, enum, or function representing a club concept exists in any
  migration. `supabase/migrations/20260810000000_init.sql` is intentionally
  empty of schema objects.
- No fixtures or seed data. The synthetic data specification exists precisely so
  fixtures mirror real data shape; inventing tidy fixtures now would hide the
  problems real data will cause.
- No application roles, profile tables, invitations, onboarding, or
  domain-specific authorization. Authentication proves email/password sign-in and
  nothing more.

## Enforcement

`tests/no-domain-code.test.ts` fails the build if any migration creates a table
at all, or mentions a domain term (`player`, `roster`, `event`, `rsvp`,
`attendance`, `injury`, `fixture`, `squad`, `membership`, `communication`) in
executable SQL.

## Consequences

The ticket that introduces the domain model deletes `tests/no-domain-code.test.ts`
as part of its work. Deleting it is the explicit act of crossing the boundary —
which is the point.
