# Migration and recovery runbook

How a schema change is developed locally, verified, and — only with explicit
human authorization — applied to the single hosted Supabase project.

There is **one production database and no staging**. Everything below follows
from that. See [ADR 0001](adr/0001-local-supabase-only.md).

## The promotion path

```
local migration development  (DEVELOPMENT clone)
        │   npx supabase migration new <name>
        │   npm run db:reset && npm run db:seed
        │   npm run types:generate
        │   npm run check:rls && npm run test
        ▼
feature branch and pull request
        │
        ▼
CI (.github/workflows/ci.yml)
        │   rebuild from EMPTY · RLS gate · type-drift gate
        │   constraint, lifecycle and security tests · seed loads
        ▼
reviewed merge to `main`
        │   CI green is a hard gate; human approvals are zero (ADR 0006)
        ▼
explicitly authorized application to hosted Supabase  (DEPLOYMENT clone)
            a deliberate human action, never the pipeline
```

**Migrations are never applied by the deployment pipeline.** Merging to `main`
deploys the application container; it does not touch the database. Application
code and schema therefore move independently, which is why expand/contract
matters (below).

**No undocumented dashboard edits.** A schema change made in the Supabase
dashboard exists nowhere in Git, will be silently reverted by the next migration
rebuilt from empty, and breaks the type-drift check with no traceable cause. If
an emergency change is ever made that way, the immediate follow-up is a
migration that reproduces it, plus a note in the deployment record below.

## Local cycle

In the **development clone** — the unlinked one, and the only place local
Supabase runs. The full loop, and what each step proves:

```bash
npm run db:reset          # every migration applies to an EMPTY database
npm run db:seed           # the deterministic synthetic dataset loads
npm run db:seed-user      # the one local auth user (db:reset wipes it)
npm run types:generate    # regenerate src/lib/supabase/database.types.ts
npm run check:rls         # no table created without RLS in the same migration
npm run test              # constraints, lifecycle, security, seed properties
npm run verify            # format, lint, typecheck, test, build — what CI runs
```

Commit the migration **and** the regenerated types together. CI fails if they
disagree, which is the point: types that lag the schema are how an application
starts trusting columns that no longer exist.

## Authorization boundary

- **No agent applies a migration to hosted Supabase.** Not with a tool, not with
  a script, not "just to check". Automated application to production is outside
  the authority any agent working in this repository holds.
