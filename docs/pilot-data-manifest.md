# Pilot-data manifest

What is currently in the **hosted** database that is not schema: every approved
durable pilot identity and access record, and every active synthetic scenario.

The procedure that puts things here is [`pilot-data-runbook.md`](pilot-data-runbook.md).
This file is the register, not the procedure.

> **Value-free by rule.** This repository is public. Every personal value is a
> placeholder: no email address, no password, no personal identifier, no phone
> number, no `auth.users` or `people` identifier. The manifest records **that** a
> record exists and **what access it carries** — never who, in machine-resolvable
> terms, or how to reach them.
>
> `tests/pilot-data-contract.test.ts` fails if a real-looking value appears here.

Update this file in the same change that provisions, retires, sets up or cleans
up anything it lists. A manifest that lags reality is worse than no manifest.

## Status

**Nothing has been provisioned or applied to the hosted database yet.** Every
row below is the approved _design_, awaiting Brian's execution. This is the
expected state until he chooses to act.

## Durable pilot identities and access

Persist between feature tests. Never created or removed by a scenario script.
Preserved by every cleanup, and by the production-data cutover.

| Tester        | Auth user                                                 | `people`        | `operator_accounts`       | Access granted                                                                          | Expires                                               | Status                                                                                                    |
| ------------- | --------------------------------------------------------- | --------------- | ------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Brian (owner) | `<auth-user-uuid>` — already exists on the hosted project | `<person-uuid>` | `<operator-account-uuid>` | `it_officer` — existing, non-constitutional technical seat. No office, no coaching seat | `<effective-to>` — set at grant time, ends at handoff | **Inventory first.** Brian confirms what already exists before anything is created; nothing is duplicated |
| Stuart        | `<auth-user-uuid>`                                        | `<person-uuid>` | `<operator-account-uuid>` | `<seat Brian confirms the person actually holds>`                                       | `<effective-to>`                                      | Not provisioned                                                                                           |
| Garrett       | `<auth-user-uuid>`                                        | `<person-uuid>` | `<operator-account-uuid>` | `<seat Brian confirms the person actually holds>`                                       | `<effective-to>`                                      | Not provisioned                                                                                           |
| Glenn         | `<auth-user-uuid>`                                        | `<person-uuid>` | `<operator-account-uuid>` | `<seat Brian confirms the person actually holds>`                                       | `<effective-to>`                                      | Not provisioned                                                                                           |

Binding notes:

- **Brian's existing hosted Auth user, Person and operator link are inventoried,
  not duplicated.** The first provisioning action is to look, not to insert. A
  second `people` row for somebody who already has one is invariant I1's failure
  mode, and undoing it is an audited merge (I6) rather than a delete.
- **No account is created and no invitation is sent** for Stuart, Garrett or
  Glenn without Brian's explicit authorization and a verified email address he
  supplies at execution time.
- **No fictitious office.** No President, Vice-President, Secretary or Treasurer
  assignment, and no invented General Manager or coaching seat, is granted to
  make authorization pass.
- **Every pilot-period grant is time-bounded** with `effective_to` set in the
  same statement that creates it, and is end-dated or deactivated at handoff.

## Reference data

