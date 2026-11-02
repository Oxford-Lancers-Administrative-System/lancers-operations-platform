---
name: finish-issue
description: Finalize one landed, canceled, or explicitly abandoned Linear issue by proving its terminal state, stopping its local services, releasing its lease, removing its worktree/branch, and closing the ticket. Never implements or pushes to main.
disable-model-invocation: true
argument-hint: LAN-###
---

# Finish one issue

Invocation: `/finish-issue LAN-### [--abandoned]`

## Intent

Exist to reclaim one completed run without losing work or touching another run.
Never implement, review, delegate, never push to `main`, deploy, or use hosted
Supabase. Done means local resources are safely reclaimed and Linear is closed,
or a precise refusal leaves everything untouched.

## Establish read-only facts

Require one exact `LAN-###`; only Brian may add the exact `--abandoned` flag.
Before mutation, fetch `origin/main` and collect:

```bash
git worktree list --porcelain
git -C <worktree> status --short --branch
git -C <worktree> stash list
git -C <worktree> rev-parse HEAD
git merge-base --is-ancestor <head> origin/main
gh run list --branch main --commit <head-or-main-sha> --json conclusion,name
npm run db:coordinator status
```

Read Linear state/comments. Find the branch from the worktree list, never from a
comment, handoff, or search result. Use coordinator status—not `db:status`—for
stripped, non-mutating lease facts.

If no worktree, local branch, or lease remains, report `already finalized`,
complete the Linear close if still pending, and stop.

## Prove one terminal state

Proceed only when one case is proved:

- **On main:** the branch's final head, or a merge commit that contains it, is an
  ancestor of freshly fetched `origin/main`, and while the local branch exists
  its tip is that proved head. A branch is never proved by a comment or by
  Linear state.
- **Canceled:** Linear is canceled.
- **Abandoned:** Brian supplied `--abandoned` and the complete branch is pushed.

Refuse and change nothing for a head not on `origin/main`, post-landing branch
movement, dirty/untracked/unpushed/stashed work, unresolved
`correct-before-handoff`, pending visual acceptance, mismatched/stale lease
ownership or token, unreadable evidence, or material ambiguity. Absence of proof
is never permission. Report main's CI conclusion for the landed commit; a red
main does not block reclamation, but state it.

## Close out in order

1. Stop only the application process whose port and working directory match this
   issue worktree. Leave any other process alone and report it.
2. From the worktree run `npm run db:release`. It validates the fence and stops
   the stack before releasing it; never retire a mission-owned/shared stack.
3. Remove/prune the clean worktree, then delete only its proved local branch.
   Never force deletion or delete a remote branch.
4. Set Linear Done only for landed work; preserve canceled state otherwise.
   Add one closing comment with the landing proof, verification, cleanup,
   remaining owner/production actions, and limitations.

A missing lease or already-removed resource is an idempotent no-op. A failure
stops the sequence before later destructive steps. Re-running completes only
what remains.

## Report

Return one short block: terminal proof, services stopped, lease released/absent,
worktree and branch removed/kept, Linear state/comment, and anything deliberately
left with its reason. Use explicit `None`.
