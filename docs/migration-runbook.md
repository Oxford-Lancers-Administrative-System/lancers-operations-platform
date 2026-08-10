# Migration and recovery runbook

How a schema change is developed locally, verified, and — only with explicit
human authorization — applied to the single hosted Supabase project.

There is **one production database and no staging**. Everything below follows
from that. See [ADR 0001](adr/0001-local-supabase-only.md).

## The promotion path

```
local migration development
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
explicitly authorized application to hosted Supabase
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

The full loop, and what each step proves:

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
- **Brian authorizes and performs hosted application himself**, with the
  commands from this runbook.
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
  that say what it corrects.
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

## Applying to hosted Supabase

Performed by Brian, from his own machine, with credentials that exist only
there.

### Preflight

```bash
# 1. Confirm what is about to be applied. Nothing else may be pending.
supabase migration list --linked

# 2. Confirm the local database rebuilds from empty with the same set.
npm run db:reset && npm run check:rls && npm run test

# 3. Confirm a recovery point exists and note its timestamp.
#    Supabase dashboard → Database → Backups.

# 4. Confirm the commit being deployed is the reviewed, merged one.
git log --oneline -1 origin/main
```

Refuse to proceed if: the pending list contains a migration you did not expect;
`migration list` shows local and remote already disagreeing; or no recovery
point is confirmed.

### Apply

```bash
supabase db push --linked            # add --dry-run first to print the plan
```

Each migration runs in a transaction where PostgreSQL permits it, so a failing
statement rolls that migration back. Some statements are not
transaction-safe — notably `create index concurrently` and, in some cases,
`alter type ... add value`. A migration containing one of those can fail
**partially applied**, which is the case the next section is for.

### Verify

```bash
supabase migration list --linked     # local and remote agree
curl -s https://<service-url>/api/health   # status ok, secretsLoaded true
```

Then regenerate types against local (never against production) and confirm no
drift: `npm run types:check`.

## When a migration fails

**Do not immediately re-run it.** Establish state first.

1. **Determine the last successfully applied migration.**

   ```bash
   supabase migration list --linked
   ```

   The remote column is authoritative. If it disagrees with what the error
   suggested, trust the list.

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
| Migration version(s) applied | `20260810120000` … `20260810121200`                              |
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
