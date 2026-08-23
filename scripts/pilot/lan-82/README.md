# LAN-82 — the consolidated hosted acceptance manifest

The order the slice's hosted scenarios are installed in, the order they are
removed in, which records are permanent and which are disposable, and the query
that proves the end state.

**This directory installs nothing of its own.** It has no `setup.sql`, and that
is deliberate rather than missing: the slice's hosted acceptance data is the nine
scenarios that LAN-74 to LAN-110 already deliver, each already reviewed, each
already proved repeatable by its own test. A tenth script re-stating their two
hundred-odd statements would be a copy that drifts from the originals the first
time one is corrected, and drift here means deleting a row you no longer own.

So what this issue adds is the two things the nine cannot state about
themselves — **the order**, and **the proof that nothing is left** — and nothing
else.

> Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
> It owns the rules. This file is one issue's application of them.

## Who runs this

Brian, by hand, against the hosted project. No agent runs any of it, and nothing
in the repository executes it. The walk itself is
[`docs/operating-the-slice.md`](../../../docs/operating-the-slice.md); this file
is the data underneath it.

---

## Two classes of record

| Class                          | What it is                                                                                                                                                                                                     | Cleanup                                                                                                        |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Permanent pilot foundation** | The approved testers' Auth users, their `people` rows, their `operator_accounts` links, their time-bounded `role_assignments`, the `roles` vocabulary, and the `audit_events` that keep every actor resolvable | **Never removed by any cleanup below.** Retired at handoff, by end-dating and deactivating — never by deleting |
| **Synthetic scenario data**    | Everything a `setup.sql` in this directory's siblings creates, plus the rows the application itself wrote while the scenario was being exercised — reports generated, responses recorded, attendance taken     | Removed entirely, by the owning scenario's `cleanup.sql`                                                       |

The boundary is structural, not a matter of care: no `cleanup.sql` in this
repository contains a delete against `auth.users`, `public.operator_accounts`,
`public.role_assignments` or `public.roles`, and
`tests/pilot-data-contract.test.ts` fails if one appears.

The foundation itself is registered in
[`docs/pilot-data-manifest.md`](../../../docs/pilot-data-manifest.md), which is
the inventory. This file is the procedure.

---

## Install order

Each scenario depends on the state the ones above it leave behind — a roster to
put in an audience, an approved event to deliver, a delivered invitation to
answer, an occurred event to take a register for, and a week of all of it to
report on. Installed out of order, a setup either aborts on its own preflight or
installs a scenario whose numbers do not match its README.

| #   | Scenario                          | What it puts in place                                                        |
| --- | --------------------------------- | ---------------------------------------------------------------------------- |
| 1   | [`lan-93`](../lan-93/setup.sql)   | The worked example that establishes the shape. Independent of the rest       |
| 2   | [`lan-74`](../lan-74/setup.sql)   | Returner intake: people, memberships, duplicate-candidate cases              |
| 3   | [`lan-75`](../lan-75/setup.sql)   | Roster and player detail: onboarding items, statuses, contact history        |
| 4   | [`lan-76`](../lan-76/setup.sql)   | Draft events                                                                 |
| 5   | [`lan-77`](../lan-77/setup.sql)   | Confirmed audiences and approved events                                      |
| 6   | [`lan-78`](../lan-78/setup.sql)   | Invitations, delivery jobs, attempts, results and RSVP tokens                |
| 7   | [`lan-79`](../lan-79/setup.sql)   | The signed RSVP surface: valid, late, revoked, started and cancelled links   |
| 8   | [`lan-80`](../lan-80/setup.sql)   | Occurrence assertions and attendance, including a walk-up                    |
| 9   | [`lan-110`](../lan-110/setup.sql) | An authorized coach, an unauthorized coach, and the attendance access matrix |
| 10  | [`lan-81`](../lan-81/setup.sql)   | A complete reporting week for the Monday report                              |

Each has its own `README.md` with the acceptance matrix for that feature and the
verification queries for its own rows. Work through them there; this file does
not repeat them.

**`lan-81` is installed last and is the most order-sensitive.** Its setup refuses
to install if the reporting window already contains an event that is not its own,
because that would make its README's numbers wrong and make its cleanup's
identification of the generated snapshots ambiguous. If it aborts, that refusal
is the script working.

---

## Cleanup order

Exactly the reverse. A child scenario's rows reference a parent scenario's, and
every foreign key in this schema is `on delete restrict` — so a cleanup run out
of order does not corrupt anything, it fails and rolls back. That is the intended
failure mode, and the fix is to run the later cleanup first, never to remove the
row that blocked it.

| #   | Run                                             | Then                                                |
| --- | ----------------------------------------------- | --------------------------------------------------- |
| 1   | [`lan-81/cleanup.sql`](../lan-81/cleanup.sql)   | Generated reports and the reporting week's own rows |
| 2   | [`lan-110/cleanup.sql`](../lan-110/cleanup.sql) | Coach attendance access and its attendance rows     |
| 3   | [`lan-80/cleanup.sql`](../lan-80/cleanup.sql)   | Attendance and occurrence assertions                |
| 4   | [`lan-79/cleanup.sql`](../lan-79/cleanup.sql)   | RSVP responses and access tokens                    |
| 5   | [`lan-78/cleanup.sql`](../lan-78/cleanup.sql)   | Delivery jobs, attempts, results and callbacks      |
| 6   | [`lan-77/cleanup.sql`](../lan-77/cleanup.sql)   | Invitations and confirmed audiences                 |
| 7   | [`lan-76/cleanup.sql`](../lan-76/cleanup.sql)   | Events                                              |
| 8   | [`lan-75/cleanup.sql`](../lan-75/cleanup.sql)   | Onboarding items and membership history             |
| 9   | [`lan-74/cleanup.sql`](../lan-74/cleanup.sql)   | Memberships, contact points and people              |
| 10  | [`lan-93/cleanup.sql`](../lan-93/cleanup.sql)   | The worked example                                  |

