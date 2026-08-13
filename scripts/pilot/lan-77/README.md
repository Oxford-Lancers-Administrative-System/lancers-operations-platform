# LAN-77 pilot scenario — audience confirmation and approval

Two SQL files that make LAN-77 testable by hand against **hosted** Supabase and
the deployed application, and a test matrix for the person running them.

**Brian runs these. No agent does, and no automation does.** Nothing in
`supabase/migrations/`, `supabase/seed.sql`, `scripts/seed-local.mjs`,
`.github/workflows/`, the `Dockerfile` or any `src/` startup path references
this directory, and `tests/pilot-data-contract.test.ts` fails if that changes.

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
It is the source of truth; this file is the scenario.

---

## Why this scenario exists

LAN-77's approval transaction cannot be honestly proved against the local stack
alone. Three things about it only exist in hosted:

- **Hosted has no active memberships to build an audience from.** The audience
  builder reads the open season's `active` memberships, and hosted has none, so
  without this script the builder is empty and nothing in the matrix is
  reachable.
- **Authorization has to be exercised against real hosted Auth** and a real role
  assignment. "President, Vice-President, Secretary or General Manager" is the
  claim; a real sign-in by somebody who is not one of them is what tests it.
- **The transaction has to commit against the real database**, so the audience,
  the invitations, the notification jobs and the audit rows can be read back —
  and so the rollback case can be seen leaving no trace.

## ⚠️ Approving the scenario creates queued messages

This is the first pilot scenario whose feature produces outbound work. Approving
the scenario event writes one **notification job** per invitee, `pending`, on the
WhatsApp channel. Nothing dispatches them today — LAN-78 does that, and it is not
built — but they are real rows in the real queue.

The three synthetic people are addressed at `@example.invalid` (RFC 2606,
reserved and unresolvable) and at `+44 7700 900771`–`773` (Ofcom's reserved drama
range, never allocated to a subscriber). Neither can reach a person even if
delivery is later switched on with these rows still present.

**Run `cleanup.sql` when the scenario is no longer needed**, and certainly before
LAN-78 is deployed.

## What `setup.sql` adds

| Rows                                | Where                                                            | Why                                                                |
| ----------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| 3 `people`                          | Alder, Bracken and Cobble Pilotcase, all known as `PILOT-LAN-77` | The synthetic audience                                             |
| 4 `contact_points`                  | `…@example.invalid`, `+44 7700 900771`–`773`                     | Reserved and unreachable — see the warning above                   |
| 3 `season_memberships`              | `active`, `returning`, open season                               | What the audience builder selects from                             |
| 9 `season_membership_status_events` | `confirmed → onboarding → active` for each                       | Truthful history, authored by `PILOT-LAN-77 setup script`          |
| 2 `events`                          | `PILOT-LAN-77 Approval scenario` and `… Rollback scenario`       | Both `draft`, dated a week out                                     |
| 1 `notification_jobs`               | `cancelled`, attached to no invitation                           | Occupies the rollback scenario's first idempotency key — see below |

It adds **no** season, auth user, operator account, role assignment, access
grant, audience member, invitation or audit row.

## How the rollback scenario works

Invariant M1 gives every invitation job a deterministic key,
`event:<event>:invitation:<capacity>:<participant>`. `setup.sql` inserts a single
`cancelled` job that has already claimed exactly the key the **Rollback
scenario** event's first invitee would need.

Approving that event therefore gets all the way to the final insert — the event
is flipped to `approved`, the audience is written, the invitations are written —
and then fails on the unique index. Everything rolls back together, and the
event is a `draft` again with nothing attached.

That is what makes matrix row 7 observable by hand rather than only in
`src/lib/services/event-approval.test.ts`. `tests/pilot-scenario-lan-77.test.ts`
asserts the planted key matches the service's derivation, so the scenario cannot
quietly decay into a second happy path.

## Ownership marker

Both halves, on every row this script creates:

- a deterministic primary key from the block `00770077-0077-4077-8077-…`
- the sentinel `PILOT-LAN-77` in a text column — `known_as` on a person, `source`
  on a contact point, `actor_label` on a status event, `name` on an event,
  `idempotency_key` and `cancelled_reason` on the job

The three `season_memberships` rows are the exception: the table has no free text
column that is not load-bearing. They carry the deterministic id **and** belong
to this scenario's people **and** sit in the open season, and `cleanup.sql`
checks all three.

The rows the **application** creates on approval — audience members, invitations
and their jobs — have generated keys and carry no marker at all. They are removed
by their scenario event, which is a handle just as narrow, because the event
carries both halves.

## Ownership marker: sentinel only

The rows the **application** creates when the scenario event is approved — the
resolved audience, the invitations, their notification jobs, and the approval's
own audit rows — have keys PostgreSQL generated inside the approval transaction.
No script can name them, so `cleanup.sql` removes them by their scenario event
instead, using the second shape in
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) § The
ownership marker.

