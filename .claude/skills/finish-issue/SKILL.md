---
name: finish-issue
description: Finalize one merged, canceled, or explicitly abandoned Linear issue by proving its terminal state, stopping its local services, releasing its lease, removing its worktree/branch, and closing the ticket. Never implements or merges.
disable-model-invocation: true
argument-hint: LAN-###
---

# Finish one issue

Invocation: `/finish-issue LAN-### [--abandoned]`

## Intent

Exist to reclaim one completed run without losing work or touching another run.
Never implement, review, delegate, merge, un-draft, deploy, or use hosted
Supabase. Done means local resources are safely reclaimed and Linear is closed,
or a precise refusal leaves everything untouched.

## Establish read-only facts

Require one exact `LAN-###`; only Brian may add the exact `--abandoned` flag.
Before mutation, fetch `origin/main` and collect:

```bash
git worktree list --porcelain
gh pr list --head <branch> --state all --json number,state,mergeCommit,headRefOid,headRefName
git -C <worktree> status --short --branch
git -C <worktree> stash list
git -C <worktree> rev-parse HEAD
npm run db:coordinator status
```

Read Linear state/comments. Find the PR from the branch, never from a comment,
handoff, search result, or open-only listing. Use coordinator status—not
`db:status`—for stripped, non-mutating lease facts.

If no worktree, local branch, or lease remains, report `already finalized`,
complete the Linear close if still pending, and stop.

## Prove one terminal state

Proceed only when one case is proved:

- **Merged:** branch-derived PR is `MERGED`, `headRefName` equals the branch,
  its merge commit is an ancestor of freshly fetched `origin/main`, and while
  the local branch exists its tip equals `headRefOid`. Use the merge commit for
  squash merges; never substitute branch-head ancestry.
- **Canceled:** Linear is canceled.
- **Abandoned:** Brian supplied `--abandoned` and the complete branch is pushed.

Refuse and change nothing for an open/closed-unmerged/missing/mismatched PR,
post-merge branch movement, dirty/untracked/unpushed/stashed work, unresolved
`correct-before-handoff`, pending visual acceptance, mismatched/stale lease
ownership or token, unreadable evidence, or material ambiguity. Absence of proof
is never permission.

## Close out in order

1. Stop only the application process whose port and working directory match this
   issue worktree. Leave any other process alone and report it.
2. From the worktree run `npm run db:stop`, then `npm run db:release`.
   Fencing must still validate; never stop a mission-owned/shared stack.
3. Remove/prune the clean worktree, then delete only its proved local branch.
   Never force deletion or delete a remote branch.
4. Set Linear Done only for merged work; preserve canceled state otherwise.
   Add one closing comment with PR/merge proof, verification, cleanup, remaining
   owner/production actions, and limitations.

A missing lease or already-removed resource is an idempotent no-op. A failure
stops the sequence before later destructive steps. Re-running completes only
what remains.

## Report

Return one short block: terminal proof, services stopped, lease released/absent,
worktree and branch removed/kept, Linear state/comment, and anything deliberately
left with its reason. Use explicit `None`.
