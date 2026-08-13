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

| Issue    | Artifacts               | Rows created                                                                                                                                                                                                                                                                                                                                                                                                                           | Applied to hosted                                                        | Retention                                                                                                                                         |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LAN-93` | `scripts/pilot/lan-93/` | 6 — one each in `position_vocabularies`, `positions`, `seasons`, `people`, `season_memberships`, `events`. All ids in the block `00930093-0093-4093-8093-…`, all carrying `PILOT-LAN-93`                                                                                                                                                                                                                                               | **No.** It is a worked example, proved against local Supabase only       | N/A while unapplied. If ever applied: retain, and remove at the cutover                                                                           |
| `LAN-76` | `scripts/pilot/lan-76/` | **None by script.** `setup.sql` writes nothing — it is a prerequisite check. The rows are the events Brian creates in the application while testing, every one of them named with the `PILOT-LAN-76` sentinel                                                                                                                                                                                                                          | **No**, until Brian runs the feature test against the deployed container | Retain while event work continues; `cleanup.sql` removes the events when the scenario stops being useful. The audit rows describing them are kept |
| `LAN-74` | `scripts/pilot/lan-74/` | 8 by script — 2 `people` (one deliberately first-name-only), 3 `contact_points`, 1 `season_memberships` in the **existing** open season, 2 `season_membership_status_events`. All ids in the block `00740074-0074-4074-8074-…`, all carrying `PILOT-LAN-74` in `known_as`. **Plus** the returner Brian creates through the interface while testing, which carries the sentinel in `family_name` because that is the field the form has | **No**, until Brian runs the feature test against the deployed container | Retain while roster work continues — LAN-75 builds on the same rows; `cleanup.sql` removes both kinds when the scenario stops being useful        |

## Retired scenarios

None yet. A scenario moves here when its cleanup has been run against hosted and
verified, with the date and who ran it.

| Issue | Cleaned up on | By  | Verified |
| ----- | ------------- | --- | -------- |
| —     | —             | —   | —        |
