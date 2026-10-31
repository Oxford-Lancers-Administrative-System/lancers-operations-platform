# LAN-397 — take the test records out of production

Two files that **Brian runs by hand against hosted**, in the project's SQL
editor. No agent runs either there. Read
[`docs/pilot-data-runbook.md`](../../../docs/pilot-data-runbook.md) first.

| File            | What it does                                                   | Writes                    |
| --------------- | -------------------------------------------------------------- | ------------------------- |
| `inventory.sql` | Lists every candidate test record, one result, to mark by eye. | Nothing. One `select`.    |
| `removal.sql`   | Deletes the rows marked delete, with everything keyed to them. | One transaction, dry run. |

## What production holds now (read-only check, 19 October 2026)

Stewart's list of 22 September ("OPS EVENTS UPDATES") governs, and most of it
has already happened:

- **Events:** done. The oldest event in production was created on 25 September,
  so every event that existed on 22 September is gone. The 45 events there now
  are this season's.
- **Inactive players:** done. No membership is inactive.
- **Void recruits from Stewart's list:** done. The five void recruits there now
  were all created between 7 and 10 October, after his email — so whether they
  go is a fresh decision, not his list. Four came in through the QR form with
  two messages each; one has three invitations and two attendance rows on real
  events, which go with them if marked.
- **Still there from the original test set:** three deactivated operator
  accounts with no seat, each with an Auth user — the two invited while testing
  on 14 September, and "Ops Three", whose person carries audit history — and
  the two showcase identities "Ops One" and "Ops Two", now with no operator
  account and no membership, which also carry audit history.
- **Sign-up code:** one, live. It is never touched.

A person named by an audit row as the one who acted cannot be deleted (invariant
M2: history that can be deleted to tidy up is not history). So "Ops One", "Ops
Two" and "Ops Three" stay as people with nothing attached, and the removal
refuses them by name if they are marked. For "Ops Three" the operator account and
its invitation can still go: that is the `delete_operator_account_of` list.

Operators and roles — seating the real Head Coach, cleaning up seats — are not
SQL. They happen in Administration → Operators.

## Running it

1. **Backup point.** In the hosted project, note the time of the most recent
   backup (Database → Backups), or take one. Write the time down.
2. **Inventory.** Paste `inventory.sql` into the SQL editor and run it. One table
   comes back, in four sections: `1 person`, `2 auth user`, `3 event`,
   `4 sign-up code`, each sorted by the door the row came in by and its date.
   Mark each row keep or delete. A person with `audit_rows` above zero cannot be
   deleted; mark their operator account instead if it should go.
3. **Fill in the lists.** At the top of `removal.sql`, paste ids between the
   braces, comma-separated, as `'{<id>,<id>}'`:
   - `delete_people` — section 1 rows to delete, with everything keyed to them;
   - `delete_operator_account_of` — section 1 rows whose operator account and
     invitation go while the person stays;
   - `delete_events` — section 3 rows to delete, with their audience,
     invitations, messages, RSVPs, attendance, questions and follow-ups;
   - `keep` — anything marked keep, as a guard. The run refuses if a keep id
     would be touched.
4. **Dry run.** Leave `dry_run` as `true` and run the file. It does the whole
   removal inside the transaction, then stops with an error that reads
   `LAN-397 dry run: nothing was changed. It would remove:` followed by a count
   per table, and rolls everything back. Read the counts. If it says
   `refusing; nothing was changed` instead, the lines under it name what would
   have been touched that is not test data; change the lists, not the file.
5. **Remove.** Set `dry_run` to `false` and run it again. The last result lists
   the rows removed per table, then each Auth user left with no operator account.
6. **Auth users.** Delete each listed Auth user in Authentication → Users. The
   file never writes to `auth.users`: the runbook keeps Auth changes on the
   supported admin path.
7. **Check.** Run `inventory.sql` again: only kept rows remain. Look at
   `/operate/roster`, `/operate/recruitment`, `/operate/events` and
   Administration → Operators. Scan the printed QR code: the sign-up page opens.
   `/api/health` reads as before.

Running `removal.sql` a second time with the same lists removes nothing and says
`every marked id is already gone`.

## How it finds what to delete

It walks the foreign keys PostgreSQL itself declares (`pg_constraint`), the same
way the showcase rollback does (`scripts/production/showcase/db.mjs`), rather
than a list written by hand: from each marked row to every row keyed to it, to a
fixpoint. It deletes in the order that same graph gives, children before
parents. A column that records **who did something** — `recorded_by`,
`approved_by`, `author`, `owner`, `actor` and the like — is never followed; if a
row that stays names a removed person that way, the run refuses. That is what
keeps a real event a test operator approved, or the sign-up code a test operator
minted, from going with them.

It refuses, and changes nothing, if the walk would reach a row marked keep, a
person or event nobody marked, an active operator account, a current seat,
somebody else's membership or recruit record, a sign-up code, or a row in
`audit_events`.

Messaging safety (LAN-394): a removed person's `person` scope goes, and so do
the `destination` scopes keyed by their own numbers and addresses, found the way
the LAN-361 erasure finds them — the fingerprints on their attempts, and the
fingerprints computed from their contact points. A destination a kept person
also holds keeps its scope. Queued messages for a removed person are deleted
with them, so nothing is sent to a removed number.

Deletion, not anonymisation: these are not real people. The runbook's "never
delete the `people` row" is about ending a real pilot identity's access; this is
LAN-397's removal of test identities, and the audit-history rule above is what
keeps that line.

## Proof

`tests/test-record-removal.test.ts` runs both files against the local database,
inside a transaction it rolls back, over a look-alike mix: a void recruit with a
contact point, messages and safety scopes and an audience row on a real event,
an inactive player, a test event with a real player invited to it, a deactivated
test operator, a deactivated operator whose person has audit history, a real
person sharing the void recruit's address, and a live sign-up code. It proves
the dry run changes nothing, the removal takes exactly the marked rows and their
dependants, the shared address's scope and the sign-up code survive, a second
run removes nothing, and each refusal above.
