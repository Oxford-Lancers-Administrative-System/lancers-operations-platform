# LAN-462 — classify the emails stored unclassified

One file, `classify-unclassified-emails.sql`, that **Brian runs by hand, once,
against hosted**, after the LAN-462 code is deployed. No agent runs it there.
Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.

## Why it exists

Before LAN-462, Invite operator stored the operator's email with no
classification (`contact_points.scope` empty), so the person record showed it
as "Email · not classified". The application now classifies every email it
stores for an operator. This script applies the same rule, once, to the rows
already stored:

- an address the Oxford rule accepts (it ends in `ox.ac.uk`, or in `.edu` with
  an optional two-letter country code) becomes a **college email**; any other
  address a **personal email**;
- when the person already has a preferred email of that kind, that one stays
  preferred and the newly classified one is kept as a second, non-preferred
  address;
- when the person already holds the same address classified, the unclassified
  copy is removed; when they hold one address twice unclassified, the
  preferred copy (else the oldest) is kept.

## How it differs from a scenario

It is a correction, not a scenario: it creates no rows, so it has no sentinel,
no deterministic identifiers and no `cleanup.sql`. It holds no name, address or
identifier; it classifies by rule. It writes `scope` and `is_preferred` on
`contact_points` and deletes only unclassified duplicates. Running it a second
time changes nothing.

It follows the rest of the shape: one transaction, a preflight `select` naming
the database and user, a `do $preflight$` block that raises rather than warns,
and a verification block that rolls the whole thing back if any email is left
unclassified.

## Running it

1. Open the hosted project's SQL editor and paste the whole file.
2. Read the first result: the database and user. Stop if either is wrong.
3. Read the preview: one row per unclassified email, with what will happen to
   it. Keep this output — it is the record of the change, and the only one,
   because it names row identifiers that must not be written into this
   repository.
4. Let it finish. The last result counts emails by scope and preference; no
   row has an empty scope.

## Proof

`tests/email-classification-correction.test.ts` runs this file against the
local database, inside a transaction it rolls back, over synthetic rows that
cover the plain cases, the preferred-slot collision and both duplicate shapes,
and runs it twice to show the second run changes nothing.