| Item                      | State                                                                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.roles` vocabulary | Currently created by `scripts/seed-local.mjs`, which is **local only** — a freshly migrated hosted project has an empty `roles` table. How it reaches hosted is **Brian's decision**, flagged in the runbook and not taken by an agent |

## Active synthetic scenarios

Owned by an issue, identified by deterministic ids plus a `PILOT-<ISSUE-ID>`
sentinel, and removable by the paired cleanup script.

One scenario — `LAN-76` — has no deterministic-id half, because its rows are
created by the deployed **application** rather than by its setup script. Its
ownership marker is the sentinel conjoined with a restriction to the statuses a
scenario event can be in, declared in the scenario's own README and enforced by
`tests/pilot-data-contract.test.ts`.

| Issue    | Artifacts               | Rows created                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Applied to hosted                                                        | Retention                                                                                                                                                                                                                                                                                                                              |
| -------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAN-93` | `scripts/pilot/lan-93/` | 6 — one each in `position_vocabularies`, `positions`, `seasons`, `people`, `season_memberships`, `events`. All ids in the block `00930093-0093-4093-8093-…`, all carrying `PILOT-LAN-93`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **No.** It is a worked example, proved against local Supabase only       | N/A while unapplied. If ever applied: retain, and remove at the cutover                                                                                                                                                                                                                                                                |
| `LAN-76` | `scripts/pilot/lan-76/` | **None by script.** `setup.sql` writes nothing — it is a prerequisite check. The rows are the events Brian creates in the application while testing, every one of them named with the `PILOT-LAN-76` sentinel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | **No**, until Brian runs the feature test against the deployed container | Retain while event work continues; `cleanup.sql` removes the events when the scenario stops being useful. The audit rows describing them are kept                                                                                                                                                                                      |
| `LAN-74` | `scripts/pilot/lan-74/` | 8 by script — 2 `people` (one deliberately first-name-only), 3 `contact_points`, 1 `season_memberships` in the **existing** open season, 2 `season_membership_status_events`. All ids in the block `00740074-0074-4074-8074-…`; the sentinel is carried in `known_as` on the two people, `source` on the contacts and `actor_label` on the status events, and the membership is owned by its person rather than by a sentinel of its own. **Plus** the returner Brian creates through the interface while testing, which carries the sentinel in `family_name` because that is the field the form has                                                                                                                                                                                                                                                                                                                                    | **No**, until Brian runs the feature test against the deployed container | Retain while roster work continues — LAN-75 builds on the same rows; `cleanup.sql` removes both kinds when the scenario stops being useful                                                                                                                                                                                             |
| `LAN-75` | `scripts/pilot/lan-75/` | 8 or 9 by script — 2 or 3 `onboarding_item_types` on the **existing** open season (the subscription type only when the season has none of its own; a season may hold one) (two required, one the season's subscription item), 1 `people`, 2 `contact_points`, 1 `season_memberships` in `confirmed`, 2 `season_membership_status_events`, and the 3 `onboarding_items` those types produce for that membership. All ids in the block `00750075-0075-4075-8075-…`; the sentinel is carried in `label` on the item types, `known_as` on the person, `source` on the contacts and `actor_label` on the status events. The `onboarding_items` rows carry the id half plus a two-way ownership chain instead of a text sentinel, because a `pending` row has no free text column. **Plus** the returner Brian creates through the interface while testing, which carries the sentinel in `family_name` because that is the field the form has | **No**, until Brian runs the feature test against the deployed container | **Shorter than the others.** The three item types belong to the _season_, so while the scenario is installed every membership confirmed through the application also receives its items. `cleanup.sql` removes those wherever they landed and leaves their memberships untouched — but run it once the scenario has served its purpose |

## The Monday showcase — LAN-124

Not a `scripts/pilot/` scenario, and deliberately outside the table above,
because it breaks that table's ownership convention with Brian's explicit
approval.

|                       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Artifacts**         | `scripts/production/showcase.mjs` and `scripts/production/showcase/`, plus `OWNER-RUNBOOK.md`. Owner-run by hand, never by CI, a migration, an npm script or an agent                                                                                                                                                                                                                                                                                                                                        |
| **Rows created**      | ~1,140. Reference data where hosted has none (`roles`, `terms`, `committee_years`, `position_vocabularies`, `positions`, `seasons`, `onboarding_item_types`), then 42 real players and their `contact_points`, two seasons of `season_memberships` each, `position_assignments`, `onboarding_items`, `availability_statuses`, 53 `events`, `event_audience_members`, `invitations`, `rsvp_responses`, `attendance_records`, 2 `recruitment_prospects`, and `role_assignments` for the walkthrough identities |
| **Ownership marker**  | Deterministic UUIDv5 under a fixed namespace declared in `scripts/production/showcase/ids.mjs`, **and no sentinel**. LAN-124 forbids a visible `PILOT-` marker in a player or event name — the showcase has to look like a living football operation. The identifiers are computable without reading the database, so rollback names exactly what the loader would create and can name nothing else                                                                                                          |
| **Real data**         | **Yes — 42 real players' names**, ahead of the LAN-86 gate, by Brian's explicit decision of 15 August 2026. No real contact detail is imported: every player gets an Ofcom drama-range stand-in. The only real telephone numbers are Brian's and Stewart's, supplied at execution time in a private file that is never committed                                                                                                                                                                             |
| **Applied to hosted** | **No**, until Brian runs it for the 17 August 2026 walkthrough                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Retention**         | His choice at the end of the walkthrough. Rollback is targeted and repeatable, and refuses when rows the application created during the demonstration are attached to rows it would delete                                                                                                                                                                                                                                                                                                                   |

**Why this is recorded here.** The showcase carries no sentinel, so
`scripts/pilot/lan-82/verify-clean.sql` — which sweeps for `PILOT-*` before the
cutover — will not see a single one of these rows. This register is the only
thing that will tell a human they exist.

## The order, and the proof

The rows above are per-scenario detail. **The order the scenarios are installed
and removed in, and the query that proves the removal worked, are in
[`scripts/pilot/lan-82/README.md`](../scripts/pilot/lan-82/README.md).** Install
order matters because each scenario builds on the state the one before it leaves;
cleanup order is its exact reverse, because every foreign key here is
`on delete restrict`, so a cleanup run out of order aborts rather than
corrupting. After the last cleanup, `scripts/pilot/lan-82/verify-clean.sql`
sweeps every character and JSON column in `public` for every scenario sentinel
and raises if one survives. It then **prints** the durable pilot foundation's
counts — Auth users, operator accounts, roles, role assignments, audit rows —
for comparison against the tables above. That comparison is the reader's: a
count taken after a cleanup cannot tell _never provisioned_ from _destroyed_,
and what actually keeps the foundation safe is that no `cleanup.sql` here
deletes from those tables at all.

> **This register currently lags the repository.** Ten scenario directories
> exist — `lan-93`, `lan-74`, `lan-75`, `lan-76`, `lan-77`, `lan-78`, `lan-79`,
> `lan-80`, `lan-110`, `lan-81` — and the table above details four of them. The
> six missing rows are owed by their own issues, which each carry the
> requirement to update this file. None of them has been applied to hosted, so
> nothing is unrecorded _there_; what is missing is the description. Recorded
> here rather than guessed at: LAN-82 integrates the slice and does not invent
> another issue's row counts.

## Retired scenarios

None yet. A scenario moves here when its cleanup has been run against hosted and
verified, with the date and who ran it.

| Issue | Cleaned up on | By  | Verified |
| ----- | ------------- | --- | -------- |
| —     | —             | —   | —        |
