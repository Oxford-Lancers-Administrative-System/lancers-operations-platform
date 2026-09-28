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

**The tester-week dataset (LAN-221) is installed on hosted.** The LAN-124 Monday
showcase that preceded it has been rolled back. The durable pilot identities
below remain the approved _design_, awaiting Brian's execution. Every
`scripts/pilot/` scenario was retired on 26 September 2026 without ever having
been applied to hosted — see **Retired scenarios**.

> **This file is a register, not an observation.** A load or rollback Brian runs
> by hand produces no commit, so a row here can only be as current as the last
> change that touched it. Two rows below were stale for four days and were read
> as fact during the 12 September deploy analysis. Before relying on a row,
> confirm it against the database.

### Known defect in the installed rows

The installed tester-week dataset was written by the loader as it stood **before
LAN-293**, which on 10 September 2026 corrected
`scripts/production/showcase/plan/calendar.mjs` to write one audience row per
human rather than one per capacity. Three players who also hold seats — loader
keys `p02`, `p09` and `p20` — therefore carry **two** `event_audience_members`
rows and two invitations on every event in the term.

Migration `20260917090000_event_audience_one_row_per_human.sql` creates a total
`unique (event_id, invitee_person_id)` and **will refuse to apply while those
rows exist**. The resolution is a rollback and a reload with the current loader,
which writes `invitee_person_id` and `events.template_id` directly; it is not a
migration that can be made to tolerate them, and that is deliberate.

## Production reference-data baseline

**From 2026-09-14, production runs on
[`scripts/production/baseline/season-2026-27.sql`](../scripts/production/baseline/season-2026-27.sql)
(LAN-350) — no synthetic dataset installed.** That file gives production its
2026–27 season, calendar, position vocabulary and committee year: real Oxford
term dates and the club's real 18-position vocabulary, not a scenario. It is
not a pilot artifact — it carries no `PILOT-` sentinel and is never cleaned
up — so it is not tracked as a row in the tables below; this note is the
record that it is what production's reference data now is, and that the
tester-week dataset described under Status is not layered on top of it.

A season's baseline carries that season and its own three terms, and nothing
from the year before it. Since LAN-368 that is enough: the Oxford View builds
the whole year — including the Long Vacation weeks running into Michaelmas —
from those three term rows alone, so pre-season events are on the calendar the
day the season is opened. The baseline file itself lives under
`scripts/production/` and is Brian's to edit.

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

**None.** A scenario would be owned by an issue, identified by deterministic ids
plus a `PILOT-<ISSUE-ID>` sentinel, and removable by its paired cleanup script,
as [`pilot-data-runbook.md`](pilot-data-runbook.md) describes. It is added here
in the same change that adds its `scripts/pilot/<issue-id>/` directory.

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
| **Applied to hosted** | **Was — 17 August 2026. Removed.** Rolled back by Brian before the tester-week dataset below was loaded, per `OWNER-RUNBOOK.md` § 4. Confirmed absent on 12 September 2026 by the duplicate-audience sweep, whose every hit resolved to a tester-week identifier and none to a LAN-124 one                                                                                                                                                                                                                   |
| **Retention**         | Until tester week. Rollback is targeted and repeatable, and refuses when rows the application created during the demonstration are attached to rows it would delete                                                                                                                                                                                                                                                                                                                                          |

**Why this is recorded here.** The showcase carries no sentinel, so no sweep
for `PILOT-*` will see a single one of these rows. This register is the only
thing that will tell a human they exist.

## Tester week — LAN-221

The same loader, extended, replacing the Monday showcase's dataset with an
invented one. Same ownership convention, same reason, same register.

