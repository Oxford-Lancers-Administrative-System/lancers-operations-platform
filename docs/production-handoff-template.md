# Production handoff comment

There are no pull requests (ADR 0041), so there is no pull-request body to hold
this. Post it as **one Linear comment on the issue**, when the branch lands on
`main`. The commit body carries the why; this carries everything Brian must do
or know.

Every section below is required. Delete nothing. "None" and "No" are good
answers — an unanswered section is not. The Production handoff block exists
because there is one production database, no staging, and one person who applies
anything to it. If you leave it to Brian to infer an owner action from a changed
file, he will find out when something breaks.

See docs/pilot-data-runbook.md and docs/migration-runbook.md.

## How it was verified

Commands actually run, and their result. `npm run verify` at minimum; add
`npm run db:reset && npm run db:seed && npm run types:generate && npm run check:rls`
if migrations changed, and the database suites. "Should pass" is not
verification. State the exact head SHA the checks ran against, and the SHA that
reached `main`.

## Production handoff

The six lines. Answer every one, in this order, even when the answer is No/None.
Repeat the same answers in the final handoff message — discovery, comment,
handoff, three times.

- **Supabase schema migration:** Yes/No — exact filenames:
- **Compatibility and deployment order:** exact order relative to the push to `main` and the application deployment; expand/contract if not backward compatible. A hosted `db push` follows only a green `main` at the commit that carries the migration.
- **Pilot setup required:** Yes/No — exact script and when Brian runs it:
- **Pilot cleanup required:** Yes/No — exact script and when Brian runs it:
- **Other Brian action:** secrets, Auth user creation, provider setup, dashboard configuration, or None
- **Verification after Brian acts:** exact commands or screens, and the expected result

## Pilot data

docs/pilot-data-runbook.md decides whether this feature needs any.

- **Does this change need pilot data to be tested against hosted Supabase?** Yes/No — why:
- **Artifacts supplied:** scripts/pilot/<issue-id>/setup.sql, cleanup.sql, README.md — or None. No scenario is active today: the slice's were retired on 2026-09-26 (docs/pilot-data-manifest.md § Retired scenarios)
- **Data created:** which tables, how many rows, how they are identified (deterministic ids and the PILOT-<issue-id> sentinel)
- **Data preserved:** durable identities, access records and audit history the cleanup deliberately does not touch
- **Retention recommendation:** Retain / clean up early — why:

## Recovery

- **Application rollback:** how to get back to the previous revision, and whether this change is safe to roll back
- **Schema forward-fix and restore:** if a migration fails: what a forward-fix looks like, and what would require a restore. N/A if no migration
- **External or human-only steps:** anything performed outside this repository: dashboard, Auth admin, DNS, secrets, provider setup. None if none

## Review and visual acceptance

- **Review:** none required (no `reviewRequired` path touched) / one `code-reviewer` pass, clear at the exact head
- **Visual acceptance:** not required / Brian's approval recorded at the exact head

## Limitations and residual risk

What is untested, what could still go wrong, and what is deliberately out of
scope. An accurate "this is untested" beats a confident summary.

## Checklist

- [ ] `npm run verify` passes locally, and I watched it pass.
- [ ] No secret value, and no real member, roster or contact data, is in the diff.
- [ ] Migrations (if any) apply cleanly from empty and their generated types are committed alongside.
- [ ] `docs/architecture/data-model.md` updated if `supabase/migrations/` changed.
- [ ] A new constraint on future work is recorded as an ADR.
- [ ] No agent deploys or applies a hosted migration.
