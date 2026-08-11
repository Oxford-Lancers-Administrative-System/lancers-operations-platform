# LAN-93 — pilot-data worked example

The reference scenario for the conventions in
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md). It exists
to be **copied**, and to be the thing an automated test can point at. It
delivers no club feature and proves nothing about one.

## What it creates

Six rows, all synthetic, all identifiable twice over — a deterministic primary
key from the block `00930093-0093-4093-8093-…` and the sentinel `PILOT-LAN-93`
in a text column.

| #   | Table                   | Deterministic id | Sentinel carried in                      |
| --- | ----------------------- | ---------------- | ---------------------------------------- |
| 1   | `position_vocabularies` | `…0001`          | `code = 'pilot-lan-93'`                  |
| 2   | `positions`             | `…0002`          | `label like 'PILOT-LAN-93%'`             |
| 3   | `seasons`               | `…0003`          | `label like 'PILOT-LAN-93%'`             |
| 4   | `people`                | `…0004`          | `known_as = 'PILOT-LAN-93'`              |
| 5   | `season_memberships`    | `…0005`          | its person and season are both `…0004/3` |
| 6   | `events`                | `…0006`          | `name like 'PILOT-LAN-93%'`              |

The season is `planning` and the event is `draft`, so the scenario can never be
mistaken for the season the club is running and its event can never be
approved, resolve an audience, or send anybody a message.

## What it does not create, ever

No Auth user. No `operator_accounts` row. No `role_assignments` row. No
`audit_events` row. No contact point. Durable pilot identities and access are
provisioned by the owner procedure in the pilot-data runbook and are outside
every scenario's reach — in both directions: a scenario neither creates them nor
removes them.

## How Brian runs it

The full sequence, the authorization boundary and the retention policy are in
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md). In short:

1. Read `setup.sql` end to end. It is short on purpose.
2. Paste it into the Supabase SQL editor for the intended project — **check the
   project first**, the editor does not ask twice.
3. Read the first result set: it names the database and the user before a single
   row is written.
4. If it is not the project you meant, stop. Nothing has been committed.
5. Otherwise let it run to `commit` and read the verification result: six rows,
   every `scenario_rows` equal to 1.

Cleanup is the same, in reverse, and — per the retention policy — is **not** run
by default after a feature test.

## Verification query

Re-runnable at any time, and it writes nothing:

```sql
select
  'position_vocabularies' as table_name,
  count(*) filter (where id = '00930093-0093-4093-8093-000000000001') as scenario_rows
  from public.position_vocabularies
union all
select 'positions', count(*) filter (where id = '00930093-0093-4093-8093-000000000002')
  from public.positions
union all
select 'seasons', count(*) filter (where id = '00930093-0093-4093-8093-000000000003')
  from public.seasons
union all
select 'people', count(*) filter (where id = '00930093-0093-4093-8093-000000000004')
  from public.people
union all
select 'season_memberships', count(*) filter (where id = '00930093-0093-4093-8093-000000000005')
  from public.season_memberships
union all
select 'events', count(*) filter (where id = '00930093-0093-4093-8093-000000000006')
  from public.events;
```

Six `1`s after setup. Six `0`s after cleanup. Anything in between means the
transaction did not complete and the scenario is in a state neither script
expects — establish what is actually there before running either script again.

## How it is proved

[`tests/pilot-scenario-lan-93.test.ts`](../../../tests/pilot-scenario-lan-93.test.ts)
runs both scripts against **local** Supabase — never a hosted target; the
connection is opened through `scripts/lib/local-db.mjs`, which refuses any
non-loopback host — and asserts that:

- setup run twice leaves exactly one copy of each row;
- cleanup restores the database to a row-for-row identical snapshot of every
  table, taken before setup ran;
- cleanup run twice is a no-op;
- a durable identity created before setup (Auth user, person, operator account,
  time-bounded `it_officer` assignment, audit event) is byte-identical
  afterwards;
- each preflight aborts, writing nothing, when its prerequisite is not met.

[`tests/pilot-data-contract.test.ts`](../../../tests/pilot-data-contract.test.ts)
covers the other half: that these files stay inside the conventions, and that
nothing in the repository executes them automatically.

Running the scripts as verification against the disposable local stack is not
the same thing as the prohibition on automatic execution: nothing applies them
to a real target without a human.
