# Pilot-data runbook

How a feature is tested against the **hosted** database before a staging
environment exists, without putting real club data anywhere near it.

There is one production Supabase project, no staging, and one person who may
touch it. Everything below follows from that, and from
[ADR 0016](adr/0016-controlled-production-pilot-data.md), which records the
decision this runbook implements.

| Question                                         | Answer, in one line                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| May production hold data before staging exists?  | **Yes** — approved pilot identities and clearly synthetic scenarios, only      |
| May it hold the real roster, or real operations? | **No.** Still gated on LAN-83, LAN-84 and LAN-86                               |
| Who runs a pilot script against hosted Supabase? | **Brian, by hand.** Never an agent, never CI, never a deploy                   |
| Is pilot data cleaned up after every ticket?     | **No** — it accumulates on purpose. See [Retention](#retention-policy)         |
| Does a feature pull request have to say so?      | **Yes** — the Production handoff block, every time, even when the answer is No |

## The controlled pilot model

A **controlled pilot** means the hosted database may contain exactly two things
beyond the schema:

1. **Durable pilot identities and access** — Auth users, `people` rows,
   `operator_accounts` links and truthful `role_assignments` for the approved
   leadership testers. These persist between feature tests. They are the only
   real people the hosted system knows about, and they are there because they
   consented to test it.
2. **Clearly synthetic feature scenarios** — the rows a specific feature needs
   in order to be exercised. Visibly artificial, deterministic where practical,
   owned by an issue, and removable by a script written at the same time.

### The boundary, stated so it cannot be misread

**Real club operations remain prohibited.** No real roster import, no real
event, RSVP, attendance, availability, subscription or contact record for
anybody other than the approved pilot testers themselves — in any environment,
including production — until the gates in
[the migration runbook](migration-runbook.md#pre-pilot-gate) are satisfied:
hosted staging (LAN-83), production security and recovery validation (LAN-84),
and the controlled use of real club data (LAN-86).

A synthetic scenario is not a loophole for real data with the names changed.
"Clearly synthetic" means a person reading the row can tell at a glance that no
club member is described by it.

### Approved pilot testers

Brian, Stuart, Garrett and Glenn — as **roles in this procedure**. Their email
addresses, credentials, personal identifiers and role assignments are **not**
recorded in this repository. This repository is public; the manifest
([`pilot-data-manifest.md`](pilot-data-manifest.md)) records that a durable
identity exists and what access it carries, with placeholders for every personal
value.

No Auth account is created and no invitation is sent for Stuart, Garrett or
Glenn without Brian's explicit authorization and a verified email address that
he supplies at execution time. This runbook is the procedure; it is not the
authorization.

## Five things that are not the same thing

The single most common way this goes wrong is treating one of these as another.

| #   | Operation                         | What it is                                                                | Where it lives                                  | Who runs it                      |
| --- | --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| 1   | **Schema migration**              | A versioned, forward-only change to the structure of the database         | `supabase/migrations/`                          | Brian, per the migration runbook |
| 2   | **Durable identity provisioning** | Creating a pilot tester's login, person, operator link and access         | Supabase Auth admin + a reviewed template below | Brian                            |
| 3   | **Pilot-data setup / cleanup**    | Putting a synthetic scenario in place for a feature test, and removing it | `scripts/pilot/<issue-id>/`                     | Brian                            |
| 4   | **Application rollback**          | Serving a previous container revision                                     | `docs/deployment.md`                            | Brian                            |
| 5   | **Forward fix / restore**         | Recovering from a migration that failed or did the wrong thing            | `docs/migration-runbook.md`                     | Brian                            |

Consequences worth stating:

- **A pilot script is never a migration.** No `create table`, `alter table`,
  `create type`, grant or policy in `scripts/pilot/`. If a scenario needs a
  schema change, the change is a normal versioned migration, identified to Brian
  **before it is authored**, and the scenario waits for it.
- **A migration is never a pilot script.** Migrations do not insert scenario
  data. A migration is rebuilt from empty on every developer machine and in CI;
  scenario data in one would be recreated everywhere, forever.
- **Cleanup is not rollback, and rollback is not restore.** Removing a scenario
  does not undo a migration, redeploying the container does not remove data, and
  neither of them recovers a destructive change. Down migrations do not exist
  here, by decision — recovery is forward-fix or restore.

## Durable versus scenario data

|                                  | **Durable pilot identity and access**                             | **Synthetic feature scenario**                             |
| -------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| Examples                         | `auth.users`, `people`, `operator_accounts`, `role_assignments`   | seasons, events, memberships, invitations, responses       |
| Lifetime                         | Persists between feature tests, and across the cutover            | Owned by one issue; may accumulate; removed at the cutover |
| Created by                       | The owner procedure below, by hand                                | `scripts/pilot/<issue-id>/setup.sql`                       |
| Removed by                       | The deprovisioning procedure below — deactivation, never deletion | `scripts/pilot/<issue-id>/cleanup.sql`                     |
| May a scenario cleanup touch it? | **Never.**                                                        | Only the rows its own paired setup created                 |

`audit_events` sits with the durable side of that table even when it describes
scenario data: it is append-only at the privilege level, an actor referenced by
history must stay resolvable (invariant M2), and history that can be deleted to
tidy up is not history. A scenario that writes audit rows leaves them behind —
which is a reason to prefer scenarios that do not need to.

## When a feature needs pilot data

Ask, in this order:

1. **Can this be proved locally?** Almost always yes — the local stack has the
   full schema and the deterministic synthetic dataset. Local proof is the
   default and needs no pilot data at all.
2. **Does the change need to be _exercised_ in hosted, by a human, against real
   authentication and the real deployed container?** Sign-in, authorization,
   the operator shell, a notification path, anything where the local stack
   cannot reproduce the hosted behaviour.
3. **Does that exercise need rows that are not already there?** If the durable
   pilot identities plus whatever earlier tickets left behind are enough, no new
   artifacts are needed. Say so in the pull request.

If all three point to yes, the pull request ships `scripts/pilot/<issue-id>/`
with `setup.sql`, `cleanup.sql` and a `README.md`.

**If you are an agent and you are unsure, say so in the pull request and tell
Brian.** Guessing wrong in the direction of "no artifacts needed" leaves him to
work it out on the day; guessing wrong the other way costs a file nobody runs.

## Script conventions

The directory is `scripts/pilot/<issue-id>/`, lower-case, e.g.
`scripts/pilot/lan-93/`. [`scripts/pilot/lan-93/`](../scripts/pilot/lan-93/) is
the worked example, and it is meant to be copied.

Every scenario satisfies all of the following. They are not stylistic.

| Requirement                          | Why                                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Transactional**                    | `begin;` … `commit;`. A half-applied scenario in a database with no staging is the bad case                                                                           |
| **Visible preflight**                | A first result set naming the database and the connected user, before anything is written                                                                             |
| **Fails closed**                     | Prerequisites `raise exception`. Never warn and continue                                                                                                              |
| **Repeatable**                       | `insert … on conflict (id) do nothing`. **Never `do update`** — nothing is silently rewritten                                                                         |
| **Reviewable ownership**             | Deterministic primary keys **and** a `PILOT-<ISSUE-ID>` sentinel in a text column — or, for a scenario whose rows the **application** creates, the second shape below |
| **Narrow cleanup**                   | Deletes by deterministic id, qualified by the sentinel, in reverse dependency order                                                                                   |
| **Refuses to widen**                 | Aborts if a foreign row hangs off a scenario row — especially where a foreign key would `cascade` or `set null`                                                       |
| **Preserves the foundation**         | Never deletes from `auth.users`, `operator_accounts`, `role_assignments`, `roles` or `audit_events`                                                                   |
| **Verification query**               | A final `select` a human can read, repeated in the scenario README                                                                                                    |
| **No new database concept**          | The ownership marker is a naming convention, never a new column and never a new table                                                                                 |
| **Nothing personal, nothing secret** | No real name, email, phone, password or identifier. This repository is public                                                                                         |

### The ownership marker

Two halves, and cleanup requires both:

- a **deterministic primary key** from a block reserved for the issue, so
  cleanup deletes by primary key and can never match a row it did not create;
- the sentinel **`PILOT-<ISSUE-ID>`** in a text column, so a human scanning a
  table can see what the row is, and so a cleanup whose id block was copied
  carelessly still refuses.

The marker is a convention. **Adding a column, a table, or any other schema
concept to label test data is a decision for Brian and is not taken by an
agent.**

### Contact values a scenario may use

A scenario that exercises a contact-matching feature needs contact values, and
this repository is public. Only values that standards bodies reserve so they can
never belong to anybody are permitted:

- email in an **RFC 2606** reserved domain — `example.invalid` preferred, or
  `example.com` / `.org` / `.net`;
- phone numbers in **Ofcom's drama range**, `07700 900000`–`07700 900999`, in
  either national or `+44` form.

Anything else is a real person's contact detail as far as this rule is
concerned, and `tests/pilot-data-contract.test.ts` refuses it. The check is
anchored at the end of the domain, so an address at a domain merely _starting_
with a reserved label — anything ending `.invalid.co.uk`, say — is registrable,
is **not** reserved, and is refused. (Described rather than written out: this
file is itself scanned, and a routable example address in it is exactly what the
scan exists to catch.)

LAN-74 is the first scenario to need this — its duplicate check matches on
contact points, so a scenario without them cannot exercise half the feature.

#### The second shape: rows the application creates

Some scenarios have no deterministic key to delete by, because the rows are not
created by their setup script. LAN-76 is the first: its feature test is a human
signing in to the deployed application and creating events through it, so
PostgreSQL generates the identifier at insert time, and a setup script that
manufactured the rows instead would prove the application works against data a
script arranged rather than against hosted's own.

For such a scenario, and **only** for such a scenario, the deterministic-key
half is replaced by a restriction that limits which of the sentinel's rows may
be deleted at all — for LAN-76, `status in ('draft', 'pending_approval',
'withdrawn')`, so the cleanup can never remove an event that reached approval
and therefore carries invitations, responses or attendance.

LAN-74 is the second, and it differs in a way worth noting: its setup script
_does_ write rows with deterministic keys, and only the rows the **tester**
creates through the intake form fall under this shape. So one scenario can use
both marks at once — deterministic-key deletes for what the script wrote,
sentinel-only deletes for what the application wrote. Its sentinel is matched
against two homes (the display alias for script-written rows, `family_name` for
form-written ones, because the form has a Last name field and no nickname
field), compared as `upper(btrim(…))` so a marker typed in the wrong case still
matches, and pinned by value in the contract test.

Be exact about what that is and is not. It is **not** equivalent to a
deterministic key: a key names one pre-known row and the sentinel is then a
second, independent proof of ownership, whereas a `like` on an operator-typed
column plus a status restriction proves the row was made for the test and bounds
the blast radius, without ever proving who created it. It is the narrowest
honest predicate available when the identifier is not the script's to choose.

Three conditions, all required, and all machine-checked by
[`tests/pilot-data-contract.test.ts`](../tests/pilot-data-contract.test.ts):

1. the scenario's `README.md` declares the shape under the exact heading
   `## Ownership marker: sentinel only`, so a reader of the scenario sees it;
2. the scenario, the table it may delete from, and the **exact** conjuncts of
   its `where` clause are pinned in that test's `SENTINEL_ONLY_DELETES` list, so
   adding or loosening one is a line in a diff rather than a pattern an
   assertion might or might not recognise;
3. the sentinel is still one of those conjuncts.

**Adding a scenario to that list is Brian's decision, not a lead's.** It relaxes
the marker for writes against the one production database, and the reasoning
belongs in the pull request that adds it. See
[ADR 0019](adr/0019-application-created-pilot-rows.md).

### The scenario test checklist

A scenario is not delivered until an automated test proves, against **local**
Supabase, that:

- [ ] setup run twice leaves exactly one copy of each row;
- [ ] setup run again after a row was removed by hand restores it;
- [ ] setup does not rewrite a row that is already there;
- [ ] **every refusal either script contains is exercised** — something actually
      attempts the thing each preflight is supposed to refuse, so a guard that is
      deleted, commented out, inverted, made unreachable or downgraded from
      `raise exception` to a `raise notice` fails a test. The list of refusals is
      read out of the scripts and compared against the list of tests, so a new
      guard with no test is itself a failure;
- [ ] any refusal that genuinely cannot be reached by a test is named in an
      explicit exemption list, with the reason, and the list is asserted to
      still match a real refusal;
- [ ] every preflight guard **structurally** terminates in `raise exception` —
      asserted as what a guard must be, never as a list of levels it must not
      be, because a blacklist only ever catches the levels somebody thought of;
- [ ] cleanup restores a row-for-row identical snapshot of every table;
- [ ] cleanup run a second time is a no-op;
- [ ] cleanup with no setup ever run succeeds and changes nothing;
- [ ] cleanup refuses, rather than widening, when a foreign row hangs off the
      scenario — including every `cascade` and `set null` foreign key;
- [ ] that enumeration is checked three ways rather than by reading the script:
      `pg_constraint` is queried for the keys that actually exist, each one must
      have a guard block that queries its table and raises, and each must have a
      test that puts a row there and watches the cleanup refuse. A later
      migration adding an eighth such key fails a test rather than quietly
      turning a refusal into a cascade;
- [ ] every delete's `where` clause conjoins the deterministic identifier with
      the sentinel, asserted as a parsed predicate — one `and` becoming `or` is
      the whole distance between the narrowest delete and an arbitrary one; a
      scenario using the second shape above instead has its table and its exact
      conjuncts pinned in `SENTINEL_ONLY_DELETES`, which is asserted the same
      way;
- [ ] the durable pilot foundation is byte-identical afterwards.

[`tests/pilot-scenario-lan-93.test.ts`](../tests/pilot-scenario-lan-93.test.ts)
is that test for the worked example. Copy its shape.

Running the scripts against the disposable local stack **is** how they are
verified, and is not in tension with the rule below: verification is a test
choosing to run them locally; the prohibition is on a real target being written
to without a human.

### Nothing runs these automatically

No migration, `supabase/seed.sql`, `scripts/seed-local.mjs`, GitHub Actions
workflow, `Dockerfile` or application startup path may reference
`scripts/pilot/`. [`tests/pilot-data-contract.test.ts`](../tests/pilot-data-contract.test.ts)
fails if one starts to.

## The default operating sequence

For a feature that needs hosted testing, in this order:

1. **Merge** the pull request (Brian), and — if it carries a migration — apply
   it by hand from the deployment clone, following
   [the migration runbook](migration-runbook.md#applying-to-hosted-supabase).
2. **Confirm the revision is deployed and healthy**: `/api/health` reports
   `status: ok` and `secretsLoaded: true`.
3. **Read the feature's `scripts/pilot/<issue-id>/README.md` and its SQL, end to
   end.** They are short on purpose. If reading them is a chore, they are wrong.
4. **Establish the exact target and intended changes** — the preflight result
   set names the database and the user before a single row is written.
5. **Run `setup.sql` by hand** against hosted Supabase, and read the
   verification result before accepting it.
6. **Perform the focused feature test** with the approved pilot testers.
7. **Record the result** (below).
8. **Retain the data.** Run `cleanup.sql` only if the retention policy says to.

Steps 1, 2, 5, 6, 7 and 8 are Brian's. Steps 3 and 4 are Brian's reading of an
agent's work. **No step in this list is performed by an agent.**

### Running a script safely, by hand

Brian, in the Supabase SQL editor for the intended project — or from the
deployment clone with a connection he established himself:

1. **Check which project the editor is pointed at.** It does not ask twice.
2. Paste the whole file, including `begin;` and `commit;`. Do not paste
   fragments: the transaction is the safety property.
3. Read the first result set. Wrong database, or wrong user? Stop — nothing has
   been committed.
4. Read any `raise notice` output and the final verification result.
5. If anything is not exactly as the README describes, **stop and establish
   actual state before doing anything else.** Do not "fix" a blocked cleanup by
   deleting the row that blocked it: that row is the reason the script refused.

An aborted script leaves nothing behind. That is the intended failure mode, and
it is worth more than a script that succeeds at all costs.

## Retention policy

**Do not clean hosted pilot data after every ticket.** This reverses the natural
instinct, and it is deliberate.

- Feature-test data **may accumulate**, so a later feature can be exercised
  against the data an earlier one created. A season with events, invitations and
  responses in it is exactly what the next ticket needs.
- The cleanup script is written at the same time as the setup script and is
  **retained**, unrun, for the cutover.
- Durable pilot identities and access are preserved by ordinary cleanup in every
  case.

Run a cleanup early only when the scenario's data is:

| Exception       | Example                                                           |
| --------------- | ----------------------------------------------------------------- |
| **Sensitive**   | It captured something that should not persist, even synthetically |
| **Conflicting** | It occupies a unique key or a state a later test needs            |
| **Misleading**  | It would be read as real by somebody looking at the database      |
| **Harmful**     | It breaks or distorts the next feature test                       |

The pull request states which of these applies, or recommends retention. When in
doubt, retain: a scenario that is still there can be removed later, and one that
was removed early cannot be recovered without re-running setup.

## The production-data cutover

Before the real roster is loaded — and therefore before LAN-86 opens — there is
**one deliberate cutover**:

1. Every retained scenario's `cleanup.sql` is run, in reverse order of creation,
   each one read before it is run.
2. Anything a cleanup refuses to remove is investigated, not forced.
3. Approved pilot identities and access are **preserved**, or deliberately
   recreated with a recorded reason. They are not collateral.
4. Audit history is preserved. It is append-only and it is what makes the
   preceding period explicable.
5. The result is recorded (below) before any real data is loaded.

The cutover is a pilot-data operation. It is not a migration, it does not change
the schema, and it does not touch the deployed container.

## Provisioning a durable pilot identity

A value-free, repeatable owner procedure. **Every angle-bracketed token is a
placeholder Brian fills in at execution time.** No real value is committed to
this repository, ever — including in the manifest, in a pull request, or in a
commit message.

Public signup is **not** reopened. Accounts are created by the owner through the
Supabase Auth administration path, one at a time, for people who agreed to test.

### Step 1 — the Auth user (Supabase dashboard)

Supabase dashboard → **Authentication** → **Users** → _Add user_ (or _Invite_),
for `<pilot-user-email>`.

- Never write to `auth.users` with SQL. Password hashing, identity records and
  confirmation state are the Auth service's job, and a hand-written row is
  wrong in ways that surface much later.
- Prefer the invitation flow so the tester sets their own password. If a
  password must be set directly, it is transmitted out of band, changed by the
  tester on first sign-in, and never written down anywhere in this repository or
  in the ticket.
- Note the generated `<auth-user-uuid>`. It is needed once, in step 3.

### Step 2 — the Person

Select the existing `people` row if there is one; the club person is durable and
is never duplicated to make a login work.

```sql
-- Look first. Creating a second Person for somebody who already has one is
-- invariant I1's failure mode, and merging them afterwards is an audited
-- operation (I6) rather than a tidy-up.
select id, given_name, family_name,
       (select da.alias from public.person_aliases da
         where da.person_id = people.id and da.is_display_name limit 1) as display_alias
  from public.people
 where lower(coalesce((select da.alias from public.person_aliases da
                        where da.person_id = people.id and da.is_display_name limit 1),
                       given_name)) = lower('<given-name>');
```

Only if there is genuinely no row:

```sql
insert into public.people (given_name, family_name)
values ('<given-name>', '<family-name>')
returning id;   -- this is <person-uuid>
```

### Step 3 — the operator link

```sql
insert into public.operator_accounts (auth_user_id, person_id)
values ('<auth-user-uuid>', '<person-uuid>')
returning id;
```

One auth user, one Person, in both directions. If the insert fails on
`operator_accounts_person_key`, that Person already has a login — resolve which
one is correct rather than creating a second Person.

### Step 4 — access, and only the access that is true

Access is `role_assignments`. It is effective-dated, and it is the **only**
thing that decides what the operator may do — `operator_accounts` carries no
role by design.

Two rules, both binding:

- **Assign only a seat the person actually holds.** No fictitious President,
  Vice-President, Secretary or Treasurer; no invented General Manager or
  coaching seat. Authorization that lies is worse than authorization that
  refuses.
- **Every pilot-period grant carries an `effective_to` at grant time**, not
  "later". An open-ended grant is how temporary access becomes permanent.

```sql
-- The role must already exist in public.roles, and the seat must be real.
select id, code, name, scope, is_constitutional_office
  from public.roles
 where code = '<role-code>';

-- A committee-year seat. A season-scoped role (the coaching seats) sets
-- season_id instead: exactly one of the two, and it must be the one the role
-- declares (constraint role_assignments_scope_matches_cycle).
insert into public.role_assignments (
  person_id, role_id, scope, is_constitutional_office,
  committee_year_id, effective_from, effective_to, note)
select
  '<person-uuid>', r.id, r.scope, r.is_constitutional_office,
  '<committee-year-uuid>', date '<effective-from>', date '<effective-to>',
  'Pilot period access. Ends at handoff.'
  from public.roles r
 where r.code = '<role-code>'
returning id, person_id, role_id, effective_from, effective_to;
```

**Read the returned row.** An `insert … select` that matches no role inserts
nothing and reports success — the one place this procedure could fail open. Zero
rows returned means the role code does not exist and **no access was granted**.
Do not re-run it hopefully; fix the `select` above first.

> **What the automated check recognises, and what it does not.**
> `tests/pilot-data-contract.test.ts` reads this file and proves that every
> grant is time-bounded and grants no constitutional office. It finds a grant by
> matching one literal statement opener: `insert`, then `into`, then the
> schema-qualified, unquoted table name `public` dot `role_assignments`.
> Case-insensitive and whitespace-flexible, and nothing else. Its own
> completeness self-check counts that same pattern, so a statement written any
> other way is not merely unchecked — it is **invisible to the check that would
> have reported it was missed**.
>
> Not recognised, and therefore not constrained: an `update` that grants or
> re-opens access, including one that clears `effective_to`; an unqualified
> `role_assignments`; a quoted `"public"."role_assignments"`; an insert routed
> through a CTE or a view. The scan reads **this file only** —
> `scripts/pilot/lan-93/cleanup.sql` also writes to `role_assignments` and is
> not read by it.
>
> This note cannot spell that opener out contiguously, because the check scans
> the raw file and would parse the example as a grant. That is the boundary,
> demonstrated rather than described: it is textual, and it sees exactly one
> spelling.
>
> **So match the template above exactly, or extend the check before writing the
> statement a different way.** A green test run is not evidence that anything
> looked at what you wrote.

> **Reference data is not yet in the hosted database.** The role vocabulary
> (`public.roles`) is currently created by `scripts/seed-local.mjs`, which is
> **local only** — so a freshly migrated hosted project has an empty `roles`
> table and step 4 has nothing to select. Whether that reference data is loaded
> into hosted by hand or promoted into a migration is **Brian's decision**, and
> it is called out here rather than assumed. No agent inserts it.

### Brian's own elevated access

Brian is building the system, so his hosted access during the pilot is wider
than any club seat. It is represented **truthfully**, not by inventing an office
for him:

- **The seat is `it_officer`** — "IT Officer", `scope = committee_year`,
  `is_constitutional_office = false`. It is an existing, non-constitutional
  technical seat in the club's role vocabulary. **Brian confirms he actually
  holds it before it is assigned**; if the club has no such seat, the truthful
  representation of his access is a decision for him, not a role invented to
  make authorization pass.
- **No constitutional office is assigned to him for testing.** Not President,
  not Vice-President, not Secretary, not Treasurer. Not a General Manager seat,
  and not a coaching seat.
- **The grant is time-bounded at the moment it is made**: `effective_to` is set
  in the same statement, not added afterwards.
- **It expires or is deactivated at handoff.** When the club takes the system
  over, the assignment is end-dated and — if his operator account is no longer
  needed — the account is deactivated, never deleted.

Anything wider than that seat which he needs in order to build (the database
password, the secret key, the deployment clone) is **credentials**, not a club
role, and lives in his own credential store and GCP Secret Manager. It is never
modelled as an assignment in `role_assignments`.

### Step 5 — verify, including the denial

Provisioning is not finished until all four are checked. The fourth is the one
people skip.

1. **Authentication** — the tester signs in at the deployed URL and gets a
   session.
2. **Identity resolution** — the session resolves to exactly one Person through
   `operator_accounts`.
3. **Role resolution** — the roles the application reports are exactly the
   assignments granted, no more.
4. **Denial** — the tester attempts something their access does **not** cover
   and is refused. An authorization system that has only ever been observed
   saying yes has not been observed.

Record only that each check passed, never the values involved.

### Deprovisioning

Removing access must not remove history. In order:

1. **End-date the access**: set `effective_to` on the role assignments, which
   preserves the record that the person held the seat.
2. **Deactivate the operator account**: set `is_active = false` with a
   `disabled_at` and a `disabled_reason`. There is deliberately no `delete`
   privilege on `operator_accounts` for the server path — revocation is a
   deactivation, so an actor referenced by history stays resolvable
   (invariant M2).
3. **Disable or delete the Auth user** through the Supabase Auth admin path if
   the login itself should no longer exist.
4. **Never delete the `people` row**, and never delete unrelated club history to
   tidy up after somebody.

These are `update` statements, so the grant check described in step 4 does not
read them. Ending access this way is correct; **granting** or re-opening access
with an `update` would go unchecked.

```sql
update public.role_assignments
   set effective_to = date '<end-date>'
 where person_id = '<person-uuid>'
   and effective_to is null;

update public.operator_accounts
   set is_active = false,
       disabled_at = now(),
       disabled_reason = '<reason>',
       updated_at = now()
 where person_id = '<person-uuid>';
```

## The authorization boundary

| Action                                                    | Who      | Never                    |
| --------------------------------------------------------- | -------- | ------------------------ |
| Authorizes pilot data in hosted at all                    | Brian    | An agent                 |
| Creates or invites a hosted Auth user                     | Brian    | An agent, a script, CI   |
| Grants or ends a role assignment in hosted                | Brian    | An agent                 |
| Runs `setup.sql` or `cleanup.sql` against hosted          | Brian    | An agent, CI, a deploy   |
| Applies a migration to hosted                             | Brian    | An agent, the pipeline   |
| Decides retention or an early cleanup                     | Brian    | An agent, unasked        |
| Writes the scripts, the README and the test               | An agent | —                        |
| Runs the scripts against **local** Supabase to prove them | An agent | Against any other target |

An agent that discovers an owner action is required **says so immediately**,
repeats it in the pull request's Production handoff block, and repeats it in its
final handoff message. Leaving Brian to infer an action from a changed migration
or SQL file is a defect in the pull request, not a detail.

Nothing in this runbook authorizes anything by itself. It is the procedure that
Brian's authorization is applied _to_.

## Recording what happened

In the pull request, and in the project's Notion operational record. **No secret
value, no password, no personal identifier and no real contact detail — in any
of it.**

| Field                | Example                                                        |
| -------------------- | -------------------------------------------------------------- |
| Issue                | `LAN-93`                                                       |
| Artifacts run        | `scripts/pilot/lan-93/setup.sql`                               |
| Target               | Production Supabase project (named, not credentialed)          |
| Operator             | Brian Schuster                                                 |
| Timestamp (UTC)      | `<timestamp>`                                                  |
| Preflight result     | Database and user as expected; scenario not previously present |
| Verification result  | Six rows, all present                                          |
| Feature-test outcome | Passed / failed, and what was observed                         |
| Retention decision   | Retained / cleaned up early — and which exception applied      |
| Manifest updated     | Yes                                                            |

Update [`pilot-data-manifest.md`](pilot-data-manifest.md) in the same change: it
is the list of what is currently in the hosted database, and a manifest that
lags is worse than no manifest.

## Out of scope, and still Brian's to decide

- Loading the real roster, or beginning real operations. Gated on LAN-83,
  LAN-84 and LAN-86.
- Reopening public signup.
- An invitation flow, a role-management screen, or any admin UI.
- Creating a staging environment or any other cloud resource.
- Loading the `public.roles` reference data into hosted, by hand or by
  migration — flagged above, not decided here.
- Any new database concept for labelling test data.
