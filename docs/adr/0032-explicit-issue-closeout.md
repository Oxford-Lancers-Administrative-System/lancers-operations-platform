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
have to guess. Timer-based cleanup of `review-ready` records would delete the
one protection that keeps a second session from resetting the database Brian is
looking at; a missing owner path is now the conclusive exception.

## Decision

Closeout is a separate, explicitly invoked workflow: `/finish-issue LAN-###`,
`disable-model-invocation: true`, exactly one Linear identifier, with
`--abandoned` as the single permitted extra word and never an inference.

It acts only on a terminal state it has **proved from the repository**: the
pull request reported `MERGED` by `gh` _and_ that pull request's `mergeCommit`
an ancestor of a freshly fetched `origin/main`; or the Linear issue canceled; or
Brian's explicit `--abandoned` over a fully pushed branch. A pull-request body, a
handoff summary, or a Linear state is never the evidence.

The proof binds to the branch and then tests the merge commit. The pull request
is found from the branch — `gh pr list --head <branch> --state all`, because a
bare-text `--search` does not match a head-branch name and `gh pr list` defaults
to open pull requests, so either would find nothing for exactly the merged case
the workflow exists to serve. Its `headRefName` must still be that branch and
its `headRefOid` the local tip, so that a pull-request number lifted from a
comment cannot stand in for this issue's merge and commits pushed after the
merge cannot pass as merged.

It tests the merge commit, not the branch head, because this repository
squash-merges: a merged branch's own head is never an ancestor of `main`, so the
obvious-looking `git merge-base --is-ancestor <branch> origin/main` would refuse
every genuinely merged issue and the workflow would never do anything. For the
same reason `git branch -d` is not treated as the safety check — under a squash
merge it decides from the upstream remote-tracking ref rather than from `main`.
The proved terminal state is the guard; the local branch is deleted only in the
merged case, and a refusal from `-d` is reported rather than forced.

It fails closed. An open or unmerged pull request, a dirty worktree, unpushed
commits, a stash entry, an unresolved `correct-before-handoff` finding, a
pending visual gate, or a lease whose record no longer matches this issue all
mean it releases nothing, deletes nothing, changes no Linear state, and reports
the blocker. Absence of evidence is not permission.

The three steps run in a fixed order, and the order is the substance of the
decision:

1. **Retire the database stack** with `npm run db:release` from inside the
   worktree. It validates the fence, stops the Supabase project, and only then
   releases the lease. The evidence comes from the read-only
   `npm run db:coordinator status`, which reports every slot's issue, worktree,
   state and application port with tokens stripped; `db:status` is a different
   command that validates this worktree's own token and writes a heartbeat, so
   it cannot be used while the run is still deciding whether it may act.
2. **Remove the worktree and the local branch** from the primary checkout,
   with `git branch -d`, never `-D`.
3. **Close the ticket**: Done, plus exactly one closing comment.

Retirement precedes removal because the token lives in the worktree's ignored
`.lancers-runtime/lease.json`. The coordinator stops by recorded project ID, so
`cleanup-stale` can recover a fully orphaned stack without that directory.

`/finish-issue` implements nothing, reviews nothing, launches no subagent, opens
and edits no pull request, and selects no further work. Every step is
idempotent: a second run finds nothing to do and says so.

Idempotence needs one deliberate exception to the evidence rule, and it is worth
stating because the obvious design gets it wrong. A successful run destroys the
local branch, and the branch tip is one of the things the merged proof compares
against. Demanding the full proof on every invocation would therefore make the
workflow refuse every issue it had already finished, and would strand any run
interrupted between removing the worktree and closing the ticket. So an issue
with no worktree, no branch and no lease short-circuits: absence is treated as
proof that closeout already happened, and the only thing left to do is the
Linear write, if it is still outstanding. The branch-tip comparison is required
exactly while there is a branch to compare.

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
