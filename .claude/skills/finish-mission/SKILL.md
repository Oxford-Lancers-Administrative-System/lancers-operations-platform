---
name: finish-mission
description: Reclaim a finished or explicitly abandoned mission's packages and local stack, then record how it ended. Never implements, pushes to main, deploys, or writes production.
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

For each package, fetch `origin/main` and prove the SHA the journal recorded for
its push is an ancestor of current `origin/main`. Ancestry of that SHA is the
whole proof; a branch name or a Linear state is not.

Reclaim only when the worktree is clean, every commit is on some remote
(`origin/main` counts), nothing is stashed, and no worker remains active.
Otherwise leave the whole package untouched and report the precise refusal.
Absence of evidence is never permission.

`main-record` invokes this same per-package path immediately; this skill is
the recovery and final-closeout entrypoint, not a weaker alternative.

## Reclaim and close

For each proved package, in order:

1. detach it from the mission stack;
2. remove/prune the worktree;
3. delete the local branch; and
4. record `package-reclaimed` with the proved SHA.

The mission stack is shared. Retire it only after the final attachment; never
stop a standing issue slot, another mission's stack, or a stack still in use.

`mission-finalized` requires every live package on main and reclaimed, no active
worker, and `mission-closeout` evidence already written to the existing Notion
mission record. Otherwise Brian may explicitly abandon:

```bash
npm run mission:finish -- M-<id>
npm run mission:finish -- M-<id> --abandon --reason "…" --preserved "…"
```

Abandonment records what remains; it never discards unproved work.

## Boundaries

Never implement, review, never push to `main`, deploy, migrate hosted Supabase,
touch production/real data, or weaken an owner route. `ownerOnly` paths and
owner pushes remain exactly as recorded. Auth/delivery packages may have been
pushed by an agent only with their answered owner checkpoint; cleanup changes
nothing.
