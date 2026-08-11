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

## Fast lane

<!--
Answer the first line for every pull request. If it is "No", write "No — normal
lane" and delete nothing else; the rest of this block is then not applicable and
saying so is the answer.

The eligibility rules are `.github/fast-lane-rules.json`, and the merge workflow
recomputes them from the diff. Nothing written here grants eligibility — a
classification that disagrees with the diff is simply refused, on the pull
request, with the reason. See docs/fast-lane.md.
-->

- **Classification:** No — normal lane / `documentation` / `test` /
  `agent-instruction` — and why:
- **Included Linear issues:** <!-- `Closes LAN-nn` for every one, so they close on merge -->
- **Verification run locally:** <!-- the exact commands the rules require for these classes, and their result -->
- **Required checks (CI result):** <!-- both ci.yml jobs, and their conclusion -->
- **Merge result:** <!-- filled in by the workflow's comment after it merges; "pending" until then -->
- **Exclusions:** <!-- work that was separated out because it was ineligible, and where it went. "None" if the batch was eligible whole -->

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
- [ ] This pull request is a **draft** unless Brian said otherwise. No agent merges, un-drafts, deploys or applies a migration.
