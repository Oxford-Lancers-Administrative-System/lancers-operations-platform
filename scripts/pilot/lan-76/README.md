# LAN-76 — event drafting, in hosted

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.
It owns the rules; this file is one scenario.

## What this scenario is

LAN-76 adds event drafting, editing, submission and withdrawal to the operator
shell. The feature test is a human: Brian signs in to the deployed application,
creates an event, edits it, submits it, withdraws the submission and abandons a
draft, and reads what the screens say.

**`setup.sql` writes nothing.** It is a prerequisite check. The rows this
scenario produces are created by the application, through a browser, by a
person — which is the whole point of testing against hosted rather than
against the local stack. Manufacturing a season or an event here would put club
data in production that no feature reads, and would prove the application works
against rows a script arranged.

## Ownership marker: sentinel only

The runbook's marker has two halves — a deterministic primary key and a
`PILOT-<ISSUE-ID>` sentinel — and this scenario has only the second, because the
application generates the identifier when Brian presses Save. The missing half is
replaced by a status restriction. **That restriction is not equivalent to a
deterministic key, and it is worth being exact about why:** a key names one
pre-known row, and the sentinel is then an independent second proof of ownership.
Here, `name like '%PILOT-LAN-76%'` is a substring match on a column an operator
types into, and `status in (…)` limits the blast radius rather than proving who
created the row. What the pair does guarantee is that this file can only ever
remove an event that carries the sentinel **and** never reached approval:

| Half             | Here                                                   |
| ---------------- | ------------------------------------------------------ |
| Sentinel         | `PILOT-LAN-76` in `events.name`                        |
| Instead of a key | `status in ('draft', 'pending_approval', 'withdrawn')` |

Both are conjoined in the one delete, and neither is sufficient alone. The
status restriction means this file cannot delete an approved, occurred,
cancelled or rejected event — the only kind that has invitations, responses or
attendance behind it.

The exact predicate is pinned — table and conjuncts — in
`tests/pilot-data-contract.test.ts` (`SENTINEL_ONLY_DELETES`). Changing it, here
or in any future scenario, means changing that list too, which is a line in a
diff rather than a pattern an assertion might or might not recognise.

**So: every event you create for this test must have `PILOT-LAN-76` in its
name.** An event without it is invisible to `cleanup.sql` and stays in the
database until somebody removes it by hand.

## Running it

Read [`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md)
§ _Running a script safely, by hand_ before connecting. In short: connect with
the SQL editor, run the file, read the result sets, and only then `commit`.

### 1. Before testing — `setup.sql`

Refuses, rather than warning, when:

- the database is not Supabase-managed, or migration `20260810120700` is not
  applied — the events table this feature writes to does not exist;
- no season is `open`, `active` or `closing` — the application refuses to
  record an event and the test would prove only that the refusal works;
- more than one season is — which season a test event lands in would be
  ambiguous to whoever reads the result afterwards;
- no active operator account is linked to a person — nobody can sign in and
  press the buttons.

Expected on a clean hosted database: one operating season named in the final
result set, at least one active operator account, and
`scenario_events_present = 0`.

### 2. The test itself, in the application

| Step | Where                          | What to do                                                                | Expected                                                                                                    |
| ---- | ------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1    | `/operate/events`              | Read the list                                                             | The season is named, and a note says the audience and responses arrive at approval. A new project is empty. |
| 2    | `/operate/events`              | Change the **Status** filter                                              | The list reloads on the change. There is no Apply button.                                                   |
| 3    | `/operate/events`              | Click **Date**, then **Venue**, then **Status** in the column headers     | Each sorts; clicking the active one flips the direction. The sort is in the URL.                            |
| 4    | `/operate/events/new`          | Save with the response-requested question unanswered                      | Refused, with the correction beside that question. Nothing is created.                                      |
| 5    | `/operate/events/new`          | Pick a date inside term                                                   | The line under the date names the Oxford term and week. There is no term or week to choose, and no Origin.  |
| 6    | `/operate/events/new`          | Pick a date in the vacation                                               | The same line reads **Outside Oxford term**.                                                                |
| 7    | `/operate/events/new`          | Create **PILOT-LAN-76 Wednesday practice**, mandatory, response requested | Lands on the event. Status **Draft**, term and week derived, entered-by recorded, no invitations.           |
| 8    | `/operate/events/[id]/edit`    | Change the venue and save                                                 | Back on the event, with the new venue.                                                                      |
| 9    | `/operate/events/new`          | Create **PILOT-LAN-76 Second event**, same date as step 7                 | Accepted. Two events on one date is legal — invariant E4.                                                   |
| 10   | the first event                | Submit for approval                                                       | "Event submitted for approval". Still no invitations.                                                       |
| 11   | the same event                 | Withdraw submission                                                       | Back to **Draft**, editable again.                                                                          |
| 12   | the second event               | Abandon draft, with a reason                                              | Status **Withdrawn**, the reason shown.                                                                     |
| 13   | `/operate/events?status=draft` | Filter                                                                    | Only drafts. The withdrawn event is not among them.                                                         |

**And the authorization half, which needs a second sign-in.** Signed in as an
operator holding no calendar seat — a Treasurer, a coach, or an operator with no
role at all — `/operate/events` still lists the club's events, **Create event**
is absent, an event's page offers none of its actions, and `/operate/events/new`
refuses with a message naming the four roles it requires and never the roles the
reader holds.

Every one of steps 7 to 12 writes an `audit_events` row naming the operator.
Those rows are **not** removed by cleanup.

### 3. After testing — `cleanup.sql`

Deletes the scenario's events, and refuses rather than widening when anything
hangs off one: an audience, event questions, notification jobs, schedule changes,
a follow-up action, or a legacy staging row. It never touches `auth.users`,
`operator_accounts`, `role_assignments`, `roles` or `audit_events`.

Invitations and attendance records are **not** among those guards, deliberately.
Both are pinned by composite foreign key to an event status this delete already
excludes — an invitation requires an approved event (invariant P1) and an
attendance record requires an occurred one (P5) — so an event carrying either is
already refused, one check earlier, for having passed approval. A guard there
could never fire, and an unreachable guard reads as protection while proving
nothing.

Verification query, which the script also runs for you:

```sql
select
  (select count(*) from public.events where name like '%PILOT-LAN-76%') as scenario_events_remaining,
  (select count(*) from public.audit_events) as audit_events,
  (select count(*) from public.operator_accounts) as operator_accounts;
```

Expect `scenario_events_remaining = 0`, and the other two counts unchanged from
the preflight the script printed before deleting anything.

## Proof

[`tests/pilot-scenario-lan-76.test.ts`](../../../tests/pilot-scenario-lan-76.test.ts)
runs both scripts against **local** Supabase and proves the properties the
runbook's scenario checklist requires — including that every refusal in either
file is actually reached by a test, and that cleanup leaves a row-for-row
identical database when there is nothing of its own to remove.
