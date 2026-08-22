---
name: finish-mission
description: Reclaim a finished or abandoned mission's worktrees, branches and database stack, and record how it ended.
disable-model-invocation: true
---

# Finish one mission

Invocation: `/finish-mission M-<mission-id>`

User-invoked, one mission, never model-invoked and never batched. It runs
**after** merges it proves from the repository, and takes no action this harness
forbids: it never merges, un-drafts a pull request, deploys, migrates hosted
Supabase, or writes to production.

## Why this is not a step inside `/run-mission`

`/run-mission` deliberately stops short of closeout, for the reason
`/start-issue` does: while work is in flight a worktree is not debris, and an
agent must never delete a dirty or unmerged one. But the case that matters most
is the one where the Lead is gone — a mission whose session died mid-run leaves
exactly this debris and has nothing left to run an exit step. So this is a
separate invocation, and it is the only one (Brian, 2026-08-22).

## 1. Validate and fence

Require exactly one identifier matching `^M-[A-Za-z0-9][A-Za-z0-9-]*$`. Replay
durable state; a mission with no journal has nothing to finish.

If the journal already records `mission-finalized` or `mission-abandoned`,
report that and stop. Re-running is safe and reports rather than double-acting.

**Refuse while another Lead's fence is live.** Missions run concurrently, and
reclaiming under a running Lead is the mission-scale version of resetting
another worktree's stack. Only a dead or expired fence releases the mission
(`leadLeaseAvailable`). There is no override.

## 2. Reclaim each finished package

Per package, and not waiting for the mission — a package's worktree is debris
the moment its pull request merges.

**Prove the merge from the repository**: `gh pr view` reports `MERGED`, and the
recorded head is an ancestor of `origin/main`. Never from the pull-request body
and never from the Linear state. The `mission-merge` lane merges without a
human, so "Brian merged it" is not a state anyone may infer.

Then, only when the tree is clean, nothing is unpushed, no stash entries remain
and no worker is still active:

1. detach that worktree from the mission stack;
2. `git worktree remove` and prune;
3. delete the local branch — the work is on `main` and the remote branch is
   GitHub's to delete;
4. record `package-reclaimed` with the merge commit it was proved against.

Any defect — dirty tree, unpushed commits, an unmerged package, an active
worker — and that package is left entirely alone and reported. Absence of
evidence is never permission.

## 3. Retire the mission stack, once

A mission-owned stack is shared: several workers attach to it and finish at
different times. **Whoever detaches last retires it**, so a mission whose
acquiring worktree is already gone can still be tidied up. Never stop a stack
another attachment still holds, never the standing primary or overflow slot, and
never another mission's.

## 4. Record how it ended

`mission-finalized` requires every live package merged and reclaimed, no
running workers, and a recorded `mission-closeout` — the evidence written into
the existing Notion mission record. Reclaiming resources and finishing a mission
are different acts, and the second needs the first plus the evidence.

Otherwise `--abandon --reason <why> --preserved <what was deliberately kept>`
records that the mission was reclaimed unfinished. A resumed Lead must be able
to tell a finished mission from one that was walked away from, and to tell
debris from evidence.

## The command

```bash
npm run mission:finish -- M-<id>
npm run mission:finish -- M-<id> --abandon --reason "…" --preserved "…"
```

## What stays with Brian

Everything that already did. Migrations, RLS and grants, authentication and
session boundaries, production scripts, secrets, hosted data, deployment,
WhatsApp and external configuration are unaffected by reclamation — it runs
after their merges, never instead of them. If a package has not merged, this
command reclaims nothing and says why.