- **Brian authorizes and performs hosted application himself**, from the
  **deployment clone**, with the commands from this runbook. The clone agents
  work in is never linked to hosted Supabase — see [the two-clone
  model](#the-two-clone-model).
- **Production credentials never appear** on a development machine, in a prompt,
  in Git, in Notion, in CI logs, or in the client bundle. The hosted database
  password and the Supabase secret key live in GCP Secret Manager and in Brian's
  own credential store.
- **The local guards are not to be weakened.** `scripts/lib/local-db.mjs`
  refuses any non-loopback host, and `tests/rls-posture.test.ts` refuses any
  non-local Supabase URL. Those refusals are the control, not an inconvenience.

## Forward-only discipline

Once a migration has been applied to a shared environment it is **immutable**:

- Never edit the SQL of an applied migration. Supabase records a hash; editing
  it desynchronises the history and the next apply fails or, worse, silently
  skips.
- Never renumber or reorder applied migrations.
- A mistake is corrected by a **new** migration, with a filename and comment
  that say what it corrects. `20260810121300_domain_event_audience.sql` is the
  worked example: it corrects two defects found by independent verification and
  edits none of the twelve baseline parts. It also backfills before adding its
  `not null` column, so it is correct against a database that already holds
  invitations — not only against a rebuild from empty.
- Down migrations are **not** maintained. An untested rollback script is worse
  than none: it invites a destructive action under time pressure that has never
  been rehearsed. Recovery is forward-fix or restore — see below.

### Expand and contract

Once application code or real data depends on the schema, a change that is not
backward compatible must be split, because the container and the database are
deployed separately and there is a window where old code meets new schema:

1. **Expand** — add the new column/table as nullable or defaulted. Deploy code
   that writes both and reads the old.
2. **Migrate** — backfill. Deploy code that reads the new.
3. **Contract** — a later, separate migration removes the old. Only after
   nothing reads it.

None of this is needed for the current baseline: it is the first schema, nothing
depends on it yet, and it contains no real data.

## Destructive-change gate

A migration that **drops** a table, column or constraint; **renames** anything;
performs an **irreversible transformation**; changes a type in a way that can
lose data; or **backfills at scale**, requires all of the following before it is
applied to hosted Supabase:

1. A separately reviewed migration plan stating what is dropped and what becomes
   unrecoverable.
2. A **verified** current backup or point-in-time recovery point — verified
   means its existence and timestamp were checked, not assumed.
3. Impact analysis: which application code, views and reports read the affected
   objects.
4. An explicit deployment window agreed with the club, outside operational hours
   (not a Sunday, not the day before a fixture).
5. Brian's explicit authorization, recorded in the deployment record.

**None of this is necessary for this baseline.** It is all `create`.

Redacting availability data (review F13) is a bounded, expected deletion rather
than a destructive schema change, but it is performed by a database owner, is
recorded in `audit_events`, and follows the same authorization rule.

## The two-clone model

**Added on Brian's direct instruction, outside LAN-72's scope.**

Schema promotion uses **two separate clones of this repository on Brian's
machine**. They are not two branches and not two directories that happen to
exist — they have different jobs, different linkage to hosted Supabase, and
different rules.

|                           | **Development clone**                                  | **Deployment clone**                                              |
| ------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| What it is for            | Writing migrations, running the app, running the tests | Applying reviewed migrations to hosted Supabase, and nothing else |
| Who works in it           | Brian, Claude, any agent                               | **Brian only**                                                    |
| Local Supabase            | Yes — this is the only place it runs                   | **Never**                                                         |
| Linked to hosted Supabase | **No. Stays unlinked.**                                | Yes                                                               |
| What may be edited        | Everything                                             | **Nothing.** It is a checkout, not a workspace                    |

### The development clone stays unlinked

```bash
npx supabase unlink      # confirm and keep it that way
```

**This is the control, not a tidiness preference.** While a clone is linked, the
`--linked` variants of otherwise-local commands become reachable in it, and
`supabase db reset --linked` **destroys the production database**. That is one
flag away from `npm run db:reset`, which is a routine local command this
runbook tells you to run and which agents run constantly.

Be clear about what does _not_ save you there: the repository's checked-in deny
rules do **not** block `supabase db reset --linked`. `scripts/lib/local-db.mjs`
and `tests/rls-posture.test.ts` refuse non-local hosts, but they guard _this
repository's_ scripts and tests — not the Supabase CLI's own linked commands.
The protection is that the clone an agent works in has nothing to be linked to.

### What the split fixes

With one clone doing both jobs, the preflight verification below and the agent
harness share a single local Supabase stack, and a local `db reset` is
indistinguishable from an accident. That is not hypothetical: on 2026-08-11 an
authorized `npm run db:reset` during preflight-style verification was briefly
misread as an unexplained wipe, because two things legitimately reset the same
database and nothing in the setup distinguished them.

Separating the clones separates the failure modes. The clone that can reach
production never runs a reset; the clone that runs resets cannot reach
production.

### Only merged, committed migrations are deployed

The deployment clone applies migrations **from `main`**, already reviewed, CI-
green and merged. It never applies a migration from a branch, from a working
tree, or from an uncommitted file. `git status --short` returning nothing is
part of the sequence for exactly that reason.

### Never, in the deployment clone

- **Edit a migration**, or any other file.
- **Run Claude, or any other agent.**
- **Run local Supabase** — no `npx supabase start`, no `npm run db:start`.
- **Run the test suite**, or `npm run verify` (which runs it).
- **Run anything else that needs the local stack** — `npm run types:check`,
  `npm run types:generate`, `npm run db:seed`. They read the local database, and
  there is not one here.
- **Run `npx supabase db reset`.** It is local, but it has no business here, and
  muscle memory is the risk this table exists to remove.

### Never, in any clone

```
npx supabase db reset --linked
```

There is no situation in this project where that command is correct. It drops
and rebuilds the **production** database. Recovery is a restore from backup, and
[the pre-pilot gate](#pre-pilot-gate) records that hosted restore has **not**
been rehearsed.

## Applying to hosted Supabase

Performed by Brian, in the **deployment clone**, with credentials that exist
only there. This section owns the canonical command sequence; [the two-clone
model](#the-two-clone-model) above owns the rules about which clone does what.

**Verification happens in the development clone. Only the push happens in the
deployment clone.** That division is the whole point of the split — the
deployment clone must never run a `db reset` or the test suite.

### Preflight — in the DEVELOPMENT clone

```bash
# 1. Confirm the local database rebuilds from empty with the same set.
npm run db:reset && npm run check:rls && npm run test

# 2. Confirm the commit being deployed is the reviewed, merged one.
#    `git fetch` first: `origin/main` is a LOCAL cache of the remote branch, and
#    in a clone that has not fetched since the merge this step confirms the
#    wrong commit while looking entirely correct. A gate that silently passes is
#    worse than no gate.
git fetch origin
git log --oneline -1 origin/main

# 3. Confirm a recovery point exists and note its timestamp.
#    Supabase dashboard → Database → Backups.
```

### Preflight — in the DEPLOYMENT clone

```bash
git switch main
git pull --ff-only
git status --short                      # must print NOTHING

npm ci                                  # the PINNED Supabase CLI, not whatever npx fetches
npx supabase migration list --linked    # what is about to be applied
```

`npm ci` is here because the Supabase CLI is a dev dependency of this
repository. Without it `npx` downloads some arbitrary latest version, and the
tool that talks to the production database should be the one the lockfile pins.
It installs into `node_modules`, which is git-ignored, so the working tree stays
clean. It is not a licence to run anything else.

`git status --short` printing nothing is a hard gate: an uncommitted file here
means this clone has been used as a workspace, which it must not be.

Refuse to proceed if: the working tree is not clean; the pending list contains a
migration you did not expect; `migration list` shows local and remote already
disagreeing; or no recovery point is confirmed.

### Apply — in the DEPLOYMENT clone

```bash
npx supabase db push --linked --dry-run   # print the plan; read it
npx supabase db push --linked             # apply it
```

The dry run is not optional politeness. It is the last point at which an
unexpected pending migration is cheap to discover.

Each migration runs in a transaction where PostgreSQL permits it, so a failing
statement rolls that migration back. Some statements are not
transaction-safe — notably `create index concurrently` and, in some cases,
`alter type ... add value`. A migration containing one of those can fail
**partially applied**, which is the case the next section is for.

### Verify — in the DEPLOYMENT clone

```bash
npx supabase migration list --linked       # local and remote agree
curl -s https://<service-url>/api/health   # status ok, secretsLoaded true
```

### After the apply — in the DEVELOPMENT clone

```bash
npm run types:check                        # generated types match the schema
```

**This step belongs here, not in the deployment clone.** `types:check` runs
`scripts/generate-types.mjs`, which shells out to
`supabase gen types typescript --local` — it reads the **local** stack, by
design, so that types are never generated from production. The deployment clone
has no local stack and never starts one, so the check is unrunnable there.

## When a migration fails

**Do not immediately re-run it.** Establish state first.

1. **Determine the last successfully applied migration.**

   ```bash
   npx supabase migration list --linked
   ```

   In the deployment clone. The remote column is authoritative. If it disagrees
   with what the error suggested, trust the list.

2. **Determine whether the failed migration applied partially.** Inspect the
   objects it should have created. A fully rolled-back migration leaves nothing;
   a partially applied one leaves some objects and no history row.

3. **Choose forward-fix or restore.**

   | Situation                                                                                  | Action                                                                                                                                            |
   | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Migration rolled back cleanly, no objects created                                          | **Forward-fix.** Correct the SQL in a new migration, verify locally from empty, re-apply.                                                         |
   | Partially applied, no data loss, remaining work is additive                                | **Forward-fix.** Write a new migration that is idempotent about what already exists (`if not exists`, `drop … if exists` on the partial objects). |
   | Data was transformed or removed, or the schema is in a state you cannot describe precisely | **Restore** to the verified recovery point, then treat the whole change as not applied.                                                           |
   | Application is failing in production because of the schema state                           | **Restore first, diagnose second.** Availability is the club's, and it is a football club's operations system in season.                          |

   **Which clone does what here.** Reading state and re-applying happen in the
   **deployment clone**. Authoring the corrective migration and verifying it
   locally from empty happen in the **development clone**, through a branch, a
   pull request and a merge like any other change — the deployment clone edits
   no file and runs no local stack, so "correct the SQL" and "verify locally"
   are never done there.

4. **Never fabricate the history table.** Editing
   `supabase_migrations.schema_migrations` by hand to "mark it applied" makes
   every later apply unreliable. If the history is wrong, fix the schema to
   match a real migration, not the record to match the schema.

5. **Record what happened** (below) before moving on, including a failed
   attempt. A failure that leaves no trace is the one that gets repeated.

## Deployment traceability

Every hosted application is recorded — in the pull request that introduced the
migration, and in the project's Notion operational record. No secret value, ever.

| Field                        | Example                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| Migration version(s) applied | `20260810120000` … `20260810121300`                              |
| Commit SHA                   | `418d9e2`                                                        |
| Operator                     | Brian Schuster                                                   |
| Timestamp (UTC)              | `2026-08-11T09:14:00Z`                                           |
| Recovery point verified      | Yes — `2026-08-11T06:00Z` daily backup                           |
| Preflight result             | `migration list` clean; local rebuild green                      |
| Outcome                      | Applied cleanly / failed at `…`, forward-fixed by `…` / restored |
| Post-apply verification      | `migration list` agrees; `/api/health` `status: ok`              |
| Follow-up                    | None / ticket reference                                          |

## Pre-pilot gate

**Before any real roster data or pilot user enters the system**, both of these
must be true. Neither blocks writing and validating the schema locally, and
neither is built by this ticket.

1. **A non-production staging environment exists.** A second Supabase project
   that migrations are applied to first. Creating it is a cost and ownership
   commitment and needs separate authorization — it is explicitly out of scope
   here.
2. **Hosted backup and restore have been verified by rehearsal.** Not "backups
   are enabled" — an actual restore performed into a scratch project, timed, and
   recorded. An unrehearsed restore is an assumption, and the destructive-change
   gate above depends on it being a fact.

Until both hold, the hosted database should contain schema and synthetic data
only.

## Ownership

| Responsibility                            | Holder                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| Authorizes application to hosted Supabase | Brian Schuster                                                 |
| Performs the application                  | Brian Schuster                                                 |
| Verifies the result                       | Brian Schuster                                                 |
| Decides forward-fix versus restore        | Brian Schuster                                                 |
| Where the operational record is kept      | The pull request, plus the project's Notion operational record |

This concentration is a known gap, not a design: locked **Requirement 14**
demands two named durable club administrators per production service and is
currently unsatisfied across every system. Until a second administrator exists,
schema promotion has a single point of failure. That is a club-side action, and
it belongs on the critical path before real data lands — the same gate as
staging and restore rehearsal.
