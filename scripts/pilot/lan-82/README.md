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

## The verification

```sql
-- After every cleanup above, in the hosted SQL editor:
\i scripts/pilot/lan-82/verify-clean.sql
```

`verify-clean.sql` is read-only, and the test suite fails if a mutating statement
is added to it. It does two things:

1. **Sweeps for survivors.** It enumerates every character and JSON column of
   every base table in `public` **from the catalogue**, and checks each for each
   of the ten scenario sentinels. It is derived rather than listed on purpose: a
   hand-maintained list of columns is correct until the next scenario stamps a
   new one, and its failure mode is reporting clean because it never looked.
2. **Confirms the foundation survived.** Auth users, operator accounts, roles,
   role assignments and audit history are counted, every operator account is
   checked to still resolve to a Person, and "nothing left at all" is treated as
   a failure rather than as a very clean result.

It **fails closed**: a surviving row raises, naming the table, column and
sentinel — never the value. So does a missing foundation. A pass prints a notice
and nothing else.

If it reports a survivor, establish what the row is and run the owning scenario's
cleanup. Do not delete it from the verification script; a row nobody can prove
they own is exactly the row the ownership rule exists to protect.

---

## Values

There are none in this directory, by rule. No email address, no phone number, no
name, no password, no `auth.users` or `people` identifier — in the SQL, in this
README, or in results recorded after a run.
`tests/pilot-data-contract.test.ts` fails if a real-looking value appears.
