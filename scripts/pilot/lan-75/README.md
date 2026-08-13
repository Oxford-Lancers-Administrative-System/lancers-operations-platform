# LAN-75 pilot scenario — roster, onboarding and activation

Two SQL files that make LAN-75 testable by hand against **hosted** Supabase and
the deployed application, and a test matrix for the person running them.

**Brian runs these. No agent does, and no automation does.** Nothing in
`supabase/migrations/`, `supabase/seed.sql`, `scripts/seed-local.mjs`,
`.github/workflows/`, the `Dockerfile` or any `src/` startup path references
this directory, and `tests/pilot-data-contract.test.ts` fails if that changes.

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
It is the source of truth; this file is the scenario.

---

## Why this scenario exists

LAN-75's activation path cannot be honestly proved against the local stack
alone. Three things about it only exist in hosted:

- **Hosted has no onboarding configuration whatsoever.** `onboarding_item_types`
  is per-season and is populated locally by `scripts/seed-local.mjs`, which never
  runs against hosted. Without types there is nothing to generate, nothing to
  waive, and no way to see that an unpaid subscription does not block activation.
- **Authorization has to be exercised against real hosted Auth** and a real
  role assignment, not a fixture. "Exec/GM only" is the claim; a real sign-in is
  what tests it.
- **The transaction has to commit against the real database**, so the status
  event and the audit row can be read back afterwards.

## What setup.sql adds

| Rows                                         | Where                                                                                                                                   | Why                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 3 `onboarding_item_types` on the open season | `pilot_lan75_kit`, `pilot_lan75_conduct` (both required), `pilot_lan75_subs` (the subscription item, deliberately also marked required) | So generation, waiver and register D10 are all reachable  |
| 1 `people` row                               | `Thelbrook Pilotcase`, known as `PILOT-LAN-75`                                                                                          | The synthetic member                                      |
| 2 `contact_points`                           | `…@example.invalid`, `+44 7700 900175`                                                                                                  | A reserved TLD that can never resolve                     |
| 1 `season_memberships` row                   | `confirmed`, `entry = 'returning'`, open season                                                                                         | The state UX-21 shows and activation starts from          |
| 2 `season_membership_status_events`          | `null → carried_forward → confirmed`                                                                                                    | Truthful history, authored by `PILOT-LAN-75 setup script` |
| 3 `onboarding_items`                         | all `pending`                                                                                                                           | What confirmation would have generated                    |

It adds **no** season, auth user, operator account, role assignment, event,
invitation or audit row.

## ⚠️ The item types reach past this scenario

`onboarding_item_types` belongs to a **season**, not to a membership. While this
scenario is installed, every membership confirmed through the application
receives the three pilot items — including any that are not scenario data.

That is exactly how item generation gets tested (step 2 below). It is also why
`cleanup.sql` deletes every `onboarding_items` row pointing at a pilot type
wherever it landed, and why the retention answer is "run cleanup once the
scenario has served its purpose". Nothing else about an affected membership is
touched: the membership, its person, its history and its audit trail all survive,
and only the three pilot items disappear from it.

## Ownership marker

Both halves, on every row `setup.sql` writes:

- a deterministic primary key from the block `00750075-0075-4075-8075-…`
- the sentinel `PILOT-LAN-75` in a text column — `label` on an item type,
  `known_as` on a person, `source` on a contact point, `actor_label` on a status
  event

The three `onboarding_items` rows are the one exception: on a `pending` row the
table has no free text column. They carry the deterministic id **and** belong to
this scenario's membership **and** point at this scenario's item types — a chain
no unrelated row satisfies, and cleanup checks all three.

The intake form collects **First name**, **Last name**, **Email** and **Phone**
and nothing else — it deliberately stopped asking for a nickname — so the
surname is the only field a tester can put a sentinel in. That is the same
convention LAN-74's scenario uses.

## Ownership marker: sentinel only

Rows the **application** writes — the returner a tester enters through the form,
the status events an activation produces, the onboarding items generated from
this scenario's item types — carry no identifier any script could know, because
PostgreSQL generates it when somebody presses Save. Those are removed by the
second shape in the runbook's _The ownership marker_, and every such delete
conjoins **two independent narrowings**: the target set `cleanup.sql`'s own
preflight builds, and the sentinel itself. There is no `or` anywhere in the file.
Each table and each predicate is pinned in `tests/pilot-data-contract.test.ts`,
so widening one is a line in a diff.

**Audit history is kept.** Neither script deletes an `audit_events` row: the
activation really happened, and `entity_id` is deliberately not a foreign key so
that the record outlives its subject. LAN-74's and LAN-76's cleanups keep theirs
for the same reason.

---

## Running it

Both scripts wrap everything in one transaction. Each prints a target result set
before it writes and a verification result set after, and then commits.

**For a first install, run the statements rather than the file** — paste them in
sections, read the target result set, and stop if the database, the user or the
open season is not what you expected. Running the file straight through commits
without pausing for you.