Every such statement carries **both** halves as two independent conjuncts: the
scenario's two deterministic event ids, **and** the scenario's sentinel in
`events.name`. A row survives unless its event satisfies both. The id block alone
would delete a real event that happened to collide; the sentinel alone would
delete any event somebody named after this scenario.

The seven statements that use this shape are pinned by table and by exact
predicate in `SENTINEL_ONLY_DELETES` in
[`tests/pilot-data-contract.test.ts`](../../../tests/pilot-data-contract.test.ts),
so widening one is a line in a diff rather than a quiet relaxation. Everything
`setup.sql` itself created is deleted by deterministic id in the ordinary shape.

## Running it

Read the first result set of each script before committing. Both are wrapped in
a single transaction, so a `rollback` leaves nothing behind.

```
psql "$HOSTED_CONNECTION_STRING" -f scripts/pilot/lan-77/setup.sql
```

On a correct install the verification block reports `3, 4, 3, 9, 2, 1` and zero
for both `scenario_audience_rows` and `scenario_invitations`, with both events
`draft`. A non-zero audience or invitation count means a previous run was not
cleaned up.

Setup aborts rather than guessing if the audience migration is not applied, if
zero or two seasons are open, or if one of its ids belongs to something that is
not this scenario.

## The test matrix

Sign in as an operator holding one of President, Vice-President, Secretary or
General Manager, unless a row says otherwise.

| #   | Do this                                                                                           | Expect                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Sign in as an operator holding **none** of the four roles. Open `PILOT-LAN-77 Approval scenario`. | The event is readable. No **Choose audience and approve** button.                                                                                 |
| 2   | As that operator, POST to the approval action directly (or replay the form).                      | Refused, naming the roles the action requires and saying nothing about what you hold. Event still `draft`.                                        |
| 3   | As an approver, open the event and press **Choose audience and approve**.                         | The builder opens with **nothing** selected and `Review 0 selected`.                                                                              |
| 4   | Press **Review 0 selected** with an **empty audience**.                                           | "This event cannot be approved" — the resolved audience is empty, and no invitations or notification jobs were created. Event still `draft`.      |
| 5   | Add **All active players**, then review.                                                          | The three Pilotcase names, a count of 3, capacity Player, the RSVP deadline two days before the event at 18:00, and automated WhatsApp.           |
| 6   | Press **Approve event**.                                                                          | Event approved, 3 invitations created, and the page says nothing has been delivered yet.                                                          |
| 7   | Repeat rows 3–6 against `PILOT-LAN-77 Rollback scenario`.                                         | Approval is refused at the last step. The event is still `draft`, with **no** audience, **no** invitations and no new jobs — see the query below. |
| 8   | Go back and press **Approve event** on the already-approved event again (**double submission**).  | Refused: only a draft can be approved, this event is already approved. Invitation and job counts unchanged.                                       |
| 9   | Edit the approval scenario's date to tomorrow before approving (on a fresh install).              | The review screen says the response is **Due immediately** rather than showing a past deadline. Approval still succeeds.                          |
| 10  | Repeat rows 3–6 at **375px**.                                                                     | The group buttons, the search, every candidate's name, capacity and contact, the resolved list and both actions are all usable.                   |

After row 7, confirm the rollback left nothing:

```sql
select
  (select status::text from public.events
    where id = '00770077-0077-4077-8077-000000000051') as should_be_draft,
  (select count(*) from public.event_audience_members
    where event_id = '00770077-0077-4077-8077-000000000051') as should_be_zero_audience,
  (select count(*) from public.invitations
    where event_id = '00770077-0077-4077-8077-000000000051') as should_be_zero_invitations,
  (select count(*) from public.notification_jobs
    where event_id = '00770077-0077-4077-8077-000000000051') as should_be_one_planted_job;
```

And after row 6, confirm the approval defect the schema exists to catch did not
occur:

```sql
select count(*) as should_be_zero
  from public.uninvited_audience_members
 where event_id = '00770077-0077-4077-8077-000000000050';
```

## Cleaning up

```
psql "$HOSTED_CONNECTION_STRING" -f scripts/pilot/lan-77/cleanup.sql
```

Removes this scenario's rows in dependency-safe order, including the audience,
invitations and notification jobs the application created. Every count in its
verification block must be zero except `open_seasons_surviving` and
`other_people_surviving`, which prove it left the foundation alone.

Safe to run twice, safe to run before setup has ever run, and safe to run at any
point in the matrix — a half-tested scenario cleans up the same as a finished
one.

It **refuses** rather than guessing if one of its ids has been taken over by a
real record, if a scenario person acquired a membership it did not create, if one
has attendance recorded, or if one was invited to an event outside the scenario.
Resolve those by hand.

## What it leaves behind, deliberately

The season, every durable pilot identity, every operator account, every role
assignment and every access grant, and all audit history that is not about the
two scenario events. `tests/pilot-scenario-lan-77.test.ts` asserts each of those
against the local stack.
