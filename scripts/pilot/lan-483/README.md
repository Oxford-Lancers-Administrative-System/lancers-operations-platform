# LAN-483 — record messages skipped on purpose as final

One file, `finalise-claim-time-refusals.sql`, that **Brian runs by hand, once,
against hosted**, after the LAN-483 code is deployed. No agent runs it there.
Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.

## Why it exists

When the scheduler refuses a message at claim time — the recruit has already
completed the track, is no longer a prospect, has no consent, or the membership
is gone — nothing is sent. Before LAN-483 that refusal was recorded with outcome
`failed`, which the delivery state reads as **Retryable** while attempts remain,
so these messages sat in the Messaging queue as failures with a next attempt.
The application now records them as `rejected`, and the delivery state reads a
`rejected` result with the claim-time shape as **Withheld** (final, no Retry,
not counted under Failed or Needs attention). This script applies the same rule
to the rows already stored.

Read-only production inspection on 19 October 2026 found 130 such results: 128
"already supplied this track's completing set" (77 of them on jobs reading
Retryable, 51 on jobs since cancelled), one onboarding welcome for a membership
that no longer exists and one onboarding chase with no consent. The preview
gives the count at the time it runs.

## What it changes

`delivery_results.outcome`, from `failed` to `rejected`, on results whose
attempt has the claim-time refusal shape: never accepted by a provider, no
provider message id, requested and concluded in the same instant, and the
result's detail equal to the attempt's failure reason. It matches by shape, not
wording, because some of the reasons have been reworded since. A provider
failure is concluded after the provider call, so it never matches, and genuine
WhatsApp failures stay Retryable.

It creates nothing, deletes nothing and touches no other table, so it has no
sentinel and no `cleanup.sql`. Running it a second time changes nothing.

It follows the rest of the shape: one transaction, a preflight `select` naming
the database and user, a `do $preflight$` block that raises rather than warns,
and a verification block that rolls the whole thing back if any refusal is
left `failed`.

## Running it

1. Open the hosted project's SQL editor and paste the whole file.
2. Read the first result: the database and user. Stop if either is wrong.
3. Read the preview: one row per reason, with how many results change and how
   many of their jobs read Retryable today. Keep this output; it is the record
   of the change.
4. Let it finish. The last result shows every targeted result as `rejected`.

Afterwards the Messaging queue shows these messages as **Withheld**, with no
next attempt line, and they leave **Failed today**. Any no-route refusal among
them (no usable number or email) reads **Not dispatched — no channel**, final,
and still needs a person.

## Proof

`tests/claim-refusal-correction.test.ts` runs this file against the local
database, inside a transaction it rolls back, over synthetic rows: a claim-time
refusal that changes and then reads Withheld, a provider failure that does not
change and still reads Retryable, and a second run that changes nothing.