```bash
# From the Supabase dashboard SQL editor, or psql against hosted:
\i scripts/pilot/lan-75/setup.sql
```

Either way the transaction is all-or-nothing: a refusal in the preflight aborts
before a single row is written.

Setup refuses, rather than guessing, when:

- the migrations it was written against are not applied;
- no season is open or active, or more than one is;
- the open season already has its own subscription item type (exercise D10
  against that one instead — a season may only have one);
- any scenario identifier is occupied by a row that is not this scenario's;
- the scenario person is linked to an operator account;
- the scenario person already holds a different membership in the open season.

It **warns** but continues when no currently-effective Exec or General Manager
assignment exists: the roster and the authorization refusal are still testable,
and who holds a seat is arranged through the runbook, never by this script.

---

## The test matrix

Sign in as an operator holding one of `president`, `vice_president`,
`secretary`, `treasurer` or `general_manager` unless a row says otherwise.

| #   | Do this                                                                                                                          | Expect                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Open `/operate/roster`                                                                                                           | The open season, the count, and `Thelbrook Pilotcase` in the table with status **Confirmed**, entry **Returning**, onboarding **2 outstanding**                                                   |
| 2   | Enter a returner at `/operate/roster/new`, putting `PILOT-LAN-75` in **Last name** and an `example.invalid` address in **Email** | The new membership's record lists the three pilot onboarding items, all Pending — **generated by the application**, which this script never touched                                               |
| 3   | Reload that record                                                                                                               | Still three items. Generation is idempotent                                                                                                                                                       |
| 4   | Search the roster for `Thelbrook`, then for `example.invalid`                                                                    | Both find the row. Search covers names and raw contact values                                                                                                                                     |
| 5   | Filter by status **Confirmed**, then sort by **Onboarding**                                                                      | The list narrows and reorders; the URL carries the filter                                                                                                                                         |
| 6   | Filter to something that matches nothing                                                                                         | "No memberships match these filters", with **Clear filters**                                                                                                                                      |
| 7   | Open `Thelbrook Pilotcase`                                                                                                       | UX-21: person, raw contact, membership, three items, status history. The subscription item reads **Never blocks activation**                                                                      |
| 8   | Resolve `Code of conduct signed` as **Waived**, with a reason                                                                    | The item shows Waived, the reason and your name                                                                                                                                                   |
| 9   | Leave `Kit sorted` pending and the subscription unpaid. Press **Activate membership**                                            | UX-22 opens, naming **one** required item outstanding — _not_ the subscription. That is register D10                                                                                              |
| 10  | Press **Confirm activation** with the reason box empty                                                                           | Refused. The reason is required when items are outstanding                                                                                                                                        |
| 11  | Fill in a reason and confirm                                                                                                     | Status becomes **Active**. The record shows the activation date                                                                                                                                   |
| 12  | Re-open the record                                                                                                               | Status history reads `Confirmed → Onboarding` then `Onboarding → Active`, with your name and your reason on the second                                                                            |
| 13  | Press **Mark inactive**, give a reason                                                                                           | Status **Inactive**, the reason shown. Then **Mark active again** returns it                                                                                                                      |
| 14  | Sign in as an operator holding **no** Exec/GM seat and open the record                                                           | The record is readable, the onboarding controls work, and the status panel says the change is available only to the Exec and the General Manager. No Activate control anywhere in the page source |

Row 14 is the acceptance criterion "activation is refused for an operator
without an Exec/GM role". The server-side half of it — that the refusal holds for
a request that never rendered the page — is proved by
`src/app/operate/roster/actions.test.ts` and does not need doing by hand.

### Verifying what was written

```sql
select from_status, to_status, occurred_at, reason
  from public.season_membership_status_events
 where season_membership_id = '00750075-0075-4075-8075-000000000020'
 order by occurred_at;

select action, from_state, to_state, reason, context
  from public.audit_events
 where entity_id = '00750075-0075-4075-8075-000000000020';
```

Expect the transitions above, and one `season_membership_activated` audit row
naming the operator's person id, with `proceeded_over_outstanding` listing
`pilot_lan75_kit` and **not** `pilot_lan75_subs`.

---

## Cleaning up

```bash
\i scripts/pilot/lan-75/cleanup.sql
```

It removes the scenario, everything the application wrote against it, the
returner from step 2, and the three item types — and nothing else. Every
`remaining` count must be zero and the three durable counts must be unchanged
from the first result set. It refuses outright rather than widening if a
sentinel row has acquired an operator account, a role assignment or an
invitation.

Safe to run twice. Safe never to run, subject to the item-type warning above.

`tests/pilot-scenario-lan-75.test.ts` proves against **local** Supabase that
setup is repeatable, that cleanup removes only its own rows and is repeatable,
and that the durable pilot identities and unrelated records survive it.