|                       |                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Artifacts**         | `scripts/production/showcase.mjs`, `scripts/production/showcase/` (the plan in `plan/`, the map in `map.mjs`, the report in `report.mjs`), `docs/tester-week/`, plus `OWNER-RUNBOOK.md`. Owner-run by hand, never by CI, a migration, an npm script or an agent                                                                                                                                                                            |
| **Rows created**      | ~25,000 across 51 tables: 40 invented players and 14 invented recruits with everything that hangs off them, a term of ~100 events, ~1,700 invitations and their answers, tokens and registers, ~5,000 notification jobs with results and attempts, ~450 onboarding items with history, log and agreements, ~250 audit rows, and a two-version Monday report with follow-ups. The exact count is in the manifest `showcase manifest` writes |
| **Ownership marker**  | Deterministic UUIDv5 under the same namespace as LAN-124, **and no sentinel**. Every token is an HMAC over its key with a secret in the private parameter file, stored only as its SHA-256 digest                                                                                                                                                                                                                                          |
| **Real data**         | **No.** Every name is invented (Brian, 2026-09-03). Every telephone number is in the Ofcom drama range or the North American fiction range; every email address is under a reserved `.example` domain. The only real values are the testers' own, supplied privately at execution time and never committed                                                                                                                                 |
| **Live rows**         | **None the sweep would dispatch, and no live link for anybody the parameters do not name.** `showcase verify` fails closed on either, across the whole hosted database. The named testers (Brian and Stewart by default) each hold one live RSVP link and Brian one live player-page link, so the player-side surfaces can be tested                                                                                                       |
| **Applied to hosted** | **Yes.** Loaded by Brian for the first tester run, after LAN-221 merged on 8 September 2026 and **before LAN-293 merged on 10 September 2026** — the load therefore came from the pre-LAN-293 loader, and carries that loader's duplicate audience rows (see **Known defect in the installed rows** below). Still installed as of 12 September 2026                                                                                        |
| **Retention**         | His choice at the end of tester week, recorded on LAN-221. Rollback is targeted and repeatable, refuses when application-created rows are attached, keeps history the application wrote and whatever it names, and writes residue SQL for the tables the application's login may not delete from — see `docs/pilot-data-runbook.md` § Rollback residue                                                                                     |
| **Strays**            | Also removes, on rollback, the Person rows the parameter file names in `strays.personIds` — the rows created on 2026-08-21 while testing operator invitations (LAN-196 item 2). Preflight hints at candidates; the loader never guesses and never removes an operator                                                                                                                                                                      |

## Retired scenarios

Retired on 26 September 2026 (LAN-436, Brian's decision), with their SQL and
their local test suites deleted in the same change. **None was ever applied to
hosted**, so there was nothing to clean up there: the LAN-221 showcase loader
had replaced them as the way to load a synthetic dataset, production has run on
the real baseline since the 14 September 2026 cutover, and LAN-397 removes the
remaining test records. The last commit carrying them is `5bcb5ea0`. ADR 0016's
amendment records the retirement; its procedure stands for any future scenario.

| Issue     | Artifacts (deleted)      | Applied to hosted | Retired on |
| --------- | ------------------------ | ----------------- | ---------- |
| `LAN-93`  | `scripts/pilot/lan-93/`  | **No**            | 2026-09-26 |
| `LAN-74`  | `scripts/pilot/lan-74/`  | **No**            | 2026-09-26 |
| `LAN-75`  | `scripts/pilot/lan-75/`  | **No**            | 2026-09-26 |
| `LAN-76`  | `scripts/pilot/lan-76/`  | **No**            | 2026-09-26 |
| `LAN-77`  | `scripts/pilot/lan-77/`  | **No**            | 2026-09-26 |
| `LAN-78`  | `scripts/pilot/lan-78/`  | **No**            | 2026-09-26 |
| `LAN-79`  | `scripts/pilot/lan-79/`  | **No**            | 2026-09-26 |
| `LAN-80`  | `scripts/pilot/lan-80/`  | **No**            | 2026-09-26 |
| `LAN-81`  | `scripts/pilot/lan-81/`  | **No**            | 2026-09-26 |
| `LAN-82`  | `scripts/pilot/lan-82/`  | **No**            | 2026-09-26 |
| `LAN-110` | `scripts/pilot/lan-110/` | **No**            | 2026-09-26 |
