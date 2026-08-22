# 0032 — Issue closeout is an explicit, evidence-gated workflow

**Status:** Accepted · **Date:** 2026-08-22 · **Extends
[0018](0018-single-issue-agent-development.md) and
[0020](0020-zero-command-visual-review.md)**

## Context

`/start-issue` ends by design with the draft pull request, the worktree, the
branch, and any `review-ready` environment left recoverable, and with the Linear
issue still open. That is right while work is in flight: an agent must never
delete a dirty, interrupted or unmerged worktree, and no agent merges, so the
session that did the work cannot know whether the work will land.

But nothing reclaimed any of it afterwards. The lease stayed held — and a lease
left in `review-ready` is deliberately non-reclaimable, since `cleanupStale`
marks only `active` records stale, so the protection that existed for Brian's
visual review outlived the review and locked the slot. The worktree, its branch
and its containers stayed on disk. The Linear issue stayed In Progress or In
Review after it had shipped. With two fenced slots, one stuck `review-ready`
lease is half the machine's capacity.

Two shapes were rejected. Automatic cleanup at the end of `/start-issue` cannot
work, because the merge happens later and by someone else; the session would
have to guess. Widening `db:cleanup-stale` to reclaim `review-ready` records
would delete the one protection that keeps a second session from resetting the
database Brian is looking at.

## Decision

Closeout is a separate, explicitly invoked workflow: `/finish-issue LAN-###`,
`disable-model-invocation: true`, exactly one Linear identifier, with
`--abandoned` as the single permitted extra word and never an inference.

It acts only on a terminal state it has **proved from the repository**: the
pull request reported `MERGED` by `gh` _and_ the branch an ancestor of a freshly
fetched `origin/main`; or the Linear issue canceled; or Brian's explicit
`--abandoned` over a fully pushed branch. A pull-request body, a handoff
summary, or a Linear state is never the evidence.

It fails closed. An open or unmerged pull request, a dirty worktree, unpushed
commits, a stash entry, an unresolved `correct-before-handoff` finding, a
pending visual gate, or a lease whose record no longer matches this issue all
mean it releases nothing, deletes nothing, changes no Linear state, and reports
the blocker. Absence of evidence is not permission.

The four steps run in a fixed order, and the order is the substance of the
decision:

1. **Stop the services**, including `npm run db:stop` from inside the worktree.
2. **Release the lease** with `npm run db:release`, also from inside the
   worktree.
3. **Remove the worktree and the local branch** from the primary checkout,
   with `git branch -d`, never `-D`.
4. **Close the ticket**: Done, plus exactly one closing comment.

Stopping precedes releasing because `db:stop` validates the fencing token
through `updateLease`, which refuses any lease that is not `active` or
`review-ready`; a released lease can no longer stop its own stack through the
guarded command. Releasing precedes removal because the token lives in the
worktree's ignored `.lancers-runtime/lease.json`, and removing the worktree
destroys the only proof of ownership the coordinator accepts.

`/finish-issue` implements nothing, reviews nothing, launches no subagent, opens
and edits no pull request, and selects no further work. Every step is
idempotent: a second run finds nothing to do and says so.

Mission closeout — `/run-mission`'s worker worktrees and mission-owned stacks —
is deliberately out of scope. A mission has many worktrees per unit of work, a
shared stack with attached repositories, and a durable journal that must record
the transition; it needs its own decision.

## Consequences

- A finished issue reliably returns its slot, and `review-ready` can stay
  strictly non-reclaimable, because there is now a legitimate way to end it.
- The board tells the truth: shipped issues reach Done, with the merge commit
  and the reclaimed resources recorded in one comment.
- Closeout is a deliberate act by Brian, not a side effect. An issue whose
  pull request never merged keeps its worktree and its branch indefinitely,
  which is the safe failure.
- The rule that no agent merges, un-drafts, deploys, migrates hosted Supabase,
  or writes to production is untouched; `/finish-issue` runs strictly after the
  merge and takes none of those actions.
- One more command exists for Brian to remember. `/start-issue`'s final handoff
  names it, which is the only reminder the workflow can give.
