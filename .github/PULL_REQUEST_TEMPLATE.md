<!--
Every section below is required. Delete nothing.

"None" and "No" are good answers — an unanswered section is not. The Production
handoff block exists because there is one production database, no staging, and
one person who applies anything to it. If you leave it to Brian to infer an
owner action from a changed file, he will find out when something breaks.

See docs/pilot-data-runbook.md and docs/migration-runbook.md.
-->

## What changed, and why

<!-- One paragraph. The reason, not a restatement of the diff. -->

Linear issue:

## How it was verified

<!--
Commands actually run, and their result. `npm run verify` at minimum; add
`npm run db:reset && npm run db:seed && npm run types:generate && npm run check:rls`
if migrations changed. "Should pass" is not verification.
-->

```

```

## Visual acceptance

- **Classification:** UI-affecting / nonvisual / mixed
- **Status:** Not required / Awaiting owner visual review / Approved
- **Verified review URL and routes:** None for nonvisual work
- **Agent browser preflight:** URL, real login, seeded states, desktop, 375px,
  and protected `review-ready` lease verified / Not applicable
- **Commands Brian must run:** None
- **Database/setup actions Brian must perform:** None
- **Production actions Brian must perform:** None

## Independent review

- **Grade:** Low / Normal / Highest
- **Mode:** Not required / full / correction
- **Full-review SHA:** None / exact SHA
- **Correction base SHA:** None / exact SHA
- **Current reviewed SHA:** None / exact SHA
- **Automatic reviewer round count:** 0 / 1 / 2 / 3
- **Findings:** None / for each: stable ID, impact severity, gate disposition,
  concrete reachable consequence, review-invocation effect, and exact SHA or
  mutable artifact
- **Blocking findings:** None / stable finding IDs and summary
- **Correct-before-handoff findings:** None / stable finding IDs, correction,
  and deterministic verification or exact read-back
- **Advisories:** None / stable finding IDs and summary
- **Result:** Not required / clear / blocked / requirement-adjudication-required / budget-exhausted

## Merge

<!--
One rule, and it applies to every pull request here (AGENTS.md, ADR 0038).
A pull request leaves draft exactly once, as the last act of the work, and that
act is the authorization to merge it. Only `/start-issue` and `/run-mission` may
lift a draft, and only when the diff touches no prohibited path, review is clear
at the exact current head, and — for visual work — Brian's approval is recorded
against that same head. Otherwise the draft stays and Brian merges.

The prohibited paths are `.github/merge-rules.json`, and the merge workflow
recomputes them from the real diff. Nothing written here changes that answer.
-->

- **Prohibited paths touched:** None / the exact paths, and why Brian merges this
- **Linear issues delivered:** <!-- `Closes LAN-nn` for every one, so they close on merge -->
- **Required checks (CI result):** <!-- both ci.yml jobs, and their conclusion -->
- **Draft state:** Still a draft — Brian merges / Lifted at <exact SHA>, after
  review cleared at that head <!-- and visual approval recorded at it, if visual -->

## Production handoff

<!--
The six lines. Answer every one, in this order, even when the answer is No/None.
Repeat the same answers in the final handoff message — discovery, pull request,
handoff, three times.
-->

- **Supabase schema migration:** Yes/No — exact filenames:
- **Compatibility and deployment order:** <!-- exact order relative to merge and the application deployment; expand/contract if not backward compatible -->
- **Pilot setup required:** Yes/No — exact script and when Brian runs it:
- **Pilot cleanup required:** Yes/No — exact script and when Brian runs it:
- **Other Brian action:** <!-- secrets, Auth user creation, provider setup, dashboard configuration, or None -->
- **Verification after Brian acts:** <!-- exact commands or screens, and the expected result -->

## Pilot data

<!-- docs/pilot-data-runbook.md decides whether this feature needs any. -->

- **Does this change need pilot data to be tested against hosted Supabase?** Yes/No — why:
- **Artifacts supplied:** <!-- scripts/pilot/<issue-id>/setup.sql, cleanup.sql, README.md — or None -->
- **Data created:** <!-- which tables, how many rows, how they are identified (deterministic ids and the PILOT-<issue-id> sentinel) -->
- **Data preserved:** <!-- durable identities, access records and audit history the cleanup deliberately does not touch -->
- **Retention recommendation:** Retain / clean up early — why:

## Recovery

- **Application rollback:** <!-- how to get back to the previous revision, and whether this change is safe to roll back -->
- **Schema forward-fix and restore:** <!-- if a migration fails: what a forward-fix looks like, and what would require a restore. N/A if no migration -->
- **External or human-only steps:** <!-- anything performed outside this repository: dashboard, Auth admin, DNS, secrets, provider setup. None if none -->

## Limitations and residual risk

<!-- What is untested, what could still go wrong, and what is deliberately out of scope. An accurate "this is untested" beats a confident summary. -->

## Checklist

- [ ] `npm run verify` passes locally, and I watched it pass.
- [ ] No secret value, and no real member, roster or contact data, is in the diff.
- [ ] Migrations (if any) apply cleanly from empty and their generated types are committed alongside.
- [ ] `docs/architecture/data-model.md` updated if `supabase/migrations/` changed.
- [ ] A new constraint on future work is recorded as an ADR.
- [ ] This pull request is a **draft** unless every condition of the merge rule is met. No agent merges, deploys or applies a migration.