Then, and only then:

| 11  | [`verify-clean.sql`](verify-clean.sql) | Proves every scenario is gone and the foundation is intact |
| --- | -------------------------------------- | ---------------------------------------------------------- |

**Idempotent throughout.** Every cleanup above is safe to run twice — a second
run removes nothing, raises nothing, and reports the same clean state — so the
whole sequence is safe to re-run from the top if it is interrupted. That property
is asserted per scenario in `tests/pilot-scenario-lan-*.test.ts`, against a real
database, not claimed here.

**Retention is a decision, not a default.** `docs/pilot-data-runbook.md` allows
scenario data to accumulate so a later feature can be exercised against an
earlier one's state. Run the sequence above when the data becomes conflicting,
misleading or harmful to later testing — and always before LAN-86 authorizes real
club data.

---

## What the hosted walk cannot clean up

**Read this before performing the hosted walk, not after.**

The scenarios' cleanups can only remove application-created rows they can prove
they own, and for events that proof is two conjuncts, both pinned in
`tests/pilot-data-contract.test.ts`: the `PILOT-LAN-76` sentinel in the name
**and** a status of `draft`.

`docs/operating-the-slice.md` § 6 approves the event and § 9 marks it occurred.
An approved or occurred event therefore falls outside that restriction, and
**no script in this repository can remove it** — correctly named or not. It is
not an oversight in `lan-76/cleanup.sql`: an approved event has invitations,
delivery jobs, responses and attendance hanging off it, and a cleanup that
deleted one out from under its own audit history would be doing something far
worse than leaving it.

So the hosted walk has three honest options, and choosing one is Brian's:

1. **Stop the hosted walk at the draft.** Perform §§ 4–5 against hosted to prove
   intake and drafting, and leave approval, delivery, RSVP, attendance and the
   report to the local walk and to `tests/slice-walkthrough.test.ts`. The draft
   is then removable by `lan-76/cleanup.sql` in the ordinary way. **This is the
   recommended option**, and it is the only one that leaves the database
   returnable to a clean state by script alone.
2. **Use the pre-installed scenarios instead of creating anything.** `lan-77`
   through `lan-81` already install approved events, delivered invitations,
   responses, attendance and a reporting week, each owned by a deterministic
   identifier and removable by its own cleanup. Walking those proves the same
   screens without creating a single unownable row.
3. **Accept a permanent synthetic event**, and record it in
   `docs/pilot-data-manifest.md` under a new "Retained by decision" heading with
   the date and the reason. `verify-clean.sql` will raise on it at every future
   run until it is removed by hand, so this option makes the verification noisy
   for ever and should be a last resort.

What must not happen is the fourth path: approving an event on hosted, finding
the cleanup refuses it, and deleting the row by hand to make the verification
pass. That is exactly the "fix it by deleting the blocking row" the scenario
cleanups refuse to do for themselves, and the audit history it would orphan is
invariant M2's problem, not a tidiness one.

## The verification

After every cleanup above: open `verify-clean.sql`, **paste the whole file** into
the hosted SQL editor — including its `begin;` and `commit;` — and run it. Do not
paste fragments; the transaction is the safety property, and the temporary table
the sweep collects into does not outlive it.

(`\i` is a psql meta-command. It does not work in the Supabase SQL editor, and
`docs/pilot-data-runbook.md` § Running a script safely, by hand says to paste the
whole file for every script here.)

`verify-clean.sql` is read-only, and the test suite fails if a mutating statement
is added to it. It does two things:

1. **Sweeps for survivors.** It enumerates every character and JSON column of
   every base table in `public` **from the catalogue**, and checks each for each
   of the ten scenario sentinels. It is derived rather than listed on purpose: a
   hand-maintained list of columns is correct until the next scenario stamps a
   new one, and its failure mode is reporting clean because it never looked.
2. **Reports the foundation.** Auth users, operator accounts, roles, role
   assignments and audit history are counted and printed. **Compare those
   numbers with [`docs/pilot-data-manifest.md`](../../../docs/pilot-data-manifest.md)** —
   that comparison is yours, and it is the half a query cannot do.

   It is deliberately not a guard. It was one — "zero operator accounts means a
   cleanup ate the foundation" — and CI failed on it, correctly: CI's database
   seeds an Auth user and never links an operator, and so does a freshly
   migrated hosted project before anyone is provisioned. A count taken after the
   fact cannot tell _never provisioned_ from _destroyed_, and every conditional
   that tries to is a guess at prior state dressed up as a check.

   What protects the foundation is stronger and is checked before any script
   runs: no `cleanup.sql` in this repository contains a delete against
   `auth.users`, `public.operator_accounts`, `public.role_assignments` or
   `public.roles`, and `tests/pilot-data-contract.test.ts` fails if one appears.

It **fails closed on the question it can decide**: a surviving row raises, naming
the table, column and sentinel — never the value. A pass prints a notice and the
two evidence tables.

If it reports a survivor, establish what the row is and run the owning scenario's
cleanup. Do not delete it from the verification script; a row nobody can prove
they own is exactly the row the ownership rule exists to protect.

---

## Values

There are none in this directory, by rule. No email address, no phone number, no
name, no password, no `auth.users` or `people` identifier — in the SQL, in this
README, or in results recorded after a run.
`tests/pilot-data-contract.test.ts` fails if a real-looking value appears.
