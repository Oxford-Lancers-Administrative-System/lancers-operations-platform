---
name: finish-mission
description: Reclaim a finished or explicitly abandoned mission's packages and local stack, then record how it ended. Never implements, merges, deploys, or writes production.
disable-model-invocation: true
---

# Finish one mission

Invocation: `/finish-mission M-<mission-id>`

## Intent

Exist as idempotent recovery after the Mission Lead is gone. Never decide work is
finished. Done means every repository-proved package is safely reclaimed, the
shared stack is retired only after its last attachment, and the journal records
finalized or explicitly abandoned.

## Prove before reclaiming

Require one exact `M-<id>`, replay its journal, and refuse a missing mission or
live Lead fence. A terminal journal reports and stops.

For each package, fetch `origin/main` and prove its branch's PR is `MERGED`,
still names that branch, and its merge commit is on current `origin/main`.
Squash-merge proof uses the merge commit, not ancestry of the branch head. A
removed remote branch is compatible with a proved merge.

Reclaim only when the worktree is clean, nothing is unpushed or stashed, and no
worker remains active. Otherwise leave the whole package untouched and report
the precise refusal. Absence of evidence is never permission.

`merge-record` invokes this same per-package path immediately; this skill is
the recovery and final-closeout entrypoint, not a weaker alternative.

## Reclaim and close

For each proved package, in order:

1. detach it from the mission stack;
2. remove/prune the worktree;
3. delete the local branch; and
4. record `package-reclaimed` with the proved merge commit.

The mission stack is shared. Retire it only after the final attachment; never
stop a standing issue slot, another mission's stack, or a stack still in use.

`mission-finalized` requires every live package merged and reclaimed, no active
worker, and `mission-closeout` evidence already written to the existing Notion
mission record. Otherwise Brian may explicitly abandon:

```bash
npm run mission:finish -- M-<id>
npm run mission:finish -- M-<id> --abandon --reason "…" --preserved "…"
```

Abandonment records what remains; it never discards unproved work.

## Boundaries

Never implement, review, merge, un-draft, deploy, migrate hosted Supabase, touch
production/real data, or weaken an owner route. Prohibited paths and owner merges
remain exactly as recorded. Auth/delivery packages may have used the guarded
lane only with their answered owner checkpoint; cleanup changes nothing.
